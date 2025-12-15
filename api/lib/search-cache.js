/**
 * Search Results Cache
 *
 * Caches complete search responses (plan + sources + analysis) by query string.
 * Bypasses both planning and analysis AI calls for repeated queries.
 *
 * TTL is configurable and should be short enough to reflect library updates.
 */

import { createHash } from 'crypto';
import { query, queryOne } from './db.js';
import { logger } from './logger.js';
import { config } from './config.js';

// Default TTL: 4 hours (library updates should invalidate within reasonable time)
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Normalize query for consistent cache keys
 * - Lowercase
 * - Collapse whitespace
 * - Trim
 */
function normalizeQuery(q) {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Generate cache key hash from normalized query
 */
function hashQuery(q) {
  const normalized = normalizeQuery(q);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get cached search results
 * @param {string} queryText - The search query
 * @returns {Object|null} Cached response or null if not found/expired
 */
export async function getCachedSearch(queryText) {
  // Disable cache in dev mode for easier testing
  if (config.isDevMode) {
    return null;
  }

  const hash = hashQuery(queryText);

  try {
    const cached = await queryOne(
      `SELECT id, response, created_at, expires_at
       FROM search_cache
       WHERE query_hash = ? AND expires_at > CURRENT_TIMESTAMP`,
      [hash]
    );

    if (!cached) {
      return null;
    }

    // Update hit count and last_hit_at
    await query(
      `UPDATE search_cache
       SET hit_count = hit_count + 1, last_hit_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cached.id]
    );

    const response = JSON.parse(cached.response);

    logger.info({
      queryText: queryText.substring(0, 50),
      cacheAge: Date.now() - new Date(cached.created_at).getTime()
    }, 'Search cache hit');

    return {
      ...response,
      cached: true,
      cacheAge: Date.now() - new Date(cached.created_at).getTime()
    };
  } catch (err) {
    logger.warn({ err, queryText }, 'Search cache lookup failed');
    return null;
  }
}

/**
 * Store search results in cache
 * @param {string} queryText - The search query
 * @param {Object} response - The complete search response to cache
 * @param {number} ttlMs - Time to live in milliseconds (default 4 hours)
 */
export async function setCachedSearch(queryText, response, ttlMs = DEFAULT_TTL_MS) {
  const hash = hashQuery(queryText);
  const normalized = normalizeQuery(queryText);

  // Calculate expiration
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  // Prepare response for storage (remove any existing cache flags)
  const { cached, cacheAge, ...cleanResponse } = response;

  try {
    await query(
      `INSERT INTO search_cache (query_hash, query_text, response, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(query_hash) DO UPDATE SET
         response = excluded.response,
         expires_at = excluded.expires_at,
         created_at = CURRENT_TIMESTAMP,
         hit_count = 0`,
      [hash, normalized, JSON.stringify(cleanResponse), expiresAt]
    );

    logger.info({
      queryText: queryText.substring(0, 50),
      ttlMs,
      expiresAt
    }, 'Search results cached');
  } catch (err) {
    logger.warn({ err, queryText }, 'Failed to cache search results');
  }
}

/**
 * Invalidate all cached searches (call after library updates)
 */
export async function invalidateSearchCache() {
  try {
    const result = await query('DELETE FROM search_cache');
    logger.info({ deleted: result.changes }, 'Search cache invalidated');
    return result.changes;
  } catch (err) {
    logger.error({ err }, 'Failed to invalidate search cache');
    return 0;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache() {
  try {
    const result = await query(
      'DELETE FROM search_cache WHERE expires_at < CURRENT_TIMESTAMP'
    );
    if (result.changes > 0) {
      logger.info({ deleted: result.changes }, 'Expired cache entries cleaned up');
    }
    return result.changes;
  } catch (err) {
    logger.warn({ err }, 'Cache cleanup failed');
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total_entries,
        SUM(hit_count) as total_hits,
        AVG(hit_count) as avg_hits_per_entry,
        COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_entries
      FROM search_cache
    `);
    return stats;
  } catch (err) {
    logger.warn({ err }, 'Failed to get cache stats');
    return null;
  }
}

export default {
  getCachedSearch,
  setCachedSearch,
  invalidateSearchCache,
  cleanupExpiredCache,
  getCacheStats
};
