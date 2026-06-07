from datetime import date, time

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from app.calculations import calculate_payroll_period
from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.importers import commit_attendance, preview_attendance
from app.models import AttendanceRecord, PayrollRecord, PeriodStatus

router = APIRouter(tags=["payroll"])


class AttendanceInput(BaseModel):
    period: str
    employee_id: int | None = None
    employee_name_snapshot: str
    work_date: date
    timezone1_in: time | None = None
    timezone1_out: time | None = None
    timezone2_in: time | None = None
    timezone2_out: time | None = None
    late_minutes: int = 0
    early_leave_minutes: int = 0
    absent_minutes: int = 0
    overtime_minutes: int = 0
    is_sunday: bool = False
    is_double_shift: bool = False
    status_note: str | None = None
    needs_review: bool = False


@router.post("/attendance/import-preview")
async def attendance_preview(_: CurrentUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"attendance-preview-{file.filename}"
    path.write_bytes(await file.read())
    return preview_attendance(path)


@router.post("/attendance/import")
async def import_attendance(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"{uuid4().hex}{Path(file.filename or 'attendance.xlsx').suffix or '.xlsx'}"
    path.write_bytes(await file.read())
    preview = preview_attendance(path)
    result = commit_attendance(session, preview["data"]["attendance"])
    return {
        "target": "attendance",
        **result,
        "invalid_rows": preview["invalid_rows"],
        "warnings": preview["warnings"][:20],
        "errors": preview["errors"][:20],
    }


@router.get("/attendance-records", response_model=list[AttendanceRecord])
def list_attendance(session: SessionDep, _: CurrentUser, period: str | None = None) -> list[AttendanceRecord]:
    rows = session.exec(select(AttendanceRecord)).all()
    if period:
        rows = [row for row in rows if row.period == period]
    return rows


@router.post("/attendance-records", response_model=AttendanceRecord)
def create_attendance(payload: AttendanceInput, session: SessionDep, _: CurrentUser) -> AttendanceRecord:
    row = AttendanceRecord(**payload.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/attendance-records/{item_id}", response_model=AttendanceRecord)
def update_attendance(item_id: int, payload: AttendanceInput, session: SessionDep, _: CurrentUser) -> AttendanceRecord:
    row = session.get(AttendanceRecord, item_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/payroll-periods/{period}/calculate", response_model=list[PayrollRecord])
def calculate_period(period: str, session: SessionDep, _: CurrentUser) -> list[PayrollRecord]:
    return calculate_payroll_period(session, period)


@router.get("/payroll-periods/{period}/summary", response_model=list[PayrollRecord])
def payroll_summary(period: str, session: SessionDep, _: CurrentUser) -> list[PayrollRecord]:
    return session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()


@router.get("/payroll-periods/{period}/slips/{employee_id}", response_model=PayrollRecord | None)
def payroll_slip(period: str, employee_id: int, session: SessionDep, _: CurrentUser) -> PayrollRecord | None:
    return session.exec(select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.employee_id == employee_id)).first()


@router.post("/payroll-periods/{period}/lock", response_model=list[PayrollRecord])
def lock_period(period: str, session: SessionDep, _: CurrentUser) -> list[PayrollRecord]:
    rows = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    for row in rows:
        row.status = PeriodStatus.LOCKED
        session.add(row)
    session.commit()
    return rows
