-- Shared Anís discussions (P3): sanitized conversations / single answers published at anis.oceanlibrary.com/d/<slug>.
-- status 'draft' = the reader's preview (never served; pruned after a day), 'published' = public. owner_hash = SHA-256 of the
-- owner key the widget keeps (unpublish = delete the row). turns = JSON [{role, content}] AFTER sanitizing — the raw text is never stored.
CREATE TABLE IF NOT EXISTS anis_shared (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  turns TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'answer',
  status TEXT NOT NULL DEFAULT 'draft',
  owner_hash TEXT NOT NULL,
  owner_email TEXT,
  source_conversation TEXT,
  source_round INTEGER,
  site TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS anis_shared_status ON anis_shared (status, created_at);
CREATE INDEX IF NOT EXISTS anis_shared_source ON anis_shared (source_conversation);
