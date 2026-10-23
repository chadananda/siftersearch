-- Dewey's response rules, receipts, "now live" notes and book requests (Chad 2026-10-23). Inbound statuses gain: bounce, list,
-- cc, duplicate (door rules), quarantined / held / silent (screen + reply rules), queued / merged (debounce). The screen's verdict
-- and cost ride on the row (meta_json). dewey_live = items whose "now live" note went out; dewey_request_stop = paused requests.
CREATE TABLE dewey_live (item_id INTEGER PRIMARY KEY, email TEXT NOT NULL, doc_id INTEGER, letter_id INTEGER, notified_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_dewey_live_email ON dewey_live(email, notified_at);
CREATE TABLE dewey_request_stop (email_hash TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT OR IGNORE INTO mail_settings (key, value, note) VALUES
  ('dewey_debounce_quiet_minutes', '3', 'wait this long after a contributor''s LAST letter before answering (letters in pieces → one reply)'),
  ('dewey_debounce_max_minutes', '10', '…but never longer than this after their FIRST unanswered letter'),
  ('dewey_daily_hour_utc', '13', 'hour (UTC) the "now live" notes and book requests are prepared, once a day'),
  ('dewey_live_enabled', 'on', 'one short "now in the library" note per contributor per day, when their emailed works go live'),
  ('dewey_requests_enabled', 'on', 'prepare book requests for prolific contributors'),
  ('dewey_requests_approved', 'off', 'off: requests wait as drafts for Chad (digest → approve link); on: they send automatically'),
  ('dewey_prolific_recent_days', '30', 'prolific = at least dewey_prolific_recent_min accepted items in this many days …'),
  ('dewey_prolific_recent_min', '5', '… or'),
  ('dewey_prolific_total_min', '15', '… at least this many accepted items ever'),
  ('dewey_request_gap_days', '21', 'at most one book-request letter per contributor in this many days'),
  ('dewey_request_idle_days', '90', 'no requests to anyone who has not contributed in this many days');
