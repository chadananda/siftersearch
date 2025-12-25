/**
 * Library API Routes
 *
 * Public browsing of the document library with admin capabilities
 * for metadata editing and content management.
 *
 * GET /api/library/tree - Get tree structure (religions/collections)
 * GET /api/library/stats - Get document counts by status
 * GET /api/library/documents - List documents with filters
 * GET /api/library/documents/:id - Get document detail + paragraphs
 * PUT /api/library/documents/:id - Update document metadata (admin)
 * GET /api/library/documents/:id/content - Get original file from storage
 * PUT /api/library/documents/:id/content - Update content + re-index (admin)
 * POST /api/library/documents/:id/reindex - Re-index from original (admin)
 */

import { getMeili, INDEXES } from '../lib/search.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

export default async function libraryRoutes(fastify) {

  // ============================================
  // Public Routes
  // ============================================

  /**
   * Get tree structure for library navigation
   * Returns religions with nested collections and document counts
   */
  fastify.get('/tree', async () => {
    const meili = getMeili();

    // Get all unique religions and collections from Meilisearch
    const searchResult = await meili.index(INDEXES.DOCUMENTS).search('', {
      limit: 0,
      facets: ['religion', 'collection']
    });

    const facets = searchResult.facetDistribution || {};
    const religionCounts = facets.religion || {};
    const collectionCounts = facets.collection || {};

    // Build tree structure
    // We need to get religion-collection mapping from documents
    const documentsResult = await meili.index(INDEXES.DOCUMENTS).search('', {
      limit: 10000,
      attributesToRetrieve: ['id', 'title', 'religion', 'collection']
    });

    // Group by religion -> collection
    const tree = {};
    for (const doc of documentsResult.hits) {
      const religion = doc.religion || 'Uncategorized';
      const collection = doc.collection || 'General';

      if (!tree[religion]) {
        tree[religion] = {
          name: religion,
          count: religionCounts[religion] || 0,
          collections: {}
        };
      }

      if (!tree[religion].collections[collection]) {
        tree[religion].collections[collection] = {
          name: collection,
          count: 0
        };
      }
      tree[religion].collections[collection].count++;
    }

    // Convert to array format
    const religions = Object.values(tree).map(r => ({
      name: r.name,
      count: r.count,
      collections: Object.values(r.collections).sort((a, b) => a.name.localeCompare(b.name))
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { religions };
  });

  /**
   * Get library statistics
   */
  fastify.get('/stats', async () => {
    const meili = getMeili();

    // Get counts from Meilisearch
    const [docsResult, parasResult] = await Promise.all([
      meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 0,
        facets: ['religion', 'collection', 'language']
      }),
      meili.index(INDEXES.PARAGRAPHS).search('', { limit: 0 })
    ]);

    // Get indexing queue status from database
    let indexingStats = { pending: 0, processing: 0 };
    try {
      const queueStats = await queryOne(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status IN ('analyzing', 'processing') THEN 1 ELSE 0 END) as processing
        FROM ingestion_queue
      `);
      if (queueStats) {
        indexingStats = {
          pending: queueStats.pending || 0,
          processing: queueStats.processing || 0
        };
      }
    } catch {
      // Table may not exist yet
    }

    const facets = docsResult.facetDistribution || {};

    return {
      totalDocuments: docsResult.estimatedTotalHits || 0,
      totalParagraphs: parasResult.estimatedTotalHits || 0,
      religions: Object.keys(facets.religion || {}).length,
      collections: Object.keys(facets.collection || {}).length,
      languages: Object.keys(facets.language || {}).length,
      religionCounts: facets.religion || {},
      collectionCounts: facets.collection || {},
      languageCounts: facets.language || {},
      indexing: indexingStats.pending > 0 || indexingStats.processing > 0,
      indexingProgress: indexingStats
    };
  });

  /**
   * List documents with filtering and pagination
   */
  fastify.get('/documents', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          religion: { type: 'string' },
          collection: { type: 'string' },
          language: { type: 'string' },
          author: { type: 'string' },
          yearFrom: { type: 'integer' },
          yearTo: { type: 'integer' },
          status: { type: 'string', enum: ['all', 'indexed', 'unindexed', 'processing'] },
          limit: { type: 'integer', default: 50, maximum: 200 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const {
      search = '',
      religion,
      collection,
      language,
      author,
      yearFrom,
      yearTo,
      status = 'all',
      limit = 50,
      offset = 0
    } = request.query;

    const meili = getMeili();

    // Build filter array
    const filters = [];
    if (religion) filters.push(`religion = "${religion}"`);
    if (collection) filters.push(`collection = "${collection}"`);
    if (language) filters.push(`language = "${language}"`);
    if (author) filters.push(`author = "${author}"`);
    if (yearFrom) filters.push(`year >= ${yearFrom}`);
    if (yearTo) filters.push(`year <= ${yearTo}`);

    const searchOptions = {
      limit,
      offset,
      sort: ['title:asc'],
      attributesToRetrieve: [
        'id', 'title', 'author', 'religion', 'collection',
        'language', 'year', 'description', 'paragraph_count',
        'created_at', 'updated_at', 'cover_url'
      ]
    };

    if (filters.length > 0) {
      searchOptions.filter = filters.join(' AND ');
    }

    const result = await meili.index(INDEXES.DOCUMENTS).search(search, searchOptions);

    // Get processing status for documents if requested
    let processingDocs = new Set();
    if (status !== 'indexed') {
      try {
        const queueItems = await queryAll(`
          SELECT target_document_id, status
          FROM ingestion_queue
          WHERE status IN ('pending', 'analyzing', 'awaiting_review', 'approved', 'processing')
        `);
        for (const item of queueItems) {
          if (item.target_document_id) {
            processingDocs.add(item.target_document_id);
          }
        }
      } catch {
        // Table may not exist
      }
    }

    // Add status to each document
    const documents = result.hits.map(doc => ({
      ...doc,
      status: processingDocs.has(doc.id) ? 'processing' : 'indexed'
    }));

    return {
      documents,
      total: result.estimatedTotalHits || 0,
      limit,
      offset,
      facets: result.facetDistribution
    };
  });

  /**
   * Get document detail with paragraphs
   */
  fastify.get('/documents/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          includeParagraphs: { type: 'boolean', default: true },
          paragraphLimit: { type: 'integer', default: 100 },
          paragraphOffset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { includeParagraphs = true, paragraphLimit = 100, paragraphOffset = 0 } = request.query;
    const meili = getMeili();

    // Get document metadata
    let document;
    try {
      document = await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }

    // Get paragraphs if requested
    let paragraphs = [];
    let paragraphTotal = 0;
    if (includeParagraphs) {
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `document_id = "${id}"`,
        limit: paragraphLimit,
        offset: paragraphOffset,
        sort: ['paragraph_index:asc'],
        attributesToRetrieve: ['id', 'paragraph_index', 'text', 'heading', 'blocktype']
      });
      paragraphs = parasResult.hits;
      paragraphTotal = parasResult.estimatedTotalHits || 0;
    }

    // Get assets from database
    let assets = [];
    try {
      assets = await queryAll(`
        SELECT asset_type, storage_url, file_name, file_size, content_type
        FROM document_assets
        WHERE document_id = ?
      `, [id]);
    } catch {
      // Table may not exist
    }

    return {
      document,
      paragraphs,
      paragraphTotal,
      paragraphLimit,
      paragraphOffset,
      assets
    };
  });

  // ============================================
  // Admin Routes
  // ============================================

  /**
   * Update document metadata
   */
  fastify.put('/documents/:id', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          author: { type: 'string' },
          religion: { type: 'string' },
          collection: { type: 'string' },
          language: { type: 'string' },
          year: { type: 'integer' },
          description: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const updates = request.body;
    const meili = getMeili();

    // Verify document exists
    let document;
    try {
      document = await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }

    // Update document in Meilisearch
    const updatedDoc = {
      ...document,
      ...updates,
      updated_at: new Date().toISOString()
    };

    await meili.index(INDEXES.DOCUMENTS).updateDocuments([updatedDoc]);

    // Also update paragraphs with inherited metadata
    if (updates.title || updates.author || updates.religion || updates.collection || updates.language || updates.year) {
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `document_id = "${id}"`,
        limit: 10000,
        attributesToRetrieve: ['id']
      });

      const paragraphUpdates = parasResult.hits.map(p => ({
        id: p.id,
        ...(updates.title && { title: updates.title }),
        ...(updates.author && { author: updates.author }),
        ...(updates.religion && { religion: updates.religion }),
        ...(updates.collection && { collection: updates.collection }),
        ...(updates.language && { language: updates.language }),
        ...(updates.year && { year: updates.year })
      }));

      if (paragraphUpdates.length > 0) {
        await meili.index(INDEXES.PARAGRAPHS).updateDocuments(paragraphUpdates);
      }
    }

    // Update SQLite if we have the table
    try {
      const setClauses = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        await query(`UPDATE indexed_documents SET ${setClauses.join(', ')} WHERE id = ?`, values);
      }
    } catch (err) {
      logger.warn({ err, id }, 'Failed to update SQLite document record');
    }

    logger.info({ documentId: id, updates: Object.keys(updates) }, 'Document metadata updated');

    return { success: true, document: updatedDoc };
  });

  /**
   * Get original file content from storage
   * Admin only - compares indexed vs original
   */
  fastify.get('/documents/:id/content', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const meili = getMeili();

    // Verify document exists
    try {
      await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }

    // Get indexed content (joined paragraphs)
    const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `document_id = "${id}"`,
      limit: 10000,
      sort: ['paragraph_index:asc'],
      attributesToRetrieve: ['text', 'heading', 'blocktype', 'paragraph_index']
    });

    // Reconstruct markdown from indexed paragraphs
    const indexedContent = parasResult.hits.map(p => {
      let text = p.text || '';
      switch (p.blocktype) {
        case 'heading1': text = `# ${text}`; break;
        case 'heading2': text = `## ${text}`; break;
        case 'heading3': text = `### ${text}`; break;
        case 'quote': text = `> ${text}`; break;
        case 'list_item': text = `- ${text}`; break;
        default: break;
      }
      return text;
    }).join('\n\n');

    // Get original file from storage
    let originalContent = null;
    let originalAsset = null;
    try {
      originalAsset = await queryOne(`
        SELECT storage_url, storage_key, file_name
        FROM document_assets
        WHERE document_id = ? AND asset_type IN ('converted', 'original')
        ORDER BY CASE asset_type WHEN 'converted' THEN 1 WHEN 'original' THEN 2 END
        LIMIT 1
      `, [id]);

      if (originalAsset?.storage_url) {
        // Fetch content from storage URL
        try {
          const response = await fetch(originalAsset.storage_url);
          if (response.ok) {
            originalContent = await response.text();
          }
        } catch (fetchErr) {
          logger.warn({ err: fetchErr, url: originalAsset.storage_url }, 'Failed to fetch original content');
        }
      }
    } catch {
      // Table may not exist
    }

    return {
      documentId: id,
      indexed: indexedContent,
      original: originalContent,
      originalAsset: originalAsset ? {
        url: originalAsset.storage_url,
        fileName: originalAsset.file_name
      } : null,
      paragraphCount: parasResult.hits.length
    };
  });

  /**
   * Re-index document from original file
   */
  fastify.post('/documents/:id/reindex', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id } = request.params;

    // Add to ingestion queue for reprocessing
    try {
      await query(`
        INSERT INTO ingestion_queue (
          source_type, source_data, status, target_document_id, created_by
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        'reindex',
        JSON.stringify({ document_id: id }),
        'pending',
        id,
        request.user?.sub
      ]);

      logger.info({ documentId: id, userId: request.user?.sub }, 'Document queued for re-indexing');

      return {
        success: true,
        message: 'Document queued for re-indexing',
        documentId: id
      };
    } catch (err) {
      logger.error({ err, documentId: id }, 'Failed to queue document for re-indexing');
      throw ApiError.internal('Failed to queue re-index');
    }
  });
}
