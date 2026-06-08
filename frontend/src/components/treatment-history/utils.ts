import type { EditorSession, TransactionFormValues, TreatmentTransaction } from "./types";

export function emptyTransactionValues(period: string): TransactionFormValues {
  return {
    period,
    transaction_date: `${period}-01`,
    doctor_id: "",
    patient_name: "",
    treatment_id: "",
    treatment_name_snapshot: "",
    qty: "1",
    discount_amount: "0",
    bhp_override: "",
    price_override: "",
    special_fee_amount: "0",
    fee_rate: "",
    needs_review: "false",
    review_note: "",
  };
}

export function valuesFromTransaction(row: TreatmentTransaction): TransactionFormValues {
  return {
    period: row.period,
    transaction_date: row.transaction_date,
    doctor_id: String(row.doctor_id),
    patient_name: row.patient_name,
    treatment_id: row.treatment_id ? String(row.treatment_id) : "",
    treatment_name_snapshot: row.treatment_name_snapshot,
    qty: String(row.qty ?? 1),
    discount_amount: String(row.discount_amount ?? 0),
    bhp_override: row.bhp_override === null || row.bhp_override === undefined ? "" : String(row.bhp_override),
    price_override: row.price_override === null || row.price_override === undefined ? "" : String(row.price_override),
    special_fee_amount: String(row.special_fee_amount ?? 0),
    fee_rate: row.fee_rate === null || row.fee_rate === undefined ? "" : String(row.fee_rate),
    needs_review: String(Boolean(row.needs_review)),
    review_note: row.review_note ?? "",
  };
}

export function payloadFromEditor(editor: EditorSession) {
  const values = editor.values;
  return {
    period: values.period,
    transaction_date: values.transaction_date,
    doctor_id: Number(values.doctor_id),
    patient_name: values.patient_name.trim(),
    treatment_id: values.treatment_id ? Number(values.treatment_id) : null,
    treatment_name_snapshot: values.treatment_name_snapshot.trim() || undefined,
    qty: Number(values.qty || 1),
    discount_amount: Number(values.discount_amount || 0),
    bhp_override: values.bhp_override === "" ? null : Number(values.bhp_override),
    price_override: values.price_override === "" ? null : Number(values.price_override),
    special_fee_amount: Number(values.special_fee_amount || 0),
    fee_rate: values.fee_rate === "" ? null : Number(values.fee_rate),
    needs_review: values.needs_review === "true",
    review_note: values.review_note.trim() || null,
  };
}

export function includesText(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
}
