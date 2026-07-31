import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildDoctorFeeReport } from "../src/routes/reports";

describe("doctor fee XLSX export", () => {
  it("exports treatment BHP when transaction has no override", async () => {
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
                  return {
                    results: [{ doctor_id: 1, doctor_name: "Drg. Test", status: "draft", treatment_fee_total: 60000, ortho_fee_total: 0, total_fee: 60000, total_bill: 100000, deduction: 0, tax: 0, transfer_amount: 60000 }] as T[],
                  };
                }
                return {
                  results: [{ doctor_id: 1, transaction_date: "2026-06-01", patient_name: "Pasien", treatment_name_snapshot: "Scaling", bhp_amount: 25000, price_amount: 100000, qty: 1, discount_amount: 0, service_amount: 75000, doctor_fee_amount: 60000, special_fee_amount: 0, total_bill_amount: 100000 }] as T[],
                };
              },
            };
          },
        };
      },
    } as never;
    const file = await buildDoctorFeeReport({ DB: db } as never, "2026-06", "xlsx");
    const workbook = XLSX.read(file.bytes, { type: "buffer" });
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["TS. Drg. Test"], { defval: null });
    expect(detail[1].BHP).toBe(25000);
  });
});
