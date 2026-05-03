# api — Backend (Fastify, Node.js)

The SifterSearch API. Runs on tower-nas as PM2 processes; exposed publicly
via Cloudflare Tunnel as `api.siftersearch.com`.

## Top-level files
- `index.js` — Fastify entry point. Loads env, runs migrations, mounts routes, starts the listener. Imported by api/server.js for tests.
- `server.js` — Fastify factory used by tests.

## Subdirectories — see each dir's `CLAUDE.md`
- `lib/` — shared utilities, AI services, search, content, model registry, **migrations/** (split), **constants/**.
- `services/` — long-running content services (ingester, library-watcher, segmenter, translation, sites-ingester, indexer, **site-adapters/**).
- `routes/` — Fastify HTTP route registrations.
- `agents/` — AI agent classes (legacy; mostly superseded by lib/jafar-pipeline.js).
- `workers/` — PM2 worker entry points (sync-processor, unified-worker).

## PM2 processes (production)
- `siftersearch-api` — entry: api/index.js. Read-only DB.
- `siftersearch-worker` — entry: api/workers/sync-processor.js. Single-writer SQLite.
- `siftersearch-library-watcher` — entry: scripts/index-library.js --watch (uses api/services/library-watcher.js).
- `siftersearch-enrichment` — local Qwen disambig + HyPE.
- `siftersearch-enrichment-api` — Sonnet batch API path.
- `siftersearch-updater` — git pull + restart loop.

## Architectural invariants
- One canonical SQLite at `~/sifter/siftersearch/data/sifter.db`. WAL mode, 512MB cache. **Single writer rule** — only the worker + watcher process write; the API is read-only. Tests use better-sqlite3 in-memory.
- Religion-root whitelist: only directories containing `.religion/meta.yaml` can have files ingested by the watcher. See `api/services/library-watcher.js`.
- External-source content lives under `<library>/-sites/<id>/` with config in `<library>/-sites/sites.yaml`. Default lives in repo at `config/sites.example.yaml`. See `docs/sites-integration.md`.
- Embedding model: `text-embedding-3-large` @ 512 dims (MRL-compressed). All embeddings in the DB are this geometry. **Do NOT mix dims in the same index.** See `api/lib/text-normalize.js` for the canonical paragraph-normalization regex.

## Refactor status (2026-05)
- See `docs/refactor.md` for goals + methodology.
- See `docs/refactor.md` "Status" appendix for what's been split + what's deferred.
- Mega-files explicitly NOT split this pass: `lib/search.js` (2,000), `lib/jafar-pipeline.js` (1,193), `services/ingester.js` (2,143), `services/segmenter.js` (3,850), `services/translation.js` (2,652), `routes/admin.js` (3,910), `routes/library.js` (3,860). Each marked in their dir CLAUDE.md.
