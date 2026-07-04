import type {
  Doctor,
  EditorSession,
  Employee,
  MasterTarget,
  PreviewRow,
  Treatment,
} from "./types";
import { fractionToPercent, moneyNumber, percentToFraction, wholeNumber } from "../../lib/number-fields";

export function includesSearch(value: unknown, search: string) {
  return String(value ?? "")
    .toLowerCase()
    .includes(search.toLowerCase());
}

export function previewIdentity(target: MasterTarget, row: PreviewRow) {
  if (target === "treatments")
    return row.code ? `${row.code} - ${row.name ?? "-"}` : (row.name ?? "-");
  return row.name ?? "-";
}

export function previewDetail(
  target: MasterTarget,
  row: PreviewRow,
  rupiah: Intl.NumberFormat,
) {
  if (target === "treatments")
    return row.treatment_price === undefined
      ? (row.category ?? "-")
      : rupiah.format(row.treatment_price);
  if (target === "employees")
    return row.base_salary === undefined
      ? (row.position ?? "-")
      : rupiah.format(row.base_salary);
  if (row.normal_fee_rate === undefined) return row.bank_name ?? "-";
  return `${(row.normal_fee_rate * 100).toFixed(0)}% fee`;
}

export function uniqueOptions(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function emptyEditorValues(
  target: MasterTarget,
): Record<string, string> {
  if (target === "treatments") {
    return {
      code: "",
      name: "",
      category: "",
      doctor_cost: "0",
      specialist_cost: "0",
      bhp_cost: "0",
      service_fee: "0",
      treatment_price: "0",
      notes: "",
      is_active: "true",
    };
  }
  if (target === "doctors") {
    return {
      name: "",
      bank_name: "",
      account_name: "",
      account_number: "",
      nik: "",
      normal_fee_rate: "60",
      ortho_fee_rate: "70",
      tax_rate: "2.5",
      is_active: "true",
    };
  }
  return {
    name: "",
    attendance_id: "",
    position: "",
    join_date: "",
    base_salary: "2712250",
    working_days: "25",
    is_training: "false",
    bank_name: "",
    account_name: "",
    account_number: "",
    is_active: "true",
  };
}

export function editorValuesFromRow(
  target: MasterTarget,
  row: Treatment | Doctor | Employee,
): Record<string, string> {
  if (target === "treatments") {
    const item = row as Treatment;
    return {
      code: item.code ?? "",
      name: item.name,
      category: item.category ?? "",
      doctor_cost: String(item.doctor_cost ?? 0),
      specialist_cost: String(item.specialist_cost ?? 0),
      bhp_cost: String(item.bhp_cost ?? 0),
      service_fee: String(item.service_fee ?? 0),
      treatment_price: String(item.treatment_price ?? 0),
      notes: item.notes ?? "",
      is_active: String(item.is_active),
    };
  }
  if (target === "doctors") {
    const item = row as Doctor;
    return {
      name: item.name,
      bank_name: item.bank_name ?? "",
      account_name: item.account_name ?? "",
      account_number: item.account_number ?? "",
      nik: item.nik ?? "",
      normal_fee_rate: fractionToPercent(item.normal_fee_rate, 0.6),
      ortho_fee_rate: fractionToPercent(item.ortho_fee_rate, 0.7),
      tax_rate: fractionToPercent(item.tax_rate, 0.025),
      is_active: String(item.is_active),
    };
  }
  const item = row as Employee;
  return {
    name: item.name,
    attendance_id: item.attendance_id ?? "",
    position: item.position ?? "",
    join_date: "",
    base_salary: String(item.base_salary ?? 0),
    working_days: String(item.working_days ?? 25),
    is_training: String(item.is_training ?? false),
    bank_name: item.bank_name ?? "",
    account_name: item.account_name ?? "",
    account_number: item.account_number ?? "",
    is_active: String(item.is_active),
  };
}

export function nullableText(value: string) {
  return value.trim() || null;
}

export function editorPayload(
  target: MasterTarget,
  values: Record<string, string>,
) {
  if (target === "treatments") {
    return {
      code: nullableText(values.code),
      name: values.name.trim(),
      category: nullableText(values.category),
      doctor_cost: moneyNumber(values.doctor_cost),
      specialist_cost: moneyNumber(values.specialist_cost),
      bhp_cost: moneyNumber(values.bhp_cost),
      service_fee: moneyNumber(values.service_fee),
      treatment_price: moneyNumber(values.treatment_price),
      notes: nullableText(values.notes),
      is_active: values.is_active === "true",
    };
  }
  if (target === "doctors") {
    return {
      name: values.name.trim(),
      bank_name: nullableText(values.bank_name),
      account_name: nullableText(values.account_name),
      account_number: nullableText(values.account_number),
      nik: nullableText(values.nik),
      normal_fee_rate: percentToFraction(values.normal_fee_rate),
      ortho_fee_rate: percentToFraction(values.ortho_fee_rate),
      tax_rate: percentToFraction(values.tax_rate),
      is_active: values.is_active === "true",
    };
  }
  return {
    name: values.name.trim(),
    attendance_id: nullableText(values.attendance_id),
    position: nullableText(values.position),
    join_date: nullableText(values.join_date),
    base_salary: moneyNumber(values.base_salary),
    working_days: wholeNumber(values.working_days, 25),
    is_training: values.is_training === "true",
    bank_name: nullableText(values.bank_name),
    account_name: nullableText(values.account_name),
    account_number: nullableText(values.account_number),
    is_active: values.is_active === "true",
  };
}
