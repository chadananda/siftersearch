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

    // Get counts from Meilisearch - use index stats for accurate totals
    const [docsResult, parasResult, docStats, paraStats] = await Promise.all([
      meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 0,
        facets: ['religion', 'collection', 'language']
      }),
      meili.index(INDEXES.PARAGRAPHS).search('', { limit: 0 }),
      meili.index(INDEXES.DOCUMENTS).getStats(),
      meili.index(INDEXES.PARAGRAPHS).getStats()
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
      totalDocuments: docStats.numberOfDocuments || 0,
      totalParagraphs: paraStats.numberOfDocuments || 0,
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

  // ============================================
  // Library Nodes (Religions & Collections)
  // ============================================

  /**
   * Get all library nodes as a tree structure
   */
  fastify.get('/nodes', async () => {
    const meili = getMeili();

    // Get all nodes from database
    const nodes = await queryAll(`
      SELECT id, parent_id, node_type, name, slug, description, overview,
             cover_image_url, authority_default, display_order, metadata
      FROM library_nodes
      ORDER BY display_order, name
    `);

    // Get document counts from Meilisearch
    const searchResult = await meili.index(INDEXES.DOCUMENTS).search('', {
      limit: 10000,
      attributesToRetrieve: ['religion', 'collection']
    });

    // Build counts map
    const religionCounts = {};
    const collectionCounts = {};
    for (const doc of searchResult.hits) {
      const religion = doc.religion || 'Uncategorized';
      const collection = doc.collection || 'General';
      religionCounts[religion] = (religionCounts[religion] || 0) + 1;
      if (!collectionCounts[religion]) collectionCounts[religion] = {};
      collectionCounts[religion][collection] = (collectionCounts[religion][collection] || 0) + 1;
    }

    // Build tree structure
    const religionNodes = nodes.filter(n => n.node_type === 'religion');
    const collectionNodes = nodes.filter(n => n.node_type === 'collection');

    const tree = religionNodes.map(religion => {
      const children = collectionNodes
        .filter(c => c.parent_id === religion.id)
        .map(c => ({
          id: c.id,
          node_type: c.node_type,
          name: c.name,
          slug: c.slug,
          description: c.description,
          cover_image_url: c.cover_image_url,
          authority_default: c.authority_default,
          document_count: collectionCounts[religion.name]?.[c.name] || 0,
          metadata: c.metadata ? JSON.parse(c.metadata) : null
        }));

      return {
        id: religion.id,
        node_type: religion.node_type,
        name: religion.name,
        slug: religion.slug,
        description: religion.description,
        cover_image_url: religion.cover_image_url,
        authority_default: religion.authority_default,
        document_count: religionCounts[religion.name] || 0,
        metadata: religion.metadata ? JSON.parse(religion.metadata) : null,
        children
      };
    });

    return { nodes: tree };
  });

  /**
   * Get a single library node by ID
   */
  fastify.get('/nodes/:id', async (request) => {
    const { id } = request.params;
    const meili = getMeili();

    const node = await queryOne(`
      SELECT id, parent_id, node_type, name, slug, description, overview,
             cover_image_url, authority_default, display_order, metadata,
             created_at, updated_at
      FROM library_nodes WHERE id = ?
    `, [id]);

    if (!node) {
      throw ApiError.notFound('Library node not found');
    }

    // Get parent if this is a collection
    let parent = null;
    if (node.parent_id) {
      parent = await queryOne('SELECT id, name, slug FROM library_nodes WHERE id = ?', [node.parent_id]);
    }

    // Get document count
    let documentCount = 0;
    if (node.node_type === 'collection' && parent) {
      const result = await meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 0,
        filter: `religion = "${parent.name}" AND collection = "${node.name}"`
      });
      documentCount = result.estimatedTotalHits || 0;
    } else if (node.node_type === 'religion') {
      const result = await meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 0,
        filter: `religion = "${node.name}"`
      });
      documentCount = result.estimatedTotalHits || 0;
    }

    return {
      node: {
        ...node,
        metadata: node.metadata ? JSON.parse(node.metadata) : null,
        parent,
        document_count: documentCount
      }
    };
  });

  /**
   * Get library node by slug path
   * GET /by-slug/:religionSlug - Get religion
   * GET /by-slug/:religionSlug/:collectionSlug - Get collection
   */
  fastify.get('/by-slug/:religionSlug', async (request) => {
    const { religionSlug } = request.params;
    const meili = getMeili();

    const node = await queryOne(`
      SELECT id, parent_id, node_type, name, slug, description, overview,
             cover_image_url, authority_default, metadata, created_at, updated_at
      FROM library_nodes
      WHERE node_type = 'religion' AND slug = ?
    `, [religionSlug]);

    if (!node) {
      throw ApiError.notFound('Religion not found');
    }

    // Get document count
    const result = await meili.index(INDEXES.DOCUMENTS).search('', {
      limit: 0,
      filter: `religion = "${node.name}"`
    });

    // Get children (collections)
    const children = await queryAll(`
      SELECT id, name, slug, description, cover_image_url, authority_default
      FROM library_nodes
      WHERE parent_id = ?
      ORDER BY display_order, name
    `, [node.id]);

    return {
      node: {
        ...node,
        metadata: node.metadata ? JSON.parse(node.metadata) : null,
        document_count: result.estimatedTotalHits || 0,
        children
      }
    };
  });

  fastify.get('/by-slug/:religionSlug/:collectionSlug', async (request) => {
    const { religionSlug, collectionSlug } = request.params;
    const { limit = 50, offset = 0 } = request.query;
    const meili = getMeili();

    // Get religion first
    const religion = await queryOne(`
      SELECT id, name, slug FROM library_nodes
      WHERE node_type = 'religion' AND slug = ?
    `, [religionSlug]);

    if (!religion) {
      throw ApiError.notFound('Religion not found');
    }

    // Get collection
    const node = await queryOne(`
      SELECT id, parent_id, node_type, name, slug, description, overview,
             cover_image_url, authority_default, metadata, created_at, updated_at
      FROM library_nodes
      WHERE node_type = 'collection' AND slug = ? AND parent_id = ?
    `, [collectionSlug, religion.id]);

    if (!node) {
      throw ApiError.notFound('Collection not found');
    }

    // Get documents in this collection
    const searchOptions = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      filter: `religion = "${religion.name}" AND collection = "${node.name}"`,
      sort: ['title:asc'],
      attributesToRetrieve: [
        'id', 'title', 'author', 'religion', 'collection',
        'language', 'year', 'description', 'authority', 'paragraph_count'
      ]
    };

    // Try search with sort, fallback to no sort if sortable attributes not configured
    let docsResult;
    try {
      docsResult = await meili.index(INDEXES.DOCUMENTS).search('', searchOptions);
    } catch (err) {
      if (err.message?.includes('not sortable')) {
        delete searchOptions.sort;
        docsResult = await meili.index(INDEXES.DOCUMENTS).search('', searchOptions);
      } else {
        throw err;
      }
    }

    return {
      node: {
        ...node,
        metadata: node.metadata ? JSON.parse(node.metadata) : null,
        parent: { id: religion.id, name: religion.name, slug: religion.slug }
      },
      documents: docsResult.hits,
      total_documents: docsResult.estimatedTotalHits || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  });

  /**
   * Create a new library node (admin only)
   */
  fastify.post('/nodes', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['node_type', 'name'],
        properties: {
          parent_id: { type: 'integer' },
          node_type: { type: 'string', enum: ['religion', 'collection'] },
          name: { type: 'string', minLength: 1 },
          slug: { type: 'string' },
          description: { type: 'string' },
          overview: { type: 'string' },
          cover_image_url: { type: 'string' },
          authority_default: { type: 'integer', minimum: 1, maximum: 10 },
          display_order: { type: 'integer' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { parent_id, node_type, name, description, overview,
            cover_image_url, authority_default, display_order, metadata } = request.body;

    // Generate slug from name if not provided
    const slug = request.body.slug || name
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/á/g, 'a').replace(/í/g, 'i').replace(/é/g, 'e').replace(/ú/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Validate: collections must have a parent
    if (node_type === 'collection' && !parent_id) {
      throw ApiError.badRequest('Collections must have a parent religion');
    }

    // Check for duplicate slug within same parent
    const existing = await queryOne(
      'SELECT id FROM library_nodes WHERE slug = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))',
      [slug, parent_id || null, parent_id || null]
    );
    if (existing) {
      throw ApiError.conflict('A node with this slug already exists');
    }

    await query(`
      INSERT INTO library_nodes (parent_id, node_type, name, slug, description, overview,
                                  cover_image_url, authority_default, display_order, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      parent_id || null, node_type, name, slug, description || null, overview || null,
      cover_image_url || null, authority_default || 5, display_order || 0,
      metadata ? JSON.stringify(metadata) : null
    ]);

    const node = await queryOne('SELECT * FROM library_nodes WHERE slug = ? AND parent_id IS ?', [slug, parent_id || null]);
    logger.info({ nodeId: node.id, name, node_type }, 'Library node created');

    return { success: true, node };
  });

  /**
   * Update a library node (admin only)
   */
  fastify.put('/nodes/:id', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          slug: { type: 'string' },
          description: { type: 'string' },
          overview: { type: 'string' },
          cover_image_url: { type: 'string' },
          authority_default: { type: 'integer', minimum: 1, maximum: 10 },
          display_order: { type: 'integer' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const updates = request.body;

    // Verify node exists
    const existing = await queryOne('SELECT * FROM library_nodes WHERE id = ?', [id]);
    if (!existing) {
      throw ApiError.notFound('Library node not found');
    }

    // Build update query
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        if (key === 'metadata') {
          setClauses.push('metadata = ?');
          values.push(JSON.stringify(value));
        } else {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      await query(`UPDATE library_nodes SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }

    const node = await queryOne('SELECT * FROM library_nodes WHERE id = ?', [id]);
    logger.info({ nodeId: id, updates: Object.keys(updates) }, 'Library node updated');

    return { success: true, node };
  });

  /**
   * Delete a library node (admin only)
   */
  fastify.delete('/nodes/:id', {
    preHandler: [requireAuth, requireAdmin]
  }, async (request) => {
    const { id } = request.params;

    const node = await queryOne('SELECT * FROM library_nodes WHERE id = ?', [id]);
    if (!node) {
      throw ApiError.notFound('Library node not found');
    }

    // Check if this religion has collections
    if (node.node_type === 'religion') {
      const children = await queryOne('SELECT COUNT(*) as count FROM library_nodes WHERE parent_id = ?', [id]);
      if (children.count > 0) {
        throw ApiError.badRequest('Cannot delete religion with existing collections');
      }
    }

    await query('DELETE FROM library_nodes WHERE id = ?', [id]);
    logger.info({ nodeId: id, name: node.name }, 'Library node deleted');

    return { success: true };
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
          sort: { type: 'string', enum: ['title', 'authority', 'year', 'author'] },
          sortDir: { type: 'string', enum: ['asc', 'desc'] },
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
      sort = 'title',  // Default to title (authority requires index config)
      sortDir = sort === 'authority' ? 'desc' : 'asc',  // Authority defaults to desc
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

    // Build sort array - authority desc, then secondary sort
    const sortRules = [];
    if (sort === 'authority') {
      sortRules.push(`authority:${sortDir}`);
      sortRules.push('title:asc');  // Secondary sort by title
    } else if (sort === 'year') {
      sortRules.push(`year:${sortDir}`);
      sortRules.push('title:asc');
    } else if (sort === 'author') {
      sortRules.push(`author:${sortDir}`);
      sortRules.push('title:asc');
    } else {
      sortRules.push(`title:${sortDir}`);
    }

    const searchOptions = {
      limit,
      offset,
      sort: sortRules,
      attributesToRetrieve: [
        'id', 'title', 'author', 'religion', 'collection',
        'language', 'year', 'description', 'paragraph_count',
        'authority',  // Include doctrinal weight
        'created_at', 'updated_at', 'cover_url'
      ]
    };

    if (filters.length > 0) {
      searchOptions.filter = filters.join(' AND ');
    }

    // Try search with sort, fallback to no sort if sortable attributes not configured
    let result;
    try {
      result = await meili.index(INDEXES.DOCUMENTS).search(search, searchOptions);
    } catch (err) {
      if (err.message?.includes('not sortable')) {
        // Sortable attributes not configured - search without sort
        delete searchOptions.sort;
        result = await meili.index(INDEXES.DOCUMENTS).search(search, searchOptions);
      } else {
        throw err;
      }
    }

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
        attributesToRetrieve: ['id', 'paragraph_index', 'text', 'heading', 'blocktype', 'authority']
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
