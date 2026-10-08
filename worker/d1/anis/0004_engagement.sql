-- Engagement rules (worker/mail/rules.js): settings changeable without a deploy, the alpha allowlist, and people who
-- paused letters or asked to stop (hash of the address only). Letters gain a kind: reply | outreach.
CREATE TABLE mail_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, note TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO mail_settings (key, value, note) VALUES
  ('outreach_enabled', 'off', 'kill switch: Anís never writes first while off'),
  ('outreach_allowlist_only', 'on', 'alpha: outreach only to mail_allowlist'),
  ('cadence_days', '3,5,12,25,44', 'nth outreach allowed this many days after their last message; then quiet'),
  ('per_person_daily_cap', '3', 'letters of any kind per address per 24 h'),
  ('global_daily_cap', '200', 'letters of any kind per 24 h');
CREATE TABLE mail_allowlist (email TEXT PRIMARY KEY, note TEXT, added_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO mail_allowlist (email, note) VALUES ('chadananda@gmail.com', 'Chad');
CREATE TABLE mail_stop (email_hash TEXT PRIMARY KEY, reason TEXT NOT NULL, at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE mail_messages ADD COLUMN kind TEXT;
