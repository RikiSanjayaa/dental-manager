import { Hono } from "hono";
import { adminOnly, type AppVariables } from "../auth";
import { all } from "../db";
import type { Env } from "../types";

export const auditRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function auditQuery(baseSql: string, params: unknown[], action?: string, entityType?: string, limitText?: string) {
  let sql = baseSql;
  if (action) {
    sql += " AND action = ?";
    params.push(action);
  }
  if (entityType) {
    sql += " AND entity_type = ?";
    params.push(entityType);
  }
  const limit = Math.max(1, Math.min(Number(limitText || 200), 500));
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  return { sql, params };
}

auditRoutes.get("", adminOnly, async (c) => {
  const { sql, params } = auditQuery(
    "SELECT * FROM auditlog WHERE 1 = 1",
    [],
    c.req.query("action"),
    c.req.query("entity_type"),
    c.req.query("limit")
  );
  return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(sql).bind(...params)));
});

auditRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const { sql, params } = auditQuery(
    "SELECT * FROM auditlog WHERE actor_id = ?",
    [user.id],
    c.req.query("action"),
    c.req.query("entity_type"),
    c.req.query("limit")
  );
  return c.json(await all<Record<string, unknown>>(c.env.DB.prepare(sql).bind(...params)));
});
