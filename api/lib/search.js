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
import { queryOne } from './db.js';
import { getImportProgress, getIngestionProgress, getIndexingProgress } from '../services/progress.js';

let client = null;

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
  PARAGRAPHS: 'paragraphs'
};

/**
 * Build ranking rules with authority at the configured position
 * Base rules: words, typo, proximity, attribute, sort, exactness
 * authority:desc is inserted at config.search.authorityRankPosition (1-7)
 * Position 4 = HIGH weight, 5 = MEDIUM, 6 = LOW, 7 = TIEBREAKER
 */
function buildRankingRules() {
  const baseRules = ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'];
  const position = Math.min(7, Math.max(1, config.search.authorityRankPosition || 4));

  // Insert authority:desc at the configured position (1-indexed, so subtract 1)
  const insertIndex = position - 1;
  const rules = [...baseRules];
  rules.splice(insertIndex, 0, 'authority:desc');

  logger.info({ position, rules }, 'Built ranking rules with authority position');
  return rules;
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
      // Small delay to ensure deletion completes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    // Index doesn't exist yet, that's fine
    if (!err.message?.includes('not found')) {
      logger.debug({ err: err.message }, 'Could not check paragraphs index settings');
    }
  }

  const paragraphsTask = await paragraphs.updateSettings({
    searchableAttributes: [
      'text',
      'context',  // AI-generated disambiguation (who, what, where, when)
      'heading',
      'title',
      'author'
    ],
    filterableAttributes: [
      'doc_id',  // INTEGER from SQLite docs.id
      'religion',
      'collection',
      'language',
      'year',
      'paragraph_index',
      'blocktype',  // For filtering by content type (paragraph, heading1, quote, etc.)
      'author',  // For parenthetical filter syntax: (author_name)
      'title',   // For parenthetical filter syntax: (title_keyword)
      'authority'  // Doctrinal weight (1-10) for filtering
    ],
    sortableAttributes: [
      'year',
      'created_at',
      'paragraph_index',
      'authority'  // Doctrinal weight for sorting
    ],
    // Custom ranking rules with configurable authority position
    rankingRules: buildRankingRules(),
    // Increase maxTotalHits for pagination (default 1000 is too low)
    pagination: {
      maxTotalHits: 50000
    },
    // Enable vector search
    embedders: {
      default: {
        source: 'userProvided',
        dimensions: expectedDimensions
      }
    }
  });
  // Wait for settings update to complete (Meilisearch updates are async)
  await meili.tasks.waitForTask(paragraphsTask.taskUid);

  // Documents index (for document-level search)
  const documents = meili.index(INDEXES.DOCUMENTS);

  const documentsTask = await documents.updateSettings({
    searchableAttributes: [
      'title',
      'author',
      'description'
    ],
    filterableAttributes: [
      'religion',
      'collection',
      'language',
      'year',
      'author',    // For filtering by author
      'authority'  // Doctrinal weight (1-10) for filtering
    ],
    sortableAttributes: [
      'year',
      'title',
      'created_at',
      'authority'  // Doctrinal weight for sorting
    ],
    // Custom ranking rules with configurable authority position
    rankingRules: buildRankingRules(),
    // Increase maxTotalHits for pagination (default 1000 is too low)
    pagination: {
      maxTotalHits: 50000
    }
  });
  // Wait for settings update to complete
  await meili.tasks.waitForTask(documentsTask.taskUid);

  logger.info('Search indexes initialized');
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
      const embedding = await createEmbedding(query);
      vector = embedding.embedding;
    } catch (err) {
      logger.warn({ err }, 'Failed to generate embedding, falling back to keyword search');
    }
  }

  // Perform search
  const searchParams = {
    q: query,
    limit,
    offset,
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

  return {
    hits: results.hits,
    query: results.query,
    processingTimeMs: results.processingTimeMs,
    estimatedTotalHits: results.estimatedTotalHits,
    limit,
    offset
  };
}

/**
 * Simple Levenshtein distance for short strings
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1]
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Check if text contains a fuzzy match for a term
 * Allows typos based on Meilisearch rules: 1 typo for 5+ chars, 2 for 9+ chars
 * @param {string} text - Text to search in
 * @param {string} term - Term to find
 * @returns {boolean} True if fuzzy match found
 */
