-- Migration: initial_schema
-- Created: 2025-12-13
-- Base tables for SifterSearch

-- Users table (registered users)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  tier TEXT DEFAULT 'anonymous',
  search_count INTEGER DEFAULT 0,
  referral_code TEXT,
  referred_by INTEGER,
  preferences TEXT,
  interests TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referred_by) REFERENCES users(id)
);

-- Anonymous users table (for tracking before registration)
CREATE TABLE IF NOT EXISTS anonymous_users (
  id TEXT PRIMARY KEY,
  user_agent TEXT,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  search_count INTEGER DEFAULT 0,
  last_search_query TEXT,
  preferences TEXT,
  interests TEXT,
  converted_to_user_id INTEGER,
  converted_at DATETIME,
  unified_to INTEGER,
  FOREIGN KEY (converted_to_user_id) REFERENCES users(id),
  FOREIGN KEY (unified_to) REFERENCES users(id)
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Search cache table
CREATE TABLE IF NOT EXISTS search_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash TEXT UNIQUE NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  hit_count INTEGER DEFAULT 1,
  last_hit_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_converted ON anonymous_users(converted_to_user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_search_cache_hash ON search_cache(query_hash);
