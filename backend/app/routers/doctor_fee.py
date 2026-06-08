from calendar import monthrange
from datetime import date, datetime
import random
from typing import Any
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from app.calculations import calculate_doctor_period, calculate_doctor_transaction
from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.importers import commit_doctor_transactions, preview_doctor_transactions
from app.models import Doctor, DoctorFeeRule, DoctorPeriodSummary, DoctorTransaction, ImportFile, ImportStatus, PeriodStatus, Treatment
from app.utils import parse_period

router = APIRouter(tags=["doctor-fees"])


class DoctorTransactionInput(BaseModel):
    period: str | None = None
    transaction_date: date
    doctor_id: int
    patient_name: str
    treatment_id: int | None = None
    treatment_name_snapshot: str | None = None
    qty: float = 1
    discount_amount: float = 0
    bhp_override: float | None = None
    price_override: float | None = None
    special_fee_amount: float = 0
    fee_rate: float | None = None
    needs_review: bool | None = None
    review_note: str | None = None


class DoctorTransactionRead(BaseModel):
    id: int
    period: str
    transaction_date: date
    doctor_id: int
    doctor_name: str
    patient_name: str
    treatment_id: int | None = None
    treatment_name_snapshot: str
    treatment_name: str
    qty: float
    discount_amount: float
    bhp_amount: float
    price_amount: float
    bhp_override: float | None = None
    price_override: float | None = None
    special_fee_amount: float
    fee_rate: float | None = None
    service_amount: float
    doctor_fee_amount: float
    total_bill_amount: float
    needs_review: bool
    review_note: str | None = None


class DoctorPeriodSummaryRead(BaseModel):
    id: int
    doctor_id: int
    doctor_name: str
    bank_name: str | None = None
    account_name: str | None = None
    account_number: str | None = None
    transaction_count: int
    treatment_fee_total: float
    ortho_fee_total: float
    total_fee: float
    total_bill: float
    deduction: float
    tax: float
    transfer_amount: float
    status: PeriodStatus
    calculated_at: datetime


class DoctorPeriodOverview(BaseModel):
    period: str
    status: str
    doctor_count: int
    transaction_count: int
    review_count: int
    total_bill: float
    treatment_fee_total: float
    ortho_fee_total: float
    total_fee: float
    deduction: float
    tax: float
    transfer_amount: float
    summaries: list[DoctorPeriodSummaryRead]


class RandomTransactionResult(BaseModel):
    period: str
    created: int
    calculated: int


def _period_is_locked(session: SessionDep, period: str) -> bool:
    return bool(
        session.exec(
            select(DoctorPeriodSummary).where(
                DoctorPeriodSummary.period == period,
                DoctorPeriodSummary.status == PeriodStatus.LOCKED,
            )
        ).first()
    )


def _ensure_period_unlocked(session: SessionDep, period: str) -> None:
    if _period_is_locked(session, period):
        raise HTTPException(status_code=409, detail=f"Periode {period} sudah locked.")


def _preview_periods(preview: dict[str, Any]) -> set[str]:
    return {
        str(row.get("period"))
        for row in preview.get("data", {}).get("transactions", [])
        if row.get("period")
    }


def _summary_read(session: SessionDep, summary: DoctorPeriodSummary, transaction_count: int | None = None) -> DoctorPeriodSummaryRead:
    doctor = session.get(Doctor, summary.doctor_id)
    if transaction_count is None:
        transaction_count = len(
            session.exec(
                select(DoctorTransaction).where(
                    DoctorTransaction.period == summary.period,
                    DoctorTransaction.doctor_id == summary.doctor_id,
                )
            ).all()
        )
    return DoctorPeriodSummaryRead(
        id=summary.id or 0,
        doctor_id=summary.doctor_id,
        doctor_name=doctor.name if doctor else f"Dokter #{summary.doctor_id}",
        bank_name=doctor.bank_name if doctor else None,
        account_name=doctor.account_name if doctor else None,
        account_number=doctor.account_number if doctor else None,
        transaction_count=transaction_count,
        treatment_fee_total=summary.treatment_fee_total,
        ortho_fee_total=summary.ortho_fee_total,
        total_fee=summary.total_fee,
        total_bill=summary.total_bill,
        deduction=summary.deduction,
        tax=summary.tax,
        transfer_amount=summary.transfer_amount,
        status=summary.status,
        calculated_at=summary.calculated_at,
    )


