import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
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
  const employeeId = Number(c.req.param("employee_id"));
  const summary = (await payrollSummaries(c.env, period)).find((row) => Number(row.employee_id) === employeeId);
  if (!summary?.id) throw new HTTPException(404, { message: "Slip payroll belum tersedia." });
  const bytes = await makeSimplePdf(`Slip Gaji ${period}`, [
    ["Karyawan", String(summary.employee_name ?? "-")],
    ["Status", String(summary.status ?? "-")],
    ["Gaji Pokok", money(summary.base_salary)],
    ["Lembur", money(summary.overtime_total)],
    ["Bonus", money(summary.bonus)],
    ["Tunjangan Jabatan", money(summary.position_allowance)],
    ["Potongan", money(summary.total_deduction)],
    ["Transfer", money(summary.net_salary)],
  ]);
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

async function buildDoctorFeeReport(env: Env, period: string, format: string): Promise<ReportFile> {
  const summaries = await doctorFeeSummaries(env, period);
  const transactions = await doctorTransactions(env, period);
  const status = summaries.length && summaries.every((row) => row.status === "locked") ? "final" : "draft";
  if (format === "xlsx") {
    return {
      bytes: makeWorkbook([
        { name: "Summary", rows: summaries },
        { name: "Transactions", rows: transactions },
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
      entries[`doctor-fees-${period}-${slug(String(summary.doctor_name ?? summary.doctor_id))}.pdf`] = await makeSimplePdf(`Fee Dokter ${period}`, doctorFeeLines(summary));
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
    bytes: await makeSimplePdf(`Fee Dokter ${period}`, [
      ["Dokter", String(summaries.length)],
      ["Total Billing", money(sum(summaries, "total_bill"))],
      ["Total Fee", money(sum(summaries, "total_fee"))],
      ["Total Pajak", money(sum(summaries, "tax"))],
      ["Total Transfer", money(sum(summaries, "transfer_amount"))],
    ]),
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
  if (format === "xlsx") {
    return {
      bytes: makeWorkbook([
        { name: "Payroll", rows: summaries },
        { name: "Attendance", rows: attendance },
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
      entries[`slip-gaji-${period}-${slug(String(row.employee_name ?? row.employee_id))}.pdf`] = await makeSimplePdf(`Slip Gaji ${period}`, payrollLines(row));
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
    bytes: await makeSimplePdf(`Payroll ${period}`, [
      ["Karyawan", String(payrollRows.length)],
      ["Total Gaji Pokok", money(sum(payrollRows, "base_salary"))],
      ["Total Lembur", money(sum(payrollRows, "overtime_total"))],
      ["Total Potongan", money(sum(payrollRows, "total_deduction"))],
      ["Total Transfer", money(sum(payrollRows, "net_salary"))],
    ]),
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
      `SELECT t.*, d.name AS doctor_name, tr.name AS treatment_name
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
              COALESCE(p.overtime_total, 0) AS overtime_total,
              COALESCE(p.bonus, 0) AS bonus,
              COALESCE(p.position_allowance, 0) AS position_allowance,
              COALESCE(p.bpjs_deduction, 0) + COALESCE(p.other_deduction, 0) + COALESCE(p.pph21, 0) AS total_deduction,
              COALESCE(p.net_salary, 0) AS net_salary,
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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}
