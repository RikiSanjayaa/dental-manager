from datetime import date, datetime, time

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select

from app.audit import record_audit
from app.calculations import calculate_attendance_record, calculate_payroll_period, calculate_payroll_record, effective_base_salary
from app.config import get_settings
from app.dependencies import AdminUser, CurrentUser, SessionDep
from app.importers import commit_attendance, preview_attendance
from app.models import AuditLog, AttendanceHoliday, AttendanceRecord, AttendanceRule, Doctor, DoctorTransaction, Employee, PayrollRecord, PayrollRule, PeriodStatus, User, UserRole
from app.reports import payroll_slip_pdf, payroll_xlsx
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


class PayrollAdjustmentInput(BaseModel):
    bonus: float = 0
    position_allowance: float = 0
    other_deduction: float = 0
    izin_count: float = 0
    sakit_count: float = 0
    cuti_count: float = 0
    alpha_count: float = 0
    payment_method: str | None = None
    bank_name: str | None = None
    account_name: str | None = None
    account_number: str | None = None
    needs_review: bool = False


class AttendanceProtestInput(BaseModel):
    reason: str


def default_attendance_rule(session: SessionDep) -> AttendanceRule:
    rule = session.exec(select(AttendanceRule).where(AttendanceRule.is_default == True)).first()  # noqa: E712
    return rule or AttendanceRule(name="Fallback", is_default=True)


def default_payroll_rule(session: SessionDep) -> PayrollRule:
    rule = session.exec(select(PayrollRule).where(PayrollRule.is_default == True)).first()  # noqa: E712
    return rule or PayrollRule(name="Fallback", is_default=True)


def operator_employee(session: SessionDep, user: User) -> Employee:
    if not user.employee_id:
        raise HTTPException(status_code=409, detail="Akun operator belum terhubung ke master data karyawan.")
    employee = session.get(Employee, user.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Master data karyawan operator tidak ditemukan.")
    return employee


def operator_payroll_payload(session: SessionDep, period: str, user: User) -> dict:
    employee = operator_employee(session, user)
    overview = payroll_overview_payload(session, period)
    summary = next((item for item in overview["summaries"] if item["employee_id"] == employee.id), None)
    attendance_rows = session.exec(
        select(AttendanceRecord).where(AttendanceRecord.period == period, AttendanceRecord.employee_id == employee.id)
    ).all()
    overtime_rows = [row for row in attendance_rows if row.overtime_minutes > 0]
    treatment_rows = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period)).all()
    recent_treatments = session.exec(
        select(DoctorTransaction).where(DoctorTransaction.period == period).order_by(DoctorTransaction.transaction_date.desc(), DoctorTransaction.id.desc()).limit(5)
    ).all()
    doctors = {row.id: row for row in session.exec(select(Doctor)).all()}
    audit_rows = session.exec(
        select(AuditLog).where(AuditLog.actor_id == user.id).order_by(AuditLog.created_at.desc()).limit(5)
    ).all()
    return {
        "period": period,
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "position": employee.position,
            "attendance_id": employee.attendance_id,
            "bank_name": employee.bank_name,
            "account_name": employee.account_name,
            "account_number": employee.account_number,
        },
        "payroll": summary,
        "attendance_count": len(attendance_rows),
        "attendance_review_count": sum(1 for row in attendance_rows if row.needs_review),
        "protest_count": sum(1 for row in attendance_rows if row.protest_note),
        "overtime_count": len(overtime_rows),
        "overtime_minutes": sum(row.overtime_minutes for row in overtime_rows),
        "treatment_count": len(treatment_rows),
        "treatment_review_count": sum(1 for row in treatment_rows if row.needs_review),
        "recent_treatments": [
            {
                "id": row.id,
                "transaction_date": row.transaction_date,
                "doctor_name": doctors.get(row.doctor_id).name if doctors.get(row.doctor_id) else f"Dokter #{row.doctor_id}",
                "patient_name": row.patient_name,
                "treatment_name": row.treatment_name_snapshot,
                "total_bill_amount": row.total_bill_amount,
                "needs_review": row.needs_review,
            }
            for row in recent_treatments
        ],
        "recent_audit_logs": [
            {
                "id": row.id,
                "action": row.action,
                "entity_type": row.entity_type,
                "description": row.description,
                "created_at": row.created_at,
            }
            for row in audit_rows
        ],
        "recent_attendance": sorted(attendance_rows, key=lambda row: (row.work_date, row.id or 0), reverse=True)[:5],
        "overtime_rows": sorted(overtime_rows, key=lambda row: (row.work_date, row.id or 0)),
    }


