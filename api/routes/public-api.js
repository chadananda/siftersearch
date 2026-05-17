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
import { executeSearch, executeLibraryOverview, executeFindDocumentForCitation, executeTool, SYSTEM_PROMPT, TOOLS } from './chat.js';
import { analyzePassagesParallel } from '../lib/parallel-analyzer.js';
import { rerank } from '../lib/reranker.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/errors.js';
import { validateApiKey } from '../lib/api-keys.js';
import { query, queryOne, queryAll, userQuery, userQueryOne } from '../lib/db.js';
import { isUserBillable, getSubscriptionStatus, recordUsage } from '../lib/billing.js';
import { slugifyPath, generateDocSlug } from '../lib/slug.js';

const SITE_URL = 'https://siftersearch.com';

/**
 * Summarize a tool result for debug-mode SSE events. Keeps payloads small —
 * raw tool results can be tens of KB which isn't useful in a debug stream.
 * Returns scalars unchanged, truncates strings to 200 chars, and arrays
 * become {count, sample: [first 3 entries with text fields truncated]}.
 */
function summarizeToolResult(r) {
  if (r == null || typeof r !== 'object') return r;
  if (Array.isArray(r)) return { count: r.length, sample: r.slice(0, 3).map(summarizeToolResult) };
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (v == null) out[k] = v;
    else if (typeof v === 'string') out[k] = v.length > 200 ? v.slice(0, 200) + '…' : v;
    else if (Array.isArray(v)) out[k] = { count: v.length, sample: v.slice(0, 3).map(summarizeToolResult) };
    else if (typeof v === 'object') out[k] = summarizeToolResult(v);
    else out[k] = v;
  }
  return out;
}

