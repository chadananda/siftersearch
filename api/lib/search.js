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

let client = null;

export function getMeili() {
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

  await paragraphs.updateSettings({
    searchableAttributes: [
      'text',
      'context',  // AI-generated disambiguation (who, what, where, when)
      'heading',
      'title',
      'author'
    ],
    filterableAttributes: [
      'document_id',
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
    // Enable vector search
    embedders: {
      default: {
        source: 'userProvided',
        dimensions: expectedDimensions
      }
    }
  });

  // Documents index (for document-level search)
  const documents = meili.index(INDEXES.DOCUMENTS);

  await documents.updateSettings({
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
      'authority'  // Doctrinal weight (1-10) for filtering
    ],
    sortableAttributes: [
      'year',
      'title',
      'created_at',
      'authority'  // Doctrinal weight for sorting
    ],
    // Custom ranking rules with configurable authority position
    rankingRules: buildRankingRules()
  });

  logger.info('Search indexes initialized');
}

/**
 * Hybrid search combining keyword and semantic search
 */
export async function hybridSearch(query, options = {}) {
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
  if (filters.documentId) filterParts.push(`document_id = "${filters.documentId}"`);

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
    showMatchesPosition: true  // Get exact byte positions of matches for sentence extraction
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
 * Keyword-only search (faster, no embedding needed)
 */
export async function keywordSearch(query, options = {}) {
  return hybridSearch(query, { ...options, semanticRatio: 0 });
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
    highlightPostTag: '</mark>'
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
  const meili = getMeili();

  await meili.index(INDEXES.DOCUMENTS).deleteDocument(documentId);
  await meili.index(INDEXES.PARAGRAPHS).deleteDocuments({
    filter: `document_id = "${documentId}"`
  });

  logger.info({ documentId }, 'Document deleted from index');
}

/**
 * Get index statistics
 */
export async function getStats() {
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

    // Detect indexing activity
    // Meilisearch's isIndexing flag clears quickly between documents,
    // so also check if recent tasks completed (within last 60 seconds)
    // Large documents can take 30+ seconds for embedding generation
    let isIndexing = docStats.isIndexing || paraStats.isIndexing;
    let indexingProgress = null;

    try {
      // Check pending/processing tasks
      const pendingTasks = await meili.tasks.getTasks({
        statuses: ['enqueued', 'processing'],
        limit: 10
      });

      if (pendingTasks.results.length > 0) {
        isIndexing = true;
        const enqueuedCount = pendingTasks.results.filter(t => t.status === 'enqueued').length;
        const processingCount = pendingTasks.results.filter(t => t.status === 'processing').length;
        indexingProgress = {
          pending: enqueuedCount,
          processing: processingCount,
          total: pendingTasks.total || enqueuedCount + processingCount
        };
      } else {
        // No pending tasks - check if tasks completed recently (indexing in progress)
        // Use 60 second window since large documents can take 30+ seconds for embeddings
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
            isIndexing = true;
            indexingProgress = {
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
      indexing: isIndexing,
      indexingProgress,
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
      indexing: false,
      indexingProgress: null,
      error: err.message
    };
  }
}

/**
 * Health check
 */
export async function healthCheck() {
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
  INDEXES
};

export default search;
