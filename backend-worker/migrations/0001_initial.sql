PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  attendance_id TEXT,
  position TEXT,
  join_date TEXT,
  base_salary REAL NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 25,
  is_training INTEGER NOT NULL DEFAULT 0,
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_employee_name ON employee (name);
CREATE INDEX IF NOT EXISTS ix_employee_attendance_id ON employee (attendance_id);

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  employee_id INTEGER REFERENCES employee(id),
  hashed_password TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_user_username ON user (username);
CREATE INDEX IF NOT EXISTS ix_user_role ON user (role);
CREATE INDEX IF NOT EXISTS ix_user_employee_id ON user (employee_id);

CREATE TABLE IF NOT EXISTS auditlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES user(id),
  actor_username TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_auditlog_actor_username ON auditlog (actor_username);
CREATE INDEX IF NOT EXISTS ix_auditlog_action ON auditlog (action);
CREATE INDEX IF NOT EXISTS ix_auditlog_entity_type ON auditlog (entity_type);
CREATE INDEX IF NOT EXISTS ix_auditlog_created_at ON auditlog (created_at);

CREATE TABLE IF NOT EXISTS doctor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  nik TEXT,
  normal_fee_rate REAL NOT NULL DEFAULT 0.6,
  ortho_fee_rate REAL NOT NULL DEFAULT 0.7,
  tax_rate REAL NOT NULL DEFAULT 0.025,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_doctor_name ON doctor (name);

CREATE TABLE IF NOT EXISTS treatment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  doctor_cost REAL NOT NULL DEFAULT 0,
  specialist_cost REAL NOT NULL DEFAULT 0,
  bhp_cost REAL NOT NULL DEFAULT 0,
  service_fee REAL NOT NULL DEFAULT 0,
  treatment_price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_treatment_code ON treatment (code);
CREATE INDEX IF NOT EXISTS ix_treatment_name ON treatment (name);
CREATE INDEX IF NOT EXISTS ix_treatment_category ON treatment (category);

CREATE TABLE IF NOT EXISTS payrollrule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  default_base_salary REAL NOT NULL DEFAULT 2712250,
  bpjs_jht_rate REAL NOT NULL DEFAULT 0.02,
  overtime_rate_per_minute REAL NOT NULL DEFAULT 250,
  pph21_threshold REAL NOT NULL DEFAULT 5400000,
  pph21_rate REAL NOT NULL DEFAULT 0.05,
  sunday_multiplier REAL NOT NULL DEFAULT 0.8571428571428571,
  double_shift_multiplier REAL NOT NULL DEFAULT 1,
  holiday_double_shift_fee REAL NOT NULL DEFAULT 90000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_payrollrule_name ON payrollrule (name);

CREATE TABLE IF NOT EXISTS attendancerule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  timezone1_start TEXT NOT NULL DEFAULT '08:00:00',
  timezone1_end TEXT NOT NULL DEFAULT '16:00:00',
  timezone2_start TEXT NOT NULL DEFAULT '14:00:00',
  timezone2_end TEXT NOT NULL DEFAULT '21:00:00',
  overtime_min_minutes INTEGER NOT NULL DEFAULT 30,
  overtime_max_minutes INTEGER NOT NULL DEFAULT 180,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_attendancerule_name ON attendancerule (name);

