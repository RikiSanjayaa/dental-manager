import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { adminOnly, currentUser, type AppVariables } from "../auth";
import { all, recordAudit } from "../db";
import { nowIso } from "../http";
import type { Env } from "../types";
import { makeWorkbook, xlsxResponse } from "../xlsx";

export const reportsRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type ReportFile = {
  bytes: ArrayBuffer | Uint8Array;
  filename: string;
  mediaType: string;
  reportType: string;
  period: string;
  status: string;
  format: string;
};

export function templateResponse(templateNameParam: string) {
  const templateName = templateNameParam.replace(/\.xlsx$/i, "");
  const templates: Record<string, Record<string, unknown>[]> = {
    "treatments": [
      { code: "SC-001", name: "Scaling Rahang Atas Bawah", category: "PERAWATAN", doctor_cost: 150000, specialist_cost: 0, bhp_cost: 25000, service_fee: 0, treatment_price: 250000, notes: "", is_active: "aktif" },
    ],
    "doctors": [
      { name: "Drg. Contoh", bank_name: "BCA", account_name: "Drg. Contoh", account_number: "1234567890", nik: "", normal_fee_rate: 0.6, ortho_fee_rate: 0.7, tax_rate: 0.025, is_active: "aktif" },
    ],
    "employees": [
      { name: "Karyawan Contoh", attendance_id: "EMP001", position: "Staff", join_date: "2026-01-01", base_salary: 2712250, working_days: 25, is_training: "tidak", bank_name: "BCA", account_name: "Karyawan Contoh", account_number: "1234567890", is_active: "aktif" },
    ],
    "doctor-transactions": [
      { transaction_date: "2026-07-01", doctor_name: "Drg. Contoh", patient_name: "Pasien Contoh", treatment_name: "Scaling Rahang Atas Bawah", qty: 1, discount_amount: 0, bhp_override: "", price_override: "", special_fee_amount: 0, fee_rate: "" },
    ],
    "attendance": [
      { work_date: "2026-07-01", attendance_id: "EMP001", employee_name: "Karyawan Contoh", timezone1_in: "08:00", timezone1_out: "16:00", timezone2_in: "", timezone2_out: "", is_holiday: "", status_note: "" },
    ],
  };
  const rows = templates[templateName];
  if (!rows) throw new HTTPException(404, { message: "Template tidak ditemukan." });
  return xlsxResponse(makeWorkbook([{ name: templateName, rows }]), `${templateName}.xlsx`);
}

reportsRoutes.get("/archive", currentUser, adminOnly, async (c) => {
  return c.json(
    await all<Record<string, unknown>>(c.env.DB.prepare("SELECT * FROM reportarchive ORDER BY created_at DESC"))
  );
});

reportsRoutes.get("/archive/:id/download", currentUser, adminOnly, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM reportarchive WHERE id = ?")
    .bind(Number(c.req.param("id")))
    .first<{ stored_path: string; filename: string; media_type: string }>();
  if (!row) throw new HTTPException(404, { message: "Arsip laporan tidak ditemukan." });
  const object = await c.env.REPORTS.get(row.stored_path);
  if (!object) throw new HTTPException(404, { message: "File arsip laporan tidak ditemukan." });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.media_type,
      "Content-Disposition": `attachment; filename="${row.filename}"`,
    },
  });
});

reportsRoutes.delete("/archive/:id", currentUser, adminOnly, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM reportarchive WHERE id = ?")
    .bind(id)
    .first<{ stored_path: string; report_type: string; period: string; format: string }>();
  if (!row) throw new HTTPException(404, { message: "Arsip laporan tidak ditemukan." });
  await c.env.REPORTS.delete(row.stored_path);
  await c.env.DB.prepare("DELETE FROM reportarchive WHERE id = ?").bind(id).run();
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "delete",
    entity_type: "report_archive",
    entity_id: id,
    description: "Menghapus arsip laporan.",
    metadata: { report_type: row.report_type, period: row.period, format: row.format },
  });
  return c.json({ status: "ok" });
});

reportsRoutes.get("/templates/:template_name", currentUser, async (c) => {
  return templateResponse(c.req.param("template_name") ?? "");
});

reportsRoutes.get("/doctor-fees", currentUser, async (c) => {
  const file = await buildDoctorFeeReport(c.env, c.req.query("period") || currentPeriod(), c.req.query("format") || "xlsx");
  return archiveAndDownload(c, file);
});

reportsRoutes.get("/payroll", currentUser, async (c) => {
  const file = await buildPayrollReport(c.env, c.req.query("period") || currentPeriod(), c.req.query("format") || "xlsx");
  return archiveAndDownload(c, file);
});

