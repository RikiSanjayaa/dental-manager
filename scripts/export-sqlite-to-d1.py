#!/usr/bin/env python
"""Export the current SQLite database into D1-compatible SQL inserts.

Usage:
  python scripts/export-sqlite-to-d1.py --db data/dental_manager.db --out data/d1-export.sql
  python scripts/export-sqlite-to-d1.py data/dental_manager.db data/d1-export.sql
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


TABLES = [
    "employee",
    "user",
    "auditlog",
    "doctor",
    "treatment",
    "payrollrule",
    "attendancerule",
    "attendanceholiday",
    "doctorfeerule",
    "appsetting",
    "doctortransaction",
    "doctorperiodsummary",
    "attendancerecord",
    "payrollrecord",
]

CLEAR_ONLY_TABLES = [
    "importfile",
    "reportarchive",
]

JSON_COLUMNS = {
    "auditlog": {"metadata_json"},
    "importfile": {"preview_json", "errors_json"},
}


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def normalize_value(table: str, column: str, value: Any) -> Any:
    if column in JSON_COLUMNS.get(table, set()):
        if value in (None, ""):
            return "{}" if column == "metadata_json" or column == "preview_json" else "[]"
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False)
    return value


def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return bool(
        connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
    )


def delete_table(connection: sqlite3.Connection, table: str) -> list[str]:
    if not table_exists(connection, table):
        return []
    return [f'DELETE FROM "{table}";']


def insert_table(connection: sqlite3.Connection, table: str) -> list[str]:
    if not table_exists(connection, table):
        return []

    rows = connection.execute(f'SELECT * FROM "{table}"').fetchall()
    if not rows:
        return []
    columns = [description[0] for description in connection.execute(f'SELECT * FROM "{table}" LIMIT 0').description]
    statements = []
    for row in rows:
        values = [
            sql_literal(normalize_value(table, column, row[column]))
            for column in columns
        ]
        quoted_columns = ", ".join(f'"{column}"' for column in columns)
        statements.append(
            f'INSERT INTO "{table}" ({quoted_columns}) VALUES ({", ".join(values)});'
        )
    return statements


def export_table(connection: sqlite3.Connection, table: str) -> list[str]:
    """Return delete and insert statements for a single table.

    Kept for direct script reuse; main exports deletes and inserts in separate
    dependency-aware phases for D1 remote imports.
    """
    if not table_exists(connection, table):
        return []

    return delete_table(connection, table) + insert_table(connection, table)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", help="Optional positional form: <db> <out>.")
    parser.add_argument("--db", default="data/dental_manager.db", help="Path to source SQLite database.")
    parser.add_argument("--out", default="data/d1-export.sql", help="Path for generated SQL.")
    args = parser.parse_args()

    if len(args.paths) > 2:
        parser.error("Expected at most two positional arguments: <db> <out>.")

    db_path = Path(args.paths[0] if args.paths else args.db)
    if not db_path.exists():
        raise SystemExit(f"SQLite database not found: {db_path}")

    out_path = Path(args.paths[1] if len(args.paths) > 1 else args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        statements: list[str] = ["PRAGMA defer_foreign_keys = true;"]
        for table in [*CLEAR_ONLY_TABLES, *reversed(TABLES)]:
            statements.extend(delete_table(connection, table))
        for table in TABLES:
            statements.extend(insert_table(connection, table))
        statements.append("PRAGMA defer_foreign_keys = false;")
        out_path.write_text("\n".join(statements) + "\n", encoding="utf-8")
    finally:
        connection.close()

    print(f"Exported D1 import SQL to {out_path}")


if __name__ == "__main__":
    main()
