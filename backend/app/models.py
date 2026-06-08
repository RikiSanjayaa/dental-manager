from datetime import date, datetime, time
from enum import Enum
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"


class PeriodStatus(str, Enum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    LOCKED = "locked"
    EXPORTED = "exported"


class ImportKind(str, Enum):
    MASTER_TREATMENTS = "master_treatments"
    MASTER_DOCTORS = "master_doctors"
    MASTER_EMPLOYEES = "master_employees"
    UNKNOWN = "unknown"


class ImportStatus(str, Enum):
    PREVIEW = "preview"
    COMMITTED = "committed"
    FAILED = "failed"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    full_name: str
    role: UserRole = Field(default=UserRole.OPERATOR, index=True)
    hashed_password: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Employee(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    position: Optional[str] = None
    join_date: Optional[date] = None
    base_salary: float = 0
    working_days: int = 25
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Doctor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    nik: Optional[str] = None
    normal_fee_rate: float = 0.60
    ortho_fee_rate: float = 0.70
    tax_rate: float = 0.025
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Treatment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: Optional[str] = Field(default=None, index=True)
    name: str = Field(index=True)
    category: Optional[str] = Field(default=None, index=True)
    doctor_cost: float = 0
    specialist_cost: float = 0
    bhp_cost: float = 0
    service_fee: float = 0
    treatment_price: float = 0
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PayrollRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    is_default: bool = False
    bpjs_jht_rate: float = 0.02
    overtime_rate_per_minute: float = 250
    pph21_threshold: float = 5_400_000
    pph21_rate: float = 0.05
    sunday_multiplier: float = 6 / 7
    double_shift_multiplier: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DoctorFeeRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    is_default: bool = False
    normal_fee_rate: float = 0.60
    ortho_fee_rate: float = 0.70
    tax_rate: float = 0.025
    default_deduction: float = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ImportFile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    original_filename: str
    stored_path: str
    kind: ImportKind = ImportKind.UNKNOWN
    status: ImportStatus = ImportStatus.PREVIEW
    rows_valid: int = 0
    rows_invalid: int = 0
    warnings_count: int = 0
    preview_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    errors_json: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    committed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReportArchive(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_type: str = Field(index=True)
    period: str = Field(index=True)
    status: str = Field(index=True)
    format: str = Field(index=True)
    filename: str
    stored_path: str
    media_type: str
    file_size: int = 0
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    expires_at: datetime = Field(index=True)


class DoctorTransaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    period: str = Field(index=True)
    transaction_date: date = Field(index=True)
    doctor_id: int = Field(foreign_key="doctor.id", index=True)
    patient_name: str
    treatment_id: Optional[int] = Field(default=None, foreign_key="treatment.id", index=True)
    treatment_name_snapshot: str
    qty: float = 1
    discount_amount: float = 0
    bhp_override: Optional[float] = None
    price_override: Optional[float] = None
    special_fee_amount: float = 0
    fee_rate: Optional[float] = None
    service_amount: float = 0
    doctor_fee_amount: float = 0
    total_bill_amount: float = 0
    needs_review: bool = False
    review_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DoctorPeriodSummary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    period: str = Field(index=True)
    doctor_id: int = Field(foreign_key="doctor.id", index=True)
    status: PeriodStatus = PeriodStatus.DRAFT
    treatment_fee_total: float = 0
    ortho_fee_total: float = 0
    total_fee: float = 0
    total_bill: float = 0
    deduction: float = 0
    tax: float = 0
    transfer_amount: float = 0
    calculated_at: datetime = Field(default_factory=datetime.utcnow)


class AttendanceRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    period: str = Field(index=True)
    employee_id: Optional[int] = Field(default=None, foreign_key="employee.id", index=True)
    employee_name_snapshot: str = Field(index=True)
    work_date: date = Field(index=True)
    timezone1_in: Optional[time] = None
    timezone1_out: Optional[time] = None
    timezone2_in: Optional[time] = None
    timezone2_out: Optional[time] = None
    late_minutes: int = 0
    early_leave_minutes: int = 0
    absent_minutes: int = 0
    overtime_minutes: int = 0
    is_sunday: bool = False
    is_double_shift: bool = False
    status_note: Optional[str] = None
    needs_review: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PayrollRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    period: str = Field(index=True)
    employee_id: int = Field(foreign_key="employee.id", index=True)
    status: PeriodStatus = PeriodStatus.DRAFT
    base_salary: float = 0
    working_days: int = 25
    double_shift_count: float = 0
    sunday_count: float = 0
    izin_count: float = 0
    sakit_count: float = 0
    cuti_count: float = 0
    alpha_count: float = 0
    double_shift_fee: float = 0
    sunday_fee: float = 0
    overtime_minutes: int = 0
    overtime_rate_per_minute: float = 250
    overtime_total: float = 0
    bonus: float = 0
    position_allowance: float = 0
    bpjs_deduction: float = 0
    other_deduction: float = 0
    pph21: float = 0
    net_salary: float = 0
    payment_method: str = "Transfer"
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    needs_review: bool = False
    calculated_at: datetime = Field(default_factory=datetime.utcnow)
