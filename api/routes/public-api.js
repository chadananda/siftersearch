/**
 * Public API v1
 *
 * Three services: Library, Search, Chat.
 * Requires API key authentication via X-API-Key header.
 *
 * Library:
 *   GET  /api/v1/library/documents      - Search/browse documents by title, author, metadata
 *   GET  /api/v1/library/documents/:id  - Get single document metadata + canonical URL
 *   GET  /api/v1/library/authors        - List all authors with document counts
 *   GET  /api/v1/library/religions      - Religion/collection tree with counts
 *
 * Search:
 *   POST /api/v1/search        - Hybrid search (semantic + keyword) with AI analysis
 *   POST /api/v1/search/quick  - Fast keyword-only search (no AI)
 *   GET  /api/v1/paragraph/:id - Get a specific paragraph
 *
 * Chat:
 *   POST /api/v1/chat          - AI research assistant (SSE streaming)
 *
 * Tools (for AI agents):
 *   POST /api/v1/tools/search  - Unified search tool (passages/documents/count/read modes)
 *   GET  /api/v1/tools/library - Library overview stats
 *
 * System:
 *   GET  /api/v1/collections   - List religions and collections
 *   GET  /api/v1/health        - API health check
 */

import { hybridSearch, keywordSearch, getStats, getMeili, INDEXES } from '../lib/search.js';
import { executeSearch, executeLibraryOverview, SYSTEM_PROMPT, TOOLS } from './chat.js';
import { analyzePassagesParallel } from '../lib/parallel-analyzer.js';
import { rerank } from '../lib/reranker.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/errors.js';
import { validateApiKey } from '../lib/api-keys.js';
import { queryOne, queryAll, userQuery, userQueryOne } from '../lib/db.js';
import { isUserBillable, getSubscriptionStatus, recordUsage } from '../lib/billing.js';
import { slugifyPath, generateDocSlug } from '../lib/slug.js';

const SITE_URL = 'https://siftersearch.com';

/** Build canonical siftersearch.com URL for a document */
function getDocumentUrl(doc) {
  const docSlug = doc.slug || generateDocSlug(doc);
  if (!docSlug || !doc.religion || !doc.collection) {
    return `${SITE_URL}/library/view?doc=${doc.id}`;
  }
  return `${SITE_URL}/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${docSlug}`;
}

