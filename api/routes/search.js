/**
 * Search API Routes
 *
 * POST /api/search - Main hybrid search
 * GET /api/search/stats - Index statistics
 * GET /api/search/health - Search health check
 */

import { hybridSearch, keywordSearch, semanticSearch, getStats, healthCheck } from '../lib/search.js';
import { authenticate } from '../lib/auth.js';
import { config } from '../lib/config.js';

export default async function searchRoutes(fastify) {
  // Main search endpoint
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          mode: { type: 'string', enum: ['hybrid', 'keyword', 'semantic'], default: 'hybrid' },
          semanticRatio: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
          filters: {
            type: 'object',
            properties: {
              religion: { type: 'string' },
              collection: { type: 'string' },
              language: { type: 'string' },
              yearFrom: { type: 'integer' },
              yearTo: { type: 'integer' },
              documentId: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const {
      query,
      limit = 20,
      offset = 0,
      mode = 'hybrid',
      semanticRatio = 0.5,
      filters = {}
    } = request.body;

    // Select search function based on mode
    let searchFn;
    switch (mode) {
      case 'keyword':
        searchFn = keywordSearch;
        break;
      case 'semantic':
        searchFn = semanticSearch;
        break;
      default:
        searchFn = hybridSearch;
    }

    const results = await searchFn(query, {
      limit,
      offset,
      filters,
      semanticRatio
    });

    return {
      ...results,
      mode,
      filters
    };
  });

  // Fast keyword-only search (no auth required, rate limited)
  fastify.get('/quick', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
        }
      }
    }
  }, async (request) => {
    const { q, limit = 10 } = request.query;

    const results = await keywordSearch(q, { limit });

    return {
      hits: results.hits.map(hit => ({
        id: hit.id,
        text: hit._formatted?.text || hit.text,
        title: hit.title,
        author: hit.author,
        score: hit._rankingScore
      })),
      query: q,
      processingTimeMs: results.processingTimeMs
    };
  });

  // Index statistics
  fastify.get('/stats', async () => {
    const stats = await getStats();
    return stats;
  });

  // Health check
  fastify.get('/health', async () => {
    const health = await healthCheck();
    return health;
  });
}