def _transaction_read(session: SessionDep, row: DoctorTransaction) -> DoctorTransactionRead:
    doctor = session.get(Doctor, row.doctor_id)
    treatment = session.get(Treatment, row.treatment_id) if row.treatment_id else None
    bhp = row.bhp_override if row.bhp_override is not None else (treatment.bhp_cost if treatment else 0)
    price = row.price_override if row.price_override is not None else (treatment.treatment_price if treatment else 0)
    return DoctorTransactionRead(
        id=row.id or 0,
        period=row.period,
        transaction_date=row.transaction_date,
        doctor_id=row.doctor_id,
        doctor_name=doctor.name if doctor else f"Dokter #{row.doctor_id}",
        patient_name=row.patient_name,
        treatment_id=row.treatment_id,
        treatment_name_snapshot=row.treatment_name_snapshot,
        treatment_name=treatment.name if treatment else row.treatment_name_snapshot,
        qty=row.qty,
        discount_amount=row.discount_amount,
        bhp_amount=bhp,
        price_amount=price,
        bhp_override=row.bhp_override,
        price_override=row.price_override,
        special_fee_amount=row.special_fee_amount,
        fee_rate=row.fee_rate,
        service_amount=row.service_amount,
        doctor_fee_amount=row.doctor_fee_amount,
        total_bill_amount=row.total_bill_amount,
        needs_review=row.needs_review,
        review_note=row.review_note,
    )


