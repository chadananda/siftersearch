---
title: Sync Architecture
description: Three-track data synchronization between files, databases, and search indexes
---

# Sync Architecture

SifterSearch uses a layered architecture to ensure data consistency between the filesystem, SQLite databases (sifter.db, embedding_cache.db, graph.db), and Meilisearch indexes.

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌─────────────────────────┐
│   Files     │ →   │   SQLite (Three Databases)       │ →   │     Meilisearch         │
│  (Library)  │     │  sifter.db + embedding_cache.db  │     │  paragraphs             │
└─────────────┘     │  + graph.db                      │     │  paragraphs_enhanced    │
     .md files      └──────────────────────────────────┘     │  documents              │
                          Source of Truth                     └─────────────────────────┘
                                                                    Search Indexes
```

## Data Flow

**Direction**: Files → Databases → Meilisearch (one-way sync)

| Layer | Role | Key Tables/Indexes |
|-------|------|-------------------|
| **Files** | Markdown source documents | `docs/*.md` |
| **sifter.db** | Source of truth for content + pipeline state | `docs`, `content`, `content_objects`, `content_enrichment`, `layer_sync_state` |
| **embedding_cache.db** | Deduplicated 512-dim embedding KV cache | `embedding_cache` |
| **graph.db** | Persistent entity/concept graph | `graph_entities`, `graph_relations` |
| **Meilisearch** | Full-text search and vector similarity | `paragraphs`, `paragraphs_enhanced`, `documents` |

## Three-Track Sync

The sync system operates in three independent tracks, one per indexing layer:

| Track | Source Tables | Target Index | Trigger |
|-------|--------------|--------------|---------|
| **base** | `content` + `embedding_cache.db` | `paragraphs` | `layer_sync_state.synced = 0` for layer='base' |
| **object** | `content_objects` | `paragraphs_enhanced` | `layer_sync_state.synced = 0` for layer='object' |
| **enrichment** | `content_enrichment` | `paragraphs_enhanced` | `layer_sync_state.synced = 0` for layer='enrichment' |

### layer_sync_state Table

Replaces the old `synced` and `enhanced_synced` boolean columns:

```sql
content_id TEXT
layer TEXT               -- 'base', 'object', or 'enrichment'
synced INTEGER           -- 0 = dirty/pending, 1 = synced
dirty_reason TEXT        -- why it was marked dirty
UNIQUE(content_id, layer)
```

**Set to 0 (dirty) when:**
- New document ingested (base layer)
- Document content changes (all layers)
- Document metadata changes (base layer)
- Pipeline version bumped (affected layers per invalidation rules)
- Object extraction re-runs (object + enrichment layers)
- Full sync check finds mismatch

**Set to 1 when:**
- Sync worker successfully pushes that layer to Meilisearch

## Sync Components

### 1. Library Watcher (Real-time)
**File**: `api/services/library-watcher.js`

Monitors library directories for file changes using chokidar.

| Event | Action |
|-------|--------|
| `add` | Ingest new document, mark base layer dirty |
| `change` | Re-ingest modified document, mark affected layers dirty |
| `unlink` | Remove document from database and all Meilisearch indexes |

**Configuration**: Set `library.paths` in config (via `LIBRARY_PATHS` env var or config file).

**Stats endpoint**: `GET /api/admin/server/watcher/status`

### 2. Unified Worker (All Sync Tracks)
**File**: `api/workers/unified-worker.js`

Single writer process that handles all three sync tracks plus pipeline job execution.

| Cycle | Interval | Purpose |
|-------|----------|---------|
| **Base sync** | 10 seconds | Push base-dirty paragraphs to `paragraphs` index |
| **Object sync** | 10 seconds | Push object-dirty paragraphs to `paragraphs_enhanced` |
| **Enrichment sync** | 10 seconds | Push enrichment-dirty paragraphs to `paragraphs_enhanced` |
| **Pipeline jobs** | 30 seconds | Process pending object extraction + enrichment jobs |
| **Cleanup** | 5 minutes | Remove stale docs from Meilisearch |
| **Full Sync** | 1 hour | Verify all layers are synchronized |

#### Base Sync Cycle
1. Query `layer_sync_state` where `layer = 'base' AND synced = 0`
2. Fetch paragraph text from `content` + embeddings from `embedding_cache.db`
3. Push to `paragraphs` index with 512-dim vectors
4. Mark rows `synced = 1`

#### Object Sync Cycle
1. Query `layer_sync_state` where `layer = 'object' AND synced = 0`
2. Fetch `content_objects.objects_rendered` and entity arrays
3. Push to `paragraphs_enhanced` index (upsert by paragraph ID)
4. Mark rows `synced = 1`

#### Enrichment Sync Cycle
1. Query `layer_sync_state` where `layer = 'enrichment' AND synced = 0`
2. Fetch `content_enrichment` rows for context + hype task modes
3. Push to `paragraphs_enhanced` index (upsert by paragraph ID)
4. Mark rows `synced = 1`

#### Cleanup Cycle (5min)
1. Get all document IDs from Meilisearch
2. Get all document IDs from sifter.db
3. Delete stale documents (in Meili but not in DB)
4. Delete orphaned paragraphs from both indexes

#### Full Sync Check (1hr)
1. Compare document lists between DB and Meilisearch
2. Find documents missing from `paragraphs` index
3. Mark missing base layer rows dirty
4. Check for enrichment/object layer gaps

**Stats endpoint**: `GET /api/admin/server/sync/status`

### 3. Metadata Sync Trigger
**File**: `api/routes/library.js`

When document metadata is updated via API, the base layer sync flag is reset:

```javascript
// PUT /api/library/documents/:id
// If title, author, religion, collection, language, or year changes:
await query(
  "UPDATE layer_sync_state SET synced = 0, dirty_reason = 'metadata_change' WHERE content_id IN (SELECT id FROM content WHERE doc_id = ?) AND layer = 'base'",
  [id]
);
```

### 4. Pipeline Invalidation Trigger
**File**: `api/lib/pipeline.js`

When a pipeline version is bumped (new prompt or model), affected layers are invalidated:

```javascript
// Invalidate all enrichment layers (prompt changed)
await invalidateForHypePromptChange();
// Invalidate all object + enrichment layers (object extraction model changed)
await invalidateForObjectVersionChange(version);
```

## Document ID Stability

**Once a document has an ID, it NEVER changes.**

- File path can change (rename/move)
- Title and metadata can change
- Content can change
- **ID stays the same forever**

This preserves user annotations, bookmarks, highlights, and URL stability.

### Rename (via admin UI)

1. User changes filename in DocumentEditor
2. PUT to `/api/library/documents/:id/raw` with `newFilename`
3. Backend writes content (if changed), renames file via `fs.rename()`, updates `file_path` in database
4. Watcher sees `unlink` on old path → no doc found (path already updated), then `add` on new path → hash matches → skipped

### Move (via filesystem)

When a file moves to a different folder/collection:

1. Watcher sees `unlink` on old path → schedules delete with **2-second grace period**
2. Watcher sees `add` on new path → cancels pending delete
3. Ingester: lookup by new path not found → lookup by `file_hash` → found existing doc → updates `file_path`, `religion`, `collection` → marks base layer dirty

The 2-second grace period prevents accidental deletion when a filesystem rename triggers `unlink + add` in quick succession.

**What gets updated on file move:**
- `file_path` → new location
- `religion` → extracted from new path (first folder)
- `collection` → extracted from new path (second folder)
- `layer_sync_state` base layer → dirty (to update Meilisearch metadata)

**What stays the same:**
- Document ID (immutable)
- All paragraph content and embeddings
- `content_objects`, `content_enrichment` (enrichment is content-addressed, not path-addressed)

### Content Hash (paragraph-level)

Each paragraph has `content_hash`. Used to:
- Skip embedding regeneration for unchanged paragraphs
- Identify which specific paragraphs need re-processing
- Only object extraction + enrichment re-runs when content_hash changes

## Meilisearch Index Structure

### paragraphs index
```
{
  id: "content-row-id",
  doc_id: 123,
  text: "paragraph text with ⁅sentence markers⁆",
  heading: "Section heading",
  blocktype: "paragraph",
  title: "Document title",
  author: "Author name",
  religion: "Baha'i",
  collection: "Core Writings",
  language: "en",
  _vectors: { default: [/* 512 floats */] }
}
```

### paragraphs_enhanced index
```
{
  id: "content-row-id",        -- same ID as paragraphs index
  objects_rendered: "Baháʼu'lláh (person), Most Great Peace (concept)...",
  context: "This passage addresses...",
  hyp_questions: ["What did Baháʼu'lláh mean by..."],
  people: ["Baháʼu'lláh", "ʻAbdu'l-Bahá"],
  concepts: ["Most Great Peace", "divine civilization"],
  places: [],
  texts: ["Kitáb-i-Aqdas"]
}
```

### Fused Search

The search layer queries both indexes and merges results by paragraph ID:

```
1. Query paragraphs (BM25 + semantic)
2. Query paragraphs_enhanced (keyword match on objects/context/questions)
3. Merge by paragraph ID — enhanced fields added to base hits
4. Apply Voyage reranking on merged results
```

## API Endpoints

All sync endpoints require admin authentication (JWT or X-Internal-Key header).

### Sync Status
```bash
GET /api/admin/server/sync/status
```

Returns worker stats and pending counts per layer:
```json
{
  "worker": {
    "lastRun": "2026-04-02T10:00:00Z",
    "lastSuccess": "2026-04-02T10:00:00Z",
    "documentsSynced": 150,
    "paragraphsSynced": 5000,
    "errors": 0,
    "running": false
  },
  "pending": {
    "base": 12,
    "object": 340,
    "enrichment": 1200
  }
}
```

### Force Sync
```bash
POST /api/admin/server/sync/now
```

Triggers immediate sync cycle across all layers.

### Orphaned Documents
```bash
GET /api/admin/server/sync/orphaned
```

Find documents without content entries or with incomplete paragraph counts.

### Watcher Status
```bash
GET /api/admin/server/watcher/status
```

Returns file watcher stats including last event and ingestion counts.

## Configuration

### Environment Variables

```bash
# Library paths to watch (comma-separated)
LIBRARY_PATHS=/path/to/library,/another/path

