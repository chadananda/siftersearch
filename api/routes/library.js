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
import { chatCompletion } from '../lib/ai.js';

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

    // Try to get authority data from library_nodes (may not exist in all environments)
    const authorityMap = {};
    try {
      const nodes = await queryAll(`
        SELECT r.name as religion_name, c.name as collection_name, c.authority_default
        FROM library_nodes r
        LEFT JOIN library_nodes c ON c.parent_id = r.id AND c.node_type = 'collection'
        WHERE r.node_type = 'religion'
      `);
      for (const row of nodes) {
        if (row.collection_name) {
          authorityMap[`${row.religion_name}:${row.collection_name}`] = row.authority_default;
        }
      }
    } catch {
      // library_nodes table doesn't exist - continue without authority sorting
    }

    // Get all religions with their counts from facets
    const searchResult = await meili.index(INDEXES.DOCUMENTS).search('', {
      limit: 0,
      facets: ['religion']
    });

    const religionCounts = searchResult.facetDistribution?.religion || {};

    // For each religion, get its collections via faceted search
    const religions = await Promise.all(
      Object.entries(religionCounts).map(async ([religionName, count]) => {
        // Get collections for this religion
        const religionSearch = await meili.index(INDEXES.DOCUMENTS).search('', {
          limit: 0,
          filter: `religion = "${religionName}"`,
          facets: ['collection']
        });

        const collectionCounts = religionSearch.facetDistribution?.collection || {};
        const collections = Object.entries(collectionCounts)
          .map(([name, count]) => ({
            name,
            count,
            authority_default: authorityMap[`${religionName}:${name}`] ?? null
          }))
          // Sort by authority (higher first), then alphabetically
          .sort((a, b) => {
            const authA = a.authority_default ?? 0;
            const authB = b.authority_default ?? 0;
            if (authB !== authA) return authB - authA;
            return a.name.localeCompare(b.name);
          });

        return {
          name: religionName,
          count,
          collections
        };
      })
    );

    // Sort religions alphabetically
    religions.sort((a, b) => a.name.localeCompare(b.name));

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
   * Falls back to Meilisearch facets if library_nodes table is empty
   */
  fastify.get('/nodes', async () => {
    const meili = getMeili();

    // Get all nodes from database (may be empty or table may not exist)
    let nodes = [];
    try {
      nodes = await queryAll(`
        SELECT id, parent_id, node_type, name, slug, symbol, description, overview,
               cover_image_url, authority_default, display_order, metadata
        FROM library_nodes
        ORDER BY display_order, name
      `);
    } catch {
      // Table doesn't exist yet - will fall back to Meilisearch
    }

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

    // If library_nodes is empty, build tree from Meilisearch facets
    if (nodes.length === 0) {
      const tree = Object.keys(religionCounts)
        .sort((a, b) => a.localeCompare(b))
        .map(religionName => {
          const collections = Object.keys(collectionCounts[religionName] || {})
            .sort((a, b) => a.localeCompare(b))
            .map(collName => ({
              node_type: 'collection',
              name: collName,
              slug: collName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              document_count: collectionCounts[religionName][collName] || 0
            }));

          return {
            node_type: 'religion',
            name: religionName,
            slug: religionName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            document_count: religionCounts[religionName] || 0,
            children: collections
          };
        });

      return { nodes: tree };
    }

    // Build tree structure from database nodes
    const religionNodes = nodes.filter(n => n.node_type === 'religion');
    const collectionNodes = nodes.filter(n => n.node_type === 'collection');

    const tree = religionNodes.map(religion => {
      const children = collectionNodes
        .filter(c => c.parent_id === religion.id)
        .sort((a, b) => (b.authority_default || 5) - (a.authority_default || 5) || a.name.localeCompare(b.name))
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
        symbol: religion.symbol,
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
      SELECT id, parent_id, node_type, name, slug, symbol, description, overview,
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
      SELECT id, parent_id, node_type, name, slug, symbol, description, overview,
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
          symbol: { type: 'string', maxLength: 4 },
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
   * Generate AI description for a library node (admin only)
   * POST /nodes/:id/generate-description
   */
  fastify.post('/nodes/:id/generate-description', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const meili = getMeili();

    // Get the node
    const node = await queryOne('SELECT * FROM library_nodes WHERE id = ?', [id]);
    if (!node) {
      throw ApiError.notFound('Library node not found');
    }

    // Get document count for context
    let documentCount = 0;
    let sampleTitles = [];

    if (node.node_type === 'religion') {
      const result = await meili.index(INDEXES.DOCUMENTS).search('', {
        limit: 10,
        filter: `religion = "${node.name}"`,
        attributesToRetrieve: ['title', 'collection']
      });
      documentCount = result.estimatedTotalHits || 0;
      sampleTitles = result.hits.map(h => h.title).slice(0, 5);
    } else if (node.node_type === 'collection') {
      // Get parent religion
      const parent = await queryOne('SELECT name FROM library_nodes WHERE id = ?', [node.parent_id]);
      if (parent) {
        const result = await meili.index(INDEXES.DOCUMENTS).search('', {
          limit: 10,
          filter: `religion = "${parent.name}" AND collection = "${node.name}"`,
          attributesToRetrieve: ['title', 'author']
        });
        documentCount = result.estimatedTotalHits || 0;
        sampleTitles = result.hits.map(h => h.title).slice(0, 5);
      }
    }

    // Build prompt based on node type
    let prompt;
    if (node.node_type === 'religion') {
      prompt = `Generate a 2-3 sentence scholarly description for the "${node.name}" religious tradition in our interfaith library.

Context:
- This is a library containing sacred texts, scriptures, and scholarly works
- We have ${documentCount} documents in this tradition
- Sample titles: ${sampleTitles.join(', ') || 'various sacred texts'}

Guidelines:
- Briefly describe the tradition's origins, core teachings, and historical significance
- Keep the tone scholarly but accessible
- Do not use first person
- Focus on what makes this tradition unique
- Be respectful and objective

Return ONLY the description text, no quotes or formatting.`;
    } else {
      prompt = `Generate a 2-3 sentence description for the "${node.name}" collection within our interfaith library.

Context:
- This collection contains ${documentCount} documents
- Sample titles: ${sampleTitles.join(', ') || 'various texts'}

Guidelines:
- Describe what types of documents are in this collection
- Explain the significance or importance of these texts
- Keep the tone scholarly but accessible
- Do not use first person

Return ONLY the description text, no quotes or formatting.`;
    }

    try {
      const result = await chatCompletion([
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 200
      });

      const description = result.content.trim();

      logger.info({ nodeId: id, nodeType: node.node_type, name: node.name }, 'Generated AI description');

      return { description };
    } catch (err) {
      logger.error({ err, nodeId: id }, 'Failed to generate AI description');
      throw ApiError.internal('Failed to generate description');
    }
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
        await query(`UPDATE docs SET ${setClauses.join(', ')} WHERE id = ?`, values);
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
   * Get paragraphs with translations for side-by-side view
   * Returns original text + English translation for non-English documents
   */
  fastify.get('/documents/:id/bilingual', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50, maximum: 500 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { limit = 50, offset = 0 } = request.query;
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

    // Try to get paragraphs with translations from libsql (translations stored there)
    let paragraphs = [];
    let total = 0;
    let useFallback = false;

    try {
      paragraphs = await queryAll(`
        SELECT id, paragraph_index, text, translation, blocktype, heading
        FROM content
        WHERE doc_id = ? OR document_id = ?
        ORDER BY paragraph_index
        LIMIT ? OFFSET ?
      `, [id, id, limit, offset]);

      // Get total count from libsql
      const countResult = await queryOne(
        'SELECT COUNT(*) as count FROM content WHERE doc_id = ? OR document_id = ?',
        [id, id]
      );
      total = countResult?.count || 0;

      // If libsql has no content, use fallback
      if (paragraphs.length === 0) {
        useFallback = true;
      }
    } catch (err) {
      // libsql unavailable (e.g., SQLITE_BUSY) - fall back to Meilisearch
      request.log.warn({ err: err.message, docId: id }, 'libsql unavailable, using Meilisearch fallback');
      useFallback = true;
    }

    // Fallback to Meilisearch paragraphs when libsql unavailable or empty
    if (useFallback) {
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `document_id = "${id}"`,
        limit,
        offset,
        sort: ['paragraph_index:asc']
      });

      paragraphs = parasResult.hits.map(p => ({
        id: p.id,
        paragraph_index: p.paragraph_index,
        text: p.text,
        translation: null,
        blocktype: p.blocktype || 'paragraph',
        heading: p.heading
      }));

      total = parasResult.estimatedTotalHits || paragraphs.length;
    }

    // Determine if document needs RTL display
    const isRTL = ['ar', 'fa', 'he', 'ur'].includes(document.language);

    return {
      document: {
        id: document.id,
        title: document.title,
        author: document.author,
        language: document.language,
        isRTL
      },
      paragraphs: paragraphs.map(p => ({
        id: p.id,
        index: p.paragraph_index,
        original: p.text,
        translation: p.translation || null,
        blocktype: p.blocktype || 'paragraph',
        heading: p.heading
      })),
      total,
      limit,
      offset,
      hasTranslations: paragraphs.some(p => p.translation)
    };
  });

  /**
   * Get translation statistics for a document
   * Returns count of translated vs total paragraphs
   */
  fastify.get('/documents/:id/translation-stats', {
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

    // Get counts from libsql (support both doc_id and document_id columns)
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN translation IS NOT NULL AND translation != '' THEN 1 ELSE 0 END) as translated
      FROM content
      WHERE doc_id = ? OR document_id = ?
    `, [id, id]);

    // If libsql has no data, get total from Meilisearch
    // TODO: Run migration to sync all documents, then remove this fallback
    if (!stats?.total) {
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `document_id = "${id}"`,
        limit: 0
      });
      return {
        total: parasResult.estimatedTotalHits || 0,
        translated: 0,
        percent: 0
      };
    }

    return {
      total: stats?.total || 0,
      translated: stats?.translated || 0,
      percent: stats?.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0
    };
  });

  /**
   * Translation endpoint with content-type awareness
   * - scripture/poetry/classical: Shoghi Effendi biblical style
   * - historical: Modern clear English, but citations within use biblical style
   * - auto: AI detects content type and applies appropriate style
   */
  fastify.post('/translate', {
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', maxLength: 5000 },
          sourceLang: { type: 'string', default: 'ar' },
          targetLang: { type: 'string', default: 'en' },
          contentType: {
            type: 'string',
            enum: ['scripture', 'poetry', 'historical', 'auto'],
            default: 'auto',
            description: 'scripture/poetry use biblical style; historical uses modern English with biblical citations'
          },
          quality: { type: 'string', enum: ['standard', 'high'], default: 'high' }
        }
      }
    }
  }, async (request) => {
    const { text, sourceLang = 'ar', targetLang = 'en', contentType = 'auto', quality = 'high' } = request.body;

    const langName = sourceLang === 'ar' ? 'Arabic' : sourceLang === 'fa' ? 'Persian' : sourceLang;

    // Build content-type aware prompt
    let systemPrompt = `Translate the following ${langName} text to English. Provide only the translation.`;

    if (quality === 'high' && (sourceLang === 'ar' || sourceLang === 'fa') && targetLang === 'en') {

      if (contentType === 'scripture' || contentType === 'poetry') {
        // Pure biblical style for sacred/poetic content
        systemPrompt = `You are an expert translator specializing in Bahá'í sacred writings. Translate this ${langName} text to English using Shoghi Effendi's distinctive biblical translation style.

## Style Guidelines:
- Use archaic pronouns for the Divine: Thou, Thee, Thine, Thy
- Employ elevated diction: perceiveth, confesseth, hath, art, doth, verily
- Render divine attributes formally: sovereignty, dominion, majesty, glory
- Use inverted word order for emphasis where appropriate
- Craft flowing sentences with parallel clauses
- Preserve metaphors, imagery, and rhetorical devices
- Maintain poetic rhythm and cadence

## Example Correspondences:
- "سُبْحانَكَ يا إِلهي" → "Glorified art Thou, O Lord my God!"
- "أَسْئَلُكَ" → "I beseech Thee" / "I entreat Thee"
- "قُلْ" (Say/Proclaim) → "Say:" or "Proclaim:"

Provide only the translation, no explanations.`;

      } else if (contentType === 'historical') {
        // Modern English for narrative, biblical for embedded citations
        systemPrompt = `You are an expert translator of ${langName} historical and narrative texts. Translate to clear, modern English suitable for scholarly readers.

## Style Guidelines for Narrative Text:
- Use clear, modern English prose
- Maintain historical accuracy and terminology
- Keep sentences readable and well-structured
- Preserve the author's narrative voice

## IMPORTANT: Embedded Citations
When the text quotes or cites scripture, prayers, poetry, prophecy, or tradition (hadith), render those citations in Shoghi Effendi's biblical style:
- Use: Thou, Thee, Thine, Thy for the Divine
- Use: hath, art, doth, verily, perceiveth
- Preserve the elevated, sacred tone of the original

## Example:
Historical narrative: "The Báb then recited a prayer, saying..."
→ Modern English for narrative
Citation within: "سُبْحانَكَ يا إِلهي"
→ "Glorified art Thou, O Lord my God!"

Provide only the translation, no explanations.`;

      } else {
        // Auto-detect: AI determines content type
        systemPrompt = `You are an expert translator of ${langName} religious and historical texts. Analyze the content and translate appropriately:

## Content Type Detection:
1. **Scripture, Prayers, Poetry, Prophecy**: Use Shoghi Effendi's biblical style
   - Archaic pronouns: Thou, Thee, Thine, Thy
   - Elevated diction: perceiveth, hath, art, doth, verily
   - Formal divine attributes: sovereignty, dominion, majesty

2. **Historical Narrative, Letters, Chronicles**: Use clear modern English
   - Readable scholarly prose
   - Historical accuracy
   - Modern sentence structure

3. **Mixed Content** (narrative with embedded citations):
   - Modern English for the narrative portions
   - Biblical style for any quoted scripture, prayers, poetry, prophecy, or hadith

## Indicators of Sacred Content:
- Invocations to God (يا الله, سبحان)
- Prayer language (أسألك, أدعوك)
- Quranic/scriptural quotations
- Poetic meter and rhyme
- Prophetic declarations

## Indicators of Historical Content:
- Third-person narrative
- Dates, places, names
- Chronicle-style reporting
- Letters and correspondence

Provide only the translation, no explanations.`;
      }
    }

    try {
      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ], {
        temperature: 0.3,
        maxTokens: Math.max(text.length * 4, 1000)
      });

      return {
        original: text,
        translation: response.content.trim(),
        sourceLang,
        targetLang,
        contentType,
        quality,
        style: contentType === 'historical' ? 'modern-with-biblical-citations' :
               contentType === 'auto' ? 'auto-detected' : 'shoghi-effendi'
      };
    } catch (err) {
      logger.error({ err: err.message }, 'Translation failed');
      throw ApiError.internal('Translation failed: ' + err.message);
    }
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

  // ============================================
  // Batch Translation (Admin)
  // ============================================

  /**
   * Translate a batch of paragraphs for a document
   * Translates up to 10 paragraphs in parallel, saves to DB, returns results
   */
  fastify.post('/documents/:id/translate-batch', {
    preHandler: [requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        required: ['paragraphIds'],
        properties: {
          paragraphIds: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10
          },
          style: {
            type: 'string',
            enum: ['scriptural', 'modern', 'auto'],
            default: 'auto'
          }
        }
      }
    }
  }, async (request) => {
    const { id: documentId } = request.params;
    const { paragraphIds, style = 'auto' } = request.body;

    if (!paragraphIds || paragraphIds.length === 0) {
      throw ApiError.badRequest('No paragraph IDs provided');
    }

    // Get document info for translation context
    const meili = getMeili();
    let document;
    try {
      document = await meili.index(INDEXES.DOCUMENTS).getDocument(documentId);
    } catch {
      throw ApiError.notFound('Document not found');
    }

    const sourceLang = document.language || 'ar';
    if (sourceLang === 'en') {
      throw ApiError.badRequest('Document is already in English');
    }

    // Get paragraphs to translate (support both doc_id and document_id columns)
    const placeholders = paragraphIds.map(() => '?').join(',');
    let paragraphs = await queryAll(`
      SELECT id, paragraph_index, text, translation
      FROM content
      WHERE (doc_id = ? OR document_id = ?) AND id IN (${placeholders})
      ORDER BY paragraph_index
    `, [documentId, documentId, ...paragraphIds]);

    // If content table is empty for this document, populate from Meilisearch
    if (paragraphs.length === 0) {
      const countResult = await queryOne(
        'SELECT COUNT(*) as count FROM content WHERE doc_id = ? OR document_id = ?',
        [documentId, documentId]
      );

      if (countResult?.count === 0) {
        // Content table empty - populate from Meilisearch paragraphs
        logger.info({ documentId }, 'Content table empty, populating from Meilisearch');

        const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
          filter: `document_id = "${documentId}"`,
          limit: 1000,
          sort: ['paragraph_index:asc']
        });

        if (parasResult.hits.length > 0) {
          // Insert paragraphs into content table
          for (const p of parasResult.hits) {
            await query(`
              INSERT OR IGNORE INTO content (id, doc_id, document_id, paragraph_index, text, blocktype, heading)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [p.id, documentId, documentId, p.paragraph_index, p.text, p.blocktype || 'paragraph', p.heading || null]);
          }

          logger.info({ documentId, inserted: parasResult.hits.length }, 'Populated content table from Meilisearch');

          // Now query again for the requested paragraphs
          paragraphs = await queryAll(`
            SELECT id, paragraph_index, text, translation
            FROM content
            WHERE (doc_id = ? OR document_id = ?) AND id IN (${placeholders})
            ORDER BY paragraph_index
          `, [documentId, documentId, ...paragraphIds]);
        }
      }

      // Still no paragraphs? Return error
      if (paragraphs.length === 0) {
        logger.warn({
          documentId,
          requestedIds: paragraphIds.slice(0, 3),
          contentTableCount: countResult?.count || 0
        }, 'No paragraphs found for translation');

        return {
          translations: [],
          message: 'No paragraphs found - document may need reindexing',
          debug: {
            documentId,
            requestedIdsSample: paragraphIds.slice(0, 3),
            contentTableCount: countResult?.count || 0
          }
        };
      }
    }

    // Determine translation style
    const SCRIPTURAL_COLLECTIONS = ['Core Tablets', 'Core Tablet Translations', 'Core Talks', 'Quran', 'Bible', 'Torah'];
    const SCRIPTURAL_AUTHORS = ['Bahá\'u\'lláh', 'The Báb', '\'Abdu\'l-Bahá', 'Shoghi Effendi'];
    const isScriptural = style === 'scriptural' ||
      (style === 'auto' && (
        SCRIPTURAL_COLLECTIONS.includes(document.collection) ||
        SCRIPTURAL_AUTHORS.some(a => document.author?.includes(a)) ||
        (document.authority && document.authority >= 8)
      ));

    const translationStyle = isScriptural ? 'scriptural' : 'modern';

    // Build translation prompt
    const langNames = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu' };
    const langName = langNames[sourceLang] || sourceLang;

    const systemPrompt = translationStyle === 'scriptural'
      ? `You are an expert translator of ${langName} sacred texts. Translate to English using Shoghi Effendi's neo-biblical style:
- Archaic pronouns for Divine: Thou, Thee, Thine, Thy
- Elevated verbs: perceiveth, hath, art, doth
- Formal vocabulary: vouchsafe, beseech, sovereignty
- Preserve exclamations: "O Lord!", "O my God!"
Provide only the translation.`
      : `You are an expert translator of ${langName} texts. Translate to clear modern English.
If the text contains scripture quotes, prayers, or divine speech, use elevated biblical style for those portions.
Provide only the translation.`;

    // Translate paragraphs in parallel
    const translations = await Promise.all(
      paragraphs.map(async (para) => {
        // Skip if no text
        if (!para.text || para.text.trim().length === 0) {
          return { id: para.id, paragraphIndex: para.paragraph_index, translation: '', skipped: true };
        }

        try {
          const response = await chatCompletion({
            model: 'quality',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: para.text }
            ],
            temperature: 0.3,
            maxTokens: Math.max(1000, para.text.length * 4)
          });

          const translation = response.content.trim();

          // Save to database
          await query(
            'UPDATE content SET translation = ? WHERE id = ?',
            [translation, para.id]
          );

          return {
            id: para.id,
            paragraphIndex: para.paragraph_index,
            translation,
            success: true
          };
        } catch (err) {
          logger.error({ err: err.message, paragraphId: para.id }, 'Paragraph translation failed');
          return {
            id: para.id,
            paragraphIndex: para.paragraph_index,
            error: err.message,
            success: false
          };
        }
      })
    );

    const successCount = translations.filter(t => t.success).length;
    logger.info({
      documentId,
      requested: paragraphIds.length,
      translated: successCount,
      style: translationStyle
    }, 'Batch translation completed');

    return {
      translations,
      style: translationStyle,
      successCount,
      totalRequested: paragraphIds.length
    };
  });
}
