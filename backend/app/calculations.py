from datetime import datetime

from sqlmodel import Session, delete, select

from app.models import (
    AttendanceRecord,
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
        treatment_fee = sum(row.doctor_fee_amount for row in rows)
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
    record.base_salary = record.base_salary or employee.base_salary
    record.working_days = record.working_days or employee.working_days or 25
    record.overtime_rate_per_minute = record.overtime_rate_per_minute or rule.overtime_rate_per_minute

    auto_overtime = sum(row.overtime_minutes for row in attendance_rows)
    auto_sunday = sum(1 for row in attendance_rows if row.is_sunday)
    auto_double = sum(1 for row in attendance_rows if row.is_double_shift)
    record.overtime_minutes = record.overtime_minutes or auto_overtime
    record.sunday_count = record.sunday_count or auto_sunday
    record.double_shift_count = record.double_shift_count or auto_double

    daily_salary = record.base_salary / record.working_days if record.working_days else 0
    record.double_shift_fee = round_money(record.double_shift_fee or daily_salary * record.double_shift_count * rule.double_shift_multiplier)
    record.sunday_fee = round_money(record.sunday_fee or daily_salary * record.sunday_count * rule.sunday_multiplier)
    record.overtime_total = round_money(record.overtime_minutes * record.overtime_rate_per_minute)
    record.bpjs_deduction = round_money(record.bpjs_deduction or record.base_salary * rule.bpjs_jht_rate)

    gross = (
        record.base_salary
        + record.double_shift_fee
        + record.sunday_fee
        + record.overtime_total
        + record.bonus
        + record.position_allowance
    )
    record.pph21 = round_money(record.pph21 or ((gross * rule.pph21_rate) if gross > rule.pph21_threshold else 0))
    record.net_salary = round_money(gross - record.bpjs_deduction - record.other_deduction - record.pph21)
    record.bank_name = record.bank_name or employee.bank_name
    record.account_name = record.account_name or employee.account_name or employee.name
    record.account_number = record.account_number or employee.account_number
    record.calculated_at = datetime.utcnow()
    return record


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
                base_salary=employee.base_salary,
                working_days=employee.working_days,
                payment_method="Transfer",
            )
        calculate_payroll_record(record, employee, rule, attendance_rows)
        session.add(record)
        records.append(record)

    session.commit()
    return records
