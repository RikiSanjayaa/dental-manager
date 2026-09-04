import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import * as XLSX from "xlsx";
import { doctorDashboardPayload, doctorFeePeriodList, previousCalendarMonth } from "../src/routes/doctor-fee";
import { buildDoctorFeeReport } from "../src/routes/reports";

describe("doctor self-service period derivation", () => {
  it("orders newest first and marks transaction-only periods as not_calculated", () => {
    const result = doctorFeePeriodList(["2026-05", "2026-07", "2026-06"], { "2026-05": "locked", "2026-07": "draft" });
    expect(result.latest_period).toBe("2026-07");
    expect(result.periods).toEqual([
      { period: "2026-07", status: "draft" },
      { period: "2026-06", status: "not_calculated" },
      { period: "2026-05", status: "locked" },
    ]);
  });

  it("returns an empty list and null latest_period when the doctor has no records", () => {
    expect(doctorFeePeriodList([], {})).toEqual({ periods: [], latest_period: null });
  });
});

describe("single-doctor doctor fee export", () => {
  it("builds a workbook containing only the requested doctor's summary and detail sheet", async () => {
    const summaries = [
      { doctor_id: 1, doctor_name: "Drg. Satu", status: "draft", treatment_fee_total: 60000, ortho_fee_total: 0, total_fee: 60000, total_bill: 100000, deduction: 0, tax: 0, transfer_amount: 60000 },
      { doctor_id: 2, doctor_name: "Drg. Dua", status: "locked", treatment_fee_total: 90000, ortho_fee_total: 50000, total_fee: 140000, total_bill: 200000, deduction: 0, tax: 3500, transfer_amount: 136500 },
    ];
    const transactions = [
      { doctor_id: 1, transaction_date: "2026-06-01", patient_name: "Pasien Satu", treatment_name_snapshot: "Scaling", bhp_amount: 25000, price_amount: 100000, qty: 1, discount_amount: 0, service_amount: 75000, doctor_fee_amount: 60000, special_fee_amount: 0, total_bill_amount: 100000 },
      { doctor_id: 2, transaction_date: "2026-06-03", patient_name: "Pasien Dua", treatment_name_snapshot: "Kontrol Behel", bhp_amount: 50000, price_amount: 350000, qty: 1, discount_amount: 0, service_amount: 100000, doctor_fee_amount: 0, special_fee_amount: 50000, total_bill_amount: 200000 },
    ];
    const db = {
      prepare(sql: string) {
        return {
          async first<T>() {
            return null as T | null;
          },
          bind(..._args: unknown[]) {
            return {
              async all<T>() {
                if (sql.includes("FROM doctorperiodsummary")) {
                  return { results: summaries } as unknown as { results: T[] };
                }
                return { results: transactions } as unknown as { results: T[] };
              },
            };
          },
        };
      },
    } as never;
    const file = await buildDoctorFeeReport({ DB: db } as never, "2026-06", "xlsx", 2);
    const workbook = XLSX.read(file.bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Rekapan FEE DOKTER", "TS. Drg. Dua"]);
    const recap = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Rekapan FEE DOKTER"]);
    expect(recap.map((row) => row.NAMA)).toEqual(["Drg. Dua", "TOTAL"]);
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["TS. Drg. Dua"]);
    expect(detail.some((row) => row["Nama Pasien"] === "Pasien Dua")).toBe(true);
  });
});

type DbRow = Record<string, unknown>;