reportsRoutes.get("/payroll/:period/slips/:employee_id.pdf", currentUser, async (c) => {
  const period = c.req.param("period") ?? currentPeriod();
  const employeeId = Number((c.req.param("employee_id") ?? c.req.path.split("/").pop() ?? "").replace(/\.pdf$/i, ""));
  const summary = (await payrollSummaries(c.env, period)).find((row) => Number(row.employee_id) === employeeId);
  if (!summary?.id) throw new HTTPException(404, { message: "Slip payroll belum tersedia." });
  const bytes = await makePayrollSlipPdf(await getClinicName(c.env), period, summary);
  return archiveAndDownload(c, {
    bytes,
    filename: `slip-gaji-${period}-${slug(String(summary.employee_name ?? employeeId))}.pdf`,
    mediaType: "application/pdf",
    reportType: "payroll_slip",
    period,
    status: String(summary.status) === "locked" ? "final" : "draft",
    format: "pdf",
  });
});

async function archiveAndDownload(c: Context<{ Bindings: Env; Variables: AppVariables }>, file: ReportFile) {
  const user = c.get("user");
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  const storedPath = `${file.reportType}/${file.period}/${Date.now()}-${file.filename}`;
  await c.env.REPORTS.put(storedPath, bytes, { httpMetadata: { contentType: file.mediaType } });
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString().replace("T", " ").replace("Z", "");
  const result = await c.env.DB.prepare(
    `INSERT INTO reportarchive
      (report_type, period, status, format, filename, stored_path, media_type, file_size, created_by_id, created_by_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(file.reportType, file.period, file.status, file.format, file.filename, storedPath, file.mediaType, bytes.byteLength, user.id, user.full_name, createdAt, expiresAt)
    .run();
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "export",
    entity_type: "report_archive",
    entity_id: result.meta.last_row_id,
    description: `Export ${file.filename}.`,
    metadata: { report_type: file.reportType, period: file.period, format: file.format },
  });
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}

export async function buildDoctorFeeReport(env: Env, period: string, format: string): Promise<ReportFile> {
  const summaries = await doctorFeeSummaries(env, period);
  const transactions = await doctorTransactions(env, period);
  const status = summaries.length && summaries.every((row) => row.status === "locked") ? "final" : "draft";
  const reportClinicName = await getClinicName(env);
  if (format === "xlsx") {
    return {
      bytes: makeWorkbook([
        { name: "Rekapan FEE DOKTER", rows: doctorFeeSummaryRows(summaries, period, status), freeze: "A2" },
        ...summaries.map((summary) => ({
          name: safeSheetTitle(`TS. ${String(summary.doctor_name ?? summary.doctor_id)}`),
          rows: doctorFeeDetailRows(
            transactions.filter((row) => Number(row.doctor_id) === Number(summary.doctor_id)),
            summary,
            reportClinicName,
            period,
            status
          ),
          freeze: "A5",
        })),
      ]),
      filename: `doctor-fees-${period}.xlsx`,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      reportType: "doctor_fees",
      period,
      status,
      format: "xlsx",
    };
  }
  if (format === "zip") {
    const entries: Record<string, Uint8Array> = {};
    for (const summary of summaries) {
      entries[`doctor-fees-${period}-${slug(String(summary.doctor_name ?? summary.doctor_id))}.pdf`] = await makeDoctorFeePdf(reportClinicName, period, status, [summary], transactions, false);
    }
    return {
      bytes: zipSync(entries),
      filename: `doctor-fees-${period}-per-dokter.zip`,
      mediaType: "application/zip",
      reportType: "doctor_fees",
      period,
      status,
      format: "zip",
    };
  }
  return {
    bytes: await makeDoctorFeePdf(reportClinicName, period, status, summaries, transactions, true),
    filename: `doctor-fees-${period}.pdf`,
    mediaType: "application/pdf",
    reportType: "doctor_fees",
    period,
    status,
    format: "pdf",
  };
}

async function buildPayrollReport(env: Env, period: string, format: string): Promise<ReportFile> {
  const summaries = await payrollSummaries(env, period);
  const payrollRows = summaries.filter((row) => row.id != null);
  const attendance = await all<Record<string, unknown>>(env.DB.prepare("SELECT * FROM attendancerecord WHERE period = ? ORDER BY work_date, id").bind(period));
  const status = payrollRows.length && payrollRows.every((row) => row.status === "locked") ? "final" : "draft";
  const reportClinicName = await getClinicName(env);
  if (format === "xlsx") {
    return {
      bytes: makeWorkbook([
        { name: "Form Gaji Karyawan", rows: payrollRecapRows(summaries, period), freeze: "A2" },
        { name: "REKAPAN LEMBUR", rows: overtimeRows(attendance), freeze: "A2" },
        { name: "SLIP GAJI", rows: payrollSlipRows(payrollRows, reportClinicName, period) },
      ]),
      filename: `payroll-${period}.xlsx`,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      reportType: "payroll",
      period,
      status,
      format: "xlsx",
    };
  }
  if (format === "zip") {
    const entries: Record<string, Uint8Array> = {};
    for (const row of payrollRows) {
      entries[`slip-gaji-${period}-${slug(String(row.employee_name ?? row.employee_id))}.pdf`] = await makePayrollSlipPdf(reportClinicName, period, row);
    }
    return {
      bytes: zipSync(entries),
      filename: `payroll-${period}-per-karyawan.zip`,
      mediaType: "application/zip",
      reportType: "payroll",
      period,
      status,
      format: "zip",
    };
  }
  return {
    bytes: await makePayrollPdf(reportClinicName, period, status, payrollRows),
    filename: `payroll-${period}.pdf`,
    mediaType: "application/pdf",
    reportType: "payroll",
    period,
    status,
    format: "pdf",
  };
}

async function doctorFeeSummaries(env: Env, period: string) {
  return all<Record<string, unknown>>(
    env.DB.prepare(
      `SELECT s.*, d.name AS doctor_name, d.bank_name, d.account_name, d.account_number,
              COALESCE(tx.transaction_count, 0) AS transaction_count
       FROM doctorperiodsummary s
       LEFT JOIN doctor d ON d.id = s.doctor_id
       LEFT JOIN (
         SELECT period, doctor_id, COUNT(*) AS transaction_count
         FROM doctortransaction
         WHERE period = ?
         GROUP BY period, doctor_id
       ) tx ON tx.period = s.period AND tx.doctor_id = s.doctor_id
       WHERE s.period = ?
       ORDER BY d.name, s.doctor_id`
    ).bind(period, period)
  );
}

async function doctorTransactions(env: Env, period: string) {
  return all<Record<string, unknown>>(
    env.DB.prepare(
      `SELECT t.*, d.name AS doctor_name, tr.name AS treatment_name,
              COALESCE(t.bhp_override, tr.bhp_cost, 0) AS bhp_amount,
              COALESCE(t.price_override, tr.treatment_price, 0) AS price_amount
       FROM doctortransaction t
       LEFT JOIN doctor d ON d.id = t.doctor_id
       LEFT JOIN treatment tr ON tr.id = t.treatment_id
       WHERE t.period = ?
       ORDER BY t.transaction_date, t.id`
    ).bind(period)
  );
}

async function payrollSummaries(env: Env, period: string) {
  return all<Record<string, unknown>>(
    env.DB.prepare(
      `SELECT p.id, e.id AS employee_id, e.name AS employee_name, e.position, e.join_date,
              COALESCE(p.base_salary, e.base_salary, 0) AS base_salary,
              COALESCE(p.working_days, e.working_days, 25) AS working_days,
              COALESCE(p.double_shift_fee, 0) AS double_shift_fee,
              COALESCE(p.sunday_fee, 0) AS sunday_fee,
              COALESCE(p.overtime_minutes, 0) AS overtime_minutes,
              COALESCE(p.izin_count, 0) AS izin_count,
              COALESCE(p.sakit_count, 0) AS sakit_count,
              COALESCE(p.cuti_count, 0) AS cuti_count,
              COALESCE(p.alpha_count, 0) AS alpha_count,
              COALESCE(p.double_shift_count, 0) AS double_shift_count,
              COALESCE(p.overtime_rate_per_minute, 0) AS overtime_rate_per_minute,
              COALESCE(p.overtime_total, 0) AS overtime_total,
              COALESCE(p.bonus, 0) AS bonus,
              COALESCE(p.position_allowance, 0) AS position_allowance,
              COALESCE(p.bpjs_deduction, 0) AS bpjs_deduction,
              COALESCE(p.other_deduction, 0) AS other_deduction,
              COALESCE(p.pph21, 0) AS pph21,
              COALESCE(p.bpjs_deduction, 0) + COALESCE(p.other_deduction, 0) + COALESCE(p.pph21, 0) AS total_deduction,
              COALESCE(p.net_salary, 0) AS net_salary,
              COALESCE(p.payment_method, 'transfer') AS payment_method,
              COALESCE(p.bank_name, e.bank_name) AS bank_name,
              COALESCE(p.account_name, e.account_name, e.name) AS account_name,
              COALESCE(p.account_number, e.account_number) AS account_number,
              COALESCE(p.status, 'not_calculated') AS status,
              COALESCE(p.needs_review, 0) AS needs_review
       FROM employee e
       LEFT JOIN payrollrecord p ON p.employee_id = e.id AND p.period = ?
       WHERE e.is_active = 1
       ORDER BY e.id`
    ).bind(period)
  );
}

async function getClinicName(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM appsetting WHERE key = 'clinic_name' OR key = 'report_clinic_name' ORDER BY key DESC LIMIT 1").first<{ value: string }>();
  return row?.value || "Dental Manager";
}

function doctorFeeSummaryRows(rows: Record<string, unknown>[], period: string, status: string) {
  const mapped: Record<string, unknown>[] = rows.map((row, index) => ({
    NO: index + 1,
    NIP: row.nik ?? "",
    NAMA: row.doctor_name ?? `Dokter ${row.doctor_id}`,
    "FEE DOKTER": Number(row.treatment_fee_total || 0),
    "FEE ORTHODONTI": Number(row.ortho_fee_total || 0),
    "TOTAL FEE DOKTER": Number(row.total_fee || 0),
    "TOTAL BILL PASIEN": Number(row.total_bill || 0),
    "Potongan dokter": Number(row.deduction || 0),
    Pajak: Number(row.tax || 0),
    "NOMINAL TRANSFER": Number(row.transfer_amount || 0),
    "BANK TRANSFER": row.bank_name ?? "",
    "NO REKENING": row.account_number ?? "",
    PERIODE: periodLabel(period),
    STATUS: status.toUpperCase(),
  }));
  if (mapped.length) {
    mapped.push({
      NO: "",
      NIP: "",
      NAMA: "TOTAL",
      "FEE DOKTER": sum(rows, "treatment_fee_total"),
      "FEE ORTHODONTI": sum(rows, "ortho_fee_total"),
      "TOTAL FEE DOKTER": sum(rows, "total_fee"),
      "TOTAL BILL PASIEN": sum(rows, "total_bill"),
      "Potongan dokter": sum(rows, "deduction"),
      Pajak: sum(rows, "tax"),
      "NOMINAL TRANSFER": sum(rows, "transfer_amount"),
      "BANK TRANSFER": "",
      "NO REKENING": "",
      PERIODE: periodLabel(period),
      STATUS: status.toUpperCase(),
    });
  }
  return mapped;
}

function doctorFeeDetailRows(rows: Record<string, unknown>[], summary: Record<string, unknown>, clinic: string, period: string, status: string) {
  const doctorName = String(summary.doctor_name ?? `Dokter ${summary.doctor_id}`);
  const detail: Record<string, unknown>[] = rows.map((row) => ({
    Tanggal: dateOnly(row.transaction_date),
    "Nama Pasien": row.patient_name ?? "",
    Perawatan: row.treatment_name_snapshot ?? row.treatment_name ?? "",
    BHP: Number(row.bhp_cost_snapshot || row.bhp_amount || 0),
    "Biaya Perawatan": Number(row.treatment_price_snapshot || row.price_amount || 0),
    QTY: Number(row.qty || 0),
    Diskon: Number(row.discount_amount || 0),
    "BIAYA JASA": Number(row.service_amount || 0),
    "FEE DOKTER": Number(row.doctor_fee_amount || 0),
    "FEE KHUSUS BEHEL": Number(row.special_fee_amount || 0),
    "TOTAL BIAYA PERAWATAN": Number(row.total_bill_amount || 0),
  }));
  return [
    { Tanggal: clinic, "Nama Pasien": "SLIP PENDAPATAN DOKTER", Perawatan: doctorName, BHP: periodLabel(period), "Biaya Perawatan": status.toUpperCase() },
    ...detail,
    {
      Tanggal: "",
      "Nama Pasien": "",
      Perawatan: `TOTAL FEE ${doctorName}`,
      BHP: "",
      "Biaya Perawatan": "",
      QTY: "",
      Diskon: sum(rows, "discount_amount"),
      "BIAYA JASA": sum(rows, "service_amount"),
      "FEE DOKTER": Number(summary.treatment_fee_total || 0),
      "FEE KHUSUS BEHEL": Number(summary.ortho_fee_total || 0),
      "TOTAL BIAYA PERAWATAN": Number(summary.total_bill || 0),
    },
    { Tanggal: "", "Nama Pasien": "", Perawatan: "Potongan", BHP: Number(summary.deduction || 0), "Biaya Perawatan": "Pajak", QTY: Number(summary.tax || 0) },
    { Tanggal: "", "Nama Pasien": "", Perawatan: "Nominal Transfer", BHP: Number(summary.transfer_amount || 0) },
  ];
}

function payrollRecapRows(rows: Record<string, unknown>[], period: string) {
  const mapped: Record<string, unknown>[] = rows.map((row, index) => ({
    No: index + 1,
    "Nama Karyawan": row.employee_name ?? `Karyawan ${row.employee_id}`,
    Jabatan: row.position ?? "",
    "Join Date": dateOnly(row.join_date),
    "Gaji Pokok": Number(row.base_salary || 0),
    "Jumlah Hari Kerja": Number(row.working_days || 0),
    "Nerus (double shift)": Number(row.double_shift_count || 0),
    Izin: Number(row.izin_count || 0),
    Sakit: Number(row.sakit_count || 0),
    Cuti: Number(row.cuti_count || 0),
    Alpha: Number(row.alpha_count || 0),
    "fee double shift (nerus)": Number(row.double_shift_fee || 0),
    "Masuk Hari Libur": Number(row.sunday_fee || 0),
    "Lembur (menit)": Number(row.overtime_minutes || 0),
    "Tarif Lembur (menit)": Number(row.overtime_rate_per_minute || 0),
    "Total Lembur": Number(row.overtime_total || 0),
    Bonus: Number(row.bonus || 0),
    "Tunjangan Jabatan": Number(row.position_allowance || 0),
    "Potongan BPJS TK 2% JHT": Number(row.bpjs_deduction || 0),
    "Potongan Lain": Number(row.other_deduction || 0),
    "PPh 21": Number(row.pph21 || 0),
    "Total Gaji Bersih": Number(row.net_salary || 0),
    Pembayaran: row.payment_method ?? "transfer",
    "Nama Bank": row.bank_name ?? "",
    "Nama Penerima": row.account_name ?? row.employee_name ?? "",
    "no rekening": row.account_number ?? "",
    "nominal transfer": Number(row.net_salary || 0),
    Periode: periodLabel(period),
    Status: row.status ?? "not_calculated",
  }));
  if (mapped.length) {
    mapped.push({
      No: "",
      "Nama Karyawan": "TOTAL",
      Jabatan: "",
      "Join Date": "",
      "Gaji Pokok": sum(rows, "base_salary"),
      "Jumlah Hari Kerja": "",
      "Nerus (double shift)": sum(rows, "double_shift_count"),
      Izin: sum(rows, "izin_count"),
      Sakit: sum(rows, "sakit_count"),
      Cuti: sum(rows, "cuti_count"),
      Alpha: sum(rows, "alpha_count"),
      "fee double shift (nerus)": sum(rows, "double_shift_fee"),
      "Masuk Hari Libur": sum(rows, "sunday_fee"),
      "Lembur (menit)": sum(rows, "overtime_minutes"),
      "Tarif Lembur (menit)": "",
      "Total Lembur": sum(rows, "overtime_total"),
      Bonus: sum(rows, "bonus"),
      "Tunjangan Jabatan": sum(rows, "position_allowance"),
      "Potongan BPJS TK 2% JHT": sum(rows, "bpjs_deduction"),
      "Potongan Lain": sum(rows, "other_deduction"),
      "PPh 21": sum(rows, "pph21"),
      "Total Gaji Bersih": sum(rows, "net_salary"),
      Pembayaran: "",
      "Nama Bank": "",
      "Nama Penerima": "",
      "no rekening": "",
      "nominal transfer": sum(rows, "net_salary"),
      Periode: periodLabel(period),
      Status: "",
    });
  }
  return mapped;
}

function overtimeRows(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => Number(row.overtime_minutes || 0) > 0)
    .map((row) => ({
      Nama: row.employee_name_snapshot ?? row.employee_name ?? row.employee_id ?? "",
      Tanggal: dateOnly(row.work_date),
      "Timezone I": `${row.timezone1_in ?? "-"} / ${row.timezone1_out ?? "-"}`,
      "Timezone II": `${row.timezone2_in ?? "-"} / ${row.timezone2_out ?? "-"}`,
      "Menit Lembur": Number(row.overtime_minutes || 0),
      Catatan: row.status_note ?? "",
    }));
}

function payrollSlipRows(rows: Record<string, unknown>[], clinic: string, period: string) {
  return rows.flatMap((row) => [
    { "SLIP GAJI": clinic, Keterangan: `Periode ${periodLabel(period)}` },
    { "SLIP GAJI": "Nama Karyawan", Keterangan: row.employee_name ?? "" },
    { "SLIP GAJI": "Jabatan", Keterangan: row.position ?? "" },
    { "SLIP GAJI": "Gaji Pokok", Keterangan: Number(row.base_salary || 0) },
    { "SLIP GAJI": "Lembur", Keterangan: Number(row.overtime_total || 0) },
    { "SLIP GAJI": "Bonus", Keterangan: Number(row.bonus || 0) },
    { "SLIP GAJI": "Tunjangan Jabatan", Keterangan: Number(row.position_allowance || 0) },
    { "SLIP GAJI": "Potongan", Keterangan: Number(row.total_deduction || 0) },
    { "SLIP GAJI": "Nominal Transfer", Keterangan: Number(row.net_salary || 0) },
    { "SLIP GAJI": "", Keterangan: "" },
  ]);
}

type PdfColumn = { header: string; key: string; width: number; align?: "left" | "right" | "center" };
type PdfFonts = { font: PDFFont; bold: PDFFont };

async function makeDoctorFeePdf(clinic: string, period: string, status: string, summaries: Record<string, unknown>[], transactions: Record<string, unknown>[], includeSummary: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  if (includeSummary) {
    const page = pdf.addPage([842, 595]);
    let y = drawPdfHeader(page, fonts, "REKAPAN FEE DOKTER", clinic, period, status);
    const rows: Record<string, unknown>[] = summaries.map((row, index) => ({
      no: index + 1,
      nama: row.doctor_name ?? `Dokter ${row.doctor_id}`,
      fee: money(row.treatment_fee_total),
      ortho: money(row.ortho_fee_total),
      bill: money(row.total_bill),
      pajak: money(row.tax),
      transfer: money(row.transfer_amount),
      bank: row.bank_name ?? "-",
      rekening: row.account_number ?? "-",
    }));
    rows.push({ no: "", nama: "TOTAL", fee: money(sum(summaries, "treatment_fee_total")), ortho: money(sum(summaries, "ortho_fee_total")), bill: money(sum(summaries, "total_bill")), pajak: money(sum(summaries, "tax")), transfer: money(sum(summaries, "transfer_amount")), bank: "", rekening: "" });
    drawTable(page, fonts, rows, [
      { header: "NO", key: "no", width: 28, align: "center" },
      { header: "NAMA", key: "nama", width: 126 },
      { header: "FEE DOKTER", key: "fee", width: 88, align: "right" },
      { header: "FEE ORTHO", key: "ortho", width: 82, align: "right" },
      { header: "TOTAL BILL", key: "bill", width: 90, align: "right" },
      { header: "PAJAK", key: "pajak", width: 76, align: "right" },
      { header: "TRANSFER", key: "transfer", width: 90, align: "right" },
      { header: "BANK", key: "bank", width: 82 },
      { header: "NO REKENING", key: "rekening", width: 102 },
    ], 28, y);
  }
  for (const summary of summaries) {
    const doctorRows = transactions.filter((row) => Number(row.doctor_id) === Number(summary.doctor_id));
    for (const chunk of chunks(doctorRows, 18)) {
      const page = pdf.addPage([842, 595]);
      const doctorName = String(summary.doctor_name ?? `Dokter ${summary.doctor_id}`);
      let y = drawPdfHeader(page, fonts, `SLIP PENDAPATAN DOKTER ${doctorName}`, clinic, period, status);
      y = drawKeyValues(page, fonts, [
        ["Transaksi", String(doctorRows.length)],
        ["Fee Perawatan", money(summary.treatment_fee_total)],
        ["Fee Ortho", money(summary.ortho_fee_total)],
        ["Nominal Transfer", money(summary.transfer_amount)],
      ], 30, y);
      const tableRows = chunk.map((row) => ({
        tanggal: dateOnly(row.transaction_date),
        pasien: row.patient_name ?? "",
        perawatan: row.treatment_name_snapshot ?? row.treatment_name ?? "",
        qty: row.qty ?? 0,
        diskon: money(row.discount_amount),
        jasa: money(row.service_amount),
        fee: money(row.doctor_fee_amount),
        ortho: money(row.special_fee_amount),
        total: money(row.total_bill_amount),
      }));
      drawTable(page, fonts, tableRows, [
        { header: "Tanggal", key: "tanggal", width: 58 },
        { header: "Nama Pasien", key: "pasien", width: 105 },
        { header: "Perawatan", key: "perawatan", width: 180 },
        { header: "QTY", key: "qty", width: 34, align: "right" },
        { header: "Diskon", key: "diskon", width: 72, align: "right" },
        { header: "Biaya Jasa", key: "jasa", width: 80, align: "right" },
        { header: "Fee Dokter", key: "fee", width: 80, align: "right" },
        { header: "Fee Behel", key: "ortho", width: 78, align: "right" },
        { header: "Total", key: "total", width: 80, align: "right" },
      ], 30, y - 10, false);
    }
  }
  return pdf.save();
}

async function makePayrollPdf(clinic: string, period: string, status: string, rows: Record<string, unknown>[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const page = pdf.addPage([842, 595]);
  const y = drawPdfHeader(page, fonts, "REKAP PAYROLL KARYAWAN", clinic, period, status);
  const tableRows: Record<string, unknown>[] = rows.map((row, index) => ({
    no: index + 1,
    nama: row.employee_name ?? `Karyawan ${row.employee_id}`,
    jabatan: row.position ?? "-",
    pokok: money(row.base_salary),
    lembur: money(row.overtime_total),
    potongan: money(row.total_deduction),
    transfer: money(row.net_salary),
    bank: row.bank_name ?? "-",
    rekening: row.account_number ?? "-",
  }));
  tableRows.push({ no: "", nama: "TOTAL", jabatan: "", pokok: money(sum(rows, "base_salary")), lembur: money(sum(rows, "overtime_total")), potongan: money(sum(rows, "total_deduction")), transfer: money(sum(rows, "net_salary")), bank: "", rekening: "" });
  drawTable(page, fonts, tableRows, [
    { header: "NO", key: "no", width: 28, align: "center" },
    { header: "NAMA", key: "nama", width: 124 },
    { header: "JABATAN", key: "jabatan", width: 100 },
    { header: "GAJI POKOK", key: "pokok", width: 94, align: "right" },
    { header: "LEMBUR", key: "lembur", width: 84, align: "right" },
    { header: "POTONGAN", key: "potongan", width: 86, align: "right" },
    { header: "TRANSFER", key: "transfer", width: 94, align: "right" },
    { header: "BANK", key: "bank", width: 74 },
    { header: "REKENING", key: "rekening", width: 98 },
  ], 30, y);
  for (const row of rows) {
    drawPayrollSlipPage(pdf.addPage([595, 842]), fonts, clinic, period, row);
  }
  return pdf.save();
}

async function makePayrollSlipPdf(clinic: string, period: string, row: Record<string, unknown>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  drawPayrollSlipPage(pdf.addPage([595, 842]), fonts, clinic, period, row);
  return pdf.save();
}

function drawPayrollSlipPage(page: PDFPage, fonts: PdfFonts, clinic: string, period: string, row: Record<string, unknown>) {
  const x = 42;
  const width = 510;
  drawCentered(page, fonts.bold, `SLIP GAJI - ${clinic}`, 297, 786, 15);

  const identityRows: Array<[string, string]> = [
    ["Nama Karyawan", String(row.employee_name ?? "-")],
    ["Jabatan", String(row.position ?? "-")],
    ["Periode", periodLabel(period)],
  ];
  let identityY = 738;
  for (const [label, value] of identityRows) {
    page.drawText(label, { x, y: identityY, size: 10, font: fonts.font });
    page.drawText(value, { x: x + 118, y: identityY, size: 10, font: fonts.font });
    identityY -= 20;
  }

  let tableY = 648;
  tableY = drawSlipSection(page, fonts, "PENDAPATAN", [
    ["Gaji Pokok", money(row.base_salary)],
    ["Bonus", money(row.bonus)],
    ["Tunjangan", money(row.position_allowance)],
    ["Lembur", money(row.overtime_total)],
    ["Masuk Hari Minggu / Libur", money(row.sunday_fee)],
    ["Double shift (Nerus)", money(row.double_shift_fee)],
  ], x, tableY, width);
  tableY = drawSlipSection(page, fonts, "POTONGAN", [
    ["Keterlambatan / Potongan Lain", money(row.other_deduction)],
    ["BPJS", money(row.bpjs_deduction)],
    ["PPh 21", money(row.pph21)],
  ], x, tableY, width);
  drawSlipTotalRow(page, fonts, "TOTAL GAJI DITERIMA", money(row.net_salary), x, tableY, width);
  page.drawText("Disetujui oleh:", { x, y: 100, size: 9, font: fonts.font });
  page.drawText("________________________", { x, y: 58, size: 9, font: fonts.font });
  page.drawText(`Generated ${new Date().toISOString()}`, { x: 390, y: 36, size: 7, font: fonts.font, color: rgb(0.38, 0.44, 0.52) });
}

function drawSlipSection(page: PDFPage, fonts: PdfFonts, title: string, rows: Array<[string, string]>, x: number, y: number, width: number) {
  const headerHeight = 20;
  const rowHeight = 22;
  const splitX = x + 334;
  page.drawRectangle({ x, y, width, height: headerHeight, color: rgb(0.84, 0.91, 0.96), borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 });
  page.drawText(title, { x: x + 8, y: y + 6, size: 10, font: fonts.bold });
  let currentY = y - rowHeight;
  for (const [label, value] of rows) {
    page.drawRectangle({ x, y: currentY, width, height: rowHeight, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.65 });
    page.drawLine({ start: { x: splitX, y: currentY }, end: { x: splitX, y: currentY + rowHeight }, thickness: 0.65, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(label, { x: x + 8, y: currentY + 7, size: 9, font: fonts.font });
    const valueWidth = fonts.font.widthOfTextAtSize(value, 9);
    page.drawText(value, { x: x + width - valueWidth - 8, y: currentY + 7, size: 9, font: fonts.font });
    currentY -= rowHeight;
  }
  return currentY;
}

function drawSlipTotalRow(page: PDFPage, fonts: PdfFonts, label: string, value: string, x: number, y: number, width: number) {
  const rowHeight = 22;
  const splitX = x + 334;
  page.drawRectangle({ x, y, width, height: rowHeight, color: rgb(0.95, 0.68, 0.47), borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 });
  page.drawLine({ start: { x: splitX, y }, end: { x: splitX, y: y + rowHeight }, thickness: 0.8, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(label, { x: x + 8, y: y + 7, size: 9.5, font: fonts.bold });
  const valueWidth = fonts.bold.widthOfTextAtSize(value, 9.5);
  page.drawText(value, { x: x + width - valueWidth - 8, y: y + 7, size: 9.5, font: fonts.bold });
}

function drawPdfHeader(page: PDFPage, fonts: PdfFonts, title: string, clinic: string, period: string, status: string) {
  const width = page.getWidth();
  const height = page.getHeight();
  page.drawText(clinic, { x: 30, y: height - 34, size: 9, font: fonts.font, color: rgb(0.25, 0.31, 0.39) });
  page.drawText(title, { x: 30, y: height - 56, size: 15, font: fonts.bold });
  const statusText = status === "draft" ? " | DRAFT" : "";
  page.drawText(`Periode ${period}${statusText}`, { x: width - 180, y: height - 54, size: 9, font: fonts.font });
  page.drawLine({ start: { x: 30, y: height - 70 }, end: { x: width - 30, y: height - 70 }, thickness: 0.8, color: rgb(0.65, 0.72, 0.8) });
  return height - 92;
}

function drawKeyValues(page: PDFPage, fonts: PdfFonts, rows: Array<[string, string]>, x: number, y: number) {
  for (const [label, value] of rows) {
    page.drawText(label, { x, y, size: 8.5, font: fonts.font, color: rgb(0.3, 0.36, 0.44) });
    page.drawText(value, { x: x + 135, y, size: 8.5, font: fonts.bold });
    y -= 15;
  }
  return y;
}

function drawTable(page: PDFPage, fonts: PdfFonts, rows: Record<string, unknown>[], columns: PdfColumn[], x: number, y: number, highlightLast = true) {
  const rowHeight = 20;
  let currentY = y;
  drawTableRow(page, fonts, Object.fromEntries(columns.map((column) => [column.key, column.header])), columns, x, currentY, rowHeight, true, false);
  currentY -= rowHeight;
  rows.forEach((row, index) => {
    const isTotal = String(row.nama ?? row.NAMA ?? row["Nama Karyawan"] ?? "").toUpperCase() === "TOTAL";
    drawTableRow(page, fonts, row, columns, x, currentY, rowHeight, false, isTotal || (highlightLast && index === rows.length - 1));
    currentY -= rowHeight;
  });
}

function drawTableRow(page: PDFPage, fonts: PdfFonts, row: Record<string, unknown>, columns: PdfColumn[], x: number, y: number, height: number, header: boolean, total: boolean) {
  let currentX = x;
  const fill = header ? rgb(0.12, 0.31, 0.47) : total ? rgb(0.85, 0.92, 0.97) : undefined;
  if (fill) page.drawRectangle({ x, y: y - 5, width: columns.reduce((totalWidth, column) => totalWidth + column.width, 0), height, color: fill });
  for (const column of columns) {
    page.drawRectangle({ x: currentX, y: y - 5, width: column.width, height, borderColor: rgb(0.12, 0.16, 0.2), borderWidth: 0.35 });
    const font = header || total ? fonts.bold : fonts.font;
    const size = header ? 6.5 : 6.8;
    const text = fitText(String(row[column.key] ?? ""), font, size, column.width - 8);
    const textWidth = font.widthOfTextAtSize(text, size);
    const textX = column.align === "right" ? currentX + column.width - textWidth - 4 : column.align === "center" ? currentX + (column.width - textWidth) / 2 : currentX + 4;
    page.drawText(text, { x: textX, y: y + 2, size, font, color: header ? rgb(1, 1, 1) : rgb(0.05, 0.1, 0.16) });
    currentX += column.width;
  }
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, color = rgb(0, 0, 0)) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && font.widthOfTextAtSize(`${clipped}...`, size) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

async function makeSimplePdf(title: string, lines: Array<[string, string]>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  page.drawText(title, { x: 48, y, size: 18, font: bold });
  y -= 36;
  for (const [label, value] of lines) {
    page.drawText(label, { x: 48, y, size: 11, font: bold });
    page.drawText(value, { x: 220, y, size: 11, font });
    y -= 22;
  }
  page.drawText(`Generated ${new Date().toISOString()}`, { x: 48, y: 40, size: 8, font });
  return pdf.save();
}

function doctorFeeLines(row: Record<string, unknown>): Array<[string, string]> {
  return [
    ["Dokter", String(row.doctor_name ?? "-")],
    ["Status", String(row.status ?? "-")],
    ["Transaksi", String(row.transaction_count ?? 0)],
    ["Total Billing", money(row.total_bill)],
    ["Fee Treatment", money(row.treatment_fee_total)],
    ["Fee Ortho", money(row.ortho_fee_total)],
    ["Pajak", money(row.tax)],
    ["Transfer", money(row.transfer_amount)],
  ];
}

function payrollLines(row: Record<string, unknown>): Array<[string, string]> {
  return [
    ["Karyawan", String(row.employee_name ?? "-")],
    ["Status", String(row.status ?? "-")],
    ["Gaji Pokok", money(row.base_salary)],
    ["Lembur", money(row.overtime_total)],
    ["Bonus", money(row.bonus)],
    ["Tunjangan Jabatan", money(row.position_allowance)],
    ["Potongan", money(row.total_deduction)],
    ["Transfer", money(row.net_salary)],
  ];
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function sum(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function periodLabel(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month || "1") - 1, 1);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date);
}

function dateOnly(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function safeSheetTitle(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
}

function chunks<T>(rows: T[], size: number) {
  const grouped: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    grouped.push(rows.slice(index, index + size));
  }
  return grouped.length ? grouped : [[]];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}
