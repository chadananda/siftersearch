# api/workers — Long-running PM2 process entry points

Each file is a PM2 entry point; they run independently of the API and survive API restarts/deploys.

## Live
- `unified-worker.js` — **`siftersearch-worker`** (the single writer; hosts the `/write` API on :7849). Runs ALL sync/maintenance cycles: base Meili sync (`synced=0`), HyPE sidecar sync (`enhanced_synced=0`), entity-mentions sync (`em_synced=0`), alias sync, WAL checkpoint, job/email/backup. The mass-diff reconcile cycles are gated OFF by `SYNC_RECONCILE`.
- `deep-research-worker.js` — `siftersearch-deep-research`.
- `db-worker.js` — `siftersearch-db` (defined in ecosystem but currently NOT running; the worker above owns the write connection).

## Dead / retired
- `sync-processor.js` — **DEAD duplicate** of unified-worker's sync logic; NOT referenced by ecosystem.config.cjs. Do not use.
- `graph-extractor.js` / `graph-validator.js` / `graph-resolver.js` / `graph-promoter.js` — **RETIRED 2026-07-10** (pm2-stopped). The legacy always-on entity pipeline: extracted entities from `content WHERE graph_enriched=0` — i.e. from UN-disambiguated raw text, violating the disambiguation-first invariant. Superseded by the per-book, gated pipeline (`scripts/entity-read/*` driven by `api/lib/pipeline/`, design: `docs/architecture/unified-enrichment-pipeline.md`). Left in the tree for reference; do not restart.
- `job-processor.js` — generic processor used by unified-worker.

Note: the old HyPE/disambiguation enrichment workers were `scripts/run-enrichment*.js` (PM2 `siftersearch-enrichment` / `-enrichment-api`), also RETIRED 2026-07-10 (they wrote old newline-joined HyPE + their own disambiguation on raw text).

## Pattern
Each worker: loads env → runs migrations on boot (defensive) → `workerLoop()` with idle-sleep → SIGTERM-graceful → auto-starts only under the `isMain` guard (so tests can `import` without firing the loop).
