import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";

export function jsonError(status: number, detail: string): HTTPException {
  return new HTTPException(status as never, { message: detail });
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

export function corsOrigins(env: Env): string[] {
  return (env.CORS_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  return allowedOrigins.some((allowedOrigin) => {
    if (!allowedOrigin.includes("*")) return false;
    try {
      const parsedAllowedOrigin = new URL(allowedOrigin.replace("*.", "wildcard."));
      const suffix = parsedAllowedOrigin.hostname.replace(/^wildcard\./, ".");
      return parsedOrigin.protocol === parsedAllowedOrigin.protocol && parsedOrigin.hostname.endsWith(suffix);
    } catch {
      return false;
    }
  });
}

export async function errorHandler(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ detail: error.message }, error.status);
    }
    console.error(error);
    return c.json({ detail: "Terjadi kesalahan server." }, 500);
  }
}