# Or in config.json:
{
  "library": {
    "paths": ["/path/to/library"]
  }
}
```

### Timing Constants

In `api/workers/unified-worker.js`:
```javascript
const SYNC_INTERVAL_MS = 10000;       // 10 seconds (all three tracks)
const PIPELINE_INTERVAL_MS = 30000;   // 30 seconds (object extraction + enrichment)
const CLEANUP_INTERVAL_MS = 300000;   // 5 minutes
const FULL_SYNC_INTERVAL_MS = 3600000; // 1 hour
const BATCH_SIZE = 100;               // Paragraphs per batch
```

## Troubleshooting

### Documents not appearing in search
1. Check pending base layer: `SELECT COUNT(*) FROM layer_sync_state WHERE layer='base' AND synced=0`
2. Check sync worker logs: `pm2 logs siftersearch-worker`
3. Force sync with `POST /api/admin/server/sync/now`
4. Check Meilisearch is running: `curl http://localhost:7700/health`

### Missing enhanced data (objects, context, questions)
1. Check object layer pending: `SELECT COUNT(*) FROM layer_sync_state WHERE layer='object' AND synced=0`
2. Check pipeline jobs: `SELECT status, COUNT(*) FROM pipeline_jobs GROUP BY status`
3. Verify vLLM on `boss` is reachable: check AI server logs
4. Check enrichment layer: `SELECT COUNT(*) FROM layer_sync_state WHERE layer='enrichment' AND synced=0`

