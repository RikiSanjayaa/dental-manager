import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, hashPassword, type AppVariables } from "../auth";
import { all, first, recordAudit } from "../db";
import { isDevelopment, refreshDevelopmentDatabase } from "../dev-data";
import { nowIso } from "../http";
import type { Env } from "../types";
import { boolValue, makeWorkbook, numberValue, textValue, workbookRowsFromRequest, xlsxResponse } from "../xlsx";

type TableConfig = {
  table: string;
  searchable: string;
  mutable: string[];
  adminOnly?: boolean;
};

const tables: Record<string, TableConfig> = {
  employees: {
    table: "employee",
    searchable: "name",
    mutable: [
      "name",
      "attendance_id",
      "position",
      "join_date",
      "base_salary",
      "working_days",
      "is_training",
      "bank_name",
      "account_name",
      "account_number",
      "is_active",
    ],
  },
  doctors: {
    table: "doctor",
    searchable: "name",
    mutable: [
      "name",
      "bank_name",
      "account_name",
      "account_number",
      "nik",
      "normal_fee_rate",
      "ortho_fee_rate",
      "tax_rate",
      "is_active",
    ],
  },
  treatments: {
    table: "treatment",
    searchable: "name",
    mutable: [
      "code",
      "name",
      "category",
      "doctor_cost",
      "specialist_cost",
      "bhp_cost",
      "service_fee",
      "treatment_price",
      "notes",
      "is_active",
    ],
  },
};

export const masterRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function pick(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => field in body).map((field) => [field, body[field]]));
}

async function getById(c: never, table: string, id: number) {
  return first<Record<string, unknown>>((c as any).env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id));
}

function assignmentSql(values: Record<string, unknown>) {
  return Object.keys(values)
    .map((field) => `${field} = ?`)
    .join(", ");
}

async function listTable(env: Env, config: TableConfig, search: string | null) {
  if (search) {
    return all<Record<string, unknown>>(
      env.DB.prepare(`SELECT * FROM ${config.table} WHERE ${config.searchable} LIKE ? ORDER BY id`).bind(`%${search}%`)
    );
  }
  return all<Record<string, unknown>>(env.DB.prepare(`SELECT * FROM ${config.table} ORDER BY id`));
}

export async function buildMasterDataWorkbook(env: Env) {
  const entries = await Promise.all(
    Object.entries(tables).map(async ([target, config]) => {
      const rows = await listTable(env, config, null);
      return {
        target,
        rows: rows.map((row) => ({ id: row.id, ...pick(row, config.mutable) })),
      };
    })
  );
  return {
    bytes: makeWorkbook(
      entries.map(({ target, rows }) => ({
        name: target[0].toUpperCase() + target.slice(1),
        rows,
        freeze: "A2",
      }))
    ),
    counts: Object.fromEntries(entries.map(({ target, rows }) => [target, rows.length])),
  };
}

