-- Add context field to paragraphs for AI-generated enrichment
-- The context field stores additional metadata generated through:
-- 1. AI analysis of the paragraph's themes, concepts, and connections
-- 2. Graph analysis linking paragraphs to related content
-- 3. User interaction patterns indicating relevance
--
-- Both text and context are indexed in Meilisearch for search
-- Only text is displayed to users; context enhances retrieval

-- Add context column if it doesn't exist
ALTER TABLE indexed_paragraphs ADD COLUMN context TEXT;

-- Index the context field for text search within SQLite
CREATE INDEX IF NOT EXISTS idx_paragraphs_context ON indexed_paragraphs(context);

-- Track when context was last updated (for incremental enrichment)
ALTER TABLE indexed_paragraphs ADD COLUMN context_updated_at DATETIME;
