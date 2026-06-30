from datetime import date, time

from app.calculations import calculate_attendance_record, calculate_doctor_transaction, calculate_payroll_record
from app.models import AttendanceRecord, AttendanceRule, Doctor, DoctorFeeRule, DoctorTransaction, Employee, PayrollRecord, PayrollRule, Treatment


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
        AttendanceRecord(
            period="2026-05",
            employee_name_snapshot="Nama Karyawan 1",
            work_date=date(2026, 5, 3),
            timezone1_in=time(8, 0),
            timezone1_out=time(16, 0),
            is_holiday=True,
        ),
        AttendanceRecord(period="2026-05", employee_name_snapshot="Nama Karyawan 1", work_date=date(2026, 5, 4), is_double_shift=True, overtime_minutes=120),
    ]

    calculate_payroll_record(record, employee, rule, attendance)

    assert record.overtime_total == 30_000
    assert record.sunday_fee == 90_000
    assert record.double_shift_fee == 90_000
    assert record.bpjs_deduction == 54_245
    assert record.net_salary == 2_868_005


def test_attendance_overtime_threshold_cap_and_double_shift_rules():
    rule = AttendanceRule(name="Default")
    record = AttendanceRecord(
        period="2026-05",
        employee_name_snapshot="Nama Karyawan 1",
        work_date=date(2026, 5, 4),
        timezone1_in=time(8, 0),
        timezone1_out=time(19, 45),
    )

    calculate_attendance_record(record, rule)

    assert record.overtime_minutes == 180
    assert record.is_double_shift is True

    short = AttendanceRecord(
        period="2026-05",
        employee_name_snapshot="Nama Karyawan 1",
        work_date=date(2026, 5, 5),
        timezone1_in=time(8, 0),
        timezone1_out=time(16, 30),
    )

    calculate_attendance_record(short, rule)

    assert short.overtime_minutes == 0


def test_attendance_overtime_cap_is_configurable():
    rule = AttendanceRule(name="Default", overtime_max_minutes=90)
    record = AttendanceRecord(
        period="2026-05",
        employee_name_snapshot="Nama Karyawan 1",
        work_date=date(2026, 5, 6),
        timezone1_in=time(8, 0),
        timezone1_out=time(19, 45),
    )

    calculate_attendance_record(record, rule)

    assert record.overtime_minutes == 90


def test_attendance_overtime_threshold_is_configurable():
    rule = AttendanceRule(name="Default", overtime_min_minutes=45, overtime_max_minutes=180)
    below_threshold = AttendanceRecord(
        period="2026-05",
        employee_name_snapshot="Nama Karyawan 1",
        work_date=date(2026, 5, 6),
        timezone1_in=time(8, 0),
        timezone1_out=time(16, 45),
    )
    above_threshold = AttendanceRecord(
        period="2026-05",
        employee_name_snapshot="Nama Karyawan 1",
        work_date=date(2026, 5, 7),
        timezone1_in=time(8, 0),
        timezone1_out=time(16, 46),
    )

    calculate_attendance_record(below_threshold, rule)
    calculate_attendance_record(above_threshold, rule)

    assert below_threshold.overtime_minutes == 0
    assert above_threshold.overtime_minutes == 46


def test_payroll_uses_admin_count_overrides_for_allowance():
    employee = Employee(name="Nama Karyawan 1", base_salary=2_712_250, working_days=25)
    rule = PayrollRule(name="Default")
    record = PayrollRecord(period="2026-05", employee_id=1, double_shift_count_override=3, sunday_count_override=2)
    attendance = [
        AttendanceRecord(period="2026-05", employee_name_snapshot="Nama Karyawan 1", work_date=date(2026, 5, 4), is_double_shift=True),
        AttendanceRecord(
            period="2026-05",
            employee_name_snapshot="Nama Karyawan 1",
            work_date=date(2026, 5, 5),
            timezone1_in=time(8, 0),
            timezone1_out=time(16, 0),
            is_holiday=True,
        ),
    ]

    calculate_payroll_record(record, employee, rule, attendance)

    assert record.auto_double_shift_count == 1
    assert record.auto_sunday_count == 1
    assert record.double_shift_count == 3
    assert record.sunday_count == 2
    assert record.double_shift_fee == 270_000
    assert record.sunday_fee == 180_000
