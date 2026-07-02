import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, type AppVariables } from "../auth";
import { calculateAttendanceRecord, calculatePayrollRecord } from "../calculations";
import { all, first } from "../db";
import { nowIso } from "../http";
import type { Env } from "../types";
import { boolValue, dateTextValue, textValue, timeTextValue, workbookRowsFromRequest } from "../xlsx";

export const payrollRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type AttendanceRuleRow = {
  timezone1_start: string;
  timezone1_end: string;
  timezone2_start: string;
  timezone2_end: string;
  overtime_min_minutes: number;
  overtime_max_minutes: number;
};

type PayrollRuleRow = {
  default_base_salary: number;
  bpjs_jht_rate: number;
  overtime_rate_per_minute: number;
  pph21_threshold: number;
  pph21_rate: number;
  holiday_double_shift_fee: number;
};

type EmployeeRow = {
  id: number;
  name: string;
  base_salary: number;
  working_days: number;
  is_training: number;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
};

function pick(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => field in body).map((field) => [field, body[field]]));
}

function assignmentSql(values: Record<string, unknown>) {
  return Object.keys(values)
    .map((field) => `${field} = ?`)
    .join(", ");
}

async function payrollSummaries(env: Env, period: string) {
  return all<Record<string, unknown>>(
    env.DB.prepare(
      `SELECT p.id, e.id AS employee_id, e.name AS employee_name, e.position, e.join_date,
              COALESCE(p.base_salary, e.base_salary, 0) AS base_salary,
              COALESCE(p.working_days, e.working_days, 25) AS working_days,
              COALESCE(p.auto_double_shift_count, 0) AS auto_double_shift_count,
              COALESCE(p.auto_sunday_count, 0) AS auto_sunday_count,
              p.double_shift_count_override,
              p.sunday_count_override,
              COALESCE(p.double_shift_count, 0) AS double_shift_count,
              COALESCE(p.sunday_count, 0) AS sunday_count,
              COALESCE(p.izin_count, 0) AS izin_count,
              COALESCE(p.sakit_count, 0) AS sakit_count,
              COALESCE(p.cuti_count, 0) AS cuti_count,
              COALESCE(p.alpha_count, 0) AS alpha_count,
              COALESCE(p.double_shift_fee, 0) AS double_shift_fee,
              COALESCE(p.sunday_fee, 0) AS sunday_fee,
              COALESCE(p.overtime_minutes, 0) AS overtime_minutes,
              COALESCE(p.overtime_rate_per_minute, 250) AS overtime_rate_per_minute,
              COALESCE(p.overtime_total, 0) AS overtime_total,
              COALESCE(p.bonus, 0) AS bonus,
              COALESCE(p.position_allowance, 0) AS position_allowance,
              (
                COALESCE(p.base_salary, e.base_salary, 0) +
                COALESCE(p.double_shift_fee, 0) +
                COALESCE(p.sunday_fee, 0) +
                COALESCE(p.overtime_total, 0) +
                COALESCE(p.bonus, 0) +
                COALESCE(p.position_allowance, 0)
              ) AS gross_salary,
              COALESCE(p.bpjs_deduction, 0) AS bpjs_deduction,
              COALESCE(p.other_deduction, 0) AS other_deduction,
              COALESCE(p.pph21, 0) AS pph21,
              (
                COALESCE(p.bpjs_deduction, 0) +
                COALESCE(p.other_deduction, 0) +
                COALESCE(p.pph21, 0)
              ) AS total_deduction,
              COALESCE(p.net_salary, 0) AS net_salary,
              COALESCE(p.payment_method, 'Transfer') AS payment_method,
              COALESCE(p.bank_name, e.bank_name) AS bank_name,
              COALESCE(p.account_name, e.account_name, e.name) AS account_name,
              COALESCE(p.account_number, e.account_number) AS account_number,
              COALESCE(p.needs_review, 0) AS needs_review,
              COALESCE(p.status, 'not_calculated') AS status
       FROM employee e
       LEFT JOIN payrollrecord p ON p.employee_id = e.id AND p.period = ?
       WHERE e.is_active = 1
       ORDER BY e.id`
    ).bind(period)
  );
}

