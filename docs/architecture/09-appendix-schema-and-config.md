# 09 — Appendix: Schema & Configuration Reference

This appendix is the recreatable reference: the tables that define the system, the Meilisearch
indexes, the model/provider layer, and the configuration knobs. Column lists are the meaningful
subset; consult `api/lib/migrations/` for the exact, current DDL (the schema is built by numbered
migrations `v1-v25.js`, `v26-v45.js`, `v46-v58.js`, and later files, dispatched by `runner.js`).

> **One standing correction.** Stored embeddings are **512 dimensions** (Matryoshka-truncated from
> `text-embedding-3-large`'s native 3072). Any reference to "3072-dim stored vectors" describes the
> model's raw output, not what the database holds. All indexes are 512-dim. Do not mix dimensions in
> one index.

---

## The content store

### `docs` — one row per document

| Column | Purpose |
|---|---|
| `id` | PK |
| `file_path` (UNIQUE) | Canonical identifier; relative path in the library tree |
| `file_hash` | SHA-256 of the whole file — detects any change |
| `body_hash` | SHA-256 of body only — distinguishes content change from metadata edit; detects rename |
| `body_hash_normalized` | Normalized-body hash — duplicate detection |
| `title`, `author`, `language`, `year`, `description`, `metadata` (JSON) | Document metadata |
| `religion`, `collection` | Library taxonomy (from path, or frontmatter fallback) |
| `authority` | Ranking weight (primary scripture high → popular low) |
| `encumbered` | Usage/copyright restriction flag |
| `scope` | `primary` \| `supplemental` \| `site-only` (three-class external-site model) |
| `source_site`, `source_url`, `external_id` | External-source provenance; `source_url` builds citation deep-links |
| `duplicate_of` → `docs(id)` | Supersession (canonical trumps local copy) |
| `original_doc_id` | Translation pairing / re-ingest tracking |
| `deleted_at` | Soft-delete timestamp (NULL = active) |
| `paragraph_count`, `slug`, `file_mtime`, `auto_segmented`, `purchase_url` | Display / lifecycle |
| `doc_priority` | Enrichment tier selection |
| `created_at`, `updated_at` | Audit |

Key indexes: `author`, `religion`, `collection`, `language`, `source_site`, `duplicate_of`,
`scope`, priority-active.

### `content` — one row per paragraph (the atomic unit)

| Column | Purpose |
|---|---|
| `id` | PK |
| `doc_id` → `docs(id)` ON DELETE CASCADE | Parent document |
| `paragraph_index` | 0-based position |
| `text` | Clean paragraph text (no markdown) |
| `heading`, `blocktype` | Section heading; block type (`paragraph`/`heading1..3`/`quote`/`list_item`/`code`) |
| `content_hash` | Hash of exact text — change detection |
| `normalized_hash` | Hash of normalized text — **cross-corpus embedding-reuse key** |
| `embedding` (BLOB), `embedding_model` | 512-dim MRL vector + which model produced it |
| `context`, `context_model` | Disambiguation note ([03](03-disambiguation-and-segmentation.md)) |
| `hyp_questions`, `hyp_thesis` | HyPE questions (**JSON array**, new format as of 2026-07-10) + doctrinal thesis ([04](04-hype.md)). The old newline-joined format is retired (589,926 rows purged). |
| `topic_tags`, `question_types`, `para_meta`, `para_meta_model` | Topical tagging; per-paragraph authorship |
| `translation`, `translation_segments`, `language` | Translation + per-paragraph language |
| `text_grounded`, `embedding_grounded`, `grounding_confidence` | Entity-resolved text + its vector |
| `external_para_id`, `pdf_page`, `block_attrs` | Citation deep-link key; PDF page; block attributes |
| `is_duplicate` | Belongs to a superseded doc → delete from Meili |
| **Dirty flags** `synced`, `enhanced_synced`, `grounded_synced`, `graph_enriched` | Independent per-projection convergence bits ([08](08-operations-and-stability.md)) |
| `deleted_at`, `created_at`, `updated_at` | Lifecycle / audit |

Key indexes: `doc_id`; partial `WHERE synced=0 AND deleted_at IS NULL`; dirty-updated ordering;
`(normalized_hash, doc_id) WHERE deleted_at IS NULL`; HyPE-to-sync; graph-unsynced.

### `doc_pipeline` — per-document enrichment STATE (migration 89, new 2026-07-10)

The single source of truth for the unified enrichment pipeline — a state machine per document,
replacing the scattered per-paragraph flags the six retired workers each scanned. Columns: `doc_id`
(PK), `priority` (lower = earlier: GPB=0, DB=10, ROB=20, history=100), `profile`, `lang`, `enabled`
(release valve: 0 = base-indexed only, 1 = released into enrichment), per-stage `{disambig, hype,
extract, reconcile}_status` + `_version` + `disambig_fp` (content fingerprint), `dirty_paras` (JSON,
partial re-enrich), `cost_tokens`, `error_detail`, `updated_at`. The orchestrator enforces
**DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE** via `assertDisambiguated` preconditions. Index
`(enabled, priority, disambig_status)`. See [unified-enrichment-pipeline.md](unified-enrichment-pipeline.md).

---

## The entity layer

> The new tables below (`entity_mentions_v2`, `entity_claims`, `entity_lookup_keys`) are the current
> entity layer, read via `api/lib/entity-api.js`. The legacy `graph_entities` / `entity_research`
> projection still read-serves the live bio browser (`api/lib/bio.js`) until the reconcile cutover.

### `entity_mentions_v2` — the atoms (name@position)

`id`, `anchor` (UNIQUE hash of source location → idempotent extraction), `doc_id`, `para_id`,
`occurrence`, `surface`, `surface_norm`, **`entity_id` (NULL until resolved)**, `resolved_as`,
`resolution_basis`, `resolution_conf`, `method_version`, `model`, `status` (active/obsolete/disputed),
`created_at`.

### `entity_claims` — cited facts (factoids)

`id`, `claim_hash` (UNIQUE, reword-robust), `entity_id` (nullable — deferred binding), `relation`,
`target_entity_id`, `statement`, **`proof_verbatim`** (exact span, must occur in the cited paragraph),
`doc_id`, `para_id`, `valid_from`/`valid_to`, temporal (`time_value`, `time_precision`, `time_basis`,
`time_anchor`), `rank` (normal/primary/secondary), `status` (supported/disputed/provisional), gates
(`proof_ok`, `subject_ok`, `consistency_ok`), `confidence`, `provenance_tier`, `extractor_version`,
`semantic_key`.

### `entity_decisions` — append-only decision log

`id`, `kind` (merge/split/verify/set/reassign/quarantine/…), `target_kind` (entity/mention/claim),
`target_ids` (JSON), `payload`, `evidence`, `rationale`, `actor`, **`actor_tier`** (3 human > 2
strong > 1 flash > 0 derived), `confidence`, `status` (active/superseded), `supersedes`, `valid_time`,
`decided_at`. The projection is rebuilt from this log; reversal = append a superseding decision.

### `graph_entities` — the projection (current view)

`id`, `name`, `canonical_name`, `entity_type` (person/place/work/group/event/concept), `religion`,
`mention_count`, `doc_count`, `era`, `description`, `source_authority_tier`,
`cross_tradition_candidate`, `book_prominence`, `projection_rev`. UNIQUE `(canonical_name,
entity_type, religion)`.

### `entity_lookup_keys` — transliteration-invariant recall

`id`, `skeleton_key`, `entity_id`, `surface`, `surface_norm`, `is_canonical`, `entity_type`,
`importance`. Recall/suggestion only — never determinative.

### `graph_relations` — entity ↔ entity edges

`id`, `source_entity_id`, `target_entity_id`, `relation_type` (default `co-occurs`), `weight`,
`source_doc_id`, `source_content_id`, `source_authority_tier`. UNIQUE `(source, target, relation_type)`.

---

## Supporting tables

- **`deep_research`** / **`deep_research_quotes`** — hand-curated Q&A sets injected during Jafar's
  research phase (canonical question + embedding, per-tradition analyses, curated passages with
  relevance scores, cost tracking, editorial sections).
- **`translation_cache`** — memoized translations keyed by `sha256(source_text)` (source/target
  lang, translation, JAFAR term analysis, model).
- **`chat_sessions`** / **`chat_messages`** / **`published_conversations`** — conversation threads,
  per-round messages, and shareable published dialogs (slug, rounds JSON, scoring, hero image).

---

## Meilisearch indexes

Registry (`api/lib/search/scope.js`, `INDEXES`):

| Index | Projects | Searchable | Notes |
|---|---|---|---|
| `paragraphs` | `content` | `text`, `heading`, `context` + vector | Main hybrid surface |
| `hype_questions` | one row/question | `question_text` + vector | HyPE sidecar; RRF weight ~1.5 |
| `documents` | `docs` | `title`, `author`, `description` | Catalog lookup |
| `deep_research` | curated sets | question/summary/Q&A | Pre-computed answers |
| `entity_mentions_idx` | mentions | surface forms, entity name | Entity-aware retrieval |
| `siftersearch_{prefix}_paragraphs` | per-site content | as `paragraphs` | Walled-off `site-only` indexes |

Common filterable attributes on `paragraphs`: `religion`, `collection`, `language`, `author`,
`doc_id`, `topic_tags`, `question_types`, `is_duplicate`, `scope`, `source_site`. Ranking blends
authority tier + hybrid BM25/vector at a per-tradition `semanticRatio`.

**Embedder settings (every vector index):**

```jsonc
{ "embedders": { "default": {
    "source": "userProvided",   // SifterSearch computes vectors; Meili stores/searches
    "dimensions": 512,          // MRL truncation of text-embedding-3-large
    "binaryQuantized": true     // 1 bit/dim; one-time irreversible re-quantization on enable
} } }
```

Meili launch flags (production): `--max-indexing-threads 8 --max-indexing-memory 96GiB`.

---

## The AI / provider layer

- **`api/lib/ai.js`** — base clients + `createEmbedding` / `chatCompletion`; routes to
  openai / anthropic / deepseek / ollama.
- **`api/lib/ai-services.js`** — `embedOpenAI` (capped/batched, bulletproof — see
  [07](07-embeddings-and-vector-index.md)); semantic tiers; provider dispatch incl. `chatDeepSeek`.
- **`api/lib/model-registry.js`** — `MODEL_REGISTRY` with pricing/capabilities and an `apiModel`
  field mapping logical names → concrete API IDs (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).

**Tiering policy:** DeepSeek (`deepseek-v4-flash`/`-pro`) for heavy parallel **backend** work
(disambiguation, HyPE, extraction); fast **GPT-turbo / Haiku-class** for **user-facing** answers;
local **Qwen-class** (vLLM on `boss`) for highest-volume bulk enrichment via prefix-cache.
(`deepseek-chat`/`reasoner` are deprecated — v4 IDs only.)

**Embeddings:** `text-embedding-3-large`, stored at 512 dims. Billed per input token (dimensions do
not affect cost); `EMBEDDING_BATCH_SIZE = 50`, `MAX_EMBED_CHARS = 8000`, `MAX_BATCH_CHARS = 200000`.

---

## Configuration & deployment

- **Config**: `api/lib/config.js` — `config.library.basePath`, `config.ai.embeddings.{model,dimensions}`,
  `config.ai.{chat,search,doc,embeddings}`, `SYNC_RECONCILE` (reconcile loop toggle, default off).
- **Data**: canonical SQLite at `~/sifter/siftersearch/data/sifter.db` (WAL, 512MB cache,
  single-writer rule — worker + watcher write, API read-only).
- **Meili host/key**: `MEILI_HOST` (localhost:7700), `MEILISEARCH_KEY` / `MEILI_MASTER_KEY`.
- **API auth**: public routes use the `x-api-key` header (not Bearer); keys validated against the
  `api_keys` table.
- **PM2 processes**: `siftersearch-api` (read-only), `siftersearch-worker` (single writer: sync +
  jobs + indexing), `siftersearch-library-watcher`, `siftersearch-updater`, `cloudflared-tunnel`.
  **Retired 2026-07-10** (pm2-stopped): `siftersearch-enrichment` (local Qwen),
  `siftersearch-enrichment-api` (batch API), and `siftersearch-graph-extractor/promoter/resolver/validator`.
  Enrichment now runs as the unified gated pipeline (`api/lib/pipeline/`, run via
  `scripts/pipeline/run-pipeline.mjs`; status/backfill via `scripts/pipeline/pipeline.mjs`) — manual
  through the seed phase, then priority-processing, then auto-release. See
  [unified-enrichment-pipeline.md](unified-enrichment-pipeline.md).
- **Deploy**: backend/scripts → push → updater pulls (~5 min); frontend → pre-commit hook
  (lint → test → bump → build → `wrangler pages deploy`); content → admin API PUT (edge-cache TTL).
- **Ops scripts**: `scripts/siftersearch-meili-stability-check.mjs` (convergence proof),
  `scripts/siftersearch-enable-binary-quant.mjs` (deliberate one-time quantization enable),
  `scripts/health-check.mjs` (single-pass probe; fails fast on mass-reset).
- **Recovery**: restore Meili from the rsync backup — never mass `synced=0` reset.

---

## The whole system in one diagram

```
                          ┌──────────────── tower-nas (origin / data plane) ─────────────────┐
  markdown library ──►    │  library-watcher → ingester → block-parser → segmenter           │
   (religion-root tree)   │        │ (parse, chunk, hash, change-detect)                      │
                          │        ▼                                                          │
                          │   content + docs  ──►  embedding-worker (512-dim, cross-corpus cache)
                          │   (SQLite, source of truth)                                       │
                          │        │                                                          │
                          │        │   unified gated pipeline (one orchestrator, doc_pipeline  │
                          │        │   state, per-book, authority-ordered):                    │
                          │        ├─► disambiguate-book → context (GATE: assertDisambiguated)  │
                          │        ├─► hype-book: HyPE (questions[] + thesis)                   │
                          │        ├─► extract → reconcile: mentions → claims → entities        │
                          │        ▼                                                          │
                          │   unified-worker (single writer, VERIFIED incremental sync)        │
                          │        ▼                                                          │
                          │   Meilisearch: paragraphs · hype_questions · documents · …        │
                          │        ▲                                                          │
                          │   Fastify API  ◄── search: hybrid + RRF + federation + rerank      │
                          │        │            bioSearch (entity_claims) · Jafar (3-stage)    │
                          └────────┼──────────────────────────────────────────────────────────┘
                                   │  api.siftersearch.com (Cloudflare Tunnel)
                                   ▼
                    Cloudflare Pages/Workers (edge) ──► siftersearch.com (users)
```

That is the entire system: a source-of-truth content store, three enrichment layers that make
chunks retrievable and reason-able, regenerable search + knowledge projections, and a retrieval
stack that is fast, authoritative, diverse, and honest — kept that way by convergent pipelines and
measured proof.

← Back to [the overview](README.md).
