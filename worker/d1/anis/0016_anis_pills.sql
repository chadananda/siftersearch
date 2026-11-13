-- Follow-up pills shown under a reply, each pinned to the research set that backs it (Chad 11-13: every pill backed by a cached answer).
-- key = hash(the reply's opening + the pill's words); a click on the pill resolves to `question` with no restatement.
CREATE TABLE IF NOT EXISTS anis_pills (
  key TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  set_id INTEGER,
  at INTEGER NOT NULL
);