// Recorded D1 double: every prepare().bind() is captured so tests can assert the
// SQL was scoped to the requesting doctor/user, and canned rows are returned per
// query shape (mirroring doctor-fee.ts helpers).
function fakeDashboardDb(seed: {
  doctor?: DbRow;
  txPeriods?: string[];
  summaryStatusByPeriod?: Record<string, string>;
  summariesByPeriod?: Record<string, DbRow[]>;
  transactionsByPeriod?: Record<string, DbRow[]>;
  recentTransactions?: DbRow[];
  recentAuditLogs?: DbRow[];
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const prepare = (sql: string) => ({
    bind(...params: unknown[]) {
      calls.push({ sql, params });
      let rows: DbRow[] = [];
      let row: DbRow | null = null;
      if (sql.includes("SELECT DISTINCT period FROM doctortransaction")) {
        rows = (seed.txPeriods ?? []).map((period) => ({ period }));
      } else if (sql.includes("SELECT period, status FROM doctorperiodsummary")) {
        rows = Object.entries(seed.summaryStatusByPeriod ?? {}).map(([period, status]) => ({ period, status }));
      } else if (sql.includes("SELECT id, name, bank_name")) {
        row = seed.doctor ?? null;
      } else if (sql.includes("doctorperiodsummary s ON")) {
        rows = seed.summariesByPeriod?.[String(params[0])] ?? [];
      } else if (sql.includes("FROM doctortransaction t") && sql.includes("t.period = ?")) {
        rows = seed.transactionsByPeriod?.[String(params[0])] ?? [];
      } else if (sql.includes("FROM doctortransaction t")) {
        rows = seed.recentTransactions ?? [];
      } else if (sql.includes("FROM auditlog")) {
        rows = seed.recentAuditLogs ?? [];
      }
      return {
        async all<T>() {
          return { results: rows as T[] };
        },
        async first<T>() {
          return row as T | null;
        },
      };
    },
  });
  return { env: { DB: { prepare } } as never, calls };
}

const doctorSeven = { id: 7, name: "Drg. Anindita", bank_name: "BCA", account_name: "Anindita", account_number: "1234567" };
const summaryRow = (overrides: DbRow) => ({
  doctor_id: 7,
  status: "draft",
  treatment_fee_total: 120000,
  ortho_fee_total: 30000,
  total_fee: 150000,
  total_bill: 250000,
  deduction: 0,
  tax: 3750,
  transfer_amount: 146250,
  calculated_at: "2026-07-31T10:00:00Z",
  transaction_count: 3,
  ...overrides,
});

describe("previous calendar month derivation", () => {
  it("rolls back to December of the prior year for January", () => {
    expect(previousCalendarMonth("2026-01")).toBe("2025-12");
    expect(previousCalendarMonth("2026-07")).toBe("2026-06");
    expect(previousCalendarMonth("2026-12")).toBe("2026-11");
  });
});

describe("doctor dashboard payload", () => {
  const user = { id: 5, doctor_id: 7 };

  it("defaults to the latest period with data and includes the previous month summary", async () => {
    const { env } = fakeDashboardDb({
      doctor: doctorSeven,
      txPeriods: ["2026-07", "2026-06", "2026-05"],
      summaryStatusByPeriod: { "2026-07": "draft", "2026-06": "locked" },
      summariesByPeriod: {
        "2026-07": [summaryRow({})],
        "2026-06": [summaryRow({ status: "locked", transfer_amount: 87750, total_fee: 90000, transaction_count: 2 })],
      },
      transactionsByPeriod: {
        "2026-07": [
          { id: 1, period: "2026-07", doctor_id: 7, transaction_date: "2026-07-01", needs_review: 0 },
          { id: 2, period: "2026-07", doctor_id: 7, transaction_date: "2026-07-10", needs_review: 0 },
          { id: 3, period: "2026-07", doctor_id: 7, transaction_date: "2026-07-20", needs_review: 1 },
        ],
        "2026-06": [{ id: 4, period: "2026-06", doctor_id: 7, transaction_date: "2026-06-05", needs_review: 0 }],
      },
      recentTransactions: [
        { id: 3, period: "2026-07", doctor_id: 7, transaction_date: "2026-07-20", patient_name: "Pasien Baru", needs_review: 1 },
      ],
      recentAuditLogs: [
        { id: 9, action: "login", entity_type: "auth", description: "Login drg.anindita.", created_at: "2026-07-31T09:00:00Z" },
      ],
    });
    const payload = await doctorDashboardPayload(env, user);
    expect(payload.period).toBe("2026-07");
    expect(payload.doctor).toEqual(doctorSeven);
    expect(payload.summary).toMatchObject({
      status: "draft",
      treatment_fee_total: 120000,
      ortho_fee_total: 30000,
      total_fee: 150000,
      total_bill: 250000,
      transfer_amount: 146250,
      transaction_count: 3,
      review_count: 1,
    });
    expect(payload.previous).toMatchObject({ status: "locked", transfer_amount: 87750, total_fee: 90000 });
    expect(payload.recent_transactions).toHaveLength(1);
    expect(payload.recent_audit_logs).toHaveLength(1);
  });

  it("returns an empty current summary and null previous when the doctor has no data", async () => {
    const { env, calls } = fakeDashboardDb({ doctor: doctorSeven });
    const payload = await doctorDashboardPayload(env, user);
    expect(payload.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(payload.summary).toMatchObject({ status: "empty", transfer_amount: 0, transaction_count: 0, review_count: 0 });
    expect(payload.previous).toBeNull();
    expect(payload.recent_transactions).toEqual([]);
    expect(payload.recent_audit_logs).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("honours an explicit valid period and keeps previous null when only that month has data", async () => {
    const { env } = fakeDashboardDb({
      doctor: doctorSeven,
      summariesByPeriod: { "2026-08": [summaryRow({ status: "locked", transfer_amount: 50000 })] },
      transactionsByPeriod: { "2026-08": [{ id: 8, period: "2026-08", doctor_id: 7, transaction_date: "2026-08-03", needs_review: 0 }] },
    });
    const payload = await doctorDashboardPayload(env, user, "2026-08");
    expect(payload.period).toBe("2026-08");
    expect(payload.summary).toMatchObject({ status: "locked", transfer_amount: 50000 });
    expect(payload.previous).toBeNull();
  });

  it("assembles only the requesting doctor's summary when other doctors share the period, and scopes every query", async () => {
    const { env, calls } = fakeDashboardDb({
      doctor: doctorSeven,
      txPeriods: ["2026-07"],
      summariesByPeriod: {
        "2026-07": [
          summaryRow({}),
          summaryRow({ doctor_id: 8, status: "locked", transfer_amount: 999999, treatment_fee_total: 888888 }),
        ],
      },
      transactionsByPeriod: {
        "2026-07": [
          { id: 1, period: "2026-07", doctor_id: 7, needs_review: 0 },
          { id: 2, period: "2026-07", doctor_id: 8, needs_review: 0 },
        ],
      },
    });
    const payload = await doctorDashboardPayload(env, user);
    expect(payload.summary).toMatchObject({ transfer_amount: 146250, treatment_fee_total: 120000 });
    for (const call of calls) {
      if (call.sql.includes("FROM auditlog")) {
        expect(call.params).toContain(5);
      } else {
        expect(call.params).toContain(7);
      }
    }
  });

  it("rejects a malformed period with 400", async () => {
    const { env } = fakeDashboardDb({ doctor: doctorSeven });
    for (const bad of ["2026-7", "2026-13", "07-2026", "2026-070", "garbage"]) {
      const error = await doctorDashboardPayload(env, user, bad).then(
        () => null,
        (caught) => caught
      );
      expect(error).toBeInstanceOf(HTTPException);
      expect((error as HTTPException).status).toBe(400);
    }
  });
});
