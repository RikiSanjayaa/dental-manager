from datetime import date
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from sqlmodel import Session, select

from app.calculations import calculate_doctor_transaction
from app.models import (
    AttendanceRecord,
    Doctor,
    DoctorFeeRule,
    DoctorTransaction,
    Employee,
    ImportKind,
    Treatment,
)
from app.utils import money_to_float, normalize_text, parse_date, parse_period, parse_time


def safe_cell_value(
    formula_ws,
    values_ws,
    row: int,
    col: int,
    errors: list[dict[str, Any]],
    context: str,
    *,
    required: bool = False,
) -> Any:
    formula_cell = formula_ws.cell(row, col)
    raw_value = formula_cell.value
    value = values_ws.cell(row, col).value if formula_cell.data_type == "f" else raw_value

    if formula_cell.data_type == "f" and value is None:
        errors.append({"sheet": formula_ws.title, "row": row, "field": context, "message": "Formula tidak punya cached value; data tidak diimport."})
        return None
    if isinstance(value, str) and value.strip().startswith("="):
        errors.append({"sheet": formula_ws.title, "row": row, "field": context, "message": "Formula text terdeteksi; data tidak diimport."})
        return None
    if isinstance(value, str) and value.strip().startswith("#"):
        errors.append({"sheet": formula_ws.title, "row": row, "field": context, "message": f"Excel error {value}; data tidak diimport."})
        return None
    if required and (value is None or value == ""):
        errors.append({"sheet": formula_ws.title, "row": row, "field": context, "message": "Data wajib kosong; baris tidak diimport."})
        return None
    return value


def safe_money(
    formula_ws,
    values_ws,
    row: int,
    col: int,
    errors: list[dict[str, Any]],
    context: str,
    *,
    required: bool = False,
    default: float | None = 0,
) -> float | None:
    value = safe_cell_value(formula_ws, values_ws, row, col, errors, context, required=required)
    if value is None or value == "":
        return default
    return money_to_float(value)


def get_sheet(wb, preferred_name: str):
    return wb[preferred_name] if preferred_name in wb.sheetnames else wb.active


def header_map(sheet, header_row: int = 1) -> dict[str, int]:
    headers: dict[str, int] = {}
    for col in range(1, sheet.max_column + 1):
        value = sheet.cell(header_row, col).value
        if value:
            headers[normalize_text(value).replace(" ", "_")] = col
    return headers


def get_by_header(formula_ws, values_ws, headers: dict[str, int], row: int, key: str, errors: list[dict[str, Any]], *, required: bool = False) -> Any:
    col = headers.get(key)
    if not col:
        if required:
            errors.append({"sheet": formula_ws.title, "row": row, "field": key, "message": "Kolom wajib tidak ditemukan."})
        return None
    return safe_cell_value(formula_ws, values_ws, row, col, errors, key, required=required)


def money_by_header(
    formula_ws,
    values_ws,
    headers: dict[str, int],
    row: int,
    key: str,
    errors: list[dict[str, Any]],
    *,
    required: bool = False,
    default: float | None = 0,
) -> float | None:
    col = headers.get(key)
    if not col:
        if required:
            errors.append({"sheet": formula_ws.title, "row": row, "field": key, "message": "Kolom wajib tidak ditemukan."})
        return default
    return safe_money(formula_ws, values_ws, row, col, errors, key, required=required, default=default)