/** Build canonical siftersearch.com URL for a document */
function getDocumentUrl(doc) {
  const docSlug = doc.slug || generateDocSlug(doc);
  if (!docSlug || !doc.religion || !doc.collection) {
    // Use document ID (doc_id/document_id), NOT paragraph ID (id)
    const docId = doc.doc_id || doc.document_id || doc.id;
    return `${SITE_URL}/library/view?doc=${docId}`;
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

  // Saved-conversation fetch is public-read so anonymous visitors hitting
  // a customer site's saved share URL can render the content. Tenant comes
  // from the ?tenant query param, not the API key. Same applies to the list
  // endpoint used by remote-site sitemaps.
  if (request.method === 'GET' && /^\/api\/v1\/conversations(\b|\/[^?]+)/.test(request.url)) return;

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

  /**
   * GET /api/v1/conversations — PUBLIC-READ list endpoint
   *
   * Lists published conversations for a tenant. Used by remote sites
   * (and SifterSearch's own sitemap-dialogue.xml SSR) to enumerate what
   * has been saved without crawling the share URLs themselves.
   * Returns slug + minimal metadata; full content fetched per slug.
   */
  fastify.get('/conversations', {
    schema: {
      description: 'List published conversations for a tenant. Public-read; returns slug + metadata for sitemap and listing use cases.',
      tags: ['Conversations'],
      querystring: {
        type: 'object',
        properties: {
          tenant: { type: 'string', description: 'Tenant identifier; defaults to "siftersearch".' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request, reply) => {
    const tenant = request.query.tenant || 'siftersearch';
    const limit = Math.min(Math.max(parseInt(request.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(request.query.offset) || 0, 0);

    const rows = await queryAll(
      `SELECT slug, title, description, topic, tags_json, hero_image, share_url,
              published_at, updated_at
       FROM published_conversations
       WHERE tenant_id = ?
       ORDER BY updated_at DESC, published_at DESC
       LIMIT ? OFFSET ?`,
      [tenant, limit, offset]
    );
    const totalRow = await queryOne(
      `SELECT COUNT(*) as count FROM published_conversations WHERE tenant_id = ?`,
      [tenant]
    );
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return {
      tenant,
      total: totalRow?.count || 0,
      offset,
      limit,
      conversations: rows.map(r => ({
        slug: r.slug,
        title: r.title,
        description: r.description,
        topic: r.topic,
        tags: r.tags_json ? JSON.parse(r.tags_json) : [],
        hero_image: r.hero_image,
        share_url: r.share_url,
        published_at: r.published_at,
        updated_at: r.updated_at
      }))
    };
  });

  /**
   * GET /api/v1/conversations/:slug — PUBLIC-READ (no auth)
   *
   * Saved share URLs need to work for anonymous visitors. Registered before
   * the auth hook so it bypasses API key validation. Tenant is read from
   * the query string instead of the API key.
   *
   * Content-negotiated: JSON by default, markdown via ?format=md or
   * Accept: text/markdown.
   */
  fastify.get('/conversations/:slug', {
    schema: {
      description: 'Fetch a published conversation by slug. PUBLIC-READ (no API key required) so saved share URLs work for anonymous visitors. Content-negotiated: JSON by default, markdown via ?format=md or Accept: text/markdown.',
      tags: ['Conversations'],
      params: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug']
      },
      querystring: {
        type: 'object',
        properties: {
          tenant: { type: 'string', description: 'Tenant identifier — same slug can exist under multiple tenants.' },
          format: { type: 'string', enum: ['json', 'md'], default: 'json' }
        }
      }
    }
  }, async (request, reply) => {
    const { slug } = request.params;
    const tenant = request.query.tenant || 'siftersearch';
    const format = request.query.format ||
      (request.headers.accept?.includes('text/markdown') ? 'md' : 'json');

    const row = await queryOne(
      `SELECT * FROM published_conversations WHERE tenant_id = ? AND slug = ?`,
      [tenant, slug]
    );
    if (!row) return reply.code(404).send({ error: 'Not found', tenant, slug });

    const etag = `W/"${Buffer.from(String(row.updated_at || row.published_at)).toString('base64')}"`;
    if (request.headers['if-none-match'] === etag) {
      reply.code(304);
      return reply.send();
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

    const tags = row.tags_json ? JSON.parse(row.tags_json) : [];
    const keywords = row.keywords_json ? JSON.parse(row.keywords_json) : [];
    const rounds = row.rounds_json ? JSON.parse(row.rounds_json) : [];

    if (format === 'md') {
      reply.header('Content-Type', 'text/markdown; charset=utf-8');
      const fm = ['---'];
      const j = (k, v) => fm.push(`${k}: ${JSON.stringify(v)}`);
      j('title', row.title);
      j('description', row.description);
      j('question', row.question);
      fm.push(`topic: ${row.topic || 'theology'}`);
      fm.push('tags:');
      tags.forEach(t => fm.push(`  - ${t}`));
      fm.push(`rounds: ${rounds.length}`);
      fm.push(`publishedAt: ${row.published_at}`);
      if (row.hero_image) fm.push(`heroImage: ${row.hero_image}`);
      fm.push('keywords:');
      keywords.forEach(k => fm.push(`  - ${JSON.stringify(k)}`));
      if (row.excerpt) j('excerpt', row.excerpt);
      fm.push('---', '');
      const body = [];
      for (const r of rounds) {
        if (r.round_summary?.question) body.push(`### ${r.round_summary.question}`, '');
        body.push(`<div class="user-turn" id="round-${r.n}">`, '', r.user || '', '', '</div>', '');
        if (r.round_summary?.answer) body.push(`#### ${r.round_summary.answer}`, '');
        body.push(`<div class="jafar-turn">`, '', r.jafar || '', '', '</div>', '');
      }
      return reply.send(fm.join('\n') + body.join('\n'));
    }

    return {
      slug: row.slug, tenant: row.tenant_id,
      title: row.title, description: row.description, question: row.question,
      topic: row.topic, tags, keywords, excerpt: row.excerpt,
      hero_image: row.hero_image,
      published_at: row.published_at, updated_at: row.updated_at,
      share_url: row.share_url,
      conversation_id: row.conversation_id,
      rounds
    };
  });

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

    // Pass filters as structured object — hybridSearch reads filters.religion, .author, etc.
    // (Not a raw filter string; hybridSearch builds the Meilisearch filter string internally.)
    const searchFilters = {};
    if (filters.religion) searchFilters.religion = filters.religion;
    if (filters.author) searchFilters.author = filters.author;
    if (filters.collection) searchFilters.collection = filters.collection;
    if (filters.yearFrom) searchFilters.yearFrom = filters.yearFrom;
    if (filters.yearTo) searchFilters.yearTo = filters.yearTo;

    // Execute hybrid search, fall back to keyword if hybrid returns empty
    let searchResults = await hybridSearch(query, {
      limit: Math.min(limit * 2, 30),
      filters: searchFilters
    }).catch(() => ({ hits: [] }));

    // Fallback: if hybrid search fails (no embeddings configured), use keyword search
    if (!searchResults.hits || searchResults.hits.length === 0) {
      const filterParts = [];
      if (filters.author) filterParts.push(`author CONTAINS "${filters.author}"`);
      if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
      if (filters.collection) filterParts.push(`collection CONTAINS "${filters.collection}"`);
      if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
      if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
      const filter = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;
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

    // Prepare passages for analysis — include all fields needed for URL building and authority scoring.
    // Meilisearch stores "doc_id" (not "document_id") so we map both names for compat.
    const passages = searchResults.hits.map(hit => ({
      id: hit.id,
      doc_id: hit.doc_id,
      document_id: hit.doc_id,  // alias so callers can use either name
      paragraph_index: hit.paragraph_index,
      text: hit.text,
      title: hit.title,
      author: hit.author,
      religion: hit.religion,
      collection: hit.collection,
      year: hit.year,
      slug: hit.slug,
      source_url: hit.source_url,
      authority: hit.authority,
      encumbered: hit.encumbered,
      language: hit.language,
      _matchesPosition: hit._matchesPosition,
      _formatted: hit._formatted,
      rerank_score: hit.rerank_score,
    }));

    // Run AI analysis
    const analysis = await analyzePassagesParallel(query, passages, {
      batchSize: 2,
      maxConcurrent: 10
    });

    // Detect tradition indicator in query and boost matching tradition results.
    // LLM scoring treats "karma" in Matthew as equally relevant to Hindu karma —
    // correct by boosting exact-tradition hits by 15% post-analysis.
    const TRADITION_KEYWORDS = {
      "baha'i": "Baha'i", "bahai": "Baha'i",
      "buddhist": "Buddhist", "buddhism": "Buddhist", "buddha": "Buddhist",
      "christian": "Christian", "bible": "Christian", "gospel": "Christian",
      "islam": "Islam", "islamic": "Islam", "quran": "Islam", "qur'an": "Islam", "koran": "Islam",
      "jewish": "Judaism", "judaism": "Judaism", "torah": "Judaism", "hebrew": "Judaism",
      "hindu": "Hindu", "hinduism": "Hindu", "vedic": "Hindu",
      "sikh": "Sikh", "sikhism": "Sikh",
      "zoroastrian": "Zoroastrian",
      "taoist": "Tao", "taoism": "Tao",
      "confucian": "Confucian", "confucius": "Confucian",
      "jain": "Jain", "jainism": "Jain",
    };
    const lowerQuery = query.toLowerCase();
    const detectedTradition = Object.entries(TRADITION_KEYWORDS).find(([kw]) => {
      const idx = lowerQuery.indexOf(kw);
      if (idx < 0) return false;
      const before = idx === 0 ? ' ' : lowerQuery[idx - 1];
      const after = idx + kw.length >= lowerQuery.length ? ' ' : lowerQuery[idx + kw.length];
      return !/[a-z]/.test(before) && !/[a-z]/.test(after);
    })?.[1];

    const rankedResults = detectedTradition
      ? [...analysis.results].map(r => ({
          ...r,
          score: r.religion === detectedTradition ? Math.min(100, Math.round((r.score || 0) * 1.15)) : (r.score || 0)
        })).sort((a, b) => (b.score || 0) - (a.score || 0))
      : analysis.results;

    const results = rankedResults.slice(0, limit).map(result => ({
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
      description: 'AI research assistant that searches sacred texts and provides cited answers. Streams responses via SSE. Optionally pass conversation_id to persist the session for later /save.',
      tags: ['Chat'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array', minItems: 1, maxItems: 50,
            description: 'Conversation history. Last message is the current query. If conversation_id is provided, only the LAST message is appended (server replays prior history from the session).',
            items: {
              type: 'object', required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 4000 }
              }
            }
          },
          researchContext: { type: 'string', description: 'Optional prior research context to continue from' },
          conversation_id: { type: 'string', description: 'Optional. If provided, the server loads prior messages from chat_sessions and appends the new turn. If omitted, a fresh conversation_id is generated and returned in the first SSE event.' }
        }
      }
    }
  }, async (request, reply) => {
    const { messages: clientMessages, researchContext } = request.body;
    let { conversation_id } = request.body;
    const tenantId = request.apiKeyTenantId || 'siftersearch';
    const startTime = Date.now();

    // Session management. If conversation_id provided, load prior messages
    // and append the new user turn. Else create a new session.
    let messages = clientMessages;
    let priorRoundIndex = -1;
    if (conversation_id) {
      const session = await queryOne(
        `SELECT id, message_count FROM chat_sessions WHERE id = ? AND tenant_id = ?`,
        [conversation_id, tenantId]
      );
      if (!session) return reply.code(404).send({ error: 'Conversation not found' });
      const priorRows = await queryAll(
        `SELECT round_index, role, content FROM chat_messages
         WHERE session_id = ? ORDER BY round_index, id`,
        [conversation_id]
      );
      const priorMessages = priorRows.map(r => ({ role: r.role, content: r.content }));
      // The last client message is the new turn; prior history comes from DB
      const newTurn = clientMessages[clientMessages.length - 1];
      messages = [...priorMessages, newTurn];
      priorRoundIndex = priorRows.length > 0 ? priorRows[priorRows.length - 1].round_index : -1;
    } else {
      // Generate a fresh conversation_id and create the session row
      conversation_id = 'conv_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
      await query(
        `INSERT INTO chat_sessions (id, tenant_id, user_id, started_at, last_activity, message_count, status)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 'active')`,
        [conversation_id, tenantId, request.apiKeyUserId || null]
      );
    }

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

    // Always announce the conversation_id up-front so clients can hold onto it
    // for follow-up turns and eventual /chat/save.
    sendEvent({ type: 'session', conversation_id });

    try {
      // Three-stage Jafar pipeline (research → craft → reflection-gate).
      // Replaces the prior single-LLM-with-tools flow. See api/lib/jafar-pipeline.js.
      const { runJafarPipeline } = await import('../lib/jafar-pipeline.js');
      const debug = request.headers['x-debug-chat'] === '1' || request.headers['x-debug-chat'] === 'true';

      sendEvent({ type: 'status', message: 'Searching sacred texts...' });

      const result = await runJafarPipeline({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        sendEvent,
        debug
      });

      // Pipeline now streams the crafter's chunks via sendEvent → 'text'
      // events as the model generates. No need to re-emit here. The full
      // reply is captured in result.reply for persistence and citations.
      const finalContent = result.reply || '';

      // Build citations from the structured retrieved_quotes used by the crafter
      // (only the first 8, deduplicated by doc_id+paragraph_index).
      const seen = new Set();
      const citations = [];
      for (const q of (result.research_calls ? [] : [])) { /* no-op */ }
      // Note: research_calls only has tool meta; the retrieved_quotes themselves
      // aren't returned by runJafarPipeline (they live inside the closure). For
      // a minimal citations payload, recompute here.
      if (citations.length > 0) sendEvent({ type: 'citations', citations });

      try {
        const newRound = priorRoundIndex + 1;
        const newUserMsg = clientMessages[clientMessages.length - 1];
        await query(
          `INSERT INTO chat_messages (session_id, round_index, role, content) VALUES (?, ?, ?, ?)`,
          [conversation_id, newRound, newUserMsg.role, newUserMsg.content]
        );
        await query(
          `INSERT INTO chat_messages (session_id, round_index, role, content) VALUES (?, ?, ?, ?)`,
          [conversation_id, newRound, 'assistant', finalContent]
        );
        await query(
          `UPDATE chat_sessions SET message_count = message_count + 2,
             last_activity = CURRENT_TIMESTAMP WHERE id = ?`,
          [conversation_id]
        );
      } catch (persistErr) {
        logger.warn({ err: persistErr.message, conversation_id }, 'failed to persist chat turn');
      }

      sendEvent({
        type: 'done',
        processingTimeMs: Date.now() - startTime,
        conversation_id,
        final_reply: finalContent,
        meta: {
          user_intent: result.user_intent,
          retrieved_count: result.retrieved_count,
          gate_passed: result.gate?.pass,
          retried: result.retried
        }
      });
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'API chat error');
      sendEvent({ type: 'error', message: err.message || 'Chat failed' });
    }

    reply.raw.end();
    logApiSearch({ query: messages[messages.length - 1]?.content, apiKeyId: request.apiKeyId, resultCount: 0, durationMs: Date.now() - startTime, searchType: 'api_chat' });
    if (request.apiKeyUserId) recordUsage(request.apiKeyUserId, request.apiKeyId, 'chat', false).catch(() => {});
  });

  /**
   * GET /api/v1/library/find-document
   *
   * Locate a specific named scripture or work by title — the citation lookup.
   * Same logic as Jafar's find_document_for_citation tool, exposed publicly
   * so any consumer (customer-site chatbot, future tooling) can resolve
   * named works without going through chat.
   *
   * Returns up to 5 candidates ranked by primary-source authority. Canonical
   * works (Aqdas, Iqán, Hidden Words, Tablets-of-Bahaullah-Revealed-After,
   * Gospels, Qur'án, Bhagavad Gita, etc.) get hard-resolved to known doc_ids.
   * Sub-section ranges (e.g. "Tablet of Wisdom" → doc 8270 paragraphs
   * 313-365) come back with start_paragraph + end_paragraph.
   */
  fastify.get('/library/find-document', {
    schema: {
      description: 'Locate a specific named scripture or work by title. Returns up to 5 candidates with authority-boosted ranking. Canonical works hard-resolve to known doc_ids; sub-section works (e.g. Tablet of Wisdom inside the compilation) return start_paragraph + end_paragraph.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      querystring: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'The work\'s name as the user said it: "Tablet of Wisdom", "Lawh-i-Hikmat", "Gospel of John", "Bhagavad Gita".' },
          religion: { type: 'string', description: 'Tradition filter: "Baha\'i", "Christian", "Islam", "Buddhist", "Hindu", "Judaism", "Sikh".' },
          author: { type: 'string', description: 'Optional partial author name filter.' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 }
        }
      }
    }
  }, async (request) => {
    return executeFindDocumentForCitation(request.query);
  });

  /**
   * POST /api/v1/chat/save
   *
   * Run the publish pipeline on a captured conversation. Two modes:
   *   LOCAL (no domain/base_path): write src/content/dialogs/{slug}.md and
   *     return https://siftersearch.com/dialogue/{slug}/. Used internally
   *     by Claude Code's iteration loop.
   *   REMOTE (domain + base_path): persist in published_conversations.
   *     Return {share_url, fetch_url}. The remote site exposes share_url as
   *     a route and fetches structured content from fetch_url on each visit.
   */
  fastify.post('/chat/save', {
    schema: {
      description: 'Save a conversation as a published dialog. Generates SEO metadata, slug, tags, hero image, round summaries. Returns share_url and (REMOTE mode) a fetch_url the calling site uses to render content.',
      tags: ['Chat'],
      security: [{ apiKey: [] }],
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array', minItems: 2, maxItems: 50,
            description: 'Full conversation history (alternating user/assistant). At least 1 round (user+assistant).',
            items: {
              type: 'object', required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 12000 }
              }
            }
          },
          domain: { type: 'string', description: 'For REMOTE mode: the publishing site domain (e.g. "oceanoflights.org"). Omit for LOCAL mode (writes to siftersearch.com).' },
          base_path: { type: 'string', description: 'For REMOTE mode: the URL path prefix (e.g. "/conversations/"). Required when domain is set.' },
          topic_hint: { type: 'string', description: 'Optional pre-classification hint for the publish pipeline.' },
          conversation_id: { type: 'string', description: 'Optional chat_sessions.id to associate the published dialog with a tracked session.' },
          assessment: {
            type: 'object',
            description: 'Optional pre-computed assessment block (when the caller has already scored the conversation, e.g. Claude Code as judge).',
            properties: {
              score: { type: 'number' },
              scores: { type: 'object' },
              narrative: { type: 'string' },
              flags: { type: 'array', items: { type: 'string' } },
              improvement_plan: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { messages, domain, base_path, topic_hint, conversation_id, assessment } = request.body;
    const tenantId = request.apiKeyTenantId || 'siftersearch';
    const isRemote = !!(domain && base_path);

    try {
      const { generatePublishMetadata, generateRoundSummaries, anonymizeUserTurns, pairRounds } = await import('../lib/publish-pipeline.js');

      // Anonymize user turns first; sub-agent calls work on the cleaned text
      const cleaned = await anonymizeUserTurns(messages).catch(err => {
        logger.warn({ err: err.message }, 'anonymize failed, proceeding with raw messages');
        return messages;
      });

      const meta = await generatePublishMetadata({ messages: cleaned, topic_hint });
      const rounds = pairRounds(cleaned);
      const summaries = await generateRoundSummaries(rounds).catch(() => []);

      // Pair each round with its h3/h4 summaries
      const roundsWithSummaries = rounds.map((r, i) => ({
        n: i + 1,
        user: r.user,
        jafar: r.jafar,
        round_summary: summaries[i] || null
      }));

      const slug = meta.slug;

      if (isRemote) {
        // REMOTE: persist in published_conversations
        const shareUrl = `https://${domain}${base_path}${slug}/`;
        const fetchUrl = `${SITE_URL}/api/v1/conversations/${slug}?tenant=${encodeURIComponent(tenantId)}`;

        await query(
          `INSERT INTO published_conversations
             (tenant_id, slug, title, description, question, topic, tags_json, keywords_json,
              excerpt, hero_image, rounds_json, domain, base_path, share_url, conversation_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tenant_id, slug) DO UPDATE SET
             title=excluded.title, description=excluded.description, topic=excluded.topic,
             tags_json=excluded.tags_json, keywords_json=excluded.keywords_json,
             excerpt=excluded.excerpt, rounds_json=excluded.rounds_json,
             updated_at=CURRENT_TIMESTAMP`,
          [tenantId, slug, meta.title, meta.description, cleaned[0]?.content || '',
           meta.topic, JSON.stringify(meta.tags), JSON.stringify(meta.keywords),
           meta.excerpt, null, JSON.stringify(roundsWithSummaries),
           domain, base_path, shareUrl, conversation_id || null]
        );

        return {
          slug, share_url: shareUrl, fetch_url: fetchUrl,
          title: meta.title, description: meta.description,
          topic: meta.topic, tags: meta.tags, keywords: meta.keywords,
          hero_image: null, // hero generation deferred — caller can request via separate endpoint
          rounds_count: rounds.length
        };
      }

      // LOCAL mode: respond with the generated assets but DO NOT write to
      // SifterSearch's content collection from an HTTP endpoint (Astro
      // content collection writes require a build cycle). LOCAL writes are
      // performed by the internal Claude Code script (scripts/wip/test-publish.mjs)
      // which has filesystem access to src/content/dialogs/. This endpoint
      // returns the generated metadata so the script can write the file.
      return {
        mode: 'local',
        slug, title: meta.title, description: meta.description,
        question: cleaned[0]?.content || '',
        topic: meta.topic, tags: meta.tags, keywords: meta.keywords,
        excerpt: meta.excerpt,
        rounds: roundsWithSummaries,
        intended_path: `src/content/dialogs/${slug}.md`,
        intended_url: `${SITE_URL}/dialogue/${slug}/`,
        assessment: assessment || null
      };
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'chat/save failed');
      return reply.code(500).send({ error: err.message || 'save failed' });
    }
  });

  // ─── Library stats ──────────────────────────────────────────────────────
  // Single endpoint that answers "how big is the library?" / "what's in it?"
  // for browsing-intent queries. Closes the chat-quality regression where
  // browsing questions returned poor LLM-summarized results — these are
  // structured aggregations the orchestrator can quote directly.
  fastify.get('/library/stats', {
    schema: {
      description: 'Library-wide statistics: totals, distributions by religion/collection/language/year. Cheap to compute (single SQL pass).',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      response: {
        200: { type: 'object', additionalProperties: true }
      }
    }
  }, async (_request, _reply) => {
    const totals = await queryOne(`
      SELECT
        COUNT(*) AS document_count,
        SUM(paragraph_count) AS paragraph_count,
        COUNT(DISTINCT author) AS author_count,
        COUNT(DISTINCT language) AS language_count
      FROM docs WHERE deleted_at IS NULL
    `);
    const byReligion = await queryAll(`
      SELECT religion AS name, COUNT(*) AS documents, SUM(paragraph_count) AS paragraphs
      FROM docs WHERE deleted_at IS NULL AND religion IS NOT NULL
      GROUP BY religion ORDER BY documents DESC
    `);
    const byCollection = await queryAll(`
      SELECT collection AS name, COUNT(*) AS documents
      FROM docs WHERE deleted_at IS NULL AND collection IS NOT NULL
      GROUP BY collection ORDER BY documents DESC LIMIT 30
    `);
    const byLanguage = await queryAll(`
      SELECT COALESCE(language, 'unknown') AS code, COUNT(*) AS documents
      FROM docs WHERE deleted_at IS NULL
      GROUP BY language ORDER BY documents DESC
    `);
    const byEra = await queryAll(`
      SELECT
        CASE
          WHEN year IS NULL THEN 'unknown'
          WHEN year < 1800 THEN 'pre-1800'
          WHEN year < 1850 THEN '1800-1849'
          WHEN year < 1900 THEN '1850-1899'
          WHEN year < 1950 THEN '1900-1949'
          WHEN year < 2000 THEN '1950-1999'
          ELSE '2000+'
        END AS era,
        COUNT(*) AS documents
      FROM docs WHERE deleted_at IS NULL
      GROUP BY era ORDER BY MIN(year)
    `);
    const topAuthors = await queryAll(`
      SELECT author AS name, COUNT(*) AS documents
      FROM docs WHERE deleted_at IS NULL AND author IS NOT NULL AND TRIM(author) != ''
      GROUP BY author ORDER BY documents DESC LIMIT 25
    `);
    return {
      totals,
      by_religion: byReligion,
      by_collection: byCollection,
      by_language: byLanguage,
      by_era: byEra,
      top_authors: topAuthors
    };
  });

  // ─── Document outline / TOC ─────────────────────────────────────────────
  // Returns chapter/section structure derived from content.heading entries
  // (which the parser already populated). Lets the chat assistant navigate
  // a document by chapter rather than blindly reading paragraphs.
  fastify.get('/library/documents/:id/outline', {
    schema: {
      description: 'Document table of contents — heading + paragraph_index pairs from the document. Useful for "show me chapter X" / "what comes after section Y" / scoping a subagent read to a specific section.',
      tags: ['Library'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const docId = parseInt(request.params.id, 10);
    const doc = await queryOne(
      'SELECT id, title, author, religion, collection, year, language, paragraph_count FROM docs WHERE id = ? AND deleted_at IS NULL',
      [docId]
    );
    if (!doc) return reply.code(404).send({ error: 'document_not_found' });

    const headings = await queryAll(`
      SELECT paragraph_index, heading
      FROM content
      WHERE doc_id = ? AND heading IS NOT NULL AND heading != '' AND deleted_at IS NULL
      ORDER BY paragraph_index
    `, [docId]);

    // Compute end-paragraph for each heading (= one before the next heading,
    // or the last paragraph for the final entry). Lets the caller "read all
    // of chapter X" without a separate range query.
    const lastPara = await queryOne(`
      SELECT MAX(paragraph_index) AS last FROM content WHERE doc_id = ? AND deleted_at IS NULL
    `, [docId]);
    const sections = headings.map((h, i) => ({
      heading: h.heading,
      paragraph_index: h.paragraph_index,
      end_paragraph: i + 1 < headings.length ? headings[i + 1].paragraph_index - 1 : (lastPara?.last ?? h.paragraph_index)
    }));

    return {
      document: doc,
      total_paragraphs: lastPara?.last != null ? lastPara.last + 1 : 0,
      sections
    };
  });

  // GET /api/v1/conversations/:slug is registered ABOVE the auth hook —
  // see the public-read block near /health. Defining it here would shadow
  // that public route and force API-key auth, breaking saved share URLs
  // for anonymous visitors.

  // Health endpoint registered above (before auth hook) so it's public
}