def payroll_status(rows: list[PayrollRecord], attendance_count: int) -> str:
    if not rows and not attendance_count:
        return "empty"
    if not rows:
        return "not_calculated"
    if all(row.status == PeriodStatus.LOCKED for row in rows):
        return "locked"
    return "draft"


def payroll_gross(row: PayrollRecord) -> float:
    return row.base_salary + row.double_shift_fee + row.sunday_fee + row.overtime_total + row.bonus + row.position_allowance


def payroll_deduction(row: PayrollRecord) -> float:
    return row.bpjs_deduction + row.other_deduction + row.pph21


def payroll_overview_payload(session: SessionDep, period: str) -> dict:
    rows = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    attendance_rows = session.exec(select(AttendanceRecord).where(AttendanceRecord.period == period)).all()
    attendance_review_count = sum(1 for row in attendance_rows if row.needs_review)
    active_employees = session.exec(select(Employee).where(Employee.is_active == True)).all()  # noqa: E712
    rows_by_employee = {row.employee_id: row for row in rows}
    payroll_rule = default_payroll_rule(session)
    summaries = []
    for employee in sorted(active_employees, key=lambda item: item.name.casefold()):
        row = rows_by_employee.get(employee.id or 0)
        if not row:
            summaries.append(
                {
                    "id": None,
                    "employee_id": employee.id,
                    "employee_name": employee.name,
                    "position": employee.position,
                    "join_date": employee.join_date.isoformat() if employee.join_date else None,
                    "base_salary": effective_base_salary(employee, payroll_rule),
                    "working_days": employee.working_days,
                    "is_training": employee.is_training,
                    "double_shift_count": 0,
                    "sunday_count": 0,
                    "izin_count": 0,
                    "sakit_count": 0,
                    "cuti_count": 0,
                    "alpha_count": 0,
                    "double_shift_fee": 0,
                    "sunday_fee": 0,
                    "overtime_minutes": 0,
                    "overtime_rate_per_minute": payroll_rule.overtime_rate_per_minute,
                    "overtime_total": 0,
                    "bonus": 0,
                    "position_allowance": 0,
                    "gross_salary": effective_base_salary(employee, payroll_rule),
                    "bpjs_deduction": 0,
                    "other_deduction": 0,
                    "pph21": 0,
                    "total_deduction": 0,
                    "net_salary": 0,
                    "payment_method": "Transfer",
                    "bank_name": employee.bank_name,
                    "account_name": employee.account_name or employee.name,
                    "account_number": employee.account_number,
                    "needs_review": False,
                    "status": "not_calculated",
                    "calculated_at": None,
                }
            )
            continue
        summaries.append(
            {
                "id": row.id,
                "employee_id": row.employee_id,
                "employee_name": employee.name,
                "position": employee.position,
                "join_date": employee.join_date.isoformat() if employee.join_date else None,
                "is_training": employee.is_training,
                "base_salary": row.base_salary,
                "working_days": row.working_days,
                "double_shift_count": row.double_shift_count,
                "sunday_count": row.sunday_count,
                "izin_count": row.izin_count,
                "sakit_count": row.sakit_count,
                "cuti_count": row.cuti_count,
                "alpha_count": row.alpha_count,
                "double_shift_fee": row.double_shift_fee,
                "sunday_fee": row.sunday_fee,
                "overtime_minutes": row.overtime_minutes,
                "overtime_rate_per_minute": row.overtime_rate_per_minute,
                "overtime_total": row.overtime_total,
                "bonus": row.bonus,
                "position_allowance": row.position_allowance,
                "gross_salary": payroll_gross(row),
                "bpjs_deduction": row.bpjs_deduction,
                "other_deduction": row.other_deduction,
                "pph21": row.pph21,
                "total_deduction": payroll_deduction(row),
                "net_salary": row.net_salary,
                "payment_method": row.payment_method,
                "bank_name": row.bank_name,
                "account_name": row.account_name,
                "account_number": row.account_number,
                "needs_review": row.needs_review,
                "status": row.status,
                "calculated_at": row.calculated_at,
            }
        )
    return {
        "period": period,
        "status": payroll_status(rows, len(attendance_rows)),
        "employee_count": len(summaries),
        "attendance_count": len(attendance_rows),
        "attendance_review_count": attendance_review_count,
        "payroll_review_count": sum(1 for row in rows if row.needs_review),
        "overtime_record_count": sum(1 for row in attendance_rows if row.overtime_minutes > 0),
        "total_base_salary": sum(row.base_salary for row in rows),
        "total_gross_salary": sum(payroll_gross(row) for row in rows),
        "total_overtime_minutes": sum(row.overtime_minutes for row in rows),
        "total_overtime": sum(row.overtime_total for row in rows),
        "total_deduction": sum(payroll_deduction(row) for row in rows),
        "total_net_salary": sum(row.net_salary for row in rows),
        "summaries": summaries,
    }


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
async def attendance_preview(session: SessionDep, _: AdminUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"attendance-preview-{file.filename}"
    path.write_bytes(await file.read())
    return enrich_attendance_preview(session, preview_attendance(path))


@router.post("/attendance/import")
async def import_attendance(session: SessionDep, admin: AdminUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"{uuid4().hex}{Path(file.filename or 'attendance.xlsx').suffix or '.xlsx'}"
    path.write_bytes(await file.read())
    preview = preview_attendance(path)
    periods = {row["period"] for row in preview["data"]["attendance"]}
    for period in periods:
        ensure_payroll_open(session, period)
    result = commit_attendance(session, preview["data"]["attendance"])
    record_audit(
        session,
        admin,
        "import",
        "attendance_record",
        "Import data absensi.",
        metadata={"filename": file.filename, "created": result.get("created", 0), "updated": result.get("updated", 0)},
    )
    session.commit()
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
    user: CurrentUser,
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
    if user.role == UserRole.OPERATOR:
        employee = operator_employee(session, user)
        rows = [row for row in rows if row.employee_id == employee.id]
        employee_id = None
    if employee_id:
        rows = [row for row in rows if row.employee_id == employee_id]
    if review is not None:
        rows = [row for row in rows if row.needs_review == review]
    return rows


@router.post("/attendance-records/{item_id}/protest", response_model=AttendanceRecord)
def protest_attendance(item_id: int, payload: AttendanceProtestInput, session: SessionDep, user: CurrentUser) -> AttendanceRecord:
    reason = payload.reason.strip()
    if len(reason) < 5:
        raise HTTPException(status_code=422, detail="Alasan protes minimal 5 karakter.")
    row = session.get(AttendanceRecord, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data absensi tidak ditemukan.")
    if user.role == UserRole.OPERATOR:
        employee = operator_employee(session, user)
        if row.employee_id != employee.id:
            raise HTTPException(status_code=403, detail="Operator hanya bisa memprotes absensi sendiri.")
    row.needs_review = True
    row.protest_note = reason
    row.protest_by_user_id = user.id
    row.protest_by_name = user.full_name
    row.protested_at = datetime.utcnow()
    session.add(row)
    record_audit(
        session,
        user,
        "protest",
        "attendance_record",
        f"Protes absensi {row.employee_name_snapshot}.",
        entity_id=row.id,
        metadata={"period": row.period, "work_date": row.work_date.isoformat(), "reason": reason},
    )
    session.commit()
    session.refresh(row)
    return row


@router.post("/attendance-records", response_model=AttendanceRecord)
def create_attendance(payload: AttendanceInput, session: SessionDep, admin: AdminUser) -> AttendanceRecord:
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
    record_audit(
        session,
        admin,
        "create",
        "attendance_record",
        f"Menambahkan absensi {row.employee_name_snapshot}.",
        entity_id=row.id,
        metadata={"period": row.period, "work_date": row.work_date.isoformat()},
    )
    session.commit()
    session.refresh(row)
    return row


@router.patch("/attendance-records/{item_id}", response_model=AttendanceRecord)
def update_attendance(item_id: int, payload: AttendanceInput, session: SessionDep, admin: AdminUser) -> AttendanceRecord:
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
    record_audit(
        session,
        admin,
        "update",
        "attendance_record",
        f"Memperbarui absensi {row.employee_name_snapshot}.",
        entity_id=row.id,
        metadata={"period": row.period, "work_date": row.work_date.isoformat()},
    )
    session.commit()
    session.refresh(row)
    return row


@router.delete("/attendance-records/{item_id}")
def delete_attendance(item_id: int, session: SessionDep, admin: AdminUser) -> dict[str, str]:
    row = session.get(AttendanceRecord, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data absensi tidak ditemukan.")
    ensure_payroll_open(session, row.period)
    metadata = {"period": row.period, "employee_name": row.employee_name_snapshot, "work_date": row.work_date.isoformat()}
    session.delete(row)
    record_audit(
        session,
        admin,
        "delete",
        "attendance_record",
        f"Menghapus absensi {metadata['employee_name']}.",
        entity_id=item_id,
        metadata=metadata,
    )
    session.commit()
    return {"status": "ok"}


@router.post("/payroll-periods/{period}/calculate", response_model=list[PayrollRecord])
def calculate_period(period: str, session: SessionDep, admin: AdminUser) -> list[PayrollRecord]:
    ensure_payroll_open(session, period)
    rows = calculate_payroll_period(session, period)
    record_audit(
        session,
        admin,
        "calculate",
        "payroll_period",
        f"Menghitung ulang payroll periode {period}.",
        entity_id=period,
        metadata={"record_count": len(rows)},
    )
    session.commit()
    for row in rows:
        session.refresh(row)
    return rows


@router.get("/payroll-periods/{period}/summary", response_model=list[PayrollRecord])
def payroll_summary(period: str, session: SessionDep, _: AdminUser) -> list[PayrollRecord]:
    return session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()


@router.get("/payroll-periods/{period}/overview")
def payroll_overview(period: str, session: SessionDep, _: AdminUser) -> dict:
    return payroll_overview_payload(session, period)


@router.get("/me/dashboard")
def operator_dashboard(period: str, session: SessionDep, user: CurrentUser) -> dict:
    return operator_payroll_payload(session, period, user)


@router.get("/me/payroll/{period}")
def my_payroll(period: str, session: SessionDep, user: CurrentUser) -> dict:
    return operator_payroll_payload(session, period, user)


@router.get("/me/payroll/{period}/export")
def export_my_payroll(period: str, format: str, session: SessionDep, user: CurrentUser) -> StreamingResponse:
    employee = operator_employee(session, user)
    normalized = format.lower()
    if normalized == "xlsx":
        stream = payroll_xlsx(session, period, employee_id=employee.id)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"payroll-saya-{period}.xlsx"
    elif normalized == "pdf":
        stream = payroll_slip_pdf(session, period, employee.id or 0)
        media_type = "application/pdf"
        filename = f"slip-gaji-{period}-{employee.id}.pdf"
    else:
        raise HTTPException(status_code=400, detail="Format payroll pribadi mendukung xlsx atau pdf.")
    record_audit(
        session,
        user,
        "export",
        "payroll_record",
        f"Download payroll pribadi periode {period}.",
        entity_id=period,
        metadata={"format": normalized, "employee_id": employee.id},
    )
    session.commit()
    return StreamingResponse(
        stream,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payroll-periods/{period}/overtime", response_model=list[AttendanceRecord])
def payroll_overtime(period: str, session: SessionDep, _: AdminUser, employee_id: int | None = None) -> list[AttendanceRecord]:
    statement = select(AttendanceRecord).where(AttendanceRecord.period == period, AttendanceRecord.overtime_minutes > 0)
    if employee_id:
        statement = statement.where(AttendanceRecord.employee_id == employee_id)
    rows = session.exec(statement).all()
    return sorted(rows, key=lambda item: (item.work_date, item.employee_name_snapshot.casefold(), item.id or 0))


@router.get("/payroll-periods/{period}/slips/{employee_id}", response_model=PayrollRecord | None)
def payroll_slip(period: str, employee_id: int, session: SessionDep, _: AdminUser) -> PayrollRecord | None:
    return session.exec(select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.employee_id == employee_id)).first()


@router.patch("/payroll-records/{item_id}", response_model=PayrollRecord)
def update_payroll_record(item_id: int, payload: PayrollAdjustmentInput, session: SessionDep, admin: AdminUser) -> PayrollRecord:
    row = session.get(PayrollRecord, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data payroll tidak ditemukan.")
    ensure_payroll_open(session, row.period)
    employee = session.get(Employee, row.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan payroll tidak ditemukan.")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    row.pph21 = 0
    row.bpjs_deduction = 0
    row.net_salary = 0
    attendance_rows = session.exec(
        select(AttendanceRecord).where(AttendanceRecord.period == row.period, AttendanceRecord.employee_id == row.employee_id)
    ).all()
    calculate_payroll_record(row, employee, default_payroll_rule(session), attendance_rows)
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit(
        session,
        admin,
        "update",
        "payroll_record",
        f"Memperbarui adjustment payroll karyawan #{row.employee_id}.",
        entity_id=row.id,
        metadata={"period": row.period, "employee_id": row.employee_id, "net_salary": row.net_salary},
    )
    session.commit()
    session.refresh(row)
    return row


@router.post("/payroll-periods/{period}/lock", response_model=list[PayrollRecord])
def lock_period(period: str, session: SessionDep, admin: AdminUser) -> list[PayrollRecord]:
    rows = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    if not rows:
        raise HTTPException(status_code=409, detail="Payroll belum dihitung.")
    attendance_review = session.exec(
        select(AttendanceRecord).where(AttendanceRecord.period == period, AttendanceRecord.needs_review == True)  # noqa: E712
    ).first()
    payroll_review = session.exec(
        select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.needs_review == True)  # noqa: E712
    ).first()
    if attendance_review or payroll_review:
        raise HTTPException(status_code=409, detail="Masih ada data absensi/payroll yang perlu review.")
    for row in rows:
        row.status = PeriodStatus.LOCKED
        session.add(row)
    record_audit(
        session,
        admin,
        "lock",
        "payroll_period",
        f"Mengunci payroll periode {period}.",
        entity_id=period,
        metadata={"record_count": len(rows)},
    )
    session.commit()
    for row in rows:
        session.refresh(row)
    return rows


class UnlockRequest(BaseModel):
    password: str


@router.post("/payroll-periods/{period}/unlock", response_model=list[PayrollRecord])
def unlock_period(period: str, payload: UnlockRequest, session: SessionDep, admin: AdminUser) -> list[PayrollRecord]:
    from app.security import verify_password

    if not verify_password(payload.password, admin.hashed_password):
        raise HTTPException(status_code=403, detail="Password salah. Unlock ditolak.")
    rows = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Tidak ada data payroll untuk periode ini.")
    locked_rows = [row for row in rows if row.status == PeriodStatus.LOCKED]
    if not locked_rows:
        raise HTTPException(status_code=409, detail="Periode payroll ini belum dikunci.")
    for row in rows:
        row.status = PeriodStatus.DRAFT
        session.add(row)
    record_audit(
        session,
        admin,
        "unlock",
        "payroll_period",
        f"Membuka kunci payroll periode {period}.",
        entity_id=period,
        metadata={"record_count": len(rows)},
    )
    session.commit()
    for row in rows:
        session.refresh(row)
    return rows
