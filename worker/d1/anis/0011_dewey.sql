-- Dewey's mail (dewey@siftersearch.com, Chad 2026-10-23): inbound through Cloudflare Email Routing → the Worker's email()
-- handler, outbound through ZeptoMail. Same mail_messages table, mailbox 'dewey'; for Dewey's outbound rows ses_message_id
-- holds ZeptoMail's request_id. Attachments live in R2 (MEDIA_BUCKET, dewey-mail/…) until tower has taken them.
CREATE TABLE mail_attachments (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL,          -- mail_messages.id
  name TEXT, content_type TEXT, size INTEGER,
  r2_key TEXT,                          -- null once delivered to tower and deleted
  status TEXT NOT NULL DEFAULT 'stored',  -- stored | delivered | skipped
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mail_att_msg ON mail_attachments(message_id);
INSERT OR IGNORE INTO mail_settings (key, value, note) VALUES
  ('dewey_mail', 'off', 'on: Dewey processes contributor mail and replies; off: mail is stored only'),
  ('dewey_per_sender_daily', '10', 'letters from one contributor Dewey works on per 24 h; more are stored, not processed'),
  ('dewey_stranger_reply_days', '30', 'a non-contributor gets the how-to-contribute reply at most once in this many days'),
  ('dewey_stranger_daily_cap', '40', 'how-to-contribute replies per 24 h, all senders');
