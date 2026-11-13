-- Anis edge store: research sets (passage snapshots), question log, conversations. Vectors live in Vectorize (id = anis_research_sets.id).
CREATE TABLE IF NOT EXISTS anis_research_sets (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  qhash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','curated','stale')),
  passages TEXT NOT NULL DEFAULT '[]',
  hits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS anis_question_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  question TEXT NOT NULL,
  qhash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('hit','related','miss')),
  similarity REAL,
  set_id INTEGER,
  site TEXT,
  channel TEXT,
  ms INTEGER,
  format TEXT
);
CREATE INDEX IF NOT EXISTS idx_anis_question_log_at ON anis_question_log(at);
CREATE TABLE IF NOT EXISTS anis_conversations (
  id TEXT PRIMARY KEY,
  site TEXT,
  channel TEXT,
  reader TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS anis_turns (
  conversation_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, round, role)
);