async function attendanceRule(env: Env): Promise<AttendanceRuleRow> {
  return (
    (await first<AttendanceRuleRow>(env.DB.prepare("SELECT * FROM attendancerule WHERE is_default = 1 LIMIT 1"))) || {
      timezone1_start: "08:00:00",
      timezone1_end: "16:00:00",
      timezone2_start: "14:00:00",
      timezone2_end: "21:00:00",
      overtime_min_minutes: 30,
      overtime_max_minutes: 180,
    }
  );
}

async function payrollRule(env: Env): Promise<PayrollRuleRow> {
  return (
    (await first<PayrollRuleRow>(env.DB.prepare("SELECT * FROM payrollrule WHERE is_default = 1 LIMIT 1"))) || {
      default_base_salary: 2712250,
      bpjs_jht_rate: 0.02,
      overtime_rate_per_minute: 250,
      pph21_threshold: 5400000,
      pph21_rate: 0.05,
      holiday_double_shift_fee: 90000,
    }
  );
}

const attendanceFields = [
  "period",
  "employee_id",
  "attendance_id_snapshot",
  "employee_name_snapshot",
  "work_date",
  "timezone1_in",
  "timezone1_out",
  "timezone2_in",
  "timezone2_out",
  "late_minutes",
  "early_leave_minutes",
  "absent_minutes",
  "is_absent",
  "total_minutes",
  "overtime_minutes",
  "is_sunday",
  "is_holiday",
  "is_double_shift",
  "status_note",
  "needs_review",
  "protest_note",
  "protest_by_user_id",
  "protest_by_name",
  "protested_at",
  "created_at",
];

async function buildAttendanceRows(env: Env, sourceRows: Record<string, unknown>[]) {
  const rule = await attendanceRule(env);
  const rows = [];
  const errors = [];
  let valid = 0;
  let invalid = 0;
  let review = 0;
  let newRows = 0;
  let updateRows = 0;
  let duplicate = 0;
  const seen = new Set<string>();
  for (const [index, source] of sourceRows.entries()) {
    const rowNumber = index + 2;
    const workDate = dateTextValue(source, ["work_date", "tanggal", "date"]);
    const attendanceId = textValue(source, ["attendance_id", "id_absensi", "pin"]);
    const employeeName = textValue(source, ["employee_name", "nama", "karyawan"]);
    const employee = attendanceId
      ? await first<EmployeeRow & { attendance_id?: string }>(env.DB.prepare("SELECT * FROM employee WHERE attendance_id = ?").bind(attendanceId))
      : employeeName
        ? await first<EmployeeRow & { attendance_id?: string }>(env.DB.prepare("SELECT * FROM employee WHERE lower(name) = lower(?)").bind(employeeName))
        : null;
    const issues: string[] = [];
    if (!workDate) issues.push("Tanggal wajib diisi.");
    if (!attendanceId && !employeeName) issues.push("ID absensi atau nama karyawan wajib diisi.");
    if (!employee) issues.push("Karyawan tidak ditemukan di master.");
    const period = workDate ? workDate.slice(0, 7) : "";
    const key = `${period}:${employee?.id ?? (attendanceId || employeeName)}:${workDate}`;
    if (seen.has(key)) {
      duplicate += 1;
      issues.push("Duplikat di file.");
    }
    seen.add(key);
    const holiday = workDate
      ? await first<{ is_holiday: number | boolean }>(env.DB.prepare("SELECT is_holiday FROM attendanceholiday WHERE holiday_date = ?").bind(workDate))
      : null;
    const existing = employee && workDate
      ? await first<{ id: number }>(env.DB.prepare("SELECT id FROM attendancerecord WHERE period = ? AND employee_id = ? AND work_date = ?").bind(period, employee.id, workDate))
      : null;
    const record = calculateAttendanceRecord(
      {
        period,
        employee_id: employee?.id ?? null,
        attendance_id_snapshot: attendanceId || employee?.attendance_id || "",
        employee_name_snapshot: employeeName || employee?.name || "",
        work_date: workDate,
        timezone1_in: timeTextValue(source, ["timezone1_in", "shift1_in", "masuk1"]),
        timezone1_out: timeTextValue(source, ["timezone1_out", "shift1_out", "keluar1"]),
        timezone2_in: timeTextValue(source, ["timezone2_in", "shift2_in", "masuk2"]),
        timezone2_out: timeTextValue(source, ["timezone2_out", "shift2_out", "keluar2"]),
        is_holiday: boolValue(source, ["is_holiday", "libur"], Boolean(holiday?.is_holiday)) ? 1 : 0,
        status_note: textValue(source, ["status_note", "catatan"]) || null,
        needs_review: employee ? 0 : 1,
        created_at: nowIso(),
      },
      rule
    );
    const status = issues.length ? "invalid" : record.needs_review ? "review" : existing ? "update" : "new";
    if (status === "invalid") {
      invalid += 1;
      errors.push({ row: rowNumber, message: issues.join(" ") });
    } else {
      valid += 1;
      if (status === "review") review += 1;
      if (status === "update") updateRows += 1;
      if (status === "new") newRows += 1;
    }
    rows.push({ row: rowNumber, status, issues, ...record });
  }
  return {
    kind: "attendance",
    valid_rows: valid,
    invalid_rows: invalid,
    warnings: [],
    errors,
    summary: { attendance: valid, review, new: newRows, update: updateRows, duplicate_in_file: duplicate },
    rows,
  };
}

