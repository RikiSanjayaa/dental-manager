CREATE INDEX IF NOT EXISTS ix_user_username_lower
ON user (LOWER(username));

CREATE INDEX IF NOT EXISTS ix_attendancerecord_period_employee_date
ON attendancerecord (period, employee_id, work_date);

CREATE INDEX IF NOT EXISTS ix_doctortransaction_period_date_id
ON doctortransaction (period, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_doctortransaction_period_doctor
ON doctortransaction (period, doctor_id);
