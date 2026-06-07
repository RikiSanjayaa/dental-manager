from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from app.calculations import calculate_doctor_period, calculate_doctor_transaction
from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.importers import commit_doctor_transactions, preview_doctor_transactions
from app.models import Doctor, DoctorFeeRule, DoctorPeriodSummary, DoctorTransaction, PeriodStatus, Treatment

router = APIRouter(tags=["doctor-fees"])


class DoctorTransactionInput(BaseModel):
    period: str
    transaction_date: date
    doctor_id: int
    patient_name: str
    treatment_id: int | None = None
    treatment_name_snapshot: str
    qty: float = 1
    discount_amount: float = 0
    bhp_override: float | None = None
    price_override: float | None = None
    special_fee_amount: float = 0
    fee_rate: float | None = None


@router.get("/doctor-transactions", response_model=list[DoctorTransaction])
def list_transactions(session: SessionDep, _: CurrentUser, period: str | None = None, doctor_id: int | None = None) -> list[DoctorTransaction]:
    statement = select(DoctorTransaction)
    rows = session.exec(statement).all()
    if period:
        rows = [row for row in rows if row.period == period]
    if doctor_id:
        rows = [row for row in rows if row.doctor_id == doctor_id]
    return rows


@router.post("/doctor-transactions/import")
async def import_transactions(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    path = get_settings().upload_dir / f"{uuid4().hex}{Path(file.filename or 'doctor-transactions.xlsx').suffix or '.xlsx'}"
    path.write_bytes(await file.read())
    preview = preview_doctor_transactions(path)
    result = commit_doctor_transactions(session, preview)
    return {
        "target": "doctor_transactions",
        **result,
        "invalid_rows": preview["invalid_rows"],
        "warnings": preview["warnings"][:20],
        "errors": preview["errors"][:20],
    }


@router.post("/doctor-transactions", response_model=DoctorTransaction)
def create_transaction(payload: DoctorTransactionInput, session: SessionDep, _: CurrentUser) -> DoctorTransaction:
    doctor = session.get(Doctor, payload.doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Dokter tidak ditemukan")
    treatment = session.get(Treatment, payload.treatment_id) if payload.treatment_id else None
    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    default_rule = default_rule or DoctorFeeRule(name="Fallback", is_default=True)
    row = DoctorTransaction(**payload.model_dump())
    calculate_doctor_transaction(row, treatment, doctor, default_rule)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/doctor-transactions/{item_id}", response_model=DoctorTransaction)
def update_transaction(item_id: int, payload: DoctorTransactionInput, session: SessionDep, _: CurrentUser) -> DoctorTransaction:
    row = session.get(DoctorTransaction, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    doctor = session.get(Doctor, row.doctor_id)
    treatment = session.get(Treatment, row.treatment_id) if row.treatment_id else None
    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    calculate_doctor_transaction(row, treatment, doctor, default_rule or DoctorFeeRule(name="Fallback"))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/doctor-periods/{period}/calculate", response_model=list[DoctorPeriodSummary])
def calculate_period(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummary]:
    return calculate_doctor_period(session, period)


@router.get("/doctor-periods/{period}/summary", response_model=list[DoctorPeriodSummary])
def period_summary(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummary]:
    return session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()


@router.post("/doctor-periods/{period}/lock", response_model=list[DoctorPeriodSummary])
def lock_period(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummary]:
    rows = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    for row in rows:
        row.status = PeriodStatus.LOCKED
        session.add(row)
    session.commit()
    return rows
