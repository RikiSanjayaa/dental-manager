import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, type AppVariables } from "../auth";
import { calculateDoctorTransaction } from "../calculations";
import { all, first, recordAudit } from "../db";
import { nowIso } from "../http";
import type { Env } from "../types";

export const doctorFeeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type Doctor = { id: number; normal_fee_rate: number; tax_rate: number; name: string };
type Treatment = { id: number; bhp_cost: number; treatment_price: number; name: string };
type Rule = { normal_fee_rate: number; default_deduction: number; tax_rate: number };
type Transaction = {
  id?: number;
  period: string;
  transaction_date: string;
  doctor_id: number;
  patient_name: string;
  treatment_id: number | null;
  treatment_name_snapshot: string;
  qty: number;
  discount_amount: number;
  bhp_override: number | null;
  price_override: number | null;
  special_fee_amount: number;
  fee_rate: number | null;
  service_amount?: number;
  doctor_fee_amount?: number;
  total_bill_amount?: number;
  needs_review: number | boolean;
  review_note: string | null;
};

const trxFields = [
  "period",
  "transaction_date",
  "doctor_id",
  "patient_name",
  "treatment_id",
  "treatment_name_snapshot",
  "qty",
  "discount_amount",
  "bhp_override",
  "price_override",
  "special_fee_amount",
  "fee_rate",
  "service_amount",
  "doctor_fee_amount",
  "total_bill_amount",
  "needs_review",
  "review_note",
  "created_at",
];

function pick(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => field in body).map((field) => [field, body[field]]));
}

function assignmentSql(values: Record<string, unknown>) {
  return Object.keys(values)
    .map((field) => `${field} = ?`)
    .join(", ");
}

function booleanToInt(value: unknown): 0 | 1 {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

async function defaultRule(env: Env): Promise<Rule> {
  return (
    (await first<Rule>(env.DB.prepare("SELECT * FROM doctorfeerule WHERE is_default = 1 LIMIT 1"))) || {
      normal_fee_rate: 0.6,
      default_deduction: 0,
      tax_rate: 0.025,
    }
  );
}

async function hydrateAndCalculate(env: Env, body: Record<string, unknown>): Promise<Transaction> {
  const doctor = await first<Doctor>(env.DB.prepare("SELECT * FROM doctor WHERE id = ?").bind(body.doctor_id));
  if (!doctor) throw new HTTPException(404, { message: "Dokter tidak ditemukan." });
  const treatment = body.treatment_id
    ? await first<Treatment>(env.DB.prepare("SELECT * FROM treatment WHERE id = ?").bind(body.treatment_id))
    : null;
  const hasManualReview = Object.prototype.hasOwnProperty.call(body, "needs_review");
  const transaction: Transaction = {
    period: String(body.period),
    transaction_date: String(body.transaction_date),
    doctor_id: Number(body.doctor_id),
    patient_name: String(body.patient_name || "Nama Pasien"),
    treatment_id: body.treatment_id == null ? null : Number(body.treatment_id),
    treatment_name_snapshot: String(body.treatment_name_snapshot || treatment?.name || body.treatment_name || "Treatment"),
    qty: Number(body.qty ?? 1),
    discount_amount: Number(body.discount_amount ?? 0),
    bhp_override: body.bhp_override == null || body.bhp_override === "" ? null : Number(body.bhp_override),
    price_override: body.price_override == null || body.price_override === "" ? null : Number(body.price_override),
    special_fee_amount: Number(body.special_fee_amount ?? 0),
    fee_rate: body.fee_rate == null || body.fee_rate === "" ? null : Number(body.fee_rate),
    needs_review: hasManualReview ? booleanToInt(body.needs_review) : treatment ? 0 : 1,
    review_note: body.review_note == null ? (treatment ? null : "Treatment belum ditemukan di master.") : String(body.review_note),
  };
  return calculateDoctorTransaction(transaction, treatment, doctor, await defaultRule(env));
}

async function rowsForPeriod(env: Env, period: string) {
  return all<Transaction>(
    env.DB.prepare(
      `SELECT t.*, d.name AS doctor_name, tr.name AS treatment_name,
              COALESCE(t.bhp_override, tr.bhp_cost, 0) AS bhp_amount,
              COALESCE(t.price_override, tr.treatment_price, 0) AS price_amount
       FROM doctortransaction t
       LEFT JOIN doctor d ON d.id = t.doctor_id
       LEFT JOIN treatment tr ON tr.id = t.treatment_id
       WHERE t.period = ?
       ORDER BY t.transaction_date DESC, t.id DESC`
    ).bind(period)
  );
}

async function doctorSummaries(env: Env, period: string) {
  return all<Record<string, unknown>>(
    env.DB.prepare(
      `SELECT s.id, d.id AS doctor_id, d.name AS doctor_name, d.bank_name, d.account_name, d.account_number,
              COALESCE(tx.transaction_count, 0) AS transaction_count,
              COALESCE(s.treatment_fee_total, tx.treatment_fee_total, 0) AS treatment_fee_total,
              COALESCE(s.ortho_fee_total, tx.ortho_fee_total, 0) AS ortho_fee_total,
              COALESCE(s.total_fee, tx.total_fee, 0) AS total_fee,
              COALESCE(s.total_bill, tx.total_bill, 0) AS total_bill,
              COALESCE(s.deduction, 0) AS deduction,
              COALESCE(s.tax, 0) AS tax,
              COALESCE(s.transfer_amount, 0) AS transfer_amount,
              COALESCE(s.status, 'not_calculated') AS status,
              s.calculated_at
       FROM doctor d
       LEFT JOIN doctorperiodsummary s ON s.doctor_id = d.id AND s.period = ?
       LEFT JOIN (
         SELECT period, doctor_id, COUNT(*) AS transaction_count,
                SUM(CASE WHEN COALESCE(special_fee_amount, 0) = 0 THEN COALESCE(doctor_fee_amount, 0) ELSE 0 END) AS treatment_fee_total,
                SUM(COALESCE(special_fee_amount, 0)) AS ortho_fee_total,
                SUM(CASE
                  WHEN COALESCE(special_fee_amount, 0) = 0 THEN COALESCE(doctor_fee_amount, 0)
                  ELSE COALESCE(special_fee_amount, 0)
                END) AS total_fee,
                SUM(COALESCE(total_bill_amount, 0)) AS total_bill
         FROM doctortransaction
         WHERE period = ?
         GROUP BY period, doctor_id
       ) tx ON tx.doctor_id = d.id
       WHERE s.id IS NOT NULL OR tx.transaction_count > 0
       ORDER BY d.name, d.id`
    ).bind(period, period)
  );
}

doctorFeeRoutes.get("/doctor-transactions", async (c) => {
  const period = c.req.query("period");
  let sql = `SELECT t.*, d.name AS doctor_name, tr.name AS treatment_name,
                    COALESCE(t.bhp_override, tr.bhp_cost, 0) AS bhp_amount,
                    COALESCE(t.price_override, tr.treatment_price, 0) AS price_amount
             FROM doctortransaction t
             LEFT JOIN doctor d ON d.id = t.doctor_id
             LEFT JOIN treatment tr ON tr.id = t.treatment_id`;
  const params: unknown[] = [];
  if (period) {
    sql += " WHERE t.period = ?";
    params.push(period);
  }
  sql += " ORDER BY t.transaction_date DESC, t.id DESC";
  return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(sql).bind(...params)));
});