payrollRoutes.post("/attendance/import-preview", adminOnly, async (c) => {
  const { rows } = await workbookRowsFromRequest(c.req.raw);
  return c.json(await buildAttendanceRows(c.env, rows));
});

payrollRoutes.post("/attendance/import", adminOnly, async (c) => {
  const { rows } = await workbookRowsFromRequest(c.req.raw);
  const preview = await buildAttendanceRows(c.env, rows);
  let created = 0;
  let updated = 0;
  for (const row of preview.rows.filter((item) => item.status !== "invalid")) {
    const values = pick(row, attendanceFields);
    const existing = row.employee_id
      ? await first<{ id: number }>(
          c.env.DB.prepare("SELECT id FROM attendancerecord WHERE period = ? AND employee_id = ? AND work_date = ?").bind(row.period, row.employee_id, row.work_date)
        )
      : null;
    if (existing) {
      await c.env.DB.prepare(`UPDATE attendancerecord SET ${assignmentSql(pick(values, attendanceFields.filter((field) => field !== "created_at")))} WHERE id = ?`)
        .bind(...Object.values(pick(values, attendanceFields.filter((field) => field !== "created_at"))), existing.id)
        .run();
      updated += 1;
    } else {
      const fields = Object.keys(values);
      await c.env.DB.prepare(`INSERT INTO attendancerecord (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
        .bind(...Object.values(values))
        .run();
      created += 1;
    }
  }
  return c.json({ created, updated, invalid_rows: preview.invalid_rows });
});

payrollRoutes.get("/attendance-records", async (c) => {
  const period = c.req.query("period");
  let sql = "SELECT * FROM attendancerecord";
  const params: unknown[] = [];
  if (period) {
    sql += " WHERE period = ?";
    params.push(period);
  }
  sql += " ORDER BY work_date DESC, id DESC";
  return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(sql).bind(...params)));
});

payrollRoutes.post("/attendance-records", adminOnly, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const employee = body.employee_id
    ? await first<EmployeeRow>(c.env.DB.prepare("SELECT * FROM employee WHERE id = ?").bind(body.employee_id))
    : null;
  const row = calculateAttendanceRecord(
    {
      period: String(body.period),
      employee_id: body.employee_id == null ? null : Number(body.employee_id),
      attendance_id_snapshot: String(body.attendance_id_snapshot || employee?.id || ""),
      employee_name_snapshot: String(body.employee_name_snapshot || employee?.name || ""),
      work_date: String(body.work_date),
      timezone1_in: body.timezone1_in ? String(body.timezone1_in) : null,
      timezone1_out: body.timezone1_out ? String(body.timezone1_out) : null,
      timezone2_in: body.timezone2_in ? String(body.timezone2_in) : null,
      timezone2_out: body.timezone2_out ? String(body.timezone2_out) : null,
      is_holiday: body.is_holiday === true || body.is_holiday === 1 ? 1 : 0,
      status_note: body.status_note ? String(body.status_note) : null,
      needs_review: employee ? 0 : 1,
      created_at: nowIso(),
    },
    await attendanceRule(c.env)
  );
  const values = pick(row, attendanceFields);
  const fields = Object.keys(values);
  const result = await c.env.DB.prepare(`INSERT INTO attendancerecord (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
    .bind(...Object.values(values))
    .run();
  return c.json(await first(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE id = ?").bind(result.meta.last_row_id)), 201);
});

payrollRoutes.patch("/attendance-records/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await first<Record<string, unknown>>(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE id = ?").bind(id));
  if (!existing) throw new HTTPException(404, { message: "Data tidak ditemukan" });
  const row = calculateAttendanceRecord({ ...existing, ...(await c.req.json<Record<string, unknown>>()) } as never, await attendanceRule(c.env));
  const values = pick(row, attendanceFields.filter((field) => field !== "created_at"));
  await c.env.DB.prepare(`UPDATE attendancerecord SET ${assignmentSql(values)} WHERE id = ?`).bind(...Object.values(values), id).run();
  return c.json(await first(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE id = ?").bind(id)));
});

payrollRoutes.delete("/attendance-records/:id", adminOnly, async (c) => {
  await c.env.DB.prepare("DELETE FROM attendancerecord WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ status: "ok" });
});

payrollRoutes.post("/attendance-records/:id/protest", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ protest_note?: string }>();
  await c.env.DB.prepare(
    "UPDATE attendancerecord SET protest_note = ?, protest_by_user_id = ?, protest_by_name = ?, protested_at = ?, needs_review = 1 WHERE id = ?"
  )
    .bind(body.protest_note || "", user.id, user.full_name, nowIso(), id)
    .run();
  return c.json(await first(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE id = ?").bind(id)));
});

payrollRoutes.post("/payroll-periods/:period/calculate", adminOnly, async (c) => {
  const period = c.req.param("period");
  const rule = await payrollRule(c.env);
  const employees = await all<EmployeeRow>(c.env.DB.prepare("SELECT * FROM employee WHERE is_active = 1"));
  for (const employee of employees) {
    const attendanceRows = await all<any>(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE period = ? AND employee_id = ?").bind(period, employee.id));
    const existing = await first<any>(c.env.DB.prepare("SELECT * FROM payrollrecord WHERE period = ? AND employee_id = ?").bind(period, employee.id));
    const record = calculatePayrollRecord(
      {
        ...(existing || {}),
        bonus: Number(existing?.bonus || 0),
        position_allowance: Number(existing?.position_allowance || 0),
        other_deduction: Number(existing?.other_deduction || 0),
      },
      employee,
      rule,
      attendanceRows
    );
    if (existing) {
      const values = pick(record as any, [
        "base_salary",
        "working_days",
        "auto_double_shift_count",
        "auto_sunday_count",
        "double_shift_count",
        "sunday_count",
        "double_shift_fee",
        "sunday_fee",
        "overtime_minutes",
        "overtime_rate_per_minute",
        "overtime_total",
        "bpjs_deduction",
        "pph21",
        "net_salary",
        "bank_name",
        "account_name",
        "account_number",
      ]);
      await c.env.DB.prepare(`UPDATE payrollrecord SET ${assignmentSql(values)}, calculated_at = ? WHERE id = ?`).bind(...Object.values(values), nowIso(), existing.id).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO payrollrecord
         (period, employee_id, status, base_salary, working_days, auto_double_shift_count, auto_sunday_count, double_shift_count, sunday_count,
          double_shift_fee, sunday_fee, overtime_minutes, overtime_rate_per_minute, overtime_total, bonus, position_allowance,
          bpjs_deduction, other_deduction, pph21, net_salary, payment_method, bank_name, account_name, account_number, needs_review, calculated_at)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, 'Transfer', ?, ?, ?, 0, ?)`
      )
        .bind(
          period,
          employee.id,
          record.base_salary,
          record.working_days,
          record.auto_double_shift_count,
          record.auto_sunday_count,
          record.double_shift_count,
          record.sunday_count,
          record.double_shift_fee,
          record.sunday_fee,
          record.overtime_minutes,
          record.overtime_rate_per_minute,
          record.overtime_total,
          record.bpjs_deduction,
          record.pph21,
          record.net_salary,
          record.bank_name,
          record.account_name,
          record.account_number,
          nowIso()
        )
        .run();
    }
  }
  return c.json(await all(c.env.DB.prepare("SELECT * FROM payrollrecord WHERE period = ?").bind(period)));
});

payrollRoutes.get("/payroll-periods/:period/summary", async (c) => {
  return c.json(await payrollSummaries(c.env, c.req.param("period")));
});

payrollRoutes.get("/payroll-periods/:period/overview", async (c) => {
  const period = c.req.param("period");
  const rows = await payrollSummaries(c.env, period);
  const payrollRows = rows.filter((row) => row.id != null);
  const attendance = await all<Record<string, unknown>>(c.env.DB.prepare("SELECT * FROM attendancerecord WHERE period = ?").bind(period));
  const payrollReviewCount = payrollRows.filter((row) => row.needs_review).length;
  return c.json({
    period,
    status: payrollRows.length ? (payrollRows.every((row) => row.status === "locked") ? "locked" : "draft") : attendance.length ? "not_calculated" : "empty",
    employee_count: rows.length,
    attendance_count: attendance.length,
    attendance_review_count: attendance.filter((row) => row.needs_review).length,
    payroll_review_count: payrollReviewCount,
    overtime_record_count: attendance.filter((row) => Number(row.overtime_minutes || 0) > 0).length,
    total_base_salary: payrollRows.reduce((sum, row) => sum + Number(row.base_salary || 0), 0),
    total_gross_salary: payrollRows.reduce((sum, row) => sum + Number(row.gross_salary || 0), 0),
    total_overtime_minutes: payrollRows.reduce((sum, row) => sum + Number(row.overtime_minutes || 0), 0),
    total_overtime: payrollRows.reduce((sum, row) => sum + Number(row.overtime_total || 0), 0),
    total_deduction: payrollRows.reduce((sum, row) => sum + Number(row.total_deduction || 0), 0),
    total_net_salary: payrollRows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0),
    total_transfer: payrollRows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0),
    total_gross: payrollRows.reduce((sum, row) => sum + Number(row.gross_salary || 0), 0),
    total_deductions: payrollRows.reduce((sum, row) => sum + Number(row.total_deduction || 0), 0),
    needs_review_count: payrollReviewCount + attendance.filter((row) => row.needs_review).length,
    record_count: payrollRows.length,
    summaries: rows,
  });
});

payrollRoutes.get("/me/dashboard", async (c) => {
  const user = c.get("user");
  const period = c.req.query("period") || new Date().toISOString().slice(0, 7);

  if (!user.employee_id) {
    return c.json({ detail: "Akun operator belum terhubung ke master data karyawan." }, 409);
  }

  const employee = await first<Record<string, unknown>>(
    c.env.DB.prepare("SELECT id, name, position, attendance_id, bank_name, account_name, account_number FROM employee WHERE id = ?").bind(user.employee_id)
  );
  if (!employee) {
    return c.json({ detail: "Master data karyawan operator tidak ditemukan." }, 404);
  }

  const allSummaries = await payrollSummaries(c.env, period);
  const summary = allSummaries.find((row: Record<string, unknown>) => row.employee_id === user.employee_id) || null;

  const attendanceRows = await all<Record<string, unknown>>(
    c.env.DB.prepare("SELECT * FROM attendancerecord WHERE period = ? AND employee_id = ?").bind(period, user.employee_id)
  );
  const overtimeRows = attendanceRows.filter((row: Record<string, unknown>) => Number(row.overtime_minutes || 0) > 0);

  const treatmentRows = await all<Record<string, unknown>>(
    c.env.DB.prepare("SELECT id, doctor_id, patient_name, total_bill_amount, needs_review FROM doctortransaction WHERE period = ?").bind(period)
  );

  const recentTreatments = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      "SELECT t.id, t.transaction_date, d.name AS doctor_name, t.patient_name, t.treatment_name_snapshot AS treatment_name, t.total_bill_amount, t.needs_review FROM doctortransaction t LEFT JOIN doctor d ON d.id = t.doctor_id WHERE t.period = ? ORDER BY t.transaction_date DESC, t.id DESC LIMIT 5"
    ).bind(period)
  );

  const recentAuditLogs = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      "SELECT id, action, entity_type, description, created_at FROM auditlog WHERE actor_id = ? ORDER BY created_at DESC LIMIT 5"
    ).bind(user.id)
  );

  const recentAttendance = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      "SELECT id, work_date, total_minutes, overtime_minutes, needs_review, protest_note, status_note FROM attendancerecord WHERE period = ? AND employee_id = ? ORDER BY work_date DESC LIMIT 5"
    ).bind(period, user.employee_id)
  );

  return c.json({
    period,
    employee: {
      id: employee.id,
      name: employee.name,
      position: employee.position ?? null,
      attendance_id: employee.attendance_id ?? null,
    },
    payroll: summary
      ? {
          status: summary.status,
          net_salary: summary.net_salary,
          gross_salary: summary.gross_salary,
          total_deduction: summary.total_deduction,
          overtime_minutes: summary.overtime_minutes,
          needs_review: summary.needs_review,
        }
      : null,
    attendance_count: attendanceRows.length,
    attendance_review_count: attendanceRows.filter((row: Record<string, unknown>) => row.needs_review).length,
    protest_count: attendanceRows.filter((row: Record<string, unknown>) => row.protest_note).length,
    overtime_count: overtimeRows.length,
    overtime_minutes: overtimeRows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.overtime_minutes || 0), 0),
    treatment_count: treatmentRows.length,
    treatment_review_count: treatmentRows.filter((row: Record<string, unknown>) => row.needs_review).length,
    recent_treatments: recentTreatments,
    recent_attendance: recentAttendance,
    recent_audit_logs: recentAuditLogs,
});
});

payrollRoutes.get("/me/payroll/:period", async (c) => {
  const user = c.get("user");
  if (!user.employee_id) return c.json(null);
  return c.json(await first(c.env.DB.prepare("SELECT * FROM payrollrecord WHERE period = ? AND employee_id = ?").bind(c.req.param("period"), user.employee_id)));
});

payrollRoutes.get("/me/payroll/:period/export", async () => {
  throw new HTTPException(501, { message: "Export payroll pribadi Worker belum selesai." });
});

payrollRoutes.get("/payroll-periods/:period/overtime", async (c) => {
  const employeeId = c.req.query("employee_id");
  let sql = "SELECT * FROM attendancerecord WHERE period = ? AND overtime_minutes > 0";
  const params: unknown[] = [c.req.param("period")];
  if (employeeId) {
    sql += " AND employee_id = ?";
    params.push(Number(employeeId));
  }
  sql += " ORDER BY work_date DESC, id DESC";
  return c.json(await all(c.env.DB.prepare(sql).bind(...params)));
});

payrollRoutes.get("/payroll-periods/:period/slips/:employee_id", async (c) => {
  return c.json((await payrollSummaries(c.env, c.req.param("period"))).find((row) => row.employee_id === Number(c.req.param("employee_id"))) ?? null);
});

payrollRoutes.patch("/payroll-records/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const values = pick(await c.req.json<Record<string, unknown>>(), [
    "bonus",
    "position_allowance",
    "other_deduction",
    "double_shift_count_override",
    "sunday_count_override",
    "bank_name",
    "account_name",
    "account_number",
    "needs_review",
  ]);
  if (!Object.keys(values).length) throw new HTTPException(400, { message: "Payload kosong." });
  await c.env.DB.prepare(`UPDATE payrollrecord SET ${assignmentSql(values)} WHERE id = ?`).bind(...Object.values(values), id).run();
  const row = await first<{ period: string; employee_id: number }>(c.env.DB.prepare("SELECT period, employee_id FROM payrollrecord WHERE id = ?").bind(id));
  if (!row) throw new HTTPException(404, { message: "Data tidak ditemukan" });
  return c.json((await payrollSummaries(c.env, row.period)).find((item) => item.employee_id === row.employee_id) ?? null);
});

payrollRoutes.post("/payroll-periods/:period/lock", adminOnly, async (c) => {
  await c.env.DB.prepare("UPDATE payrollrecord SET status = 'locked' WHERE period = ?").bind(c.req.param("period")).run();
  return c.json(await all(c.env.DB.prepare("SELECT * FROM payrollrecord WHERE period = ?").bind(c.req.param("period"))));
});

payrollRoutes.post("/payroll-periods/:period/unlock", adminOnly, async (c) => {
  await c.env.DB.prepare("UPDATE payrollrecord SET status = 'draft' WHERE period = ?").bind(c.req.param("period")).run();
  return c.json(await all(c.env.DB.prepare("SELECT * FROM payrollrecord WHERE period = ?").bind(c.req.param("period"))));
});
