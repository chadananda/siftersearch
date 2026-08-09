#!/bin/bash
# Deploys the site as a single Cloudflare Worker (SSR + assets + /api proxy).
# Replaces the old `wrangler pages deploy` — called by the pre-commit hook and manually.
# Reads CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from .env-secrets.
set -e
cd "$(dirname "$0")/.."

if [ -f .env-secrets ]; then
  set -a
  source .env-secrets
  set +a
fi

if [ ! -d dist/_worker.js ]; then
  echo "dist/_worker.js missing — run 'npm run build' first" >&2
  exit 1
fi

max_retries=3
retry_delay=5
for ((i=1; i<=max_retries; i++)); do
  echo "[deploy-worker] wrangler deploy (attempt $i/$max_retries)..."
  if ./node_modules/.bin/wrangler deploy "$@"; then
    exit 0
  fi
  if [ $i -lt $max_retries ]; then
    echo "[deploy-worker] failed, retrying in ${retry_delay}s..."
    sleep $retry_delay
    retry_delay=$((retry_delay * 2))
  fi
done
echo "[deploy-worker] deploy failed after $max_retries attempts" >&2
exit 1
