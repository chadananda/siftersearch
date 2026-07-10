# Content Pipeline

The autonomous flow from "user adds a file to Dropbox" to "content searchable with all enrichment layers."

> **As of 2026-07-10 — enrichment is now a single gated pipeline, not six always-on pollers.**
> The old always-on enrichment/entity workers (`siftersearch-enrichment`, `siftersearch-enrichment-api`,
> and the four `siftersearch-graph-*` workers) have been **pm2-stopped and retired**. They scanned raw
> `content` on their own flags and wrote OLD-format HyPE (questions newline-joined) plus their own
> disambiguation — with no ordering, so entities were extracted from un-disambiguated text. They are
> replaced by **one ordered, idempotent, gated orchestrator** driven by a `doc_pipeline` state table
> (migration 89), enforcing **DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE** per document, per book, in
> authority order (GPB → DB → ROB → history). The **INGESTION** half described below
> (library-watcher → ingester → indexer/embedding → worker sync) is **unchanged and still current**.
> Full design: [architecture/unified-enrichment-pipeline.md](architecture/unified-enrichment-pipeline.md).
> The sections below marked *(retired 2026-07-10)* describe the old enrichment flow and are kept for
> historical context.

## The contract

You drop content into `~/Dropbox/Ocean2.0 Supplemental/...` (or wherever the library root resolves on tower-nas). Within a few minutes, the file is parsed, indexed, and searchable. Over the following hours/days, enrichment layers run progressively without intervention — each layer surfaces in search as it completes.

You should never need to remember to "restart the enrichment" or "trigger a sync." Every component runs under PM2 with autorestart, and the auto-updater redeploys without disrupting them.

## Components (all under PM2)

```
┌─────────────────────┐
│   Dropbox folder    │  user adds a file
└──────────┬──────────┘
           │ chokidar fs watch
           ▼
┌─────────────────────────────────────────────────────────────┐
│  siftersearch-library-watcher                                │
│  ─────────────────────────────                               │
│  scripts/index-library.js --watch                            │
│  • detects file add/modify/delete with 10s batch window      │
│  • parses (markdown/PDF/etc), segments, extracts metadata    │
│  • writes to SQLite content table (context=NULL,             │
│    hyp_questions=NULL on new paragraphs)                     │
│  • writes to docs table                                      │
└──────────┬──────────────────────────────────────────────────┘
           │ SQLite content rows with context=NULL, embedding=NULL
           ▼
┌─────────────────────────────────────────────────────────────┐
│  siftersearch-worker (unified)                               │
│  ────────────────────────────                                │
│  api/workers/unified-worker.js                               │
│  • main Meili sync (paragraphs index + embeddings)           │
│  • runHypeSyncCycle every 60s — drains paragraphs with        │
│    enhanced_synced=0 + hyp_questions IS NOT NULL into the    │
│    hype_questions sidecar Meili index                        │
│  • cleanup, full-sync verification, job processing           │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼   (paragraphs now searchable in main index)
           │
           │ Then, on release (enabled=1), the gated orchestrator enriches per BOOK:
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Unified enrichment pipeline (gated orchestrator)            │
│  ─────────────────────────────────────────────              │
│  api/lib/pipeline/{state,profile,orchestrator}.js            │
│  scripts/pipeline/{pipeline.mjs, run-pipeline.mjs}           │
│  • doc_pipeline table (migration 89) = per-doc pipeline STATE│
│  • order enforced in code: DISAMBIGUATE → {HyPE ∥ EXTRACT}   │
│    → RECONCILE (assertDisambiguated precondition — entities  │
│    are NEVER extracted from un-disambiguated text)           │
│  • per-BOOK stages, authority order (GPB→DB→ROB→history),    │
│    cumulative on the prior books' entity seed                │
│  • disambiguate-book.mjs → hype-book.mjs;                    │
│    build-mentions.mjs → extract-claims-v2.mjs                │
│  • DeepSeek v4-flash (bulk) / v4-pro (flagship+doctrinal),   │
│    prefix-cache-friendly; idempotent + resumable via state   │
│  • HyPE stored as JSON array content.hyp_questions +         │
│    content.hyp_thesis (new format); writes SQLite, enhanced_ │
│    synced=0 for the changed rows                             │
└──────────┬──────────────────────────────────────────────────┘
           │ context + hyp_questions (JSON array) + thesis → SQLite
           ▼
        (cycles back to siftersearch-worker → HyPE sidecar Meili index)

           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Search-time merge (api/lib/search.js → multiIndexSearch)   │
│  • paragraphs index (text + context + paragraph embedding)   │
│  • hype_questions sidecar (semantic match against questions) │
│  • [future] entities sidecar, summaries sidecar, etc.        │
│  • RRF aggregation by paragraph_id with per-layer weights    │
└─────────────────────────────────────────────────────────────┘
```

## External dependencies

| Component | Where | What |
|---|---|---|
| Meilisearch | tower-nas localhost:7700 | Search indexes (paragraphs, documents, hype_questions, +future) |
| DeepSeek API | api.deepseek.com | v4-flash (bulk) / v4-pro (flagship+doctrinal) for disambiguation, HyPE, extraction |
| boss vLLM | http://boss:49804/v1 | Local LLM for highest-volume bulk enrichment via prefix-cache (optional path) |
| OpenAI embeddings API | api.openai.com | Embeddings for paragraphs and HyPE questions |
| Dropbox sync | systemd user service | Mirrors files from Dropbox into `/tank/dropbox/` |

