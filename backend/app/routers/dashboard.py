from datetime import datetime
from itertools import groupby

from fastapi import APIRouter
from sqlmodel import func, select

from app.dependencies import CurrentUser, SessionDep
from app.models import (
    AttendanceRecord,
    Doctor,
    DoctorPeriodSummary,
    DoctorTransaction,
    Employee,
    ImportFile,
    PayrollRecord,
    PeriodStatus,
    ReportArchive,
)

router = APIRouter(tags=["dashboard"])


def previous_period(period: str) -> str:
    year, month = [int(part) for part in period.split("-")]
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def period_status(rows: list, has_source_rows: bool) -> str:
    if rows and all(row.status == PeriodStatus.LOCKED for row in rows):
        return "locked"
    if rows:
        return "draft"
    if has_source_rows:
        return "not_calculated"
    return "empty"


def totals_for_period(session: SessionDep, period: str) -> dict:
    doctor_summaries = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    payroll_records = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    transactions = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period)).all()
    attendance = session.exec(select(AttendanceRecord).where(AttendanceRecord.period == period)).all()
    treatment_review = sum(1 for row in transactions if row.needs_review)
    attendance_review = sum(1 for row in attendance if row.needs_review)
    payroll_review = sum(1 for row in payroll_records if row.needs_review)
    return {
        "billing_patient": sum(row.total_bill_amount for row in transactions),
        "doctor_fee_transfer": sum(row.transfer_amount for row in doctor_summaries),
        "payroll_transfer": sum(row.net_salary for row in payroll_records),
        "review_total": treatment_review + attendance_review + payroll_review,
        "doctor_transactions": len(transactions),
        "attendance_records": len(attendance),
        "active_employees": session.exec(select(func.count(Employee.id)).where(Employee.is_active == True)).one(),  # noqa: E712
        "overtime_records": sum(1 for row in attendance if row.overtime_minutes > 0),
        "doctor_fee_status": period_status(doctor_summaries, bool(transactions)),
        "payroll_status": period_status(payroll_records, bool(attendance)),
        "treatment_review_count": treatment_review,
        "attendance_review_count": attendance_review,
        "payroll_review_count": payroll_review,
    }


def readiness_status(totals: dict) -> str:
    if totals["review_total"]:
        return "needs_review"
    if totals["doctor_fee_status"] == "locked" and totals["payroll_status"] == "locked":
        return "final"
    if "not_calculated" in {totals["doctor_fee_status"], totals["payroll_status"]}:
        return "not_calculated"
    return "ready"


def top_doctors(session: SessionDep, period: str) -> list[dict]:
    transactions = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period)).all()
    summaries = {
        row.doctor_id: row
        for row in session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    }
    doctors = {row.id: row for row in session.exec(select(Doctor)).all()}
    grouped_rows: list[dict] = []
    for doctor_id, rows_iter in groupby(sorted(transactions, key=lambda row: row.doctor_id), key=lambda row: row.doctor_id):
        rows = list(rows_iter)
        summary = summaries.get(doctor_id)
        doctor = doctors.get(doctor_id)
        grouped_rows.append(
            {
                "doctor_id": doctor_id,
                "doctor_name": doctor.name if doctor else f"Dokter #{doctor_id}",
                "transaction_count": len(rows),
                "total_bill": sum(row.total_bill_amount for row in rows),
                "transfer_amount": summary.transfer_amount if summary else 0,
                "status": summary.status.value if summary else "not_calculated",
            }
        )
    return sorted(grouped_rows, key=lambda row: row["total_bill"], reverse=True)[:5]


def top_overtime_employees(session: SessionDep, period: str) -> list[dict]:
    attendance_rows = session.exec(
        select(AttendanceRecord).where(AttendanceRecord.period == period, AttendanceRecord.overtime_minutes > 0)
    ).all()
    payroll_rows = {
        row.employee_id: row
        for row in session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    }
    grouped_rows: list[dict] = []
    sorted_rows = sorted(attendance_rows, key=lambda row: (row.employee_id or 0, row.employee_name_snapshot.casefold()))
    for key, rows_iter in groupby(sorted_rows, key=lambda row: row.employee_id or row.employee_name_snapshot):
        rows = list(rows_iter)
        first = rows[0]
        payroll = payroll_rows.get(first.employee_id or 0)
        grouped_rows.append(
            {
                "employee_id": first.employee_id,
                "employee_name": first.employee_name_snapshot,
                "overtime_minutes": sum(row.overtime_minutes for row in rows),
                "overtime_total": payroll.overtime_total if payroll else 0,
                "status": payroll.status.value if payroll else "not_calculated",
            }
        )
    return sorted(grouped_rows, key=lambda row: row["overtime_minutes"], reverse=True)[:5]


def recent_activity(session: SessionDep) -> list[dict]:
    imports = session.exec(select(ImportFile).order_by(ImportFile.created_at.desc()).limit(6)).all()
    reports = session.exec(select(ReportArchive).order_by(ReportArchive.created_at.desc()).limit(6)).all()
    activity = [
        {
            "id": f"import-{row.id}",
            "kind": "import",
            "label": row.original_filename,
            "category": row.kind.value,
            "status": row.status.value,
            "format": "xlsx",
            "created_at": row.created_at,
        }
        for row in imports
    ]
    activity += [
        {
            "id": f"report-{row.id}",
            "kind": "export",
            "label": row.filename,
            "category": row.report_type,
            "status": row.status,
            "format": row.format,
            "created_at": row.created_at,
        }
        for row in reports
    ]
    return sorted(activity, key=lambda row: row["created_at"], reverse=True)[:8]


@router.get("/dashboard")
def dashboard(session: SessionDep, _: CurrentUser, period: str | None = None) -> dict:
    active_period = period or datetime.utcnow().strftime("%Y-%m")
    previous = previous_period(active_period)
    totals = totals_for_period(session, active_period)
    previous_totals = totals_for_period(session, previous)
    return {
        "period": active_period,
        "previous_period": previous,
        "totals": totals,
        "previous_totals": previous_totals,
        "status": {
            "readiness": readiness_status(totals),
            "doctor_fee": totals["doctor_fee_status"],
            "payroll": totals["payroll_status"],
        },
        "work_queue": {
            "treatment_review_count": totals["treatment_review_count"],
            "attendance_review_count": totals["attendance_review_count"],
            "payroll_review_count": totals["payroll_review_count"],
        },
        "top_doctors": top_doctors(session, active_period),
        "top_overtime_employees": top_overtime_employees(session, active_period),
        "recent_activity": recent_activity(session),
    }
