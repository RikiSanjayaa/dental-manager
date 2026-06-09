from datetime import date, time

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from app.calculations import calculate_attendance_record, calculate_payroll_period
from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.importers import commit_attendance, preview_attendance
from app.models import AttendanceHoliday, AttendanceRecord, AttendanceRule, Employee, PayrollRecord, PeriodStatus
from app.utils import normalize_text, parse_period, parse_time

router = APIRouter(tags=["payroll"])


class AttendanceInput(BaseModel):
    period: str | None = None
    employee_id: int | None = None
    attendance_id_snapshot: str | None = None
    employee_name_snapshot: str
    work_date: date
    timezone1_in: time | None = None
    timezone1_out: time | None = None
    timezone2_in: time | None = None
    timezone2_out: time | None = None
    late_minutes: int = 0
    early_leave_minutes: int = 0
    absent_minutes: int = 0
    total_minutes: int = 0
    overtime_minutes: int = 0
    is_sunday: bool = False
    is_holiday: bool = False
    is_double_shift: bool = False
    status_note: str | None = None
    needs_review: bool = False


def default_attendance_rule(session: SessionDep) -> AttendanceRule:
    rule = session.exec(select(AttendanceRule).where(AttendanceRule.is_default == True)).first()  # noqa: E712
    return rule or AttendanceRule(name="Fallback", is_default=True)


def ensure_payroll_open(session: SessionDep, period: str) -> None:
    locked = session.exec(
        select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.status == PeriodStatus.LOCKED)
    ).first()
    if locked:
        raise HTTPException(status_code=409, detail="Payroll periode ini sudah locked. Absensi tidak bisa diubah.")


def employee_maps(session: SessionDep) -> tuple[dict[str, Employee], dict[str, Employee]]:
    employees = session.exec(select(Employee)).all()
    by_attendance_id = {
        str(employee.attendance_id or employee.id).strip(): employee
        for employee in employees
        if employee.attendance_id or employee.id
    }
    by_name = {normalize_text(employee.name): employee for employee in employees}
    return by_attendance_id, by_name


def enrich_attendance_preview(session: SessionDep, preview: dict) -> dict:
    by_attendance_id, by_name = employee_maps(session)
    rows = []
    review_count = 0
    upsert_count = 0
    rule = default_attendance_rule(session)
    holidays = {
        holiday.holiday_date: holiday.is_holiday
        for holiday in session.exec(select(AttendanceHoliday)).all()
    }
    for item in preview["data"]["attendance"]:
        employee = by_attendance_id.get(str(item.get("attendance_id") or "").strip()) or by_name.get(normalize_text(item.get("employee_name")))
        issues = []
        if not employee:
            issues.append("Karyawan belum ditemukan di master.")
        existing = None
        work_date = date.fromisoformat(item["work_date"])
        if employee:
            existing = session.exec(
                select(AttendanceRecord).where(
                    AttendanceRecord.period == item["period"],
                    AttendanceRecord.employee_id == employee.id,
                    AttendanceRecord.work_date == work_date,
                )
            ).first()
        elif item.get("attendance_id"):
            existing = session.exec(
                select(AttendanceRecord).where(
                    AttendanceRecord.period == item["period"],
                    AttendanceRecord.attendance_id_snapshot == str(item["attendance_id"]),
                    AttendanceRecord.work_date == work_date,
                )
            ).first()
        holiday_override = item.get("holiday_override")
        resolved_holiday = bool(
            holiday_override
            if holiday_override is not None
            else holidays.get(work_date, work_date.weekday() == 6)
        )
        sample = AttendanceRecord(
            period=item["period"],
            employee_id=employee.id if employee else None,
            attendance_id_snapshot=item.get("attendance_id") or (employee.attendance_id or str(employee.id) if employee else None),
            employee_name_snapshot=item["employee_name"],
            work_date=work_date,
            timezone1_in=parse_time(item.get("timezone1_in")),
            timezone1_out=parse_time(item.get("timezone1_out")),
            timezone2_in=parse_time(item.get("timezone2_in")),
            timezone2_out=parse_time(item.get("timezone2_out")),
            is_holiday=resolved_holiday,
            needs_review=employee is None,
        )
        calculate_attendance_record(sample, rule)
        if not employee:
            review_count += 1
        if existing:
            upsert_count += 1
        rows.append(
            {
                **item,
                "employee_id": employee.id if employee else None,
                "employee_name": item["employee_name"],
                "status": "review" if not employee else "update" if existing else "new",
                "issues": issues,
                "late_minutes": sample.late_minutes,
                "early_leave_minutes": sample.early_leave_minutes,
                "absent_minutes": sample.absent_minutes,
                "is_absent": sample.is_absent,
                "is_sunday": sample.is_sunday,
                "is_holiday": sample.is_holiday,
                "total_minutes": sample.total_minutes,
                "overtime_minutes": sample.overtime_minutes,
            }
        )
    preview["rows"] = rows
    preview["summary"] = {
        **preview.get("summary", {}),
        "review": review_count,
        "new": len(rows) - upsert_count,
        "update": upsert_count,
    }
    return preview


