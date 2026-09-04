import { describe, expect, it, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import { isStaff, requireLinkedDoctor, staffOnly } from "../src/auth";
import type { User } from "../src/types";

function makeUser(partial: Partial<User>): User {
  return {
    id: 1,
    username: "user",
    full_name: "User",
    role: "operator",
    employee_id: null,
    doctor_id: null,
    hashed_password: "hash",
    is_active: true,
    created_at: "2026-01-01 00:00:00",
    ...partial,
  };
}

function makeContext(user: User) {
  return { get: () => user } as never;
}

async function rejection(promise: Promise<unknown>): Promise<HTTPException | null> {
  const error = await promise.then(
    () => null,
    (caught) => caught
  );
  return error instanceof HTTPException ? error : null;
}

describe("staff role helpers", () => {
  it("treats admin and operator as staff, doctor as not", () => {
    expect(isStaff({ role: "admin" })).toBe(true);
    expect(isStaff({ role: "operator" })).toBe(true);
    expect(isStaff({ role: "doctor" })).toBe(false);
  });

  it("staffOnly passes admin/operator and rejects doctor with 403", async () => {
    for (const role of ["admin", "operator"] as const) {
      const next = vi.fn(async () => undefined);
      await staffOnly(makeContext(makeUser({ role })), next);
      expect(next).toHaveBeenCalledOnce();
    }
    const error = await rejection(staffOnly(makeContext(makeUser({ role: "doctor" })), vi.fn(async () => undefined)));
    expect(error?.status).toBe(403);
  });
});

describe("doctor link requirement", () => {
  it("rejects non-doctor roles on doctor-only endpoints with 403", async () => {
    const error = await rejection(requireLinkedDoctor(makeContext(makeUser({ role: "operator" })), vi.fn(async () => undefined)));
    expect(error?.status).toBe(403);
  });

  it("rejects an unlinked doctor account with 409", async () => {
    const error = await rejection(
      requireLinkedDoctor(makeContext(makeUser({ role: "doctor", doctor_id: null })), vi.fn(async () => undefined))
    );
    expect(error?.status).toBe(409);
  });

  it("passes a linked doctor account", async () => {
    const next = vi.fn(async () => undefined);
    await requireLinkedDoctor(makeContext(makeUser({ role: "doctor", doctor_id: 7 })), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
