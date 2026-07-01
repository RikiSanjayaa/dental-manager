# Cloudflare Native Migration

This branch introduces the Cloudflare-native backend rewrite under `backend-worker/`.

## What Is Implemented

- Cloudflare Worker app using Hono.
- Wrangler configuration with D1 and R2 bindings.
- D1 schema migration covering the existing FastAPI/SQLModel tables.
- SQLite-to-D1 SQL export script.
- JWT-compatible auth flow with WebCrypto HS256 signing.
- bcrypt-compatible password verification through `bcryptjs`.
- Default seed bootstrap for admin user, rules, and report clinic setting.
- Auth endpoints:
  - `POST /auth/login`
  - `GET /auth/me`
  - `POST /auth/logout`
- Initial master/settings/dashboard/report-archive endpoints.
- R2-backed report archive download/delete/list.
- Scheduled cleanup for expired report archives.
- TypeScript calculation parity helpers for attendance, doctor fee transactions, and payroll records.
- Unit tests for the calculation helpers.

## Remaining Parity Work

- Port full treatment history endpoints.
- Port fee dokter period calculate, summary, overview, lock, and unlock workflows.
- Port attendance import, CRUD, protest, payroll summary, payroll calculate, lock, and unlock workflows.
- Replace report stubs with Worker-compatible XLSX/PDF/ZIP generation.
- Implement XLSX import preview/commit through Worker-compatible parsing.
- Add API parity tests that run the FastAPI backend and Worker backend against identical seed data.

## Local Commands

```powershell
npm --prefix backend-worker install
npm run worker:typecheck
npm run worker:test
npm run d1:migrate:local
npm run d1:export-sqlite -- --db data/dental_manager.db --out data/d1-export.sql
npm run dev:worker
```

## Cutover Notes

Do not route production traffic to the Worker until the remaining parity work is complete. The existing FastAPI backend should remain the source of truth while this branch reaches endpoint and report parity.
