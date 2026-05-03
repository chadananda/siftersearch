# scripts — CLI tools, deploy hooks, ingestion drivers

Heterogeneous: actively-used pipeline drivers, one-off migration tools,
and `wip/` experimental scripts.

## Actively-used (referenced by package.json or PM2)
- `index-library.js` — `siftersearch-library-watcher` PM2 entry. Wraps `api/services/library-watcher.js`. Used by `npm run index:watch`.
- `sites-ingest.mjs` — manual sites ingester driver. `node scripts/sites-ingest.mjs --site oceanlibrary.com [--force] [--limit N]`.
- `dev.js` — `npm run dev`. Spawns API + Astro dev server.
- `preflight.js` — env-check before dev/start.
- `migrate.js` — `npm run migrate`. Calls runMigrations.
- `bump-version.js` — semver bump (used by pre-commit hook).
- `generate-changelog.js` — generates `src/lib/changelog.json` from `git log` (run by `prebuild`).
- `deploy.js`, `deploy-hooks.js`, `install-hooks.js` — deploy + git hook installers.
- `health-check.mjs` — single-pass operational probe (PM2, ports, paragraph counts, etc.).
- `watchdog.js` — checks PM2 process health, restarts stuck workers.
- `setup-systemd.js`, `setup-tunnel.js`, `tunnel.js` — server setup.

## Maintenance / one-off (root)
- `truncate-embeddings.js`, `regenerate-embeddings.js` — embedding model migration.
- `resegment-oversized.js` — re-segment paragraphs that exceed embedder context.
- `fix-corrupt-descriptions.js` — clean up legacy corrupt frontmatter.
- `sync-frontmatter-metadata.js`, `sync-meili.js`, `sync-library-nodes.js`, `sync-metadata.js` — full re-sync drivers.
- `run-enhancement.js`, `run-enrichment.js`, `run-backup-once.mjs`, `run-lightrag.js` — pipeline manual triggers.
- `rewrite-descriptions.js`, `scrub-tech-references.js` — content cleanup.
- `segment-document.js`, `segment-calibrate.js` — segmenter manual runs.
- `verify-deployment.js` — post-deploy smoke checks.

## wip/ (experimental, not in package.json)
- 30+ files for diagnostics, batch tests, and abandoned experiments. Treat as throwaway.

## Hooks
- `hooks/` — git hooks installed via `npm run setup:hooks`. The pre-commit hook lives at `.git/hooks/pre-commit` (installed; see CLAUDE.md at repo root for what it does).
