export type MasterTarget = "treatments" | "doctors" | "employees";

export type Employee = {
  id: number;
  name: string;
  attendance_id?: string;
  position?: string;
  join_date?: string;
  base_salary: number;
  working_days: number;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  is_active: boolean;
};

export type Doctor = {
  id: number;
  name: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  nik?: string;
  normal_fee_rate: number;
  ortho_fee_rate: number;
  tax_rate: number;
  is_active: boolean;
};

export type Treatment = {
  id: number;
  code?: string;
  name: string;
  category?: string;
  doctor_cost: number;
  specialist_cost: number;
  bhp_cost: number;
  service_fee: number;
  treatment_price: number;
  notes?: string;
  is_active: boolean;
};

export type PreviewStatus = "new" | "update" | "invalid";

export type PreviewRow = {
  row?: number;
  status: PreviewStatus;
  issues?: string[];
  code?: string;
  name?: string;
  category?: string;
  position?: string;
  attendance_id?: string;
  bank_name?: string;
  account_number?: string;
  treatment_price?: number;
  base_salary?: number;
  normal_fee_rate?: number;
};

export type ImportIssue = {
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
};

export type ImportPreview = {
  import_id: number;
  target: MasterTarget;
  valid_rows: number;
  invalid_rows: number;
  summary: {
    new: number;
    update: number;
    invalid: number;
    duplicate_in_file: number;
    [key: string]: number | string | string[];
  };
  rows: PreviewRow[];
  warnings: string[];
  errors: ImportIssue[];
};

export type CommitResult = {
  target: MasterTarget;
  created: number;
  updated: number;
  invalid_rows: number;
};

export type EditorSession = {
  open: boolean;
  target: MasterTarget;
  mode: "create" | "edit";
  id?: number;
  values: Record<string, string>;
};

export type PermanentDeleteSession = {
  open: boolean;
  target: MasterTarget;
  id?: number;
  ids?: number[];
  name?: string;
};

export type ImportSession = {
  open: boolean;
  target: MasterTarget;
  filename?: string;
  preview?: ImportPreview;
  error?: string;
  committed?: CommitResult;
};

export type MasterFilters = {
  status: "active" | "inactive" | "all";
  group: string;
};
