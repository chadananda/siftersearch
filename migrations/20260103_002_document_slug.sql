-- Add slug column to docs table for unique URL paths
-- Slug format: author_title_lang (e.g., the-bab_address-to-believers_ar)
-- Must be unique within each religion/collection combination

-- Add slug column
ALTER TABLE docs ADD COLUMN slug TEXT;

-- Create unique index for slug within religion/collection
-- This ensures no two documents in the same collection have the same slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_slug_unique
  ON docs(religion, collection, slug)
  WHERE slug IS NOT NULL;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug);