function targetPayload(target: string, row: Record<string, unknown>) {
  if (target === "treatments") {
    return {
      code: textValue(row, ["code", "kode"]),
      name: textValue(row, ["name", "nama", "nama_treatment", "treatment"]),
      category: textValue(row, ["category", "kategori"]) || null,
      doctor_cost: numberValue(row, ["doctor_cost", "jasa_dokter"], 0),
      specialist_cost: numberValue(row, ["specialist_cost", "jasa_spesialis"], 0),
      bhp_cost: numberValue(row, ["bhp_cost", "bhp"], 0),
      service_fee: numberValue(row, ["service_fee", "jasa"], 0),
      treatment_price: numberValue(row, ["treatment_price", "harga", "biaya_perawatan"], 0),
      notes: textValue(row, ["notes", "catatan"]) || null,
      is_active: boolValue(row, ["is_active", "aktif"], true) ? 1 : 0,
    };
  }
  if (target === "doctors") {
    return {
      name: textValue(row, ["name", "nama", "dokter", "doctor_name"]),
      bank_name: textValue(row, ["bank_name", "bank"]) || null,
      account_name: textValue(row, ["account_name", "nama_rekening"]) || null,
      account_number: textValue(row, ["account_number", "nomor_rekening", "rekening"]) || null,
      nik: textValue(row, ["nik"]) || null,
      normal_fee_rate: numberValue(row, ["normal_fee_rate", "fee_rate", "rate"], 0.6),
      ortho_fee_rate: numberValue(row, ["ortho_fee_rate", "rate_ortho"], 0.7),
      tax_rate: numberValue(row, ["tax_rate", "pajak"], 0.025),
      is_active: boolValue(row, ["is_active", "aktif"], true) ? 1 : 0,
    };
  }
  return {
    name: textValue(row, ["name", "nama", "employee_name", "karyawan"]),
    attendance_id: textValue(row, ["attendance_id", "id_absensi", "pin"]) || null,
    position: textValue(row, ["position", "jabatan"]) || null,
    join_date: textValue(row, ["join_date", "tanggal_masuk"]) || null,
    base_salary: numberValue(row, ["base_salary", "gaji_pokok"], 0),
    working_days: numberValue(row, ["working_days", "hari_kerja"], 25),
    is_training: boolValue(row, ["is_training", "training"], false) ? 1 : 0,
    bank_name: textValue(row, ["bank_name", "bank"]) || null,
    account_name: textValue(row, ["account_name", "nama_rekening"]) || null,
    account_number: textValue(row, ["account_number", "nomor_rekening", "rekening"]) || null,
    is_active: boolValue(row, ["is_active", "aktif"], true) ? 1 : 0,
  };
}

function identityWhere(target: string, payload: Record<string, unknown>) {
  if (target === "treatments" && payload.code) return { sql: "code = ?", value: payload.code };
  if (target === "employees" && payload.attendance_id) return { sql: "attendance_id = ?", value: payload.attendance_id };
  return { sql: "name = ?", value: payload.name };
}

