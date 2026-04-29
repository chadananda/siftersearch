# Content Pipeline

The autonomous flow from "user adds a file to Dropbox" to "content searchable with all enrichment layers."

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
           │ Concurrently:
           ▼
┌─────────────────────────────────────────────────────────────┐
│  siftersearch-enrichment                                     │
│  ───────────────────────                                     │
│  scripts/run-enrichment.js --resume                          │
│  • iterates documents in priority order (highest authority   │
│    first — Bahá'í primary corpus, then others)               │
│  • for each paragraph still NULL on context: disambiguation  │
│    via local LLM on boss (sliding-window with KV cache reuse)│
│  • for each paragraph with context but NULL hyp_questions:   │
│    HyPE generation via local LLM on boss                     │
│  • writes to SQLite, sets enhanced_synced=0                  │
│  • idempotent + resumable: every run scans from queue start, │
│    fast-skips already-done paragraphs                        │
└──────────┬──────────────────────────────────────────────────┘
           │ context + hyp_questions written to SQLite
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
| boss vLLM | http://boss:49804/v1 | Local LLM for disambiguation + HyPE generation |
| OpenAI embeddings API | api.openai.com | Embeddings for paragraphs and HyPE questions |
| Dropbox sync | systemd user service | Mirrors files from Dropbox into `/tank/dropbox/` |

## Failure modes and recovery

**Library watcher dies** → PM2 autorestart. State is in SQLite + filesystem; resume on restart picks up un-ingested files.

**Enrichment dies (any cause)** → PM2 autorestart with 10s exponential backoff. Script is idempotent + resumable; every run scans from the queue start and fast-skips completed paragraphs. No work lost.

**Boss vLLM unreachable** → enrichment script hits health-check failure and exits → PM2 backs off and retries. When boss is back, enrichment resumes.

**Meili down or busy** → worker syncs queue up; once Meili is responsive, queue drains. Library-watcher ingest writes to SQLite first (always succeeds); Meili sync is decoupled.

**OpenAI down** → HyPE sidecar sync stalls (embeddings fail). The sync function returns `errors: rows.length` and waits. Disambiguation + HyPE generation continues (those use local vLLM, not OpenAI). When OpenAI is back, sync drains the backlog.

## Adding a new enrichment layer (e.g., entities)

The pattern is purely additive:

1. **Schema** — add nullable columns in `api/lib/migrations.js` (`entities`, `entities_synced` perhaps reusing `enhanced_synced`)
2. **Generator** — extend `scripts/run-enrichment.js` with a third pass that produces entities for each paragraph with context (and entities NULL)
3. **Sidecar Meili index** — add `INDEXES.ENTITIES` in `api/lib/search.js`, with searchable + filterable + embedder settings
4. **Sync** — add `syncEntitiesBatch()` in `api/lib/search.js` (mirror of `syncHypeBatch`)
5. **Periodic call** — add to `runPeriodicTasks()` in `api/workers/unified-worker.js`
6. **Search merge** — add an `entities` parallel branch in `multiIndexSearch()` with appropriate RRF weight
7. **Document the layer's purpose** here

No re-embedding of existing paragraphs. No changes to the main paragraphs index. Each layer is decoupled.

## Operational checks

```bash
# All five processes should be online
ssh chad@tower-nas 'pm2 list'

# Enrichment progress
ssh chad@tower-nas 'sqlite3 ~/sifter/siftersearch/data/sifter.db "SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN context IS NOT NULL THEN 1 ELSE 0 END) AS with_context,
  SUM(CASE WHEN hyp_questions IS NOT NULL THEN 1 ELSE 0 END) AS with_hype
FROM content WHERE deleted_at IS NULL"'

# HyPE sidecar coverage
ssh chad@tower-nas 'curl -s -H "Authorization: Bearer $MEILI_KEY" http://localhost:7700/indexes/hype_questions/stats'

# Library watcher most recent ingest
ssh chad@tower-nas 'tail -20 ~/sifter/siftersearch/logs/library-watcher-out.log'

# Enrichment most recent batch
ssh chad@tower-nas 'tail -20 ~/sifter/siftersearch/logs/enrichment-out.log'
```
