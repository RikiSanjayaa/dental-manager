#!/bin/sh
set -eu

PERSIST=/data/wrangler
mkdir -p "$PERSIST"

npx wrangler d1 migrations apply dental-manager --local --persist-to "$PERSIST"

exec npx wrangler dev --local --ip 0.0.0.0 --port 8787 --persist-to "$PERSIST" \
  --var "APP_ENV:${APP_ENV:-production}" \
  --var "SECRET_KEY:${SECRET_KEY:-change-me-in-production}" \
  --var "ADMIN_USERNAME:${ADMIN_USERNAME:-admin}" \
  --var "ADMIN_PASSWORD:${ADMIN_PASSWORD:-admin12345}" \
  --var "CORS_ORIGINS:${CORS_ORIGINS:-http://localhost:8090}" \
  --show-interactive-dev-session=false