function sourceId(source: Record<string, unknown>): number | null {
  const raw = textValue(source, ["id"]);
  if (raw == null || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

function sameMasterValue(existing: unknown, incoming: unknown): boolean {
  if ((existing == null || existing === "") && (incoming == null || incoming === "")) return true;
  if (typeof existing === "boolean") return existing === (incoming === true || incoming === 1 || incoming === "1");
  if (typeof existing === "number" || typeof incoming === "number") return Number(existing) === Number(incoming);
  return String(existing) === String(incoming);
}

async function masterReferenceCount(env: Env, target: string, id: number): Promise<number> {
  const checks: Record<string, Array<{ table: string; column: string }>> = {
    treatments: [{ table: "doctortransaction", column: "treatment_id" }],
    doctors: [
      { table: "doctortransaction", column: "doctor_id" },
      { table: "doctorperiodsummary", column: "doctor_id" },
    ],
    employees: [
      { table: "user", column: "employee_id" },
      { table: "attendancerecord", column: "employee_id" },
      { table: "payrollrecord", column: "employee_id" },
    ],
  };
  let total = 0;
  for (const check of checks[target] ?? []) {
    const row = await first<{ count: number }>(
      env.DB.prepare(`SELECT COUNT(*) AS count FROM ${check.table} WHERE ${check.column} = ?`).bind(id)
    );
    total += Number(row?.count ?? 0);
  }
  return total;
}

export async function buildMasterPreview(env: Env, target: string, rows: Record<string, unknown>[]) {
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const existingRows = await listTable(env, config, null);
  const existingById = new Map(existingRows.map((row) => [Number(row.id), row]));
  const existingByIdentity = new Map(
    existingRows.map((row) => {
      const identity = identityWhere(target, row);
      return [`${identity.sql}:${String(identity.value || "").toLowerCase()}`, row] as const;
    })
  );
  const seen = new Set<string>();
  const previewRows = [];
  const errors = [];
  let valid = 0;
  let invalid = 0;
  let duplicate = 0;
  let newRows = 0;
  let updateRows = 0;
  let unchangedRows = 0;
  for (const [index, source] of rows.entries()) {
    const rowNumber = index + 2;
    const payload: Record<string, unknown> = targetPayload(target, source);
    const id = sourceId(source);
    const issues: string[] = [];
    if (!payload.name) issues.push("Nama wajib diisi.");
    const identity = identityWhere(target, payload);
    if (Number.isNaN(id)) issues.push("ID harus berupa angka bulat positif.");
    const identityKey = id ? `id:${id}` : `${identity.sql}:${String(identity.value || "").toLowerCase()}`;
    if (seen.has(identityKey)) {
      duplicate += 1;
      issues.push("Duplikat di file.");
    }
    seen.add(identityKey);
    const existing = issues.length
      ? null
      : id
        ? existingById.get(id)
        : existingByIdentity.get(`${identity.sql}:${String(identity.value || "").toLowerCase()}`);
    if (id && !existing) issues.push(`ID ${id} tidak ditemukan.`);
    const unchanged = existing && config.mutable.every((field) => sameMasterValue(existing[field], payload[field]));
    const status = issues.length ? "invalid" : unchanged ? "unchanged" : existing ? "update" : "new";
    if (status === "invalid") {
      invalid += 1;
      errors.push({ row: rowNumber, field: "name", message: issues.join(" ") });
    } else {
      valid += 1;
      if (status === "update") updateRows += 1;
      else if (status === "new") newRows += 1;
      else unchangedRows += 1;
    }
    previewRows.push({ row: rowNumber, id: existing?.id ?? id, status, issues, ...payload });
  }
  return {
    import_id: 0,
    target,
    valid_rows: valid,
    invalid_rows: invalid,
    summary: { new: newRows, update: updateRows, unchanged: unchangedRows, invalid, duplicate_in_file: duplicate },
    rows: previewRows,
    warnings: [],
    errors,
  };
}

async function storeImportPreview(c: { env: Env }, target: string, filename: string, preview: Record<string, unknown>, userId: number) {
  const result = await c.env.DB.prepare(
    `INSERT INTO importfile
      (original_filename, stored_path, kind, status, rows_valid, rows_invalid, warnings_count, preview_json, errors_json, created_by_id, created_at)
     VALUES (?, ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      filename,
      `preview/${target}/${Date.now()}-${filename}`,
      `master:${target}`,
      preview.valid_rows,
      preview.invalid_rows,
      (preview.warnings as unknown[] | undefined)?.length ?? 0,
      JSON.stringify(preview),
      JSON.stringify(preview.errors ?? []),
      userId,
      nowIso()
    )
    .run();
  preview.import_id = result.meta.last_row_id;
  await c.env.DB.prepare("UPDATE importfile SET preview_json = ? WHERE id = ?")
    .bind(JSON.stringify(preview), result.meta.last_row_id)
    .run();
  return preview;
}

for (const [path, config] of Object.entries(tables)) {
  masterRoutes.get(`/${path}`, async (c) => {
    const user = c.get("user");
    if (path === "employees" && user.role === "operator") {
      if (!user.employee_id) return c.json([]);
      const employee = await c.env.DB.prepare("SELECT * FROM employee WHERE id = ?").bind(user.employee_id).first();
      return c.json(employee ? [employee] : []);
    }
    return c.json(await listTable(c.env, config, c.req.query("search") ?? null));
  });

  masterRoutes.post(`/${path}`, adminOnly, async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const values = { ...pick(body, config.mutable), created_at: nowIso() };
    if (!Object.keys(values).length) throw new HTTPException(400, { message: "Payload kosong." });
    const fields = Object.keys(values);
    const placeholders = fields.map(() => "?").join(", ");
    const result = await c.env.DB.prepare(`INSERT INTO ${config.table} (${fields.join(", ")}) VALUES (${placeholders})`)
      .bind(...Object.values(values))
      .run();
    const row = await getById(c as never, config.table, Number(result.meta.last_row_id));
    return c.json(row, 201);
  });

  masterRoutes.patch(`/${path}/:id`, adminOnly, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<Record<string, unknown>>();
    const values = pick(body, config.mutable);
    if (!Object.keys(values).length) throw new HTTPException(400, { message: "Payload kosong." });
    await c.env.DB.prepare(`UPDATE ${config.table} SET ${assignmentSql(values)} WHERE id = ?`)
      .bind(...Object.values(values), id)
      .run();
    const row = await getById(c as never, config.table, id);
    if (!row) throw new HTTPException(404, { message: "Data tidak ditemukan" });
    return c.json(row);
  });

  masterRoutes.delete(`/${path}/:id`, adminOnly, async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const before = await getById(c as never, config.table, id);
    if (!before) throw new HTTPException(404, { message: "Data tidak ditemukan" });
    await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 0 WHERE id = ?`).bind(id).run();
    const row = await getById(c as never, config.table, id);
    if (!row) throw new HTTPException(404, { message: "Data tidak ditemukan" });
    await recordAudit(c.env, {
      actor_id: user.id,
      actor_username: user.username,
      actor_name: user.full_name,
      action: "delete",
      entity_type: config.table,
      entity_id: id,
      description: `Menonaktifkan ${config.table}.`,
      metadata: { target: path, name: before.name ?? before.username ?? null },
    });
    return c.json(row);
  });
}

