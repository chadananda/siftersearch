/**
 * Embedding Cache
 *
 * Manages a separate SQLite database for caching embeddings.
 * Avoids re-computing expensive embeddings for identical normalized text.
 * Uses @libsql/client matching the project's existing DB pattern.
 *
 * All exported functions operate on the module-level singleton db instance
 * initialized via initEmbeddingCache().
 */

import { createClient } from '@libsql/client';

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

/**
 * Initialize the embedding cache DB at the given path.
 * Creates the file + table if not present. Stores client as module singleton.
 */
export async function initEmbeddingCache(dbPath) {
  const url = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
  db = createClient({ url });
  await db.execute('PRAGMA journal_mode=WAL');
  await db.execute('PRAGMA busy_timeout=30000');
  await db.execute(CREATE_TABLE_SQL);
  return db;
}

/**
 * Insert an embedding. On duplicate key, increments source_count instead of failing.
 */
export async function insertEmbedding(normalizedHash, model, dim, version, blob) {
  const result = await db.execute({
    sql: `INSERT INTO embedding_cache
            (normalized_hash, embedding_model, embedding_dim, embedding_version, embedding_blob)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(normalized_hash, embedding_model, embedding_dim, embedding_version)
          DO UPDATE SET source_count = source_count + 1,
                        last_accessed_at = CURRENT_TIMESTAMP`,
    args: [normalizedHash, model, dim, version, blob],
  });
  return result;
}

/**
 * Retrieve the embedding blob for a hash+model+dim combination, or null if not found.
 * Uses default version 'v1'.
 */
export async function getEmbedding(normalizedHash, model, dim, version = 'v1') {
  const result = await db.execute({
    sql: `SELECT embedding_blob FROM embedding_cache
          WHERE normalized_hash = ? AND embedding_model = ? AND embedding_dim = ? AND embedding_version = ?
          LIMIT 1`,
    args: [normalizedHash, model, dim, version],
  });
  if (!result.rows.length) return null;
  const raw = result.rows[0].embedding_blob;
  // libsql returns BLOB as Uint8Array — convert to Buffer for consistency
  if (raw instanceof Buffer) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === 'string') return Buffer.from(raw, 'binary');
  return raw ? Buffer.from(raw) : null;
}

/**
 * Batch insert multiple embeddings in a single transaction.
 * Each entry: { normalizedHash, model, dim, version, blob }
 */
export async function batchInsertEmbeddings(entries) {
  const statements = entries.map(({ normalizedHash, model, dim, version = 'v1', blob }) => ({
    sql: `INSERT INTO embedding_cache
            (normalized_hash, embedding_model, embedding_dim, embedding_version, embedding_blob)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(normalized_hash, embedding_model, embedding_dim, embedding_version)
          DO UPDATE SET source_count = source_count + 1,
                        last_accessed_at = CURRENT_TIMESTAMP`,
    args: [normalizedHash, model, dim, version, blob],
  }));
  return db.batch(statements, 'write');
}

/**
 * Return total number of cached embeddings.
 */
export async function getEmbeddingCount() {
  const result = await db.execute('SELECT COUNT(*) as count FROM embedding_cache');
  return Number(result.rows[0].count);
}

/**
 * Truncate a 3072-dim Float32Array to 512 dims and L2-normalize the result.
 * Returns a new Float32Array of length 512.
 */
export function truncateAndNormalize512(blob3072) {
  const slice = blob3072.slice(0, 512);
  let sumSq = 0;
  for (let i = 0; i < 512; i++) sumSq += slice[i] * slice[i];
  const scale = 1 / Math.sqrt(sumSq);
  const out = new Float32Array(512);
  for (let i = 0; i < 512; i++) out[i] = slice[i] * scale;
  return out;
}

/**
 * Close the embedding cache DB connection.
 */
export async function closeEmbeddingCache() {
  if (db) {
    db.close();
    db = null;
  }
}
