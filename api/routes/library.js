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
import { requireAuth, requireAdmin, requireInternal } from '../lib/auth.js';
import { aiService } from '../lib/ai-services.js';
import { translateTextWithSegments } from '../services/translation.js';

export default async function libraryRoutes(fastify) {

  // ============================================
  // Public Routes
  // ============================================

  /**
   * Get tree structure for library navigation
   * Returns religions with nested collections and document counts
   * Uses libsql docs table as source of truth
   */
  fastify.get('/tree', async () => {
    // Get authority data from library_nodes
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

    // Get religion and collection counts from docs table
    const stats = await queryAll(`
      SELECT religion, collection, COUNT(*) as count
      FROM docs
      WHERE religion IS NOT NULL
      GROUP BY religion, collection
      ORDER BY religion, collection
    `);

    // Build religion -> collections structure
    const religionMap = new Map();
    for (const row of stats) {
      if (!religionMap.has(row.religion)) {
        religionMap.set(row.religion, { name: row.religion, count: 0, collections: [] });
      }
      const religion = religionMap.get(row.religion);
      religion.count += row.count;
      if (row.collection) {
        religion.collections.push({
          name: row.collection,
          count: row.count,
          authority_default: authorityMap[`${row.religion}:${row.collection}`] ?? null
        });
      }
    }

    // Sort collections by authority (higher first), then alphabetically
    for (const religion of religionMap.values()) {
      religion.collections.sort((a, b) => {
        const authA = a.authority_default ?? 0;
        const authB = b.authority_default ?? 0;
        if (authB !== authA) return authB - authA;
        return a.name.localeCompare(b.name);
      });
    }

    // Convert to array and sort religions alphabetically
    const religions = Array.from(religionMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    return { religions };
  });

  /**
   * Get library statistics
   * Uses libsql as source of truth for counts
   */
  fastify.get('/stats', async () => {
    // Get document and paragraph counts from libsql
    const [docCount, paraCount, facetStats] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM docs'),
      queryOne('SELECT COUNT(*) as count FROM content'),
      queryAll(`
        SELECT
          religion,
          collection,
          language,
          COUNT(*) as count
        FROM docs
        GROUP BY religion, collection, language
      `)
    ]);

    // Build facet distributions from query results
    const religionCounts = {};
    const collectionCounts = {};
    const languageCounts = {};

    for (const row of facetStats) {
      if (row.religion) {
        religionCounts[row.religion] = (religionCounts[row.religion] || 0) + row.count;
      }
      if (row.collection) {
        collectionCounts[row.collection] = (collectionCounts[row.collection] || 0) + row.count;
      }
      if (row.language) {
        languageCounts[row.language] = (languageCounts[row.language] || 0) + row.count;
      }
    }

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

    // Get translation queue status
    let translationStats = { pending: 0, processing: 0, completed: 0, totalProgress: 0, totalItems: 0 };
    try {
      const transStats = await queryOne(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status IN ('pending', 'processing') THEN progress ELSE 0 END) as total_progress,
          SUM(CASE WHEN status IN ('pending', 'processing') THEN total_items ELSE 0 END) as total_items
        FROM jobs
        WHERE type = 'translation'
      `);
      if (transStats) {
        translationStats = {
          pending: transStats.pending || 0,
          processing: transStats.processing || 0,
          completed: transStats.completed || 0,
          totalProgress: transStats.total_progress || 0,
          totalItems: transStats.total_items || 0
        };
      }
    } catch {
      // Table may not exist yet
    }

    return {
      totalDocuments: docCount?.count || 0,
      totalParagraphs: paraCount?.count || 0,
      religions: Object.keys(religionCounts).length,
      collections: Object.keys(collectionCounts).length,
      languages: Object.keys(languageCounts).length,
      religionCounts,
      collectionCounts,
      languageCounts,
      indexing: indexingStats.pending > 0 || indexingStats.processing > 0,
      indexingProgress: indexingStats,
      translating: translationStats.pending > 0 || translationStats.processing > 0,
      translationProgress: translationStats
    };
  });

  // ============================================
  // Library Nodes (Religions & Collections)
  // ============================================

  /**
   * Get all library nodes as a tree structure
   * Falls back to docs table if library_nodes table is empty
   * Uses libsql as source of truth
   */
  fastify.get('/nodes', async () => {
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
      // Table doesn't exist yet - will fall back to docs table
    }

    // Get document counts from docs table
    const docCounts = await queryAll(`
      SELECT religion, collection, COUNT(*) as count
      FROM docs
      GROUP BY religion, collection
    `);

    // Build counts map
    const religionCounts = {};
    const collectionCounts = {};
    for (const row of docCounts) {
      const religion = row.religion || 'Uncategorized';
      const collection = row.collection || 'General';
      religionCounts[religion] = (religionCounts[religion] || 0) + row.count;
      if (!collectionCounts[religion]) collectionCounts[religion] = {};
      collectionCounts[religion][collection] = (collectionCounts[religion][collection] || 0) + row.count;
    }

    // If library_nodes is empty, build tree from docs table facets
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
   * Uses libsql for document counts
   */
  fastify.get('/nodes/:id', async (request) => {
    const { id } = request.params;

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

    // Get document count from docs table
    let documentCount = 0;
    if (node.node_type === 'collection' && parent) {
      const result = await queryOne(
        'SELECT COUNT(*) as count FROM docs WHERE religion = ? AND collection = ?',
        [parent.name, node.name]
      );
      documentCount = result?.count || 0;
    } else if (node.node_type === 'religion') {
      const result = await queryOne(
        'SELECT COUNT(*) as count FROM docs WHERE religion = ?',
        [node.name]
      );
      documentCount = result?.count || 0;
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
   * Uses libsql for document counts
   */
  fastify.get('/by-slug/:religionSlug', async (request) => {
    const { religionSlug } = request.params;

    const node = await queryOne(`
      SELECT id, parent_id, node_type, name, slug, symbol, description, overview,
             cover_image_url, authority_default, metadata, created_at, updated_at
      FROM library_nodes
      WHERE node_type = 'religion' AND slug = ?
    `, [religionSlug]);

    if (!node) {
      throw ApiError.notFound('Religion not found');
    }

    // Get document count from docs table
    const countResult = await queryOne(
      'SELECT COUNT(*) as count FROM docs WHERE religion = ?',
      [node.name]
    );

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
        document_count: countResult?.count || 0,
        children
      }
    };
  });

  fastify.get('/by-slug/:religionSlug/:collectionSlug', async (request) => {
    const { religionSlug, collectionSlug } = request.params;
    const { limit = 50, offset = 0, search = '' } = request.query;

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

    // Get documents from docs table
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    const searchTerm = search.trim();

    // Build query with optional search filter
    let whereClause = 'WHERE religion = ? AND collection = ?';
    let params = [religion.name, node.name];

    if (searchTerm) {
      whereClause += ' AND (title LIKE ? OR author LIKE ? OR description LIKE ?)';
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const [documents, countResult] = await Promise.all([
      queryAll(`
        SELECT id, title, author, religion, collection, language, year, description, paragraph_count
        FROM docs
        ${whereClause}
        ORDER BY title ASC
        LIMIT ? OFFSET ?
      `, [...params, parsedLimit, parsedOffset]),
      queryOne(
        `SELECT COUNT(*) as count FROM docs ${whereClause}`,
        params
      )
    ]);

    return {
      node: {
        ...node,
        metadata: node.metadata ? JSON.parse(node.metadata) : null,
        parent: { id: religion.id, name: religion.name, slug: religion.slug }
      },
      documents,
      total_documents: countResult?.count || 0,
      limit: parsedLimit,
      offset: parsedOffset
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

    // Get the node
    const node = await queryOne('SELECT * FROM library_nodes WHERE id = ?', [id]);
    if (!node) {
      throw ApiError.notFound('Library node not found');
    }

    // Get document count and samples from libsql (source of truth)
    let documentCount = 0;
    let sampleTitles = [];

    if (node.node_type === 'religion') {
      const [countResult, samples] = await Promise.all([
        queryOne('SELECT COUNT(*) as count FROM docs WHERE religion = ?', [node.name]),
        queryAll('SELECT title FROM docs WHERE religion = ? LIMIT 5', [node.name])
      ]);
      documentCount = countResult?.count || 0;
      sampleTitles = samples.map(h => h.title);
    } else if (node.node_type === 'collection') {
      // Get parent religion
      const parent = await queryOne('SELECT name FROM library_nodes WHERE id = ?', [node.parent_id]);
      if (parent) {
        const [countResult, samples] = await Promise.all([
          queryOne('SELECT COUNT(*) as count FROM docs WHERE religion = ? AND collection = ?', [parent.name, node.name]),
          queryAll('SELECT title FROM docs WHERE religion = ? AND collection = ? LIMIT 5', [parent.name, node.name])
        ]);
        documentCount = countResult?.count || 0;
        sampleTitles = samples.map(h => h.title);
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
      const result = await aiService('balanced').chat([
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
      sort = 'title',
      sortDir = sort === 'authority' ? 'desc' : 'asc',
      limit = 50,
      offset = 0
    } = request.query;

    // If there's a search term, use Meilisearch for full-text search
    // Otherwise use libsql for pure listing (faster for browsing)
    if (search && search.trim()) {
      const meili = getMeili();

      // Build Meilisearch filter array
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
        attributesToRetrieve: [
          'id', 'title', 'author', 'religion', 'collection',
          'language', 'year', 'description', 'paragraph_count',
          'authority', 'created_at', 'updated_at', 'cover_url'
        ]
      };

      if (filters.length > 0) {
        searchOptions.filter = filters.join(' AND ');
      }

      const result = await meili.index(INDEXES.DOCUMENTS).search(search, searchOptions);

      return {
        documents: result.hits.map(doc => ({ ...doc, status: 'indexed' })),
        total: result.estimatedTotalHits || 0,
        limit,
        offset
      };
    }

    // Pure listing - use libsql for browsing (source of truth)
    // Build SQL WHERE clauses
    const conditions = [];
    const params = [];

    if (religion) {
      conditions.push('religion = ?');
      params.push(religion);
    }
    if (collection) {
      conditions.push('collection = ?');
      params.push(collection);
    }
    if (language) {
      conditions.push('language = ?');
      params.push(language);
    }
    if (author) {
      conditions.push('author = ?');
      params.push(author);
    }
    if (yearFrom) {
      conditions.push('year >= ?');
      params.push(yearFrom);
    }
    if (yearTo) {
      conditions.push('year <= ?');
      params.push(yearTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    let orderBy = 'title ASC';
    if (sort === 'authority') {
      orderBy = `authority ${sortDir === 'desc' ? 'DESC' : 'ASC'}, title ASC`;
    } else if (sort === 'year') {
      orderBy = `year ${sortDir === 'desc' ? 'DESC' : 'ASC'}, title ASC`;
    } else if (sort === 'author') {
      orderBy = `author ${sortDir === 'desc' ? 'DESC' : 'ASC'}, title ASC`;
    } else {
      orderBy = `title ${sortDir === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Get documents and total count
    const [documents, countResult] = await Promise.all([
      queryAll(`
        SELECT id, title, author, religion, collection, language, year, description,
               paragraph_count, created_at, updated_at, cover_url
        FROM docs
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]),
      queryOne(`SELECT COUNT(*) as count FROM docs ${whereClause}`, params)
    ]);

    // Get processing status for documents if requested
    const processingDocs = new Set();
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
    const documentsWithStatus = documents.map(doc => ({
      ...doc,
      status: processingDocs.has(doc.id) ? 'processing' : 'indexed'
    }));

    return {
      documents: documentsWithStatus,
      total: countResult?.count || 0,
      limit,
      offset
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

    // Get document metadata from libsql (source of truth for library management)
    const document = await queryOne(`
      SELECT id, title, author, religion, collection, language, year, description, paragraph_count, created_at, updated_at
      FROM docs WHERE id = ?
    `, [id]);

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Get paragraphs from content table if requested
    let paragraphs = [];
    let paragraphTotal = 0;
    if (includeParagraphs) {
      const [paras, countResult] = await Promise.all([
        queryAll(`
          SELECT id, paragraph_index, text, heading, blocktype, translation, translation_segments
          FROM content
          WHERE doc_id = ?
          ORDER BY paragraph_index
          LIMIT ? OFFSET ?
        `, [id, paragraphLimit, paragraphOffset]),
        queryOne(`SELECT COUNT(*) as count FROM content WHERE doc_id = ?`, [id])
      ]);
      // Parse translation_segments from JSON string
      paragraphs = paras.map(p => ({
        ...p,
        segments: p.translation_segments ? JSON.parse(p.translation_segments) : null
      }));
      paragraphTotal = countResult?.count || 0;
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

    // Verify document exists in libsql (source of truth)
    const document = await queryOne(`
      SELECT id, title, author, religion, collection, language, year, description, paragraph_count
      FROM docs WHERE id = ?
    `, [id]);

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Update docs table (source of truth)
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

      // If metadata that propagates to paragraphs changed, mark paragraphs for re-sync
      // This ensures sync-worker will update Meilisearch even if direct push below fails
      if (updates.title || updates.author || updates.religion || updates.collection || updates.language || updates.year) {
        await query('UPDATE content SET synced = 0, updated_at = CURRENT_TIMESTAMP WHERE doc_id = ?', [id]);
      }
    }

    // Also push to Meilisearch for search consistency (immediate update)
    const meili = getMeili();
    const updatedDoc = {
      ...document,
      ...updates,
      updated_at: new Date().toISOString()
    };

    try {
      await meili.index(INDEXES.DOCUMENTS).updateDocuments([updatedDoc]);

      // Update paragraphs with inherited metadata if relevant fields changed
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
    } catch (err) {
      logger.warn({ err: err.message, id }, 'Failed to sync document update to Meilisearch');
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

    // Verify document exists in libsql (source of truth)
    const document = await queryOne('SELECT id FROM docs WHERE id = ?', [id]);
    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Get indexed content from content table (source of truth)
    const paragraphs = await queryAll(`
      SELECT text, heading, blocktype, paragraph_index
      FROM content
      WHERE doc_id = ?
      ORDER BY paragraph_index
    `, [id]);

    // Reconstruct markdown from indexed paragraphs
    const indexedContent = paragraphs.map(p => {
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
      paragraphCount: paragraphs.length
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

    // Get document metadata from libsql (source of truth)
    const document = await queryOne(`
      SELECT id, title, author, religion, collection, language, year, description
      FROM docs WHERE id = ?
    `, [id]);

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Get paragraphs with translations from libsql (source of truth for content)
    let paragraphs = [];
    let total = 0;

    try {
      paragraphs = await queryAll(`
        SELECT id, paragraph_index, text, translation, translation_segments, blocktype, heading
        FROM content
        WHERE doc_id = ?
        ORDER BY paragraph_index
        LIMIT ? OFFSET ?
      `, [id, limit, offset]);

      // Get total count from libsql
      const countResult = await queryOne(
        'SELECT COUNT(*) as count FROM content WHERE doc_id = ?',
        [id]
      );
      total = countResult?.count || 0;

      // If libsql has no content, document needs reindexing
      if (paragraphs.length === 0 && total === 0) {
        request.log.warn({ docId: id }, 'No content in libsql - document needs reindexing');
      }
    } catch (err) {
      // libsql unavailable (e.g., SQLITE_BUSY) - return error, don't fallback
      request.log.error({ err: err.message, docId: id }, 'libsql unavailable for bilingual');
      throw ApiError.serviceUnavailable('Database temporarily unavailable, please try again');
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
      paragraphs: paragraphs.map(p => {
        // Parse segments JSON if available
        let segments = null;
        if (p.translation_segments) {
          try {
            segments = JSON.parse(p.translation_segments);
          } catch {
            // Invalid JSON, ignore segments
          }
        }
        return {
          id: p.id,
          index: p.paragraph_index,
          original: p.text,
          translation: p.translation || null,
          segments,  // Aligned phrase pairs for interactive highlighting
          blocktype: p.blocktype || 'paragraph',
          heading: p.heading
        };
      }),
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

    // Get counts from libsql (source of truth)
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN translation IS NOT NULL AND translation != '' THEN 1 ELSE 0 END) as translated
      FROM content
      WHERE doc_id = ?
    `, [id]);

    // If libsql has no data, document needs to be re-indexed
    if (!stats?.total) {
      return {
        total: 0,
        translated: 0,
        percent: 0,
        needsReindex: true
      };
    }

    return {
      total: stats.total || 0,
      translated: stats.translated || 0,
      percent: stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0
    };
  });

  /**
   * Clear translations for a document (admin only)
   * Removes translation and translation_segments so document can be re-translated
   */
  fastify.delete('/documents/:id/translations', {
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

    // Verify document exists
    const doc = await queryOne('SELECT id FROM docs WHERE id = ?', [id]);
    if (!doc) {
      throw ApiError.notFound('Document not found');
    }

    // Clear translations
    const result = await query(`
      UPDATE content
      SET translation = NULL, translation_segments = NULL, synced = 0, updated_at = ?
      WHERE doc_id = ?
    `, [new Date().toISOString(), id]);

    logger.info({ documentId: id, cleared: result.changes }, 'Cleared document translations');

    return {
      success: true,
      documentId: id,
      clearedCount: result.changes || 0
    };
  });

  /**
   * Test segment translation (admin or internal key)
   * Clears and re-translates one paragraph to verify phrase-level alignment works
   */
  fastify.post('/documents/:id/test-segment-translation', {
    preHandler: [requireInternal],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id } = request.params;

    // Get document and first paragraph
    const doc = await queryOne('SELECT id, language FROM docs WHERE id = ?', [id]);
    if (!doc) {
      throw ApiError.notFound('Document not found');
    }

    const para = await queryOne(`
      SELECT id, paragraph_index, text FROM content
      WHERE doc_id = ?
      ORDER BY paragraph_index
      LIMIT 1
    `, [id]);

    if (!para || !para.text) {
      throw ApiError.badRequest('No content found for document');
    }

    // Clear this paragraph's translation
    await query(
      'UPDATE content SET translation = NULL, translation_segments = NULL WHERE id = ?',
      [para.id]
    );

    // Translate with segments
    const sourceLang = doc.language || 'ar';
    const result = await translateTextWithSegments(para.text, sourceLang, 'en', 'scriptural');

    // Save result
    const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
    await query(
      'UPDATE content SET translation = ?, translation_segments = ?, synced = 0, updated_at = ? WHERE id = ?',
      [result.translation, segmentsJson, new Date().toISOString(), para.id]
    );

    return {
      success: true,
      documentId: id,
      paragraphId: para.id,
      original: para.text,
      translation: result.translation,
      segments: result.segments,
      segmentCount: result.segments?.length || 0
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
      const response = await aiService('quality').chat([
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

    // Get document info from libsql (source of truth)
    const document = await queryOne(`
      SELECT id, title, author, religion, collection, language, year
      FROM docs WHERE id = ?
    `, [documentId]);

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    const sourceLang = document.language || 'ar';
    if (sourceLang === 'en') {
      throw ApiError.badRequest('Document is already in English');
    }

    // Get paragraphs to translate from libsql (source of truth)
    const placeholders = paragraphIds.map(() => '?').join(',');
    const paragraphs = await queryAll(`
      SELECT id, paragraph_index, text, translation
      FROM content
      WHERE doc_id = ? AND id IN (${placeholders})
      ORDER BY paragraph_index
    `, [documentId, ...paragraphIds]);

    // If no paragraphs found, log and return empty (content sync should be done via script)
    if (paragraphs.length === 0) {
      logger.warn({ documentId, requestedIds: paragraphIds.slice(0, 3) }, 'No paragraphs in content table - run sync-content script');
      return { translations: [], message: 'Content not yet synced' };
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

    // Determine content type for segment-aware translation
    const contentType = translationStyle === 'scriptural' ? 'scriptural' : 'auto';

    // Translate paragraphs in parallel with segment alignment
    const translations = await Promise.all(
      paragraphs.map(async (para) => {
        // Skip if no text
        if (!para.text || para.text.trim().length === 0) {
          return { id: para.id, paragraphIndex: para.paragraph_index, translation: '', skipped: true };
        }

        try {
          // Use segment-aware translation
          const result = await translateTextWithSegments(
            para.text,
            sourceLang,
            'en',
            contentType
          );

          const translation = result.translation;
          const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;

          // Save translation and segments to database
          await query(
            'UPDATE content SET translation = ?, translation_segments = ?, synced = 0, updated_at = ? WHERE id = ?',
            [translation, segmentsJson, new Date().toISOString(), para.id]
          );

          return {
            id: para.id,
            paragraphIndex: para.paragraph_index,
            translation,
            segments: result.segments,
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

  // ============================================
  // Translation Queue
  // ============================================

  /**
   * Queue a document for translation (FIFO)
   * The job processor will translate all paragraphs in the background
   */
  fastify.post('/documents/:id/queue-translation', {
    preHandler: [requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id: documentId } = request.params;
    // user_id is INTEGER NOT NULL in jobs table with foreign key constraint
    // For system users (strings like 'system_admin'), look up an admin user from the database
    const rawUserId = request.user.sub;
    let userId;
    if (typeof rawUserId === 'number') {
      userId = rawUserId;
    } else {
      // System user - find any admin user to assign the job to
      const adminUser = await queryOne("SELECT id FROM users WHERE tier = 'admin' LIMIT 1");
      userId = adminUser?.id || 1; // Fallback to id=1 if no admin found
    }

    // Get document info from libsql (source of truth)
    const document = await queryOne(`
      SELECT id, title, author, religion, collection, language, year
      FROM docs WHERE id = ?
    `, [documentId]);

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Check if already in English
    if (!document.language || document.language === 'en') {
      throw ApiError.badRequest('Document is already in English');
    }

    // Check if already queued or in progress
    const existingJob = await queryOne(`
      SELECT id, status, progress, total_items FROM jobs
      WHERE document_id = ? AND type = 'translation' AND status IN ('pending', 'processing')
      ORDER BY created_at DESC LIMIT 1
    `, [documentId]);

    if (existingJob) {
      return {
        queued: true,
        jobId: existingJob.id,
        status: existingJob.status,
        progress: existingJob.progress || 0,
        total: existingJob.total_items || 0,
        message: 'Translation already in queue'
      };
    }

    // Get paragraph count for progress tracking (content table is the source of truth)
    const countResult = await queryOne(
      'SELECT COUNT(*) as total, SUM(CASE WHEN translation IS NOT NULL THEN 1 ELSE 0 END) as translated FROM content WHERE doc_id = ?',
      [documentId]
    );

    const total = countResult?.total || 0;
    const alreadyTranslated = countResult?.translated || 0;

    if (total === 0) {
      throw ApiError.badRequest('Document has not been indexed yet. Re-index the document first.');
    }

    if (alreadyTranslated === total) {
      return {
        queued: false,
        message: 'All paragraphs already translated',
        progress: total,
        total
      };
    }

    // Get document authority for priority (higher authority = higher priority)
    let priority = 0;
    if (document.authority !== undefined) {
      priority = document.authority;
    } else if (document.collection) {
      // Try to get authority from library_nodes
      const node = await queryOne(`
        SELECT c.authority_default FROM library_nodes r
        JOIN library_nodes c ON c.parent_id = r.id AND c.node_type = 'collection'
        WHERE r.node_type = 'religion' AND r.name = ? AND c.name = ?
      `, [document.religion, document.collection]);
      if (node?.authority_default) {
        priority = node.authority_default;
      }
    }

    // Create job with priority
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    await query(`
      INSERT INTO jobs (id, type, status, user_id, document_id, params, priority, progress, total_items, created_at)
      VALUES (?, 'translation', 'pending', ?, ?, ?, ?, ?, ?, ?)
    `, [jobId, userId, documentId, JSON.stringify({ targetLanguage: 'en', sourceLanguage: document.language }), priority, alreadyTranslated, total, now]);

    logger.info({ jobId, documentId, userId: rawUserId, priority, total, alreadyTranslated }, 'Translation job queued');

    return {
      queued: true,
      jobId,
      status: 'pending',
      progress: alreadyTranslated,
      total,
      message: 'Document queued for translation'
    };
  });

  /**
   * Get translation queue status for a document
   */
  fastify.get('/documents/:id/translation-status', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request) => {
    const { id: documentId } = request.params;

    // Get latest job for this document
    const job = await queryOne(`
      SELECT id, status, progress, total_items, error_message, created_at, started_at, completed_at
      FROM jobs
      WHERE document_id = ? AND type = 'translation'
      ORDER BY created_at DESC LIMIT 1
    `, [documentId]);

    // Get current translation stats
    const stats = await queryOne(`
      SELECT COUNT(*) as total, SUM(CASE WHEN translation IS NOT NULL AND translation != '' THEN 1 ELSE 0 END) as translated
      FROM content WHERE doc_id = ?
    `, [documentId]);

    return {
      hasJob: !!job,
      job: job ? {
        id: job.id,
        status: job.status,
        progress: job.progress || 0,
        total: job.total_items || 0,
        error: job.error_message,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at
      } : null,
      stats: {
        translated: stats?.translated || 0,
        total: stats?.total || 0,
        percent: stats?.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0
      }
    };
  });
}