masterRoutes.get("/master-data/export.xlsx", adminOnly, async (c) => {
  const user = c.get("user");
  const { bytes, counts } = await buildMasterDataWorkbook(c.env);
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "export",
    entity_type: "master_data",
    description: "Export master data ke XLSX.",
    metadata: counts,
  });
  return xlsxResponse(bytes, `master-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

masterRoutes.post("/:target/:id/activate", adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 1 WHERE id = ?`).bind(id).run();
  return c.json({ target, id, is_active: true });
});

masterRoutes.post("/:target/:id/deactivate", adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 0 WHERE id = ?`).bind(id).run();
  return c.json({ target, id, is_active: false });
});

masterRoutes.delete("/:target/:id/permanent", adminOnly, async (c) => {
  const user = c.get("user");
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  const before = await getById(c as never, config.table, id);
  if (!before) throw new HTTPException(404, { message: "Data tidak ditemukan" });
  const references = await masterReferenceCount(c.env, target, id);
  if (references > 0) {
    throw new HTTPException(409, {
      message: "Data masih dipakai di transaksi/histori. Nonaktifkan data ini jika tidak ingin digunakan lagi.",
    });
  }
  await c.env.DB.prepare(`DELETE FROM ${config.table} WHERE id = ?`).bind(id).run();
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "delete",
    entity_type: config.table,
    entity_id: id,
    description: `Menghapus permanen ${config.table}.`,
    metadata: { target, name: before.name ?? null },
  });
  return c.json({ target, id, deleted: true });
});

const USER_ROLES = new Set(["admin", "operator", "doctor"]);

const userSelectSql = `
  SELECT user.id, user.username, user.full_name, user.role, user.employee_id,
         employee.name AS employee_name, user.doctor_id, doctor.name AS doctor_name,
         user.is_active, user.created_at
  FROM user
  LEFT JOIN employee ON employee.id = user.employee_id
  LEFT JOIN doctor ON doctor.id = user.doctor_id`;

function safeUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    employee_id: row.employee_id ?? null,
    employee_name: row.employee_name ?? null,
    doctor_id: row.doctor_id ?? null,
    doctor_name: row.doctor_name ?? null,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

async function userById(env: Env, id: number) {
  const row = await first<Record<string, unknown>>(env.DB.prepare(`${userSelectSql} WHERE user.id = ?`).bind(id));
  return row ? safeUser(row) : null;
}

function normalizeRole(value: unknown, fallback: string): string {
  const role = String(value ?? fallback).toLowerCase();
  if (!USER_ROLES.has(role)) throw new HTTPException(400, { message: "Role tidak valid." });
  return role;
}

function normalizeDoctorId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new HTTPException(400, { message: "doctor_id tidak valid." });
  return parsed;
}

async function assertDoctorLinkAvailable(env: Env, doctorId: number | null, excludeUserId?: number): Promise<void> {
  if (doctorId == null) return;
  const doctor = await first<{ id: number }>(env.DB.prepare("SELECT id FROM doctor WHERE id = ?").bind(doctorId));
  if (!doctor) throw new HTTPException(400, { message: "Dokter tidak ditemukan di master data." });
  const linked = excludeUserId
    ? await first<{ id: number }>(env.DB.prepare("SELECT id FROM user WHERE doctor_id = ? AND id != ?").bind(doctorId, excludeUserId))
    : await first<{ id: number }>(env.DB.prepare("SELECT id FROM user WHERE doctor_id = ?").bind(doctorId));
  if (linked) throw new HTTPException(400, { message: "Dokter sudah terhubung ke akun lain." });
}

masterRoutes.get("/users", adminOnly, async (c) => {
  const rows = await all<Record<string, unknown>>(c.env.DB.prepare(`${userSelectSql} ORDER BY user.id`));
  return c.json(rows.map(safeUser));
});

masterRoutes.post("/users", adminOnly, async (c) => {
  const admin = c.get("user");
  const body = await c.req.json<Record<string, unknown>>();
  const password = String(body.password || "");
  if (!body.username || !body.full_name || !password) throw new HTTPException(400, { message: "Data user belum lengkap." });
  const role = normalizeRole(body.role, "operator");
  const doctorId = normalizeDoctorId(body.doctor_id);
  if (role === "doctor" && doctorId == null) {
    throw new HTTPException(400, { message: "Role dokter wajib memiliki dokter terhubung (doctor_id)." });
  }
  await assertDoctorLinkAvailable(c.env, doctorId);
  const result = await c.env.DB.prepare(
    `INSERT INTO user (username, full_name, role, employee_id, doctor_id, hashed_password, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      String(body.username),
      String(body.full_name),
      role,
      body.employee_id ?? null,
      doctorId,
      await hashPassword(password),
      body.is_active === false ? 0 : 1,
      nowIso()
    )
    .run();
  await recordAudit(c.env, {
    actor_id: admin.id,
    actor_username: admin.username,
    actor_name: admin.full_name,
    action: "create",
    entity_type: "user",
    entity_id: result.meta.last_row_id,
    description: `Membuat user ${String(body.username)}.`,
  });
  return c.json(await userById(c.env, Number(result.meta.last_row_id)), 201);
});