doctorFeeRoutes.post("/doctor-transactions", adminOnly, async (c) => {
  const user = c.get("user");
  const calculated = await hydrateAndCalculate(c.env, await c.req.json<Record<string, unknown>>());
  const values = { ...pick(calculated, trxFields), created_at: nowIso() };
  const fields = Object.keys(values);
  const result = await c.env.DB.prepare(`INSERT INTO doctortransaction (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
    .bind(...Object.values(values))
    .run();
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "create",
    entity_type: "doctor_transaction",
    entity_id: result.meta.last_row_id,
    description: "Menambah transaksi perawatan.",
  });
  return c.json(await first(c.env.DB.prepare("SELECT * FROM doctortransaction WHERE id = ?").bind(result.meta.last_row_id)), 201);
});

doctorFeeRoutes.patch("/doctor-transactions/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await first<Transaction>(c.env.DB.prepare("SELECT * FROM doctortransaction WHERE id = ?").bind(id));
  if (!existing) throw new HTTPException(404, { message: "Data tidak ditemukan" });
  const calculated = await hydrateAndCalculate(c.env, { ...existing, ...(await c.req.json<Record<string, unknown>>()) });
  const values = pick(calculated, trxFields.filter((field) => field !== "created_at"));
  await c.env.DB.prepare(`UPDATE doctortransaction SET ${assignmentSql(values)} WHERE id = ?`).bind(...Object.values(values), id).run();
  return c.json(await first(c.env.DB.prepare("SELECT * FROM doctortransaction WHERE id = ?").bind(id)));
});

doctorFeeRoutes.delete("/doctor-transactions/:id", adminOnly, async (c) => {
  await c.env.DB.prepare("DELETE FROM doctortransaction WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ status: "ok" });
});

doctorFeeRoutes.post("/doctor-transactions/import/preview", adminOnly, async () => {
  throw new HTTPException(501, { message: "Import XLSX Worker belum selesai." });
});
doctorFeeRoutes.post("/doctor-transactions/import/:id/commit", adminOnly, async () => {
  throw new HTTPException(501, { message: "Import XLSX Worker belum selesai." });
});
doctorFeeRoutes.post("/doctor-transactions/import", adminOnly, async () => {
  throw new HTTPException(501, { message: "Import XLSX Worker belum selesai." });
});

doctorFeeRoutes.post("/doctor-transactions/generate-random", adminOnly, async (c) => {
  return c.json({ period: c.req.query("period") || new Date().toISOString().slice(0, 7), created: 0, calculated: 0 });
});

doctorFeeRoutes.post("/doctor-periods/:period/calculate", adminOnly, async (c) => {
  const period = c.req.param("period") ?? "";
  const rule = await defaultRule(c.env);
  const transactions = await rowsForPeriod(c.env, period);
  await c.env.DB.prepare("DELETE FROM doctorperiodsummary WHERE period = ?").bind(period).run();
  const byDoctor = new Map<number, Transaction[]>();
  for (const row of transactions) byDoctor.set(row.doctor_id, [...(byDoctor.get(row.doctor_id) || []), row]);
  for (const [doctorId, rows] of byDoctor) {
    const doctor = await first<Doctor>(c.env.DB.prepare("SELECT * FROM doctor WHERE id = ?").bind(doctorId));
    const treatmentFee = rows.filter((row) => !row.special_fee_amount).reduce((sum, row) => sum + Number(row.doctor_fee_amount || 0), 0);
    const orthoFee = rows.reduce((sum, row) => sum + Number(row.special_fee_amount || 0), 0);
    const totalBill = rows.reduce((sum, row) => sum + Number(row.total_bill_amount || 0), 0);
    const totalFee = treatmentFee + orthoFee;
    const tax = totalFee * (doctor?.tax_rate ?? rule.tax_rate);
    await c.env.DB.prepare(
      `INSERT INTO doctorperiodsummary
       (period, doctor_id, status, treatment_fee_total, ortho_fee_total, total_fee, total_bill, deduction, tax, transfer_amount, calculated_at)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(period, doctorId, Math.round(treatmentFee), Math.round(orthoFee), Math.round(totalFee), Math.round(totalBill), Math.round(rule.default_deduction), Math.round(tax), Math.round(totalFee - rule.default_deduction - tax), nowIso())
      .run();
  }
  return c.json(await all(c.env.DB.prepare("SELECT * FROM doctorperiodsummary WHERE period = ?").bind(period)));
});

