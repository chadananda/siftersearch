// In-memory LRU+TTL cache for raw Meili search results. Keyed by
// normalized query string. Distinct from api/lib/search-cache.js which
// caches full search RESPONSES (plan + sources + analysis) in SQLite.
//
// Used by api/lib/search.js — keywordSearch and friends consult the
// cache before hitting Meilisearch. Cache invalidation is TTL-only;
// no manual invalidation is required because document changes flow
// through Meilisearch within seconds.
//
// Exports: getCachedSearch, setCachedSearch, clearSearchCache,
//          getSearchCacheStats, POPULAR_QUERIES.
// prewarmCache stays in search.js because it depends on keywordSearch
// (would create a circular import).

import { logger } from '../logger.js';

const SEARCH_CACHE_MAX_SIZE = 500;
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;  // 15 min

const searchCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

function getCacheKey(query) {
  return query.toLowerCase().trim();
}

export function getCachedSearch(query, trackStats = true) {
  const key = getCacheKey(query);
  const cached = searchCache.get(key);

  if (!cached) {
    if (trackStats) cacheMisses++;
    return null;
  }

  // TTL check
  if (Date.now() - cached.timestamp > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    if (trackStats) cacheMisses++;
    return null;
  }

  // LRU touch — move to end
  searchCache.delete(key);
  searchCache.set(key, cached);

  if (trackStats) cacheHits++;
  return cached;
}

export function setCachedSearch(query, hits, estimatedTotalHits) {
  const key = getCacheKey(query);
  while (searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(key, { hits, estimatedTotalHits, timestamp: Date.now() });
}

export function clearSearchCache() {
  searchCache.clear();
  logger.debug('Search cache cleared');
}

export function getSearchCacheStats() {
  const total = cacheHits + cacheMisses;
  return {
    size: searchCache.size,
    maxSize: SEARCH_CACHE_MAX_SIZE,
    ttlMs: SEARCH_CACHE_TTL_MS,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? (cacheHits / total * 100).toFixed(1) + '%' : 'N/A'
  };
}

/**
 * Popular queries to pre-warm on startup. Mirrored core spiritual concepts
 * that show up in user analytics.
 */
export const POPULAR_QUERIES = [
  // Core concepts
  'prayer', 'love', 'God', 'faith', 'peace', 'unity', 'justice', 'truth', 'soul', 'spirit',
  // Common phrases
  'divine unity', 'spiritual growth', 'world peace', 'inner peace', 'purpose of life',
  // Central figures
  "Bahá'u'lláh", "Abdu'l-Baha", 'Shoghi Effendi',
  // Practices
  'meditation', 'fasting', 'pilgrimage'
];
