/**
 * Meilisearch Client
 *
 * Hybrid search combining keyword and vector (semantic) search.
 */

import { MeiliSearch } from 'meilisearch';
import { config } from './config.js';
import { logger } from './logger.js';
import { createEmbedding, createEmbeddings } from './ai.js';
import { getAuthority } from './authority.js';
import { queryOne, queryAll } from './db.js';
import { getImportProgress, getIngestionProgress, getIndexingProgress, getCachedContentCounts } from '../services/progress.js';

let client = null;

// In-memory cache extracted to api/lib/search/cache.js. Re-exported here so
// existing importers (api/index.js prewarmCache call, agent-librarian.js
// getSearchCacheStats, etc.) keep working unchanged.
import {
  getCachedSearch,
  setCachedSearch,
  clearSearchCache,
  getSearchCacheStats,
  POPULAR_QUERIES
} from './search/cache.js';

export { clearSearchCache, getSearchCacheStats, POPULAR_QUERIES };

/**
 * Pre-warm the cache with common queries. Stays in this file because it
 * calls keywordSearch which lives below; extracting it would create a
 * circular import.
 */
export async function prewarmCache(queries) {
  logger.info({ queryCount: queries.length }, 'Pre-warming search cache');
  const startTime = Date.now();
  let warmed = 0;
  for (const query of queries) {
    try {
      if (!getCachedSearch(query)) {
        await keywordSearch(query, { limit: 10 });
        warmed++;
      }
    } catch (err) {
      logger.warn({ query, err: err.message }, 'Failed to pre-warm cache for query');
    }
  }
  const elapsedMs = Date.now() - startTime;
  logger.info({ warmed, totalQueries: queries.length, elapsedMs }, 'Search cache pre-warmed');
  return { warmed, elapsedMs };
}

/**
 * Check if Meilisearch is enabled
 */
export function isMeiliEnabled() {
  return config.search.enabled;
}

export function getMeili() {
  if (!config.search.enabled) {
    return null;
  }
  if (!client) {
    client = new MeiliSearch({
      host: config.search.host,
      apiKey: config.search.apiKey
    });
    logger.info({ host: config.search.host }, 'Meilisearch connected');
  }
  return client;
}

// Index names. The canonical INDEXES const is now re-exported from the
// scope-aware registry so search code can resolve per-site indexes via the
// same source of truth.
import { INDEXES, getScopeIndexes, getDefaultScope } from './search/scope.js';
export { INDEXES };

/**
 * Build ranking rules with authority at the configured position.
 * Modern Meilisearch (v1.11+) rules: words, typo, proximity, attributeRank,
 * sort, wordPosition, exactness. Older names like 'attribute' are rejected
 * silently via a failed PATCH, which is how the authority rule vanished from
 * the live index.
 *
 * authority:desc is inserted at config.search.authorityRankPosition (1-7).
 * Note: for hybrid (vector) search, ranking rules only matter as tiebreakers,
 * which rarely fires. See authorityBoost post-hoc reranking below for the
 * mechanism that actually moves canonical sources to the top.
 */
function buildRankingRules() {
  const baseRules = ['words', 'typo', 'proximity', 'attributeRank', 'sort', 'wordPosition', 'exactness'];
  const position = Math.min(baseRules.length, Math.max(1, config.search.authorityRankPosition || 4));

  const rules = [...baseRules];
  rules.splice(position - 1, 0, 'authority:desc');

  logger.info({ position, rules }, 'Built ranking rules with authority position');
  return rules;
}

/**
 * Compute the authority-weighted score for a single hit.
 * final = relevance * (1 + boost * (authority - 5) / 5)
 * authority 5 is neutral; 10 boosts (+boost*100%), 1 penalizes.
 * Missing authority defaults to 5 so undecorated hits are unaffected.
 */
function computeAuthorityScore(hit) {
  const rel = typeof hit._rankingScore === 'number' ? hit._rankingScore : 0;
  const auth = typeof hit.authority === 'number' ? hit.authority : 5;
  const boost = config.search.authorityBoost ?? 0.3;
  return rel * (1 + boost * ((auth - 5) / 5));
}

/**
 * Annotate each hit with `_authorityScore` and return them sorted by it.
 * Every search path in this module runs results through here so canonical
 * sources consistently outrank derivative works at the same relevance tier.
 */
function rerankByAuthority(hits) {
  for (const hit of hits) hit._authorityScore = computeAuthorityScore(hit);
  return [...hits].sort((a, b) => (b._authorityScore || 0) - (a._authorityScore || 0));
}

/**
 * Compute internal fetch size so authority reranking has room to pull canonical
 * hits up from just outside the requested window. Capped at maxResults.
 */
