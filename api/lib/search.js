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

// Index names
export const INDEXES = {
  DOCUMENTS: 'documents',
  PARAGRAPHS: 'paragraphs',
  // Sidecar enrichment indexes — each entry is one enrichment shard with
  // its own embedding, pointing back to the parent paragraph by paragraph_id.
  // Enables adding new enrichment layers (HyPE, future: summaries, entities,
  // glossary tags) without re-embedding existing paragraphs.
  HYPE_QUESTIONS: 'hype_questions'
};

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
  const index = meili.index(INDEXES.PARAGRAPHS);

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

  const results = await index.search(query, searchParams);

  // Authority reranking: blend Meilisearch relevance with the per-doc authority
  // score so canonical sources surface above citing/derivative works at the
  // same relevance tier. Runs unconditionally — callers don't opt in.
  const reranked = rerankByAuthority(results.hits).slice(offset, offset + limit);

  return {
    hits: reranked,
    query: results.query,
    processingTimeMs: results.processingTimeMs,
    estimatedTotalHits: results.estimatedTotalHits,
    limit,
    offset
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

  const [mainResult, hypeResult] = await Promise.all([
    hybridSearch(query, { limit: overFetch, filters }).catch(err => {
      logger.warn({ err: err.message }, 'multiIndexSearch: main hybrid failed');
      return { hits: [] };
    }),
    searchHypeQuestions(query, { limit: overFetch, filters }).catch(err => {
      logger.warn({ err: err.message }, 'multiIndexSearch: hype failed');
      return { hits: [] };
    })
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
// SENTENCE EXTRACTION UTILITIES
// =============================================================================

/**
 * Extract sentences containing search matches from a Meilisearch hit.
 * Uses _matchesPosition to find exact locations and extracts surrounding sentences.
 * Preserves Meilisearch highlighting from _formatted.text if available.
 *
 * @param {Object} hit - Meilisearch search hit with _matchesPosition
 * @param {Object} options - Options
 * @param {number} options.contextSentences - Number of sentences before/after match to include (default: 1)
 * @param {number} options.maxLength - Maximum length of extracted text (default: 500)
 * @returns {Object} { sentences: string[], matchRanges: [], fullText: string, highlightedText: string }
 */
export function extractMatchingSentences(hit, options = {}) {
  const { contextSentences = 1, maxLength = 500 } = options;
  const text = hit.text || '';
  const matchesPosition = hit._matchesPosition?.text || [];

  if (!text || matchesPosition.length === 0) {
    // No matches - return truncated text at word boundary
    let truncated = text;
    if (text.length > maxLength) {
      truncated = text.slice(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.6) {
        truncated = truncated.slice(0, lastSpace);
      }
    }
    return {
      sentences: [truncated],
      highlightedSentences: [truncated],
      matchRanges: [],
      fullText: text
    };
  }

  // Meilisearch returns byte positions, but we need character positions
  // For texts with multi-byte UTF-8 chars, we'll use the match positions as hints
  // and find proper sentence boundaries from there

  // Get approximate match regions - these may be off for UTF-8 but give us areas to look
  const matchRegions = matchesPosition.map(m => ({
    start: m.start,
    length: m.length
  }));

  // Extract sentences containing matches using character-based boundary detection
  const extractedSentences = [];
  const seenRanges = new Set(); // Avoid duplicating overlapping sentences

  for (const region of matchRegions) {
    // Use the byte position as a hint - clamp to text length for safety
    const hintPosition = Math.min(region.start, text.length - 1);

    // Extract the sentence at this position with context
    const sentence = extractSentenceAtPosition(text, hintPosition, contextSentences);

    // Create a key to detect duplicates/overlaps
    const rangeKey = `${sentence.start}-${sentence.end}`;
    if (seenRanges.has(rangeKey)) continue;

    // Check for overlapping ranges (merge nearby)
    let isOverlapping = false;
    for (const existing of extractedSentences) {
      if (sentence.start <= existing.end && sentence.end >= existing.start) {
        // Merge: extend existing range
        existing.start = Math.min(existing.start, sentence.start);
        existing.end = Math.max(existing.end, sentence.end);
        existing.text = text.slice(existing.start, existing.end).trim();
        isOverlapping = true;
        break;
      }
    }

    if (!isOverlapping) {
      extractedSentences.push(sentence);
      seenRanges.add(rangeKey);
    }
  }

  // Sort by position and limit to maxLength
  extractedSentences.sort((a, b) => a.start - b.start);

  const excerptParts = [];
  let totalLength = 0;

  for (const sentence of extractedSentences) {
    const remainingSpace = maxLength - totalLength;

    if (sentence.text.length <= remainingSpace) {
      // Sentence fits entirely
      excerptParts.push(sentence.text);
      totalLength += sentence.text.length + 5; // +5 for " ... " separator
    } else if (excerptParts.length === 0 || remainingSpace > maxLength * 0.3) {
      // First sentence or significant space left - truncate at sentence boundary
      const truncated = sentence.text.slice(0, remainingSpace);
      const sentenceEndMatch = truncated.match(/.*[.!?]["']?\s/s);
      if (sentenceEndMatch && sentenceEndMatch[0].length > remainingSpace * 0.4) {
        excerptParts.push(sentenceEndMatch[0].trim());
        totalLength += sentenceEndMatch[0].length + 5;
      } else if (excerptParts.length === 0) {
        // First sentence with no good boundary - use word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > remainingSpace * 0.5) {
          excerptParts.push(truncated.slice(0, lastSpace));
        } else {
          excerptParts.push(truncated);
        }
        totalLength = maxLength; // Stop here
      }
      break; // Don't add more after truncating
    } else {
      break; // Not enough space for meaningful content
    }
  }

  // If somehow we got nothing, return truncated text at sentence boundary
  if (excerptParts.length === 0) {
    if (text.length <= maxLength) {
      excerptParts.push(text);
    } else {
      // Find the last sentence boundary before maxLength
      const truncated = text.slice(0, maxLength);
      // Look for sentence-ending punctuation followed by space or end
      const sentenceEndMatch = truncated.match(/.*[.!?]["']?\s/s);
      if (sentenceEndMatch && sentenceEndMatch[0].length > maxLength * 0.5) {
        excerptParts.push(sentenceEndMatch[0].trim());
      } else {
        // Fallback: find last space to avoid cutting mid-word
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.6) {
          excerptParts.push(truncated.slice(0, lastSpace));
        } else {
          excerptParts.push(truncated);
        }
      }
    }
  }

  // For now, highlightedSentences = sentences (AI will add phrase highlighting later)
  // We don't apply byte-based highlighting since it can cut words
  return {
    sentences: excerptParts,
    highlightedSentences: excerptParts,  // Same as sentences - AI will highlight
    matchRanges: matchRegions,
    fullText: text
  };
}

/**
 * Apply <mark> highlighting to text based on match positions
 * @param {string} blockText - The text block to highlight
 * @param {number} blockStart - The starting position of this block in the original text
 * @param {Array} matchPositions - Array of {start, end} positions in original text
 * @returns {string} Text with <mark> tags around matches
 */
function applyHighlighting(blockText, blockStart, matchPositions) {
  // Find matches that fall within this block
  const blockEnd = blockStart + blockText.length;
  const relevantMatches = matchPositions
    .filter(m => m.start >= blockStart && m.end <= blockEnd)
    .map(m => ({
      start: m.start - blockStart,  // Convert to block-relative position
      end: m.end - blockStart
    }))
    .sort((a, b) => a.start - b.start);

  if (relevantMatches.length === 0) {
    return blockText;
  }

  // Build highlighted text by inserting <mark> tags
  let result = '';
  let lastEnd = 0;

  for (const match of relevantMatches) {
    // Add text before this match
    result += blockText.slice(lastEnd, match.start);
    // Add highlighted match
    result += '<mark>' + blockText.slice(match.start, match.end) + '</mark>';
    lastEnd = match.end;
  }
  // Add remaining text after last match
  result += blockText.slice(lastEnd);

  return result;
}

/**
 * Find sentence start by scanning backward from position
 * Looks for sentence-ending punctuation (.!?) followed by whitespace
 */
function findSentenceStart(text, position) {
  // Scan backward from position
  for (let i = position - 1; i >= 0; i--) {
    const char = text[i];
    // If we find whitespace after sentence-ending punctuation, sentence starts after whitespace
    if (/\s/.test(char) && i > 0 && /[.!?]/.test(text[i - 1])) {
      return i + 1;
    }
    // Also check for newlines which often start sentences
    if (char === '\n') {
      return i + 1;
    }
  }
  return 0; // Start of text
}

/**
 * Find sentence end by scanning forward from position
 * Looks for sentence-ending punctuation (.!?) followed by whitespace or end
 */
function findSentenceEnd(text, position) {
  // Scan forward from position
  for (let i = position; i < text.length; i++) {
    const char = text[i];
    if (/[.!?]/.test(char)) {
      // Check if followed by whitespace, end, or quote+whitespace
      const next = text[i + 1];
      const nextNext = text[i + 2];
      if (!next || /\s/.test(next) || (next === '"' && (!nextNext || /\s/.test(nextNext)))) {
        // Include the punctuation and any trailing quote
        let end = i + 1;
        if (text[end] === '"' || text[end] === "'") end++;
        return end;
      }
    }
  }
  return text.length; // End of text
}

/**
 * Extract sentence containing the given position
 * Includes context sentences before/after if requested
 */
function extractSentenceAtPosition(text, position, contextSentences = 1) {
  // Find the sentence containing this position
  const sentenceStart = findSentenceStart(text, position);
  const sentenceEnd = findSentenceEnd(text, position);

  // Expand to include context sentences
  let expandedStart = sentenceStart;
  let expandedEnd = sentenceEnd;

  // Add sentences before
  for (let i = 0; i < contextSentences; i++) {
    if (expandedStart > 0) {
      expandedStart = findSentenceStart(text, expandedStart - 1);
    }
  }

  // Add sentences after
  for (let i = 0; i < contextSentences; i++) {
    if (expandedEnd < text.length) {
      expandedEnd = findSentenceEnd(text, expandedEnd + 1);
    }
  }

  return {
    start: expandedStart,
    end: expandedEnd,
    text: text.slice(expandedStart, expandedEnd).trim()
  };
}

// =============================================================================
// SMART HIGHLIGHTING WITH STOP WORDS FILTER
// =============================================================================

/**
 * Common English stop words that should not be highlighted in search results
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they',
  'them', 'his', 'her', 'their', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there'
]);

/**
 * Check if a word is a stop word
 */
function isStopWord(word) {
  return STOP_WORDS.has(word.toLowerCase());
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split text into sentences
 * @param {string} text - Text to split
 * @returns {Array<{text: string, start: number, end: number}>} Array of sentence objects
 */
function splitIntoSentences(text) {
  const sentences = [];
  let start = 0;

  // Match sentence-ending punctuation followed by space or end
  const sentenceEndPattern = /[.!?](?:\s|$|["'])/g;
  let match;

  while ((match = sentenceEndPattern.exec(text)) !== null) {
    const end = match.index + 1; // Include the punctuation
    const sentenceText = text.slice(start, end).trim();
    if (sentenceText.length > 0) {
      sentences.push({
        text: sentenceText,
        start,
        end
      });
    }
    start = match.index + match[0].length;
  }

  // Handle remaining text (no ending punctuation)
  if (start < text.length) {
    const remaining = text.slice(start).trim();
    if (remaining.length > 0) {
      sentences.push({
        text: remaining,
        start,
        end: text.length
      });
    }
  }

  return sentences;
}

/**
 * Calculate proximity score for how close search terms appear in text
 * Higher score = words appear closer together
 * @param {string} text - Text to analyze
 * @param {string[]} terms - Search terms to find
 * @returns {number} Proximity score (higher is better)
 */
function calculateProximityScore(text, terms) {
  if (terms.length < 2) return 0;

  const lowerText = text.toLowerCase();
  const positions = [];

  // Find first occurrence of each term
  for (const term of terms) {
    const pos = lowerText.indexOf(term.toLowerCase());
    if (pos >= 0) {
      positions.push({ term, pos });
    }
  }

  if (positions.length < 2) return 0;

  // Sort by position
  positions.sort((a, b) => a.pos - b.pos);

  // Calculate total distance between consecutive terms
  let totalDistance = 0;
  for (let i = 1; i < positions.length; i++) {
    totalDistance += positions[i].pos - positions[i - 1].pos;
  }

  // Average distance per gap (lower is better, so invert)
  const avgDistance = totalDistance / (positions.length - 1);

  // Return inverse score (closer = higher score)
  // Score of 1000 for adjacent words, decreasing as distance increases
  return Math.max(0, 1000 - avgDistance);
}

/**
 * Check if text contains the exact phrase (words in order, allowing some flexibility)
 * @param {string} text - Text to search
 * @param {string[]} terms - Ordered terms to find as phrase
 * @returns {boolean} True if phrase found
 */
function containsPhrase(text, terms) {
  if (terms.length === 0) return false;
  if (terms.length === 1) return text.toLowerCase().includes(terms[0].toLowerCase());

  // Build regex that matches terms in order with optional words between
  // Allow 0-3 words between each term
  const pattern = terms
    .map(t => escapeRegex(t))
    .join('\\W+(?:\\w+\\W+){0,3}');

  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

/**
 * Extract best sentence and apply smart highlighting
 * Scoring priority:
 * 1. Exact phrase match (all words in order) - highest
 * 2. All terms present with high proximity - high
 * 3. All terms present (scattered) - medium
 * 4. Most terms present - low (fallback)
 *
 * @param {Object} hit - Meilisearch hit with text
 * @param {string} query - Original search query
 * @returns {Object} { excerpt, highlightedExcerpt }
 */
export function highlightBestSentence(hit, query) {
  const text = hit.text || '';

  if (!text) {
    return { excerpt: '', highlightedExcerpt: '' };
  }

  // Extract query terms (non-stop-words, min 2 chars)
  const queryTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1 && !isStopWord(t));

  // If all terms are stop words, use full query terms
  const termsToMatch = queryTerms.length > 0
    ? queryTerms
    : query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

  // Split into sentences
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) {
    // No sentences found, return truncated text
    const truncated = text.slice(0, 300);
    return { excerpt: truncated, highlightedExcerpt: truncated };
  }

  // Score each sentence
  let bestSentence = null;
  let bestScore = -1;

  for (const sentence of sentences) {
    const lowerSentence = sentence.text.toLowerCase();

    // Count how many terms are present
    let termsFound = 0;
    for (const term of termsToMatch) {
      if (lowerSentence.includes(term)) termsFound++;
    }

    // Calculate score with priority:
    // - Base: number of terms found * 100
    // - Bonus: +10000 if ALL terms present
    // - Bonus: +50000 if exact phrase found
    // - Bonus: proximity score (0-1000) for close terms

    let score = termsFound * 100;

    // All terms present bonus
    if (termsFound === termsToMatch.length) {
      score += 10000;

      // Exact phrase bonus (words in query order)
      if (containsPhrase(sentence.text, termsToMatch)) {
        score += 50000;
      }

      // Proximity bonus
      score += calculateProximityScore(sentence.text, termsToMatch);
    }

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // If no sentence matched any term, use the first sentence
  if (!bestSentence) {
    bestSentence = sentences[0];
  }

  // Find the best phrase span - where query terms cluster together
  const phraseSpan = findBestPhraseSpan(bestSentence.text, termsToMatch);

  let highlighted = bestSentence.text;

  if (phraseSpan) {
    // Extract before, phrase, and after parts
    const before = highlighted.slice(0, phraseSpan.start);
    const phrase = highlighted.slice(phraseSpan.start, phraseSpan.end);
    const after = highlighted.slice(phraseSpan.end);

    // Bold keywords within the phrase
    let boldedPhrase = phrase;
    for (const term of termsToMatch) {
      const regex = new RegExp(`\\b(${escapeRegex(term)}\\w*)`, 'gi');
      boldedPhrase = boldedPhrase.replace(regex, '<strong>$1</strong>');
    }

    // Wrap phrase in highlight span
    highlighted = `${before}<span class="phrase-hit">${boldedPhrase}</span>${after}`;
  } else {
    // No phrase span found, just bold keywords
    for (const term of termsToMatch) {
      const regex = new RegExp(`\\b(${escapeRegex(term)}\\w*)`, 'gi');
      highlighted = highlighted.replace(regex, '<strong>$1</strong>');
    }
  }

  return {
    excerpt: bestSentence.text,
    highlightedExcerpt: highlighted
  };
}

/**
 * Find the best phrase span where query terms cluster together
 * Returns { start, end } character positions or null
 */
function findBestPhraseSpan(text, terms) {
  if (!terms || terms.length === 0) return null;

  const lowerText = text.toLowerCase();

  // Find all positions of each term
  const termPositions = [];
  for (const term of terms) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\w*`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      termPositions.push({
        term,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
    }
  }

  if (termPositions.length === 0) return null;

  // Sort by position
  termPositions.sort((a, b) => a.start - b.start);

  // If only one term match, return it with some context
  if (termPositions.length === 1) {
    const pos = termPositions[0];
    // Expand to word boundaries on either side (up to ~30 chars each side)
    let start = Math.max(0, pos.start - 30);
    let end = Math.min(text.length, pos.end + 30);

    // Snap to word boundaries
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;

    return { start, end };
  }

  // Find the tightest cluster containing the most unique terms
  let bestSpan = null;
  let bestScore = -1;

  for (let i = 0; i < termPositions.length; i++) {
    for (let j = i; j < termPositions.length; j++) {
      const spanStart = termPositions[i].start;
      const spanEnd = termPositions[j].end;
      const spanLength = spanEnd - spanStart;

      // Get unique terms in this span
      const uniqueTerms = new Set();
      for (let k = i; k <= j; k++) {
        uniqueTerms.add(termPositions[k].term.toLowerCase());
      }

      // Score: prefer more unique terms, then shorter spans
      // More terms = higher priority, so weight heavily
      const score = (uniqueTerms.size * 10000) - spanLength;

      if (score > bestScore) {
        bestScore = score;
        bestSpan = { start: spanStart, end: spanEnd, uniqueTerms: uniqueTerms.size };
      }
    }
  }

  if (!bestSpan) return null;

  // Expand slightly to include surrounding words for context
  let { start, end } = bestSpan;

  // Expand to include partial words at boundaries
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;

  return { start, end };
}

/**
 * Process search hits to extract relevant sentences
 * Returns hits with added `excerpt` and `highlightedText` fields
 *
 * @param {Array} hits - Meilisearch search hits
 * @param {Object} options - Options for sentence extraction
 * @returns {Array} Hits with excerpt and highlightedText fields added
 */
export function enrichHitsWithExcerpts(hits, options = {}) {
  return hits.map(hit => {
    const extracted = extractMatchingSentences(hit, options);
    return {
      ...hit,
      // Join contiguous blocks with ellipsis separator
      excerpt: extracted.sentences.join(' ... '),
      excerptBlocks: extracted.sentences,  // Array of contiguous text blocks (plain)
      // Highlighted version with <mark> tags around search matches
      highlightedText: extracted.highlightedSentences.join(' ... '),
      highlightedBlocks: extracted.highlightedSentences,  // Array with highlighting
      matchRanges: extracted.matchRanges
    };
  });
}

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
