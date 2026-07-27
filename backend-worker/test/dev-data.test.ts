import { describe, expect, it } from "vitest";
import { isDevelopment } from "../src/dev-data";
import type { Env } from "../src/types";

describe("development endpoint guard", () => {
  it("fails closed when APP_ENV is missing or production", () => {
    expect(isDevelopment({} as Env)).toBe(false);
    expect(isDevelopment({ APP_ENV: "production" } as Env)).toBe(false);
  });

  it("allows explicit local development environments", () => {
    expect(isDevelopment({ APP_ENV: "development" } as Env)).toBe(true);
    expect(isDevelopment({ APP_ENV: "local" } as Env)).toBe(true);
  });
});
