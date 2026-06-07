from pathlib import Path
from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlmodel import Session, select

from app.database import engine, refresh_database
from app.importers import preview_doctor_fee, preview_payroll
from app.main import app
from app.models import Doctor, Employee, ImportKind, Treatment
from app.security import create_access_token

ROOT = Path(__file__).resolve().parents[2]


def assert_no_formula_strings(value):
    if isinstance(value, dict):
        for nested in value.values():
            assert_no_formula_strings(nested)
    elif isinstance(value, list):
        for nested in value:
            assert_no_formula_strings(nested)
    elif isinstance(value, str):
        assert not value.strip().startswith("="), value


def test_fee_workbook_preview_detects_core_rows():
    preview = preview_doctor_fee(ROOT / "DC- FEE DOKTER MEI 2026 (REVISI) - Copy.xlsx")

    assert preview["kind"] == ImportKind.DOCTOR_FEE
    assert preview["summary"]["treatments"] > 100
    assert preview["summary"]["transactions"] > 50
    assert "Drg. Dokter 1" in preview["summary"]["doctor_sheets"]
    assert preview["data"]["treatments"][0]["code"] == "KON-001"
    assert not preview["data"]["treatments"][0]["code"].startswith("=")
    assert any(treatment["notes"] for treatment in preview["data"]["treatments"])
    assert any(doctor["nik"] for doctor in preview["data"]["doctors"])
    assert any(doctor["account_number"] for doctor in preview["data"]["doctors"])
    assert_no_formula_strings(preview["data"])


def test_payroll_workbook_preview_detects_employees_and_attendance():
    preview = preview_payroll(ROOT / "DC- GAJI KARYAWAN MEI 2026 - Copy.xlsx")

    assert preview["kind"] == ImportKind.PAYROLL
    assert preview["summary"]["employees"] >= 10
    assert preview["summary"]["attendance_records"] > 100
    assert preview["data"]["employees"][2]["base_salary"] == 2169800
    assert not str(preview["data"]["employees"][2]["base_salary"]).startswith("=")
    assert_no_formula_strings(preview["data"])


def workbook_upload(sheet: str, headers: list[str], rows: list[list[object]]) -> BytesIO:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = sheet
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)
    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    stream.name = f"{sheet}.xlsx"
    return stream


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token('admin')}"}


def test_master_treatment_preview_marks_updates_invalid_duplicates_and_commits_once():
    refresh_database()
    with Session(engine) as session:
        session.add(Treatment(code="KON-001", name="Konsultasi Lama", treatment_price=50000))
        session.commit()

    client = TestClient(app)
    headers = auth_headers()
    upload = workbook_upload(
        "Treatments",
        ["code", "name", "category", "doctor_cost", "specialist_cost", "bhp_cost", "service_fee", "treatment_price", "notes"],
        [
            ["KON-001", "Konsultasi Baru", "KONSULTASI", 0, 0, 0, 50000, 50000, ""],
            ["SC-001", "Scaling", "PERAWATAN", 0, 0, 10000, 90000, 100000, ""],
            ["SC-001", "Scaling Duplicate", "PERAWATAN", 0, 0, 10000, 90000, 100000, ""],
            ["BAD-001", "", "PERAWATAN", 0, 0, 0, 0, 0, ""],
        ],
    )

    response = client.post("/master-data/import/treatments/preview", headers=headers, files={"file": ("treatments.xlsx", upload)})
    assert response.status_code == 200
    preview = response.json()
    assert preview["summary"]["new"] == 1
    assert preview["summary"]["update"] == 1
    assert preview["summary"]["duplicate_in_file"] == 1
    assert preview["invalid_rows"] >= 2
    assert [row["status"] for row in preview["rows"]] == ["update", "new", "invalid"]

    commit = client.post(f"/master-data/import/treatments/{preview['import_id']}/commit", headers=headers)
    assert commit.status_code == 200
    assert commit.json()["created"] == 1
    assert commit.json()["updated"] == 1

    second_commit = client.post(f"/master-data/import/treatments/{preview['import_id']}/commit", headers=headers)
    assert second_commit.status_code == 409


def test_master_doctor_and_employee_preview_mark_existing_rows_as_updates():
    refresh_database()
    with Session(engine) as session:
        session.add(Doctor(name="Drg. Lama"))
        session.add(Employee(name="Karyawan Lama", base_salary=1000))
        session.commit()

    client = TestClient(app)
    headers = auth_headers()
    doctor_upload = workbook_upload(
        "Doctors",
        ["name", "sheet_name", "bank_name", "account_name", "account_number", "nik", "normal_fee_rate", "ortho_fee_rate", "tax_rate"],
        [["Drg. Lama", "Lama", "MANDIRI", "Drg. Lama", "123", "456", 0.6, 0.7, 0.025], ["Drg. Baru", "Baru", "", "Drg. Baru", "", "", 0.6, 0.7, 0.025]],
    )
    employee_upload = workbook_upload(
        "Employees",
        ["name", "position", "join_date", "base_salary", "working_days", "bank_name", "account_name", "account_number"],
        [["Karyawan Lama", "Admin", "2026-05-01", 2000, 25, "BSI", "Karyawan Lama", "789"], ["Karyawan Baru", "CS", "2026-05-01", 3000, 25, "", "Karyawan Baru", ""]],
    )

    doctor_response = client.post("/master-data/import/doctors/preview", headers=headers, files={"file": ("doctors.xlsx", doctor_upload)})
    employee_response = client.post("/master-data/import/employees/preview", headers=headers, files={"file": ("employees.xlsx", employee_upload)})

    assert doctor_response.status_code == 200
    assert employee_response.status_code == 200
    assert doctor_response.json()["summary"]["update"] == 1
    assert doctor_response.json()["summary"]["new"] == 1
    assert employee_response.json()["summary"]["update"] == 1
    assert employee_response.json()["summary"]["new"] == 1
