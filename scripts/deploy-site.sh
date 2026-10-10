#!/bin/bash
# Deploy the SITE (the siftersearch Worker: Astro SSR + assets + /api proxy). Explicit — no git hooks (Chad 10-10: "get rid
# of any pre-commit hooks … we have our own pipeline"). The pipeline:
#   1. change code, run the tests you need (npm test)
#   2. npm run deploy            ← this script: bump the version (baked into the client), build, wrangler deploy
#   3. git commit -am "…"        ← includes package.json + src/lib/changelog.json from step 2
#   4. git push                  ← tower's siftersearch-updater pulls and reloads the API (zero-downtime, cluster mode)
# API-only changes skip step 2. Nothing here commits or pushes.
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null 2>&1 || export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
DEPLOY_SECRET=$(grep -h '^DEPLOY_SECRET=' .env-secrets 2>/dev/null | head -1 | cut -d= -f2-)
NEW_VERSION=$(node scripts/bump-version.js patch 2>&1 | tail -1)
echo "[deploy-site] version $NEW_VERSION"
# PUBLIC_API_URL deliberately unset: browser code is same-origin (relative /api/* through the edge proxy)
PUBLIC_DEPLOY_SECRET="$DEPLOY_SECRET" npm run build
node scripts/generate-changelog.js > /dev/null 2>&1 || true
bash scripts/deploy-worker.sh
echo "[deploy-site] deployed $NEW_VERSION — now commit (package.json + src/lib/changelog.json are part of it) and push"
