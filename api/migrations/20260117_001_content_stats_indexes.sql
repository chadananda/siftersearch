-- Performance indexes for content table stats queries
-- These indexes speed up the /api/library/stats endpoint pipeline status queries

-- Index for counting paragraphs needing embeddings (with length filter)
-- Reduces query time from 7.5s to 0.7s on 800k row table
CREATE INDEX IF NOT EXISTS idx_content_embed_length
  ON content(embedding, deleted_at, (LENGTH(text) <= 6000))
  WHERE embedding IS NULL AND deleted_at IS NULL;

-- Index for counting unique hashes needing embeddings (with length filter)
-- Reduces query time from 12s to 0.7s on 800k row table
CREATE INDEX IF NOT EXISTS idx_content_hash_embed_length
  ON content(normalized_hash, embedding, deleted_at, (LENGTH(text) <= 6000))
  WHERE embedding IS NULL AND deleted_at IS NULL;

-- Index for oversized content count (paragraphs that need re-segmentation)
CREATE INDEX IF NOT EXISTS idx_content_oversized
  ON content(normalized_hash, embedding, deleted_at, (LENGTH(text) > 6000))
  WHERE embedding IS NULL AND deleted_at IS NULL;
