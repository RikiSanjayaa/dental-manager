import { hashPassword } from "./auth";
import { seedDefaults } from "./db";
import type { Env } from "./types";

const DATA_TABLES = [
  "reportarchive", "importfile", "payrollrecord", "attendancerecord",
  "doctorperiodsummary", "doctortransaction", "auditlog", "attendanceholiday",
  "appsetting", "doctorfeerule", "attendancerule", "payrollrule", "treatment",
  "user", "doctor", "employee",
] as const;

export function isDevelopment(env: Env): boolean {
  return ["dev", "development", "local", "test"].includes((env.APP_ENV || "production").toLowerCase());
}

export async function seedDevMasterData(env: Env): Promise<void> {
  const now = new Date().toISOString();
  // Dev login for QA profiles (development only): drg.anindita / doctor12345
  const doctorUserPassword = await hashPassword("doctor12345");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind("Drg. Anindita Prameswari", "BCA", "Anindita Prameswari", "1234567890", "7371014501900001", 0.6, 0.7, 0.025, now),
    env.DB.prepare(`INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind("Drg. Bagas Mahendra", "MANDIRI", "Bagas Mahendra", "1410010098765", "7371021202880002", 0.55, 0.7, 0.025, now),
    env.DB.prepare(`INSERT INTO doctor (name, bank_name, account_name, account_number, nik, normal_fee_rate, ortho_fee_rate, tax_rate, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind("Drg. Citra Lestari", "BNI", "Citra Lestari", "8800123456", "7371036103910003", 0.6, 0.75, 0.025, now),
    env.DB.prepare(
      `INSERT INTO user (username, full_name, role, doctor_id, hashed_password, is_active, created_at)
       SELECT 'drg.anindita', 'Drg. Anindita Prameswari', 'doctor', id, ?, 1, ?
       FROM doctor
       WHERE name = 'Drg. Anindita Prameswari'
         AND NOT EXISTS (SELECT 1 FROM user WHERE username = 'drg.anindita')`
    ).bind(doctorUserPassword, now),
    ...[
      ["KON-001", "Konsultasi Dokter Gigi", "KONSULTASI", 50000, 0, 0, 50000, 50000, "Konsultasi dasar pasien baru atau kontrol."],
      ["SC-001", "Scaling Rahang Atas Bawah", "PERAWATAN", 150000, 0, 25000, 225000, 250000, "Scaling rutin lengkap."],
      ["TM-001", "Tambal Komposit Kecil", "RESTORASI", 120000, 0, 35000, 215000, 250000, "Tambal komposit satu permukaan."],
      ["EXT-001", "Cabut Gigi Sederhana", "BEDAH MINOR", 175000, 0, 30000, 270000, 300000, "Ekstraksi sederhana tanpa komplikasi."],
      ["ORTH-001", "Kontrol Behel", "ORTHODONTI", 0, 200000, 50000, 300000, 350000, "Kontrol ortho bulanan."],
    ].map((row) => env.DB.prepare(`INSERT INTO treatment (code, name, category, doctor_cost, specialist_cost, bhp_cost, service_fee, treatment_price, notes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(...row, now)),
    ...[
      ["Nadia Putri", "EMP-001", "Admin Front Office", "2025-01-10", 3000000, 25, 0, "BSI", "Nadia Putri", "7001002001"],
      ["Rafi Saputra", "EMP-002", "Asisten Dokter", "2025-03-15", 2850000, 25, 0, "BCA", "Rafi Saputra", "7001002002"],
      ["Maya Anggraini", "EMP-003", "Kasir", "2026-05-01", 2712250, 25, 1, "MANDIRI", "Maya Anggraini", "7001002003"],
    ].map((row) => env.DB.prepare(`INSERT INTO employee (name, attendance_id, position, join_date, base_salary, working_days, is_training, bank_name, account_name, account_number, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(...row, now)),
    env.DB.prepare("INSERT INTO attendanceholiday (holiday_date, name, is_holiday, created_at) VALUES (?, ?, 1, ?)")
      .bind("2026-07-17", "Contoh Hari Libur Klinik", now),
  ]);
}

export async function refreshDevelopmentDatabase(env: Env): Promise<void> {
  await env.DB.exec("PRAGMA defer_foreign_keys = true");
  try {
    for (const table of DATA_TABLES) await env.DB.exec(`DELETE FROM ${table}`);
    await env.DB.exec(`DELETE FROM sqlite_sequence WHERE name IN (${DATA_TABLES.map((table) => `'${table}'`).join(",")})`);
  } finally {
    await env.DB.exec("PRAGMA defer_foreign_keys = false");
  }
  await seedDefaults(env, hashPassword);
  await seedDevMasterData(env);
}
