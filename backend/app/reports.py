from io import BytesIO

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlmodel import Session, select

from app.models import Doctor, DoctorPeriodSummary, Employee, PayrollRecord


def _money(value: float) -> str:
    return f"Rp {value:,.0f}".replace(",", ".")


def doctor_fee_xlsx(session: Session, period: str) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "Rekap Fee Dokter"
    ws.append(["Periode", period])
    ws.append([])
    ws.append(["Dokter", "Fee Perawatan", "Fee Ortho", "Total Fee", "Total Bill", "Potongan", "Pajak", "Nominal Transfer"])
    summaries = session.exec(select(DoctorPeriodSummary).where(DoctorPeriodSummary.period == period)).all()
    for summary in summaries:
        doctor = session.get(Doctor, summary.doctor_id)
        ws.append(
            [
                doctor.name if doctor else summary.doctor_id,
                summary.treatment_fee_total,
                summary.ortho_fee_total,
                summary.total_fee,
                summary.total_bill,
                summary.deduction,
                summary.tax,
                summary.transfer_amount,
            ]
        )
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def payroll_xlsx(session: Session, period: str) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "Rekap Payroll"
    ws.append(["Periode", period])
    ws.append([])
    ws.append(["Karyawan", "Jabatan", "Gaji Pokok", "Lembur", "Bonus", "Tunjangan", "BPJS", "Potongan", "PPh21", "Gaji Bersih"])
    records = session.exec(select(PayrollRecord).where(PayrollRecord.period == period)).all()
    for record in records:
        employee = session.get(Employee, record.employee_id)
        ws.append(
            [
                employee.name if employee else record.employee_id,
                employee.position if employee else None,
                record.base_salary,
                record.overtime_total,
                record.bonus,
                record.position_allowance,
                record.bpjs_deduction,
                record.other_deduction,
                record.pph21,
                record.net_salary,
            ]
        )
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


def payroll_slip_pdf(session: Session, period: str, employee_id: int) -> BytesIO:
    record = session.exec(select(PayrollRecord).where(PayrollRecord.period == period, PayrollRecord.employee_id == employee_id)).first()
    employee = session.get(Employee, employee_id)
    stream = BytesIO()
    pdf = canvas.Canvas(stream, pagesize=A4)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(72, 780, "SLIP GAJI")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(72, 760, f"Periode: {period}")
    pdf.drawString(72, 744, f"Nama: {employee.name if employee else employee_id}")
    pdf.drawString(72, 728, f"Jabatan: {employee.position if employee else '-'}")

    y = 700
    rows = []
    if record:
        rows = [
            ("Gaji Pokok", record.base_salary),
            ("Double shift", record.double_shift_fee),
            ("Masuk Hari Minggu", record.sunday_fee),
            ("Lembur", record.overtime_total),
            ("Bonus", record.bonus),
            ("Tunjangan", record.position_allowance),
            ("Potongan BPJS", -record.bpjs_deduction),
            ("Potongan Lain", -record.other_deduction),
            ("PPh 21", -record.pph21),
            ("Total diterima", record.net_salary),
        ]
    for label, amount in rows:
        pdf.drawString(72, y, label)
        pdf.drawRightString(420, y, _money(amount))
        y -= 18
    pdf.showPage()
    pdf.save()
    stream.seek(0)
    return stream


def template_xlsx(template_name: str) -> BytesIO:
    specs = {
        "treatments": {
            "sheet": "Treatments",
            "headers": ["code", "name", "category", "doctor_cost", "specialist_cost", "bhp_cost", "service_fee", "treatment_price", "notes"],
            "sample": ["KON-001", "Konsultasi A", "KONSULTASI", 50000, 150000, 0, 50000, 50000, "Contoh keterangan"],
        },
        "doctors": {
            "sheet": "Doctors",
            "headers": ["name", "sheet_name", "bank_name", "account_name", "account_number", "nik", "normal_fee_rate", "ortho_fee_rate", "tax_rate"],
            "sample": ["Drg. Dokter 1", "Dokter 1", "MANDIRI", "Drg. Dokter 1", "1610010012345", "5201125809840001", 0.6, 0.7, 0.025],
        },
        "employees": {
            "sheet": "Employees",
            "headers": ["name", "position", "join_date", "base_salary", "working_days", "bank_name", "account_name", "account_number"],
            "sample": ["Nama Karyawan 1", "Supervisor", "2026-05-01", 2712250, 25, "BSI", "Nama Karyawan 1", "1234567890"],
        },
        "attendance": {
            "sheet": "Attendance",
            "headers": [
                "period",
                "employee_name",
                "work_date",
                "timezone1_in",
                "timezone1_out",
                "timezone2_in",
                "timezone2_out",
                "late_minutes",
                "early_leave_minutes",
                "absent_minutes",
                "status_note",
            ],
            "sample": ["2026-05", "Nama Karyawan 1", "2026-05-02", "08:00", "16:00", "", "", 0, 0, 0, ""],
        },
        "doctor-transactions": {
            "sheet": "DoctorTransactions",
            "headers": [
                "period",
                "transaction_date",
                "doctor_name",
                "patient_name",
                "treatment_name",
                "qty",
                "discount_amount",
                "bhp_override",
                "price_override",
                "special_fee_amount",
                "fee_rate",
            ],
            "sample": ["2026-05", "2026-05-02", "Drg. Dokter 1", "Nama Pasien", "Konsultasi A", 1, 0, "", "", 0, ""],
        },
    }
    spec = specs[template_name]
    wb = Workbook()
    ws = wb.active
    ws.title = spec["sheet"]
    ws.append(spec["headers"])
    ws.append(spec["sample"])
    ws.freeze_panes = "A2"
    for column in ws.columns:
        max_length = max(len(str(cell.value or "")) for cell in column)
        ws.column_dimensions[column[0].column_letter].width = min(max(max_length + 2, 12), 32)
    notes = wb.create_sheet("Notes")
    notes.append(["Rule"])
    notes.append(["Jangan isi formula Excel. Isi value final saja. Formula tanpa cached value akan ditolak importer."])
    notes.append(["Header harus tetap sama seperti template."])
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream
