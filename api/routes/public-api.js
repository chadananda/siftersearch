/**
 * Public Search API v1
 *
 * Clean, well-documented API for external applications.
 * Requires API key authentication via X-API-Key header.
 * Keys are managed per-user via database (see api/lib/api-keys.js).
 *
 * Endpoints:
 *   POST /api/v1/search - Hybrid search with AI analysis
 *   POST /api/v1/search/quick - Fast keyword search (no AI)
 *   GET /api/v1/collections - List available collections
 *   GET /api/v1/paragraph/:id - Get a specific paragraph
 *   GET /api/v1/health - API health check
 */

import { hybridSearch, keywordSearch, getStats } from '../lib/search.js';
import { analyzePassagesParallel } from '../lib/parallel-analyzer.js';
import { rerank } from '../lib/reranker.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/errors.js';
import { validateApiKey } from '../lib/api-keys.js';
import { queryOne, userQuery, userQueryOne } from '../lib/db.js';
import { isUserBillable, getSubscriptionStatus, recordUsage } from '../lib/billing.js';

/** Log search to search_log table (fire-and-forget) */
function logApiSearch({ query, apiKeyId, resultCount, durationMs, searchType, filters }) {
  userQuery(
    `INSERT INTO search_log (query, api_key_id, result_count, duration_ms, search_type, filters, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [query, apiKeyId || null, resultCount || 0, durationMs || 0, searchType || 'api', filters ? JSON.stringify(filters) : null]
  ).catch(err => logger.warn({ err }, 'Failed to log API search'));
}

/**
 * API key authentication preHandler
 */
async function apiKeyAuth(request, reply) {
  // Health endpoint is public — skip auth
  if (request.url.endsWith('/health')) return;

  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    reply.code(401).send({ error: 'API key required. Set X-API-Key header.', code: 'unauthorized' });
    throw new ApiError('API key required', 401);
  }

  const keyRecord = await validateApiKey(apiKey);

  if (!keyRecord) {
    reply.code(403).send({ error: 'Invalid API key', code: 'unauthorized' });
    throw new ApiError('Invalid API key', 403);
  }

  if (keyRecord.rateLimited) {
    reply.code(429).send({
      error: `Rate limit exceeded. Max ${keyRecord.rate_limit} requests per hour.`,
      code: 'rate_limit_exceeded'
    });
    throw new ApiError('Rate limit exceeded', 429);
  }

  // Attach key info to request for logging
  request.apiKeyId = keyRecord.id;
  request.apiKeyName = keyRecord.name;

  // Look up owning user and check subscription (skip for legacy keys)
  if (!keyRecord.legacy && keyRecord.user_id) {
    const keyUser = await userQueryOne('SELECT id, tier FROM users WHERE id = ?', [keyRecord.user_id]);
    request.apiKeyUserId = keyUser?.id;
    request.apiKeyUserTier = keyUser?.tier;
    if (isUserBillable(keyUser?.tier)) {
      const sub = await getSubscriptionStatus(keyUser.id);
      if (!sub || sub.status !== 'active') {
        reply.code(402).send({ error: 'Active API subscription required.', code: 'subscription_required' });
        throw new ApiError('Subscription required', 402);
      }
    }
  }
}

export default async function publicApiRoutes(fastify) {
  // Health check — public, no auth required
  fastify.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }));

  // Apply API key auth to all remaining routes
  fastify.addHook('preHandler', apiKeyAuth);

  /**
   * POST /api/v1/search
   *
   * Full hybrid search with AI-powered analysis, scoring, and highlighting.
   */
  fastify.post('/search', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          filters: {
            type: 'object',
            properties: {
              author: { type: 'string' },
              religion: { type: 'string' },
              collection: { type: 'string' },
              yearFrom: { type: 'integer' },
              yearTo: { type: 'integer' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { query, limit = 10, filters = {} } = request.body;
    const startTime = Date.now();

    // Build filter string for Meilisearch
    const filterParts = [];
    if (filters.author) filterParts.push(`author CONTAINS "${filters.author}"`);
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.collection) filterParts.push(`collection CONTAINS "${filters.collection}"`);
    if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
    if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
    const filter = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    // Execute hybrid search, fall back to keyword if hybrid returns empty
    let searchResults = await hybridSearch(query, {
      limit: Math.min(limit * 2, 30),
      filter
    }).catch(() => ({ hits: [] }));

    // Fallback: if hybrid search fails (no embeddings configured), use keyword search
    if (!searchResults.hits || searchResults.hits.length === 0) {
      searchResults = await keywordSearch(query, {
        limit: Math.min(limit * 2, 30),
        filter
      });
    }

    if (!searchResults.hits || searchResults.hits.length === 0) {
      logApiSearch({ query, apiKeyId: request.apiKeyId, resultCount: 0, durationMs: Date.now() - startTime, searchType: 'api', filters });
      if (request.apiKeyUserId) recordUsage(request.apiKeyUserId, request.apiKeyId, 'search', false).catch(() => {});
      return { results: [], query, totalFound: 0, processingTimeMs: Date.now() - startTime };
    }

    // Voyage reranking before LLM analysis
    const voyageKey = process.env.VOYAGE_API_KEY;
    if (voyageKey && searchResults.hits.length > 3) {
      try {
        const reranked = await rerank(query, searchResults.hits, {
          provider: 'voyage', apiKey: voyageKey, timeout: 3000
        });
        if (reranked[0]?.rerank_score !== undefined) searchResults.hits = reranked;
      } catch { /* fallback to original order */ }
    }

    // Prepare passages for analysis
    const passages = searchResults.hits.map(hit => ({
      id: hit.id,
      document_id: hit.document_id,
      paragraph_index: hit.paragraph_index,
      text: hit.text,
      title: hit.title,
      author: hit.author,
      religion: hit.religion,
      collection: hit.collection,
      year: hit.year
    }));

    // Run AI analysis
    const analysis = await analyzePassagesParallel(query, passages, {
      batchSize: 2,
      maxConcurrent: 10
    });

    const results = analysis.results.slice(0, limit).map(result => ({
      id: result.id,
      documentId: result.document_id,
      paragraphIndex: result.paragraph_index,
      text: result.excerpt,
      highlightedText: result.highlightedText,
      title: result.title,
      author: result.author,
      religion: result.religion,
      collection: result.collection,
      score: result.score,
      summary: result.summary || result.briefAnswer || ''
    }));

    const durationMs = Date.now() - startTime;
    logApiSearch({ query, apiKeyId: request.apiKeyId, resultCount: results.length, durationMs, searchType: 'api', filters });
    if (request.apiKeyUserId) {
      recordUsage(request.apiKeyUserId, request.apiKeyId, 'search', false).catch(() => {});
    }

    return { results, query, totalFound: searchResults.hits.length, processingTimeMs: durationMs };
  });

  /**
   * POST /api/v1/search/quick
   *
   * Fast keyword-only search without AI analysis.
   */
  fastify.post('/search/quick', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          filters: {
            type: 'object',
            properties: {
              author: { type: 'string' },
              religion: { type: 'string' },
              collection: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { query, limit = 10, filters = {} } = request.body;
    const startTime = Date.now();

    const filterParts = [];
    if (filters.author) filterParts.push(`author CONTAINS "${filters.author}"`);
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.collection) filterParts.push(`collection CONTAINS "${filters.collection}"`);
    const filter = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    const searchResults = await keywordSearch(query, { limit, filter });

    const results = searchResults.hits.map(hit => ({
      id: hit.id,
      text: hit._formatted?.text || hit.text,
      title: hit.title,
      author: hit.author,
      religion: hit.religion,
      collection: hit.collection,
      score: hit._rankingScore
    }));

    const durationMs = Date.now() - startTime;
    logApiSearch({ query, apiKeyId: request.apiKeyId, resultCount: results.length, durationMs, searchType: 'api_quick', filters });
    if (request.apiKeyUserId) {
      recordUsage(request.apiKeyUserId, request.apiKeyId, 'search_quick', false).catch(() => {});
    }

    return { results, query, processingTimeMs: durationMs };
  });

  /**
   * GET /api/v1/paragraph/:id
   *
   * Get a specific paragraph by content ID.
   */
  fastify.get('/paragraph/:id', async (request) => {
    const { id } = request.params;

    const paragraph = await queryOne(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype,
             c.translation, c.context,
             d.title, d.author, d.religion, d.collection, d.language, d.year
      FROM content c
      JOIN docs d ON c.doc_id = d.id
      WHERE c.id = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL
    `, [id]);

    if (!paragraph) {
      throw new ApiError('Paragraph not found', 404);
    }

    return {
      id: paragraph.id,
      documentId: paragraph.doc_id,
      paragraphIndex: paragraph.paragraph_index,
      text: paragraph.text,
      heading: paragraph.heading,
      blockType: paragraph.blocktype,
      translation: paragraph.translation,
      context: paragraph.context,
      document: {
        title: paragraph.title,
        author: paragraph.author,
        religion: paragraph.religion,
        collection: paragraph.collection,
        language: paragraph.language,
        year: paragraph.year
      }
    };
  });

  /**
   * GET /api/v1/collections
   */
  fastify.get('/collections', async () => {
    const stats = await getStats();
    // getStats may return facets from Meilisearch or from SQLite fallback
    const religions = stats.facets?.religion || stats.religionCounts || {};
    const collections = stats.facets?.collection || stats.collectionCounts || {};
    return {
      religions: typeof religions === 'object' && !Array.isArray(religions)
        ? Object.entries(religions).map(([name, count]) => ({ name, count }))
        : religions,
      collections: typeof collections === 'object' && !Array.isArray(collections)
        ? Object.entries(collections).map(([name, count]) => ({ name, count }))
        : collections,
      totalDocuments: stats.numberOfDocuments || stats.totalDocuments || 0,
      totalParagraphs: stats.totalParagraphs || 0,
      languages: stats.languages || 0,
      lastUpdated: new Date().toISOString()
    };
  });

  // Health endpoint registered above (before auth hook) so it's public
}
