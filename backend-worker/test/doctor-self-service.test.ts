import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { doctorFeePeriodList } from "../src/routes/doctor-fee";
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