def preview_treatments(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    values_wb = load_workbook(path, data_only=True)
    if "MASTER TREATMENT" in formula_wb.sheetnames:
        source = preview_doctor_fee(path)
        return {"kind": "treatments", "valid_rows": len(source["data"]["treatments"]), "invalid_rows": source["invalid_rows"], "warnings": source["warnings"], "errors": source["errors"], "summary": {"treatments": len(source["data"]["treatments"])}, "data": {"treatments": source["data"]["treatments"]}}

    ws = get_sheet(formula_wb, "Treatments")
    values_ws = values_wb[ws.title]
    headers = header_map(values_ws)
    errors: list[dict[str, Any]] = []
    treatments: list[dict[str, Any]] = []
    for row in range(2, ws.max_row + 1):
        before = len(errors)
        name = get_by_header(ws, values_ws, headers, row, "name", errors, required=True)
        if not name:
            continue
        bhp_cost = money_by_header(ws, values_ws, headers, row, "bhp_cost", errors, default=0) or 0
        treatment_price = money_by_header(ws, values_ws, headers, row, "treatment_price", errors, default=0) or 0
        service_fee = money_by_header(ws, values_ws, headers, row, "service_fee", errors, default=None)
        treatments.append(
            {
                "row": row,
                "code": str(get_by_header(ws, values_ws, headers, row, "code", errors) or "").strip() or None,
                "name": str(name).strip(),
                "category": str(get_by_header(ws, values_ws, headers, row, "category", errors) or "").strip() or None,
                "doctor_cost": money_by_header(ws, values_ws, headers, row, "doctor_cost", errors, default=0) or 0,
                "specialist_cost": money_by_header(ws, values_ws, headers, row, "specialist_cost", errors, default=0) or 0,
                "bhp_cost": bhp_cost,
                "service_fee": service_fee if service_fee is not None else max(treatment_price - bhp_cost, 0),
                "treatment_price": treatment_price,
                "notes": str(get_by_header(ws, values_ws, headers, row, "notes", errors) or "").strip() or None,
                "valid": len(errors) == before,
            }
        )
    valid = [item for item in treatments if item.get("valid", True)]
    return {"kind": "treatments", "valid_rows": len(valid), "invalid_rows": len(treatments) - len(valid) + len(errors), "warnings": [], "errors": errors, "summary": {"treatments": len(valid)}, "data": {"treatments": valid}}


def preview_doctors(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    values_wb = load_workbook(path, data_only=True)
    if "Rekapan FEE DOKTER" in formula_wb.sheetnames:
        doctors = list(extract_doctor_metadata(values_wb).values())
        unique = {normalize_text(item["name"]): item for item in doctors}
        doctors = list(unique.values())
        return {"kind": "doctors", "valid_rows": len(doctors), "invalid_rows": 0, "warnings": [], "errors": [], "summary": {"doctors": len(doctors)}, "data": {"doctors": doctors}}

    ws = get_sheet(formula_wb, "Doctors")
    values_ws = values_wb[ws.title]
    headers = header_map(values_ws)
    errors: list[dict[str, Any]] = []
    doctors: list[dict[str, Any]] = []
    for row in range(2, ws.max_row + 1):
        before = len(errors)
        name = get_by_header(ws, values_ws, headers, row, "name", errors, required=True)
        if not name:
            continue
        doctors.append(
            {
                "row": row,
                "name": str(name).strip(),
                "sheet_name": str(get_by_header(ws, values_ws, headers, row, "sheet_name", errors) or name).strip(),
                "bank_name": str(get_by_header(ws, values_ws, headers, row, "bank_name", errors) or "").strip() or None,
                "account_name": str(get_by_header(ws, values_ws, headers, row, "account_name", errors) or name).strip(),
                "account_number": str(get_by_header(ws, values_ws, headers, row, "account_number", errors) or "").strip() or None,
                "nik": str(get_by_header(ws, values_ws, headers, row, "nik", errors) or "").strip() or None,
                "normal_fee_rate": money_by_header(ws, values_ws, headers, row, "normal_fee_rate", errors, default=0.6) or 0.6,
                "ortho_fee_rate": money_by_header(ws, values_ws, headers, row, "ortho_fee_rate", errors, default=0.7) or 0.7,
                "tax_rate": money_by_header(ws, values_ws, headers, row, "tax_rate", errors, default=0.025) or 0.025,
                "valid": len(errors) == before,
            }
        )
    valid = [item for item in doctors if item.get("valid", True)]
    return {"kind": "doctors", "valid_rows": len(valid), "invalid_rows": len(doctors) - len(valid) + len(errors), "warnings": [], "errors": errors, "summary": {"doctors": len(valid)}, "data": {"doctors": valid}}


def preview_employees(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    values_wb = load_workbook(path, data_only=True)
    if "Form Gaji Karyawan" in formula_wb.sheetnames:
        source = preview_payroll(path)
        return {"kind": "employees", "valid_rows": len(source["data"]["employees"]), "invalid_rows": source["invalid_rows"], "warnings": source["warnings"], "errors": source["errors"], "summary": {"employees": len(source["data"]["employees"])}, "data": {"employees": source["data"]["employees"]}}

    ws = get_sheet(formula_wb, "Employees")
    values_ws = values_wb[ws.title]
    headers = header_map(values_ws)
    errors: list[dict[str, Any]] = []
    employees: list[dict[str, Any]] = []
    for row in range(2, ws.max_row + 1):
        before = len(errors)
        name = get_by_header(ws, values_ws, headers, row, "name", errors, required=True)
        base_salary = money_by_header(ws, values_ws, headers, row, "base_salary", errors, required=True, default=None)
        if not name or base_salary is None:
            continue
        employees.append(
            {
                "row": row,
                "name": str(name).strip(),
                "position": str(get_by_header(ws, values_ws, headers, row, "position", errors) or "").strip() or None,
                "join_date": str(get_by_header(ws, values_ws, headers, row, "join_date", errors) or "").strip() or None,
                "base_salary": base_salary,
                "working_days": int(money_by_header(ws, values_ws, headers, row, "working_days", errors, default=25) or 25),
                "bank_name": str(get_by_header(ws, values_ws, headers, row, "bank_name", errors) or "").strip() or None,
                "account_name": str(get_by_header(ws, values_ws, headers, row, "account_name", errors) or name).strip(),
                "account_number": str(get_by_header(ws, values_ws, headers, row, "account_number", errors) or "").strip() or None,
                "valid": len(errors) == before,
            }
        )
    valid = [item for item in employees if item.get("valid", True)]
    return {"kind": "employees", "valid_rows": len(valid), "invalid_rows": len(employees) - len(valid) + len(errors), "warnings": [], "errors": errors, "summary": {"employees": len(valid)}, "data": {"employees": valid}}


def preview_attendance(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    if "FINGER PIN" in formula_wb.sheetnames:
        source = preview_payroll(path)
        return {"kind": "attendance", "valid_rows": len(source["data"]["attendance"]), "invalid_rows": source["invalid_rows"], "warnings": source["warnings"], "errors": source["errors"], "summary": {"attendance": len(source["data"]["attendance"])}, "data": {"attendance": source["data"]["attendance"]}}

    values_wb = load_workbook(path, data_only=True)
    ws = get_sheet(formula_wb, "Attendance")
    values_ws = values_wb[ws.title]
    headers = header_map(values_ws)
    errors: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    for row in range(2, ws.max_row + 1):
        before = len(errors)
        name = get_by_header(ws, values_ws, headers, row, "employee_name", errors, required=True)
        work_date = parse_date(get_by_header(ws, values_ws, headers, row, "work_date", errors, required=True))
        if not name or not work_date:
            continue
        rows.append(
            {
                "row": row,
                "employee_name": str(name).strip(),
                "period": str(get_by_header(ws, values_ws, headers, row, "period", errors) or parse_period(work_date)).strip(),
                "work_date": work_date.isoformat(),
                "timezone1_in": str(get_by_header(ws, values_ws, headers, row, "timezone1_in", errors) or "") or None,
                "timezone1_out": str(get_by_header(ws, values_ws, headers, row, "timezone1_out", errors) or "") or None,
                "timezone2_in": str(get_by_header(ws, values_ws, headers, row, "timezone2_in", errors) or "") or None,
                "timezone2_out": str(get_by_header(ws, values_ws, headers, row, "timezone2_out", errors) or "") or None,
                "late_minutes": int(money_by_header(ws, values_ws, headers, row, "late_minutes", errors, default=0) or 0),
                "early_leave_minutes": int(money_by_header(ws, values_ws, headers, row, "early_leave_minutes", errors, default=0) or 0),
                "absent_minutes": int(money_by_header(ws, values_ws, headers, row, "absent_minutes", errors, default=0) or 0),
                "status_note": str(get_by_header(ws, values_ws, headers, row, "status_note", errors) or "").strip() or None,
                "employee_found": True,
                "valid": len(errors) == before,
            }
        )
    valid = [item for item in rows if item.get("valid", True)]
    return {"kind": "attendance", "valid_rows": len(valid), "invalid_rows": len(rows) - len(valid) + len(errors), "warnings": [], "errors": errors, "summary": {"attendance": len(valid)}, "data": {"attendance": valid}}


def preview_doctor_transactions(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    if any(name.lower().startswith("ts. drg.") for name in formula_wb.sheetnames):
        source = preview_doctor_fee(path)
        return {"kind": "doctor_transactions", "valid_rows": len(source["data"]["transactions"]), "invalid_rows": source["invalid_rows"], "warnings": source["warnings"], "errors": source["errors"], "summary": {"transactions": len(source["data"]["transactions"])}, "data": {"transactions": source["data"]["transactions"], "doctors": source["data"]["doctors"]}}

    values_wb = load_workbook(path, data_only=True)
    ws = get_sheet(formula_wb, "DoctorTransactions")
    values_ws = values_wb[ws.title]
    headers = header_map(values_ws)
    errors: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    for row in range(2, ws.max_row + 1):
        before = len(errors)
        trx_date = parse_date(get_by_header(ws, values_ws, headers, row, "transaction_date", errors, required=True))
        doctor_name = get_by_header(ws, values_ws, headers, row, "doctor_name", errors, required=True)
        treatment_name = get_by_header(ws, values_ws, headers, row, "treatment_name", errors, required=True)
        if not trx_date or not doctor_name or not treatment_name:
            continue
        rows.append(
            {
                "row": row,
                "doctor_name": str(doctor_name).strip(),
                "transaction_date": trx_date.isoformat(),
                "period": str(get_by_header(ws, values_ws, headers, row, "period", errors) or parse_period(trx_date)).strip(),
                "patient_name": str(get_by_header(ws, values_ws, headers, row, "patient_name", errors) or "Nama Pasien").strip(),
                "treatment_name": str(treatment_name).strip(),
                "qty": money_by_header(ws, values_ws, headers, row, "qty", errors, default=1) or 1,
                "discount_amount": money_by_header(ws, values_ws, headers, row, "discount_amount", errors, default=0) or 0,
                "bhp_override": money_by_header(ws, values_ws, headers, row, "bhp_override", errors, default=None),
                "price_override": money_by_header(ws, values_ws, headers, row, "price_override", errors, default=None),
                "special_fee_amount": money_by_header(ws, values_ws, headers, row, "special_fee_amount", errors, default=0) or 0,
                "fee_rate": money_by_header(ws, values_ws, headers, row, "fee_rate", errors, default=None),
                "treatment_found": True,
                "valid": len(errors) == before,
            }
        )
    valid = [item for item in rows if item.get("valid", True)]
    return {"kind": "doctor_transactions", "valid_rows": len(valid), "invalid_rows": len(rows) - len(valid) + len(errors), "warnings": [], "errors": errors, "summary": {"transactions": len(valid)}, "data": {"transactions": valid, "doctors": []}}


def detect_import_kind(path: str | Path) -> ImportKind:
    wb = load_workbook(path, read_only=True, data_only=False)
    names = set(wb.sheetnames)
    if {"MASTER TREATMENT", "Rekapan FEE DOKTER"}.issubset(names):
        return ImportKind.DOCTOR_FEE
    if {"Form Gaji Karyawan", "FINGER PIN"}.issubset(names):
        return ImportKind.PAYROLL
    return ImportKind.UNKNOWN


def build_preview(path: str | Path, kind: ImportKind | None = None) -> dict[str, Any]:
    kind = kind or detect_import_kind(path)
    if kind == ImportKind.DOCTOR_FEE:
        return preview_doctor_fee(path)
    if kind == ImportKind.PAYROLL:
        return preview_payroll(path)
    return {"kind": ImportKind.UNKNOWN, "valid_rows": 0, "invalid_rows": 0, "warnings": ["Workbook tidak dikenali."]}


def preview_doctor_fee(path: str | Path) -> dict[str, Any]:
    wb = load_workbook(path, data_only=False)
    values_wb = load_workbook(path, data_only=True)
    master = wb["MASTER TREATMENT"]
    master_values = values_wb["MASTER TREATMENT"]
    treatments: list[dict[str, Any]] = []
    treatment_names: set[str] = set()
    errors: list[dict[str, Any]] = []
    warnings: list[str] = []

    current_category: str | None = None
    for row in range(3, master.max_row + 1):
        row_errors_before = len(errors)
        name = safe_cell_value(master, master_values, row, 2, errors, "name")
        category_value = safe_cell_value(master, master_values, row, 1, errors, "category/code")
        if not name and category_value:
            current_category = str(category_value).strip()
            continue
        if not name:
            continue
        code = safe_cell_value(master, master_values, row, 1, errors, "code")
        bhp_cost = safe_money(master, master_values, row, 7, errors, "bhp_cost", default=0) or 0
        treatment_price = safe_money(master, master_values, row, 9, errors, "treatment_price", default=0) or 0
        service_fee = safe_money(master, master_values, row, 8, errors, "service_fee", default=None)
        if service_fee is None and treatment_price:
            service_fee = treatment_price - bhp_cost
        if len(errors) > row_errors_before and not code:
            continue
        normalized = normalize_text(name)
        duplicate = normalized in treatment_names
        treatment_names.add(normalized)
        treatments.append(
            {
                "row": row,
                "code": str(code or "").strip(),
                "name": str(name).strip(),
                "category": current_category,
                "doctor_cost": safe_money(master, master_values, row, 5, errors, "doctor_cost", default=0) or 0,
                "specialist_cost": safe_money(master, master_values, row, 6, errors, "specialist_cost", default=0) or 0,
                "bhp_cost": bhp_cost,
                "service_fee": service_fee or 0,
                "treatment_price": treatment_price,
                "notes": str(safe_cell_value(master, master_values, row, 10, errors, "notes") or "").strip() or None,
                "duplicate": duplicate,
            }
        )
        if duplicate:
            warnings.append(f"Treatment duplikat: {name}")

    doctors = extract_doctor_metadata(values_wb)
    transactions: list[dict[str, Any]] = []
    for ws in wb.worksheets:
        if not ws.title.lower().startswith("ts. drg."):
            continue
        values_ws = values_wb[ws.title]
        sheet_doctor_name = ws.title.replace("TS. DRG.", "").strip().title()
        doctor_name = doctors.get(normalize_text(sheet_doctor_name), {}).get("name", sheet_doctor_name)
        header_row = 4 if ws.cell(4, 1).value == "Tanggal" else 5
        current_date: date | None = None
        for row in range(header_row + 1, ws.max_row + 1):
            row_errors_before = len(errors)
            raw_date = safe_cell_value(ws, values_ws, row, 1, errors, "transaction_date")
            if raw_date:
                current_date = parse_date(raw_date)
            treatment_name = safe_cell_value(ws, values_ws, row, 3, errors, "treatment_name")
            patient_name = safe_cell_value(ws, values_ws, row, 2, errors, "patient_name")
            if not treatment_name and not patient_name:
                continue
            if isinstance(treatment_name, str) and "TOTAL FEE" in treatment_name.upper():
                break
            if not treatment_name:
                continue
            if current_date is None:
                errors.append({"sheet": ws.title, "row": row, "message": "Tanggal kosong/tidak valid."})
            normalized = normalize_text(treatment_name)
            matched = normalized in treatment_names
            transactions.append(
                {
                    "sheet": ws.title,
                    "row": row,
                    "doctor_name": doctor_name,
                    "transaction_date": current_date.isoformat() if current_date else None,
                    "period": parse_period(current_date),
                    "patient_name": str(patient_name or "Nama Pasien").strip(),
                    "treatment_name": str(treatment_name).strip(),
                    "qty": safe_money(ws, values_ws, row, 6, errors, "qty", default=1) or 1,
                    "discount_amount": safe_money(ws, values_ws, row, 7, errors, "discount_amount", default=0) or 0,
                    "bhp_override": None if ws.cell(row, 4).data_type == "f" else safe_money(ws, values_ws, row, 4, errors, "bhp_override", default=None),
                    "price_override": None if ws.cell(row, 5).data_type == "f" else safe_money(ws, values_ws, row, 5, errors, "price_override", default=None),
                    "special_fee_amount": safe_money(ws, values_ws, row, 10, errors, "special_fee_amount", default=0) or 0,
                    "treatment_found": matched,
                    "valid": len(errors) == row_errors_before,
                }
            )
            if not matched:
                warnings.append(f"Treatment belum match: {treatment_name}")

    return {
        "kind": ImportKind.DOCTOR_FEE,
        "valid_rows": len(treatments) + len(transactions) - len(errors),
        "invalid_rows": len(errors),
        "warnings": warnings[:200],
        "errors": errors,
        "summary": {
            "treatments": len(treatments),
            "transactions": len(transactions),
            "doctor_sheets": sorted({row["doctor_name"] for row in transactions}),
            "doctors": len(doctors),
        },
        "data": {"treatments": treatments, "transactions": transactions, "doctors": list(doctors.values())},
    }


def preview_payroll(path: str | Path) -> dict[str, Any]:
    formula_wb = load_workbook(path, data_only=False)
    wb = load_workbook(path, data_only=True)
    payroll_formula = formula_wb["Form Gaji Karyawan"]
    payroll = wb["Form Gaji Karyawan"]
    attendance_formula = formula_wb["FINGER PIN"]
    attendance = wb["FINGER PIN"]
    employees: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    warnings: list[str] = []

    for row in range(5, payroll.max_row + 1):
        row_errors_before = len(errors)
        no = safe_cell_value(payroll_formula, payroll, row, 1, errors, "no")
        name = safe_cell_value(payroll_formula, payroll, row, 2, errors, "name")
        if not name:
            continue
        if str(name).strip().upper() == "TOTAL" or str(no).strip().upper() == "TOTAL":
            break
        base_salary = safe_money(payroll_formula, payroll, row, 6, errors, "base_salary", required=True, default=None)
        if base_salary is None:
            continue
        employees.append(
            {
                "row": row,
                "name": str(name).strip(),
                "position": str(safe_cell_value(payroll_formula, payroll, row, 3, errors, "position") or "").strip() or None,
                "join_date": str(safe_cell_value(payroll_formula, payroll, row, 4, errors, "join_date") or "").strip() or None,
                "base_salary": base_salary,
                "working_days": int(safe_money(payroll_formula, payroll, row, 7, errors, "working_days", default=25) or 25),
                "double_shift_count": safe_money(payroll_formula, payroll, row, 8, errors, "double_shift_count", default=0) or 0,
                "sunday_fee": safe_money(payroll_formula, payroll, row, 14, errors, "sunday_fee", default=0) or 0,
                "overtime_minutes": int(safe_money(payroll_formula, payroll, row, 15, errors, "overtime_minutes", default=0) or 0),
                "overtime_total": safe_money(payroll_formula, payroll, row, 17, errors, "overtime_total", default=0) or 0,
                "bonus": safe_money(payroll_formula, payroll, row, 18, errors, "bonus", default=0) or 0,
                "position_allowance": safe_money(payroll_formula, payroll, row, 19, errors, "position_allowance", default=0) or 0,
                "bpjs_deduction": safe_money(payroll_formula, payroll, row, 20, errors, "bpjs_deduction", default=0) or 0,
                "other_deduction": safe_money(payroll_formula, payroll, row, 21, errors, "other_deduction", default=0) or 0,
                "pph21": safe_money(payroll_formula, payroll, row, 22, errors, "pph21", default=0) or 0,
                "net_salary": safe_money(payroll_formula, payroll, row, 23, errors, "net_salary", default=0) or 0,
                "payment_method": str(safe_cell_value(payroll_formula, payroll, row, 24, errors, "payment_method") or "Transfer").strip(),
                "bank_name": str(safe_cell_value(payroll_formula, payroll, row, 25, errors, "bank_name") or "").strip() or None,
                "account_name": str(safe_cell_value(payroll_formula, payroll, row, 26, errors, "account_name") or name).strip(),
                "account_number": str(safe_cell_value(payroll_formula, payroll, row, 27, errors, "account_number") or "").strip() or None,
                "valid": len(errors) == row_errors_before,
            }
        )

    attendance_rows: list[dict[str, Any]] = []
    for row in range(5, attendance.max_row + 1):
        row_errors_before = len(errors)
        name = safe_cell_value(attendance_formula, attendance, row, 2, errors, "employee_name")
        work_date = parse_date(safe_cell_value(attendance_formula, attendance, row, 4, errors, "work_date"))
        if not name or not work_date:
            continue
        matched = any(normalize_text(name) == normalize_text(employee["name"]) for employee in employees)
        attendance_rows.append(
            {
                "row": row,
                "employee_name": str(name).strip(),
                "period": parse_period(work_date),
                "work_date": work_date.isoformat(),
                "timezone1_in": str(safe_cell_value(attendance_formula, attendance, row, 5, errors, "timezone1_in") or "") or None,
                "timezone1_out": str(safe_cell_value(attendance_formula, attendance, row, 6, errors, "timezone1_out") or "") or None,
                "timezone2_in": str(safe_cell_value(attendance_formula, attendance, row, 7, errors, "timezone2_in") or "") or None,
                "timezone2_out": str(safe_cell_value(attendance_formula, attendance, row, 8, errors, "timezone2_out") or "") or None,
                "late_minutes": int(safe_money(attendance_formula, attendance, row, 9, errors, "late_minutes", default=0) or 0),
                "early_leave_minutes": int(safe_money(attendance_formula, attendance, row, 10, errors, "early_leave_minutes", default=0) or 0),
                "absent_minutes": int(safe_money(attendance_formula, attendance, row, 11, errors, "absent_minutes", default=0) or 0),
                "status_note": str(safe_cell_value(attendance_formula, attendance, row, 13, errors, "status_note") or "").strip() or None,
                "employee_found": matched,
                "valid": len(errors) == row_errors_before,
            }
        )
        if not matched:
            warnings.append(f"Fingerprint belum match ke karyawan: {name}")

    return {
        "kind": ImportKind.PAYROLL,
        "valid_rows": len(employees) + len(attendance_rows) - len(errors),
        "invalid_rows": len(errors),
        "warnings": warnings[:200],
        "errors": errors,
        "summary": {"employees": len(employees), "attendance_records": len(attendance_rows)},
        "data": {"employees": employees, "attendance": attendance_rows},
    }


def commit_preview(session: Session, preview: dict[str, Any]) -> dict[str, int]:
    if preview.get("kind") == ImportKind.DOCTOR_FEE:
        return commit_doctor_fee(session, preview)
    if preview.get("kind") == ImportKind.PAYROLL:
        return commit_payroll(session, preview)
    return {"created": 0, "updated": 0}


def commit_treatments(session: Session, treatments: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0
    for item in treatments:
        treatment = session.exec(select(Treatment).where(Treatment.name == item["name"])).first()
        if not treatment and item.get("code"):
            treatment = session.exec(select(Treatment).where(Treatment.code == item["code"])).first()
        if not treatment:
            treatment = Treatment(name=item["name"])
            created += 1
        else:
            updated += 1
        for field in ["code", "category", "doctor_cost", "specialist_cost", "bhp_cost", "service_fee", "treatment_price", "notes"]:
            setattr(treatment, field, item.get(field))
        session.add(treatment)
    session.commit()
    return {"created": created, "updated": updated}


def commit_doctors(session: Session, doctors: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0
    for item in doctors:
        existing = session.exec(select(Doctor).where(Doctor.name == item["name"])).first()
        upsert_doctor(session, item)
        if existing:
            updated += 1
        else:
            created += 1
    session.commit()
    return {"created": created, "updated": updated}


def commit_employees(session: Session, employees: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0
    for item in employees:
        employee = session.exec(select(Employee).where(Employee.name == item["name"])).first()
        if not employee:
            employee = Employee(name=item["name"])
            created += 1
        else:
            updated += 1
        employee.position = item["position"]
        employee.join_date = parse_date(item["join_date"])
        employee.base_salary = item["base_salary"]
        employee.working_days = item["working_days"]
        employee.bank_name = item["bank_name"]
        employee.account_name = item["account_name"]
        employee.account_number = item["account_number"]
        session.add(employee)
    session.commit()
    return {"created": created, "updated": updated}


def commit_attendance(session: Session, attendance_rows: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    employee_map = {normalize_text(employee.name): employee for employee in session.exec(select(Employee)).all()}
    for item in attendance_rows:
        work_date = parse_date(item["work_date"])
        if not work_date:
            continue
        employee = employee_map.get(normalize_text(item["employee_name"]))
        record = AttendanceRecord(
            period=item["period"],
            employee_id=employee.id if employee else None,
            employee_name_snapshot=item["employee_name"],
            work_date=work_date,
            timezone1_in=parse_time(item["timezone1_in"]),
            timezone1_out=parse_time(item["timezone1_out"]),
            timezone2_in=parse_time(item["timezone2_in"]),
            timezone2_out=parse_time(item["timezone2_out"]),
            late_minutes=item["late_minutes"],
            early_leave_minutes=item["early_leave_minutes"],
            absent_minutes=item["absent_minutes"],
            is_sunday=work_date.weekday() == 6,
            needs_review=employee is None,
            status_note=item["status_note"],
        )
        session.add(record)
        created += 1
    session.commit()
    return {"created": created, "updated": 0}


def commit_doctor_transactions(session: Session, preview: dict[str, Any]) -> dict[str, int]:
    created = 0
    updated = 0
    treatment_map = {normalize_text(treatment.name): treatment for treatment in session.exec(select(Treatment)).all()}
    doctor_map = {normalize_text(doctor.name): doctor for doctor in session.exec(select(Doctor)).all()}
    for item in preview["data"].get("doctors", []):
        doctor = upsert_doctor(session, item)
        doctor_map[normalize_text(doctor.name)] = doctor
        if item.get("sheet_name"):
            doctor_map[normalize_text(item["sheet_name"])] = doctor

    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    default_rule = default_rule or DoctorFeeRule(name="Default", is_default=True)

    for item in preview["data"]["transactions"]:
        if not item.get("valid", True):
            continue
        trx_date = parse_date(item["transaction_date"])
        if not trx_date:
            continue
        doctor = doctor_map.get(normalize_text(item["doctor_name"])) or upsert_doctor(session, {"name": item["doctor_name"]})
        treatment = treatment_map.get(normalize_text(item["treatment_name"]))
        trx = DoctorTransaction(
            period=item["period"],
            transaction_date=trx_date,
            doctor_id=doctor.id,
            patient_name=item["patient_name"],
            treatment_id=treatment.id if treatment else None,
            treatment_name_snapshot=item["treatment_name"],
            qty=item["qty"],
            discount_amount=item["discount_amount"],
            bhp_override=item["bhp_override"],
            price_override=item["price_override"],
            special_fee_amount=item["special_fee_amount"],
            needs_review=not bool(treatment),
            review_note=None if treatment else "Treatment belum ditemukan di master.",
        )
        calculate_doctor_transaction(trx, treatment, doctor, default_rule)
        session.add(trx)
        created += 1
    session.commit()
    return {"created": created, "updated": updated}


def commit_doctor_fee(session: Session, preview: dict[str, Any]) -> dict[str, int]:
    created = 0
    updated = 0
    treatment_map: dict[str, Treatment] = {}
    result = commit_treatments(session, preview["data"]["treatments"])
    created += result["created"]
    updated += result["updated"]
    treatment_map = {normalize_text(treatment.name): treatment for treatment in session.exec(select(Treatment)).all()}

    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    default_rule = default_rule or DoctorFeeRule(name="Default", is_default=True)
    doctor_map: dict[str, Doctor] = {}
    for item in preview["data"].get("doctors", []):
        doctor = upsert_doctor(session, item)
        doctor_map[normalize_text(doctor.name)] = doctor
        if item.get("sheet_name"):
            doctor_map[normalize_text(item["sheet_name"])] = doctor

    for item in preview["data"]["transactions"]:
        trx_date = parse_date(item["transaction_date"])
        if not trx_date:
            continue
        doctor = doctor_map.get(normalize_text(item["doctor_name"]))
        if not doctor:
            doctor = upsert_doctor(session, {"name": item["doctor_name"], "sheet_name": item["doctor_name"]})
            doctor_map[normalize_text(item["doctor_name"])] = doctor
            created += 1
        treatment = treatment_map.get(normalize_text(item["treatment_name"]))
        trx = DoctorTransaction(
            period=item["period"],
            transaction_date=trx_date,
            doctor_id=doctor.id,
            patient_name=item["patient_name"],
            treatment_id=treatment.id if treatment else None,
            treatment_name_snapshot=item["treatment_name"],
            qty=item["qty"],
            discount_amount=item["discount_amount"],
            bhp_override=item["bhp_override"],
            price_override=item["price_override"],
            special_fee_amount=item["special_fee_amount"],
            needs_review=not bool(treatment),
            review_note=None if treatment else "Treatment belum ditemukan di master.",
        )
        calculate_doctor_transaction(trx, treatment, doctor, default_rule)
        session.add(trx)
        created += 1

    session.commit()
    return {"created": created, "updated": updated}


def extract_doctor_metadata(values_wb) -> dict[str, dict[str, Any]]:
    if "Rekapan FEE DOKTER" not in values_wb.sheetnames:
        return {}
    sheet = values_wb["Rekapan FEE DOKTER"]
    result: dict[str, dict[str, Any]] = {}
    sheet_names = {
        normalize_text(name.replace("TS. DRG.", "").strip()): name.replace("TS. DRG.", "").strip().title()
        for name in values_wb.sheetnames
        if name.lower().startswith("ts. drg.")
    }
    for row in range(2, sheet.max_row + 1):
        raw_name = sheet.cell(row, 3).value
        if not raw_name:
            continue
        name = str(raw_name).strip()
        if name.upper() == "TOTAL":
            continue
        short_name = name.replace("drg.", "").replace("Drg.", "").strip()
        matched_sheet_name = sheet_names.get(normalize_text(short_name), short_name.title())
        metadata = {
            "name": name,
            "sheet_name": matched_sheet_name,
            "bank_name": str(sheet.cell(row, 11).value or "").strip() or None,
            "account_number": str(sheet.cell(row, 12).value or "").strip() or None,
            "account_name": str(sheet.cell(row, 13).value or name).strip() or None,
            "nik": str(sheet.cell(row, 14).value or "").strip() or None,
        }
        result[normalize_text(name)] = metadata
        result[normalize_text(short_name)] = metadata
        result[normalize_text(matched_sheet_name)] = metadata
    return result


def upsert_doctor(session: Session, item: dict[str, Any]) -> Doctor:
    name = str(item["name"]).strip()
    doctor = session.exec(select(Doctor).where(Doctor.name == name)).first()
    if not doctor and item.get("sheet_name"):
        sheet_name = str(item["sheet_name"]).strip()
        doctor = session.exec(select(Doctor).where(Doctor.name == sheet_name)).first()
    if not doctor:
        doctor = Doctor(name=name)
    else:
        doctor.name = name
    doctor.bank_name = item.get("bank_name") or doctor.bank_name
    doctor.account_name = item.get("account_name") or doctor.account_name
    doctor.account_number = item.get("account_number") or doctor.account_number
    doctor.nik = item.get("nik") or doctor.nik
    session.add(doctor)
    session.flush()
    return doctor


def commit_payroll(session: Session, preview: dict[str, Any]) -> dict[str, int]:
    employees = commit_employees(session, preview["data"]["employees"])
    attendance = commit_attendance(session, preview["data"]["attendance"])
    return {"created": employees["created"] + attendance["created"], "updated": employees["updated"] + attendance["updated"]}
