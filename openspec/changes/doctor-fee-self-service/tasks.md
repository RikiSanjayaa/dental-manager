# Tasks: Doctor Fee Self-Service

Final consolidated task list for the branch. Phase 1 (accounts, fee view, exports, isolation) is implemented, verified (worker typecheck+tests, frontend build) and QA'd. Pending items are phase 2 (dashboard, audit access, recap restyle, removal of the redundant history page) per client review.

## 1. Database migration (backend-worker) — DONE

- [x] 1.1 `backend-worker/migrations/0004_doctor_user_accounts.sql`: `ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id);` + `CREATE UNIQUE INDEX IF NOT EXISTS ux_user_doctor_id ON user(doctor_id) WHERE doctor_id IS NOT NULL;`
- [x] 1.2 Applied locally and verified schema

## 2. Worker types & auth helpers — DONE

- [x] 2.1 `backend-worker/src/types.ts`: `UserRole` includes `"doctor"`; `User` has `doctor_id`
- [x] 2.2 `backend-worker/src/auth.ts`: `staffOnly` (admin|operator) + `requireLinkedDoctor`; `currentUser` reads role/link per request
- [x] 2.3 `backend-worker/src/routes/auth.ts`: `/auth/me` returns `doctor_id` + `doctor_name`

## 3. User provisioning (admin) in worker — DONE

- [x] 3.1 `/users` list includes `doctor_id`/`doctor_name`
- [x] 3.2 `POST/PATCH /users` accept+validate `doctor_id` (role doctor requires link; unknown/duplicate → 400, Indonesian)
- [x] 3.3 User create/update responses sanitized (no `hashed_password`)

## 4. Doctor fee self-service endpoints + isolation guards — DONE

- [x] 4.1 `staffOnly` on `/doctor-transactions*` and `/doctor-periods/:period/summary|overview`
- [x] 4.2 `GET /me/doctor-fees` — own periods + `latest_period`
- [x] 4.3 `GET /me/doctor-fees/:period` — own profile/summary/rows
- [x] 4.4 `YYYY-MM` period validation on self-service fee endpoints

## 5. Doctor fee export (own) — DONE

- [x] 5.1 `buildDoctorFeeReport(env, period, format, doctorId?)` single-doctor filter
- [x] 5.2 `GET /me/doctor-fees/:period/export?format=pdf|xlsx` (404 when empty; archived with created_by=doctor)
- [x] 5.3 Aggregate exports (`/reports/doctor-fees`, `/reports/payroll`, ZIP) staff-only; archive list/download admin-only
- [x] 5.4 Audit grep: no fee/payroll mgmt endpoint open to doctor (incl payroll mgmt GETs, `/dashboard`, slip download)

## 6. Doctor payroll isolation — DONE

- [x] 6.1 `/me/payroll/:period`, `/me/payroll/:period/export`, `/me/dashboard` → 403 for doctor (operator 409 unchanged)

## 7. Worker dev seed + tests — DONE

- [x] 7.1 `dev-data.ts` seeds demo doctor account `drg.anindita` (dev only)
- [x] 7.2 Dev refresh delete order fixed (user before doctor — doctor_id FK)
- [x] 7.3 Vitest coverage for guards, link requirement, single-doctor export filtering; `typecheck` + `test` green

## 8. Frontend foundations (types, guards, nav) — DONE

- [x] 8.1 `lib/api.ts` Role/UserMe doctor fields
- [x] 8.2 `lib/auth.ts` `isDoctor`/`isOperator`, roleLabel "Dokter"
- [x] 8.3 `App.tsx` role-aware guards; `AppShell.tsx` per-role nav allowlists

## 9. Frontend User Management (admin) — DONE

- [x] 9.1 `UsersPage.tsx` Dokter role + "Dokter Terhubung" picker/column/search

## 10. Phase 2 — Fee recap restyle (frontend)

- [ ] 10.1 Restyle `MyDoctorFeesPage.tsx` recap to match `MyPayrollPage`: reuse `.payroll-total-card`/`.payroll-total-amount` (prominent total transfer) and `.payroll-summary-grid` for the component cards (Fee Dokter / Fee Behel / Tagihan / Potongan / Pajak), keep payment-info card + PDF/XLSX buttons and the read-only "Transaksi Saya" table
- [ ] 10.2 Frontend build passes after restyle (`npm --prefix frontend run build`)

## 11. Phase 2 — Doctor dashboard backend (worker)

- [x] 11.1 Add `GET /me/doctor-dashboard` (doctor-only): optional `period` (default latest with data; `YYYY-MM` validated); returns doctor profile, current summary (status/fee totals/transfer/billing/transaction+review counts), previous-calendar-month summary (or null), recent own transactions (limit ~5), recent own audit entries (limit ~5)
- [x] 11.2 Remove `GET /me/doctor-transactions` route + its tests from `backend-worker` (redundant with dashboard recent rows + fee period detail)
- [x] 11.3 Update/extend vitest coverage for `/me/doctor-dashboard` (scoping, previous-month derivation, malformed period); `npm --prefix backend-worker run typecheck` and `npm --prefix backend-worker run test` green

## 12. Phase 2 — Doctor dashboard, audit & history removal (frontend)

- [ ] 12.1 Create `frontend/src/pages/DoctorDashboardPage.tsx` (doctor home): KPI cards for selected period, current-vs-previous income comparison chart styled like the admin dashboard (ECharts, own data only), recent own transactions table, recent own audit entries; period picker defaults to dashboard `period`
- [ ] 12.2 Wire doctor nav/home in `App.tsx` + `AppShell.tsx`: doctor home renders `DoctorDashboardPage`; doctor nav = Dashboard, "Fee Dokter Saya", "Audit Akun" (`AuditLogsPage selfOnly`); remove `MyTreatmentHistoryPage` route/import/nav
- [ ] 12.3 Remove `frontend/src/pages/MyTreatmentHistoryPage.tsx`; repo-wide grep confirms no remaining `MyTreatmentHistory` or `/me/doctor-transactions` references; `npm --prefix frontend run build` passes

## 13. Phase 2 — QA re-verification (local)

- [ ] 13.1 On the running host dev stack (or fresh docker QA stack): as doctor, verify Dashboard (KPIs, month comparison chart, recent rows), Fee Dokter Saya restyled recap (prominent total + compact component grid), Audit Akun shows login/export entries, no "Riwayat Perawatan Saya" anywhere; admin/operator regression spot check; record PASS/FAIL per step
- [ ] 13.2 Commit phase-2 work + task checkboxes; final diff stat/verification summary for review before merge to `main`
