import { describe, expect, it } from "vitest";
import { buildAttendanceRows } from "../src/routes/payroll";
import type { Env } from "../src/types";

describe("attendance import preview", () => {
  it("uses four D1 queries for 400 rows", async () => {
    let queryCount = 0;
    const DB = {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...boundValues: unknown[]) {
            values = boundValues;
            return this;
          },
          async first() {
            queryCount += 1;
            return sql.includes("attendancerule") ? null : null;
          },
          async all() {
            queryCount += 1;
            if (sql.includes("FROM employee")) {
              return { results: [{ id: 1, name: "Budi", attendance_id: "A1" }] };
            }
            if (sql.includes("FROM attendancerecord")) {
              expect(JSON.parse(String(values[0]))).toHaveLength(400);
            }
            return { results: [] };
          },
        };
      },
    } as unknown as D1Database;
    const rows = Array.from({ length: 400 }, (_, index) => ({
      attendance_id: "A1",
      work_date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
    }));

    const preview = await buildAttendanceRows({ DB } as Env, rows);

    expect(queryCount).toBe(4);
    expect(preview.rows).toHaveLength(400);
  });
});
