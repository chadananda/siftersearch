---
title: Sync Architecture
description: Multi-layer data synchronization between files, database, and search index
---

# Sync Architecture

SifterSearch uses a three-layer architecture to ensure data consistency between the filesystem, SQLite database (libsql), and Meilisearch index.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Files     │  →   │   libsql    │  →   │ Meilisearch │
│  (Library)  │      │ (Database)  │      │   (Search)  │
└─────────────┘      └─────────────┘      └─────────────┘
     .md files        Source of Truth       Search Index
```

## Data Flow

**Direction**: Files → Database → Meilisearch (one-way sync)

| Layer | Role | Key Tables/Indexes |
|-------|------|-------------------|
| **Files** | Markdown source documents | `docs/*.md` |
| **libsql** | Source of truth for library data | `docs`, `content` |
| **Meilisearch** | Full-text search and vector similarity | `documents`, `paragraphs` |

## Sync Components

### 1. Library Watcher (Real-time)
**File**: `api/services/library-watcher.js`

Monitors library directories for file changes using chokidar.

| Event | Action |
|-------|--------|
| `add` | Ingest new document |
| `change` | Re-ingest modified document |
| `unlink` | Remove document from database |

**Configuration**: Set `library.paths` in config (via `LIBRARY_PATHS` env var or config file).

```javascript
// Starts automatically with API server
// Watches configured library paths for .md files
```

**Stats endpoint**: `GET /api/admin/server/watcher/status`

### 2. Sync Worker (Regular Sync)
**File**: `api/services/sync-worker.js`

Background worker that keeps database and Meilisearch synchronized.

| Cycle | Interval | Purpose |
|-------|----------|---------|
| **Sync** | 10 seconds | Push unsynced content to Meilisearch |
| **Cleanup** | 5 minutes | Remove stale docs from Meilisearch |
| **Full Sync** | 1 hour | Verify all data is synchronized |

#### Sync Cycle (10s)
1. Query documents with `synced = 0` paragraphs
2. Build Meilisearch documents with metadata
3. Push to `documents` and `paragraphs` indexes
4. Mark paragraphs as `synced = 1`

#### Cleanup Cycle (5min)
1. Get all document IDs from Meilisearch
2. Get all document IDs from libsql
3. Delete stale documents (in Meili but not in DB)
4. Delete orphaned paragraphs

#### Full Sync Check (1hr)
1. Compare document lists between DB and Meilisearch
2. Find documents in DB missing from Meilisearch
3. Mark missing documents for re-sync (`synced = 0`)
4. Check paragraph counts and fix mismatches

**Stats endpoint**: `GET /api/admin/server/sync/status`

### 3. Metadata Sync Trigger
**File**: `api/routes/library.js`

When document metadata is updated via API, the sync flag is reset:

```javascript
// PUT /api/library/documents/:id
// If title, author, religion, collection, language, or year changes:
await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [id]);
```

This ensures Meilisearch gets updated metadata on next sync cycle.

## The `synced` Flag

The `content` table has a `synced` column (0 or 1):

| Value | Meaning |
|-------|---------|
| `0` | Paragraph needs to be pushed to Meilisearch |
| `1` | Paragraph is in sync with Meilisearch |

**Set to 0 when**:
- New document ingested
- Document content changes
- Document metadata changes
- Full sync check finds mismatch

**Set to 1 when**:
- Sync worker successfully pushes to Meilisearch

## API Endpoints

All sync endpoints require admin authentication (JWT or X-Internal-Key header).

### Sync Status
```bash
GET /api/admin/server/sync/status
```

Returns worker stats and pending counts:
```json
{
  "worker": {
    "lastRun": "2025-12-31T10:00:00Z",
    "lastSuccess": "2025-12-31T10:00:00Z",
    "documentsSynced": 150,
    "paragraphsSynced": 5000,
    "errors": 0,
    "lastCleanup": "2025-12-31T09:55:00Z",
    "documentsDeleted": 2,
    "lastFullSync": "2025-12-31T09:00:00Z",
    "fullSyncMarked": 0,
    "running": false,
    "intervals": {
      "sync": 10000,
      "cleanup": 300000,
      "fullSync": 3600000
    }
  },
  "pending": {
    "documents": 5,
    "paragraphs": 120
  }
}
```

### Force Sync
```bash
POST /api/admin/server/sync/now
```

Triggers immediate sync cycle. Useful after bulk imports.

### Orphaned Documents
```bash
GET /api/admin/server/sync/orphaned
```

Find documents without content entries or with incomplete paragraph counts.

### Watcher Status
```bash
GET /api/admin/server/watcher/status
```

Returns:
```json
{
  "running": true,
  "stats": {
    "enabled": true,
    "startedAt": "2025-12-31T08:00:00Z",
    "filesIngested": 25,
    "filesRemoved": 2,
    "errors": 0,
    "lastEvent": {
      "type": "change",
      "path": "/library/bahai/writings/example.md",
      "at": "2025-12-31T10:30:00Z"
    }
  }
}
```

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

In `sync-worker.js`:
```javascript
const SYNC_INTERVAL_MS = 10000;       // 10 seconds
const CLEANUP_INTERVAL_MS = 300000;   // 5 minutes
const FULL_SYNC_INTERVAL_MS = 3600000; // 1 hour
const BATCH_SIZE = 100;               // Paragraphs per batch
```

## Troubleshooting

### Documents not appearing in search
1. Check `/api/library/sync/unsynced` for pending items
2. Check `/api/library/sync/stats` for errors
3. Force sync with `POST /api/library/sync/force`
4. Check Meilisearch is running

### Stale search results
1. Wait for 5-minute cleanup cycle
2. Check `/api/library/sync/stats` for `lastCleanup`
3. Verify document was deleted from database

### File changes not detected
1. Check `/api/library/watcher/stats` for `enabled: true`
2. Verify library paths are configured
3. Check file ends with `.md`
4. Check file is not in ignored patterns (dotfiles, node_modules)

### Meilisearch out of sync
1. Check `/api/library/sync/stats` for `fullSyncMarked` count
2. Wait for hourly full sync check
3. Manually trigger by setting `synced = 0`:
   ```sql
   UPDATE content SET synced = 0 WHERE doc_id = 'document-id';
   ```

## Architecture Diagram

```
                    ┌────────────────────────────────────┐
                    │           API Server               │
                    │                                    │
   ┌────────────┐   │  ┌──────────────────────────────┐  │
   │            │   │  │     Library Watcher          │  │
   │   Files    │───│──│  (chokidar, real-time)       │  │
   │   (.md)    │   │  │  add → ingest                │  │
   │            │   │  │  change → re-ingest          │  │
   └────────────┘   │  │  unlink → remove             │  │
                    │  └──────────────┬───────────────┘  │
                    │                 │                  │
                    │                 ▼                  │
                    │  ┌──────────────────────────────┐  │
                    │  │         libsql               │  │
                    │  │   (Source of Truth)          │  │
                    │  │                              │  │
                    │  │  docs: metadata              │  │
                    │  │  content: paragraphs         │  │
                    │  │           synced: 0|1        │  │
                    │  └──────────────┬───────────────┘  │
                    │                 │                  │
                    │                 ▼                  │
                    │  ┌──────────────────────────────┐  │
                    │  │       Sync Worker            │  │
                    │  │                              │  │
                    │  │  10s: push synced=0          │  │
                    │  │  5m:  cleanup stale          │  │
                    │  │  1h:  verify consistency     │  │
                    │  └──────────────┬───────────────┘  │
                    │                 │                  │
                    └─────────────────┼──────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────┐
                    │         Meilisearch              │
                    │       (Search Index)             │
                    │                                  │
                    │  documents: metadata + authority │
                    │  paragraphs: text + vectors      │
                    └──────────────────────────────────┘
```

## Performance Notes

- **Batch size**: 100 paragraphs per Meilisearch push
- **Max payload**: 90MB per batch (Meilisearch limit is 100MB)
- **Debounce**: 1 second for file writes to complete
- **Watch depth**: 10 levels of subdirectories
- **Ignored**: dotfiles, node_modules, .git, .DS_Store
