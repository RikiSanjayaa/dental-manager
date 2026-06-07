from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select

from app.config import get_settings
from app.models import DoctorFeeRule, PayrollRule, User, UserRole
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
    seed_defaults()


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
