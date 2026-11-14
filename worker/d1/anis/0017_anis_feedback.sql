-- A reader's thumbs up / down on one Anís reply (widget action bar, POST /api/chat/feedback). One vote per reply: a second click
-- replaces it, vote 0 withdraws it. round = the reply's question number in its conversation; question = its first 300 chars.
CREATE TABLE IF NOT EXISTS anis_feedback (
  conversation_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (-1, 0, 1)),
  question TEXT,
  site TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, round)
);
CREATE INDEX IF NOT EXISTS idx_anis_feedback_at ON anis_feedback(at);