masterRoutes.patch("/users/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await first<Record<string, unknown>>(c.env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(id));
  if (!existing) throw new HTTPException(404, { message: "User tidak ditemukan." });
  const body = await c.req.json<Record<string, unknown>>();
  const values = pick(body, ["full_name", "employee_id", "is_active"]);
  if (body.role !== undefined) {
    values.role = normalizeRole(body.role, "");
  }
  const role = values.role ? String(values.role) : String(existing.role).toLowerCase();
  const hasDoctorId = Object.prototype.hasOwnProperty.call(body, "doctor_id");
  let doctorId: number | null = hasDoctorId ? normalizeDoctorId(body.doctor_id) : existing.doctor_id == null ? null : Number(existing.doctor_id);
  if (role !== "doctor" && !hasDoctorId) doctorId = null; // demoting a doctor account clears the doctor link
  if (role === "doctor" && doctorId == null) {
    throw new HTTPException(400, { message: "Role dokter wajib memiliki dokter terhubung (doctor_id)." });
  }
  await assertDoctorLinkAvailable(c.env, doctorId, id);
  if (Number(existing.doctor_id ?? null) !== doctorId) values.doctor_id = doctorId;
  if (typeof body.password === "string" && body.password) values.hashed_password = await hashPassword(body.password);
  if (!Object.keys(values).length) throw new HTTPException(400, { message: "Payload kosong." });
  await c.env.DB.prepare(`UPDATE user SET ${assignmentSql(values)} WHERE id = ?`).bind(...Object.values(values), id).run();
  return c.json(await userById(c.env, id));
});

