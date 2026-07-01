import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth";
import { auditRoutes } from "./routes/audit";
import { doctorFeeRoutes } from "./routes/doctor-fee";
import { masterRoutes } from "./routes/master";
import { dashboardRoutes } from "./routes/dashboard";
import { payrollRoutes } from "./routes/payroll";
import { reportsRoutes, templateResponse } from "./routes/reports";
import { currentUser, hashPassword, type AppVariables } from "./auth";
import { corsOrigins, errorHandler } from "./http";
import { deleteExpiredArchives, seedDefaults } from "./db";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", async (c, next) => {
  const origins = corsOrigins(c.env);
  return cors({
    origin: (origin) => (origins.includes("*") || origins.includes(origin) ? origin : origins[0] || origin),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })(c, next);
});
app.use("*", errorHandler);

app.get("/health", async (c) => {
  await seedDefaults(c.env, hashPassword);
  return c.json({ status: "ok" });
});

app.route("/auth", authRoutes);
app.get("/reports/templates/:template_name", (c) => templateResponse(c.req.param("template_name") ?? ""));
app.use("*", currentUser);
app.route("/audit-logs", auditRoutes);
app.route("/", dashboardRoutes);
app.route("/", masterRoutes);
app.route("/", doctorFeeRoutes);
app.route("/", payrollRoutes);
app.route("/reports", reportsRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_: ScheduledEvent, env: Env): Promise<void> {
    await deleteExpiredArchives(env);
  },
};
