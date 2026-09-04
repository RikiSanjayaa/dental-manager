# Design: Doctor Fee Self-Service

See `proposal.md` for the why; `specs/` for the behavior contract. This doc records the how.

## Context

Current state (verified in code):

- Production backend is the Cloudflare Worker (`backend-worker/`, Hono + D1). The old FastAPI backend (`backend/`) is a legacy parity reference, not deployed; recent commits only touch the worker.
- `user` table: `role TEXT DEFAULT 'operator'`, `employee_id` nullable. Only `admin`/`operator` exist. No link from user → doctor.
- Doctor fee data lives in `doctortransaction` (per-treatment rows) and `doctorperiodsummary` (per doctor/period totals with bank info). Existing fee endpoints (`/doctor-transactions`, `/doctor-periods/:period/summary|overview`) are authenticated but **not role-restricted** — anyone with a valid token can read all doctors' fee/bank data.
- Operator self-service already models exactly what we need: `/me/payroll/:period` + `/me/dashboard` resolve the employee from the user row (`employee_id`) and return only that person's data (`backend-worker/src/routes/payroll.ts`).
- Frontend gates on a binary model: `operatorOnly = !admin` (`App.tsx`, `AppShell.tsx`, `lib/auth.ts`) — adding a third role breaks that assumption everywhere.
- Frontend `UsersPage` (admin) manages users with role + employee picker.
- JWT is stateless but `currentUser` re-reads the user row per request, so role/link changes apply immediately without token invalidation.

## Goals / Non-Goals

Goals:
- Minimal, reviewable change on the worker backend + shared frontend only.
- Doctor account provisioning by admin (role + doctor link), identity payload with doctor info.
- Read-only self-service fee view + doctor dashboard/audit with strict server-side isolation.
- Visual parity between "Payroll Saya" and "Fee Dokter Saya" recap layout.
- Local QA path (dev seed doctor account) so qa/frontend/backend profiles can verify without production data.

Non-goals (this change): FastAPI parity ports; dedicated doctor treatment-history page/endpoint (removed as redundant — fee page "Transaksi Saya" + dashboard recent rows cover it); doctor editing/recording treatment history or approving reviews; employee payroll-visibility redesign; deactivating a doctor master auto-revoking login.

## Decisions

1. **Extend roles rather than add a flag.**
   `UserRole = "admin" | "operator" | "doctor"`. Add a `staffOnly` helper (admin|operator) beside `adminOnly`; the frontend gets `isDoctor`/`isOperator` helpers. Alternative considered: a boolean `is_doctor_self_service` flag — rejected: it would leak into every existing endpoint branch and is less legible than an explicit role.

2. **Link accounts with `user.doctor_id`, one account per doctor.**
   Nullable FK to `doctor.id` + unique partial index (`CREATE UNIQUE INDEX ... ON user(doctor_id) WHERE doctor_id IS NOT NULL`). Enforce existence/role rules app-side too (D1 does not reliably enforce FKs). Alternative: separate `user_doctor` join table — rejected: 1:1 relationship, no future many-to-many need foreseen.

3. **Doctor account revocation is account-driven.**
   Deactivating the doctor master does not disable login; admin deactivates the user account. Rationale: a doctor may leave master data (e.g., rate change) while historical fees still need viewing; the user account is the access control surface. Kept as an explicit spec scenario.

4. **New self-service endpoints mirror the payroll `/me` pattern.**
   `GET /me/doctor-fees` (periods + `latest_period`) and `GET /me/doctor-fees/:period` (summary + own transactions). They resolve `doctor_id` from `user.doctor_id` server-side; no client-supplied doctor id is accepted. Alternative: reuse `/doctor-periods/:period/summary` with forced `doctor_id` filter — rejected: response shapes expose bank/payment info of every doctor and reuse makes accidental leakage easier; separate narrow endpoints are cheaper to secure than retrofitting.

5. **Block doctors from cross-doctor endpoints with a staff guard.**
   `staffOnly` middleware on `/doctor-transactions` (GET/POST/PATCH/DELETE + imports), `/doctor-periods/:period/summary|overview` (calculate/lock/unlock already `adminOnly`), and `/reports/doctor-fees` + `/reports/payroll`. `/me/payroll*` and `/me/dashboard` return **403** for doctors instead of the current 409 "no employee link" — a 409 would wrongly suggest fixing the link resolves it. Existing admin/operator behavior is byte-for-byte unchanged.

6. **Frontend moves from binary role flags to explicit role sets.**
   `AppShell` nav items and `App.tsx` route guards become allowlists (`roles?: UserRole[]`, default all). `HomeRoute`: admin → admin dashboard, operator → operator dashboard, doctor → navigate to the new self-service page. `OperatorRoute` narrows to `isOperator` (previously `!admin` — would have admitted doctors). `MyDoctorFeesPage` is a single self-service page (period picker + summary cards + own transactions table), modeled on `MyPayrollPage`; no separate doctor dashboard in this change.

7. **Do not return `hashed_password` from user endpoints.**
   Existing `POST/PATCH /users` respond via generic `getById` (`SELECT *`) which currently leaks the hash to the admin browser. Since we touch these handlers, switch user create/update responses to an explicit safe projection (list query already does this).

8. **Demo doctor account in development seeds.**
   `seedDevMasterData` (dev-data.ts) adds a doctor user linked to the first seeded doctor (e.g. `drg.anindita` / documented dev password, bcrypt-hashed at seed time), so qa profiles can log in as a doctor locally. Production seeds do not create doctor accounts — the client admin provisions them in UI.