CREATE TABLE IF NOT EXISTS attendanceholiday (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL,
  name TEXT,
  is_holiday INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_attendanceholiday_holiday_date ON attendanceholiday (holiday_date);

CREATE TABLE IF NOT EXISTS doctorfeerule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  normal_fee_rate REAL NOT NULL DEFAULT 0.6,
  ortho_fee_rate REAL NOT NULL DEFAULT 0.7,
  tax_rate REAL NOT NULL DEFAULT 0.025,
  default_deduction REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_doctorfeerule_name ON doctorfeerule (name);

CREATE TABLE IF NOT EXISTS appsetting (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_appsetting_key ON appsetting (key);

CREATE TABLE IF NOT EXISTS importfile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'preview',
  rows_valid INTEGER NOT NULL DEFAULT 0,
  rows_invalid INTEGER NOT NULL DEFAULT 0,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  preview_json TEXT NOT NULL DEFAULT '{}',
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_by_id INTEGER REFERENCES user(id),
  committed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reportarchive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL,
  format TEXT NOT NULL,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  created_by_id INTEGER REFERENCES user(id),
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reportarchive_report_type ON reportarchive (report_type);
CREATE INDEX IF NOT EXISTS ix_reportarchive_period ON reportarchive (period);
CREATE INDEX IF NOT EXISTS ix_reportarchive_status ON reportarchive (status);
CREATE INDEX IF NOT EXISTS ix_reportarchive_format ON reportarchive (format);
CREATE INDEX IF NOT EXISTS ix_reportarchive_created_at ON reportarchive (created_at);
CREATE INDEX IF NOT EXISTS ix_reportarchive_expires_at ON reportarchive (expires_at);

CREATE TABLE IF NOT EXISTS doctortransaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  doctor_id INTEGER NOT NULL REFERENCES doctor(id),
  patient_name TEXT NOT NULL,
  treatment_id INTEGER REFERENCES treatment(id),
  treatment_name_snapshot TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  discount_amount REAL NOT NULL DEFAULT 0,
  bhp_override REAL,
  price_override REAL,
  special_fee_amount REAL NOT NULL DEFAULT 0,
  fee_rate REAL,
  service_amount REAL NOT NULL DEFAULT 0,
  doctor_fee_amount REAL NOT NULL DEFAULT 0,
  total_bill_amount REAL NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_doctortransaction_period ON doctortransaction (period);
CREATE INDEX IF NOT EXISTS ix_doctortransaction_transaction_date ON doctortransaction (transaction_date);
CREATE INDEX IF NOT EXISTS ix_doctortransaction_doctor_id ON doctortransaction (doctor_id);
CREATE INDEX IF NOT EXISTS ix_doctortransaction_treatment_id ON doctortransaction (treatment_id);

CREATE TABLE IF NOT EXISTS doctorperiodsummary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  doctor_id INTEGER NOT NULL REFERENCES doctor(id),
  status TEXT NOT NULL DEFAULT 'draft',
  treatment_fee_total REAL NOT NULL DEFAULT 0,
  ortho_fee_total REAL NOT NULL DEFAULT 0,
  total_fee REAL NOT NULL DEFAULT 0,
  total_bill REAL NOT NULL DEFAULT 0,
  deduction REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  transfer_amount REAL NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_doctorperiodsummary_period ON doctorperiodsummary (period);
CREATE INDEX IF NOT EXISTS ix_doctorperiodsummary_doctor_id ON doctorperiodsummary (doctor_id);

CREATE TABLE IF NOT EXISTS attendancerecord (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  employee_id INTEGER REFERENCES employee(id),
  attendance_id_snapshot TEXT,
  employee_name_snapshot TEXT NOT NULL,
  work_date TEXT NOT NULL,
  timezone1_in TEXT,
  timezone1_out TEXT,
  timezone2_in TEXT,
  timezone2_out TEXT,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  absent_minutes INTEGER NOT NULL DEFAULT 0,
  is_absent INTEGER NOT NULL DEFAULT 0,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  is_sunday INTEGER NOT NULL DEFAULT 0,
  is_holiday INTEGER NOT NULL DEFAULT 0,
  is_double_shift INTEGER NOT NULL DEFAULT 0,
  status_note TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  protest_note TEXT,
  protest_by_user_id INTEGER REFERENCES user(id),
  protest_by_name TEXT,
  protested_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_attendancerecord_period ON attendancerecord (period);
CREATE INDEX IF NOT EXISTS ix_attendancerecord_employee_id ON attendancerecord (employee_id);
CREATE INDEX IF NOT EXISTS ix_attendancerecord_attendance_id_snapshot ON attendancerecord (attendance_id_snapshot);
CREATE INDEX IF NOT EXISTS ix_attendancerecord_employee_name_snapshot ON attendancerecord (employee_name_snapshot);
CREATE INDEX IF NOT EXISTS ix_attendancerecord_work_date ON attendancerecord (work_date);

CREATE TABLE IF NOT EXISTS payrollrecord (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employee(id),
  status TEXT NOT NULL DEFAULT 'draft',
  base_salary REAL NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 25,
  auto_double_shift_count REAL NOT NULL DEFAULT 0,
  auto_sunday_count REAL NOT NULL DEFAULT 0,
  double_shift_count_override REAL,
  sunday_count_override REAL,
  double_shift_count REAL NOT NULL DEFAULT 0,
  sunday_count REAL NOT NULL DEFAULT 0,
  izin_count REAL NOT NULL DEFAULT 0,
  sakit_count REAL NOT NULL DEFAULT 0,
  cuti_count REAL NOT NULL DEFAULT 0,
  alpha_count REAL NOT NULL DEFAULT 0,
  double_shift_fee REAL NOT NULL DEFAULT 0,
  sunday_fee REAL NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_rate_per_minute REAL NOT NULL DEFAULT 250,
  overtime_total REAL NOT NULL DEFAULT 0,
  bonus REAL NOT NULL DEFAULT 0,
  position_allowance REAL NOT NULL DEFAULT 0,
  bpjs_deduction REAL NOT NULL DEFAULT 0,
  other_deduction REAL NOT NULL DEFAULT 0,
  pph21 REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Transfer',
  bank_name TEXT,
  account_name TEXT,
  account_number TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_payrollrecord_period ON payrollrecord (period);
CREATE INDEX IF NOT EXISTS ix_payrollrecord_employee_id ON payrollrecord (employee_id);

PRAGMA defer_foreign_keys = false;
