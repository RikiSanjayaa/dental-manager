from datetime import datetime, time

from sqlmodel import Session, delete, select

from app.models import (
    AttendanceRecord,
    AttendanceRule,
    Doctor,
    DoctorFeeRule,
    DoctorPeriodSummary,
    DoctorTransaction,
    Employee,
    PayrollRecord,
    PayrollRule,
    PeriodStatus,
    Treatment,
)
from app.utils import round_money


def minutes_of_day(value: time | None) -> int | None:
    if value is None:
        return None
    return value.hour * 60 + value.minute


def positive_diff(later: time | None, earlier: time | None) -> int:
    later_minutes = minutes_of_day(later)
    earlier_minutes = minutes_of_day(earlier)
    if later_minutes is None or earlier_minutes is None:
        return 0
    return max(later_minutes - earlier_minutes, 0)


def shift_penalty(
    actual_in: time | None,
    actual_out: time | None,
    scheduled_in: time,
    scheduled_out: time,
) -> tuple[int, int, int]:
    if actual_in is None and actual_out is None:
        return 0, 0, 0
    late = positive_diff(actual_in, scheduled_in)
    early = positive_diff(scheduled_out, actual_out)
    return late, early, 0


def shift_overtime(actual_out: time | None, scheduled_out: time, min_minutes: int, max_minutes: int) -> int:
    minutes = positive_diff(actual_out, scheduled_out)
    return min(minutes, max(max_minutes, 0)) if minutes > max(min_minutes, 0) else 0


def shift_duration(actual_in: time | None, actual_out: time | None) -> int:
    return positive_diff(actual_out, actual_in)


def attended_double_shift(record: AttendanceRecord, rule: AttendanceRule) -> bool:
    total_duration = shift_duration(record.timezone1_in, record.timezone1_out) + shift_duration(record.timezone2_in, record.timezone2_out)
    timezone2_out = minutes_of_day(record.timezone2_out)
    timezone2_double_shift_window = minutes_of_day(rule.timezone2_end)
    reaches_timezone2_end_window = (
        timezone2_out is not None
        and timezone2_double_shift_window is not None
        and timezone2_out >= timezone2_double_shift_window - 60
    )
    has_both_shift_logs = bool(record.timezone1_in or record.timezone1_out) and bool(record.timezone2_in or record.timezone2_out)
    return total_duration >= 360 or reaches_timezone2_end_window or has_both_shift_logs


def calculate_attendance_record(record: AttendanceRecord, rule: AttendanceRule) -> AttendanceRecord:
    has_any_time = any(
        [record.timezone1_in, record.timezone1_out, record.timezone2_in, record.timezone2_out]
    )
    is_sunday = record.work_date.weekday() == 6
    is_day_off = record.is_holiday
    if not has_any_time:
        record.late_minutes = 0
        record.early_leave_minutes = 0
        record.absent_minutes = 0 if is_day_off else positive_diff(rule.timezone1_end, rule.timezone1_start)
        record.is_absent = not is_day_off
        record.total_minutes = 0
        record.overtime_minutes = 0
        record.is_sunday = is_sunday
        record.is_double_shift = False
        return record

    if is_day_off:
        record.late_minutes = 0
        record.early_leave_minutes = 0
        record.absent_minutes = 0
        record.is_absent = False
        record.total_minutes = 0
        record.overtime_minutes = 0
        record.is_sunday = is_sunday
        record.is_double_shift = attended_double_shift(record, rule)
        return record

    late1, early1, absent1 = shift_penalty(
        record.timezone1_in,
        record.timezone1_out,
        rule.timezone1_start,
        rule.timezone1_end,
    )
    late2, early2, absent2 = shift_penalty(
        record.timezone2_in,
        record.timezone2_out,
        rule.timezone2_start,
        rule.timezone2_end,
    )
    record.late_minutes = late1 + late2
    record.early_leave_minutes = early1 + early2
    record.absent_minutes = absent1 + absent2
    record.is_absent = False
    record.total_minutes = record.late_minutes + record.early_leave_minutes
    record.overtime_minutes = min(
        shift_overtime(record.timezone1_out, rule.timezone1_end, rule.overtime_min_minutes, rule.overtime_max_minutes)
        + shift_overtime(record.timezone2_out, rule.timezone2_end, rule.overtime_min_minutes, rule.overtime_max_minutes),
        rule.overtime_max_minutes,
    )
    record.is_sunday = is_sunday
    record.is_double_shift = attended_double_shift(record, rule)
    return record


def calculate_doctor_transaction(
    transaction: DoctorTransaction,
    treatment: Treatment | None,
    doctor: Doctor,
    default_rule: DoctorFeeRule,
) -> DoctorTransaction:
    bhp = transaction.bhp_override if transaction.bhp_override is not None else (treatment.bhp_cost if treatment else 0)
    price = transaction.price_override if transaction.price_override is not None else (treatment.treatment_price if treatment else 0)
    rate = transaction.fee_rate if transaction.fee_rate is not None else doctor.normal_fee_rate or default_rule.normal_fee_rate

    service_amount = (price * transaction.qty) - (bhp * transaction.qty) - transaction.discount_amount
    doctor_fee = transaction.special_fee_amount if transaction.special_fee_amount else service_amount * rate
    total_bill = (price * transaction.qty) - transaction.discount_amount

    transaction.service_amount = round_money(service_amount)
    transaction.doctor_fee_amount = round_money(doctor_fee)
    transaction.total_bill_amount = round_money(total_bill)
    return transaction


