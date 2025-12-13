/**
 * Meilisearch Client
 *
 * Hybrid search combining keyword and vector (semantic) search.
 */

import { MeiliSearch } from 'meilisearch';
import { config } from './config.js';
import { logger } from './logger.js';
import { createEmbedding, createEmbeddings } from './ai.js';

let client = null;

export function getMeili() {
  if (!client) {
    client = new MeiliSearch({
      host: config.search.host,
      apiKey: process.env.MEILI_MASTER_KEY
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
 * Initialize indexes with proper settings
 */
export async function initializeIndexes() {
  const meili = getMeili();

  // Paragraphs index (main search index)
  const paragraphs = meili.index(INDEXES.PARAGRAPHS);

  await paragraphs.updateSettings({
    searchableAttributes: [
      'text',
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
      'author',  // For parenthetical filter syntax: (author_name)
      'title'    // For parenthetical filter syntax: (title_keyword)
    ],
    sortableAttributes: [
      'year',
      'created_at',
      'paragraph_index'
    ],
    // Enable vector search
    embedders: {
      default: {
        source: 'userProvided',
        dimensions: config.ai.embeddings.dimensions
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
      'year'
    ],
    sortableAttributes: [
      'year',
      'title',
      'created_at'
    ]
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
    showRankingScore: true
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
    attributesToRetrieve: ['*']
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

/**
 * Index a document with its paragraphs
 */
export async function indexDocument(document, paragraphs) {
  const meili = getMeili();

  // Index document metadata (primary key: id)
  await meili.index(INDEXES.DOCUMENTS).addDocuments([document], { primaryKey: 'id' });

  // Index paragraphs with embeddings (primary key: id)
  if (paragraphs.length > 0) {
    await meili.index(INDEXES.PARAGRAPHS).addDocuments(paragraphs, { primaryKey: 'id' });
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

    // Get indexing tasks info if indexing
    let indexingProgress = null;
    if (docStats.isIndexing || paraStats.isIndexing) {
      try {
        const tasks = await meili.getTasks({
          statuses: ['enqueued', 'processing'],
          limit: 10
        });
        if (tasks.results.length > 0) {
          const enqueuedCount = tasks.results.filter(t => t.status === 'enqueued').length;
          const processingCount = tasks.results.filter(t => t.status === 'processing').length;
          indexingProgress = {
            pending: enqueuedCount,
            processing: processingCount,
            total: tasks.total || enqueuedCount + processingCount
          };
        }
      } catch {
        // Tasks API may not be available
      }
    }

    return {
      totalDocuments: docStats.numberOfDocuments,
      totalPassages: paraStats.numberOfDocuments,
      totalWords,
      religions: Object.keys(religions).length,
      religionCounts: religions,
      collections: Object.keys(collections).length,
      collectionCounts: collections,
      indexing: docStats.isIndexing || paraStats.isIndexing,
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
  INDEXES
};

export default search;