function textContainsFuzzy(text, term) {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();

  // Exact or prefix match (fast path)
  const prefixRegex = new RegExp(`\\b${escapeRegex(lowerTerm)}`, 'i');
  if (prefixRegex.test(lowerText)) return true;

  // Fuzzy match: extract words and check Levenshtein distance
  // Meilisearch: 1 typo for 5-8 chars, 2 typos for 9+ chars
  const maxTypos = lowerTerm.length >= 9 ? 2 : (lowerTerm.length >= 5 ? 1 : 0);
  if (maxTypos === 0) return false; // No typo tolerance for short terms

  // Extract words of similar length from text
  const words = lowerText.match(/\b\w+\b/g) || [];
  return words.some(word => {
    // Only compare words of similar length (within 2 chars)
    if (Math.abs(word.length - lowerTerm.length) > 2) return false;
    return levenshtein(word, lowerTerm) <= maxTypos;
  });
}

/**
 * Check if text contains all query terms (with fuzzy/typo tolerance)
 * @param {Object} hit - Meilisearch hit with text
 * @param {string[]} terms - Query terms (min 2 chars, non-stop-words)
 * @returns {boolean} True if all terms have matches
 */
function hasAllTermMatches(hit, terms) {
  const text = hit.text || '';
  return terms.every(term => textContainsFuzzy(text, term));
}

/**
 * Calculate phrase match score for ranking
 * Higher score = better match (exact phrase > proximity > scattered)
 * @param {string} text - Text to score
 * @param {string} query - Original query (with stop words)
 * @param {string[]} terms - Query terms (without stop words)
 * @returns {number} Score (0-100)
 */
function calculatePhraseScore(text, query, terms) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact phrase match (highest priority) - score 100
  if (lowerText.includes(lowerQuery)) {
    return 100;
  }

  // Check for terms appearing close together (within ~50 chars)
  // Build a regex that allows words between terms
  if (terms.length >= 2) {
    // Try to find all terms within a 100-char window
    const positions = terms.map(term => {
      const regex = new RegExp(`\\b${escapeRegex(term)}`, 'gi');
      const match = regex.exec(lowerText);
      return match ? match.index : -1;
    }).filter(p => p >= 0);

    if (positions.length === terms.length) {
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      const spread = maxPos - minPos;

      // Close proximity (within 100 chars) - score 50-80
      if (spread < 100) {
        return 80 - Math.floor(spread / 5); // 80 for adjacent, down to 60 for 100 chars apart
      }
      // Medium proximity (100-300 chars) - score 30-50
      if (spread < 300) {
        return 50 - Math.floor((spread - 100) / 10);
      }
    }
  }

  // All terms present but scattered - score 10
  return 10;
}

/**
 * Keyword-only search (faster, no embedding needed)
 * Filters results to ensure ALL query terms appear (prefix matching allowed)
 * Boosts exact phrase matches to the top
 */
export async function keywordSearch(query, options = {}) {
  const { limit = 20, ...restOptions } = options;

  // Request more results than needed so we can filter and re-rank
  const results = await hybridSearch(query, {
    ...restOptions,
    limit: Math.min(limit * 5, 150), // Request 5x to account for filtering + re-ranking
    semanticRatio: 0
  });

  // Extract query terms for filtering (min 2 chars, filter stop words)
  const queryTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  // If only stop words or single short word, return unfiltered
  if (queryTerms.length === 0) {
    return {
      ...results,
      hits: results.hits.slice(0, limit)
    };
  }

  // Filter to only results where Meilisearch found ALL query terms (with fuzzy matching)
  const filteredHits = results.hits.filter(hit => {
    return hasAllTermMatches(hit, queryTerms);
  });

  // Re-rank by phrase score (exact phrase matches first)
  const rankedHits = filteredHits.map(hit => ({
    ...hit,
    _phraseScore: calculatePhraseScore(hit.text || '', query, queryTerms)
  })).sort((a, b) => {
    // Sort by phrase score first, then by original ranking score
    if (b._phraseScore !== a._phraseScore) {
      return b._phraseScore - a._phraseScore;
    }
    return (b._rankingScore || 0) - (a._rankingScore || 0);
  });

  return {
    ...results,
    hits: rankedHits.slice(0, limit),
    estimatedTotalHits: filteredHits.length
  };
}

/**
 * Semantic-only search
 */