def calculate_doctor_period(session: Session, period: str) -> list[DoctorPeriodSummary]:
    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    default_rule = default_rule or DoctorFeeRule(name="Fallback", is_default=True)

    transactions = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period)).all()
    by_doctor: dict[int, list[DoctorTransaction]] = {}
    for trx in transactions:
        doctor = session.get(Doctor, trx.doctor_id)
        treatment = session.get(Treatment, trx.treatment_id) if trx.treatment_id else None
        if doctor:
            calculate_doctor_transaction(trx, treatment, doctor, default_rule)
            session.add(trx)
            by_doctor.setdefault(trx.doctor_id, []).append(trx)

    session.exec(delete(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period))
    summaries: list[DoctorPeriodSummary] = []
    for doctor_id, rows in by_doctor.items():
        doctor = session.get(Doctor, doctor_id)
        tax_rate = doctor.tax_rate if doctor else default_rule.tax_rate
        treatment_fee = sum(row.doctor_fee_amount for row in rows if not row.special_fee_amount)
        ortho_fee = sum(row.special_fee_amount for row in rows)
        total_bill = sum(row.total_bill_amount for row in rows)
        total_fee = treatment_fee + ortho_fee
        deduction = default_rule.default_deduction
        tax = total_fee * tax_rate
        summary = DoctorPeriodSummary(
            period=period,
            doctor_id=doctor_id,
            status=PeriodStatus.DRAFT,
            treatment_fee_total=round_money(treatment_fee),
            ortho_fee_total=round_money(ortho_fee),
            total_fee=round_money(total_fee),
            total_bill=round_money(total_bill),
            deduction=round_money(deduction),
            tax=round_money(tax),
            transfer_amount=round_money(total_fee - deduction - tax),
            calculated_at=datetime.utcnow(),
        )
        session.add(summary)
        summaries.append(summary)
    session.commit()
    return summaries


def calculate_payroll_record(
    record: PayrollRecord,
    employee: Employee,
    rule: PayrollRule,
    attendance_rows: list[AttendanceRecord],
) -> PayrollRecord:
    record.base_salary = effective_base_salary(employee, rule)
    record.working_days = employee.working_days or 25
    record.overtime_rate_per_minute = rule.overtime_rate_per_minute

    auto_overtime = sum(row.overtime_minutes for row in attendance_rows)
    auto_sunday = sum(
        1
        for row in attendance_rows
        if row.is_holiday
        and any([row.timezone1_in, row.timezone1_out, row.timezone2_in, row.timezone2_out])
    )
    auto_double = sum(1 for row in attendance_rows if row.is_double_shift)
    record.overtime_minutes = auto_overtime
    record.auto_sunday_count = auto_sunday
    record.auto_double_shift_count = auto_double
    record.sunday_count = record.sunday_count_override if record.sunday_count_override is not None else auto_sunday
    record.double_shift_count = record.double_shift_count_override if record.double_shift_count_override is not None else auto_double

    allowance_rate = rule.holiday_double_shift_fee or 90_000
    record.double_shift_fee = round_money(record.double_shift_count * allowance_rate)
    record.sunday_fee = round_money(record.sunday_count * allowance_rate)
    record.overtime_total = round_money(record.overtime_minutes * record.overtime_rate_per_minute)
    record.bpjs_deduction = round_money(record.base_salary * rule.bpjs_jht_rate)

    gross = (
        record.base_salary
        + record.double_shift_fee
        + record.sunday_fee
        + record.overtime_total
        + record.bonus
        + record.position_allowance
    )
    record.pph21 = round_money((gross * rule.pph21_rate) if gross > rule.pph21_threshold else 0)
    record.net_salary = round_money(gross - record.bpjs_deduction - record.other_deduction - record.pph21)
    record.bank_name = record.bank_name or employee.bank_name
    record.account_name = record.account_name or employee.account_name or employee.name
    record.account_number = record.account_number or employee.account_number
    record.calculated_at = datetime.utcnow()
    return record


def effective_base_salary(employee: Employee, rule: PayrollRule) -> float:
    base_salary = employee.base_salary or rule.default_base_salary or 0
    if employee.is_training:
        return round_money(base_salary * 0.8)
    return base_salary


def calculate_payroll_period(session: Session, period: str) -> list[PayrollRecord]:
    rule = session.exec(select(PayrollRule).where(PayrollRule.is_default == True)).first()  # noqa: E712
    rule = rule or PayrollRule(name="Fallback", is_default=True)
    employees = session.exec(select(Employee).where(Employee.is_active == True)).all()  # noqa: E712
    records: list[PayrollRecord] = []

    for employee in employees:
        attendance_rows = session.exec(
            select(AttendanceRecord).where(AttendanceRecord.period == period, AttendanceRecord.employee_id == employee.id)
        ).all()
        record = session.exec(
            select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.employee_id == employee.id)
        ).first()
        if not record:
            record = PayrollRecord(
                period=period,
                employee_id=employee.id,
                base_salary=effective_base_salary(employee, rule),
                working_days=employee.working_days or 25,
                payment_method="Transfer",
            )
        calculate_payroll_record(record, employee, rule, attendance_rows)
        session.add(record)
        records.append(record)

    session.commit()
    return records