function overFetchForRerank(targetCount) {
  const multiplier = config.search.authorityRerankMultiplier || 3;
  const maxResults = config.search.maxResults || 100;
  return Math.min(maxResults, Math.max(targetCount, Math.ceil(targetCount * multiplier)));
}

/**
 * Initialize indexes with proper settings
 */
export async function initializeIndexes() {
  if (!config.search.enabled) {
    logger.info('Meilisearch disabled, skipping index initialization');
    return null;
  }

  const meili = getMeili();
  const expectedDimensions = config.ai.embeddings.dimensions;

  // Paragraphs index (main search index)
  const paragraphs = meili.index(INDEXES.PARAGRAPHS);

  // Check if existing index has wrong dimensions - if so, delete and recreate
  try {
    const settings = await paragraphs.getSettings();
    const currentDimensions = settings.embedders?.default?.dimensions;
    if (currentDimensions && currentDimensions !== expectedDimensions) {
      logger.warn({ currentDimensions, expectedDimensions }, 'Paragraphs index has wrong embedding dimensions, deleting and recreating');
      await meili.deleteIndex(INDEXES.PARAGRAPHS);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    if (!err.message?.includes('not found')) {
      logger.debug({ err: err.message }, 'Could not check paragraphs index settings');
    }
  }

  // Update settings via direct HTTP to avoid meilisearch-js client hanging
  // when Meilisearch has a large task queue
  const meiliUrl = config.search.host || 'http://localhost:7700';
  const meiliKey = config.search.apiKey;
  const headers = { 'Content-Type': 'application/json' };
  if (meiliKey) headers['Authorization'] = `Bearer ${meiliKey}`;

  const paragraphSettings = {
    searchableAttributes: ['text', 'context', 'heading', 'title', 'author'],
    filterableAttributes: [
      'doc_id', 'religion', 'collection', 'language', 'year',
      'paragraph_index', 'blocktype', 'author', 'title', 'authority', 'encumbered'
    ],
    sortableAttributes: ['year', 'created_at', 'paragraph_index', 'authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 },
    embedders: {
      default: { source: 'userProvided', dimensions: expectedDimensions }
    }
  };

  const documentSettings = {
    searchableAttributes: ['title', 'author', 'description'],
    filterableAttributes: ['religion', 'collection', 'language', 'year', 'author', 'authority', 'encumbered'],
    sortableAttributes: ['year', 'title', 'created_at', 'authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 }
  };

  // HyPE sidecar — each row is ONE hypothetical question. The question text
  // is the only searchable field; its embedding is the semantic match target.
  // paragraph_id is the back-reference; everything else is metadata for
  // filtering and tier-aware ranking inside the multi-index merge.
  const hypeSettings = {
    searchableAttributes: ['question_text'],
    filterableAttributes: ['paragraph_id', 'doc_id', 'religion', 'collection', 'authority', 'encumbered', 'is_thesis'],
    sortableAttributes: ['authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 },
    embedders: {
      default: { source: 'userProvided', dimensions: expectedDimensions }
    }
  };

  // Ensure indexes exist and settings are applied. Non-blocking — if Meilisearch
  // is busy (processing a settings rebuild on millions of docs), we don't block startup.
  const fetchWithTimeout = (url, opts, ms = 5000) => {
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
  };

  for (const [indexUid, pk] of [[INDEXES.PARAGRAPHS, 'id'], [INDEXES.DOCUMENTS, 'id'], [INDEXES.HYPE_QUESTIONS, 'id']]) {
    try {
      await fetchWithTimeout(`${meiliUrl}/indexes`, {
        method: 'POST', headers, body: JSON.stringify({ uid: indexUid, primaryKey: pk })
      });
    } catch { /* index may already exist or Meilisearch busy */ }
  }

  // Enqueue settings (5s timeout — just needs to accept the task, not process it)
  for (const [indexName, settings] of [[INDEXES.PARAGRAPHS, paragraphSettings], [INDEXES.DOCUMENTS, documentSettings], [INDEXES.HYPE_QUESTIONS, hypeSettings]]) {
    try {
      const res = await fetchWithTimeout(`${meiliUrl}/indexes/${indexName}/settings`, {
        method: 'PATCH', headers, body: JSON.stringify(settings)
      });
      const task = await res.json();
      logger.info({ taskUid: task.taskUid, index: indexName }, 'Settings update enqueued');
    } catch (err) {
      logger.warn({ err: err.message, index: indexName }, 'Settings enqueue failed (Meilisearch may be busy)');
    }
  }

  logger.info('Search indexes initialized (settings enqueued)');

  // CRITICAL: Verify embedder config was actually applied after a delay.
  // A partial PATCH to /settings can silently clear the embedder config,
  // which destroys the vector index and requires a week-long re-index.
  // Verify both PARAGRAPHS and HYPE_QUESTIONS (any vector-bearing index).
  setTimeout(async () => {
    for (const indexUid of [INDEXES.PARAGRAPHS, INDEXES.HYPE_QUESTIONS]) {
      try {
        const res = await fetch(`${meiliUrl}/indexes/${indexUid}/settings/embedders`, { headers });
        const embedders = await res.json();
        if (!embedders?.default) {
          logger.error({ index: indexUid }, 'CRITICAL: Meilisearch embedder config is MISSING. Re-applying...');
          await fetch(`${meiliUrl}/indexes/${indexUid}/settings`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ embedders: { default: { source: 'userProvided', dimensions: expectedDimensions } } })
          });
          logger.info({ index: indexUid }, 'Embedder config re-applied');
          continue;
        }
        const dims = embedders.default.dimensions;
        if (dims !== expectedDimensions) {
          logger.warn({ index: indexUid, expected: expectedDimensions, actual: dims }, 'Embedder dimensions mismatch');
        } else {
          logger.info({ index: indexUid, dimensions: dims }, 'Embedder config verified OK');
        }
      } catch (err) {
        logger.warn({ err: err.message, index: indexUid }, 'Failed to verify embedder config');
      }
    }
  }, 30000); // Check 30s after startup (allows settings tasks to complete)
}

/**
 * Hybrid search combining keyword and semantic search
 */
export async function hybridSearch(query, options = {}) {
  if (!config.search.enabled) {
    logger.warn('Meilisearch disabled, returning empty results');
    return { hits: [], totalHits: 0, query };
  }

  const {
    limit = 20,
    offset = 0,
    filters = {},
    filterTerms = [], // Array of terms to match against author/collection/title (case insensitive)
    semanticRatio = 0.5, // 0 = keyword only, 1 = semantic only
    attributesToRetrieve = ['*'],
    attributesToHighlight = ['text', 'heading'],
    highlightPreTag = '<mark>',
    highlightPostTag = '</mark>'
  } = options;

  const meili = getMeili();
  // Resolve target indexes from scope_config. Default = primary only
  // (preserves existing behavior for callers that don't pass scope_config).
  // Site-only locations are excluded from the default by getDefaultScope.
  const scopeConfig = options.scope_config || { primary: true, sites: [] };
  const targetIndexNames = getScopeIndexes(scopeConfig);
  if (targetIndexNames.length === 0) {
    return { hits: [], totalHits: 0, query };
  }

  // Build filter string
  const filterParts = [];
  if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
  if (filters.collection) filterParts.push(`collection = "${filters.collection}"`);
  if (filters.language) filterParts.push(`language = "${filters.language}"`);
  if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
  if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
  if (filters.documentId) filterParts.push(`doc_id = ${filters.documentId}`);  // INTEGER, no quotes

  // Add text-based filters for author/collection/title (from parenthetical query syntax)
  if (filterTerms.length > 0) {
    const textFilters = [];
    for (const term of filterTerms) {
      // Match against author, collection, or title (CONTAINS is case insensitive in Meilisearch)
      textFilters.push(`author CONTAINS "${term}"`);
      textFilters.push(`collection CONTAINS "${term}"`);
      textFilters.push(`title CONTAINS "${term}"`);
    }
    // Join with OR - any match is acceptable
    filterParts.push(`(${textFilters.join(' OR ')})`);
  }

  const filterString = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

  // Generate embedding for semantic search
  let vector = null;
  if (semanticRatio > 0) {
    try {
      const embedding = await createEmbedding(query, { caller: 'search' });
      vector = embedding.embedding;
    } catch (err) {
      logger.warn({ err }, 'Failed to generate embedding, falling back to keyword search');
    }
  }

  // Over-fetch so authority reranking can pull canonical sources up from just
  // outside the requested window. Capped at maxResults to keep latency bounded.
  const internalLimit = overFetchForRerank(offset + limit);

  // Perform search
  const searchParams = {
    q: query,
    limit: internalLimit,
    offset: 0,
    filter: filterString,
    attributesToRetrieve,
    attributesToHighlight,
    highlightPreTag,
    highlightPostTag,
    showRankingScore: true,
    showMatchesPosition: true,  // Get exact byte positions of matches for sentence extraction
    matchingStrategy: 'all'  // Require ALL words to match (AND), not just some (OR)
  };

  // Add hybrid search if we have a vector
  if (vector) {
    searchParams.hybrid = {
      semanticRatio,
      embedder: 'default'
    };
    searchParams.vector = vector;
  }

  // Fan out across all target indexes in parallel. For the common
  // single-index case (default scope, no per-site indexes registered yet)
  // this collapses to one call — no overhead.
  const indexResults = await Promise.all(
    targetIndexNames.map(name =>
      meili.index(name).search(query, searchParams).catch(err => {
        // Per-index missing/empty (common before sync) shouldn't kill the
        // whole search. Log and return empty for that index.
        logger.warn({ err: err.message, index: name }, 'hybridSearch: per-index search failed (continuing)');
        return { hits: [], processingTimeMs: 0, estimatedTotalHits: 0, query };
      })
    )
  );

  const allHits = indexResults.flatMap(r => r.hits || []);
  const totalProcessingMs = indexResults.reduce((s, r) => s + (r.processingTimeMs || 0), 0);
  const estimated = indexResults.reduce((s, r) => s + (r.estimatedTotalHits || 0), 0);

  // Sort by Meili ranking score (comparable across indexes since they share
  // ranking rules from initializeIndexes) before authority rerank.
  allHits.sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  // Authority reranking: blend Meilisearch relevance with the per-doc authority
  // score so canonical sources surface above citing/derivative works at the
  // same relevance tier. Runs unconditionally — callers don't opt in.
  const reranked = rerankByAuthority(allHits).slice(offset, offset + limit);

  return {
    hits: reranked,
    query,
    processingTimeMs: totalProcessingMs,
    estimatedTotalHits: estimated,
    limit,
    offset,
    _scopeIndexes: targetIndexNames
  };
}

// Fuzzy text helpers extracted to api/lib/search/fuzzy.js. They're pure
// functions with no DB or Meili dependencies.
import {
  levenshtein,
  stripTashkeel,
  textContainsFuzzy,
  hasAllTermMatches,
  calculatePhraseScore
} from './search/fuzzy.js';

/**
 * Keyword-only search (faster, no embedding needed)
 * Filters results to ensure ALL query terms appear (prefix matching allowed)
 * Boosts exact phrase matches to the top
 *
 * Supports pagination via offset parameter.
 * Results are cached for 5 minutes to enable fast pagination.
 */
export async function keywordSearch(query, options = {}) {
  const { limit = 10, offset = 0, ...restOptions } = options;

  // Check cache first
  const cached = getCachedSearch(query);

  if (cached) {
    // Return slice from cached results
    const hits = cached.hits.slice(offset, offset + limit);
    return {
      hits,
      estimatedTotalHits: cached.estimatedTotalHits,
      processingTimeMs: 0,  // Cached, no processing
      cached: true,
      hasMore: offset + limit < cached.estimatedTotalHits
    };
  }

  // Not cached - compute full result set
  // Request more results than typical pagination needs (150 max)
  const results = await hybridSearch(query, {
    ...restOptions,
    limit: 150,  // Fetch max for caching
    semanticRatio: 0
  });

  // Extract query terms for filtering (min 2 chars, filter stop words)
  // Strip Arabic diacritics so terms match undiacritized indexed text
  const queryTerms = stripTashkeel(query.toLowerCase())
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  logger.info({ query, queryTerms, meiliHits: results.hits.length, meiliEstimate: results.estimatedTotalHits }, 'keywordSearch: before filtering');

  let rankedHits;

  // If only stop words or single short word, return unfiltered
  if (queryTerms.length === 0) {
    rankedHits = results.hits;
  } else {
    // Filter to only results where Meilisearch found ALL query terms (with fuzzy matching)
    const filteredHits = results.hits.filter(hit => {
      return hasAllTermMatches(hit, queryTerms);
    });

    // Re-rank: exact phrase matches first, then authority-weighted score so
    // canonical sources outrank citing works at the same phrase-match tier.
    // _authorityScore is already set by the hybridSearch call above.
    rankedHits = filteredHits.map(hit => ({
      ...hit,
      _phraseScore: calculatePhraseScore(hit.text || '', query, queryTerms)
    })).sort((a, b) => {
      if (b._phraseScore !== a._phraseScore) {
        return b._phraseScore - a._phraseScore;
      }
      return (b._authorityScore || 0) - (a._authorityScore || 0);
    });
  }

  logger.info({ query, filteredCount: rankedHits.length }, 'keywordSearch: after filtering');

  // Filter out trivially short passages (headings, fragments)
  const MIN_TEXT_LENGTH = 40;
  rankedHits = rankedHits.filter(hit => (hit.text || '').length >= MIN_TEXT_LENGTH);

  // Deduplicate: 3 layers
  // 1. Exact: same doc_id + paragraph_index (duplicate index entries)
  // 2. Content: same text appearing in different documents (secondary quoting primary)
  // 3. Document: max 3 passages per document (prevent single doc flooding results)
  const seenKeys = new Set();
  const seenTexts = new Set();
  const docIdCounts = {};
  const titleCounts = {};
  const MAX_PER_DOC = 2;
  const MAX_PER_TITLE = 2; // catches same book indexed under different doc_ids
  const deduplicatedHits = [];
  for (const hit of rankedHits) {
    const key = `${hit.doc_id || hit.document_id}-${hit.paragraph_index}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    // Content dedup: normalize and check first 100 chars
    const textKey = (hit.text || '').replace(/\s+/g, ' ').trim().slice(0, 100).toLowerCase();
    if (textKey.length > 20 && seenTexts.has(textKey)) continue;
    seenTexts.add(textKey);
    // Document limit: max N passages from same doc_id
    const docId = hit.doc_id || hit.document_id;
    docIdCounts[docId] = (docIdCounts[docId] || 0) + 1;
    if (docIdCounts[docId] > MAX_PER_DOC) continue;
    // Title limit: catches duplicate uploads with different doc_ids
    const titleKey = (hit.title || '').toLowerCase().trim();
    if (titleKey) {
      titleCounts[titleKey] = (titleCounts[titleKey] || 0) + 1;
      if (titleCounts[titleKey] > MAX_PER_TITLE) continue;
    }
    deduplicatedHits.push(hit);
  }

  if (deduplicatedHits.length !== rankedHits.length) {
    logger.info({ query, before: rankedHits.length, after: deduplicatedHits.length, removed: rankedHits.length - deduplicatedHits.length }, 'keywordSearch: removed duplicates');
  }

  rankedHits = deduplicatedHits;

  // Cache the full ranked result set
  setCachedSearch(query, rankedHits, rankedHits.length);

  // Return requested slice
  const hits = rankedHits.slice(offset, offset + limit);

  return {
    hits,
    estimatedTotalHits: rankedHits.length,
    processingTimeMs: results.processingTimeMs,
    cached: false,
    hasMore: offset + limit < rankedHits.length
  };
}

/**
 * Semantic-only search
 */
export async function semanticSearch(query, options = {}) {
  return hybridSearch(query, { ...options, semanticRatio: 1 });
}

// ─── HyPE sidecar search ──────────────────────────────────────────────────
//
// Search the `hype_questions` index for questions semantically similar to
// the user's query. Each hit carries the back-reference (paragraph_id) so
// the multi-index merge can promote the underlying paragraph.
//
// HyPE matches are HIGH SIGNAL: each row is "a question this paragraph was
// designed to answer." A user query that semantically matches a stored
// question is a strong vote for the paragraph behind that question.

/**
 * Search the HyPE sidecar for question-similarity matches.
 * @param {string} query - the user's query (treated as a question)
 * @param {object} options
 * @param {number} options.limit - top-K hits to return (default 10)
 * @param {object} options.filters - {religion, collection, doc_id, encumbered}
 * @returns {Object} { hits: [{paragraph_id, doc_id, religion, authority, question_text, _semanticScore}], ... }
 */
// HyPE search delegated to api/lib/search/hype.js.
import {
  searchHypeQuestions as _searchHypeQuestions,
  syncHypeBatch as _syncHypeBatch
} from './search/hype.js';

export async function searchHypeQuestions(query, options = {}) {
  return _searchHypeQuestions({ getMeili, INDEXES }, query, options);
}

// ─── Multi-index merged search (RRF) ──────────────────────────────────────
//
// Queries the main `paragraphs` index AND every configured sidecar index
// in parallel, then merges results by paragraph_id using Reciprocal Rank
// Fusion. A paragraph that ranks high in MULTIPLE indexes scores higher
// than one only matching in one — surfaces paragraphs that semantically
// match BOTH the user's question (via HyPE) AND the topic (via main).
//
// Adding a new sidecar layer (summaries, entities, glossary tags, etc.)
// is purely additive: define a new INDEXES.* entry, write its sync logic,
// add it as a parallel call here with appropriate weight. Existing layers
// are untouched.
const RRF_K = 60;
const DEFAULT_WEIGHTS = {
  main: 1.0,    // paragraphs hybrid (text + context + paragraph embedding)
  hype: 1.5     // HyPE question + thesis match (highest signal — designed to answer)
};

/**
 * Merged search across paragraphs + sidecars with RRF aggregation.
 * Drop-in replacement for hybridSearch() when you want layered enrichment.
 *
 * @param {string} query
 * @param {object} options
 * @param {number} options.limit
 * @param {object} options.filters
 * @param {object} options.weights - per-index weights {main, hype}
 * @param {boolean} options.includeMatchedHype - attach .matched_hype on each hit (debug)
 * @returns {Object} { hits, estimatedTotalHits, _layers: {main: count, hype: count} }
 */
export async function multiIndexSearch(query, options = {}) {
  const limit = options.limit || 10;
  const overFetch = Math.max(limit * 3, 30);
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const filters = options.filters || {};

  // scope_config plumbed through so site-only queries reach the right Meili
  // index (and ONLY the right index — hard rule for site-only).
  const scope_config = options.scope_config;

  const [mainResult, hypeResult] = await Promise.all([
    hybridSearch(query, { limit: overFetch, filters, scope_config }).catch(err => {
      logger.warn({ err: err.message }, 'multiIndexSearch: main hybrid failed');
      return { hits: [] };
    }),
    // HyPE: only query when scope includes primary. Site-only sites don't
    // have HyPE (gated off in v1), and supplementals don't either. The
    // primary `hype_questions` index is the only one populated.
    (!scope_config || scope_config.primary)
      ? searchHypeQuestions(query, { limit: overFetch, filters }).catch(err => {
          logger.warn({ err: err.message }, 'multiIndexSearch: hype failed');
          return { hits: [] };
        })
      : Promise.resolve({ hits: [] })
  ]);

  // RRF aggregation by paragraph_id
  const aggregate = new Map(); // paragraph_id → { paragraph, score, matchedHype, mainRank, hypeRank }

  (mainResult.hits || []).forEach((hit, rank) => {
    const pid = hit.id;
    const cur = aggregate.get(pid) || { paragraph: null, score: 0, matchedHype: null, mainRank: null, hypeRank: null };
    cur.score += weights.main / (RRF_K + rank);
    cur.paragraph = hit; // full paragraph data
    cur.mainRank = rank;
    aggregate.set(pid, cur);
  });

  (hypeResult.hits || []).forEach((hit, rank) => {
    const pid = hit.paragraph_id;
    const cur = aggregate.get(pid) || { paragraph: null, score: 0, matchedHype: null, mainRank: null, hypeRank: null };
    cur.score += weights.hype / (RRF_K + rank);
    cur.matchedHype = hit.question_text;
    cur.hypeRank = rank;
    if (!cur.paragraph) {
      // Hype-only hit — synthesize a partial paragraph stub from the hype row's
      // metadata. The caller will fetch the full paragraph below.
      cur.paragraph = {
        id: pid,
        doc_id: hit.doc_id,
        religion: hit.religion,
        collection: hit.collection,
        authority: hit.authority,
        _stub: true
      };
    }
    aggregate.set(pid, cur);
  });

  // Fetch full paragraphs for hype-only hits (those flagged _stub).
  // The paragraphs index uses `id` as primary key but doesn't expose `id`
  // as filterable, so we use getDocuments({ ids: [...] }) — primary-key
  // lookup which doesn't require the field to be in filterableAttributes.
  const stubIds = [...aggregate.values()].filter(e => e.paragraph?._stub).map(e => e.paragraph.id);
  if (stubIds.length > 0) {
    try {
      const meili = getMeili();
      const fetched = await meili.index(INDEXES.PARAGRAPHS).getDocuments({
        ids: stubIds,
        limit: stubIds.length
      });
      for (const doc of (fetched.results || fetched.hits || [])) {
        const e = aggregate.get(doc.id);
        if (e) e.paragraph = { ...doc, _stub: false };
      }
    } catch (err) {
      logger.warn({ err: err.message, stubCount: stubIds.length }, 'multiIndexSearch: stub paragraph fetch failed');
    }
  }

  // Sort by RRF score, drop entries that couldn't be fetched, limit
  const sorted = [...aggregate.values()]
    .filter(e => e.paragraph && !e.paragraph._stub)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const hits = sorted.map(e => ({
    ...e.paragraph,
    _rrfScore: e.score,
    ...(options.includeMatchedHype && e.matchedHype ? { matched_hype: e.matchedHype } : {}),
    _layerRanks: { main: e.mainRank, hype: e.hypeRank }
  }));

  logger.info({
    query: query.slice(0, 80),
    main_hits: (mainResult.hits || []).length,
    hype_hits: (hypeResult.hits || []).length,
    merged: aggregate.size,
    returned: hits.length
  }, 'multi-index search complete');

  return {
    hits,
    estimatedTotalHits: aggregate.size,
    _layers: {
      main: (mainResult.hits || []).length,
      hype: (hypeResult.hits || []).length
    }
  };
}

// ─── HyPE sidecar sync ────────────────────────────────────────────────────
//
// Pulls paragraphs with `enhanced_synced=0` and `hyp_questions IS NOT NULL`,
// generates an embedding per question, and upserts one row per question into
// the `hype_questions` Meilisearch index. Marks the source paragraph
// `enhanced_synced=1` after successful indexing.
//
// Idempotent on re-runs: re-indexing a paragraph deletes its prior
// `hype_questions` rows (filter by paragraph_id) before re-inserting,
// so updated questions overwrite stale ones cleanly.
//
// Designed to be called periodically from the unified worker.

/**
 * Parse the stored hyp_questions string into an array of question strings.
 * Storage format: newline-separated, already de-numbered/de-bulleted by
 * parseHyPEResponse. Filter empty lines defensively.
 */
// syncHypeBatch delegated to api/lib/search/hype.js (imported above as _syncHypeBatch).
export async function syncHypeBatch(opts = {}) {
  return _syncHypeBatch({ getMeili, INDEXES }, opts);
}

/**
 * Federated search - execute multiple queries in a single request with merged, deduplicated results
 * @param {Array} queries - Array of { query, filter, limit, vector, semanticRatio }
 * @returns {Object} { hits: [], processingTimeMs }
 */
export async function federatedSearch(queries, options = {}) {
  const meili = getMeili();
  const { limit = 20, offset = 0 } = options;

  // For federated search, limit/offset go on federation object, not individual queries
  const searchQueries = queries.map(q => ({
    indexUid: INDEXES.PARAGRAPHS,
    q: q.query,
    filter: q.filter || undefined,
    vector: q.vector || undefined,
    hybrid: q.vector ? { semanticRatio: q.semanticRatio || 0.5, embedder: 'default' } : undefined,
    showRankingScore: true,
    showMatchesPosition: true,  // Get exact positions for sentence extraction
    attributesToRetrieve: ['*'],
    attributesToHighlight: ['text', 'heading'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
    matchingStrategy: 'all'  // Require ALL words to match
  }));

  // Federated search: merges and deduplicates results across all queries.
  // Over-fetch so authority reranking has material, then trim to the requested
  // window after reranking.
  const federationLimit = overFetchForRerank(offset + limit);
  const response = await meili.multiSearch({
    federation: { limit: federationLimit, offset: 0 },
    queries: searchQueries
  });

  const reranked = rerankByAuthority(response.hits || []).slice(offset, offset + limit);

  return {
    hits: reranked,
    processingTimeMs: response.processingTimeMs
  };
}

/**
 * Generate embeddings for multiple texts in a single batch API call
 * @param {string[]} texts - Array of texts to embed
 * @returns {number[][]} Array of embedding vectors
 */
export async function batchEmbeddings(texts) {
  if (texts.length === 0) return [];

  const { embeddings } = await createEmbeddings(texts, { caller: 'search:rerank' });
  return embeddings;
}

// Meilisearch payload limit: 100MB
// Each paragraph with 3072-dim vector is ~30KB (text + vector + metadata)
// Batch 200 paragraphs per upload to stay well under limit (~6MB per batch)
const MEILI_BATCH_SIZE = 200;

/**
 * Index a document with its paragraphs
 * Handles batching for large documents to avoid Meilisearch payload limits
 */
export async function indexDocument(document, paragraphs) {
  if (!config.search.enabled) {
    logger.debug({ documentId: document.id }, 'Meilisearch disabled, skipping indexing');
    return;
  }
  const meili = getMeili();

  // Index document metadata (primary key: id)
  await meili.index(INDEXES.DOCUMENTS).addDocuments([document], { primaryKey: 'id' });

  // Index paragraphs in batches to avoid payload size limits
  if (paragraphs.length > 0) {
    const paragraphIndex = meili.index(INDEXES.PARAGRAPHS);

    for (let i = 0; i < paragraphs.length; i += MEILI_BATCH_SIZE) {
      const batch = paragraphs.slice(i, i + MEILI_BATCH_SIZE);
      await paragraphIndex.addDocuments(batch, { primaryKey: 'id' });

      // Log progress for large documents
      if (paragraphs.length > MEILI_BATCH_SIZE) {
        logger.debug({
          documentId: document.id,
          batch: Math.floor(i / MEILI_BATCH_SIZE) + 1,
          total: Math.ceil(paragraphs.length / MEILI_BATCH_SIZE),
          paragraphs: `${Math.min(i + MEILI_BATCH_SIZE, paragraphs.length)}/${paragraphs.length}`
        }, 'Indexing paragraph batch');
      }
    }
  }

  logger.info({ documentId: document.id, paragraphCount: paragraphs.length }, 'Document indexed');
}

/**
 * Delete a document and its paragraphs
 */
export async function deleteDocument(documentId) {
  if (!config.search.enabled) {
    logger.debug({ documentId }, 'Meilisearch disabled, skipping delete');
    return;
  }
  const meili = getMeili();

  await meili.index(INDEXES.DOCUMENTS).deleteDocument(documentId);
  await meili.index(INDEXES.PARAGRAPHS).deleteDocuments({
    filter: `doc_id = ${documentId}`  // INTEGER, no quotes
  });

  logger.info({ documentId }, 'Document deleted from index');
}

/**
 * Get library statistics from SQLite (source of truth)
 * Meilisearch is only used for indexing progress status
 */
export async function getStats() {
  // Get progress from progress service
  const [importProgress, ingestionProgress, indexingProgress] = await Promise.all([
    Promise.resolve(getImportProgress()),
    getIngestionProgress(),
    getIndexingProgress()
  ]);

  try {
    // Use cached counts for the heavy content table queries
    const cachedCounts = await getCachedContentCounts();

    // Docs table is small — GROUP BY queries are fast
    const [religionRows, collectionRows] = await Promise.all([
      queryAll(`
        SELECT religion, COUNT(*) as count
        FROM docs
        WHERE deleted_at IS NULL AND religion IS NOT NULL
        GROUP BY religion
      `),
      queryAll(`
        SELECT collection, COUNT(*) as count
        FROM docs
        WHERE deleted_at IS NULL AND collection IS NOT NULL
        GROUP BY collection
      `)
    ]);

    const totalDocuments = cachedCounts.totalDocs;
    const totalPassages = cachedCounts.totalParagraphs;

    // Build religion and collection count maps
    const religionCounts = {};
    for (const row of religionRows) {
      religionCounts[row.religion] = row.count;
    }

    const collectionCounts = {};
    for (const row of collectionRows) {
      collectionCounts[row.collection] = row.count;
    }

    // Estimate total words (~100 words per paragraph average)
    const totalWords = totalPassages * 100;

    // Indexing status derived from SQLite — no Meilisearch HTTP calls needed
    const meilisearchIndexing = (indexingProgress?.pending || 0) > 0;

    return {
      totalDocuments,
      totalPassages,
      totalWords,
      religions: Object.keys(religionCounts).length,
      religionCounts,
      collections: Object.keys(collectionCounts).length,
      collectionCounts,
      meilisearchEnabled: config.search.enabled,
      meilisearchIndexing,
      importProgress,
      ingestionProgress,
      indexingProgress,
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to get library stats');
    return {
      totalDocuments: 0,
      totalPassages: 0,
      totalWords: 0,
      religions: 0,
      religionCounts: {},
      collections: 0,
      collectionCounts: {},
      meilisearchEnabled: config.search.enabled,
      meilisearchIndexing: false,
      meiliTaskProgress: null,
      importProgress,
      ingestionProgress,
      indexingProgress,
      error: err.message
    };
  }
}

/**
 * Health check
 */
export async function healthCheck() {
  if (!config.search.enabled) {
    return { status: 'disabled', message: 'Meilisearch is disabled' };
  }
  try {
    const meili = getMeili();
    const health = await meili.health();
    return { status: 'ok', ...health };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}


// =============================================================================
// SENTENCE EXTRACTION + HIGHLIGHTING — extracted to api/lib/search/highlighting.js
// =============================================================================
// Re-exported here so existing importers (chat.js, public-api.js, etc.) keep
// working unchanged. Each is a pure helper; see search/highlighting.js for
// the full implementation.

import {
  extractMatchingSentences,
  highlightBestSentence,
  enrichHitsWithExcerpts
} from './search/highlighting.js';
export { extractMatchingSentences, highlightBestSentence, enrichHitsWithExcerpts };


// ─── mergeSearchResults ───────────────────────────────────────────────────────

/**
 * Merges base search hits with enhanced (AI-enriched) hits by paragraph id.
 * Base hits come first (preserving ranking), enhanced-only hits appended.
 * @param {Array} baseHits - hits from keyword/vector search
 * @param {Array} enhancedHits - hits from AI enhancement pipeline
 * @returns {Array} merged hits
 */
export function mergeSearchResults(baseHits, enhancedHits) {
  const enhancedMap = new Map(enhancedHits.map(h => [h.id, h]));
  const seen = new Set();
  const merged = baseHits.map(hit => {
    seen.add(hit.id);
    const enhanced = enhancedMap.get(hit.id);
    return enhanced ? { ...hit, ...enhanced } : { ...hit };
  });
  for (const hit of enhancedHits) {
    if (!seen.has(hit.id)) merged.push({ ...hit });
  }
  return merged;
}

export const search = {
  getMeili,
  initializeIndexes,
  hybridSearch,
  keywordSearch,
  semanticSearch,
  federatedSearch,
  batchEmbeddings,
  indexDocument,
  deleteDocument,
  getStats,
  healthCheck,
  extractMatchingSentences,
  enrichHitsWithExcerpts,
  highlightBestSentence,
  prewarmCache,
  getSearchCacheStats,
  clearSearchCache,
  INDEXES,
  POPULAR_QUERIES
};

export default search;