doctorFeeRoutes.get("/doctor-periods/:period/summary", async (c) => {
  return c.json(await doctorSummaries(c.env, c.req.param("period")));
});

doctorFeeRoutes.get("/doctor-periods/:period/overview", async (c) => {
  const period = c.req.param("period") ?? "";
  const transactions = await rowsForPeriod(c.env, period);
  const summaries = await doctorSummaries(c.env, period);
  const calculatedSummaries = summaries.filter((row) => row.id != null);
  const needsReview = transactions.filter((row) => row.needs_review).length;
  return c.json({
    period,
    doctor_count: summaries.length,
    total_bill: transactions.reduce((sum, row) => sum + Number(row.total_bill_amount || 0), 0),
    treatment_fee_total: summaries.reduce((sum, row) => sum + Number(row.treatment_fee_total || 0), 0),
    ortho_fee_total: summaries.reduce((sum, row) => sum + Number(row.ortho_fee_total || 0), 0),
    total_fee: summaries.reduce((sum, row) => sum + Number(row.total_fee || 0), 0),
    total_transfer: calculatedSummaries.reduce((sum, row) => sum + Number(row.transfer_amount || 0), 0),
    deduction: calculatedSummaries.reduce((sum, row) => sum + Number(row.deduction || 0), 0),
    total_tax: calculatedSummaries.reduce((sum, row) => sum + Number(row.tax || 0), 0),
    tax: calculatedSummaries.reduce((sum, row) => sum + Number(row.tax || 0), 0),
    transfer_amount: calculatedSummaries.reduce((sum, row) => sum + Number(row.transfer_amount || 0), 0),
    transaction_count: transactions.length,
    review_count: needsReview,
    needs_review_count: needsReview,
    status: calculatedSummaries.length ? (calculatedSummaries.every((row) => row.status === "locked") ? "locked" : "draft") : transactions.length ? "not_calculated" : "empty",
    summaries,
  });
});

doctorFeeRoutes.post("/doctor-periods/:period/lock", adminOnly, async (c) => {
  await c.env.DB.prepare("UPDATE doctorperiodsummary SET status = 'locked' WHERE period = ?").bind(c.req.param("period")).run();
  return c.json(await all(c.env.DB.prepare("SELECT * FROM doctorperiodsummary WHERE period = ?").bind(c.req.param("period"))));
});

doctorFeeRoutes.post("/doctor-periods/:period/unlock", adminOnly, async (c) => {
  await c.env.DB.prepare("UPDATE doctorperiodsummary SET status = 'draft' WHERE period = ?").bind(c.req.param("period")).run();
  return c.json(await all(c.env.DB.prepare("SELECT * FROM doctorperiodsummary WHERE period = ?").bind(c.req.param("period"))));
});
