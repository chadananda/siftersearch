# Content Pipeline Architecture

## Overview

SifterSearch uses a **three-layer indexing pipeline** where SQLite databases are the source of truth and Meilisearch is a read-only search index. Content flows through three progressive enrichment layers, each adding more semantic depth.

```
┌─────────────┐     ┌───────────────────────────────────────────┐     ┌──────────────────────┐
│ Source File │ ──► │         SQLite (Three Databases)          │ ──► │     Meilisearch      │
│ (any format)│     │  sifter.db + embedding_cache.db + graph.db│     │ (paragraphs /        │
└─────────────┘     └───────────────────────────────────────────┘     │  paragraphs_enhanced)│
     PDF/MD/HTML        converts, segments, enriches                   └──────────────────────┘
```

## Three Databases

| Database | Purpose | Key Tables |
|----------|---------|------------|
| **sifter.db** | Main source of truth | `docs`, `content`, `pipeline_jobs`, `pipeline_versions`, `layer_sync_state`, `content_objects`, `content_enrichment` |
| **embedding_cache.db** | Deduplicated 512-dim embeddings | `embedding_cache` (keyed by `normalized_hash`) |
| **graph.db** | Persistent entity/concept graph | `graph_entities`, `graph_relations` |

## Three Indexing Layers

| Layer | Purpose | Output |
|-------|---------|--------|
| **Base retrieval** | BM25 + semantic (512-dim vectors) in Meilisearch | `paragraphs` index |
| **Object graph** | Entity/concept extraction via local vLLM, persistent corpus graph | `content_objects` + `graph.db` + `paragraphs_enhanced` index |
| **Enrichment** | Disambiguation + HyPE questions with prefix-cached prompts | `content_enrichment` + `paragraphs_enhanced` index |

## Key Principles

### 1. SQLite is the Source of Truth

- **`docs` table**: Document metadata (title, author, religion, collection, file_path, etc.)
- **`content` table**: Processed, searchable paragraphs with sentence markers
- **`content_objects` table**: Extracted entities/concepts per paragraph
- **`content_enrichment` table**: Disambiguation + HyPE questions per paragraph

The content tables contain **processed, searchable text** — not raw file contents. Original files may be PDF, HTML, markdown, or unpunctuated classical texts requiring AI segmentation.

### 2. Meilisearch is a Search Index Only

Meilisearch:
- **ONLY reads from SQLite** databases
- **Never touches original files**
- **Only knows `doc_id`** — no file paths, no raw text input
- Is **rebuildable** from SQLite at any time

If Meilisearch is lost, it can be completely rebuilt from the SQLite databases.

### 3. File Paths are Always Relative

The `file_path` column in `docs` table:
- Is **relative to `config.library.basePath`**
- Example: `Baha'i/Core Tablets/The Báb/002-tablets.md`
- **Never absolute** like `/Users/chad/Dropbox/...`

```javascript
const fullPath = path.join(config.library.basePath, doc.file_path);
```

### 4. Embeddings are 512-dim, Deduplicated

Embeddings are stored in `embedding_cache.db`, NOT in `sifter.db`. The cache:
- Uses Matryoshka truncation from 3072-dim OpenAI embeddings to 512-dim
- L2-normalizes the truncated vector for cosine similarity
- Keys by `normalized_hash` (normalized text hash) — identical text across documents shares one embedding entry
- Eliminates redundant storage for repeated paragraphs across traditions

### 5. Pipeline Versioning + Invalidation

The pipeline tracks which content was processed with which prompt versions:
- `pipeline_versions` table — version registry with invalidation rules
- `pipeline_jobs` table — layer-aware job queue
- `layer_sync_state` table — per-layer sync state (replaces old `synced`/`enhanced_synced` booleans)

When a prompt or model changes, the pipeline marks affected content dirty and schedules re-processing.

## Full Pipeline Flow

```
1.  Ingest docs + content → sifter.db (docs + content tables)
2.  Resolve embeddings from embedding_cache.db
    └─ On miss: generate via OpenAI text-embedding-3-large, truncate+normalize to 512-dim, store
3.  Sync base layer → Meilisearch paragraphs index
    └─ paragraph text + 512-dim semantic vectors
4.  Run object extraction (local vLLM, Qwen3-32B-AWQ)
    └─ content_objects → sifter.db
    └─ entities/relations → graph.db (religion-scoped conservative merging)
5.  Sync object layer → Meilisearch paragraphs_enhanced index
    └─ objects_rendered, entity arrays
6.  Run enrichment (local vLLM with prefix-cached prompts)
    └─ content_enrichment → sifter.db (disambiguation + HyPE questions)
7.  Sync enrichment layer → Meilisearch paragraphs_enhanced index
    └─ context, hyp_questions fields
```

