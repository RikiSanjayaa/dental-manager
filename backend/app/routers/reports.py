from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import CurrentUser, SessionDep
from app.reports import doctor_fee_pdf, doctor_fee_xlsx, payroll_slip_pdf, payroll_xlsx, template_xlsx

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/doctor-fees")
def export_doctor_fees(period: str, format: str, session: SessionDep, _: CurrentUser) -> StreamingResponse:
    if format == "xlsx":
        stream = doctor_fee_xlsx(session, period)
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="doctor-fees-{period}.xlsx"'},
        )
    if format == "pdf":
        stream = doctor_fee_pdf(session, period)
        return StreamingResponse(
            stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="doctor-fees-{period}.pdf"'},
        )
    raise HTTPException(status_code=400, detail="Format fee dokter mendukung xlsx atau pdf.")


@router.get("/payroll")
def export_payroll(period: str, format: str, session: SessionDep, _: CurrentUser) -> StreamingResponse:
    if format == "xlsx":
        stream = payroll_xlsx(session, period)
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="payroll-{period}.xlsx"'},
        )
    raise HTTPException(status_code=400, detail="Gunakan endpoint slip untuk PDF per karyawan.")


@router.get("/payroll/{period}/slips/{employee_id}.pdf")
def export_payroll_slip(period: str, employee_id: int, session: SessionDep, _: CurrentUser) -> StreamingResponse:
    stream = payroll_slip_pdf(session, period, employee_id)
    return StreamingResponse(
        stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="slip-gaji-{period}-{employee_id}.pdf"'},
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
