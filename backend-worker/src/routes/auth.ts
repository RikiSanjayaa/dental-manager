import { Hono } from "hono";
import { getUserById, recordAudit } from "../db";
import { currentUser, login } from "../auth";
import type { AppVariables } from "../auth";
import type { Env, Employee } from "../types";

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRoutes.post("/login", async (c) => {
  const contentType = c.req.header("Content-Type") || "";
  let username = "";
  let password = "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    username = String(form.username || "");
    password = String(form.password || "");
  } else {
    const body = await c.req.json<{ username?: string; password?: string }>();
    username = body.username || "";
    password = body.password || "";
  }
  return c.json(await login(c.env, username, password));
});

authRoutes.get("/me", currentUser, async (c) => {
  const user = c.get("user");
  const employee = user.employee_id
    ? await c.env.DB.prepare("SELECT * FROM employee WHERE id = ?").bind(user.employee_id).first<Employee>()
    : null;
  return c.json({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    employee_id: user.employee_id,
    employee_name: employee?.name ?? null,
  });
});

authRoutes.post("/logout", currentUser, async (c) => {
  const user = c.get("user");
  await recordAudit(c.env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "logout",
    entity_type: "auth",
    entity_id: user.id,
    description: `Logout ${user.username}.`,
  });
  await getUserById(c.env, user.id);
  return c.json({ status: "ok" });
});
