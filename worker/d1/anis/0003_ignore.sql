-- Senders whose mail is dropped unread and unstored (Chad 2026-10-07). pattern = a domain (matches it and its
-- subdomains) or a full address. Edit rows to change the rules; no deploy needed. hits/last_hit show it working.
CREATE TABLE mail_ignore (
  pattern TEXT PRIMARY KEY,
  note TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO mail_ignore (pattern, note) VALUES ('bnc.org', 'Chad: completely ignore'), ('usbnc.org', 'Chad: completely ignore');
