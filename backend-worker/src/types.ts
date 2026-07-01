export type UserRole = "admin" | "operator";
export type PeriodStatus = "draft" | "reviewed" | "locked" | "exported";

export type Env = {
  DB: D1Database;
  REPORTS: R2Bucket;
  UPLOADS: R2Bucket;
  APP_NAME?: string;
  APP_ENV?: string;
  SECRET_KEY?: string;
  ACCESS_TOKEN_EXPIRE_MINUTES?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  CORS_ORIGINS?: string;
};

export type User = {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  employee_id: number | null;
  hashed_password: string;
  is_active: number | boolean;
  created_at: string;
};

export type Employee = {
  id: number;
  name: string;
  attendance_id: string | null;
  position: string | null;
  join_date: string | null;
  base_salary: number;
  working_days: number;
  is_training: number | boolean;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  is_active: number | boolean;
  created_at: string;
};

export type AuditLogInput = {
  actor_id?: number | null;
  actor_username?: string | null;
  actor_name?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | number | null;
  description: string;
  metadata?: unknown;
};
