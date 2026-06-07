from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlmodel import select

from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.importers import build_preview, commit_preview, detect_import_kind
from app.models import ImportFile, ImportStatus

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/files", response_model=ImportFile)
async def upload_file(session: SessionDep, user: CurrentUser, file: UploadFile = File(...)) -> ImportFile:
    settings = get_settings()
    suffix = Path(file.filename or "upload.xlsx").suffix or ".xlsx"
    stored = settings.upload_dir / f"{uuid4().hex}{suffix}"
    content = await file.read()
    stored.write_bytes(content)
    kind = detect_import_kind(stored)
    preview = build_preview(stored, kind)
    row = ImportFile(
        original_filename=file.filename or stored.name,
        stored_path=str(stored),
        kind=kind,
        rows_valid=preview.get("valid_rows", 0),
        rows_invalid=preview.get("invalid_rows", 0),
        warnings_count=len(preview.get("warnings", [])),
        preview_json=preview,
        errors_json=preview.get("errors", []),
        created_by_id=user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.get("/{import_id}/preview")
def get_preview(import_id: int, session: SessionDep, _: CurrentUser) -> dict:
    row = session.get(ImportFile, import_id)
    if not row:
        raise HTTPException(status_code=404, detail="Import tidak ditemukan")
    return row.preview_json


@router.post("/{import_id}/commit")
def commit_file(import_id: int, session: SessionDep, _: CurrentUser) -> dict:
    row = session.get(ImportFile, import_id)
    if not row:
        raise HTTPException(status_code=404, detail="Import tidak ditemukan")
    if row.status == ImportStatus.COMMITTED:
        raise HTTPException(status_code=409, detail="Import sudah di-commit")
    result = commit_preview(session, row.preview_json)
    row.status = ImportStatus.COMMITTED
    row.committed_at = datetime.utcnow()
    session.add(row)
    session.commit()
    return result


@router.get("/{import_id}/errors")
def get_errors(import_id: int, session: SessionDep, _: CurrentUser) -> list[dict]:
    row = session.get(ImportFile, import_id)
    if not row:
        raise HTTPException(status_code=404, detail="Import tidak ditemukan")
    return row.errors_json


@router.get("/files/recent", response_model=list[ImportFile])
def recent_imports(session: SessionDep, _: CurrentUser) -> list[ImportFile]:
    return session.exec(select(ImportFile).order_by(ImportFile.created_at.desc()).limit(20)).all()
