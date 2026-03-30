/**
 * API Key Management
 *
 * Database-backed API keys with rate limiting and usage tracking.
 * Keys are stored as SHA-256 hashes; only the prefix is stored in cleartext.
 */

import { createHash, randomBytes } from 'crypto';
import { query, queryOne, queryAll } from './db.js';
import { config } from './config.js';

// In-memory rate limiting (per key hash)
const rateLimitMap = new Map();

function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Ensure the key_value column exists (added to store retrievable keys).
 */
async function ensureKeyValueColumn() {
  try {
    await query(`ALTER TABLE api_keys ADD COLUMN key_value TEXT`);
  } catch {
    // Column already exists
  }
}
let _columnEnsured = false;

/**
 * Generate a new API key for a user.
 * The full key is stored so the user can retrieve it later.
 */
export async function createApiKey(userId, name, options = {}) {
  if (!_columnEnsured) { await ensureKeyValueColumn(); _columnEnsured = true; }

  const rawKey = 'sk_' + randomBytes(32).toString('hex');
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.substring(0, 10);

  const result = await query(
    `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, key_value, rate_limit, permissions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     RETURNING id, name, key_prefix, rate_limit, permissions, created_at`,
    [userId, name, keyHash, keyPrefix, rawKey, options.rateLimit || 1000, JSON.stringify(options.permissions || ['search'])]
  );

  return {
    id: result.lastInsertRowid || result.id,
    key: rawKey,
    name,
    keyPrefix,
    rateLimit: options.rateLimit || 1000
  };
}

/**
 * Validate an API key and return the key record.
 * Also checks rate limiting.
 */
export async function validateApiKey(key) {
  if (!key) return null;

  // Check legacy env-var keys first (backwards compatible)
  if (config.publicApi.apiKeys.includes(key)) {
    return { id: 0, userId: 0, name: 'legacy', rateLimit: config.publicApi.rateLimit, legacy: true };
  }

  const keyHash = hashKey(key);
  const record = await queryOne(
    'SELECT id, user_id, name, key_hash, rate_limit, permissions, request_count, revoked_at FROM api_keys WHERE key_hash = ?',
    [keyHash]
  );

  if (!record || record.revoked_at) return null;

  // Rate limiting
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const usage = rateLimitMap.get(keyHash) || [];
  const recentUsage = usage.filter(ts => ts > hourAgo);

  if (recentUsage.length >= record.rate_limit) {
    return { ...record, rateLimited: true };
  }

  recentUsage.push(now);
  rateLimitMap.set(keyHash, recentUsage);

  // Update usage stats (fire-and-forget)
  query(
    'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP, request_count = request_count + 1 WHERE id = ?',
    [record.id]
  ).catch(() => {});

  return record;
}

/**
 * List API keys for a user (without hashes).
 */
export async function listApiKeys(userId) {
  if (!_columnEnsured) { await ensureKeyValueColumn(); _columnEnsured = true; }
  return queryAll(
    `SELECT id, name, key_prefix, key_value, rate_limit, permissions, request_count, last_used_at, created_at, revoked_at
     FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(keyId, userId) {
  return query(
    'UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [keyId, userId]
  );
}

/**
 * Get all API keys (admin view).
 */
export async function getAllApiKeys() {
  return queryAll(
    `SELECT ak.id, ak.user_id, ak.name, ak.key_prefix, ak.rate_limit, ak.permissions,
            ak.request_count, ak.last_used_at, ak.created_at, ak.revoked_at
     FROM api_keys ak
     ORDER BY ak.created_at DESC`
  );
}
