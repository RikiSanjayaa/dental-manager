# Proposal: Doctor Fee Self-Service (doctor-fee-self-service)

## Why

Klinik (Devema Clinic) needs doctors to log in and see **their own** fee dokter data — mirroring the existing "Payroll Saya" self-service operators already have. Phase 1 (accounts, fee view, exports) is implemented; this change also covers the doctor dashboard/audit surface and makes the doctor self-service UI visually consistent with the payroll self-service page, based on client review.

A separate client request — restricting what employees see about paycheck totals — needs business context and is out of scope.

## What Changes

- **New `doctor` role** + `user.doctor_id` link (one account per doctor), admin provisioning in User Management, identity payload includes doctor info; doctor accounts blocked from payroll self-service and all cross-doctor fee/payroll management endpoints (403); account deactivation is the revocation control.
- **Doctor Dashboard (home)**: mirrors the operator/admin dashboard pattern but scoped to the logged-in doctor's own data:
  - KPI cards for the selected period (total transfer / total fee / transactions / review count)
  - monthly income comparison chart (current period vs previous period, own data only), same style as the admin dashboard chart
  - recent own transactions and recent own audit entries
- **Fee Dokter Saya recap page**: restyled to match the "Payroll Saya" layout — prominent "Total transfer" amount, component amounts as compact cards in a responsive grid (fee perawatan, fee ortho/behel, tagihan, potongan, pajak), payment-information card with PDF/XLSX export buttons, and the period's own transactions table ("Transaksi Saya") below.
- **Audit Akun for doctors**: doctors can open Audit Akun (self-only audit log, `/audit-logs/me`) to see their own login/export activity.
- **Doctor navigation** becomes: Dashboard (home), Fee Dokter Saya, Audit Akun.
- **Removed (client review, redundancy):** dedicated "Riwayat Perawatan Saya" page and its `GET /me/doctor-transactions` endpoint — the fee page's "Transaksi Saya" table and dashboard recent-transactions already cover viewing own treatment rows.
- **Data isolation (kept):** role `doctor` is denied cross-doctor management endpoints (`/doctor-transactions` write/import paths and staff GETs, `/doctor-periods/:period/summary|overview`, aggregate/zip doctor-fee exports, payroll endpoints). Admin/operator behavior unchanged.

### Out of scope (explicit)

- FastAPI parity backend (`backend/`) — legacy reference, not deployed.
- Employee paycheck-visibility changes (client question, awaiting business context).
- Doctor editing/recording treatment history or approving reviews.
- Doctor PDF/XLSX beyond own fee recap (aggregate staff exports stay admin/operator).

## Capabilities

### New Capabilities

- `identity/doctor-accounts`: doctor role, user↔doctor link, provisioning, identity payloads, role gating primitives, doctor access to own audit log.
- `doctor-fees/self-service`: doctor dashboard (own income overview + month-over-month comparison), read-only per-doctor fee views (summary + transactions), single-doctor XLSX/PDF export, payroll-consistent recap layout, and the data-isolation rules that keep a doctor's view limited to their own records.

### Modified Capabilities

(none — `openspec/specs/` has no established capabilities yet; this change seeds the first two)

## Impact

- **DB (D1 migration)** — `backend-worker/migrations/0004_doctor_user_accounts.sql` (already added): `user.doctor_id` FK + partial unique index.
- **Worker backend** (`backend-worker/src/`):
  - `types.ts`, `auth.ts`, `routes/auth.ts` — doctor role, `staffOnly`/`requireLinkedDoctor`, `/auth/me` doctor info
  - `routes/master.ts` — `/users` accepts `doctor_id`, validated; safe projections (no password hash)
  - `routes/doctor-fee.ts` — staff guards; `GET /me/doctor-fees`, `GET /me/doctor-fees/:period`, `GET /me/doctor-fees/:period/export`; **new** `GET /me/doctor-dashboard`; **removes** `GET /me/doctor-transactions`
  - `routes/reports.ts` — `buildDoctorFeeReport(env, period, format, doctorId?)`; aggregate exports staff-only
  - `routes/payroll.ts`/`routes/dashboard.ts` — doctor gets 403 on payroll/dashboard staff endpoints
  - `dev-data.ts` — dev seed doctor account + fixed table delete order (user before doctor)
  - tests updated for removed/added endpoints
- **Frontend** (`frontend/src/`):
  - `lib/api.ts`, `lib/auth.ts` — doctor role/helpers/labels
  - `App.tsx`, `AppShell.tsx` — per-role nav allowlists; doctor nav = Dashboard, Fee Dokter Saya, Audit Akun; doctor home renders Dashboard
  - `pages/MyDoctorFeesPage.tsx` — restyled to payroll-slip layout
  - `pages/DoctorDashboardPage.tsx` — **new** doctor dashboard
  - `pages/AuditLogsPage.tsx` — reused for doctor self-only audit
  - `pages/UsersPage.tsx` — Dokter role + doctor picker
  - **removes** `pages/MyTreatmentHistoryPage.tsx` + route
- **Tests**: `backend-worker/test/` guard/self-service/dashboard coverage; frontend typecheck/build.
- **Deploy**: branch-only until review; Cloudflare Worker/D1 + Pages deploy happen on merge to `main`. QA runs locally (docker `dental-qa` or host `npm run dev`).