9. **Doctor exports reuse the existing single-doctor generators.**
   `buildDoctorFeeReport` (reports.ts) already produces per-doctor PDFs (ZIP) and per-doctor XLSX sheets by filtering transactions on `summary.doctor_id`. Extend it with an optional `doctorId` filter that narrows summaries to one row, then expose `GET /me/doctor-fees/:period/export?format=pdf|xlsx` for doctors (pdf via `makeDoctorFeePdf`, xlsx via a single-summary workbook). ZIP and aggregate exports remain staff-only (403 for doctors). Empty periods 404, mirroring the payroll slip export. Doctor exports are archived (`reportarchive`, `created_by` = doctor user) but the archive browser stays `adminOnly` — the doctor re-exports rather than browsing archives.

10. **Doctor home is a dedicated dashboard endpoint, not client-side reuse.**
   Add `GET /me/doctor-dashboard` mirroring the payroll `/me/dashboard` pattern: server resolves the doctor from `user.doctor_id`, returns current-period summary + previous-calendar-month summary (for the income comparison chart), recent own transactions, and recent own audit entries. Alternatives considered: computing month-over-month on the client from two `/me/doctor-fees/:period` calls, or reusing operator `/me/dashboard` — rejected: a single scoped endpoint keeps isolation rules in one place and matches how the operator dashboard already works.

11. **The separate doctor treatment-history page/endpoint is removed as redundant.**
   Client review: the fee page's "Transaksi Saya" table (own rows per period) already answers "what did I treat"; a second page duplicating it added nav clutter. `GET /me/doctor-transactions` and `MyTreatmentHistoryPage` are deleted; the dashboard's recent-rows list covers cross-period browsing. Fee period detail still returns full own-row lists.

12. **Fee recap restyle reuses the payroll CSS classes.**
   `MyPayrollPage` achieves its look via `.payroll-total-card`, `.payroll-total-amount` (2.25rem total) and `.payroll-summary-grid` (5-col, responsive to 2/1) in `styles/app.css`; `MyDoctorFeesPage` currently uses plain stacked markup, so it reads differently. Change: apply the same classes/structure to the fee recap card with doctor labels (Fee Dokter, Fee Behel, Tagihan, Potongan, Pajak). No new CSS or components.

13. **Audit Akun is shared, not duplicated.**
   `AuditLogsPage` with `selfOnly` already calls `/audit-logs/me`, which is role-agnostic and returns rows by `actor_id`. Doctors get the same page/nav entry as operators; no new audit code needed — only route/nav wiring.

## Risks / Trade-offs

- **D1 schema drift** (local dev DBs missing `user.doctor_id`) → all tasks run `d1:migrate:local` first; typecheck/tests exercise the new column only after migration. Add `0004_doctor_user_accounts.sql` migration, applied with the existing `wrangler d1 migrations apply` flow.
- **Missed endpoint leak** (some staff-only data path left open to doctors) → the new 403 scenarios in the two capability specs are written as tests; do a final grep audit over routes with `currentUser`-only guards during implementation.
- **Frontend still referencing removed history endpoint/page** (stale imports, nav entries, or lingering `/me/doctor-transactions` calls) → removal task includes a repo-wide grep for `MyTreatmentHistory`/`/me/doctor-transactions` and a clean build; dashboard recent rows replace the endpoint.
- **Doctor export generation accidentally includes other doctors** → `buildDoctorFeeReport`'s `doctorId` filter must narrow both summaries and per-sheet detail rows; covered by tests asserting a single summary appears in the generated output.
- **Doctor export archive rows** (created by a doctor user) are invisible in the admin-only archive browser → acceptable: archive is for staff artifacts; doctor re-exports on demand. No R2 permission issue: the worker binding writes on the doctor's behalf.
- **Frontend nav/guard regressions** (doctor sees operator items, operator sees doctor items) → centralize role checks in `lib/auth.ts`; the nav refactor replaces booleans with allowlists so no "third role falls through" path remains.
- **ALGORITHM uniqueness surprise for admin UX** (second account for same doctor rejected) → show linked doctor name in the user list and include the doctor picker; 400 messages state the rule.
- **Doctor identity when doctor master is soft-deleted** (deactivated) → keep user row link; detail view shows the stored name; acceptable because historical fees remain meaningful.

## Migration Plan

1. Branch `feature/doctor-fee-self-service` (never pushed to `main` until approved).
2. Add `backend-worker/migrations/0004_doctor_user_accounts.sql`:
   `ALTER TABLE user ADD COLUMN doctor_id INTEGER REFERENCES doctor(id);` + partial unique index on `doctor_id`.
3. Local QA: `npm --prefix backend-worker run d1:migrate:local`, run dev stack (`npm run dev` or compose), create a doctor user via User Management, log in as the doctor with a qa profile and verify the self-service page + 403s (curl the blocked endpoints).
4. Merge to `main` only after review → Cloudflare Workers Git integration runs `d1:migrate:remote` + `deploy` (see `backend-worker/README.md` CI/CD), Pages deploys the frontend. The Worker `currentUser` re-reads per request, so existing sessions need no invalidation.
5. Rollback: revert the merge (Worker deploy is an atomic version bump; D1 migration is forward-only). If a rollback must remove the column, ship a follow-up migration `ALTER TABLE user DROP COLUMN doctor_id` (supported in current D1/SQLite); no data loss beyond the link column.

## Open Questions

- Username convention for doctor accounts and how initial passwords are delivered to doctors (ops detail; admin creates accounts in UI).
- Whether the doctor's treatment-history page should also offer row-level fee figures (e.g., fee per transaction) or only the clinical/patient fields — frontend detail that can be settled during implementation without changing the specs.
