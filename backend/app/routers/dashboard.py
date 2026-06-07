from fastapi import APIRouter
from sqlmodel import func, select

from app.dependencies import CurrentUser, SessionDep
from app.models import AttendanceRecord, DoctorPeriodSummary, DoctorTransaction, Employee, ImportFile, PayrollRecord

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(session: SessionDep, _: CurrentUser, period: str | None = None) -> dict:
    doctor_summaries = session.exec(select(DoctorPeriodSummary)).all()
    payroll_records = session.exec(select(PayrollRecord)).all()
    if period:
        doctor_summaries = [row for row in doctor_summaries if row.period == period]
        payroll_records = [row for row in payroll_records if row.period == period]
    imports = session.exec(select(ImportFile).order_by(ImportFile.created_at.desc()).limit(5)).all()
    return {
        "period": period,
        "totals": {
            "doctor_fee": sum(row.transfer_amount for row in doctor_summaries),
            "payroll": sum(row.net_salary for row in payroll_records),
            "employees": session.exec(select(func.count(Employee.id))).one(),
            "doctor_transactions": session.exec(select(func.count(DoctorTransaction.id))).one(),
            "attendance_needs_review": session.exec(select(func.count(AttendanceRecord.id)).where(AttendanceRecord.needs_review == True)).one(),  # noqa: E712
        },
        "recent_imports": imports,
    }