// GET /settings/report-identity is registered publicly in index.ts (pre-auth) so the
// login page can display the clinic name before sign-in.

masterRoutes.patch("/settings/report-identity", adminOnly, async (c) => {
  const body = await c.req.json<{ clinic_name?: string }>();
  const clinicName = (body.clinic_name || "").trim();
  if (!clinicName) throw new HTTPException(400, { message: "Nama klinik wajib diisi." });
  await c.env.DB.prepare(
    `INSERT INTO appsetting (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind("report_clinic_name", clinicName, nowIso())
    .run();
  return c.json({ clinic_name: clinicName });
});

for (const [route, table] of [
  ["payroll-rules", "payrollrule"],
  ["attendance-rules", "attendancerule"],
  ["doctor-fee-rules", "doctorfeerule"],
] as const) {
  masterRoutes.get(`/settings/${route}`, adminOnly, async (c) => {
    return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`)));
  });

  masterRoutes.post(`/settings/${route}`, adminOnly, async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    if (body.is_default) await c.env.DB.prepare(`UPDATE ${table} SET is_default = 0`).run();
    const values = { ...body, created_at: nowIso() };
    const fields = Object.keys(values);
    const result = await c.env.DB.prepare(`INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
      .bind(...Object.values(values))
      .run();
    return c.json(await getById(c as never, table, Number(result.meta.last_row_id)), 201);
  });

  masterRoutes.patch(`/settings/${route}/:id`, adminOnly, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<Record<string, unknown>>();
    if (body.is_default) await c.env.DB.prepare(`UPDATE ${table} SET is_default = 0`).run();
    if (!Object.keys(body).length) throw new HTTPException(400, { message: "Payload kosong." });
    await c.env.DB.prepare(`UPDATE ${table} SET ${assignmentSql(body)} WHERE id = ?`).bind(...Object.values(body), id).run();
    return c.json(await getById(c as never, table, id));
  });
}

masterRoutes.get("/settings/attendance-holidays", async (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");
  let sql = "SELECT * FROM attendanceholiday";
  const params: string[] = [];
  if (start || end) {
    sql += " WHERE 1 = 1";
    if (start) {
      sql += " AND holiday_date >= ?";
      params.push(start);
    }
    if (end) {
      sql += " AND holiday_date <= ?";
      params.push(end);
    }
  }
  sql += " ORDER BY holiday_date";
  return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(sql).bind(...params)));
});

masterRoutes.post("/settings/attendance-holidays", adminOnly, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.holiday_date) throw new HTTPException(400, { message: "Tanggal libur wajib diisi." });
  const existing = await first<Record<string, unknown>>(
    c.env.DB.prepare("SELECT * FROM attendanceholiday WHERE holiday_date = ?").bind(body.holiday_date)
  );
  if (existing) {
    await c.env.DB.prepare("UPDATE attendanceholiday SET name = ?, is_holiday = ? WHERE id = ?")
      .bind(body.name ?? null, body.is_holiday === false ? 0 : 1, existing.id)
      .run();
    return c.json(await getById(c as never, "attendanceholiday", Number(existing.id)));
  }
  const result = await c.env.DB.prepare("INSERT INTO attendanceholiday (holiday_date, name, is_holiday, created_at) VALUES (?, ?, ?, ?)")
    .bind(body.holiday_date, body.name ?? null, body.is_holiday === false ? 0 : 1, nowIso())
    .run();
  return c.json(await getById(c as never, "attendanceholiday", Number(result.meta.last_row_id)), 201);
});

masterRoutes.delete("/settings/attendance-holidays/:id", adminOnly, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const before = await getById(c as never, "attendanceholiday", id);
  if (!before) throw new HTTPException(404, { message: "Data tidak ditemukan" });
  await c.env.DB.prepare("DELETE FROM attendanceholiday WHERE id = ?").bind(id).run();
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "delete",
    entity_type: "attendance_holiday",
    entity_id: id,
    description: "Menghapus hari libur absensi.",
    metadata: { holiday_date: before.holiday_date, name: before.name ?? null },
  });
  return c.json({ status: "ok" });
});

masterRoutes.post("/master-data/import/:target/preview", adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw, target);
  const preview = await buildMasterPreview(c.env, target, rows);
  return c.json(await storeImportPreview(c, target, filename, preview, user.id));
});

masterRoutes.post("/master-data/import/:target/:id/commit", adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const importId = Number(c.req.param("id"));
  const stored = await first<{ preview_json: string }>(c.env.DB.prepare("SELECT preview_json FROM importfile WHERE id = ? AND kind = ?").bind(importId, `master:${target}`));
  if (!stored) throw new HTTPException(404, { message: "Preview import tidak ditemukan." });
  const preview = JSON.parse(stored.preview_json) as { rows: Array<Record<string, unknown> & { status: string }>; invalid_rows: number };
  const updates = preview.rows.filter((item) => item.status === "update");
  const inserts = preview.rows.filter((item) => item.status === "new");
  if (updates.length) {
    const rowsJson = JSON.stringify(updates.map((row) => ({ id: row.id, ...pick(row, config.mutable) })));
    await c.env.DB.prepare(
      `INSERT INTO ${config.table} (id, ${config.mutable.join(", ")}, created_at)
       SELECT json_extract(value, '$.id'), ${config.mutable.map((field) => `json_extract(value, '$.${field}')`).join(", ")}, ?
       FROM json_each(?) WHERE true
       ON CONFLICT(id) DO UPDATE SET ${config.mutable.map((field) => `${field} = excluded.${field}`).join(", ")}`
    ).bind(nowIso(), rowsJson).run();
  }
  if (inserts.length) {
    const rowsJson = JSON.stringify(inserts.map((row) => pick(row, config.mutable)));
    await c.env.DB.prepare(
      `INSERT INTO ${config.table} (${config.mutable.join(", ")}, created_at)
       SELECT ${config.mutable.map((field) => `json_extract(value, '$.${field}')`).join(", ")}, ? FROM json_each(?)`
    ).bind(nowIso(), rowsJson).run();
  }
  await c.env.DB.prepare("UPDATE importfile SET status = 'committed', committed_at = ? WHERE id = ?")
    .bind(nowIso(), importId)
    .run();
  return c.json({ target, created: inserts.length, updated: updates.length, unchanged: preview.rows.filter((row) => row.status === "unchanged").length, invalid_rows: preview.invalid_rows });
});

masterRoutes.post("/master-data/import/treatments", adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw, "treatments");
  const preview = await storeImportPreview(c, "treatments", filename, await buildMasterPreview(c.env, "treatments", rows), user.id);
  return c.redirect(`/master-data/import/treatments/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/master-data/import/doctors", adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw, "doctors");
  const preview = await storeImportPreview(c, "doctors", filename, await buildMasterPreview(c.env, "doctors", rows), user.id);
  return c.redirect(`/master-data/import/doctors/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/master-data/import/employees", adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw, "employees");
  const preview = await storeImportPreview(c, "employees", filename, await buildMasterPreview(c.env, "employees", rows), user.id);
  return c.redirect(`/master-data/import/employees/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/dev/refresh-database", adminOnly, async (c) => {
  if (!isDevelopment(c.env)) {
    throw new HTTPException(403, { message: "Refresh database hanya tersedia di development." });
  }
  await refreshDevelopmentDatabase(c.env);
  return c.json({ status: "ok", message: "Database refreshed and development seed data created." });
});
