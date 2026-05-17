# api/workers — Long-running PM2 processes

Each file is the entry point for one PM2 process. They run independently
of the API and survive API restarts/deploys.

- `sync-processor.js` — `siftersearch-worker` PM2 process. Polls SQLite for `synced=0` content, pushes paragraphs + docs to Meilisearch. Implements per-paragraph `is_duplicate=1` → DELETE-from-Meili and doc-level `duplicate_of != NULL` → full-doc removal. Verified sync (waits for Meili task confirmation). Tested at `tests/api/sync-processor.test.js`.
- `unified-worker.js` — `siftersearch-jobs` PM2 process. Generic job queue: translation jobs, narration, embedding worker, etc. Single-writer DB pattern.
- `job-processor.js` — generic processor used by unified-worker.
- `graph-extractor.js` — `siftersearch-graph-extractor` PM2 process. Reads `content WHERE graph_enriched=0`, calls DeepSeek (deepseek-chat) with extract-v1 JSON schema prompt, writes `paragraph_extractions`. 16 concurrent calls. Budget-gated via `entity-cost-tracker.js`. Disabled by default (requires DEEPSEEK_API_KEY + migration 72).
- `graph-validator.js` — `siftersearch-graph-validator` PM2 process. Validates unvalidated `paragraph_extractions` using Haiku QA, writes `extraction_validations` with recommended_action: accept|reextract|arbitrate.
- `graph-resolver.js` — `siftersearch-graph-resolver` PM2 process. Reads accepted extractions, resolves entity mentions, writes `entity_mentions`/`paragraph_roles`/`quote_instances`, generates grounded embeddings, marks `resolved=1`.
- `graph-promoter.js` — `siftersearch-graph-promoter` PM2 process. Multi-model voting (deepseek-chat + haiku + sonnet) to resolve `promotion_queue` surfaces into `graph_entities`; writes `er_audit_log`.

## Pattern
Each worker file:
1. Loads env (`.env-secrets`, `.env-public`)
2. Runs migrations on boot (defensive)
3. Enters a `workerLoop()` with idle-sleep when no work
4. Handles SIGTERM gracefully (finish current item, then exit)
5. Auto-starts only when invoked directly (`isMain` guard) so tests can `import` the module without firing the loop.
