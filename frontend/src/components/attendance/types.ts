export type Employee = {
  id: number;
  name: string;
  attendance_id?: string | null;
  is_active: boolean;
};

export type AttendanceRecord = {
  id: number;
  period: string;
  employee_id?: number | null;
  attendance_id_snapshot?: string | null;
  employee_name_snapshot: string;
  work_date: string;
  timezone1_in?: string | null;
  timezone1_out?: string | null;
  timezone2_in?: string | null;
  timezone2_out?: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  absent_minutes: number;
  is_absent: boolean;
  total_minutes: number;
  overtime_minutes: number;
  is_sunday: boolean;
  is_holiday: boolean;
  status_note?: string | null;
  needs_review: boolean;
  protest_note?: string | null;
  protest_by_user_id?: number | null;
  protest_by_name?: string | null;
  protested_at?: string | null;
};

export type AttendanceValues = {
  period: string;
  employee_id: string;
  attendance_id_snapshot: string;
  employee_name_snapshot: string;
  work_date: string;
  timezone1_in: string;
  timezone1_out: string;
  timezone2_in: string;
  timezone2_out: string;
  status_note: string;
  is_holiday: string;
  needs_review: string;
};

export type EditorSession = {
  open: boolean;
  mode: "create" | "edit";
  id?: number;
  values: AttendanceValues;
};

export type ImportIssue = {
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
};

export type AttendancePreviewRow = {
  row?: number;
  attendance_id?: string | null;
  employee_name: string;
  work_date: string;
  timezone1_in?: string | null;
  timezone1_out?: string | null;
  timezone2_in?: string | null;
  timezone2_out?: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  absent_minutes: number;
  is_absent: boolean;
  total_minutes: number;
  overtime_minutes: number;
  is_sunday: boolean;
  is_holiday: boolean;
  status: "new" | "update" | "review" | "invalid";
  issues?: string[];
};

export type AttendancePreview = {
  kind: "attendance";
  valid_rows: number;
  invalid_rows: number;
  warnings: string[];
  errors: ImportIssue[];
  summary: {
    attendance?: number;
    review?: number;
    new?: number;
    update?: number;
    duplicate_in_file?: number;
    [key: string]: number | string | string[] | undefined;
  };
  rows: AttendancePreviewRow[];
};

export type ImportSession = {
  open: boolean;
  filename?: string;
  file?: File;
  preview?: AttendancePreview;
  error?: string;
  committed?: { created: number; updated: number; invalid_rows: number };
};
