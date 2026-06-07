from sqlmodel import Session, select

from app.database import engine, refresh_database
from app.models import DoctorFeeRule, PayrollRule, User


def test_refresh_database_recreates_defaults():
    refresh_database()

    with Session(engine) as session:
        admin = session.exec(select(User).where(User.username == "admin")).first()
        payroll_rule = session.exec(select(PayrollRule).where(PayrollRule.name == "Default")).first()
        fee_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.name == "Default")).first()

    assert admin is not None
    assert payroll_rule is not None
    assert fee_rule is not None
