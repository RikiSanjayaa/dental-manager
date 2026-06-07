from datetime import date, datetime
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

    row.needs_review = treatment is None
    row.review_note = None if treatment else "Treatment belum ditemukan di master."
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


@router.post("/doctor-transactions", response_model=DoctorTransactionRead)
def create_transaction(payload: DoctorTransactionInput, session: SessionDep, _: CurrentUser) -> DoctorTransactionRead:
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
    session.delete(row)
    session.commit()
    return {"id": item_id, "deleted": True}


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
