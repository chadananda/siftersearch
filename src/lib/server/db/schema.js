/**
 * Database Schema Definitions
 * 
 * This file contains all SQL schema definitions for the application.
 * These schemas are applied automatically when the database is initialized.
 */

// Core content tables schema
export const CONTENT_SCHEMA = `
-- Content Blocks Table
CREATE TABLE IF NOT EXISTS content_blocks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  vector BLOB,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_type TEXT,
  collection_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Collections Table
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_content_blocks_document_id ON content_blocks(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id);
`;

// API-related tables schema
export const API_SCHEMA = `
-- API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_used_at TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(clerk_id)
);

-- Create index on API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_site ON api_keys(site_id);

-- Search Logs Table
CREATE TABLE IF NOT EXISTS search_logs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  api_key_id TEXT,
  site_id TEXT,
  user_id TEXT,
  search_type TEXT DEFAULT 'basic',
  results_count INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(clerk_id)
);

-- Create index on search logs
CREATE INDEX IF NOT EXISTS idx_search_logs_api_key ON search_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_site ON search_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);
`;

// User and authentication tables schema
export const AUTH_SCHEMA = `
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'librarian', 'editor', 'user')),
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Create index on users
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Sites Table
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  user_id TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(clerk_id)
);

-- Create index on sites
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);
`;

// Combine all schemas
export const COMPLETE_SCHEMA = `
${CONTENT_SCHEMA}
${API_SCHEMA}
${AUTH_SCHEMA}
`;