@router.post("/attendance/import-preview")
async def attendance_preview(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"attendance-preview-{file.filename}"
    path.write_bytes(await file.read())
    return enrich_attendance_preview(session, preview_attendance(path))


@router.post("/attendance/import")
async def import_attendance(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"{uuid4().hex}{Path(file.filename or 'attendance.xlsx').suffix or '.xlsx'}"
    path.write_bytes(await file.read())
    preview = preview_attendance(path)
    periods = {row["period"] for row in preview["data"]["attendance"]}
    for period in periods:
        ensure_payroll_open(session, period)
    result = commit_attendance(session, preview["data"]["attendance"])
    return {
        "target": "attendance",
        **result,
        "invalid_rows": preview["invalid_rows"],
        "warnings": preview["warnings"][:20],
        "errors": preview["errors"][:20],
    }


@router.get("/attendance-records", response_model=list[AttendanceRecord])
def list_attendance(
    session: SessionDep,
    _: CurrentUser,
    period: str | None = None,
    employee_id: int | None = None,
    review: bool | None = None,
) -> list[AttendanceRecord]:
    rows = session.exec(select(AttendanceRecord)).all()
    rule = default_attendance_rule(session)
    holidays = {
        holiday.holiday_date: holiday.is_holiday
        for holiday in session.exec(select(AttendanceHoliday)).all()
    }
    changed = False
    for row in rows:
        before = (
            row.late_minutes,
            row.early_leave_minutes,
            row.absent_minutes,
            row.is_absent,
            row.total_minutes,
            row.overtime_minutes,
            row.is_sunday,
            row.is_holiday,
            row.is_double_shift,
        )
        if row.work_date in holidays:
            row.is_holiday = holidays[row.work_date]
        calculate_attendance_record(row, rule)
        after = (
            row.late_minutes,
            row.early_leave_minutes,
            row.absent_minutes,
            row.is_absent,
            row.total_minutes,
            row.overtime_minutes,
            row.is_sunday,
            row.is_holiday,
            row.is_double_shift,
        )
        if before != after:
            session.add(row)
            changed = True
    if changed:
        session.commit()
    if period:
        rows = [row for row in rows if row.period == period]
    if employee_id:
        rows = [row for row in rows if row.employee_id == employee_id]
    if review is not None:
        rows = [row for row in rows if row.needs_review == review]
    return rows


@router.post("/attendance-records", response_model=AttendanceRecord)
def create_attendance(payload: AttendanceInput, session: SessionDep, _: CurrentUser) -> AttendanceRecord:
    data = payload.model_dump()
    data["period"] = data.get("period") or parse_period(payload.work_date)
    ensure_payroll_open(session, data["period"])
    employee = session.get(Employee, payload.employee_id) if payload.employee_id else None
    if employee:
        data["attendance_id_snapshot"] = data.get("attendance_id_snapshot") or employee.attendance_id or str(employee.id)
    row = AttendanceRecord(**data)
    calculate_attendance_record(row, default_attendance_rule(session))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/attendance-records/{item_id}", response_model=AttendanceRecord)
def update_attendance(item_id: int, payload: AttendanceInput, session: SessionDep, _: CurrentUser) -> AttendanceRecord:
    row = session.get(AttendanceRecord, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data absensi tidak ditemukan.")
    next_period = payload.period or parse_period(payload.work_date)
    ensure_payroll_open(session, row.period)
    ensure_payroll_open(session, next_period)
    employee = session.get(Employee, payload.employee_id) if payload.employee_id else None
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    row.period = next_period
    if employee:
        row.attendance_id_snapshot = row.attendance_id_snapshot or employee.attendance_id or str(employee.id)
    calculate_attendance_record(row, default_attendance_rule(session))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/attendance-records/{item_id}")
def delete_attendance(item_id: int, session: SessionDep, _: CurrentUser) -> dict[str, str]:
    row = session.get(AttendanceRecord, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data absensi tidak ditemukan.")
    ensure_payroll_open(session, row.period)
    session.delete(row)
    session.commit()
    return {"status": "ok"}


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
