import { Hono } from "hono";
import { all, first } from "../db";
import { staffOnly, type AppVariables } from "../auth";
import type { Env } from "../types";

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

async function totalsForPeriod(env: Env, period: string) {
  const transactions = await first<{ count: number; billing: number; review: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(total_bill_amount), 0) AS billing, COALESCE(SUM(needs_review), 0) AS review FROM doctortransaction WHERE period = ?"
    ).bind(period)
  );
  const doctorFees = await first<{ count: number; transfer: number; locked: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(transfer_amount), 0) AS transfer, COALESCE(SUM(status = 'locked'), 0) AS locked FROM doctorperiodsummary WHERE period = ?"
    ).bind(period)
  );
  const attendance = await first<{ count: number; review: number; overtime: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(needs_review), 0) AS review, COALESCE(SUM(overtime_minutes > 0), 0) AS overtime FROM attendancerecord WHERE period = ?"
    ).bind(period)
  );
  const payroll = await first<{ count: number; transfer: number; review: number; locked: number }>(
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(net_salary), 0) AS transfer, COALESCE(SUM(needs_review), 0) AS review, COALESCE(SUM(status = 'locked'), 0) AS locked FROM payrollrecord WHERE period = ?"
    ).bind(period)
  );
  const activeEmployees = await first<{ count: number }>(
    env.DB.prepare("SELECT COUNT(*) AS count FROM employee WHERE is_active = 1")
  );

  const doctorFeeStatus =
    doctorFees?.count && doctorFees.count > 0
      ? doctorFees.locked === doctorFees.count
        ? "locked"
        : "draft"
      : transactions?.count
        ? "not_calculated"
        : "empty";
  const payrollStatus =
    payroll?.count && payroll.count > 0
      ? payroll.locked === payroll.count
        ? "locked"
        : "draft"
      : attendance?.count
        ? "not_calculated"
        : "empty";

  const treatmentReview = transactions?.review ?? 0;
  const attendanceReview = attendance?.review ?? 0;
  const payrollReview = payroll?.review ?? 0;

  return {
    billing_patient: transactions?.billing ?? 0,
    doctor_fee_transfer: doctorFees?.transfer ?? 0,
    payroll_transfer: payroll?.transfer ?? 0,
    review_total: treatmentReview + attendanceReview + payrollReview,
    doctor_transactions: transactions?.count ?? 0,
    attendance_records: attendance?.count ?? 0,
    active_employees: activeEmployees?.count ?? 0,
    overtime_records: attendance?.overtime ?? 0,
    doctor_fee_status: doctorFeeStatus,
    payroll_status: payrollStatus,
    treatment_review_count: treatmentReview,
    attendance_review_count: attendanceReview,
    payroll_review_count: payrollReview,
  };
}

dashboardRoutes.get("/dashboard", staffOnly, async (c) => {
  const period = c.req.query("period") || currentPeriod();
  const previous = previousPeriod(period);
  const totals = await totalsForPeriod(c.env, period);
  const previousTotals = await totalsForPeriod(c.env, previous);
  const topDoctors = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      `SELECT d.id AS doctor_id, d.name AS doctor_name, COUNT(t.id) AS transaction_count,
              COALESCE(SUM(t.total_bill_amount), 0) AS total_bill,
              COALESCE(s.transfer_amount, 0) AS transfer_amount,
              COALESCE(s.status, 'not_calculated') AS status
       FROM doctortransaction t
       LEFT JOIN doctor d ON d.id = t.doctor_id
       LEFT JOIN doctorperiodsummary s ON s.period = t.period AND s.doctor_id = t.doctor_id
       WHERE t.period = ?
       GROUP BY d.id, d.name, s.transfer_amount, s.status
       ORDER BY total_bill DESC
       LIMIT 5`
    ).bind(period)
  );
  const recentActivity = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      `SELECT ('audit-' || id) AS id, action AS kind, description AS label, entity_type AS category,
              actor_name, actor_username, created_at
       FROM auditlog ORDER BY created_at DESC LIMIT 8`
    )
  );

  return c.json({
    period,
    previous_period: previous,
    totals,
    previous_totals: previousTotals,
    status: {
      readiness: totals.review_total
        ? "needs_review"
        : totals.doctor_fee_status === "locked" && totals.payroll_status === "locked"
          ? "final"
          : [totals.doctor_fee_status, totals.payroll_status].includes("not_calculated")
            ? "not_calculated"
            : "ready",
      doctor_fee: totals.doctor_fee_status,
      payroll: totals.payroll_status,
    },
    work_queue: {
      treatment_review_count: totals.treatment_review_count,
      attendance_review_count: totals.attendance_review_count,
      payroll_review_count: totals.payroll_review_count,
    },
    top_doctors: topDoctors,
    top_overtime_employees: [],
    recent_activity: recentActivity,
  });
});
