-- Migration: system_user
-- Created: 2026-01-01
-- Purpose: Create system user for API/automation jobs that don't have a real user

-- Insert system user with id=0 for jobs created via API using DEPLOY_SECRET
-- The id=0 is used as a convention for system-level operations
-- Note: SQLite autoincrement starts at 1, so 0 won't conflict with normal users
INSERT OR IGNORE INTO users (id, email, password_hash, name, tier, email_verified, approved_at)
VALUES (0, 'system@siftersearch.com', 'SYSTEM_USER_NO_LOGIN', 'System', 'admin', 1, datetime('now'));