### Meilisearch out of sync
1. Reset base layer for a document:
   ```sql
   UPDATE layer_sync_state SET synced = 0, dirty_reason = 'manual_reset'
   WHERE layer = 'base' AND content_id IN (SELECT id FROM content WHERE doc_id = 123);
   ```
2. Wait for hourly full sync check or force sync

### Stale search results after document deletion
1. Wait for 5-minute cleanup cycle
2. Verify document was soft-deleted (`deleted_at IS NOT NULL` in docs table)
3. Check `GET /api/admin/server/sync/orphaned`

## Architecture Diagram

```
                    ┌────────────────────────────────────────────┐
                    │              API Server                     │
                    │                                            │
   ┌────────────┐   │  ┌──────────────────────────────────────┐  │
   │            │   │  │          Library Watcher             │  │
   │   Files    │───│──│  (chokidar, real-time)               │  │
   │   (.md)    │   │  │  add → ingest → mark base dirty      │  │
   │            │   │  │  change → re-ingest → mark dirty     │  │
   └────────────┘   │  │  unlink → remove from all indexes    │  │
                    │  └──────────────┬───────────────────────┘  │
                    │                 │                          │
                    │                 ▼                          │
                    │  ┌──────────────────────────────────────┐  │
                    │  │           sifter.db                  │  │
                    │  │        (Source of Truth)             │  │
                    │  │                                      │  │
                    │  │  docs: metadata                      │  │
                    │  │  content: paragraphs                 │  │
                    │  │  content_objects: entities           │  │
                    │  │  content_enrichment: context/hype    │  │
                    │  │  layer_sync_state: dirty flags       │  │
                    │  └──────────────┬───────────────────────┘  │
                    │                 │                          │
                    └─────────────────┼──────────────────────────┘
                                      │
                    ┌─────────────────┼──────────────────────────┐
                    │   Unified Worker│(single writer)            │
                    │                 ▼                          │
                    │  ┌──────────────────────────────────────┐  │
                    │  │  Three sync tracks (10s each)        │  │
                    │  │  base → paragraphs index             │  │
                    │  │  object → paragraphs_enhanced        │  │
                    │  │  enrichment → paragraphs_enhanced    │  │
                    │  └──────────────┬───────────────────────┘  │
                    │                 │                          │
                    └─────────────────┼──────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────────┐
                    │              Meilisearch                 │
                    │           (Search Indexes)               │
                    │                                          │
                    │  paragraphs: text + 512-dim vectors      │
                    │  paragraphs_enhanced: objects + context  │
                    │  documents: metadata + authority         │
                    └──────────────────────────────────────────┘
```

## Performance Notes

- **Batch size**: 100 paragraphs per Meilisearch push
- **Max payload**: 90MB per batch (Meilisearch limit is 100MB)
- **Debounce**: 1 second for file writes to complete
- **Watch depth**: 10 levels of subdirectories
- **Ignored**: dotfiles, node_modules, .git, .DS_Store
- **Single writer**: unified-worker is the only process that writes to Meilisearch and pipeline_jobs
