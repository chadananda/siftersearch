# Document Synchronization Architecture

This document describes the synchronization mechanisms between source files, the SQLite database, and the Meilisearch index.

## Core Principles

### 1. Files are Source of Truth

The markdown files in the library are the canonical source. The database and search index are derived from these files.

```
Source Files (markdown) → SQLite Database → Meilisearch Index
```

### 2. Document ID is Immutable

**Once a document has an ID, it NEVER changes.**

- File path can change (rename)
- Title can change
- Content can change
- Metadata can change
- **ID stays the same forever**

This is critical for:
- Preserving user annotations, bookmarks, and highlights
- Maintaining URL stability
- Avoiding orphaned references

### 3. Minimal Re-indexing

Ingestion is expensive (embeddings, segmentation, search indexing). The system should:
- Never re-index paragraphs whose content hasn't changed
- Use `content_hash` to detect changes at paragraph level
- Preserve embeddings for unchanged paragraphs
- Only regenerate embeddings for modified content

## Architecture Components

### Library Watcher (`api/services/library-watcher.js`)

Watches the library directory for file changes using chokidar.

**Events handled:**
- `add` - New file added → trigger ingestion
- `change` - File modified → trigger ingestion (with hash check)
- `unlink` - File deleted → remove document

**Configuration:**
- `ignoreInitial: true` - Don't process existing files on startup
- `awaitWriteFinish` - Wait for file writes to complete before triggering
- Debounce: 1000ms stability threshold

### Document Ingester (`api/services/ingester.js`)

Processes markdown files and updates database/search index.

**Key behaviors:**
1. Look up existing document by `file_path` first
2. If found, use the existing `id` (never generate new one)
3. Compute `file_hash` to detect content changes
4. If `file_hash` matches, skip entirely (return `{ skipped: true }`)
5. If content changed, segment and update paragraphs

**ID Resolution:**
```javascript
// 1. Look up by file_path
const existingDoc = await queryOne(
  'SELECT id, file_hash FROM docs WHERE file_path = ?',
  [relativePath]
);

// 2. Use existing ID or generate new one ONCE
const documentId = existingDoc?.id || generateNewId(relativePath);

// 3. ID never changes after this
```

### Content Hash (`file_hash`)

SHA-256 hash of the full file content. Used to:
- Skip ingestion of unchanged files
- Detect when re-ingestion is actually needed

### Paragraph Content Hash (`content_hash`)

Each paragraph has its own hash. Used to:
- Skip embedding regeneration for unchanged paragraphs
- Identify which specific paragraphs changed

## File Operations

### Editing Content (via admin UI)

1. User edits content in DocumentEditor
2. PUT to `/api/library/documents/:id/raw`
3. Backend writes to file atomically (temp file → rename)
4. Calls `ingestDocument()` to update DB/search
5. Watcher may also see the change, but `file_hash` prevents double-processing

### Renaming Files (via admin UI)

1. User changes filename in DocumentEditor
2. PUT to `/api/library/documents/:id/raw` with `newFilename`
3. Backend:
   - Writes content (if changed)
   - Renames file using `fs.rename()`
   - Updates `file_path` in database
   - Calls `ingestDocument()` with new path
4. Watcher sees:
   - `unlink` on old path → no doc found (path already updated)
   - `add` on new path → finds doc by new `file_path`, hash matches → skipped

**Important:** Document ID remains unchanged throughout rename.

### Manual File Edits (outside admin UI)

1. User edits file directly on filesystem
2. Watcher detects change
3. Calls `ingestDocument()`
4. If `file_hash` unchanged → skip
5. If changed → re-process paragraphs

## Database Schema (docs table)

| Column | Purpose |
|--------|---------|
| `id` | Immutable document identifier |
| `file_path` | Relative path from library root (can change on rename) |
| `file_hash` | SHA-256 of full file content |
| `updated_at` | Last modification timestamp |
| `title`, `author`, etc. | Metadata from frontmatter |

## Synchronization Guarantees

1. **No data loss:** Files are never modified except through explicit user action
2. **Idempotent:** Running ingestion multiple times produces same result
3. **Efficient:** Unchanged content is never re-processed
4. **Consistent:** Database always reflects current file state

## Error Handling

- If ingestion fails, file is unchanged (safe to retry)
- If rename fails after content write, error reported (content still saved)
- If search indexing fails, database still updated (eventually consistent)

## Future Improvements

- [ ] Migrate `id` from TEXT to INTEGER (auto-increment)
- [ ] Add `modified_at` timestamp comparison for faster skip checks
- [ ] Implement batch ingestion for bulk operations
- [ ] Add webhook notifications for sync events
