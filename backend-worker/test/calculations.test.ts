import { describe, expect, it } from "vitest";
import {
  calculateAttendanceRecord,
  calculateDoctorTransaction,
  calculatePayrollRecord,
  effectiveBaseSalary,
  type AttendanceRecordShape,
  type DoctorTransactionShape,
  type PayrollRecordShape,
} from "../src/calculations";
import { recalculatePeriodTransactions } from "../src/routes/doctor-fee";

const attendanceRule = {
  timezone1_start: "08:00:00",
  timezone1_end: "16:00:00",
  timezone2_start: "14:00:00",
  timezone2_end: "21:00:00",
  overtime_min_minutes: 30,
  overtime_max_minutes: 180,
};

describe("calculation parity helpers", () => {
  it("calculates doctor transaction amounts", () => {
    const transaction: DoctorTransactionShape = {
      qty: 2,
      discount_amount: 10000,
      special_fee_amount: 0,
    };
    const row = calculateDoctorTransaction(
      transaction,
      { bhp_cost: 20000, treatment_price: 100000 },
      { normal_fee_rate: 0.6 },
      { normal_fee_rate: 0.5 }
    );

    expect(row.service_amount).toBe(150000);
    expect(row.doctor_fee_amount).toBe(90000);
    expect(row.total_bill_amount).toBe(190000);
  });

  it("recalculates stale transaction amounts from current treatment BHP without replacing overrides", () => {
    const transaction = { id: 1, period: "2026-06", transaction_date: "2026-06-01", doctor_id: 1, patient_name: "Pasien", treatment_id: 1, treatment_name_snapshot: "Scaling", qty: 1, discount_amount: 0, bhp_override: null, price_override: null, special_fee_amount: 0, fee_rate: null, service_amount: 100000, doctor_fee_amount: 60000, total_bill_amount: 100000, needs_review: 0, review_note: null, bhp_cost: 25000, treatment_price: 100000, normal_fee_rate: 0.6, tax_rate: 0.025, name: "Scaling" };
    const [row, overridden] = recalculatePeriodTransactions(
      [transaction, { ...transaction, id: 2, bhp_override: 10000 }],
      { normal_fee_rate: 0.5, default_deduction: 0, tax_rate: 0.025 }
    );

    expect(row.service_amount).toBe(75000);
    expect(row.doctor_fee_amount).toBe(45000);
    expect(overridden.service_amount).toBe(90000);
    expect(overridden.doctor_fee_amount).toBe(54000);
  });

  it("calculates absence when no attendance exists on a work day", () => {
    const attendance: AttendanceRecordShape = {
      work_date: "2026-06-01",
      is_holiday: false,
    };
    const row = calculateAttendanceRecord(
      attendance,
      attendanceRule
    );

    expect(row.is_absent).toBe(true);
    expect(row.absent_minutes).toBe(480);
    expect(row.overtime_minutes).toBe(0);
  });

  it("calculates payroll with training salary, holiday, double shift, overtime, and deductions", () => {
    const employee = {
      name: "Operator",
      base_salary: 3000000,
      working_days: 25,
      is_training: true,
      bank_name: "BSI",
      account_name: null,
      account_number: "123",
    };
    const rule = {
      default_base_salary: 2712250,
      bpjs_jht_rate: 0.02,
      overtime_rate_per_minute: 250,
      pph21_threshold: 5400000,
      pph21_rate: 0.05,
      holiday_double_shift_fee: 90000,
    };
    const payrollRecord: PayrollRecordShape = {
      bonus: 100000,
      position_allowance: 50000,
      other_deduction: 25000,
    };
    const record = calculatePayrollRecord(
      payrollRecord,
      employee,
      rule,
      [
        {
          work_date: "2026-06-07",
          is_holiday: true,
          timezone1_in: "08:00:00",
          timezone1_out: "16:45:00",
          overtime_minutes: 45,
          is_double_shift: true,
        },
      ]
    );

    expect(effectiveBaseSalary(employee, rule)).toBe(2400000);
    expect(record.double_shift_fee).toBe(90000);
    expect(record.sunday_fee).toBe(90000);
    expect(record.overtime_total).toBe(11250);
    expect(record.bpjs_deduction).toBe(48000);
    expect(record.net_salary).toBe(2668250);
    expect(record.account_name).toBe("Operator");
  });
});
