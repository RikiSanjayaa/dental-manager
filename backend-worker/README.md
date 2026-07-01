# Dental Manager Worker Backend

Cloudflare-native backend rewrite for Dental Manager.

## Architecture

- Runtime: Cloudflare Workers + Hono.
- Database: Cloudflare D1, schema in `migrations/`.
- File storage: R2 buckets for uploads and report archives.
- Auth: existing JWT API shape, HS256 via WebCrypto, bcrypt-compatible hashes via `bcryptjs`.
- Existing FastAPI backend remains in `backend/` as the parity reference until cutover.

## Local Development

```powershell
npm --prefix backend-worker install
npm run d1:migrate:local
npm run dev:worker
```

The Worker exposes the same API prefix expected by the frontend when routed under `/api`.

## Data Migration

Export current SQLite data into D1-compatible SQL:

```powershell
npm run d1:export-sqlite -- --db data/dental_manager.db --out data/d1-export.sql
```

Apply schema first, then import the generated SQL with Wrangler:

```powershell
npm run d1:migrate:local
npx wrangler d1 execute dental-manager --local --file data/d1-export.sql --cwd backend-worker
```

For production, replace `--local` with `--remote` after setting the real D1 `database_id`.

## Current Parity Status

Implemented:

- Health check and default seed bootstrap.
- Auth login, me, logout.
- Master data CRUD for users, employees, doctors, treatments.
- Settings read/write for report identity and list endpoints for rules/holidays.
- Admin dashboard aggregate endpoint.
- Report archive list/download/delete with R2.
- Scheduled cleanup for expired report archives.

Remaining:

- Full treatment/fee/attendance/payroll workflow endpoints.
- XLSX/PDF/ZIP generation and import previews in Worker-compatible libraries.
- API parity tests against FastAPI.
