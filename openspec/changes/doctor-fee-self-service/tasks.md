# Tasks: Doctor Fee Self-Service

Implementation order. Backend groups first (schema → identity → fee views/guards), then frontend, then a combined verification pass. Open questions in `design.md` are ops follow-ups that do not change these tasks.

## 1. Database migration (backend-worker)

- [ ] 1.1 Add `backend-worker/migrations/0004_doctor_user_accounts.sql`: `ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id);` plus `CREATE UNIQUE INDEX IF NOT EXISTS ux_user_doctor_id ON user(doctor_id) WHERE doctor_id IS NOT NULL;`
- [ ] 1.2 Apply locally and verify schema: `npm --prefix backend-worker run d1:migrate:local`, then inspect `user` columns (e.g. `wrangler d1 execute dental-manager --local --command "PRAGMA table_info(user);" --cwd backend-worker`)

## 2. Worker types & auth helpers

- [ ] 2.1 `backend-worker/src/types.ts`: extend `UserRole` with `"doctor"` and add `doctor_id: number | null` to `User`
- [ ] 2.2 `backend-worker/src/auth.ts`: add `staffOnly` middleware (allows `admin` | `operator`, 403 otherwise) and `requireLinkedDoctor` helper (403/409 when `role === "doctor"` but no `doctor_id`)
- [ ] 2.3 `backend-worker/src/routes/auth.ts`: `/auth/me` returns `doctor_id` and `doctor_name` (LEFT JOIN `doctor`), keeping `employee_name` behavior for operator/admin

## 3. User provisioning (admin) in worker

- [ ] 3.1 `backend-worker/src/routes/master.ts` `/users` list: include `doctor_id` + `doctor_name` (LEFT JOIN `doctor`)
- [ ] 3.2 `POST /users` and `PATCH /users/:id`: accept `doctor_id`; validate role values (`admin`/`operator`/`doctor`), require `doctor_id` when role is `doctor`, reject unknown doctor ids and duplicate doctor links (400 with Indonesian message)
- [ ] 3.3 Sanitize user create/update responses: return explicit safe projection without `hashed_password` (both POST and PATCH handlers that currently use `getById`)

## 4. Doctor fee self-service endpoints + isolation guards

- [ ] 4.1 Add `staffOnly` guard to cross-doctor fee endpoints in `backend-worker/src/routes/doctor-fee.ts`: `GET/POST/PATCH/DELETE /doctor-transactions` (+ import endpoints) and `GET /doctor-periods/:period/summary`, `GET /doctor-periods/:period/overview` (calculate/lock/unlock already `adminOnly`)
- [ ] 4.2 Add `GET /me/doctor-fees` (route file: `doctor-fee.ts` or a small `me-doctor-fee.ts` mounted like payroll): resolves doctor from `user.doctor_id`, returns periods (distinct periods from `doctortransaction` + `doctorperiodsummary` for that doctor, newest first) with per-period status and `latest_period`; empty list + null `latest_period` when none
- [ ] 4.3 Add `GET /me/doctor-fees/:period` returning doctor profile (name + bank/payment info), summary (status empty/not_calculated/draft/locked, treatment_fee_total, ortho_fee_total, total_fee, total_bill, deduction, tax, transfer_amount, calculated_at, transaction_count, review count) and the doctor's own transaction rows (date, patient, treatment, qty, fee amounts, total bill, review flag)
- [ ] 4.4 Validate `:period` as `YYYY-MM` (400 otherwise) on the self-service endpoint
- [ ] 4.5 `backend-worker/src/routes/payroll.ts`: `/me/payroll/:period`, `/me/payroll/:period/export`, `/me/dashboard` return 403 when role is `doctor` (keep existing 409 for operator without employee link)
- [ ] 4.6 `backend-worker/src/routes/reports.ts`: restrict `/reports/doctor-fees` and `/reports/payroll` export endpoints to `staffOnly` (archive list/download stays `adminOnly`)
- [ ] 4.7 Grep audit: confirm no fee/payroll management endpoint remains open to role `doctor` (search routes with `currentUser`-only guards that expose cross-doctor data)

## 5. Worker dev seed + tests

- [ ] 5.1 `backend-worker/src/dev-data.ts` `seedDevMasterData`: insert one demo doctor user (e.g. `drg.anindita`) linked to the first seeded doctor with a documented dev password (bcrypt via `hashPassword`), development-only
- [ ] 5.2 Add/extend vitest coverage for pure helpers and guards: staff-role evaluation, doctor link requirement, self period list/status derivation (follow existing `backend-worker/test/` patterns)
- [ ] 5.3 Run `npm --prefix backend-worker run typecheck` and `npm --prefix backend-worker run test` green

## 6. Frontend foundations (types, guards, nav)

- [ ] 6.1 `frontend/src/lib/api.ts`: extend `Role` and `UserMe` with doctor role + `doctor_id`/`doctor_name`
- [ ] 6.2 `frontend/src/lib/auth.ts`: add `isOperator`, `isDoctor`; make `isAdministrator` unchanged; `roleLabel` returns "Dokter" for doctor
- [ ] 6.3 `frontend/src/App.tsx`: `OperatorRoute` uses `isOperator` (not `!admin`); wrap `/treatment-history` and `/attendance` so doctors cannot reach them; doctor home (`HomeRoute`) redirects to the new self-service page; doctor-only route guard for `/my-doctor-fees`
- [ ] 6.4 `frontend/src/components/AppShell.tsx`: convert nav item visibility to explicit role sets (admin/operator/doctor), add "Fee Dokter Saya" nav item for doctors; ensure admin/operator items (Fee Dokter, Payroll, Master Data, Users, Laporan, Pengaturan, Payroll Saya, dll.) show only for their roles

## 7. Frontend User Management (admin)

- [ ] 7.1 `frontend/src/pages/UsersPage.tsx`: role select + badge support `doctor`; create/edit dialog shows "Dokter Terhubung" picker when role is doctor (active doctors from `GET /doctors`); table shows doctor link column; search includes doctor name; payload sends `doctor_id` (null when unset)

## 8. Frontend doctor self-service page

- [ ] 8.1 Create `frontend/src/pages/MyDoctorFeesPage.tsx` (modeled on `MyPayrollPage`): period picker defaulting to `latest_period` from `/me/doctor-fees`; summary cards (total fee, transfer, tax, deduction, total billing), status badge (empty/not calculated/draft/locked), bank/payment info card, and a read-only DataTable of own transactions with review flags
- [ ] 8.2 Wire the page in `App.tsx` (route + nav label "Fee Dokter Saya") and confirm empty/unlinked states render Indonesian messages (e.g. account not linked to a doctor → 409-style guidance)

## 9. Frontend verification

- [ ] 9.1 `npm --prefix frontend run build` (or `tsc --noEmit`) passes with the new role/page code
- [ ] 9.2 Manual matrix (local stack): admin creates doctor account; doctor logs in and sees only own fee data; doctor gets 403 on management endpoints (`/doctor-periods/:period/overview`, `/doctor-transactions`, `/reports/doctor-fees`); operator pages inaccessible to doctor; admin/operator flows unchanged

## 10. Handoff prep

- [ ] 10.1 Commit only intended files on `feature/doctor-fee-self-service` (openspec/, .opencode/, code changes); `.hermes/` is intentionally absent
- [ ] 10.2 Final summary for review: diff stat, verification output, list of decisions/assumptions for the user before merge to `main`
