from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlmodel import select

from app.config import get_settings
from app.dependencies import CurrentUser, SessionDep
from app.models import DoctorPeriodSummary, PayrollRecord, PeriodStatus, ReportArchive, User
from app.reports import doctor_fee_pdf, doctor_fee_pdf_zip, doctor_fee_xlsx, payroll_slip_pdf, payroll_xlsx, template_xlsx

router = APIRouter(prefix="/reports", tags=["reports"])


REPORT_RETENTION_DAYS = 90


class ReportArchiveRead(BaseModel):
    id: int
    report_type: str
    period: str
    status: str
    format: str
    filename: str
    media_type: str
    file_size: int
    created_by_name: str | None = None
    created_at: datetime
    expires_at: datetime


def _archive_dir() -> Path:
    path = get_settings().upload_dir / "reports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cleanup_expired_archives(session: SessionDep) -> None:
    now = datetime.utcnow()
    expired = session.exec(select(ReportArchive).where(ReportArchive.expires_at <= now)).all()
    for row in expired:
        path = Path(row.stored_path)
        if path.exists():
            path.unlink()
        session.delete(row)
    if expired:
        session.commit()


def _archive_read(row: ReportArchive) -> ReportArchiveRead:
    return ReportArchiveRead(
        id=row.id or 0,
        report_type=row.report_type,
        period=row.period,
        status=row.status,
        format=row.format,
        filename=row.filename,
        media_type=row.media_type,
        file_size=row.file_size,
        created_by_name=row.created_by_name,
        created_at=row.created_at,
        expires_at=row.expires_at,
    )


def _doctor_fee_export_status(session: SessionDep, period: str) -> str:
    summaries = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    return "final" if any(row.status == PeriodStatus.LOCKED for row in summaries) else "draft"


def _payroll_export_status(session: SessionDep, period: str) -> str:
    rows = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    return "final" if rows and all(row.status == PeriodStatus.LOCKED for row in rows) else "draft"


def _archive_stream(
    session: SessionDep,
    user: User,
    stream,
    *,
    report_type: str,
    period: str,
    status: str,
    format: str,
    filename: str,
    media_type: str,
) -> bytes:
    data = stream.getvalue()
    stored_name = f"{uuid4().hex}-{filename}"
    stored_path = _archive_dir() / stored_name
    stored_path.write_bytes(data)
    archive = ReportArchive(
        report_type=report_type,
        period=period,
        status=status,
        format=format,
        filename=filename,
        stored_path=str(stored_path),
        media_type=media_type,
        file_size=len(data),
        created_by_id=user.id,
        created_by_name=user.full_name,
        expires_at=datetime.utcnow() + timedelta(days=REPORT_RETENTION_DAYS),
    )
    session.add(archive)
    session.commit()
    return data


@router.get("/archive", response_model=list[ReportArchiveRead])
def list_report_archive(session: SessionDep, _: CurrentUser) -> list[ReportArchiveRead]:
    _cleanup_expired_archives(session)
    rows = session.exec(select(ReportArchive).order_by(ReportArchive.created_at.desc())).all()
    return [_archive_read(row) for row in rows]


@router.get("/archive/{archive_id}/download")
def download_report_archive(archive_id: int, session: SessionDep, _: CurrentUser) -> FileResponse:
    _cleanup_expired_archives(session)
    row = session.get(ReportArchive, archive_id)
    if not row or not Path(row.stored_path).exists():
        raise HTTPException(status_code=404, detail="Arsip laporan tidak ditemukan atau sudah expired.")
    return FileResponse(
        row.stored_path,
        media_type=row.media_type,
        filename=row.filename,
    )


@router.delete("/archive/{archive_id}")
def delete_report_archive(archive_id: int, session: SessionDep, _: CurrentUser) -> dict[str, str]:
    row = session.get(ReportArchive, archive_id)
    if not row:
        raise HTTPException(status_code=404, detail="Arsip laporan tidak ditemukan.")
    path = Path(row.stored_path)
    if path.exists():
        path.unlink()
    session.delete(row)
    session.commit()
    return {"status": "ok"}


@router.get("/doctor-fees")
def export_doctor_fees(period: str, format: str, session: SessionDep, user: CurrentUser) -> StreamingResponse:
    if format == "xlsx":
        stream = doctor_fee_xlsx(session, period)
        filename = f"doctor-fees-{period}.xlsx"
        data = _archive_stream(
            session,
            user,
            stream,
            report_type="doctor_fees",
            period=period,
            status=_doctor_fee_export_status(session, period),
            format="xlsx",
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        return StreamingResponse(
            iter([data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    if format == "pdf":
        stream = doctor_fee_pdf(session, period)
        filename = f"doctor-fees-{period}.pdf"
        data = _archive_stream(
            session,
            user,
            stream,
            report_type="doctor_fees",
            period=period,
            status=_doctor_fee_export_status(session, period),
            format="pdf",
            filename=filename,
            media_type="application/pdf",
        )
        return StreamingResponse(
            iter([data]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    if format in {"zip", "pdf-zip"}:
        stream = doctor_fee_pdf_zip(session, period)
        filename = f"doctor-fees-{period}-per-dokter.zip"
        data = _archive_stream(
            session,
            user,
            stream,
            report_type="doctor_fees",
            period=period,
            status=_doctor_fee_export_status(session, period),
            format="zip",
            filename=filename,
            media_type="application/zip",
        )
        return StreamingResponse(
            iter([data]),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    raise HTTPException(status_code=400, detail="Format fee dokter mendukung xlsx, pdf, atau zip.")


@router.get("/payroll")
def export_payroll(period: str, format: str, session: SessionDep, user: CurrentUser) -> StreamingResponse:
    if format == "xlsx":
        stream = payroll_xlsx(session, period)
        filename = f"payroll-{period}.xlsx"
        data = _archive_stream(
            session,
            user,
            stream,
            report_type="payroll",
            period=period,
            status=_payroll_export_status(session, period),
            format="xlsx",
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        return StreamingResponse(
            iter([data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    raise HTTPException(status_code=400, detail="Gunakan endpoint slip untuk PDF per karyawan.")


@router.get("/payroll/{period}/slips/{employee_id}.pdf")
def export_payroll_slip(period: str, employee_id: int, session: SessionDep, user: CurrentUser) -> StreamingResponse:
    stream = payroll_slip_pdf(session, period, employee_id)
    filename = f"slip-gaji-{period}-{employee_id}.pdf"
    data = _archive_stream(
        session,
        user,
        stream,
        report_type="payroll_slip",
        period=period,
        status=_payroll_export_status(session, period),
        format="pdf",
        filename=filename,
        media_type="application/pdf",
    )
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/templates/{template_name}.xlsx")
def export_template(template_name: str) -> StreamingResponse:
    allowed = {"treatments", "doctors", "employees", "attendance", "doctor-transactions"}
    if template_name not in allowed:
        raise HTTPException(status_code=404, detail="Template tidak ditemukan.")
    stream = template_xlsx(template_name)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{template_name}-template.xlsx"'},
    )
