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

## Cloudflare Deployment

Login to Cloudflare first:

```powershell
npm --prefix backend-worker exec wrangler login
```

Create the remote resources once:

```powershell
npm run worker:d1:create
npm run worker:r2:create:reports
npm run worker:r2:create:uploads
```

Copy the generated D1 `database_id` into `backend-worker/wrangler.jsonc`, replacing `replace-with-d1-database-id`.

Apply schema and import data:

```powershell
npm run d1:migrate:remote
npm run d1:export-sqlite -- --db data/dental_manager.db --out data/d1-export.sql
npm run d1:import:remote
```

Verify the Worker bundle, then deploy:

```powershell
npm run worker:typecheck
npm run worker:test
npm run worker:deploy:dry-run
npm run worker:deploy
```

If the frontend is already on Cloudflare Pages, keep `VITE_API_BASE_URL` unset or set it to `/api`, then attach the Worker to the same zone with a route like:

```text
your-domain.example/api/*
```

Pages will continue serving the frontend, while `/api/*` is handled by the `dental-manager-api` Worker. The Worker accepts both root API paths (`/auth/login`) and prefixed Pages routes (`/api/auth/login`).

## Current Parity Status

Implemented:

- Health check and default seed bootstrap.
- Auth login, me, logout.
- Master data CRUD for users, employees, doctors, treatments.
- Settings read/write for report identity and list endpoints for rules/holidays.
- Admin dashboard aggregate endpoint.
- Report archive list/download/delete with R2.
- Scheduled cleanup for expired report archives.
- Treatment history, doctor fee, attendance, and payroll workflows.
- XLSX import previews/commits and XLSX/PDF/ZIP report exports.
- R2 archive creation/download/delete for generated reports.

Remaining before cutover:

- Replace the placeholder D1 `database_id` in `wrangler.jsonc`.
- Run a full remote migration/import rehearsal on a staging Cloudflare account.
- Finish API parity tests against FastAPI for the highest-risk workflows.
