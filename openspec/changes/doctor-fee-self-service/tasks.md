# Tasks: Doctor Fee Self-Service

Implementation order. Backend groups first (schema → identity → fee views/exports/guards → history), then frontend, then a combined verification pass. Open questions in `design.md` are ops/frontend details that do not change these tasks.

## 1. Database migration (backend-worker)

- [x] 1.1 Add `backend-worker/migrations/0004_doctor_user_accounts.sql`: `ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id);` plus `CREATE UNIQUE INDEX IF NOT EXISTS ux_user_doctor_id ON user(doctor_id) WHERE doctor_id IS NOT NULL;`
- [x] 1.2 Apply locally and verify schema: `npm --prefix backend-worker run d1:migrate:local`, then inspect `user` columns (e.g. `wrangler d1 execute dental-manager --local --command "PRAGMA table_info(user);" --cwd backend-worker`)

## 2. Worker types & auth helpers

- [x] 2.1 `backend-worker/src/types.ts`: extend `UserRole` with `"doctor"` and add `doctor_id: number | null` to `User`
- [x] 2.2 `backend-worker/src/auth.ts`: add `staffOnly` middleware (allows `admin` | `operator`, 403 otherwise) and `requireLinkedDoctor` helper (403/409 when `role === "doctor"` but no `doctor_id`)
- [x] 2.3 `backend-worker/src/routes/auth.ts`: `/auth/me` returns `doctor_id` and `doctor_name` (LEFT JOIN `doctor`), keeping `employee_name` behavior for operator/admin

## 3. User provisioning (admin) in worker

- [x] 3.1 `backend-worker/src/routes/master.ts` `/users` list: include `doctor_id` + `doctor_name` (LEFT JOIN `doctor`)
- [x] 3.2 `POST /users` and `PATCH /users/:id`: accept `doctor_id`; validate role values (`admin`/`operator`/`doctor`), require `doctor_id` when role is `doctor`, reject unknown doctor ids and duplicate doctor links (400 with Indonesian message)
- [x] 3.3 Sanitize user create/update responses: return explicit safe projection without `hashed_password` (both POST and PATCH handlers that currently use `getById`)

## 4. Doctor fee self-service endpoints + isolation guards

- [x] 4.1 Add `staffOnly` guard to cross-doctor fee endpoints in `backend-worker/src/routes/doctor-fee.ts`: `GET/POST/PATCH/DELETE /doctor-transactions` (+ import endpoints) and `GET /doctor-periods/:period/summary`, `GET /doctor-periods/:period/overview` (calculate/lock/unlock already `adminOnly`)
- [x] 4.2 Add `GET /me/doctor-fees` (route file: `doctor-fee.ts` or a small `me-doctor-fee.ts` mounted like payroll): resolves doctor from `user.doctor_id`, returns periods (distinct periods from `doctortransaction` + `doctorperiodsummary` for that doctor, newest first) with per-period status and `latest_period`; empty list + null `latest_period` when none
- [x] 4.3 Add `GET /me/doctor-fees/:period` returning doctor profile (name + bank/payment info), summary (status empty/not_calculated/draft/locked, treatment_fee_total, ortho_fee_total, total_fee, total_bill, deduction, tax, transfer_amount, calculated_at, transaction_count, review count) and the doctor's own transaction rows (date, patient, treatment, qty, fee amounts, total bill, review flag)
- [x] 4.4 Validate `:period` as `YYYY-MM` (400 otherwise) on self-service fee endpoints

## 5. Doctor fee export (own)

- [x] 5.1 `backend-worker/src/routes/reports.ts`: extend `buildDoctorFeeReport(env, period, format, doctorId?)` to narrow summaries + detail rows to one doctor (XLSX single-summary workbook; PDF via existing `makeDoctorFeePdf` with the single summary)
- [x] 5.2 Add `GET /me/doctor-fees/:period/export?format=pdf|xlsx` (doctor-only): 404 when the doctor has no summary and no transactions for the period; archives the artifact (`reportarchive`, created_by = doctor) like other exports
- [x] 5.3 Restrict aggregate export endpoints to `staffOnly`: `/reports/doctor-fees`, `/reports/payroll` (ZIP and aggregate paths never reachable by doctors); archive list/download stays `adminOnly`
- [x] 5.4 Grep audit: confirm no fee/payroll management endpoint remains open to role `doctor` (search routes with `currentUser`-only guards that expose cross-doctor data)

