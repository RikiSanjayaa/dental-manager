export type Doctor = {
  id: number;
  name: string;
  is_active: boolean;
};

export type Treatment = {
  id: number;
  code?: string | null;
  name: string;
  category?: string | null;
  bhp_cost: number;
  treatment_price: number;
  is_active: boolean;
};

export type TreatmentTransaction = {
  id: number;
  period: string;
  transaction_date: string;
  doctor_id: number;
  doctor_name: string;
  patient_name: string;
  treatment_id?: number | null;
  treatment_name_snapshot: string;
  treatment_name: string;
  qty: number;
  discount_amount: number;
  bhp_amount: number;
  price_amount: number;
  bhp_override?: number | null;
  price_override?: number | null;
  special_fee_amount: number;
  fee_rate?: number | null;
  service_amount: number;
  doctor_fee_amount: number;
  total_bill_amount: number;
  needs_review: boolean;
  review_note?: string | null;
};

export type TransactionFormValues = {
  period: string;
  transaction_date: string;
  doctor_id: string;
  patient_name: string;
  treatment_id: string;
  treatment_name_snapshot: string;
  qty: string;
  discount_amount: string;
  bhp_override: string;
  price_override: string;
  special_fee_amount: string;
  fee_rate: string;
};

export type EditorSession = {
  open: boolean;
  mode: "create" | "edit";
  id?: number;
  values: TransactionFormValues;
};

export type ImportPreviewRow = {
  row?: number;
  transaction_date?: string;
  doctor_name?: string;
  patient_name?: string;
  treatment_name?: string;
  qty?: number;
  status: "valid" | "review" | "invalid";
  issues?: string[];
};

export type ImportPreview = {
  import_id: number;
  valid_rows: number;
  invalid_rows: number;
  summary: Record<string, number>;
  warnings: string[];
  errors: Array<{ row?: number; field?: string; message: string }>;
  rows: ImportPreviewRow[];
};

export type ImportSession = {
  open: boolean;
  filename?: string;
  preview?: ImportPreview;
  committed?: { created: number; updated: number; invalid_rows: number };
  error?: string;
};
