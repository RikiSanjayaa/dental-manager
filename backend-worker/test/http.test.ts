import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../src/http";

describe("CORS origin matching", () => {
  const origins = [
    "https://op.devemaclinic.com",
    "https://spv.devemaclinic.com",
    "https://*.pages.dev",
    "https://*.workers.dev",
  ];

  it("allows exact production origins", () => {
    expect(isAllowedOrigin("https://op.devemaclinic.com", origins)).toBe(true);
    expect(isAllowedOrigin("https://spv.devemaclinic.com", origins)).toBe(true);
  });

  it("allows Cloudflare preview domains", () => {
    expect(isAllowedOrigin("https://dental-manager.pages.dev", origins)).toBe(true);
    expect(isAllowedOrigin("https://dental-manager-api.workers.dev", origins)).toBe(true);
  });

  it("rejects unrelated domains", () => {
    expect(isAllowedOrigin("https://example.com", origins)).toBe(false);
  });
});
