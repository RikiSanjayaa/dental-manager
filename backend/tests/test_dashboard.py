from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.database import engine, refresh_database
from app.main import app
from app.models import (
    AttendanceRecord,
    AuditLog,
    Doctor,
    DoctorPeriodSummary,
    DoctorTransaction,
    Employee,
    PayrollRecord,
    PeriodStatus,
)
from app.security import create_access_token


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token('admin')}"}


def test_dashboard_returns_operational_overview():
    refresh_database()
    with Session(engine) as session:
        doctor = Doctor(name="Drg. Leni")
        employee = Employee(name="Rika", attendance_id="1", base_salary=2_712_250)
        session.add(doctor)
        session.add(employee)
        session.flush()
        session.add(
            DoctorTransaction(
                period="2026-05",
                transaction_date=date(2026, 5, 1),
                doctor_id=doctor.id,
                patient_name="Pasien",
                treatment_name_snapshot="Konsultasi",
                total_bill_amount=250_000,
                needs_review=True,
            )
        )
        session.add(
            DoctorPeriodSummary(
                period="2026-05",
                doctor_id=doctor.id,
                total_bill=250_000,
                transfer_amount=120_000,
                status=PeriodStatus.DRAFT,
            )
        )
        session.add(
            AttendanceRecord(
                period="2026-05",
                employee_id=employee.id,
                employee_name_snapshot="RIKA",
                work_date=date(2026, 5, 2),
                overtime_minutes=90,
                needs_review=True,
            )
        )
        session.add(
            PayrollRecord(
                period="2026-05",
                employee_id=employee.id,
                overtime_minutes=90,
                overtime_total=22_500,
                net_salary=2_500_000,
                needs_review=True,
                status=PeriodStatus.DRAFT,
            )
        )
        session.add(
            AuditLog(
                actor_username="admin",
                actor_name="Administrator",
                action="export",
                entity_type="report",
                description="Export payroll.",
            )
        )
        session.commit()

    response = TestClient(app).get("/dashboard?period=2026-05", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["previous_period"] == "2026-04"
    assert body["status"]["readiness"] == "needs_review"
    assert body["totals"]["billing_patient"] == 250_000
    assert body["totals"]["doctor_fee_transfer"] == 120_000
    assert body["totals"]["payroll_transfer"] == 2_500_000
    assert body["totals"]["review_total"] == 3
    assert body["work_queue"]["treatment_review_count"] == 1
    assert body["work_queue"]["attendance_review_count"] == 1
    assert body["work_queue"]["payroll_review_count"] == 1
    assert body["top_doctors"][0]["doctor_name"] == "Drg. Leni"
    assert body["top_overtime_employees"][0]["employee_name"] == "RIKA"
    assert body["recent_activity"][0]["kind"] == "export"
    assert body["recent_activity"][0]["label"] == "Export payroll."
