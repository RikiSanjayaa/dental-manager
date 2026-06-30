from collections.abc import Generator
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import get_settings
from app.models import AppSetting, AttendanceRule, AuditLog, DoctorFeeRule, PayrollRule, User, UserRole
from app.security import hash_password

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_db() -> None:
    if settings.database_url.startswith("sqlite:///"):
        db_path = Path(settings.database_url.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    ensure_sqlite_columns()
    seed_defaults()
    prune_old_audit_logs()


def ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "employee" in table_names:
        employee_columns = {column["name"] for column in inspector.get_columns("employee")}
        with engine.begin() as connection:
            if "attendance_id" not in employee_columns:
                connection.execute(text("ALTER TABLE employee ADD COLUMN attendance_id VARCHAR"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_attendance_id ON employee (attendance_id)"))
            if "is_training" not in employee_columns:
                connection.execute(text("ALTER TABLE employee ADD COLUMN is_training BOOLEAN DEFAULT 0"))
            connection.execute(text("UPDATE employee SET attendance_id = CAST(id AS TEXT) WHERE attendance_id IS NULL OR attendance_id = ''"))
    if "payrollrule" in table_names:
        payroll_rule_columns = {column["name"] for column in inspector.get_columns("payrollrule")}
        with engine.begin() as connection:
            if "default_base_salary" not in payroll_rule_columns:
                connection.execute(text("ALTER TABLE payrollrule ADD COLUMN default_base_salary FLOAT DEFAULT 2712250"))
            if "holiday_double_shift_fee" not in payroll_rule_columns:
                connection.execute(text("ALTER TABLE payrollrule ADD COLUMN holiday_double_shift_fee FLOAT DEFAULT 90000"))
            connection.execute(text("UPDATE payrollrule SET default_base_salary = 2712250 WHERE default_base_salary IS NULL OR default_base_salary = 0"))
            connection.execute(text("UPDATE payrollrule SET holiday_double_shift_fee = 90000 WHERE holiday_double_shift_fee IS NULL OR holiday_double_shift_fee = 0"))
    if "payrollrecord" in table_names:
        payroll_record_columns = {column["name"] for column in inspector.get_columns("payrollrecord")}
        with engine.begin() as connection:
            if "auto_double_shift_count" not in payroll_record_columns:
                connection.execute(text("ALTER TABLE payrollrecord ADD COLUMN auto_double_shift_count FLOAT DEFAULT 0"))
            if "auto_sunday_count" not in payroll_record_columns:
                connection.execute(text("ALTER TABLE payrollrecord ADD COLUMN auto_sunday_count FLOAT DEFAULT 0"))
            if "double_shift_count_override" not in payroll_record_columns:
                connection.execute(text("ALTER TABLE payrollrecord ADD COLUMN double_shift_count_override FLOAT"))
            if "sunday_count_override" not in payroll_record_columns:
                connection.execute(text("ALTER TABLE payrollrecord ADD COLUMN sunday_count_override FLOAT"))
            connection.execute(text("UPDATE payrollrecord SET auto_double_shift_count = double_shift_count WHERE auto_double_shift_count IS NULL"))
            connection.execute(text("UPDATE payrollrecord SET auto_sunday_count = sunday_count WHERE auto_sunday_count IS NULL"))
    if "attendancerecord" in table_names:
        attendance_columns = {column["name"] for column in inspector.get_columns("attendancerecord")}
        with engine.begin() as connection:
            if "attendance_id_snapshot" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN attendance_id_snapshot VARCHAR"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_attendancerecord_attendance_id_snapshot ON attendancerecord (attendance_id_snapshot)"))
            if "total_minutes" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN total_minutes INTEGER DEFAULT 0"))
            if "is_absent" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN is_absent BOOLEAN DEFAULT 0"))
            if "is_holiday" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN is_holiday BOOLEAN DEFAULT 0"))
            if "protest_note" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN protest_note VARCHAR"))
            if "protest_by_user_id" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN protest_by_user_id INTEGER"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_attendancerecord_protest_by_user_id ON attendancerecord (protest_by_user_id)"))
            if "protest_by_name" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN protest_by_name VARCHAR"))
            if "protested_at" not in attendance_columns:
                connection.execute(text("ALTER TABLE attendancerecord ADD COLUMN protested_at DATETIME"))
    if "attendancerule" in table_names:
        attendance_rule_columns = {column["name"] for column in inspector.get_columns("attendancerule")}
        with engine.begin() as connection:
            if "overtime_min_minutes" not in attendance_rule_columns:
                connection.execute(text("ALTER TABLE attendancerule ADD COLUMN overtime_min_minutes INTEGER DEFAULT 30"))
            if "overtime_max_minutes" not in attendance_rule_columns:
                connection.execute(text("ALTER TABLE attendancerule ADD COLUMN overtime_max_minutes INTEGER DEFAULT 180"))
            connection.execute(text("UPDATE attendancerule SET overtime_min_minutes = 30 WHERE overtime_min_minutes IS NULL"))
            connection.execute(text("UPDATE attendancerule SET overtime_max_minutes = 180 WHERE overtime_max_minutes IS NULL OR overtime_max_minutes = 0"))
    if "user" in table_names:
        user_columns = {column["name"] for column in inspector.get_columns("user")}
        with engine.begin() as connection:
            if "employee_id" not in user_columns:
                connection.execute(text("ALTER TABLE user ADD COLUMN employee_id INTEGER"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_user_employee_id ON user (employee_id)"))
            connection.execute(text("UPDATE user SET role = 'ADMIN' WHERE role IN ('admin', 'administrator', 'ADMINISTRATOR')"))
            connection.execute(text("UPDATE user SET role = 'OPERATOR' WHERE role IN ('operator', 'regular_user', 'REGULAR_USER')"))


def seed_defaults() -> None:
    with Session(engine) as session:
        admin = session.exec(select(User).where(User.username == settings.admin_username)).first()
        if not admin:
            session.add(
                User(
                    username=settings.admin_username,
                    full_name="Administrator",
                    role=UserRole.ADMIN,
                    hashed_password=hash_password(settings.admin_password),
                    is_active=True,
                )
            )

        payroll_rule = session.exec(select(PayrollRule).where(PayrollRule.name == "Default")).first()
        if not payroll_rule:
            session.add(PayrollRule(name="Default", is_default=True))

        attendance_rule = session.exec(select(AttendanceRule).where(AttendanceRule.name == "Default")).first()
        if not attendance_rule:
            session.add(AttendanceRule(name="Default", is_default=True))

        fee_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.name == "Default")).first()
        if not fee_rule:
            session.add(DoctorFeeRule(name="Default", is_default=True))

        clinic_name = session.exec(select(AppSetting).where(AppSetting.key == "report_clinic_name")).first()
        if not clinic_name:
            session.add(AppSetting(key="report_clinic_name", value=settings.app_name))

        session.commit()


def prune_old_audit_logs(retention_days: int = 365) -> int:
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    with Session(engine) as session:
        rows = session.exec(select(AuditLog).where(AuditLog.created_at < cutoff)).all()
        for row in rows:
            session.delete(row)
        session.commit()
        return len(rows)


def refresh_database() -> None:
    if settings.database_url.startswith("sqlite:///"):
        db_path = Path(settings.database_url.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    seed_defaults()
