/**
 * Public Search API v1
 *
 * Clean, well-documented API for external applications.
 * Requires API key authentication via X-API-Key header.
 *
 * Endpoints:
 *   POST /api/v1/search - Hybrid search with AI analysis
 *   POST /api/v1/search/quick - Fast keyword search (no AI)
 *   GET /api/v1/collections - List available collections
 *   GET /api/v1/health - API health check
 */

import { hybridSearch, keywordSearch, getStats } from '../lib/search.js';
import { analyzePassagesParallel, getOptimalPassageCount } from '../lib/parallel-analyzer.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/errors.js';

// In-memory rate limiting for API keys
const apiKeyUsage = new Map();

/**
 * Validate API key from request header
 * Returns true if valid, throws ApiError if not
 */
function validateApiKey(request) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    throw new ApiError('API key required. Set X-API-Key header.', 401);
  }

  if (!config.publicApi.apiKeys.includes(apiKey)) {
    throw new ApiError('Invalid API key', 403);
  }

  // Check rate limit
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const usage = apiKeyUsage.get(apiKey) || [];

  // Clean old entries
  const recentUsage = usage.filter(ts => ts > hourAgo);
  apiKeyUsage.set(apiKey, recentUsage);

  if (recentUsage.length >= config.publicApi.rateLimit) {
    throw new ApiError(
      `Rate limit exceeded. Max ${config.publicApi.rateLimit} requests per hour.`,
      429
    );
  }

  // Record this request
  recentUsage.push(now);

  return true;
}

/**
 * API key authentication preHandler
 */
async function apiKeyAuth(request, reply) {
  try {
    validateApiKey(request);
  } catch (err) {
    reply.code(err.statusCode || 401).send({
      error: err.message,
      code: err.statusCode === 429 ? 'rate_limit_exceeded' : 'unauthorized'
    });
    throw err;
  }
}

export default async function publicApiRoutes(fastify) {
  // Apply API key auth to all routes in this plugin
  fastify.addHook('preHandler', apiKeyAuth);

  /**
   * POST /api/v1/search
   *
   * Full hybrid search with AI-powered analysis, scoring, and highlighting.
   *
   * Request body:
   *   - query (required): Search query string
   *   - limit: Max results to return (default: 10, max: 50)
   *   - filters: Optional filters { religion, collection, yearFrom, yearTo }
   *
   * Response:
   *   - results: Array of scored, highlighted passages
   *   - query: Echo of the query
   *   - totalFound: Total matching passages
   *   - processingTimeMs: Time taken
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
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.collection) filterParts.push(`collection = "${filters.collection}"`);
    if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
    if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
    const filter = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    // Execute hybrid search
    const searchResults = await hybridSearch(query, {
      limit: Math.min(limit * 2, 30), // Fetch extra for AI filtering
      filter
    });

    if (!searchResults.hits || searchResults.hits.length === 0) {
      return {
        results: [],
        query,
        totalFound: 0,
        processingTimeMs: Date.now() - startTime
      };
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

    // Run AI analysis (scoring, highlighting)
    const analysis = await analyzePassagesParallel(query, passages, {
      batchSize: 2,
      maxConcurrent: 10
    });

    // Format results
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
      summary: result.briefAnswer
    }));

    logger.info({
      query: query.substring(0, 50),
      limit,
      resultsReturned: results.length,
      processingTimeMs: Date.now() - startTime,
      apiKey: request.headers['x-api-key']?.substring(0, 8) + '...'
    }, 'Public API search');

    return {
      results,
      query,
      totalFound: searchResults.hits.length,
      processingTimeMs: Date.now() - startTime
    };
  });

  /**
   * POST /api/v1/search/quick
   *
   * Fast keyword-only search without AI analysis.
   * Use for autocomplete, quick lookups, or high-volume queries.
   *
   * Request body:
   *   - query (required): Search query string
   *   - limit: Max results (default: 10, max: 50)
   *   - filters: Optional filters
   *
   * Response:
   *   - results: Array of raw search results with Meilisearch highlights
   *   - query: Echo of the query
   *   - processingTimeMs: Time taken
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

    // Build filter
    const filterParts = [];
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.collection) filterParts.push(`collection = "${filters.collection}"`);
    const filter = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    // Fast keyword search
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

    return {
      results,
      query,
      processingTimeMs: Date.now() - startTime
    };
  });

  /**
   * GET /api/v1/collections
   *
   * List available collections and religions in the library.
   * Useful for building filter UIs.
   *
   * Response:
   *   - religions: Array of religion names
   *   - collections: Object mapping religion -> collections array
   *   - totalDocuments: Total indexed documents
   */
  fastify.get('/collections', async () => {
    const stats = await getStats();

    return {
      religions: stats.facets?.religion || [],
      collections: stats.facets?.collection || [],
      totalDocuments: stats.numberOfDocuments || 0,
      lastUpdated: stats.lastUpdated || null
    };
  });

  /**
   * GET /api/v1/health
   *
   * API health check endpoint.
   *
   * Response:
   *   - status: "ok" or "error"
   *   - version: API version
   *   - timestamp: Current time
   */
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  });
}