## 6. Doctor treatment history (own)

- [x] 6.1 Add `GET /me/doctor-transactions` (doctor-only, optional `period` query, `YYYY-MM` validated; own rows only newest first; 403/409 when account not linked to a doctor)
- [x] 6.2 Confirm all transaction write/import endpoints remain `staffOnly` (doctor gets 403): `POST/PATCH/DELETE /doctor-transactions`, import preview/commit paths

## 7. Payroll self-service guard

- [x] 7.1 `backend-worker/src/routes/payroll.ts`: `/me/payroll/:period`, `/me/payroll/:period/export`, `/me/dashboard` return 403 when role is `doctor` (keep existing 409 for operator without employee link)

## 8. Worker dev seed + tests

- [x] 8.1 `backend-worker/src/dev-data.ts` `seedDevMasterData`: insert one demo doctor user (e.g. `drg.anindita`) linked to the first seeded doctor with a documented dev password (bcrypt via `hashPassword`), development-only
- [x] 8.2 Add/extend vitest coverage for pure helpers and guards: staff-role evaluation, doctor link requirement, single-doctor report filtering, self period/status derivation (follow existing `backend-worker/test/` patterns)
- [x] 8.3 Run `npm --prefix backend-worker run typecheck` and `npm --prefix backend-worker run test` green

## 9. Frontend foundations (types, guards, nav)

- [x] 9.1 `frontend/src/lib/api.ts`: extend `Role` and `UserMe` with doctor role + `doctor_id`/`doctor_name`
- [x] 9.2 `frontend/src/lib/auth.ts`: add `isOperator`, `isDoctor`; keep `isAdministrator`; `roleLabel` returns "Dokter" for doctor
- [x] 9.3 `frontend/src/App.tsx`: `OperatorRoute` uses `isOperator` (not `!admin`); wrap `/treatment-history` and `/attendance` so doctors cannot reach them; doctor home (`HomeRoute`) redirects to `/my-doctor-fees`; doctor-only route guard for `/my-doctor-fees` and `/my-treatment-history`
- [x] 9.4 `frontend/src/components/AppShell.tsx`: convert nav item visibility to explicit role sets (admin/operator/doctor); add "Fee Dokter Saya" and "Riwayat Perawatan Saya" nav items for doctors; admin/operator-only items show only for their roles

## 10. Frontend User Management (admin)

- [x] 10.1 `frontend/src/pages/UsersPage.tsx`: role select + badge support `doctor`; create/edit dialog shows "Dokter Terhubung" picker when role is doctor (active doctors from `GET /doctors`); table shows doctor link column; search includes doctor name; payload sends `doctor_id` (null when unset)

## 11. Frontend doctor self-service pages

- [x] 11.1 Create `frontend/src/pages/MyDoctorFeesPage.tsx` (modeled on `MyPayrollPage`): period picker defaulting to `latest_period` from `/me/doctor-fees`; summary cards (total fee, transfer, tax, deduction, total billing), status badge (empty/not calculated/draft/locked), bank/payment info card, read-only DataTable of own transactions with review flags, and export buttons (PDF/XLSX via `/me/doctor-fees/:period/export`)
- [x] 11.2 Create `frontend/src/pages/MyTreatmentHistoryPage.tsx` (read-only): period filter (optional, defaults to latest month), DataTable of own transactions (reuse `DataTable` + treatment-history types/utils), no create/edit/import/delete/review actions
- [x] 11.3 Wire both pages in `App.tsx` (routes + nav labels) and confirm empty/unlinked states render Indonesian messages (e.g. account not linked to a doctor)

## 12. Frontend verification

- [x] 12.1 `npm --prefix frontend run build` (or `tsc --noEmit`) passes with the new role/pages code
- [ ] 12.2 Manual matrix (local stack): admin creates doctor account; doctor logs in and sees only own fee data + own history; doctor exports own XLSX/PDF; doctor gets 403 on management endpoints (`/doctor-periods/:period/overview`, `/doctor-transactions` writes/imports, `/reports/doctor-fees`, ZIP export); operator pages inaccessible to doctor; admin/operator flows unchanged

## 13. Handoff prep

- [x] 13.1 Commit only intended files on `feature/doctor-fee-self-service` (openspec/, .opencode/, code changes); `.hermes/` is intentionally absent
- [ ] 13.2 Final summary for review: diff stat, verification output, list of decisions/assumptions for the user before merge to `main`
