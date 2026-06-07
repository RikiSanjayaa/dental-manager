from datetime import date

from app.calculations import calculate_doctor_transaction, calculate_payroll_record
from app.models import AttendanceRecord, Doctor, DoctorFeeRule, DoctorTransaction, Employee, PayrollRecord, PayrollRule, Treatment


def test_doctor_fee_calculation_matches_excel_formula():
    treatment = Treatment(name="Scaling A", bhp_cost=120_000, treatment_price=350_000)
    doctor = Doctor(name="Dokter 1", normal_fee_rate=0.60)
    trx = DoctorTransaction(
        period="2026-05",
        transaction_date=date(2026, 5, 1),
        doctor_id=1,
        patient_name="Pasien",
        treatment_name_snapshot="Scaling A",
        qty=1,
        discount_amount=0,
    )

    calculate_doctor_transaction(trx, treatment, doctor, DoctorFeeRule(name="Default"))

    assert trx.service_amount == 230_000
    assert trx.doctor_fee_amount == 138_000
    assert trx.total_bill_amount == 350_000


def test_payroll_calculation_uses_default_rules_and_attendance():
    employee = Employee(name="Nama Karyawan 1", base_salary=2_712_250, working_days=25)
    rule = PayrollRule(name="Default", overtime_rate_per_minute=250, bpjs_jht_rate=0.02, pph21_threshold=5_400_000)
    record = PayrollRecord(period="2026-05", employee_id=1)
    attendance = [
        AttendanceRecord(period="2026-05", employee_name_snapshot="Nama Karyawan 1", work_date=date(2026, 5, 3), is_sunday=True),
        AttendanceRecord(period="2026-05", employee_name_snapshot="Nama Karyawan 1", work_date=date(2026, 5, 5), overtime_minutes=104),
    ]

    calculate_payroll_record(record, employee, rule, attendance)

    assert record.overtime_total == 26_000
    assert round(record.sunday_fee, 2) == 92_991.43
    assert record.bpjs_deduction == 54_245
    assert record.net_salary == 2_776_996.43
