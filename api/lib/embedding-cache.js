/**
 * Embedding Cache
 *
 * Manages a separate SQLite database for caching embeddings.
 * Uses better-sqlite3 for synchronous, high-performance access.
 * BLOBs come back as Buffer consistently (no Uint8Array conversion needed).
 */

import Database from 'better-sqlite3';
import { instrumentDb } from './db.js';

let db = null;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS embedding_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_hash TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  embedding_version TEXT NOT NULL DEFAULT 'v1',
  embedding_blob BLOB NOT NULL,
  source_count INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized_hash, embedding_model, embedding_dim, embedding_version)
)`;

export async function initEmbeddingCache(dbPath) {
  const path = dbPath.startsWith('file:') ? dbPath.slice(5) : dbPath;
  db = instrumentDb(new Database(path), 'embedding-cache');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  db.exec(CREATE_TABLE_SQL);
  return db;
}

export async function insertEmbedding(normalizedHash, model, dim, version, blob) {
  return db.prepare(`
    INSERT INTO embedding_cache
        (normalized_hash, embedding_model, embedding_dim, embedding_version, embedding_blob)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(normalized_hash, embedding_model, embedding_dim, embedding_version)
      DO UPDATE SET source_count = source_count + 1,
                    last_accessed_at = CURRENT_TIMESTAMP
  `).run(normalizedHash, model, dim, version, blob);
}

export async function getEmbedding(normalizedHash, model, dim, version = 'v1') {
  const row = db.prepare(`
    SELECT embedding_blob FROM embedding_cache
    WHERE normalized_hash = ? AND embedding_model = ? AND embedding_dim = ? AND embedding_version = ?
    LIMIT 1
  `).get(normalizedHash, model, dim, version);
  if (!row) return null;
  const raw = row.embedding_blob;
  if (raw instanceof Buffer) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return raw ? Buffer.from(raw) : null;
}

export async function batchInsertEmbeddings(entries) {
  const stmt = db.prepare(`
    INSERT INTO embedding_cache
        (normalized_hash, embedding_model, embedding_dim, embedding_version, embedding_blob)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(normalized_hash, embedding_model, embedding_dim, embedding_version)
      DO UPDATE SET source_count = source_count + 1,
                    last_accessed_at = CURRENT_TIMESTAMP
  `);
  const txn = db.transaction((items) => items.map(({ normalizedHash, model, dim, version = 'v1', blob }) => stmt.run(normalizedHash, model, dim, version, blob)));
  return txn(entries);
}

export async function getEmbeddingCount() {
  const row = db.prepare('SELECT COUNT(*) as count FROM embedding_cache').get();
  return Number(row.count);
}

export function truncateAndNormalize512(blob3072) {
  const slice = blob3072.slice(0, 512);
  let sumSq = 0;
  for (let i = 0; i < 512; i++) sumSq += slice[i] * slice[i];
  const scale = 1 / Math.sqrt(sumSq);
  const out = new Float32Array(512);
  for (let i = 0; i < 512; i++) out[i] = slice[i] * scale;
  return out;
}

export async function closeEmbeddingCache() {
  if (db) {
    db.close();
    db = null;
  }
}
