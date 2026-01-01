---
title: Admin API Reference
description: Server management and administration endpoints for SifterSearch
---

# Admin API Reference

The Admin API provides endpoints for user management, document indexing, and server operations. All endpoints require admin authentication unless otherwise noted.

## Authentication

Admin routes use two authentication methods:

### Admin JWT
Standard admin user login with `Authorization: Bearer <token>` header.

### Internal API Key
Server-to-server authentication using `X-Internal-Key: <DEPLOY_SECRET>` header. This is useful for deploy scripts, cron jobs, or other automated systems.

```bash
# Using admin JWT
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.siftersearch.com/api/admin/stats

# Using internal key
curl -H "X-Internal-Key: $DEPLOY_SECRET" \
  https://api.siftersearch.com/api/admin/server/status
```

---

## User Management

### GET /api/admin/stats

Dashboard statistics including user counts, search stats, and analytics.

**Response:**
```json
{
  "users": {
    "total": 150,
    "verified": 45,
    "approved": 80,
    "patron": 20,
    "admin": 3,
    "banned": 2,
    "pending": 5
  },
  "search": {
    "documents": { "numberOfDocuments": 2500 },
    "paragraphs": { "numberOfDocuments": 125000 }
  },
  "analytics": {
    "last30Days": {
      "total_events": 5000,
      "total_cost": 12.50,
      "unique_users": 120
    }
  }
}
```

### GET /api/admin/users

List users with pagination and filtering.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | integer | 20 | Results per page (1-100) |
| offset | integer | 0 | Pagination offset |
| tier | string | - | Filter by tier |
| search | string | - | Search email/name |

### GET /api/admin/pending

Get users awaiting approval (tier=verified, no approved_at).

### PUT /api/admin/users/:id

Update user properties.

**Body:**
```json
{
  "tier": "approved",
  "name": "Updated Name"
}
```

**Valid tiers:** `verified`, `approved`, `patron`, `institutional`, `admin`, `banned`

### POST /api/admin/approve/:id

Shortcut to approve a verified user (sets tier to approved).

### POST /api/admin/ban/:id

Ban a user (sets tier to banned).

---

## Document Indexing

### POST /api/admin/index

Index a single document from text.

**Body:**
```json
{
  "text": "Full document text (min 100 chars)...",
  "metadata": {
    "id": "custom-id",
    "title": "Document Title",
    "author": "Author Name",
    "religion": "Bahai",
    "collection": "Writings",
    "language": "en",
    "year": 1890,
    "description": "Brief description"
  }
}
```

### POST /api/admin/index/batch

Batch index multiple documents.

**Body (array format):**
```json
{
  "documents": [
    { "text": "...", "metadata": {...} },
    { "text": "...", "metadata": {...} }
  ]
}
```

**Body (book format):**
```json
{
  "title": "Book Title",
  "author": "Author Name",
  "chapters": [...]
}
```

### DELETE /api/admin/index/:id

Remove a document from the search index.

### GET /api/admin/index/status

Get indexing queue status.

---

## Server Management

Server management endpoints provide remote control over database operations, library indexing, and background tasks. These endpoints accept either admin JWT or X-Internal-Key header.

### GET /api/admin/server/status

Overview of database, Meilisearch, and task statistics.

**Response:**
```json
{
  "database": {
    "docs": 2500,
    "content": 125000,
    "users": 150,
    "libraryNodes": 3500
  },
  "meilisearch": {
    "documents": 2500,
    "paragraphs": 125000
  },
  "backgroundTasks": {
    "running": 1,
    "completed": 5,
    "failed": 0
  }
}
```

### GET /api/admin/server/tables

List database tables with row counts (for debugging).

**Response:**
```json
{
  "tables": ["users", "docs", "content", "library_nodes", ...],
  "indexes": ["idx_docs_religion", ...],
  "counts": {
    "users": 150,
    "docs": 2500,
    "content": 125000
  }
}
```

### GET /api/admin/server/indexes

Meilisearch index details and field distribution.

**Response:**
```json
{
  "documents": {
    "count": 2500,
    "isIndexing": false,
    "fieldDistribution": {
      "title": 2500,
      "author": 2450,
      "religion": 2500
    }
  },
  "paragraphs": {
    "count": 125000,
    "isIndexing": false,
    "fieldDistribution": {...}
  }
}
```

### POST /api/admin/server/migrate

Run database migrations.

