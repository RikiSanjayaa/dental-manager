import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, currentUser, hashPassword, type AppVariables } from "../auth";
import { all, first, recordAudit } from "../db";
import { nowIso } from "../http";
import type { Env } from "../types";
import { boolValue, numberValue, textValue, workbookRowsFromRequest } from "../xlsx";

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

async function buildMasterPreview(env: Env, target: string, rows: Record<string, unknown>[]) {
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const seen = new Set<string>();
  const previewRows = [];
  const errors = [];
  let valid = 0;
  let invalid = 0;
  let duplicate = 0;
  let newRows = 0;
  let updateRows = 0;
  for (const [index, source] of rows.entries()) {
    const rowNumber = index + 2;
    const payload = targetPayload(target, source);
    const issues: string[] = [];
    if (!payload.name) issues.push("Nama wajib diisi.");
    const identity = identityWhere(target, payload);
    const identityKey = `${identity.sql}:${String(identity.value || "").toLowerCase()}`;
    if (seen.has(identityKey)) {
      duplicate += 1;
      issues.push("Duplikat di file.");
    }
    seen.add(identityKey);
    const existing = issues.length ? null : await first<Record<string, unknown>>(env.DB.prepare(`SELECT id FROM ${config.table} WHERE ${identity.sql}`).bind(identity.value));
    const status = issues.length ? "invalid" : existing ? "update" : "new";
    if (status === "invalid") {
      invalid += 1;
      errors.push({ row: rowNumber, field: "name", message: issues.join(" ") });
    } else {
      valid += 1;
      if (status === "update") updateRows += 1;
      else newRows += 1;
    }
    previewRows.push({ row: rowNumber, status, issues, ...payload });
  }
  return {
    import_id: 0,
    target,
    valid_rows: valid,
    invalid_rows: invalid,
    summary: { new: newRows, update: updateRows, invalid, duplicate_in_file: duplicate },
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
  masterRoutes.get(`/${path}`, currentUser, async (c) => {
    const user = c.get("user");
    if (path === "employees" && user.role === "operator") {
      if (!user.employee_id) return c.json([]);
      const employee = await c.env.DB.prepare("SELECT * FROM employee WHERE id = ?").bind(user.employee_id).first();
      return c.json(employee ? [employee] : []);
    }
    return c.json(await listTable(c.env, config, c.req.query("search") ?? null));
  });

  masterRoutes.post(`/${path}`, currentUser, adminOnly, async (c) => {
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

  masterRoutes.patch(`/${path}/:id`, currentUser, adminOnly, async (c) => {
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

  masterRoutes.delete(`/${path}/:id`, currentUser, adminOnly, async (c) => {
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 0 WHERE id = ?`).bind(id).run();
    const row = await getById(c as never, config.table, id);
    if (!row) throw new HTTPException(404, { message: "Data tidak ditemukan" });
    return c.json(row);
  });
}

masterRoutes.post("/:target/:id/activate", currentUser, adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 1 WHERE id = ?`).bind(id).run();
  return c.json({ target, id, is_active: true });
});

masterRoutes.post("/:target/:id/deactivate", currentUser, adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE ${config.table} SET is_active = 0 WHERE id = ?`).bind(id).run();
  return c.json({ target, id, is_active: false });
});

masterRoutes.delete("/:target/:id/permanent", currentUser, adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const id = Number(c.req.param("id"));
  const references = await masterReferenceCount(c.env, target, id);
  if (references > 0) {
    throw new HTTPException(409, {
      message: "Data masih dipakai di transaksi/histori. Nonaktifkan data ini jika tidak ingin digunakan lagi.",
    });
  }
  await c.env.DB.prepare(`DELETE FROM ${config.table} WHERE id = ?`).bind(id).run();
  return c.json({ target, id, deleted: true });
});

masterRoutes.get("/users", currentUser, adminOnly, async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB.prepare(
      `SELECT user.id, user.username, user.full_name, user.role, user.employee_id, employee.name AS employee_name, user.is_active
       FROM user LEFT JOIN employee ON employee.id = user.employee_id ORDER BY user.id`
    )
  );
  return c.json(rows);
});

masterRoutes.post("/users", currentUser, adminOnly, async (c) => {
  const admin = c.get("user");
  const body = await c.req.json<Record<string, unknown>>();
  const password = String(body.password || "");
  if (!body.username || !body.full_name || !password) throw new HTTPException(400, { message: "Data user belum lengkap." });
  const result = await c.env.DB.prepare(
    `INSERT INTO user (username, full_name, role, employee_id, hashed_password, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      String(body.username),
      String(body.full_name),
      String(body.role || "operator"),
      body.employee_id ?? null,
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
  return c.json(await getById(c as never, "user", Number(result.meta.last_row_id)), 201);
});

masterRoutes.patch("/users/:id", currentUser, adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const values = pick(body, ["full_name", "role", "employee_id", "is_active"]);
  if (typeof body.password === "string" && body.password) values.hashed_password = await hashPassword(body.password);
  if (!Object.keys(values).length) throw new HTTPException(400, { message: "Payload kosong." });
  await c.env.DB.prepare(`UPDATE user SET ${assignmentSql(values)} WHERE id = ?`).bind(...Object.values(values), id).run();
  return c.json(await getById(c as never, "user", id));
});

masterRoutes.get("/settings/report-identity", currentUser, async (c) => {
  const item = await c.env.DB.prepare("SELECT value FROM appsetting WHERE key = ?").bind("report_clinic_name").first<{ value: string }>();
  return c.json({ clinic_name: item?.value || c.env.APP_NAME || "Dental Manager" });
});

masterRoutes.patch("/settings/report-identity", currentUser, adminOnly, async (c) => {
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
  masterRoutes.get(`/settings/${route}`, currentUser, adminOnly, async (c) => {
    return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`)));
  });

  masterRoutes.post(`/settings/${route}`, currentUser, adminOnly, async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    if (body.is_default) await c.env.DB.prepare(`UPDATE ${table} SET is_default = 0`).run();
    const values = { ...body, created_at: nowIso() };
    const fields = Object.keys(values);
    const result = await c.env.DB.prepare(`INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
      .bind(...Object.values(values))
      .run();
    return c.json(await getById(c as never, table, Number(result.meta.last_row_id)), 201);
  });

  masterRoutes.patch(`/settings/${route}/:id`, currentUser, adminOnly, async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<Record<string, unknown>>();
    if (body.is_default) await c.env.DB.prepare(`UPDATE ${table} SET is_default = 0`).run();
    if (!Object.keys(body).length) throw new HTTPException(400, { message: "Payload kosong." });
    await c.env.DB.prepare(`UPDATE ${table} SET ${assignmentSql(body)} WHERE id = ?`).bind(...Object.values(body), id).run();
    return c.json(await getById(c as never, table, id));
  });
}

masterRoutes.get("/settings/attendance-holidays", currentUser, async (c) => {
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

masterRoutes.post("/settings/attendance-holidays", currentUser, adminOnly, async (c) => {
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

masterRoutes.delete("/settings/attendance-holidays/:id", currentUser, adminOnly, async (c) => {
  await c.env.DB.prepare("DELETE FROM attendanceholiday WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ status: "ok" });
});

masterRoutes.post("/master-data/import/:target/preview", currentUser, adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw);
  const preview = await buildMasterPreview(c.env, target, rows);
  return c.json(await storeImportPreview(c, target, filename, preview, user.id));
});

masterRoutes.post("/master-data/import/:target/:id/commit", currentUser, adminOnly, async (c) => {
  const target = c.req.param("target") ?? "";
  const config = tables[target];
  if (!config) throw new HTTPException(404, { message: "Target master data tidak dikenal." });
  const importId = Number(c.req.param("id"));
  const stored = await first<{ preview_json: string }>(c.env.DB.prepare("SELECT preview_json FROM importfile WHERE id = ? AND kind = ?").bind(importId, `master:${target}`));
  if (!stored) throw new HTTPException(404, { message: "Preview import tidak ditemukan." });
  const preview = JSON.parse(stored.preview_json) as { rows: Array<Record<string, unknown> & { status: string }>; invalid_rows: number };
  let created = 0;
  let updated = 0;
  for (const row of preview.rows.filter((item) => item.status !== "invalid")) {
    const payload = pick(row, config.mutable);
    const identity = identityWhere(target, payload);
    const existing = await first<{ id: number }>(c.env.DB.prepare(`SELECT id FROM ${config.table} WHERE ${identity.sql}`).bind(identity.value));
    if (existing) {
      await c.env.DB.prepare(`UPDATE ${config.table} SET ${assignmentSql(payload)} WHERE id = ?`)
        .bind(...Object.values(payload), existing.id)
        .run();
      updated += 1;
    } else {
      const values = { ...payload, created_at: nowIso() };
      const fields = Object.keys(values);
      await c.env.DB.prepare(`INSERT INTO ${config.table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
        .bind(...Object.values(values))
        .run();
      created += 1;
    }
  }
  await c.env.DB.prepare("UPDATE importfile SET status = 'committed', committed_at = ? WHERE id = ?")
    .bind(nowIso(), importId)
    .run();
  return c.json({ target, created, updated, invalid_rows: preview.invalid_rows });
});

masterRoutes.post("/master-data/import/treatments", currentUser, adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw);
  const preview = await storeImportPreview(c, "treatments", filename, await buildMasterPreview(c.env, "treatments", rows), user.id);
  return c.redirect(`/master-data/import/treatments/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/master-data/import/doctors", currentUser, adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw);
  const preview = await storeImportPreview(c, "doctors", filename, await buildMasterPreview(c.env, "doctors", rows), user.id);
  return c.redirect(`/master-data/import/doctors/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/master-data/import/employees", currentUser, adminOnly, async (c) => {
  const user = c.get("user");
  const { filename, rows } = await workbookRowsFromRequest(c.req.raw);
  const preview = await storeImportPreview(c, "employees", filename, await buildMasterPreview(c.env, "employees", rows), user.id);
  return c.redirect(`/master-data/import/employees/${preview.import_id}/commit`, 307);
});

masterRoutes.post("/dev/refresh-database", currentUser, adminOnly, async (c) => {
  if ((c.env.APP_ENV || "development").toLowerCase() === "production") {
    throw new HTTPException(403, { message: "Refresh database hanya tersedia di development." });
  }
  throw new HTTPException(501, { message: "Refresh database Worker belum diimplementasikan." });
});
