import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, currentUser, type AppVariables } from "../auth";
import { all, recordAudit } from "../db";
import type { Env } from "../types";
import { makeWorkbook, xlsxResponse } from "../xlsx";

export const reportsRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

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
  const templateName = (c.req.param("template_name") ?? "").replace(/\.xlsx$/i, "");
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
});

for (const route of ["/doctor-fees", "/payroll", "/payroll/:period/slips/:employee_id.pdf"]) {
  reportsRoutes.get(route, currentUser, async () => {
    throw new HTTPException(501, {
      message: "Generator laporan Worker belum selesai. Endpoint ini disiapkan untuk parity tahap berikutnya.",
    });
  });
}