## Meilisearch Indexes

| Index | Contents | Purpose |
|-------|----------|---------|
| `paragraphs` | base text + 512-dim vectors | BM25 + semantic search |
| `paragraphs_enhanced` | objects_rendered, context, hyp_questions, entity arrays | Object/enrichment sidecar |
| `documents` | document metadata | Document-level search |

**Fused search**: query both `paragraphs` and `paragraphs_enhanced`, merge results by paragraph ID, apply Voyage reranking.

## Key Modules

| Module | Purpose |
|--------|---------|
| `api/lib/embedding-cache.js` | Embedding KV cache (separate DB, Matryoshka 512-dim) |
| `api/lib/graph-db.js` | Entity graph (separate DB, religion-scoped) |
| `api/lib/object-extraction.js` | LLM entity/concept extraction |
| `api/lib/entity-resolution.js` | Conservative cross-tradition-safe entity merging |
| `api/lib/enrichment-prompts.js` | Deterministic prompt blocks with MD5 hashing for vLLM prefix cache |
| `api/lib/enrichment-runner.js` | Document-level sliding window enrichment |
| `api/lib/window-sizer.js` | Dynamic window N from KV token budget |
| `api/lib/pipeline.js` | Pipeline version registry + invalidation rules |
| `api/lib/pipeline-scheduler.js` | Layer-aware job scheduling |
| `api/routes/graph.js` | Graph API endpoints |

## Component Responsibilities

### Ingester (`api/services/ingester.js`)

- Reads source files
- Converts/processes content
- Handles AI segmentation for unpunctuated texts
- Writes to `sifter.db` `docs` and `content` tables
- Stores **relative** file_path

### Embedding Cache (`api/lib/embedding-cache.js`)

- Maintains `embedding_cache.db` separately from sifter.db
- On lookup: returns cached 512-dim blob if hash found
- On miss: calls OpenAI, truncates 3072 → 512 dims, L2 normalizes, stores
- Deduplicates identical paragraphs across documents

### Object Extractor (`api/lib/object-extraction.js`)

- Reads paragraphs from sifter.db
- Calls local vLLM (Qwen3-32B-AWQ on `boss` server)
- Parses JSON response into 6 entity/concept arrays
- Writes to `content_objects` in sifter.db
- Writes entities/relations to `graph.db`

### Entity Resolution (`api/lib/entity-resolution.js`)