**Response:**
```json
{
  "success": true,
  "applied": 2,
  "total": 12,
  "migrations": ["v11_library_nodes", "v12_document_storage"]
}
```

### POST /api/admin/server/validate

Validate script parameters without running. Useful for testing before launching background tasks.

**Body:**
```json
{
  "script": "reindex",
  "params": {
    "religion": "Bahai",
    "limit": 100
  }
}
```

**Valid scripts:** `reindex`, `fix-languages`, `populate-translations`

**Response:**
```json
{
  "valid": true,
  "warnings": ["Both religion and collection specified - will filter by both"],
  "errors": []
}
```

---

## Background Tasks

Background tasks run library maintenance operations in separate processes. Only one instance of each task can run at a time.

### POST /api/admin/server/reindex

Re-index library documents. Supports granular filtering.

**Body:**
```json
{
  "force": false,
  "limit": 100,
  "religion": "Bahai",
  "collection": "Writings",
  "path": "bahai/writings/*.md",
  "documentId": "specific-doc-id"
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| force | boolean | Re-index even if unchanged |
| limit | integer | Max documents to process |
| religion | string | Filter by religion name |
| collection | string | Filter by collection name |
| path | string | Filter by path pattern (glob) |
| documentId | string | Re-index single document by ID |

### POST /api/admin/server/fix-languages

Fix RTL language detection (Arabic, Persian, Hebrew, Urdu).

**Body:**
```json
{
  "limit": 100,
  "religion": "Islam",
  "dryRun": true
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Max documents to scan |
| religion | string | Filter by religion |
| dryRun | boolean | Preview without applying changes |

### POST /api/admin/server/populate-translations

Generate English translations for non-English documents.

**Body:**
```json
{
  "limit": 50,
  "language": "ar",
  "documentId": "specific-doc-id",
  "force": false
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Max documents to process |
| language | string | Filter by language (ar, fa, he, ur) |
| documentId | string | Process single document |
| force | boolean | Regenerate existing translations |

### GET /api/admin/server/tasks

List all background tasks with status summary.

**Response:**
```json
{
  "tasks": {
    "reindex": {
      "id": "reindex",
      "script": "scripts/index-library.js",
      "status": "running",
      "startedAt": "2025-12-28T06:00:00Z",
      "outputLines": 45,
      "errorLines": 0,
      "lastOutput": ["Processing Bahai/Writings...", "Indexed 50 documents"]
    }
  }
}
```

### GET /api/admin/server/tasks/:taskId

Get detailed output for a specific task.

**Response:**
```json
{
  "id": "reindex",
  "script": "scripts/index-library.js",
  "status": "completed",
  "startedAt": "2025-12-28T06:00:00Z",
  "completedAt": "2025-12-28T06:15:00Z",
  "exitCode": 0,
  "output": ["Line 1", "Line 2", ...],
  "errors": []
}
```

### POST /api/admin/server/tasks/:taskId/cancel

Cancel a running task (sends SIGTERM to child process).

**Response:**
```json
{
  "success": true,
  "taskId": "reindex",
  "status": "cancelled"
}
```

### DELETE /api/admin/server/tasks

Clear completed/failed tasks from memory. Running tasks are preserved.

**Response:**
```json
{
  "cleared": 3,
  "remaining": 1
}
```

---

## Sync & Watcher Status

Background services that keep the database and search index synchronized. See [Sync Architecture](./sync-architecture.md) for details.

### GET /api/admin/server/sync/status

Get sync worker status and pending counts.

**Response:**
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

### POST /api/admin/server/sync/now

Trigger immediate sync cycle. Useful after bulk imports.

**Response:**
```json
{
  "success": true,
  "message": "Sync cycle completed",
  "stats": { ... }
}
```

### GET /api/admin/server/sync/orphaned

Find documents without content table entries or with missing paragraphs.

**Response:**
```json
{
  "orphaned": 2,
  "partial": 1,
  "orphanedDocs": [
    { "id": "doc-1", "title": "...", "file_path": "...", "paragraph_count": 50 }
  ],
  "partialDocs": [
    { "id": "doc-2", "title": "...", "expected": 30, "actual": 15 }
  ]
}
```

### GET /api/admin/server/watcher/status

Get file watcher status and statistics.

**Response:**
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

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

**Common status codes:**
- `401` - Missing or invalid authentication
- `403` - Insufficient permissions (not admin)
- `404` - Resource not found
- `409` - Conflict (e.g., task already running)
- `500` - Internal server error
