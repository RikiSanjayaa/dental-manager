from collections.abc import Generator
from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import get_settings
from app.models import AttendanceRule, DoctorFeeRule, PayrollRule, User, UserRole
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
            connection.execute(text("UPDATE payrollrule SET default_base_salary = 2712250 WHERE default_base_salary IS NULL OR default_base_salary = 0"))
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

        session.commit()


def refresh_database() -> None:
    if settings.database_url.startswith("sqlite:///"):
        db_path = Path(settings.database_url.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    seed_defaults()
