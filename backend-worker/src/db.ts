import type { AuditLogInput, Env, User } from "./types";
import { nowIso } from "./http";

const booleanFields = new Set([
  "is_active",
  "is_training",
  "is_default",
  "is_absent",
  "is_sunday",
  "is_holiday",
  "is_double_shift",
  "needs_review",
]);

function normalizeBooleans<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const normalized = { ...(row as Record<string, unknown>) };
  for (const field of booleanFields) {
    if (field in normalized) {
      normalized[field] = normalized[field] === true || normalized[field] === 1 || normalized[field] === "1";
    }
  }
  return normalized as T;
}

export async function first<T>(query: D1PreparedStatement): Promise<T | null> {
  const row = (await query.first<T>()) ?? null;
  return row ? normalizeBooleans(row) : null;
}

export async function all<T>(query: D1PreparedStatement): Promise<T[]> {
  const result = await query.all<T>();
  return (result.results ?? []).map((row) => normalizeBooleans(row));
}

export async function getUserByUsername(env: Env, username: string): Promise<User | null> {
  return first<User>(env.DB.prepare("SELECT * FROM user WHERE username = ?").bind(username));
}

export async function getUserById(env: Env, id: number): Promise<User | null> {
  return first<User>(env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(id));
}

export async function seedDefaults(env: Env, hashPassword: (password: string) => Promise<string>) {
  const adminUsername = env.ADMIN_USERNAME || "admin";
  const adminPassword = env.ADMIN_PASSWORD || "admin12345";
  const existing = await getUserByUsername(env, adminUsername);
  if (!existing) {
    const hash = await hashPassword(adminPassword);
    await env.DB.prepare(
      "INSERT INTO user (username, full_name, role, hashed_password, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)"
    )
      .bind(adminUsername, "Administrator", "admin", hash, nowIso())
      .run();
  }

  await env.DB.prepare(
    "INSERT INTO payrollrule (name, is_default, created_at) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM payrollrule WHERE name = ?)"
  )
    .bind("Default", nowIso(), "Default")
    .run();
  await env.DB.prepare(
    "INSERT INTO attendancerule (name, is_default, created_at) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM attendancerule WHERE name = ?)"
  )
    .bind("Default", nowIso(), "Default")
    .run();
  await env.DB.prepare(
    "INSERT INTO doctorfeerule (name, is_default, created_at) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM doctorfeerule WHERE name = ?)"
  )
    .bind("Default", nowIso(), "Default")
    .run();
  await env.DB.prepare(
    "INSERT INTO appsetting (key, value, updated_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM appsetting WHERE key = ?)"
  )
    .bind("report_clinic_name", env.APP_NAME || "Dental Manager", nowIso(), "report_clinic_name")
    .run();
}

export async function recordAudit(env: Env, input: AuditLogInput) {
  await env.DB.prepare(
    `INSERT INTO auditlog
      (actor_id, actor_username, actor_name, action, entity_type, entity_id, description, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.actor_id ?? null,
      input.actor_username ?? null,
      input.actor_name ?? null,
      input.action,
      input.entity_type,
      input.entity_id == null ? null : String(input.entity_id),
      input.description,
      JSON.stringify(input.metadata ?? {}),
      nowIso()
    )
    .run();
}

export async function deleteExpiredArchives(env: Env): Promise<number> {
  const expired = await all<{ id: number; stored_path: string | null }>(
    env.DB.prepare("SELECT id, stored_path FROM reportarchive WHERE expires_at <= ?").bind(nowIso())
  );
  for (const row of expired) {
    if (row.stored_path) await env.REPORTS.delete(row.stored_path);
    await env.DB.prepare("DELETE FROM reportarchive WHERE id = ?").bind(row.id).run();
  }
  return expired.length;
}
