import bcrypt from "bcryptjs";
import { HTTPException } from "hono/http-exception";
import type { Context, Next } from "hono";
import { getUserByUsername, recordAudit, seedDefaults } from "./db";
import type { Env, User } from "./types";

const encoder = new TextEncoder();

function base64Url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAccessToken(env: Env, subject: string, extra: Record<string, unknown> = {}): Promise<string> {
  const secret = env.SECRET_KEY || "change-me-in-production";
  const expiresMinutes = Number(env.ACCESS_TOKEN_EXPIRE_MINUTES || 720);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + expiresMinutes * 60,
    ...extra,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(signingInput));
  return `${signingInput}.${base64Url(signature)}`;
}

export async function decodeAccessToken(env: Env, token: string): Promise<Record<string, unknown> | null> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const signingInput = `${header}.${payload}`;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(env.SECRET_KEY || "change-me-in-production"),
    decodeBase64Url(signature),
    encoder.encode(signingInput)
  );
  if (!valid) return null;
  const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Record<string, unknown>;
  if (typeof data.exp === "number" && data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

export type AppVariables = {
  user: User;
};

export async function currentUser(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const authorization = c.req.header("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const payload = token ? await decodeAccessToken(c.env, token) : null;
  if (!payload || typeof payload.sub !== "string") {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }
  const user = await getUserByUsername(c.env, payload.sub);
  if (!user || !user.is_active) {
    throw new HTTPException(401, { message: "Inactive or missing user" });
  }
  c.set("user", user);
  await next();
}

export async function adminOnly(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const user = c.get("user");
  if (user.role !== "admin") throw new HTTPException(403, { message: "Admin access required" });
  await next();
}

export async function login(env: Env, username: string, password: string) {
  await seedDefaults(env, hashPassword);
  const user = await getUserByUsername(env, username);
  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    throw new HTTPException(401, { message: "Username atau password salah" });
  }
  await recordAudit(env, {
    actor_id: user.id,
    actor_username: user.username,
    actor_name: user.full_name,
    action: "login",
    entity_type: "auth",
    entity_id: user.id,
    description: `Login ${user.username}.`,
  });
  return {
    access_token: await createAccessToken(env, user.username, { role: user.role }),
    token_type: "bearer",
  };
}
