-- Migration: Study Translation Support
-- Created: 2026-01-03
-- Purpose: Add columns for literal/study translations with AI-generated linguistic notes

-- Add study translation column for literal word-by-word translation
-- This is separate from 'translation' which stores fluent reading translations
ALTER TABLE content ADD COLUMN study_translation TEXT;

-- Add study notes column for linguistic annotations (JSON)
-- Structure: { "segments": [{ "original": "...", "literal": "...", "notes": "..." }] }
ALTER TABLE content ADD COLUMN study_notes TEXT;

-- Index for efficiently finding documents with study translations
CREATE INDEX IF NOT EXISTS idx_content_study_translation
  ON content(doc_id) WHERE study_translation IS NOT NULL;