- Merges entities within a religion (conservative — never cross-tradition merges)
- Same religion + same type + exact canonical_name → merge (increment mention_count)
- Protects cross-traditional integrity (Bahá'í ≠ Sufi ≠ Christian "love")

### Enrichment Runner (`api/lib/enrichment-runner.js`)

- Sliding window over document paragraphs
- Dynamic window size via `api/lib/window-sizer.js` (fits under 8K KV budget)
- Deterministic prompt blocks with MD5 hashing for vLLM prefix cache hits
- Writes disambiguation + HyPE questions to `content_enrichment`

### Pipeline Scheduler (`api/lib/pipeline-scheduler.js`)

- Layer-aware job queue (base → object → enrichment)
- Reads `layer_sync_state` per paragraph per layer
- Schedules work based on dirty flags from pipeline invalidation

### Sync Worker (`api/workers/unified-worker.js`)

- Monitors `layer_sync_state` for dirty paragraphs
- Pushes each layer to appropriate Meilisearch index
- Maintains consistency across all three indexes

## Database Schema

### sifter.db — docs table
```sql
id INTEGER PRIMARY KEY
file_path TEXT           -- relative to basePath
file_hash TEXT           -- hash of entire file (skip if unchanged)
body_hash TEXT           -- hash of body only (metadata-only update if body unchanged)
title, author, religion, collection, language, year
paragraph_count INTEGER
slug TEXT                -- URL-friendly identifier
```

### sifter.db — content table
```sql
id TEXT PRIMARY KEY
doc_id INTEGER           -- foreign key to docs
paragraph_index INTEGER
text TEXT                -- with sentence markers ⁅s1⁆...⁅/s1⁆
content_hash TEXT
heading TEXT
blocktype TEXT           -- paragraph, verse, prayer, etc.
```

### sifter.db — content_objects table
```sql
content_id TEXT          -- foreign key to content
object_pipeline_version TEXT
objects_json TEXT        -- extracted entity/concept arrays
objects_rendered TEXT    -- flattened string for Meilisearch
UNIQUE(content_id, object_pipeline_version)
```

### sifter.db — content_enrichment table
```sql
content_id TEXT          -- foreign key to content
task_mode TEXT           -- 'context' or 'hype'
pipeline_version TEXT
result_text TEXT
UNIQUE(content_id, task_mode, pipeline_version)
```

### sifter.db — layer_sync_state table
```sql
content_id TEXT
layer TEXT               -- 'base', 'object', 'enrichment'
synced INTEGER           -- 0 = dirty, 1 = synced
dirty_reason TEXT
UNIQUE(content_id, layer)
```

### sifter.db — pipeline_versions table
```sql
pipeline_name TEXT
version TEXT
active INTEGER           -- only one active per pipeline
invalidation_rules JSON
UNIQUE(pipeline_name, version)
```

### sifter.db — pipeline_jobs table
```sql
id INTEGER PRIMARY KEY
type TEXT
doc_id INTEGER
layer TEXT
pipeline_version TEXT
status TEXT              -- 'pending', 'running', 'done', 'failed'
created_at TEXT
UNIQUE(type, doc_id, layer, pipeline_version) -- deduplicates pending jobs
```

### embedding_cache.db — embedding_cache table
```sql
normalized_hash TEXT     -- hash of normalized paragraph text
model TEXT               -- embedding model name
embedding_dim INTEGER    -- 512
version TEXT
embedding BLOB           -- Float32Array, 512 dims, L2 normalized
source_count INTEGER     -- how many paragraphs share this embedding
```

### graph.db — graph_entities table
```sql
id INTEGER PRIMARY KEY
name TEXT
canonical_name TEXT
entity_type TEXT         -- person, place, concept, text, event, etc.
religion TEXT            -- scoped per tradition
mention_count INTEGER
era TEXT
description TEXT
```

### graph.db — graph_relations table
```sql
id INTEGER PRIMARY KEY
source_entity_id INTEGER
target_entity_id INTEGER
relation_type TEXT
weight REAL
paragraph_id INTEGER
doc_id INTEGER
```

## Change Detection Strategy

The ingester uses two hashes for smart change detection:

1. **`file_hash`**: SHA256 of entire file (frontmatter + body)
   - If unchanged → skip entirely

2. **`body_hash`**: SHA256 of body content only
   - If file changed but body unchanged → metadata-only update, skip content re-processing

```
Scenario: User edits document title in frontmatter
  file_hash: changed (file modified)
  body_hash: unchanged (content same)
  Result: UPDATE docs metadata, skip content re-processing
```

## Infrastructure

- **tower-nas** (App server): Xeon 80-core, 188GB RAM — API, Meilisearch, workers, Cloudflare tunnel
- **boss** (AI server): Strix Halo + GPU — vLLM (Qwen3-32B-AWQ) for object extraction + enrichment
- Servers communicate via Tailscale
- Zero-downtime deploys via PM2 wait_ready + graceful reload

## Common Operations

### Re-ingest a document
```bash
node scripts/reingest-document.js <doc-id>
```

### Rebuild Meilisearch base layer from SQLite
```bash
sqlite3 data/sifter.db "UPDATE layer_sync_state SET synced = 0 WHERE layer = 'base';"
pm2 restart siftersearch-worker
```

### Re-run object extraction for a document
```bash
node scripts/run-object-extraction.js --doc-id <id>
```

### Re-run enrichment for a document
```bash
node scripts/run-enhancement.js --doc-id <id>
```

## Anti-Patterns (Don't Do This)

1. **Don't store absolute file paths** — breaks portability
2. **Don't pass raw text to indexer** — bypasses SQLite source of truth
3. **Don't read files from indexer** — indexer only reads SQLite
4. **Don't sync Meilisearch → SQLite** — data flows one direction only
5. **Don't store embeddings in sifter.db** — use embedding_cache.db for deduplication
6. **Don't merge entities across traditions** — entity resolution is religion-scoped
7. **Don't use synced/enhanced_synced booleans** — use layer_sync_state table
