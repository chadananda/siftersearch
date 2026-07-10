# SifterSearch Document Storage & Retrieval Architecture

**Version**: 2026-05  
**Current Schema Version**: 71  
**Target Audience**: Senior backend engineers advising on graph layer integration  
**Status**: Production (tower-nas + Cloudflare Pages)

---

## 1. Overview

SifterSearch is a comparative-religion document corpus platform. It ingests documents across 11+ religious traditions (Bahá'í, Christian, Islam, Jewish, Buddhist, Hindu, Zoroastrian, Taoist, Confucian, Sikh, Jain) and serves passage-level search + AI-powered research synthesis.

### Architecture Layers

| Layer | Purpose | Technology |
|-------|---------|-----------|
| **Storage** | Source documents + paragraphs + embeddings | SQLite (tower-nas) `sifter.db` (7.2M paragraphs) |
| **Indexing** | Full-text + vector search | Meilisearch (hybrid BM25 + semantic) |
| **AI Pipeline** | Research orchestration → crafting → reflection | 3-stage Jafar pipeline (gpt-4o + gpt-4o-mini) |
| **Web** | Static + API gateway | Cloudflare Pages + tunnel to api.siftersearch.com |

### Execution Topology

- **API Server** (read-only): `api/index.js` → Fastify listener. Executes search, chat, document read.
- **Worker** (write-only): `api/workers/unified-worker.js` (= PM2 `siftersearch-worker`). Single SQLite writer. Processes Meili/HyPE sync, indexing, and jobs. (`api/workers/sync-processor.js` is a **dead duplicate** — not the live process.)
- **Library Watcher** (write): `scripts/index-library.js --watch`. Watches filesystem for new/deleted documents.
- **Enrichment** (write): the unified gated pipeline (`api/lib/pipeline/`, run via `scripts/pipeline/run-pipeline.mjs`) — **replaced the six always-on enrichment/entity workers on 2026-07-10** (see [architecture/unified-enrichment-pipeline.md](architecture/unified-enrichment-pipeline.md)).
- **PM2 Processes**: The ingestion daemons run persistently on tower-nas.

---

## 2. Database Schema (SQLite)

### Core Content Tables

#### `docs` (≤50K rows)
Master document registry. Authority + encumbered status determined at index time.

| Column | Type | Purpose | Notes |
|--------|------|---------|-------|
| `id` | INTEGER PK | Document unique ID | |
| `title` | TEXT | Full title | Extracted from markdown frontmatter |
| `slug` | TEXT UNIQUE | URL-safe identifier | Used in library routes |
| `filename` | TEXT | Source file path | Relative to library root |
| `file_path` | TEXT | Full path with religion/collection | Enables doc_tier classification via path patterns |
| `author` | TEXT | Attribution | Matched against AUTHOR_AUTHORITY (authority.js) |
| `religion` | TEXT | Tradition | One of: "Bahá'í", "Christian", "Islam", etc. |
| `collection` | TEXT | Subcategory | E.g. "Foundational Texts", "Compilations" |
| `language` | TEXT | Dominant language | Falls back to content.language per-paragraph |
| `year` | INTEGER | Publication year | For sorting/filtering |
| `authority` | INTEGER | 1-10 doctrinal weight | Explicit override; overrides computed authority |
| `encumbered` | BOOLEAN | Copyrighted? | Used to filter results for some users |
| `description` | TEXT | Summary | Used in library catalog UI |
| `created_at` | TEXT | Ingest timestamp | ISO 8601 |
| `deleted_at` | TEXT | Soft-delete marker | Null = active; non-null = hidden |
| `source_site` | TEXT | External origin | E.g. "oceanlibrary.com"; used for authority boost |
| `source_url` | TEXT | Original URL | Paragraph deeplinks appended with `?paraId=` |
| `body_hash_normalized` | TEXT | Dedup fingerprint | Normalized whitespace/punctuation hash |

**Key Indexes:**
- `deleted_at IS NULL` — partial, filters inactive docs in every query
- `religion` — tradition filtering
- `source_site` — OceanLibrary boost (1.4× multiplier in authority reranking)

#### `content` (7.2M rows)
Paragraphs. One row per markdown block (heading, prose, list, etc.).

| Column | Type | Purpose | Notes |
|--------|------|---------|-------|
| `id` | INTEGER PK | Paragraph unique ID | Used as hit ID in Meilisearch |
| `doc_id` | INTEGER FK | Parent document | JOINs to docs for metadata |
| `paragraph_index` | INTEGER | Position in document | 0-based; used for ranged reads, citation URLs |
| `blocktype` | TEXT | markdown element type | "prose", "heading", "list_item", "quote", "code" |
| `heading` | TEXT | If blocktype=heading | For outline construction |
| `text` | TEXT | Paragraph body | Up to ~10K chars; embedded/indexed |
| `context` | TEXT | ~200 words before + after | Indexed for keyword search (BM25) |
| `language` | TEXT | Per-paragraph language | Overrides doc.language if set; null = use doc lang |
| `embedding` | BLOB (float32[3072]) | Vector embedding | text-embedding-3-large @ 512 dims (MRL-compressed) |
| `normalized_hash` | TEXT | Dedup hash (per-paragraph) | Matches against other docs' normalized_hash |
| `synced` | BOOLEAN | In Meilisearch? | 1 = indexed; 0 = pending |
| `enhanced_synced` | BOOLEAN | HyPE enriched? | 1 = questions/thesis indexed; 0 = pending |
| `is_duplicate` | BOOLEAN | Dupe of another doc? | Set by sites-ingester dedupe logic |
| `deleted_at` | TEXT | Soft-delete | Null = active |
| `hyp_questions` | TEXT | Hypothetical questions | **JSON array** of Q's for HyPE sidecar (new format as of 2026-07-10); NULL if not enriched. The old newline-joined format is retired — 589,926 old rows were purged corpus-wide. |
| `hyp_thesis` | TEXT | One-line doctrinal claim | Separate thesis (new format); also indexed as virtual question |
| `para_meta` | JSON | Paragraph-level metadata | `{author, is_attribution_line, ...}` — used for compilation authority override |
| `external_para_id` | TEXT | OceanLibrary paragraph ID | For deeplinks in OL paragraphs |
| `external_id` | TEXT | OceanLibrary doc ID | OL internal reference |
| `created_at` | TEXT | Ingestion timestamp | |
| `updated_at` | TEXT | Last modification | |

**Key Indexes:**
- `idx_content_has_embedding` (partial: `embedding IS NOT NULL`) — finds paragraphs ready to embed
- `idx_content_unsynced` (partial: `synced = 0`) — Meilisearch sync queue
- `idx_content_hype_to_sync` (partial: `enhanced_synced = 0 AND (hyp_questions IS NOT NULL OR hyp_thesis IS NOT NULL)`) — HyPE sync queue; **CRITICAL**: `INDEXED BY idx_content_hype_to_sync` hint required in queries to force planner onto this index (otherwise SQLite chooses `idx_content_deleted_at` and scans 99% of 4M rows, 54s vs 200ms).
- `idx_content_normalized_hash` (partial) — dedup detection
- `(doc_id, paragraph_index)` — canonical lookup for reads + citations

#### `paragraph_embeddings` (optional; currently unused)
Backup embedding storage. Currently **NOT POPULATED**; embeddings live in content.embedding directly.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | |
| `content_id` | INTEGER FK | content.id |
| `embedding` | BLOB | Duplicate of content.embedding |
| `model` | TEXT | Model that generated this embedding |
| `dimensions` | INTEGER | Vector dimensionality (e.g., 3072) |
| `created_at` | TEXT | |

### Enrichment Tables

#### `hype_questions` (Meilisearch index, also stored as `content.hyp_questions`)
Generated hypothetical questions per paragraph. Indexed semantically in Meilisearch for sidecar search.

| Column (in Meilisearch) | Type | Purpose |
|-------------------------|------|---------|
| `id` | TEXT | Composite key: `{paragraph_id}_{question_index}` or `{paragraph_id}_t` (thesis) |
| `paragraph_id` | INTEGER | Back-reference to content.id |
| `doc_id` | INTEGER | For authority reranking |
| `religion` | TEXT | Inherited from parent doc |
| `collection` | TEXT | For filtering |
| `authority` | INTEGER | Live-computed from para_meta.author or doc.author |
| `encumbered` | BOOLEAN | From parent doc |
| `question_text` | TEXT | The hypothetical question (searchable + vector-indexed) |
| `is_thesis` | BOOLEAN | 1 = doctrinal thesis, 0 = generated question |
| `_vectors.default` | float32[3072] | Embedding of question_text |

**Generation Pipeline** (as of 2026-07-10 — HyPE is generated per-book by `hype-book.mjs`, gated behind disambiguation; see [architecture/04-hype.md](architecture/04-hype.md)):
1. Worker (`unified-worker.js`) extracts paragraphs where `enhanced_synced = 0` and `content.hyp_questions IS NOT NULL`.
2. Calls `syncHypeBatch` (search/hype.js).
3. Parses `content.hyp_questions` (**JSON array**, new format) + thesis.
4. Embeds each question separately.
5. Upserts to Meilisearch `hype_questions` index.
6. Marks source paragraph `enhanced_synced = 1`.

#### `deep_research` (research tracking)
Pre-curated authoritative passage sets per canonical question. Auto-queues when a question is asked 2+ times.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | |
| `canonical_question` | TEXT | User's question (normalized) |
| `question_embedding` | BLOB | float32[512] — used for similarity matching |
| `question_hash` | TEXT | SHA256 hash for fast exact-match lookup |
| `slug` | TEXT | URL-safe slug for deep_research routes |
| `status` | TEXT | "pending" → "queued" → "in_progress" → "complete" → "failed" |
| `ask_count` | INTEGER | Times this question was asked |
| `last_asked_at` | TEXT | Most recent query timestamp |
| `sections_json` | JSON | Structured output: `{sections: [{label, quotes: [{para_id, relevance_score, tradition}]}]}` |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### `deep_research_quotes` (curated passages)
Join table mapping deep research records to their cited paragraphs.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | |
| `research_id` | INTEGER FK | deep_research.id |
| `para_id` | INTEGER | content.id |
| `rank` | INTEGER | Ranking within this research (1-N) |
| `tradition` | TEXT | Quoted tradition |
| `authority` | INTEGER | Authority of cited paragraph |
| `relevance_score` | FLOAT | 1-10 relevance to the research question |
| `contextual_note` | TEXT | Why this passage was selected |

#### Graph Tables (partially populated)

##### `graph_entities`
Named entities extracted from documents.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | |
| `name` | TEXT | Raw mention (e.g., "Muhammad") |
| `canonical_name` | TEXT | Normalized form |
| `entity_type` | TEXT | "person", "place", "work", "concept" |
| `religion` | TEXT | Tradition context |
| `language` | TEXT | Original language (e.g., "Arabic") |
| `era` | TEXT | Time period (e.g., "7th century") |
| `description` | TEXT | Brief summary |
| `mention_count` | INTEGER | How many documents mention this |
| `source_doc_ids` | JSON | Array of doc IDs that mention this entity |
| `created_at` | INTEGER | Unix timestamp |
| `UNIQUE(canonical_name, entity_type, religion)` | | Dedup constraint |

##### `graph_relations`
Edges between entities.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | |
| `source_entity_id` | INTEGER FK | graph_entities.id |
| `target_entity_id` | INTEGER FK | graph_entities.id |
| `relation_type` | TEXT | "mentioned_in", "authored", "cited_in", "co-occurs" |
| `source_doc_id` | INTEGER | docs.id where relation was discovered |
| `source_content_id` | INTEGER | content.id containing the relation |
| `created_at` | INTEGER | Unix timestamp |

##### `doc_entities` (legacy)
Per-document entity extraction from the old enrichment workers. **Legacy** — the new entity layer uses `entity_mentions_v2` / `entity_claims` / `entity_lookup_keys` (read-served by `api/lib/entity-api.js`); the legacy `graph_entities` / `entity_research` tables still read-serve the live bio browser (`api/lib/bio.js`) until the reconcile cutover.

**Status**: Exists in schema (migration 50+), populated sporadically by the now-retired enrichment workers. **NOT USED** for retrieval.

---

## 3. Document Ingestion Pipeline

### Overview
Files → Library watcher → Segmenter → Ingester → Meilisearch (base index) → unified enrichment pipeline (disambiguate → HyPE ∥ extract → reconcile) → HyPE sidecar / entity layer / Deep Research

### Step 1: Library Watcher (`api/services/library-watcher.js`)
- Watches `$LIBRARY_PATH/{Religion}/{Collection}/` directories.
- Only directories with `.religion/meta.yaml` are recognized.
- On file change: triggers segmenter for `.md` files.

### Step 2: Segmenter (`api/services/segmenter.js`)
- Parses markdown frontmatter → `docs` row.
- Splits markdown → blocks (headings, prose, lists).
- Normalizes text via `text-normalize.js` (regex removes Markdown, tags, diacritics).
- Computes `normalized_hash` per paragraph.
- **Dedup check**: If `normalized_hash` matches another doc's paragraph, sets `is_duplicate = 1`.
- Writes bulk `content` rows with `synced = 0, enhanced_synced = 0`.

### Step 3: Ingester (`api/services/ingester.js`)
- Reads unsync'd `content` rows.
- Calls embedding API (OpenAI `text-embedding-3-large`, 512 dims via MRL).
- Embeds `text` + `context` (normalized).
- Stores embedding in `content.embedding` (BLOB).
- Marks `synced = 1`.
- Calls Meilisearch to index paragraphs + document metadata.

### Step 4: Enrichment (unified gated pipeline — as of 2026-07-10)
Replaced the six always-on enrichment/entity workers. One ordered, idempotent orchestrator (`api/lib/pipeline/`, run via `scripts/pipeline/run-pipeline.mjs`) processes documents per-BOOK in authority order (GPB → DB → ROB → history), cumulatively, with a `doc_pipeline` state table (migration 89) as the single source of truth.
- Order enforced in code: **DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE** (`assertDisambiguated` precondition — entities are never extracted from un-disambiguated text).
- Disambiguation: `disambiguate-book.mjs`; HyPE: `hype-book.mjs`; extraction: `build-mentions.mjs` → `extract-claims-v2.mjs`.
- Models: DeepSeek v4-flash (bulk) / v4-pro (flagship + doctrinal), prefix-cache-friendly.
- Stores HyPE as a **JSON array** in `content.hyp_questions` + a separate `content.hyp_thesis`.
- Writes SQLite, sets `enhanced_synced = 0` on changed rows; the worker sync cycle indexes incrementally.

See [architecture/unified-enrichment-pipeline.md](architecture/unified-enrichment-pipeline.md) for the full design.

### Step 5: HyPE Sync Worker
- Pulls paragraphs where `enhanced_synced = 0` and (`hyp_questions IS NOT NULL` or `hyp_thesis IS NOT NULL`).
- For each question/thesis: embeds it, inserts to Meilisearch `hype_questions` index.
- Marks `enhanced_synced = 1`.

### Paragraph Segmentation Details
- Splits on markdown heading boundaries (`^##* ` to `^####* `).
- Prose within headings groups into context windows.
- Lists, quotes, code blocks segmented separately.
- Handles Hebrew + Arabic Unicode correctly (via `segmenter-hebrew.js`).

**Normalization** (per `text-normalize.js`):
```
1. Strip markdown (**, ##, -, etc.)
2. Remove diacritics (Arabic tashkeel, Hebrew vowels)
3. Collapse whitespace
4. Lowercase
5. Remove URLs/emails
6. Remove HTML entities
```
Produces fingerprint that matches across translations of the same passage.

---

## 4. Search Infrastructure

### Meilisearch Indexes

#### `paragraphs` (main search index)
All paragraph text + embeddings. Hybrid BM25 + semantic search.

**Searchable Attributes**: `text`, `context`, `heading`, `title`, `author`  
**Filterable Attributes**: `doc_id`, `religion`, `collection`, `language`, `year`, `paragraph_index`, `blocktype`, `author`, `title`, `authority`, `encumbered`, `topic_tags`, `question_types`, `source_site`, `source_url`  
**Sortable Attributes**: `year`, `created_at`, `paragraph_index`, `authority`  
**Ranking Rules** (position 4): `words, typo, proximity, authority:desc, attributeRank, sort, wordPosition, exactness`  
**Embedder**: `userProvided` (3072-dim, MRL-compressed)  

**Authority Reranking**:
```javascript
score = relevance × (1 + boost × (authority - 5) / 5)
// authority=10 → +30% boost (default boost=0.3)
// authority=5 → neutral
// authority=1 → -30% penalty
```
Applied **post-search** via `computeAuthorityScore()` on all results, so live authority.js changes take effect immediately.

#### `hype_questions` (sidecar)
Hypothetical questions per enriched paragraph. Used for semantic question-matching.

**Searchable Attributes**: `question_text`  
**Filterable Attributes**: `paragraph_id`, `doc_id`, `religion`, `collection`, `authority`, `encumbered`, `is_thesis`  
**Hybrid Search**: 85% semantic, 15% keyword (questions are concept-dense).  

#### `documents` (catalog)
Document-level metadata for library browser + doc overview. Denormalized from `docs`.

**Searchable Attributes**: `title`, `author`, `description`  
**Filterable Attributes**: `religion`, `collection`, `language`, `year`, `author`, `authority`, `encumbered`  

#### `deep_research` (research index)
Pre-curated questions + summaries. Indexed for fast canonical-question lookup.

**Searchable Attributes**: `canonical_question`, `key_points`, `summary_text`, `convergence_text`, `section_text`  
**Filterable Attributes**: `topic_tags`, `question_type`, `traditions_covered`, `traditions_agreement`, `status`, `ask_count`, `priority`  
**Sortable Attributes**: `ask_count`, `priority`, `created_at`  

### Core Search Functions

#### `multiIndexSearch(query, options)` (primary user-facing)
Fuses `paragraphs` + `hype_questions` via **Reciprocal Rank Fusion (RRF)**.

**RRF Formula**:
```
score_rrf = Σ(1 / (RRF_K + rank_i))
RRF_K = 60
```
Each paragraph gets a score from:
- Main index rank (BM25 + semantic)
- Best-ranking HyPE question match (if any)

**Diversity Enforcement**:
- Unfiltered queries (no religion/collection filter): cap 1 result per tradition (Bahá'í) + 25% per others.
- Religion-filtered: cap 33% per author (prevents single author from filling all slots).
- Exception: author filter allows full limit per doc (user wants exhaustive coverage).

**Parameters**:
- `limit` — top-K results to return
- `filters` — `{religion, collection, author, documentId, language, yearFrom, yearTo}`
- `semanticRatio` — 0.3 (religion-filtered) or 0.5 (cross-tradition) or custom
- `scope_config` — `{primary: bool, sites: [...]}` — which Meili indexes to query

#### `hybridSearch(query, options)` (foundation for all search)
Single-index keyword + vector search. Called by multiIndexSearch; can be used standalone.

**Flow**:
1. If `semanticRatio > 0`: embed query, get vector.
2. If `isCrossTradition` (no filters, offset=0): run federated per-religion search.
3. Otherwise: single Meili call with `hybrid: {semanticRatio, embedder: 'default'}`.
4. Authority rerank via `rerankByAuthority()`.
5. Slice to `[offset, offset+limit)`.

**Cross-Tradition Dispatch** (when unfiltered):
- Runs 11 sub-queries in `multiSearch()` (one per religion).
- Per-religion limit: `max(2, ceil(limit / 11))`.
- Two-pass dedup: unique titles + unique docs, with overflow queue.
- **Supplementary OL queries**: fetch top 10 OceanLibrary docs per religion, merge before authority rank, apply 1.4× OL boost.

#### `searchHypeQuestions(query, options)` (sidecar search)
Hybrid search restricted to `hype_questions` index.

**Input**: User query (treated as a question).  
**Output**: `{hits: [{paragraph_id, doc_id, religion, question_text, _semanticScore}]}`  
**Semantics**: Questions are HIGH SIGNAL — "designed to answer" vs. topically related.

#### `keywordSearch(query, options)` (fast, no embedding)
Full-text BM25 only. 5-minute TTL cache.

**Flow**:
1. Check `search-cache` in-memory TTL.
2. If cached: return sliced results (pagination).
3. Otherwise: `hybridSearch(..., semanticRatio=0)` fetching top 150.
4. Filter to terms with fuzzy matching (levenshtein, Arabic tashkeel stripping).
5. Rerank by phrase match (exact phrase boost) + authority.
6. Dedup by (doc_id, paragraph_index), text, title, document.
7. Cache full result set.
8. Slice + return.

### Authority System

#### Calculation (`authority.js`)
Priority order:
1. Explicit `docs.authority` field (frontmatter override).
2. Author-based (`AUTHOR_AUTHORITY` map): Bahá'u'lláh→10, 'Abdu'l-Bahá→9, Muhammad→10, Matthew/Mark/Luke/John→10, etc.
3. Title-pattern (`TITLE_AUTHORITY` regexes): "Quran (Pickthall)"→10, "Bible"→10, "Tao Te Ching"→10, etc.
4. Collection-level meta.yaml `authority` field.
5. Religion-level meta.yaml `authority` field.
6. External-site authority floor (`authority_default` in sites.yaml).
7. Global default: **5**.

#### Authority Tiers (by Tier value)
- **10**: Sacred texts (Quran, Bible, primary canonical works)
- **9**: Authoritative secondary (Shoghi Effendi, institutional commentaries)
- **8**: Official collections (Lights of Guidance, Dawn-Breakers)
- **7**: Official secondary
- **6**: Reference-level
- **5**: Published (default, neutral)
- **4**: Historical archives
- **3**: Research papers
- **2**: Commentary + analysis
- **1**: Unofficial

### OceanLibrary Boost
Docs with `source_site = 'oceanlibrary.com'` get 2.0× multiplier in `computeAuthorityScore()`:
```javascript
olMultiplier = isOL ? 2.0 : 1.0
```
Ensures single-book OL editions (Gospel of Matthew) surface alongside composite non-OL Bibles.

---

## 5. Jafar Research Pipeline

Three-stage architecture:

### Stage 1: Research
**System**: Orchestrator LLM (gpt-4o) with retrieval tools.  
**Input**: User message + conversation history.  
**Output**: `retrieved_quotes` array.  
**Constraints**: Must call ≥1 retrieval tool; max 3 rounds (90s budget).

**Tools Available**:
- `search({query, mode})` — passage-level semantic search
- `find_document_for_citation({work_name})` — locate by title
- `read_document_for_question({doc_id, question})` — document subagent
- `library_overview()` — catalog statistics
- `library_count({filters})` — filtered counts

**Routing Logic**:
- Catalog questions ("how many books?", "what traditions?") → `library_overview` (skip search).
- Named works ("Iqán", "Gospel of John") → `find_document_for_citation` → `read_document_for_question`.
- Bahá'í history (Badasht, Shaykh Tabarsi) → **MANDATORY** both `find_document_for_citation("Dawn-Breakers")` AND `find_document_for_citation("God Passes By")`, then `read_document_for_question` on each.
- Doctrine ("justice", "detachment") → `search({mode: "passages", religion: filter})`.
- Political queries (detected) → skip research (crafter redirects).

**Pre-fetch Optimizations**:
- **Catalog**: Detects catalog patterns, pre-fetches `library_overview`, skips LLM loop.
- **Deep Research**: Checks `deep_research` table for pre-curated questions matching user's Q via embedding similarity (threshold 0.78). If ≥3 quotes found, returns immediately.

#### Document Subagent (`answerFromDocument`)
Spawned by research when `read_document_for_question` is called.

**Tools** (scoped to one document):
- `get_outline` — heading structure, preview.
- `search_in_document` — semantic search within doc.
- `read_paragraph_range` — read contiguous paragraphs (cap 150).
- `finish` — return answer + excerpts.

**Strategy**:
- Concept questions ("what does this teach about X?") → search + read context.
- Extraction questions ("who are the people in chapter 2?") → read substantial ranges (not 8-10 paras; use headings to bound sections).
- Reading requests ("show me the opening") → read requested range verbatim.

**Output**: `{answer, excerpts: [{paragraph_index, text, heading, source_url}], subagent_iterations, subagent_elapsed_ms}`

**Multilingual Mode**: Non-English excerpts are auto-translated via `translation-subagent.js` (JAFAR-grounded English translation appended).

### Stage 2: Craft
**System**: Crafter LLM (gpt-4o-mini).  
**Input**: User message, intent classification, retrieved quotes ONLY (no tool history).  
**Output**: `draft_reply` string.  
**Constraints**: Isolated context; no access to prior turns' prose or assistant persona.

**Political Guardrail**: If research detected political query, crafter sees guardrail section with polite redirect template (no research returned).

**Intent-based Routing**:
- `quote_request` → emphasize exact passages, provide sources.
- `definition` → concise explanation grounded in quotes.
- `explain` → narrative synthesis from quoted passages.
- `discuss` → synthesize multiple traditions if available.

### Stage 3: Reflect
**System**: Reflection gate (gpt-4o-mini).  
**Input**: Draft reply + grounding criteria.  
**Output**: `{pass: bool, issues: [...], failed_sentences: [...]}`  
**Retry**: If fail, feed issues back to crafter for one re-attempt. Ship second pass regardless.

**Grounding Criteria**:
1. All factual claims cite sources (no unreferenced assertions).
2. No fabricated quotes.
3. Tone: respectful, non-proselytizing.
4. Passages used in context (not cherry-picked).

### Intent & Entity Classification

**Model**: gpt-4o-mini (fast, one call per query).  
**Output**: `{intent, work_name, topics}`

**Intent Values**: `quote_request | definition | explain | discuss`  
**Work Name**: Canonical scriptural work (null if plural/tradition-wide query). Examples:
- "What does the Iqán say?" → `work_name: "Kitab-i-Iqan"`
- "What do Buddhist texts say?" → `work_name: null`

**Topics**: 1-3 keywords for supplementary passage search.

### Deterministic Research Path

Bypasses LLM orchestrator entirely when entities are extracted. Faster (1-2s vs 5-7s).

**Branch 1**: `work_name` set
- `find_document_for_citation(work_name)` → get top candidate
- `read_document_for_question(doc_id, user_question)`
- PLUS: `search({query: topics, religion: filter})`

**Branch 2**: No work name, cross-tradition
- Per-religion targeted searches (parallel)
- Each returns 5-8 passages

**Dedup Layers**:
- Exact: same (doc_id, paragraph_index)
- Content: normalized text match within religion
- Document: cap 1-2 passages per source doc

---

## 6. Entity & Graph Layer

> **As of 2026-07-10 — much of this section describes the *old* graph tables and a since-superseded plan.**
> The live entity layer now runs on `entity_mentions_v2` / `entity_claims` / `entity_lookup_keys`
> (mention = name@position, cited claims with a verbatim proof span), populated by the unified
> pipeline's extract stage after disambiguation, and read via `api/lib/entity-api.js`. The legacy
> `graph_entities` / `entity_research` tables (and the Meili `entity_mentions_idx`) still read-serve
> the live bio browser (`api/lib/bio.js`) until the reconcile cutover. The legacy graph-extraction
> workers that filled `doc_entities`/`graph_relations` from un-disambiguated text are **retired**.
> For the current schema see [architecture/09-appendix-schema-and-config.md](architecture/09-appendix-schema-and-config.md);
> for the entity design see [architecture/05-entity-knowledge-layer.md](architecture/05-entity-knowledge-layer.md).

### Current State (historical — see note above)

#### `graph_entities` (Populated)
- 15K+ entities extracted from documents via NER.
- Columns: `canonical_name, entity_type, religion, mention_count, era, description, source_doc_ids`.
- **NOT USED for retrieval** — read-only analytics.

#### `graph_relations` (Sparse)
- Edges between entities (mostly empty).
- Columns: `source_entity_id, target_entity_id, relation_type, source_doc_id, source_content_id`.
- **NOT USED** — no semantic graph search path.

#### `doc_entities` (Partial)
- Stores per-document entity extractions during HyPE/Sonnet enrichment.
- Intended to link paragraph → entity mentions.
- **NOT YET USED** — enrichment workers write it sporadically; no retrieval queries read it.

### What's Missing

1. **Entity-paragraph index**: No fast lookup of "which paragraphs mention person X?" — would require reverse index (entity → paragraph_ids).

2. **Co-occurrence scoring**: No graph-based ranking of "paragraphs mentioning both Bahá'u'lláh AND justice" vs. single-entity paragraphs.

3. **Cross-document entity resolution**: `graph_entities.canonical_name` deduplicates within one (canonName, type, religion) tuple, but doesn't handle:
   - Name variants across transliterations ("Muhammad" vs. "Mohammad")
   - Historical spellings evolving over time
   - Compound names split differently by different documents

4. **Relation types**: Only stub values (`co-occurs`). No semantic relations: `author_of`, `cited_in`, `influenced`, `contemporary_with`.

5. **Temporal reasoning**: No time-indexed graph for "what events happened around the 7th century?" — entities have `era` (string) but no structured date range.

### Graph Layer Enhancement Opportunities

**1. Entity-Paragraph Mapping** (Reverse Index)
```sql
CREATE TABLE entity_mentions (
  id INTEGER PK,
  entity_id INTEGER FK graph_entities(id),
  content_id INTEGER FK content(id),
  paragraph_index INTEGER,
  mention_count INTEGER DEFAULT 1,
  context_window TEXT,  -- surrounding text
  PRIMARY KEY (entity_id, content_id, paragraph_index)
);
CREATE INDEX idx_entity_mentions_entity ON entity_mentions(entity_id);
```

**Enables**: `SELECT DISTINCT c.* FROM entity_mentions em JOIN content c ON em.content_id = c.id WHERE em.entity_id = ?` → "all passages mentioning Muhammad".

**2. Semantic Relation Types**
Expand `graph_relations.relation_type` with structured taxonomy:
- `person_authored_work` (Muhammad ← Quran)
- `person_cited_in_passage` (Muhammad mentioned in Christian commentary)
- `event_in_location` (Badasht in Khorasan)
- `concept_discussed_in_work` (Justice in Quran)
- `person_influenced_by` (Bahá'u'lláh influenced by Islamic mysticism)
- `temporal_contemporary` (Two figures living in same era)

**Enables**: Graph traversal queries: "other people influenced by the same sources as Bahá'u'lláh?" → Recommendation engine for serendipitous discovery.

**3. Multi-tradition Name Canonicalization**
Current dedup is per-tradition. Extend to cross-tradition:
```sql
CREATE TABLE entity_aliases (
  canonical_id INTEGER FK graph_entities(id),
  alias_text TEXT,
  language TEXT,  -- Arabic, Persian, English, etc.
  confidence FLOAT,  -- 0.7-1.0; how sure we are
  source_doc_id INTEGER,
  PRIMARY KEY (canonical_id, alias_text)
);
```

**Enables**: Search for "Lao Tzu" returns passages mentioning "Laozi", "Lao-tzu", "Lao Tze".

**4. Entity-based Semantic Search**
Post-processing layer on top of `multiIndexSearch`:
```javascript
// User asks: "What did Bahá'u'lláh say about justice?"
const entity = resolveEntity("Bahá'u'lláh");
const passages = await multiIndexSearch("justice");
const enriched = passages.map(p => ({
  ...p,
  mentions_entity: entityMentions(p.id, entity.id),
  entity_context: extractEntityContext(p.text, entity)
}));
// Sort by: (relevance to "justice") × (strength of entity mention) × (authority)
```

**5. Temporal Indexing**
```sql
ALTER TABLE graph_entities ADD COLUMN era_start INTEGER, era_end INTEGER;
CREATE INDEX idx_entities_era ON graph_entities(era_start, era_end);
```

**Enables**: "All figures who lived during the 7th century CE" → chronological discovery.

**6. Knowledge Graph Visualization API**
Expose sub-graphs for UI rendering:
```
GET /api/v1/graph/{tradition}/{entity_id}
  ?depth=2&relation_types=influenced,cited_in,contemporary
→ {nodes: [...], edges: [...], timeline: [...]}
```

---

## 7. Key Retrieval Functions (Reference)

| Function | File | Mode | Input | Output |
|----------|------|------|-------|--------|
| **multiIndexSearch** | search.js | Main | query, filters, limit | hits (RRF-fused), _layers metadata |
| **hybridSearch** | search.js | Foundational | query, filters, semanticRatio | hits (ranked by authority) |
| **searchHypeQuestions** | search/hype.js | Sidecar | query, filters | HyPE hits (paragraph_ids) |
| **keywordSearch** | search.js | Fast | query, limit | hits (cached, BM25 only) |
| **executeSearch** | routes/chat.js | Wrapper | {query, mode, filters} | passages / documents |
| **answerFromDocument** | document-subagent.js | Subagent | doc_id, question | {answer, excerpts, subagent_answer} |
| **deterministicResearch** | jafar-pipeline.js | Pipeline | entities, userMessage | {retrieved_quotes, subagent_syntheses} |
| **checkDeepResearch** | deep-research.js | Pre-fetch | question | {id, canonical_question, quotes} |
| **getAuthority** | authority.js | Scoring | doc metadata | authority (1-10) |
| **getDocTier** | doc-tier.js | Enrichment | doc metadata | tier (1-9) |

### Search Path Flow

```
User query
    ↓
classifyIntentAndEntities (gpt-4o-mini, 1-2s)
    ↓
deterministicResearch OR runResearchPhase
    ├─ Branch 1 (work_name set): find_doc → read_document_for_question
    ├─ Branch 2 (cross-tradition): per-tradition search (parallel)
    └─ Pre-fetch: checkDeepResearch, library_overview (catalog)
    ↓
[Retrieved quotes]
    ↓
Crafter LLM (gpt-4o-mini, 1-2s)
    ↓
[Draft reply]
    ↓
Reflection gate (gpt-4o-mini, 1-2s)
    ├─ Pass → Ship
    └─ Fail → Crafter retry → Ship
    ↓
Response (3-10s total, depending on retrieval depth)
```

### Authority in Context

Authority is applied at **search result ranking** (post-fetch), not query filtering:

```javascript
// hybridSearch → rerankByAuthority
for (const hit of results) {
  const liveAuth = getAuthority({
    author: hit.author,
    religion: hit.religion,
    collection: hit.collection,
    source_site: hit.source_site,
    title: hit.title
  });
  const authorityScore = rel * olMultiplier * (1 + boost * ((auth - 5) / 5));
  hit._authorityScore = authorityScore;
}
results.sort((a, b) => b._authorityScore - a._authorityScore);
```

This ensures:
- Authority changes (e.g., library meta.yaml update) take effect **immediately** at search time.
- No stale cached authority values in Meilisearch.
- Per-doc authority overrides always respected.

---

## 8. Known Gaps & Enhancement Opportunities

### HyPE Coverage
- **Tier 1-7 docs** (Bahá'í primary, non-English doctrinal): 100% enriched with HyPE questions.
- **Tier 8-9 docs** (secondary, Bahá'í scholarship): ~30% enriched (backlog).
- **Supplementals** (external sites like bahai-library.com): 0% enriched (not routed to enrichment pipeline).

**Gap**: ~3M un-enriched paragraphs in tier 8-9 don't benefit from question-matching boost. Re-enriching with Qwen (tier 8-9) could add 1-2M more HyPE records within budget.

### Graph Layer Missing
- `graph_entities` populated but not connected to retrieval.
- No reverse index (entity → paragraphs).
- `doc_entities` sparsely populated; no dedicated enrichment path.
- **Impact**: Cannot answer "what did tradition X say about Muhammad?" by entity resolution — only keyword search on name variants.

### Deep Research Scope
- ~350 pre-curated research records (complete → indexed in `deep_research`).
- **Gap**: Long-tail questions (asked 1-3 times) never get curation; remain in `pending` state.
- **Opportunity**: Batch curate lowest-effort, high-frequency questions (ask_count ≥5, < 30s research).

### Cross-Tradition Entity Linking
- All name-variant canonicalization is **within a single tradition**.
- E.g., "Jesus" in Christianity and "Isa" in Islam are separate entities.
- **Gap**: No shared Person/Place graph across traditions (would enable "who did Bahá'u'lláh reference from Islam?").

### Document-level Fuzzy Matching
- Dedup is **paragraph-level** (normalized_hash).
- **Gap**: Two complete documents that are near-duplicates (e.g., two editions of the same translation) have separate doc_id, creating authority confusion.
- **Opportunity**: Doc-level fuzzy dedup + versioning (keep both, mark superseded version).

---

## 9. Technical Debt & Known Issues

### Meilisearch Embedder Config
- Critical invariant: all indexes with vectors must use `embedders: {default: {source: 'userProvided', dimensions: 3072}}`.
- **Risk**: Partial PATCH to `/settings` can silently clear embedder config, destroying vector index (week-long re-index to recover).
- **Mitigation**: `initializeIndexes()` verifies embedder config 30s after startup; re-applies if missing.
- **Action**: Always use explicit embedder settings; never use silent-default Meili embedders.

### HyPE Sync Performance
- Prior bug (fixed in migration 61): sync query scanned 99% of 4M-row content table (54s) because index picker chose wrong index.
- **Fix**: Forced `INDEXED BY idx_content_hype_to_sync` hint + partial index (only hyp_questions-bearing rows).
- Now <200ms even at full scale.
- **Lesson**: Partial indexes + explicit hints are critical for 4M+ row tables.

### Authority Reranking vs. Ranking Rules
- Meilisearch ranking rules (BM25 position) are **tiebreakers only** in hybrid search.
- Vector similarity dominates ranking; authority rules have minimal effect in-index.
- **Solution**: Post-fetch authority reranking (what we do) is 10× more effective than trying to tune ranking rules.

### SQLite WAL Mode
- All DBs use WAL (write-ahead logging) + 5s busy timeout.
- Timeout is short (not 30s) because synchronous SQLite blocks event loop; a 30s contention stalls all API requests.
- **Tradeoff**: Short timeout means occasional "database is locked" errors during write-heavy periods.
- **Mitigation**: Single-writer worker process + read-only API minimizes contention.

---

## 10. Architecture Characteristics for Graph Layer Design

### For External Engineer Advising on Graph Integration

**Strengths**:
- Hybrid search (BM25 + vector) is mature; stable for 2+ years.
- Authority system is lightweight, live-computed, highly responsive to metadata changes.
- Document + paragraph grain-size allows passage-level citation (strong for research).
- RRF fusion of main + HyPE sidecar is extensible; adding a new sidecar is ~50 lines of code.

**Constraints**:
- Single-writer SQLite (tower-nas): graph operations must be non-blocking.
- 7.2M paragraphs at 512-dim vectors (18GB+ Meili index); any new index layer should be selectively populated (not all docs).
- API is read-only; graph mutation must go through worker.
- Paragraph-level enrichment happens asynchronously; graph indexing must tolerate stale entity data.

**Recommendation for Graph Layer**:
1. Populate `entity_mentions` reverse index via worker (batch, parallel to HyPE sync).
2. Add graph sidecar search alongside HyPE (RRF-fused): `entity:"Bahá'u'lláh"` → hits mentioning that entity.
3. Keep graph relations sparse (typed); don't try to auto-infer relations (too noisy).
4. Use `doc_entities` as source-of-truth; enrich via existing Sonnet pipeline, not separate pass.
5. Temporal indexing optional first pass; add if use case demands chronological browsing.

---

## 11. Configuration & Deployment

### Environment Variables
- `TURSO_DATABASE_URL` — SQLite path (default: `file:./data/sifter.db`)
- `USER_DATABASE_URL` — User/auth DB (separate SQLite)
- `MEILISEARCH_HOST` — Meili server address (e.g., `http://localhost:7700`)
- `MEILISEARCH_API_KEY` — Meili auth
- `OPENAI_API_KEY` — Claude + OpenAI
- `LIBRARY_PATH` — Root directory of religious texts

### PM2 Processes on tower-nas
```
siftersearch-api              → api/index.js (read-only, Fastify listener)
siftersearch-worker           → api/workers/unified-worker.js (single writer: Meili/HyPE sync + indexing + jobs)
siftersearch-library-watcher  → scripts/index-library.js --watch (file monitor)
siftersearch-updater          → git pull + restart loop
cloudflared-tunnel            → exposes the API as api.siftersearch.com
```
**Retired 2026-07-10** (pm2-stopped): `siftersearch-enrichment` (local Qwen), `siftersearch-enrichment-api`
(Sonnet batch), and `siftersearch-graph-extractor/promoter/resolver/validator`. Enrichment now runs
as the unified gated pipeline (`scripts/pipeline/run-pipeline.mjs`) — manual through the seed phase,
then priority-processing, then auto-release. See
[architecture/unified-enrichment-pipeline.md](architecture/unified-enrichment-pipeline.md).

### Database Tuning
- `PRAGMA cache_size = -524288` — 512MB page cache (critical for 50M+ row indexes)
- `PRAGMA mmap_size = 1073741824` — 1GB mmap (read-mostly workload)
- `PRAGMA journal_mode = WAL` — write-ahead logging (concurrency)
- `PRAGMA busy_timeout = 5000` — 5s lock timeout (prevents 30s stalls)

---

## 12. References & Next Steps

**For implementing a graph layer**:
1. Review `graph-db.js` (current skeleton helpers).
2. Design entity-paragraph reverse index schema (see Section 8.2).
3. Augment HyPE/Sonnet enrichment to populate `entity_mentions` on write.
4. Add graph sidecar to `multiIndexSearch` RRF fusion (new index, new weight).
5. Implement entity resolution API (`GET /api/v1/entity/{canonical_name}`).
6. Test cross-tradition entity linking (Muhammad / Isa / Allah).

**Estimated scope**: 300-400 hours (design, implementation, testing, tuning).

---

**Document Version**: 2026-05-16  
**Current DB Schema Version**: 71  
**Meilisearch Indexes**: 4 (paragraphs, hype_questions, documents, deep_research)  
**Corpus Size**: 7.2M paragraphs, 11K+ documents, 11+ religious traditions
