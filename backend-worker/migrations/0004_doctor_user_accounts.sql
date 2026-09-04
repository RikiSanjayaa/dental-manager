ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_doctor_id ON user(doctor_id) WHERE doctor_id IS NOT NULL;
