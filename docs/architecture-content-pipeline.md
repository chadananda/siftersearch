# Content Pipeline Architecture

## Overview

SifterSearch uses a **unidirectional content pipeline** where SQLite is the source of truth and Meilisearch is a read-only search index.

```
┌─────────────┐     ┌───────────┐     ┌─────────────────┐     ┌─────────────┐
│ Source File │ ──► │ Ingester  │ ──► │ SQLite (Content │ ──► │ Meilisearch │
│ (any format)│     │           │     │   DB - truth)   │     │ (index only)│
└─────────────┘     └───────────┘     └─────────────────┘     └─────────────┘
     PDF/MD/HTML        converts           docs table            reads from
     non-segmented      & segments         content table         SQLite only
```

## Key Principles

### 1. SQLite is the Source of Truth

- **`docs` table**: Document metadata (title, author, religion, collection, file_path, etc.)
- **`content` table**: Processed, searchable paragraphs with sentence markers

The content table contains **processed, searchable text** - not raw file contents. Original files may be PDF, HTML, markdown, or unpunctuated classical texts that require AI segmentation.

### 2. Meilisearch is a Search Index Only

Meilisearch:
- **ONLY reads from SQLite** `content` table
- **Never touches original files**
- **Only knows `doc_id`** - no file paths, no raw text input
- Is **rebuildable** from SQLite at any time

If Meilisearch is lost, it can be completely rebuilt from SQLite.

### 3. File Paths are Always Relative

The `file_path` column in `docs` table:
- Is **relative to `config.library.basePath`**
- Example: `Baha'i/Core Tablets/The Báb/002-tablets.md`
- **Never absolute** like `/Users/chad/Dropbox/...`

This ensures the library is **portable** across different machines where Dropbox/library may be installed in different locations.

To get the full path:
```javascript
const fullPath = path.join(config.library.basePath, doc.file_path);
```

### 4. Ingestion Flow

```
1. Read source file (PDF, HTML, MD, etc.)
2. Convert to markdown if needed
3. Parse frontmatter for metadata
4. Detect language (Arabic, Farsi, English, etc.)
5. Segment into paragraphs:
   - Punctuated text: split on sentence boundaries
   - Unpunctuated RTL (classical Arabic/Farsi): AI segmentation
6. Add sentence markers for translation anchoring
7. Store in SQLite:
   - docs table: metadata + relative file_path
   - content table: paragraphs with sentence markers
8. (Later) Sync worker pushes content → Meilisearch
```

### 5. Indexing Flow (Meilisearch)

```
1. Read from SQLite content table by doc_id
2. Push paragraphs to Meilisearch paragraphs index
3. Push document summary to Meilisearch documents index
```

The indexer:
- Takes `doc_id` as input
- Reads processed content from SQLite
- Pushes to Meilisearch
- **Never reads source files**
- **Never receives raw text directly**

## Component Responsibilities

### Ingester (`api/services/ingester.js`)

- Reads source files
- Converts/processes content
- Handles AI segmentation for unpunctuated texts
- Writes to SQLite `docs` and `content` tables
- Stores **relative** file_path

### Indexer (`api/services/indexer.js`)

- Reads from SQLite `content` table
- Pushes to Meilisearch
- **Should not** accept raw text (architectural violation)
- **Should not** know about file paths

### Sync Worker (`api/workers/sync.js`)

- Monitors SQLite for unsynced content
- Pushes to Meilisearch in batches
- Marks content as synced

## Database Schema

### docs table
```sql
- id: INTEGER PRIMARY KEY
- file_path: TEXT (relative to basePath)
- file_hash: TEXT (hash of entire file - detects ANY change)
- body_hash: TEXT (hash of body only - detects CONTENT change)
- title, author, religion, collection, language, year
- paragraph_count: INTEGER
- slug: TEXT (URL-friendly identifier)
```

### Change Detection Strategy

The ingester uses two hashes for smart change detection:

1. **`file_hash`**: SHA256 of entire file (frontmatter + body)
   - If unchanged → skip entirely (no DB updates)

2. **`body_hash`**: SHA256 of body content only (after frontmatter)
   - If file changed but body unchanged → metadata-only update
   - Skips expensive AI segmentation for content
   - Updates only the docs table metadata fields

This allows editing frontmatter (title, author, etc.) without re-processing content:
```
Scenario: User edits document title in frontmatter
  file_hash: changed (file modified)
  body_hash: unchanged (content same)
  Result: UPDATE docs metadata, skip content re-processing
```

### content table
```sql
- id: TEXT PRIMARY KEY
- doc_id: INTEGER (foreign key to docs)
- paragraph_index: INTEGER
- text: TEXT (with sentence markers like ⁅s1⁆...⁅/s1⁆)
- content_hash: TEXT
- heading: TEXT (section heading if any)
- blocktype: TEXT (paragraph, verse, prayer, etc.)
- embedding: BLOB (vector embedding for semantic search)
- embedding_model: TEXT (e.g., "text-embedding-3-large")
- synced: INTEGER (0/1 - pushed to Meilisearch?)
```

## Embeddings Strategy

Embeddings are stored in SQLite `content.embedding` column, NOT generated on-the-fly.

### Why store embeddings in SQLite?

1. **Cost**: Embedding generation is expensive (OpenAI API calls)
2. **Rebuild capability**: If Meilisearch is cleared/corrupted, we can re-index without regenerating embeddings
3. **Consistency**: Same embeddings are always used for the same content
4. **Quality**: We always use the best available model (currently `text-embedding-3-large` with 3072 dimensions)

### Embedding flow

Embeddings are generated **separately** from ingestion to decouple expensive API calls:

```
1. Ingestion: Parse/segment text → store in content table (NO embeddings yet)
2. Embedding worker: Find unembedded paragraphs → generate via OpenAI → store in content.embedding
3. Indexing: Read content + embeddings from SQLite → push to Meilisearch
4. Rebuild: Read existing embeddings from SQLite → push to Meilisearch (no API calls)
```

This separation allows:
- Fast ingestion without waiting for embedding API calls
- Batch embedding generation for efficiency
- Retry failed embeddings without re-ingesting

### When embeddings are regenerated

- Only when `content_hash` changes (text was modified)
- Never on Meilisearch rebuild
- Never on re-indexing unchanged content

## Common Operations

### Re-ingest a document
```bash
node scripts/reingest-document.js <doc-id>
```

### Re-ingest all documents missing content
```bash
MEILISEARCH_ENABLED=false node scripts/reindex-missing-content.js
```

### Rebuild Meilisearch from SQLite
```bash
node scripts/rebuild-meilisearch-from-sqlite.js
```

## Anti-Patterns (Don't Do This)

1. **Don't store absolute file paths** - breaks portability
2. **Don't pass raw text to indexer** - bypasses SQLite source of truth
3. **Don't read files from indexer** - indexer only reads SQLite
4. **Don't sync Meilisearch → SQLite** - data flows one direction only
5. **Don't assume original file format** - content table has processed text
