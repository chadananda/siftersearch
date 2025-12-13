-- Migration: librarian
-- Created: 2024-12-13
-- Description: Tables for Librarian agent functionality

-- Librarian suggestions queue
-- Stores suggestions for admin review (new books, quality issues, etc.)
CREATE TABLE IF NOT EXISTS librarian_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN (
    'new_document',      -- Suggest adding a new document
    'quality_issue',     -- Flag quality problems
    'duplicate',         -- Potential duplicate detected
    'categorization',    -- Suggest recategorization
    'metadata_update',   -- Suggest metadata improvements
    'book_research',     -- Books to research/acquire
    'collection_gap'     -- Gaps in collection coverage
  )),
  data TEXT NOT NULL,           -- JSON with suggestion details
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deferred')),
  admin_notes TEXT,             -- Notes from admin review
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  reviewed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_librarian_suggestions_status ON librarian_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_librarian_suggestions_type ON librarian_suggestions(type);
CREATE INDEX IF NOT EXISTS idx_librarian_suggestions_priority ON librarian_suggestions(priority);

-- Document assets (originals, covers, etc.)
-- Links documents to their storage locations
CREATE TABLE IF NOT EXISTS document_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES indexed_documents(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('original', 'converted', 'cover', 'thumbnail', 'supplement')),
  storage_key TEXT NOT NULL,        -- S3 key/path
  storage_url TEXT,                 -- Public URL if available
  file_name TEXT,                   -- Original filename
  file_size INTEGER,                -- Size in bytes
  content_type TEXT,                -- MIME type
  content_hash TEXT,                -- For deduplication
  metadata TEXT,                    -- JSON with additional metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_assets_document ON document_assets(document_id);
CREATE INDEX IF NOT EXISTS idx_document_assets_type ON document_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_document_assets_hash ON document_assets(content_hash);

-- Ingestion queue
-- Tracks documents being processed by the librarian
CREATE TABLE IF NOT EXISTS ingestion_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Waiting to be processed
    'analyzing',    -- Being analyzed by librarian
    'awaiting_review', -- Needs admin approval
    'approved',     -- Approved for ingestion
    'processing',   -- Being converted/indexed
    'completed',    -- Successfully ingested
    'rejected',     -- Rejected by admin
    'failed'        -- Processing failed
  )),
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url', 'isbn', 'research')),
  source_data TEXT NOT NULL,        -- JSON with source info (file path, URL, ISBN, etc.)
  analysis_result TEXT,             -- JSON with librarian analysis
  suggested_metadata TEXT,          -- JSON with suggested metadata
  target_path TEXT,                 -- Where to place in library
  target_document_id INTEGER REFERENCES indexed_documents(id),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_queue_status ON ingestion_queue(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_queue_source ON ingestion_queue(source_type);

-- Book research cache
-- Caches research results for books to potentially add
CREATE TABLE IF NOT EXISTS book_research_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  religion TEXT NOT NULL,
  topic TEXT,
  research_data TEXT NOT NULL,      -- JSON with book suggestions
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_book_research_religion ON book_research_cache(religion);

-- Add cover_url and isbn to indexed_documents if not exists
-- These columns may already exist, so we use a trick to add them conditionally

-- Check and add cover_url
SELECT CASE
  WHEN (SELECT COUNT(*) FROM pragma_table_info('indexed_documents') WHERE name = 'cover_url') = 0
  THEN 'ALTER TABLE indexed_documents ADD COLUMN cover_url TEXT'
  ELSE 'SELECT 1'
END;

-- Check and add isbn
SELECT CASE
  WHEN (SELECT COUNT(*) FROM pragma_table_info('indexed_documents') WHERE name = 'isbn') = 0
  THEN 'ALTER TABLE indexed_documents ADD COLUMN isbn TEXT'
  ELSE 'SELECT 1'
END;

-- Check and add source_file
SELECT CASE
  WHEN (SELECT COUNT(*) FROM pragma_table_info('indexed_documents') WHERE name = 'source_file') = 0
  THEN 'ALTER TABLE indexed_documents ADD COLUMN source_file TEXT'
  ELSE 'SELECT 1'
END;
