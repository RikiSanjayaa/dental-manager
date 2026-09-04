# Proposal: Doctor Fee Self-Service (doctor-fee-self-service)

## Why

Klinik (Devema Clinic) currently has only two login roles — `admin` and `operator` — and doctors are just master-data records. Doctors have no way to log in and see their own fee (fee dokter) breakdowns, and every fee/payroll figure in the system is only visible through admin screens or by asking admin for a report. The client wants each doctor to have their own account that shows **their own** doctor fees per period (read-only self-service), mirroring the existing "Payroll Saya" experience operators already have.

A separate client request — restricting what employees see about their paycheck totals — needs more business context and is explicitly **out of scope** here (tracked for a later change).

## What Changes

- **New `doctor` role** in the backend worker and frontend, alongside `admin` and `operator`.
- **Link users to doctors**: `user.doctor_id` column (nullable, unique among non-null) pointing to master `doctor`; admin can provision doctor accounts in User Management.
- **Login/identity**: `GET /auth/me` and user lists expose `doctor_id`/`doctor_name`; role badge/label shows "Dokter".
- **Doctor self-service fee view**: new read-only endpoints under `/me/doctor-fees*` that return only the logged-in doctor's data:
  - periods where the doctor has transactions and/or a period summary, with status
  - one period's summary (fee totals, deduction, tax, transfer, billing, review/lock status) and its transaction details
- **Data isolation (security)**: role `doctor` is denied the cross-doctor management endpoints (`/doctor-transactions`, `/doctor-periods/:period/summary|overview`, doctor-fee report exports). Operators/admins keep today's behavior. Doctor pay records (salary-type info) stay invisible to doctors (they have no `employee_id`; `/me/payroll*` returns 403 for doctors).
- **Frontend routing/menu**: doctors land on a "Fee Dokter Saya" page; the operator/admin-only menu items and pages are hidden/guarded per-role; operator-only pages no longer match doctors via the old "not admin" logic.
- **No PDF/XLSX export for doctors yet** (existing export pipeline stays admin/operator-only) — treated as a follow-up.

### Out of scope (explicit)

- **BREAKING (none intended for admin/operator)**: Existing admin/operator screens and API shapes are unchanged.
- FastAPI parity backend (`backend/`) is not touched — it is the legacy reference; production runs the Cloudflare Worker backend (`backend-worker/`) plus this frontend.
- Employee paycheck-visibility changes (client question, awaiting business context).
- Doctor PDF/XLSX export, doctor editing own data, doctor access to treatment history recording.

## Capabilities

### New Capabilities

- `identity/doctor-accounts`: doctor role, user↔doctor link, provisioning, identity payloads, role gating primitives.
- `doctor-fees/self-service`: read-only per-doctor fee views and the data-isolation rules that keep a doctor's view limited to their own records.

### Modified Capabilities

(none — `openspec/specs/` has no established capabilities yet; this change seeds the first two)

## Impact

- **DB (D1 migration)** — `backend-worker/migrations/0004_*.sql`: `ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id)` + partial unique index on `doctor_id`.
- **Worker backend** (`backend-worker/src/`):
  - `types.ts` — `UserRole` + `User.doctor_id`
  - `auth.ts` — role helpers (`adminOnly` stays; add `staffOnly` = admin|operator, doctor link helper)
  - `routes/auth.ts` — `/auth/me` includes doctor info
  - `routes/master.ts` — `/users` list/create/update accept `doctor_id` with validation; sanitized user responses (never return `hashed_password`)
  - `routes/doctor-fee.ts` — staff guard on management endpoints; new `/me/doctor-fees` + `/me/doctor-fees/:period`
  - `routes/reports.ts` — doctor-fee/payroll export endpoints staff-guarded
  - `routes/payroll.ts` — `/me/*` endpoints return 403 (not 409) for doctor role
  - `dev-data.ts` / seeds — demo doctor account(s) for local QA
- **Frontend** (`frontend/src/`):
  - `lib/api.ts`, `lib/auth.ts` — role type, helpers, labels
  - `App.tsx` — doctor home/route guard; operator/staff guards corrected
  - `components/AppShell.tsx` — per-role nav (allowlist refactor)
  - `pages/UsersPage.tsx` — Dokter role + "Dokter Terhubung" picker/column
  - new `pages/MyDoctorFeesPage.tsx` — self-service fee page (period picker, summary cards, own-transaction table)
- **Tests**: `backend-worker/test/` unit/route tests for new authorization + `/me/doctor-fees` behavior; frontend typecheck.
- **Deploy**: branch-only for now; Cloudflare Worker/D1 migration + Pages deploy happen only when merged to `main` (CI). Local QA via `wrangler d1 migrations apply --local` + `npm run dev` compose stack.
