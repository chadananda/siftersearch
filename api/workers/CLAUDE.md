# api/workers — Long-running PM2 processes

Each file is the entry point for one PM2 process. They run independently
of the API and survive API restarts/deploys.

- `sync-processor.js` — `siftersearch-worker` PM2 process. Polls SQLite for `synced=0` content, pushes paragraphs + docs to Meilisearch. Implements per-paragraph `is_duplicate=1` → DELETE-from-Meili and doc-level `duplicate_of != NULL` → full-doc removal. Verified sync (waits for Meili task confirmation). Tested at `tests/api/sync-processor.test.js`.
- `unified-worker.js` — `siftersearch-jobs` PM2 process. Generic job queue: translation jobs, narration, embedding worker, etc. Single-writer DB pattern.
- `job-processor.js` — generic processor used by unified-worker.

## Pattern
Each worker file:
1. Loads env (`.env-secrets`, `.env-public`)
2. Runs migrations on boot (defensive)
3. Enters a `workerLoop()` with idle-sleep when no work
4. Handles SIGTERM gracefully (finish current item, then exit)
5. Auto-starts only when invoked directly (`isMain` guard) so tests can `import` the module without firing the loop.
