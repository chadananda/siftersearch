-- AI Usage Tracking Table
-- Track all AI API calls for cost monitoring and optimization

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Provider/Model
  provider TEXT NOT NULL,        -- openai, anthropic, ollama
  model TEXT NOT NULL,           -- gpt-4o, claude-3-haiku, etc.
  service_type TEXT NOT NULL,    -- chat, embedding, tts

  -- Token Usage
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  -- Cost (calculated from model pricing)
  estimated_cost_usd REAL DEFAULT 0,

  -- Context
  caller TEXT,                   -- agent-sifter, translation, indexer
  success INTEGER DEFAULT 1,     -- 0 = failed
  error_message TEXT,

  -- Optional relations
  user_id INTEGER,
  job_id TEXT,
  document_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_caller ON ai_usage(caller);
CREATE INDEX IF NOT EXISTS idx_ai_usage_success ON ai_usage(success);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage(provider);
