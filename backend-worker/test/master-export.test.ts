import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildMasterDataWorkbook, buildMasterPreview } from "../src/routes/master";
import type { Env } from "../src/types";

describe("master data export", () => {
  it("writes import-compatible sheets and excludes internal fields", async () => {
    const data: Record<string, Record<string, unknown>[]> = {
      treatment: [{ id: 1, code: "SC-001", name: "Scaling", is_active: 1, created_at: "2026-07-01" }],
      doctor: [{ id: 2, name: "Drg. Anindita", normal_fee_rate: 0.6, is_active: 1, created_at: "2026-07-01" }],
      employee: [{ id: 3, name: "Nadia", attendance_id: "EMP-001", is_active: 0, created_at: "2026-07-01" }],
    };
    const DB = {
      prepare(sql: string) {
        const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
        return { async all() { return { results: data[table] ?? [] }; } };
      },
    } as unknown as D1Database;

    const { bytes, counts } = await buildMasterDataWorkbook({ DB } as Env);
    const workbook = XLSX.read(bytes, { type: "array" });
    const treatment = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Treatments);

    expect(workbook.SheetNames).toEqual(["Employees", "Doctors", "Treatments"]);
    expect(counts).toEqual({ employees: 1, doctors: 1, treatments: 1 });
    expect(treatment[0]).toMatchObject({ id: 1, code: "SC-001", name: "Scaling", is_active: true });
    expect(treatment[0]).not.toHaveProperty("created_at");
  });

  it("uses IDs to distinguish unchanged, edited, and new rows in one D1 read", async () => {
    let queryCount = 0;
    const existing = Array.from({ length: 300 }, (_, index) => ({
      id: index + 1,
      name: `Employee ${index + 1}`,
      attendance_id: `EMP-${index + 1}`,
      position: "Staff",
      join_date: "2026-01-01",
      base_salary: 3000000,
      working_days: 25,
      is_training: false,
      bank_name: "BCA",
      account_name: `Employee ${index + 1}`,
      account_number: String(1000 + index),
      is_active: true,
    }));
    const DB = {
      prepare() {
        return {
          async all() {
            queryCount += 1;
            return { results: existing };
          },
        };
      },
    } as unknown as D1Database;
    const rows = [
      ...existing.map((row, index) => index === 1 ? { ...row, base_salary: 3500000 } : row),
      { ...existing[0], id: 301, name: "Unknown ID" },
      { id: "", name: "New Employee", attendance_id: "EMP-NEW", position: "Staff" },
    ];

    const preview = await buildMasterPreview({ DB } as Env, "employees", rows);

    expect(queryCount).toBe(1);
    expect(preview.summary).toEqual({ new: 1, update: 1, unchanged: 299, invalid: 1, duplicate_in_file: 0 });
    expect(preview.rows[1]).toMatchObject({ status: "update", id: 2, base_salary: 3500000 });
    expect(preview.rows[301]).toMatchObject({ status: "new", name: "New Employee" });
  });
});
