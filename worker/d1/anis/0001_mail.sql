-- Anís mail (anis@oceanlibrary.com via Amazon SES us-west-2). One row per message in or out; SES events per message;
-- addresses that hard-bounced or complained are never mailed again.
CREATE TABLE mail_messages (
  id INTEGER PRIMARY KEY,
  direction TEXT NOT NULL,              -- in | out
  status TEXT NOT NULL,                 -- in: new | handled | spam ; out: draft | sent | failed | suppressed
  ses_message_id TEXT,                  -- SES id (out: from SendEmail; in: receipt mail.messageId)
  message_id TEXT,                      -- RFC 5322 Message-ID
  in_reply_to TEXT,
  thread_key TEXT,                      -- first References id, else In-Reply-To, else own Message-ID
  from_addr TEXT, from_name TEXT, to_addr TEXT,
  subject TEXT, text TEXT, html TEXT,
  s3_key TEXT UNIQUE,                   -- inbound raw MIME in s3://oceanlibrary-anis-inbound
  spam_verdict TEXT, virus_verdict TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX idx_mail_thread ON mail_messages(thread_key);
CREATE INDEX idx_mail_status ON mail_messages(direction, status);
CREATE INDEX idx_mail_ses ON mail_messages(ses_message_id);

CREATE TABLE mail_events (
  id INTEGER PRIMARY KEY,
  sns_id TEXT UNIQUE,                   -- SNS MessageId: redelivery is ignored
  ses_message_id TEXT,
  event_type TEXT NOT NULL,             -- Send Delivery Bounce Complaint Reject DeliveryDelay Open Click RenderingFailure
  recipient TEXT,
  detail_json TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mail_events_msg ON mail_events(ses_message_id);
CREATE INDEX idx_mail_events_type ON mail_events(event_type, at);

CREATE TABLE mail_suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,                 -- bounce | complaint
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
