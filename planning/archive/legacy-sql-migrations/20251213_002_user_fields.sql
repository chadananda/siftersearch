-- Migration: user_fields
-- Created: 2024-12-13
-- Purpose: Add search_count to users, context to paragraphs, auth_provider and email_verified

-- Add search_count to users table for tracking verified user queries
ALTER TABLE users ADD COLUMN search_count INTEGER DEFAULT 0;

-- Add auth_provider to track how user authenticated (email, google, github)
-- OAuth providers auto-verify email
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email';

-- Add email_verified flag (OAuth users are auto-verified)
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Note: context field for paragraphs moved to separate migration 20251213_004