def _prepare_transaction(session: SessionDep, payload: DoctorTransactionInput, row: DoctorTransaction | None = None) -> DoctorTransaction:
    doctor = session.get(Doctor, payload.doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Dokter tidak ditemukan")
    treatment = session.get(Treatment, payload.treatment_id) if payload.treatment_id else None
    treatment_name = payload.treatment_name_snapshot or (treatment.name if treatment else None)
    if not treatment_name:
        raise HTTPException(status_code=400, detail="Treatment wajib dipilih atau diisi.")

    values = payload.model_dump()
    values["period"] = payload.period or parse_period(payload.transaction_date)
    values["treatment_name_snapshot"] = treatment_name
    if row:
        for field, value in values.items():
            setattr(row, field, value)
    else:
        row = DoctorTransaction(**values)

    auto_needs_review = treatment is None
    row.needs_review = auto_needs_review if payload.needs_review is None else payload.needs_review
    review_note = payload.review_note.strip() if payload.review_note and payload.review_note.strip() else None
    if row.needs_review:
        row.review_note = review_note or ("Treatment belum ditemukan di master." if auto_needs_review else "Ditandai perlu review.")
    else:
        row.review_note = None
    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    calculate_doctor_transaction(row, treatment, doctor, default_rule or DoctorFeeRule(name="Fallback", is_default=True))
    return row


@router.get("/doctor-transactions", response_model=list[DoctorTransactionRead])
def list_transactions(session: SessionDep, _: CurrentUser, period: str | None = None, doctor_id: int | None = None, review: bool | None = None) -> list[DoctorTransactionRead]:
    statement = select(DoctorTransaction)
    rows = session.exec(statement).all()
    if period:
        rows = [row for row in rows if row.period == period]
    if doctor_id:
        rows = [row for row in rows if row.doctor_id == doctor_id]
    if review is not None:
        rows = [row for row in rows if row.needs_review is review]
    rows = sorted(rows, key=lambda row: (row.transaction_date, row.id or 0))
    return [_transaction_read(session, row) for row in rows]


def _annotate_transaction_preview(session: SessionDep, preview: dict[str, Any]) -> dict[str, Any]:
    doctor_names = {doctor.name.casefold(): doctor for doctor in session.exec(select(Doctor)).all()}
    treatment_names = {treatment.name.casefold(): treatment for treatment in session.exec(select(Treatment)).all()}
    rows: list[dict[str, Any]] = []
    valid_rows = 0
    review_rows = 0

    for item in preview.get("data", {}).get("transactions", []):
        row = dict(item)
        issues: list[str] = []
        doctor = doctor_names.get(str(row.get("doctor_name", "")).strip().casefold())
        treatment = treatment_names.get(str(row.get("treatment_name", "")).strip().casefold())
        if not doctor:
            issues.append("Dokter belum ada di master, akan dibuat otomatis.")
        if not treatment:
            issues.append("Treatment belum ditemukan di master, perlu review.")
        if row.get("valid", True):
            valid_rows += 1
        if issues:
            review_rows += 1
        row["status"] = "review" if issues else "valid"
        row["issues"] = issues
        rows.append(row)

    summary = {
        **preview.get("summary", {}),
        "valid": valid_rows,
        "review": review_rows,
        "invalid": preview.get("invalid_rows", 0),
    }
    return {
        "target": "doctor_transactions",
        "kind": "doctor_transactions",
        "valid_rows": valid_rows,
        "invalid_rows": preview.get("invalid_rows", 0),
        "warnings": preview.get("warnings", []),
        "errors": preview.get("errors", []),
        "summary": summary,
        "rows": rows,
        "data": preview.get("data", {}),
    }


async def _build_transaction_preview(session: SessionDep, file: UploadFile) -> dict[str, Any]:
    path = get_settings().upload_dir / f"{uuid4().hex}{Path(file.filename or 'doctor-transactions.xlsx').suffix or '.xlsx'}"
    path.write_bytes(await file.read())
    raw_preview = preview_doctor_transactions(path)
    preview = _annotate_transaction_preview(session, raw_preview)
    import_file = ImportFile(
        original_filename=file.filename or path.name,
        stored_path=str(path),
        rows_valid=preview["valid_rows"],
        rows_invalid=preview["invalid_rows"],
        warnings_count=len(preview["warnings"]),
        preview_json=preview,
        errors_json=preview["errors"],
    )
    session.add(import_file)
    session.commit()
    session.refresh(import_file)
    return {"import_id": import_file.id, **preview}


def _commit_transaction_preview(session: SessionDep, import_id: int) -> dict[str, Any]:
    import_file = session.get(ImportFile, import_id)
    if not import_file or import_file.preview_json.get("target") != "doctor_transactions":
        raise HTTPException(status_code=404, detail="Preview import tidak ditemukan.")
    if import_file.status == ImportStatus.COMMITTED:
        raise HTTPException(status_code=409, detail="Import sudah di-commit.")
    preview = import_file.preview_json
    for period in _preview_periods(preview):
        _ensure_period_unlocked(session, period)
    result = commit_doctor_transactions(session, preview)
    import_file.status = ImportStatus.COMMITTED
    import_file.committed_at = datetime.utcnow()
    session.add(import_file)
    session.commit()
    return {
        "target": "doctor_transactions",
        **result,
        "invalid_rows": preview.get("invalid_rows", 0),
        "warnings": preview.get("warnings", [])[:20],
        "errors": preview.get("errors", [])[:20],
    }


@router.post("/doctor-transactions/import/preview")
async def preview_transaction_import(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    return await _build_transaction_preview(session, file)


@router.post("/doctor-transactions/import/{import_id}/commit")
def commit_transaction_import(import_id: int, session: SessionDep, _: CurrentUser) -> dict:
    return _commit_transaction_preview(session, import_id)


@router.post("/doctor-transactions/import")
async def import_transactions(session: SessionDep, _: CurrentUser, file: UploadFile = File(...)) -> dict:
    preview = await _build_transaction_preview(session, file)
    return _commit_transaction_preview(session, preview["import_id"])


@router.post("/doctor-transactions/generate-random", response_model=RandomTransactionResult)
def generate_random_transactions(period: str, session: SessionDep, _: CurrentUser, count: int = 36) -> RandomTransactionResult:
    _ensure_period_unlocked(session, period)
    doctors = session.exec(select(Doctor).where(Doctor.is_active == True)).all()  # noqa: E712
    treatments = session.exec(select(Treatment).where(Treatment.is_active == True)).all()  # noqa: E712
    if not doctors or not treatments:
        raise HTTPException(status_code=409, detail="Master dokter dan treatment harus tersedia sebelum generate data tes.")
    count = max(1, min(count, 120))
    year, month = (int(part) for part in period.split("-"))
    last_day = monthrange(year, month)[1]
    patient_names = [
        "Ayu Pradnya",
        "Made Wirawan",
        "Komang Sari",
        "Ketut Mahendra",
        "Rangga Husnan",
        "Rina Kusumawati",
        "Deni Hidayat",
        "Lisa Paramita",
        "Jamal",
        "Nanik Soraya",
    ]
    default_rule = session.exec(select(DoctorFeeRule).where(DoctorFeeRule.is_default == True)).first()  # noqa: E712
    default_rule = default_rule or DoctorFeeRule(name="Default", is_default=True)
    created = 0
    for doctor in doctors:
        for index in range(count):
            treatment = random.choice(treatments)
            qty = random.choice([1, 1, 1, 1, 2, 2, 3])
            discount = random.choice([0, 0, 0, 0, 20_000, 30_000, 50_000, 100_000])
            trx = DoctorTransaction(
                period=period,
                transaction_date=date(year, month, random.randint(1, last_day)),
                doctor_id=doctor.id or 0,
                patient_name=f"{random.choice(patient_names)} {created + 1}",
                treatment_id=treatment.id,
                treatment_name_snapshot=treatment.name,
                qty=qty,
                discount_amount=min(discount, max(0, (treatment.treatment_price * qty) - 1)),
            )
            calculate_doctor_transaction(trx, treatment, doctor, default_rule)
            session.add(trx)
            created += 1
    session.commit()
    summaries = calculate_doctor_period(session, period)
    return RandomTransactionResult(period=period, created=created, calculated=len(summaries))


@router.post("/doctor-transactions", response_model=DoctorTransactionRead)
def create_transaction(payload: DoctorTransactionInput, session: SessionDep, _: CurrentUser) -> DoctorTransactionRead:
    _ensure_period_unlocked(session, payload.period or parse_period(payload.transaction_date))
    row = _prepare_transaction(session, payload)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _transaction_read(session, row)


@router.patch("/doctor-transactions/{item_id}", response_model=DoctorTransactionRead)
def update_transaction(item_id: int, payload: DoctorTransactionInput, session: SessionDep, _: CurrentUser) -> DoctorTransactionRead:
    row = session.get(DoctorTransaction, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    _ensure_period_unlocked(session, row.period)
    _ensure_period_unlocked(session, payload.period or parse_period(payload.transaction_date))
    row = _prepare_transaction(session, payload, row)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _transaction_read(session, row)


@router.delete("/doctor-transactions/{item_id}")
def delete_transaction(item_id: int, session: SessionDep, _: CurrentUser) -> dict:
    row = session.get(DoctorTransaction, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    _ensure_period_unlocked(session, row.period)
    session.delete(row)
    session.commit()
    return {"id": item_id, "deleted": True}


@router.post("/doctor-periods/{period}/calculate", response_model=list[DoctorPeriodSummaryRead])
def calculate_period(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummaryRead]:
    _ensure_period_unlocked(session, period)
    return [_summary_read(session, row) for row in calculate_doctor_period(session, period)]


@router.get("/doctor-periods/{period}/summary", response_model=list[DoctorPeriodSummaryRead])
def period_summary(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummaryRead]:
    rows = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    return [_summary_read(session, row) for row in rows]


@router.get("/doctor-periods/{period}/overview", response_model=DoctorPeriodOverview)
def period_overview(period: str, session: SessionDep, _: CurrentUser) -> DoctorPeriodOverview:
    transactions = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period)).all()
    summaries = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    transaction_count_by_doctor: dict[int, int] = {}
    for transaction in transactions:
        transaction_count_by_doctor[transaction.doctor_id] = transaction_count_by_doctor.get(transaction.doctor_id, 0) + 1

    summary_rows: list[DoctorPeriodSummaryRead] = []
    for summary in sorted(summaries, key=lambda row: row.doctor_id):
        summary_rows.append(_summary_read(session, summary, transaction_count_by_doctor.get(summary.doctor_id, 0)))

    if any(row.status == PeriodStatus.LOCKED for row in summaries):
        status = "locked"
    elif summaries:
        status = "draft"
    elif transactions:
        status = "not_calculated"
    else:
        status = "empty"

    return DoctorPeriodOverview(
        period=period,
        status=status,
        doctor_count=len({row.doctor_id for row in transactions}),
        transaction_count=len(transactions),
        review_count=sum(1 for row in transactions if row.needs_review),
        total_bill=sum(row.total_bill_amount for row in transactions) if not summaries else sum(row.total_bill for row in summaries),
        treatment_fee_total=sum(row.treatment_fee_total for row in summaries),
        ortho_fee_total=sum(row.ortho_fee_total for row in summaries),
        total_fee=sum(row.total_fee for row in summaries),
        deduction=sum(row.deduction for row in summaries),
        tax=sum(row.tax for row in summaries),
        transfer_amount=sum(row.transfer_amount for row in summaries),
        summaries=summary_rows,
    )


@router.post("/doctor-periods/{period}/lock", response_model=list[DoctorPeriodSummaryRead])
def lock_period(period: str, session: SessionDep, _: CurrentUser) -> list[DoctorPeriodSummaryRead]:
    rows = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    if not rows:
        raise HTTPException(status_code=409, detail="Hitung fee dokter sebelum lock periode.")
    review_row = session.exec(select(DoctorTransaction).where(DoctorTransaction.period == period, DoctorTransaction.needs_review == True)).first()  # noqa: E712
    if review_row:
        raise HTTPException(status_code=409, detail="Selesaikan transaksi yang perlu review sebelum lock periode.")
    for row in rows:
        row.status = PeriodStatus.LOCKED
        session.add(row)
    session.commit()
    return [_summary_read(session, row) for row in rows]
