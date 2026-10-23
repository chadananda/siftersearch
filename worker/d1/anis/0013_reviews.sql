-- Reviews of Anís's letters and his REFLECTIONS (Chad 10-23: "Liliane is helping test Anís (email), so make sure to carefully
-- check each Anís answer to see if we could have done better. If so, fix, and then have Anís send a follow-up email as a
-- reflection on what he could have done better."). One row per reviewed letter: the verdict, and the reflection (follow-up
-- letter) that answered it, if any — at most one per letter. Watched readers: setting reflection_readers (comma list);
-- reflections go ONLY to them (worker/mail/reviews.js). The hourly cron queues every new letter to a watched reader as
-- status 'pending' so none is missed; the runbook is planning/anis-liliane-reviews.md.
CREATE TABLE mail_reviews (
  id INTEGER PRIMARY KEY,
  letter_id INTEGER NOT NULL UNIQUE,    -- mail_messages.id of Anís's letter (direction out, sent)
  reader TEXT NOT NULL,                 -- the reader's address
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewed
  verdict TEXT,                         -- good | could be better | wrong
  severity TEXT,                        -- none | low | medium | high
  summary TEXT,                         -- the issues, one line each
  reflection_id INTEGER,                -- mail_messages.id of the follow-up that answered it (null: none sent)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX idx_mail_reviews_status ON mail_reviews(status, reader);
INSERT OR IGNORE INTO mail_settings (key, value, note) VALUES
  ('reflection_readers', 'liliane.saberin@gmail.com', 'readers whose Anís letters are reviewed one by one; the ONLY addresses a reflection (follow-up) may go to');