## Failure modes and recovery

**Library watcher dies** → PM2 autorestart. State is in SQLite + filesystem; resume on restart picks up un-ingested files.

**Enrichment orchestrator dies (any cause)** → resumable from the `doc_pipeline` state table. Each stage is idempotent + version-keyed; a completed stage at the current version is never re-run, and a failed doc is stamped `error` (never infinite-retried, never blocks the queue). No work lost. (Since 2026-07-10 the pipeline is run via `scripts/pipeline/run-pipeline.mjs` — manual through the seed phase, then priority-processing, then auto-release — not an always-on PM2 poller.)

**DeepSeek unreachable** → the running stage fails and stamps the doc `error`; the orchestrator continues to the next runnable doc. When DeepSeek is back, the errored docs are re-picked in priority order.

**Meili down or busy** → worker syncs queue up; once Meili is responsive, queue drains. Library-watcher ingest writes to SQLite first (always succeeds); Meili sync is decoupled. Generation is decoupled from indexing — no mass `enhanced_synced=0` resets.

**OpenAI down** → HyPE sidecar sync stalls (embeddings fail). The sync function returns `errors: rows.length` and waits. Disambiguation + HyPE generation continues (those use DeepSeek, not OpenAI). When OpenAI is back, sync drains the backlog.

## Adding a new enrichment layer

Enrichment stages now live under `api/lib/pipeline/stages/` and are dispatched by the orchestrator in the fixed order (a new stage declares its precondition, e.g. `assertDisambiguated`). The Meili-sync half of a new layer is still purely additive:

1. **Schema** — add nullable columns via a numbered migration in `api/lib/migrations/`
2. **Stage** — add a stage under `api/lib/pipeline/stages/` with an explicit precondition, wired into the orchestrator's ordered switch (never a competing standalone poller)
3. **Sidecar Meili index** — add the index in `api/lib/search/scope.js` (`INDEXES`), with searchable + filterable + embedder settings
4. **Sync** — add a `sync*Batch()` in `api/lib/search/` (mirror of `syncHypeBatch`)
5. **Periodic call** — add to the worker's incremental sync cycle in `api/workers/unified-worker.js`
6. **Search merge** — add a parallel branch in `multiIndexSearch()` with appropriate RRF weight
7. **Document the layer's purpose** here

No re-embedding of existing paragraphs. No changes to the main paragraphs index. Each layer is decoupled.

## Backups

Daily backup runs from the unified worker (`runBackup` in `api/lib/backup.js`). Three components, each backed up independently to `BACKUP_DIR` (set via env, defaults to `/tank/backups/siftersearch/` on tower-nas):

| Source | Destination | Method | Why |
|---|---|---|---|
| `data/sifter.db` (content + chat + sessions) | `sifter-YYYY-MM-DD.db` | `sqlite3 .backup` | atomic snapshot of WAL DB |
| `/fast/meilisearch-data` (search index) | `meilisearch/` | incremental rsync | fast disaster recovery if NVMe pool fails |
| `data/embedding_cache.db` | `embedding_cache-YYYY-MM-DD.db` | `sqlite3 .backup` | preserves OpenAI-cost embeddings |

Retention: 7 days (configurable via `config.backup.localRetentionDays`). Old daily SQLite + embedding cache files are pruned. Meilisearch backup is mirror-style (`rsync --delete`) so it always reflects today's index state.

`/tank` is a 20TB ZFS pool with auto-snapshots (daily/weekly/monthly per `/etc/cron.d/zfs-auto-snapshot`), so the rsync target also gets point-in-time rollback for free.

**Testing recovery:** to restore Meilisearch from `/tank` after an `/fast` failure:
```bash
systemctl --user stop meilisearch
rsync -aH --delete /tank/backups/siftersearch/meilisearch/ /fast/meilisearch-data/
# Ensure VERSION file (Meili 1.41 requires it):
echo "1.41.0" > /fast/meilisearch-data/VERSION
systemctl --user start meilisearch
```

## Operational checks

```bash
# Ingestion processes should be online (the six enrichment/entity workers are retired as of 2026-07-10)
ssh chad@tower-nas 'pm2 list'

# Pipeline state (per-doc, corpus-wide) — the single source of truth for enrichment progress
ssh chad@tower-nas 'cd ~/sifter/siftersearch && node scripts/pipeline/pipeline.mjs status'

# Enrichment progress (paragraph-level, still valid)
ssh chad@tower-nas 'sqlite3 ~/sifter/siftersearch/data/sifter.db "SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN context IS NOT NULL THEN 1 ELSE 0 END) AS with_context,
  SUM(CASE WHEN hyp_questions IS NOT NULL THEN 1 ELSE 0 END) AS with_hype
FROM content WHERE deleted_at IS NULL"'

# HyPE sidecar coverage
ssh chad@tower-nas 'curl -s -H "Authorization: Bearer $MEILI_KEY" http://localhost:7700/indexes/hype_questions/stats'

# Library watcher most recent ingest
ssh chad@tower-nas 'tail -20 ~/sifter/siftersearch/logs/library-watcher-out.log'
```
