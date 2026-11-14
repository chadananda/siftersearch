-- The reader's indications bio (Chad 11-14): what a reader said about themselves, noted by the agent's note_indication tool
-- (worker/anis/bio.js). reader = 'dev:<widget device id>' | 'mail:<emailHash>' | 'conv:<conversationId>' — never a plain email.
-- evidence = the reader's own words (≤120 chars). GET/DELETE /api/chat/bio lets a reader see or erase their own.
CREATE TABLE IF NOT EXISTS anis_indications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  evidence TEXT NOT NULL,
  conversation_id TEXT,
  round INTEGER,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS anis_indications_reader ON anis_indications (reader, at);
