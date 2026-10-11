-- Add file_mtime column to track when the source file was last modified
-- This allows distinguishing between:
--   - Newly created files (file_mtime recent)
--   - Modified files (file_mtime recent, but doc existed before)
--   - Bulk re-indexed files (file_mtime old, but created_at recent)

ALTER TABLE docs ADD COLUMN file_mtime TEXT;

-- Create index for efficient filtering by file modification time
CREATE INDEX IF NOT EXISTS idx_docs_file_mtime ON docs(file_mtime);
