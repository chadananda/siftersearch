-- Add Cloudflare sync tracking to redirects table
-- Enables hybrid sync: push to CF on create + periodic full sync

-- Add columns for CF sync status
ALTER TABLE redirects ADD COLUMN cf_synced INTEGER DEFAULT 0;
ALTER TABLE redirects ADD COLUMN cf_synced_at TEXT;

-- Index for finding unsynced redirects
CREATE INDEX IF NOT EXISTS idx_redirects_cf_synced ON redirects(cf_synced);
