/**
 * Meilisearch Client
 *
 * Hybrid search combining keyword and vector (semantic) search.
 */

import { MeiliSearch } from 'meilisearch';
import { config } from './config.js';
import { logger } from './logger.js';
import { createEmbedding } from './ai.js';

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
      'year'
    ],
    sortableAttributes: [
      'year',
      'created_at'
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
 * Index a document with its paragraphs
 */
export async function indexDocument(document, paragraphs) {
  const meili = getMeili();

  // Index document metadata
  await meili.index(INDEXES.DOCUMENTS).addDocuments([document]);

  // Index paragraphs with embeddings
  if (paragraphs.length > 0) {
    await meili.index(INDEXES.PARAGRAPHS).addDocuments(paragraphs);
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

  const [docStats, paraStats] = await Promise.all([
    meili.index(INDEXES.DOCUMENTS).getStats(),
    meili.index(INDEXES.PARAGRAPHS).getStats()
  ]);

  return {
    documents: {
      numberOfDocuments: docStats.numberOfDocuments,
      isIndexing: docStats.isIndexing
    },
    paragraphs: {
      numberOfDocuments: paraStats.numberOfDocuments,
      isIndexing: paraStats.isIndexing
    }
  };
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
  indexDocument,
  deleteDocument,
  getStats,
  healthCheck,
  INDEXES
};

export default search;
