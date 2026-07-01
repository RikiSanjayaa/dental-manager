import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminOnly, currentUser, type AppVariables } from "../auth";
import { all, recordAudit } from "../db";
import type { Env } from "../types";

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

for (const route of ["/doctor-fees", "/payroll", "/payroll/:period/slips/:employee_id.pdf", "/templates/:template_name.xlsx"]) {
  reportsRoutes.get(route, currentUser, async () => {
    throw new HTTPException(501, {
      message: "Generator laporan Worker belum selesai. Endpoint ini disiapkan untuk parity tahap berikutnya.",
    });
  });
}