/** Build canonical URL for a paragraph within a document */
function getParagraphUrl(doc, paragraphIndex) {
  return `${getDocumentUrl(doc)}#p${paragraphIndex}`;
}

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
      description: 'Full hybrid search combining BM25 keyword matching and semantic search with AI-powered analysis, scoring, and highlighting. Best for research queries.',
      tags: ['Search'],
      security: [{ apiKey: [] }],
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
      summary: result.summary || result.briefAnswer || '',
      url: getParagraphUrl(result, result.paragraph_index),
      documentUrl: getDocumentUrl(result)
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
      description: 'Fast keyword-only search without AI analysis. Returns results instantly. Cached results are free.',
      tags: ['Search'],
      security: [{ apiKey: [] }],
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
      score: hit._rankingScore,
      url: getParagraphUrl(hit, hit.paragraph_index),
      documentUrl: getDocumentUrl(hit)
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

    const docInfo = {
      title: paragraph.title, author: paragraph.author,
      religion: paragraph.religion, collection: paragraph.collection,
      language: paragraph.language, year: paragraph.year
    };
    return {
      id: paragraph.id,
      documentId: paragraph.doc_id,
      paragraphIndex: paragraph.paragraph_index,
      text: paragraph.text,
      heading: paragraph.heading,
      blockType: paragraph.blocktype,
      translation: paragraph.translation,
      context: paragraph.context,
      url: getParagraphUrl({ id: paragraph.doc_id, ...docInfo }, paragraph.paragraph_index),
      documentUrl: getDocumentUrl({ id: paragraph.doc_id, ...docInfo }),
      document: docInfo
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

  /**
   * POST /api/v1/tools/search
   *
   * Unified search tool — same interface that Jafar uses internally.
   * Designed for external AI agents and chatbots.
   *
   * Modes:
   * - passages: hybrid search for relevant quotes/citations (default)
   * - documents: find/list books by metadata (fuzzy matching)
   * - count: return match count
   * - read: fetch paragraphs from a specific document
   */
  fastify.post('/tools/search', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', maxLength: 500 },
          mode: { type: 'string', enum: ['passages', 'documents', 'count', 'read'], default: 'passages' },
          religion: { type: 'string' },
          collection: { type: 'string' },
          document_id: { type: 'integer' },
          start: { type: 'integer', default: 0 },
          limit: { type: 'integer', default: 10, maximum: 100 }
        }
      }
    }
  }, async (request) => {
    const startTime = Date.now();
    const result = await executeSearch(request.body);
    const durationMs = Date.now() - startTime;
    logApiSearch({ query: request.body.query, apiKeyId: request.apiKeyId, resultCount: result.totalMatches || result.passages?.length || 0, durationMs, searchType: 'tools_search', filters: { mode: request.body.mode, religion: request.body.religion, collection: request.body.collection } });
    if (request.apiKeyUserId) recordUsage(request.apiKeyUserId, request.apiKeyId, 'tools_search', false).catch(() => {});
    return { ...result, processingTimeMs: durationMs };
  });

  /**
   * GET /api/v1/tools/library
   *
   * Library overview — total documents, passages, religions, collections.
   */
  fastify.get('/tools/library', async () => {
    return executeLibraryOverview();
  });

  // ============================================
  // Library Service
  // ============================================

  /**
   * GET /api/v1/library/documents
   *
   * Search and browse the document library. Returns metadata and canonical URLs.
   * Supports full-text search by title/author/description, plus metadata filters.
   */
  fastify.get('/library/documents', {
    schema: {
      description: 'Search and browse the document library. Returns metadata and canonical URLs for each document.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search by title, author, or description' },
          author: { type: 'string', description: 'Filter by author name (partial match)' },
          religion: { type: 'string', description: 'Filter by religion (exact match)' },
          collection: { type: 'string', description: 'Filter by collection (exact match)' },
          language: { type: 'string', description: 'Filter by language code (e.g. en, ar, fa)' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  title: { type: 'string' },
                  author: { type: 'string' },
                  religion: { type: 'string' },
                  collection: { type: 'string' },
                  language: { type: 'string' },
                  year: { type: 'integer' },
                  description: { type: 'string' },
                  paragraphCount: { type: 'integer' },
                  url: { type: 'string', description: 'Canonical URL on siftersearch.com' }
                }
              }
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' }
          }
        }
      }
    }
  }, async (request) => {
    const { q, author, religion, collection, language, limit = 20, offset = 0 } = request.query;

    // Try Meilisearch for text search
    if (q && q.trim()) {
      try {
        const meili = getMeili();
        const filters = [];
        const esc = (s) => s.replace(/"/g, '\\"');
        if (religion) filters.push(`religion = "${esc(religion)}"`);
        if (collection) filters.push(`collection = "${esc(collection)}"`);
        if (language) filters.push(`language = "${esc(language)}"`);
        if (author) filters.push(`author CONTAINS "${esc(author)}"`);

        const result = await meili.index(INDEXES.DOCUMENTS).search(q, {
          limit, offset,
          filter: filters.length > 0 ? filters.join(' AND ') : undefined,
          attributesToRetrieve: ['id', 'title', 'author', 'religion', 'collection', 'language', 'year', 'description', 'paragraph_count']
        });

        return {
          documents: result.hits.map(doc => ({
            id: doc.id, title: doc.title, author: doc.author,
            religion: doc.religion, collection: doc.collection,
            language: doc.language, year: doc.year,
            description: doc.description, paragraphCount: doc.paragraph_count,
            url: getDocumentUrl(doc)
          })),
          total: result.estimatedTotalHits || 0, limit, offset
        };
      } catch (meiliErr) {
        logger.warn('Meilisearch library search failed, falling back to SQLite:', meiliErr.message);
      }
    }

    // SQLite fallback / pure browse
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (q && q.trim()) {
      conditions.push('(title LIKE ? OR author LIKE ? OR description LIKE ?)');
      const term = `%${q.trim()}%`;
      params.push(term, term, term);
    }
    if (author) { conditions.push('author LIKE ?'); params.push(`%${author}%`); }
    if (religion) { conditions.push('religion = ?'); params.push(religion); }
    if (collection) { conditions.push('collection = ?'); params.push(collection); }
    if (language) { conditions.push('language = ?'); params.push(language); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [documents, countResult] = await Promise.all([
      queryAll(`SELECT id, title, author, religion, collection, language, year, description, paragraph_count, filename, file_path
               FROM docs ${where} ORDER BY title ASC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      queryOne(`SELECT COUNT(*) as count FROM docs ${where}`, params)
    ]);

    return {
      documents: documents.map(doc => ({
        id: doc.id, title: doc.title, author: doc.author,
        religion: doc.religion, collection: doc.collection,
        language: doc.language, year: doc.year,
        description: doc.description, paragraphCount: doc.paragraph_count,
        url: getDocumentUrl(doc)
      })),
      total: countResult?.count || 0, limit, offset
    };
  });

  /**
   * GET /api/v1/library/documents/:id
   *
   * Get a single document's full metadata and canonical URL.
   */
  fastify.get('/library/documents/:id', {
    schema: {
      description: 'Get detailed metadata for a single document including canonical URL.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            author: { type: 'string' },
            religion: { type: 'string' },
            collection: { type: 'string' },
            language: { type: 'string' },
            year: { type: 'integer' },
            description: { type: 'string' },
            paragraphCount: { type: 'integer' },
            url: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        }
      }
    }
  }, async (request) => {
    const doc = await queryOne(
      `SELECT id, title, author, religion, collection, language, year, description,
              paragraph_count, filename, file_path, created_at, updated_at
       FROM docs WHERE id = ? AND deleted_at IS NULL`, [request.params.id]
    );
    if (!doc) throw new ApiError(404, 'Document not found');

    return {
      id: doc.id, title: doc.title, author: doc.author,
      religion: doc.religion, collection: doc.collection,
      language: doc.language, year: doc.year,
      description: doc.description, paragraphCount: doc.paragraph_count,
      url: getDocumentUrl(doc),
      createdAt: doc.created_at, updatedAt: doc.updated_at
    };
  });

  /**
   * GET /api/v1/library/authors
   *
   * List all authors with document counts. Optionally filter by religion.
   */
  fastify.get('/library/authors', {
    schema: {
      description: 'List all authors in the library with document counts. Optionally filter by religion.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          religion: { type: 'string', description: 'Filter authors by religion' },
          q: { type: 'string', description: 'Search authors by name' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            authors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  documentCount: { type: 'integer' },
                  religions: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            total: { type: 'integer' }
          }
        }
      }
    }
  }, async (request) => {
    const { religion, q, limit = 100, offset = 0 } = request.query;
    const conditions = ['deleted_at IS NULL', 'author IS NOT NULL', "author != ''"];
    const params = [];

    if (religion) { conditions.push('religion = ?'); params.push(religion); }
    if (q) { conditions.push('author LIKE ?'); params.push(`%${q}%`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const authors = await queryAll(`
      SELECT author as name, COUNT(*) as documentCount, GROUP_CONCAT(DISTINCT religion) as religions
      FROM docs ${where}
      GROUP BY author ORDER BY author ASC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countResult = await queryOne(`
      SELECT COUNT(DISTINCT author) as count FROM docs ${where}
    `, params);

    return {
      authors: authors.map(a => ({
        name: a.name,
        documentCount: a.documentCount,
        religions: a.religions ? a.religions.split(',') : []
      })),
      total: countResult?.count || 0
    };
  });

  /**
   * GET /api/v1/library/religions
   *
   * Get the full religion/collection tree with document counts.
   */
  fastify.get('/library/religions', {
    schema: {
      description: 'Get the religion and collection tree structure with document counts.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            religions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  documentCount: { type: 'integer' },
                  collections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        documentCount: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const stats = await queryAll(`
      SELECT religion, collection, COUNT(*) as count
      FROM docs WHERE religion IS NOT NULL AND deleted_at IS NULL
      GROUP BY religion, collection ORDER BY religion, collection
    `);

    const religionMap = new Map();
    for (const row of stats) {
      if (!religionMap.has(row.religion)) {
        religionMap.set(row.religion, { name: row.religion, documentCount: 0, collections: [] });
      }
      const r = religionMap.get(row.religion);
      r.documentCount += row.count;
      if (row.collection && !row.collection.startsWith('.')) {
        r.collections.push({ name: row.collection, documentCount: row.count });
      }
    }

    return { religions: Array.from(religionMap.values()).sort((a, b) => a.name.localeCompare(b.name)) };
  });

  // ============================================
  // Chat Service
  // ============================================

  /**
   * POST /api/v1/chat
   *
   * AI research assistant. Streams responses via Server-Sent Events.
   * The assistant searches sacred texts and provides cited answers.
   */
  fastify.post('/chat', {
    schema: {
      description: 'AI research assistant that searches sacred texts and provides cited answers. Streams responses via SSE.',
      tags: ['Chat'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array', minItems: 1, maxItems: 50,
            description: 'Conversation history. Last message is the current query.',
            items: {
              type: 'object', required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 4000 }
              }
            }
          },
          researchContext: { type: 'string', description: 'Optional prior research context to continue from' }
        }
      }
    }
  }, async (request, reply) => {
    const { messages, researchContext } = request.body;
    const startTime = Date.now();

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const origin = request.headers.origin;
    if (origin) reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.flushHeaders();

    const sendEvent = (data) => {
      try { reply.raw.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) { /* closed */ }
    };

    try {
      // Use the same OpenAI + tool-calling flow as the internal chat
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      let systemContent = SYSTEM_PROMPT;
      if (researchContext) systemContent += `\n\n## Previous research context\n\n${researchContext}`;

      const aiMessages = [
        { role: 'system', content: systemContent },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      const MAX_TOOL_ROUNDS = 5;
      let citations = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: aiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          stream: false,
          max_tokens: 2500,
          temperature: 0.7
        });

        const choice = response.choices[0];

        if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length > 0) {
          aiMessages.push(choice.message);
          sendEvent({ type: 'status', message: 'Searching sacred texts...' });

          const toolResults = await Promise.all(
            choice.message.tool_calls.map(async (tc) => {
              const args = JSON.parse(tc.function.arguments || '{}');
              let result;
              if (tc.function.name === 'search') {
                result = await executeSearch(args);
                if (result.passages) citations.push(...result.passages.map(p => ({
                  text: p.text?.slice(0, 200), title: p.title, author: p.author,
                  religion: p.religion, collection: p.collection
                })));
              } else if (tc.function.name === 'library_overview') {
                result = await executeLibraryOverview();
              } else {
                result = { error: `Unknown tool: ${tc.function.name}` };
              }
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
            })
          );

          aiMessages.push(...toolResults);
          continue;
        }

        // Stream the final response
        const finalContent = choice.message.content || '';
        const words = finalContent.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          sendEvent({ type: 'text', content: words.slice(i, i + 3).join(' ') + ' ' });
        }
        if (citations.length > 0) sendEvent({ type: 'citations', citations });
        sendEvent({ type: 'done', processingTimeMs: Date.now() - startTime });
        break;
      }
    } catch (err) {
      logger.error({ err }, 'API chat error');
      sendEvent({ type: 'error', message: err.message || 'Chat failed' });
    }

    reply.raw.end();
    logApiSearch({ query: messages[messages.length - 1]?.content, apiKeyId: request.apiKeyId, resultCount: 0, durationMs: Date.now() - startTime, searchType: 'api_chat' });
    if (request.apiKeyUserId) recordUsage(request.apiKeyUserId, request.apiKeyId, 'chat', false).catch(() => {});
  });

  // Health endpoint registered above (before auth hook) so it's public
}
