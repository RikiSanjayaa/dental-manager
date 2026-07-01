INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at)
SELECT 'Drg. Anindita Prameswari', 'BCA', 'Anindita Prameswari', '1234567890', '7371014501900001', 0.60, 0.70, 0.025, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM doctor WHERE name = 'Drg. Anindita Prameswari');

INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at)
SELECT 'Drg. Bagas Mahendra', 'MANDIRI', 'Bagas Mahendra', '1410010098765', '7371021202880002', 0.55, 0.70, 0.025, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM doctor WHERE name = 'Drg. Bagas Mahendra');

INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at)
SELECT 'Drg. Citra Lestari', 'BNI', 'Citra Lestari', '8800123456', '7371036103910003', 0.60, 0.75, 0.025, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM doctor WHERE name = 'Drg. Citra Lestari');

INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at)
SELECT 'KON-001', 'Konsultasi Dokter Gigi', 'KONSULTASI', 50000, 0, 0, 50000, 50000, 'Konsultasi dasar pasien baru atau kontrol.', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM treatment WHERE code = 'KON-001');

INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at)
SELECT 'SC-001', 'Scaling Rahang Atas Bawah', 'PERAWATAN', 150000, 0, 25000, 225000, 250000, 'Scaling rutin lengkap.', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM treatment WHERE code = 'SC-001');

INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at)
SELECT 'TM-001', 'Tambal Komposit Kecil', 'RESTORASI', 120000, 0, 35000, 215000, 250000, 'Tambal komposit satu permukaan.', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM treatment WHERE code = 'TM-001');

INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at)
SELECT 'EXT-001', 'Cabut Gigi Sederhana', 'BEDAH MINOR', 175000, 0, 30000, 270000, 300000, 'Ekstraksi sederhana tanpa komplikasi.', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM treatment WHERE code = 'EXT-001');

INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at)
SELECT 'ORTH-001', 'Kontrol Behel', 'ORTHODONTI', 0, 200000, 50000, 300000, 350000, 'Kontrol ortho bulanan.', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM treatment WHERE code = 'ORTH-001');

INSERT INTO employee (name, attendance_id, position, join_date, base_salary, working_days, is_training, bank_name, account_name, account_number, is_active, created_at)
SELECT 'Nadia Putri', 'EMP-001', 'Admin Front Office', '2025-01-10', 3000000, 25, 0, 'BSI', 'Nadia Putri', '7001002001', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM employee WHERE attendance_id = 'EMP-001');

INSERT INTO employee (name, attendance_id, position, join_date, base_salary, working_days, is_training, bank_name, account_name, account_number, is_active, created_at)
SELECT 'Rafi Saputra', 'EMP-002', 'Asisten Dokter', '2025-03-15', 2850000, 25, 0, 'BCA', 'Rafi Saputra', '7001002002', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM employee WHERE attendance_id = 'EMP-002');

INSERT INTO employee (name, attendance_id, position, join_date, base_salary, working_days, is_training, bank_name, account_name, account_number, is_active, created_at)
SELECT 'Maya Anggraini', 'EMP-003', 'Kasir', '2026-05-01', 2712250, 25, 1, 'MANDIRI', 'Maya Anggraini', '7001002003', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM employee WHERE attendance_id = 'EMP-003');

INSERT INTO attendanceholiday (holiday_date, name, is_holiday, created_at)
SELECT '2026-07-17', 'Contoh Hari Libur Klinik', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM attendanceholiday WHERE holiday_date = '2026-07-17');
