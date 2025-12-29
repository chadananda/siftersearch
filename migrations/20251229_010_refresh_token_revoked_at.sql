-- Migration: refresh_token_revoked_at
-- Created: 2024-12-29
-- Description: Add revoked_at column to refresh_tokens for grace period tracking

-- Check if revoked_at column exists, if not add it
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- so we use a pragma check approach in the migration runner

ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME;