export async function semanticSearch(query, options = {}) {
  return hybridSearch(query, { ...options, semanticRatio: 1 });
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

  // Federated search: merges and deduplicates results across all queries
  // Pagination goes on federation object, not individual queries
  const response = await meili.multiSearch({
    federation: { limit, offset },
    queries: searchQueries
  });

  return {
    hits: response.hits || [],  // Single merged array, duplicates removed
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

  const { embeddings } = await createEmbeddings(texts);
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
 * Get index statistics
 */
export async function getStats() {
  // Get progress from progress service
  // - importProgress: current batch being imported (null if no active import)
  // - ingestionProgress: docs with content vs total docs in library
  // - indexingProgress: docs in Meilisearch vs docs with content in SQLite
  const [importProgress, ingestionProgress, indexingProgress] = await Promise.all([
    Promise.resolve(getImportProgress()),
    getIngestionProgress(),
    getIndexingProgress()
  ]);

  if (!config.search.enabled) {
    return {
      totalDocuments: 0,
      totalPassages: 0,
      religions: 0,
      religionCounts: {},
      collections: 0,
      collectionCounts: {},
      totalWords: 0,
      meilisearchEnabled: false,
      importProgress,
      ingestionProgress,   // Docs with content vs total docs
      indexingProgress,
      lastUpdated: new Date().toISOString()
    };
  }
  const meili = getMeili();

  try {
    const [docStats, paraStats] = await Promise.all([
      meili.index(INDEXES.DOCUMENTS).getStats(),
      meili.index(INDEXES.PARAGRAPHS).getStats()
    ]);

    // Get facet distributions for religions and collections
    // Use DOCUMENTS index for religion counts (documents per religion, not paragraphs)
    // Use PARAGRAPHS index for collection counts
    let religions = {};
    let collections = {};
    let totalWords = 0;

    try {
      // Get document counts per religion from DOCUMENTS index
      const docFacetResults = await meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 0,
        facets: ['religion']
      });
      religions = docFacetResults.facetDistribution?.religion || {};

      // Get collection counts from PARAGRAPHS (for passage-level detail)
      const paraFacetResults = await meili.index(INDEXES.PARAGRAPHS).search('', {
        limit: 0,
        facets: ['collection']
      });
      collections = paraFacetResults.facetDistribution?.collection || {};
    } catch {
      // Facets may not be available
    }

    // Estimate total words (rough calculation based on average words per paragraph)
    // Average paragraph has ~100 words, so multiply passages by 100
    totalWords = paraStats.numberOfDocuments * 100;

    // Detect Meilisearch indexing activity
    // Meilisearch's isIndexing flag clears quickly between documents,
    // so also check if recent tasks completed (within last 60 seconds)
    let isMeiliIndexing = docStats.isIndexing || paraStats.isIndexing;
    let meiliTaskProgress = null;

    try {
      // Check pending/processing tasks
      const pendingTasks = await meili.tasks.getTasks({
        statuses: ['enqueued', 'processing'],
        limit: 10
      });

      if (pendingTasks.results.length > 0) {
        isMeiliIndexing = true;
        const enqueuedCount = pendingTasks.results.filter(t => t.status === 'enqueued').length;
        const processingCount = pendingTasks.results.filter(t => t.status === 'processing').length;
        meiliTaskProgress = {
          pending: enqueuedCount,
          processing: processingCount,
          total: pendingTasks.total || enqueuedCount + processingCount
        };
      } else {
        // No pending tasks - check if tasks completed recently
        const recentTasks = await meili.tasks.getTasks({
          statuses: ['succeeded'],
          types: ['documentAdditionOrUpdate'],
          limit: 1
        });

        if (recentTasks.results.length > 0) {
          const lastTask = recentTasks.results[0];
          const finishedAt = new Date(lastTask.finishedAt);
          const secondsAgo = (Date.now() - finishedAt.getTime()) / 1000;

          // If a document was indexed within last 60 seconds, likely still indexing
          if (secondsAgo < 60) {
            isMeiliIndexing = true;
            meiliTaskProgress = {
              pending: 0,
              processing: 0,
              recentlyCompleted: true,
              lastTaskSecondsAgo: Math.round(secondsAgo)
            };
          }
        }
      }
    } catch {
      // Tasks API may not be available
    }

    return {
      totalDocuments: docStats.numberOfDocuments,
      totalPassages: paraStats.numberOfDocuments,
      totalWords,
      religions: Object.keys(religions).length,
      religionCounts: religions,
      collections: Object.keys(collections).length,
      collectionCounts: collections,
      meilisearchIndexing: isMeiliIndexing,
      meiliTaskProgress,
      importProgress,      // Current batch import (null if no active import)
      ingestionProgress,   // Docs with content vs total docs
      indexingProgress,    // Docs with content vs indexed in Meilisearch
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to get search stats');
    return {
      totalDocuments: 0,
      totalPassages: 0,
      totalWords: 0,
      religions: 0,
      religionCounts: {},
      collections: 0,
      collectionCounts: {},
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
  INDEXES
};

export default search;
