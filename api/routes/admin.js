/**
 * Admin Routes
 *
 * All routes require admin tier authentication.
 *
 * User Management:
 * GET /api/admin/stats - Dashboard statistics
 * GET /api/admin/users - List users
 * PUT /api/admin/users/:id - Update user (tier, ban, etc.)
 * GET /api/admin/pending - Users awaiting approval
 * POST /api/admin/approve/:id - Approve a user
 *
 * Document Indexing:
 * POST /api/admin/index - Index a document
 * POST /api/admin/index/batch - Batch index documents
 * DELETE /api/admin/index/:id - Remove document from index
 * GET /api/admin/index/status - Get indexing queue status
 *
 * Server Management (requires admin JWT or X-Internal-Key header):
 * GET /api/admin/server/status - Overview: database + Meilisearch stats + task counts
 * GET /api/admin/server/tables - List database tables with row counts
 * GET /api/admin/server/indexes - Meilisearch index details and field distribution
 * POST /api/admin/server/migrate - Run database migrations
 * POST /api/admin/server/validate - Validate script parameters without running
 * POST /api/admin/server/reindex - Re-index library (filters: religion, collection, path, documentId)
 * POST /api/admin/server/fix-languages - Fix RTL language detection (filters: limit, religion, dryRun)
 * POST /api/admin/server/populate-translations - Generate translations (filters: limit, language, documentId)
 * DELETE /api/admin/server/translations - Clear all translations (optional: documentId query param)
 * POST /api/admin/server/translate-document - Translate specific document with aligned segments
 * GET /api/admin/server/tasks - List all background tasks with status
 * GET /api/admin/server/tasks/:taskId - Get detailed task output
 * POST /api/admin/server/tasks/:taskId/cancel - Cancel a running task
 * DELETE /api/admin/server/tasks - Clear completed tasks from memory
 */

import { join } from 'path';
import { query, queryOne, queryAll, userQuery, userQueryOne, userQueryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireTier, requireInternal } from '../lib/auth.js';
import { getStats as getSearchStats, getMeili } from '../lib/search.js';
import { indexDocumentFromText, batchIndexDocuments, indexFromJSON, removeDocument, getIndexingStatus, migrateEmbeddingsFromMeilisearch, getEmbeddingCacheStats } from '../services/indexer.js';
import { getSyncStats, forceSyncNow, getUnsyncedCount } from '../services/sync-worker.js';
import { getWatcherStats, isWatcherRunning } from '../services/library-watcher.js';
import { spawn } from 'child_process';
import { logger } from '../lib/logger.js';

// Track background tasks
const backgroundTasks = new Map();

export default async function adminRoutes(fastify) {
  // Note: Server management routes (/server/*) use requireInternal which accepts
  // either X-Internal-Key header or admin JWT. Other routes use requireTier('admin').
  // We don't use a global hook here to allow route-specific auth handlers.

  // Dashboard statistics
  fastify.get('/stats', { preHandler: requireTier('admin') }, async () => {
    const [userStats, searchStats, analyticsStats] = await Promise.all([
      userQueryOne(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN tier = 'verified' THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN tier = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN tier = 'patron' THEN 1 ELSE 0 END) as patron,
          SUM(CASE WHEN tier = 'admin' THEN 1 ELSE 0 END) as admin,
          SUM(CASE WHEN tier = 'banned' THEN 1 ELSE 0 END) as banned,
          SUM(CASE WHEN approved_at IS NULL AND tier = 'verified' THEN 1 ELSE 0 END) as pending
        FROM users
      `),
      getSearchStats().catch(() => ({ documents: { numberOfDocuments: 0 }, paragraphs: { numberOfDocuments: 0 } })),
      userQueryOne(`
        SELECT
          COUNT(*) as total_events,
          SUM(cost_usd) as total_cost,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics
        WHERE created_at > datetime('now', '-30 days')
      `)
    ]);

    return {
      users: userStats,
      search: searchStats,
      analytics: {
        last30Days: analyticsStats
      }
    };
  });

  // List users with pagination and filtering
  fastify.get('/users', {
    preHandler: requireTier('admin'),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          tier: { type: 'string' },
          search: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 20, offset = 0, tier, search } = request.query;

    let sql = `
      SELECT id, email, name, tier, preferred_language, created_at, approved_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (tier) {
      sql += ' AND tier = ?';
      params.push(tier);
    }

    if (search) {
      sql += ' AND (email LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = await userQueryAll(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams = [];
    if (tier) {
      countSql += ' AND tier = ?';
      countParams.push(tier);
    }
    if (search) {
      countSql += ' AND (email LIKE ? OR name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await userQueryOne(countSql, countParams);

    return {
      users,
      total: countResult.count,
      limit,
      offset
    };
  });

  // Get users pending approval
  fastify.get('/pending', { preHandler: requireTier('admin') }, async () => {
    const users = await userQueryAll(`
      SELECT id, email, name, created_at, referred_by
      FROM users
      WHERE tier = 'verified' AND approved_at IS NULL
      ORDER BY created_at ASC
    `);

    return { users };
  });

  // Update user
  fastify.put('/users/:id', {
    preHandler: requireTier('admin'),
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['verified', 'approved', 'patron', 'institutional', 'admin', 'banned'] },
          name: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { tier, name } = request.body;

    // Check user exists
    const user = await userQueryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const updates = [];
    const values = [];

    if (tier !== undefined) {
      updates.push('tier = ?');
      values.push(tier);

      // Set approved_at if upgrading to approved or higher
      if (['approved', 'patron', 'institutional', 'admin'].includes(tier)) {
        updates.push('approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)');
      }
    }

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    values.push(id);
    await userQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedUser = await userQueryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Approve a user (shortcut for setting tier to 'approved')
  fastify.post('/approve/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await userQueryOne('SELECT id, tier FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.tier !== 'verified') {
      throw ApiError.badRequest('User is not in verified tier');
    }

    await userQuery(
      `UPDATE users SET tier = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    const updatedUser = await userQueryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Ban a user
  fastify.post('/ban/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await userQueryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Prevent self-ban
    if (user.id === request.user.sub) {
      throw ApiError.badRequest('Cannot ban yourself');
    }

    await userQuery(`UPDATE users SET tier = 'banned' WHERE id = ?`, [id]);

    return { success: true };
  });

  // Recent analytics events
  fastify.get('/analytics', {
    preHandler: requireTier('admin'),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          eventType: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 50, eventType } = request.query;

    let sql = `
      SELECT a.*, u.email as user_email
      FROM analytics a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (eventType) {
      sql += ' AND a.event_type = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(limit);

    const events = await userQueryAll(sql, params);

    return { events };
  });

  // ===== Document Indexing Routes =====

  // Index a single document from text
  fastify.post('/index', {
    preHandler: requireTier('admin'),
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 100 },
          metadata: {
            type: 'object',
            properties: {
              id: { type: 'string' },
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
      }
    }
  }, async (request) => {
    const { text, metadata = {} } = request.body;

    try {
      const result = await indexDocumentFromText(text, metadata);
      return result;
    } catch (err) {
      throw ApiError.internal(`Indexing failed: ${err.message}`);
    }
  });

  // Batch index documents from JSON
  fastify.post('/index/batch', {
    preHandler: requireTier('admin'),
    schema: {
      body: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string' },
                metadata: { type: 'object' }
              }
            }
          },
          // Alternative: structured book format
          title: { type: 'string' },
          author: { type: 'string' },
          chapters: { type: 'array' }
        }
      }
    }
  }, async (request) => {
    try {
      const results = await indexFromJSON(request.body);
      return {
        indexed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (err) {
      throw ApiError.internal(`Batch indexing failed: ${err.message}`);
    }
  });

  // Remove a document from the index
  fastify.delete('/index/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    try {
      const result = await removeDocument(id);
      return result;
    } catch (err) {
      throw ApiError.internal(`Failed to remove document: ${err.message}`);
    }
  });

  // Remove all documents by author from the index
  fastify.delete('/index/by-author/:author', {
    preHandler: requireInternal,
    schema: {
      params: {
        type: 'object',
        required: ['author'],
        properties: {
          author: { type: 'string', description: 'Author name (partial match)' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false, description: 'Preview without deleting' }
        }
      }
    }
  }, async (request) => {
    const { author } = request.params;
    const { dryRun = false } = request.query;
    const { getMeili, INDEXES } = await import('../lib/search.js');

    try {
      const meili = getMeili();

      // Search for all documents by this author
      const results = await meili.index(INDEXES.DOCUMENTS).search('', {
        filter: `author = "${author}"`,
        limit: 1000
      });

      // If no exact match, try contains
      let docs = results.hits;
      if (docs.length === 0) {
        const allDocs = await meili.index(INDEXES.DOCUMENTS).search(author, {
          attributesToSearchOn: ['author'],
          limit: 1000
        });
        docs = allDocs.hits.filter(d =>
          d.author && d.author.toLowerCase().includes(author.toLowerCase())
        );
      }

      if (docs.length === 0) {
        return { success: true, message: `No documents found for author: ${author}`, deleted: 0 };
      }

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          message: `Would delete ${docs.length} documents`,
          documents: docs.map(d => ({ id: d.id, title: d.title, author: d.author }))
        };
      }

      // Delete all found documents
      let deleted = 0;
      const errors = [];

      for (const doc of docs) {
        try {
          await removeDocument(doc.id);
          deleted++;
        } catch (err) {
          errors.push({ id: doc.id, error: err.message });
        }
      }

      logger.info({ author, deleted, errors: errors.length }, 'Deleted documents by author');

      return {
        success: true,
        message: `Deleted ${deleted} documents by author: ${author}`,
        deleted,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (err) {
      throw ApiError.internal(`Failed to delete documents by author: ${err.message}`);
    }
  });

  // Get indexing queue status
  fastify.get('/index/status', { preHandler: requireTier('admin') }, async () => {
    try {
      return await getIndexingStatus();
    } catch (err) {
      throw ApiError.internal(`Failed to get indexing status: ${err.message}`);
    }
  });

  // ===== Server Management Routes =====
  // These routes use requireInternal which accepts either:
  // 1. X-Internal-Key header with INTERNAL_API_KEY value (for server-to-server)
  // 2. Standard admin JWT authentication

  /**
   * Get server status - database stats, Meilisearch stats, etc.
   */
  fastify.get('/server/status', { preHandler: requireInternal }, async () => {
    const [dbStats, embeddingStats, embeddingDimCheck, searchStats] = await Promise.all([
      // Database stats (content + user databases)
      Promise.all([
        queryOne('SELECT COUNT(*) as count FROM docs'),
        queryOne('SELECT COUNT(*) as count FROM content'),
        userQueryOne('SELECT COUNT(*) as count FROM users'),
        queryOne('SELECT COUNT(*) as count FROM library_nodes')
      ]).then(([docs, content, users, nodes]) => ({
        docs: docs?.count || 0,
        content: content?.count || 0,
        users: users?.count || 0,
        libraryNodes: nodes?.count || 0
      })).catch(() => ({ docs: 0, content: 0, users: 0, libraryNodes: 0 })),
      // Embedding stats
      Promise.all([
        queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL'),
        queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NULL')
      ]).then(([withEmbed, withoutEmbed]) => ({
        withEmbeddings: withEmbed?.count || 0,
        withoutEmbeddings: withoutEmbed?.count || 0,
        coverage: withEmbed?.count && (withEmbed.count + (withoutEmbed?.count || 0)) > 0
          ? Math.round(withEmbed.count / (withEmbed.count + (withoutEmbed?.count || 0)) * 100)
          : 0
      })).catch(() => ({ withEmbeddings: 0, withoutEmbeddings: 0, coverage: 0 })),
      // Check embedding dimensions (sample 5 to check size)
      queryAll(`
        SELECT id, LENGTH(embedding) as bytes, embedding_model
        FROM content
        WHERE embedding IS NOT NULL
        LIMIT 5
      `).then(rows => {
        if (rows.length === 0) return { samples: 0 };
        // Each float is 4 bytes, so dimensions = bytes / 4
        const dims = rows.map(r => ({ id: r.id, dimensions: r.bytes / 4, model: r.embedding_model }));
        return { samples: rows.length, dimensions: dims[0].dimensions, model: dims[0].model };
      }).catch(() => ({ samples: 0 })),
      // Meilisearch stats
      getSearchStats().catch(() => ({ totalDocuments: 0, totalPassages: 0 }))
    ]);

    return {
      database: dbStats,
      embeddings: { ...embeddingStats, ...embeddingDimCheck },
      meilisearch: {
        documents: searchStats.totalDocuments || 0,
        paragraphs: searchStats.totalPassages || 0
      },
      backgroundTasks: {
        running: [...backgroundTasks.values()].filter(t => t.status === 'running').length,
        completed: [...backgroundTasks.values()].filter(t => t.status === 'completed').length,
        failed: [...backgroundTasks.values()].filter(t => t.status === 'failed').length
      }
    };
  });

  /**
   * Run database migrations
   */
  fastify.post('/server/migrate', { preHandler: requireInternal }, async () => {
    const { runMigrations } = await import('../lib/migrations.js');

    try {
      const result = await runMigrations();
      logger.info(result, 'Migrations run via API');
      return {
        success: true,
        ...result
      };
    } catch (err) {
      logger.error({ error: err.message }, 'Migration failed via API');
      throw ApiError.internal(`Migration failed: ${err.message}`);
    }
  });

  /**
   * Helper to run a script as a background task
   */
  function runBackgroundTask(taskId, scriptPath, args = []) {
    const task = {
      id: taskId,
      script: scriptPath,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: [],
      errors: [],
      exitCode: null,
      childProcess: null
    };

    backgroundTasks.set(taskId, task);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    // Store reference for cancellation
    task.childProcess = child;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      task.output.push(...lines);
      // Keep only last 100 lines
      if (task.output.length > 100) {
        task.output = task.output.slice(-100);
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      task.errors.push(...lines);
    });

    child.on('close', (code) => {
      // Don't override cancelled status
      if (task.status === 'running') {
        task.status = code === 0 ? 'completed' : 'failed';
      }
      task.exitCode = code;
      task.completedAt = task.completedAt || new Date().toISOString();
      task.childProcess = null; // Clean up reference
      logger.info({ taskId, exitCode: code, status: task.status }, 'Background task completed');
    });

    child.on('error', (err) => {
      task.status = 'failed';
      task.errors.push(err.message);
      task.childProcess = null;
      logger.error({ taskId, error: err.message }, 'Background task error');
    });

    return task;
  }

  /**
   * Start library re-indexing (background task)
   * Supports granular filtering by religion, collection, or path pattern
   */
  fastify.post('/server/reindex', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          force: { type: 'boolean', default: false },
          limit: { type: 'integer', minimum: 1 },
          religion: { type: 'string', description: 'Filter by religion name (e.g., "Bahai", "Islam")' },
          collection: { type: 'string', description: 'Filter by collection name' },
          author: { type: 'string', description: 'Filter by author name (partial match, e.g., "Bab")' },
          path: { type: 'string', description: 'Filter by path pattern (glob)' },
          documentId: { type: 'string', description: 'Re-index a single document by ID' }
        }
      }
    }
  }, async (request) => {
    const { force = false, limit, religion, collection, author, path, documentId } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('reindex');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-indexing is already in progress');
    }

    const args = [];
    if (force) args.push('--force');
    if (limit) args.push(`--limit=${limit}`);
    if (religion) args.push(`--religion=${religion}`);
    if (collection) args.push(`--collection=${collection}`);
    if (author) args.push(`--author=${author}`);
    if (path) args.push(`--path=${path}`);
    if (documentId) args.push(`--document=${documentId}`);

    const task = runBackgroundTask('reindex', 'scripts/index-library.js', args);

    logger.info({ args }, 'Library re-indexing started via API');

    return {
      success: true,
      taskId: 'reindex',
      message: 'Library re-indexing started in background',
      filters: { force, limit, religion, collection, author, path, documentId },
      status: task.status
    };
  });

  /**
   * Re-ingest a single document from its source file (background task)
   * Uses the new AI-based segmentation for concept-based paragraph breaks
   */
  fastify.post('/server/reingest-document', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to re-ingest' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.body;

    // Check if already running
    const existing = backgroundTasks.get('reingest');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-ingestion is already in progress');
    }

    const task = runBackgroundTask('reingest', 'scripts/reingest-document.js', [documentId]);

    logger.info({ documentId }, 'Document re-ingestion started via API');

    return {
      success: true,
      taskId: 'reingest',
      message: `Re-ingestion started for document: ${documentId}`,
      documentId,
      status: task.status
    };
  });

  /**
   * Fix RTL language detection (background task)
   * Scans documents and corrects language field based on content analysis
   */
  fastify.post('/server/fix-languages', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, description: 'Limit number of documents to process' },
          religion: { type: 'string', description: 'Filter by religion name' },
          dryRun: { type: 'boolean', default: false, description: 'Preview changes without applying' }
        }
      }
    }
  }, async (request) => {
    const { limit, religion, dryRun } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('fix-languages');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Language fix is already in progress');
    }

    const args = [];
    if (limit) args.push(`--limit=${limit}`);
    if (religion) args.push(`--religion=${religion}`);
    if (dryRun) args.push('--dry-run');

    const task = runBackgroundTask('fix-languages', 'scripts/fix-rtl-languages.js', args);

    logger.info({ args }, 'RTL language fix started via API');

    return {
      success: true,
      taskId: 'fix-languages',
      message: 'RTL language fix started in background',
      filters: { limit, religion, dryRun },
      status: task.status
    };
  });

  /**
   * Start translation population (background task)
   */
  fastify.post('/server/populate-translations', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1 },
          language: { type: 'string', enum: ['ar', 'fa', 'he', 'ur'] },
          documentId: { type: 'string' },
          force: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const { limit, language, documentId, force } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('translations');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Translation population is already in progress');
    }

    const args = [];
    if (limit) args.push(`--limit=${limit}`);
    if (language) args.push(`--language=${language}`);
    if (documentId) args.push(`--document=${documentId}`);
    if (force) args.push('--force');

    const task = runBackgroundTask('translations', 'scripts/populate-translations.js', args);

    logger.info({ args }, 'Translation population started via API');

    return {
      success: true,
      taskId: 'translations',
      message: 'Translation population started in background',
      status: task.status
    };
  });

  /**
   * Clear all translations from content table
   * DELETE /api/admin/server/translations
   */
  fastify.delete('/server/translations', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Clear only this document (optional)' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.query || {};

    let result;
    if (documentId) {
      result = await query(
        'UPDATE content SET translation = NULL, translation_segments = NULL, synced = 0 WHERE doc_id = ?',
        [documentId]
      );
      logger.info({ documentId, rowsAffected: result.rowsAffected }, 'Cleared translations for document');
    } else {
      result = await query(
        'UPDATE content SET translation = NULL, translation_segments = NULL, synced = 0 WHERE translation IS NOT NULL'
      );
      logger.info({ rowsAffected: result.rowsAffected }, 'Cleared all translations');
    }

    return {
      success: true,
      message: documentId
        ? `Cleared translations for document: ${documentId}`
        : 'Cleared all translations',
      rowsAffected: result.rowsAffected
    };
  });

  /**
   * Translate a specific document with aligned segments
   * POST /api/admin/server/translate-document
   */
  fastify.post('/server/translate-document', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string' },
          sourceLang: { type: 'string', default: 'ar' },
          targetLang: { type: 'string', default: 'en' }
        }
      }
    }
  }, async (request) => {
    const { documentId, sourceLang = 'ar', targetLang = 'en' } = request.body;

    // Import translation service dynamically to avoid circular deps
    const { translateTextWithSegments } = await import('../services/translation.js');

    // Get paragraphs for this document
    const paragraphs = await queryAll(
      'SELECT id, doc_id, paragraph_index, text FROM content WHERE doc_id = ? ORDER BY paragraph_index',
      [documentId]
    );

    if (paragraphs.length === 0) {
      throw ApiError.notFound(`No content found for document: ${documentId}`);
    }

    logger.info({ documentId, paragraphCount: paragraphs.length }, 'Starting document translation');

    const results = [];
    for (const para of paragraphs) {
      try {
        const result = await translateTextWithSegments(para.text, sourceLang, targetLang, 'scripture');
        const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;

        await query(
          'UPDATE content SET translation = ?, translation_segments = ?, synced = 0 WHERE id = ?',
          [result.translation, segmentsJson, para.id]
        );

        results.push({
          paragraphIndex: para.paragraph_index,
          segmentCount: result.segments?.length || 0,
          success: true
        });
      } catch (err) {
        logger.error({ err, paragraphId: para.id }, 'Translation failed for paragraph');
        results.push({
          paragraphIndex: para.paragraph_index,
          error: err.message,
          success: false
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info({ documentId, successCount, total: paragraphs.length }, 'Document translation complete');

    return {
      success: successCount === paragraphs.length,
      documentId,
      translated: successCount,
      total: paragraphs.length,
      results,
      viewUrls: {
        study: `/print/study?doc=${documentId}`,
        reading: `/print/reading?doc=${documentId}`
      }
    };
  });

  /**
   * List documents with content available for translation
   * GET /api/admin/server/translatable-docs
   */
  fastify.get('/server/translatable-docs', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'Filter by language (e.g., ar)' },
          limit: { type: 'integer', default: 20 }
        }
      }
    }
  }, async (request) => {
    const { language, limit = 20 } = request.query || {};

    // Get documents with content, grouped by doc_id
    let sql = `
      SELECT
        c.doc_id,
        d.title,
        d.language,
        COUNT(*) as paragraph_count,
        SUM(CASE WHEN c.translation IS NOT NULL THEN 1 ELSE 0 END) as translated_count
      FROM content c
      LEFT JOIN docs d ON c.doc_id = d.id
      GROUP BY c.doc_id
    `;

    const params = [];
    if (language) {
      sql += ` HAVING d.language = ?`;
      params.push(language);
    }

    sql += ` ORDER BY paragraph_count ASC LIMIT ?`;
    params.push(limit);

    const docs = await queryAll(sql, params);

    return {
      documents: docs,
      count: docs.length
    };
  });

  /**
   * Trigger server update (shortcut for /server/pull-update)
   * Pulls latest from git and reloads PM2
   */
  fastify.post('/update', { preHandler: requireInternal }, async () => {
    // Check if update already running
    const existing = backgroundTasks.get('pull-update');
    if (existing && existing.status === 'running') {
      return {
        success: false,
        message: 'Update already in progress',
        status: existing.status
      };
    }

    logger.info('Server update triggered via /update endpoint');
    const task = runBackgroundTask('pull-update', 'scripts/update-server.js', []);

    return {
      success: true,
      taskId: 'pull-update',
      message: 'Server update started in background',
      status: task.status
    };
  });

  /**
   * Pull and restart server (for version updates)
   * Called by client when it detects client version > server version
   */
  fastify.post('/server/pull-update', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          clientVersion: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { clientVersion } = request.body || {};

    // Check if update already running
    const existing = backgroundTasks.get('pull-update');
    if (existing && existing.status === 'running') {
      return {
        success: false,
        message: 'Update already in progress',
        status: existing.status
      };
    }

    logger.info({ clientVersion }, 'Server update triggered by admin');

    const task = runBackgroundTask('pull-update', 'scripts/update-server.js', []);

    return {
      success: true,
      taskId: 'pull-update',
      message: 'Server update started in background',
      clientVersion,
      status: task.status
    };
  });

  /**
   * Get status of background tasks
   */
  fastify.get('/server/tasks', { preHandler: requireInternal }, async () => {
    const tasks = {};
    for (const [id, task] of backgroundTasks) {
      tasks[id] = {
        id: task.id,
        script: task.script,
        status: task.status,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        exitCode: task.exitCode,
        outputLines: task.output.length,
        errorLines: task.errors.length,
        lastOutput: task.output.slice(-10),
        lastErrors: task.errors.slice(-5)
      };
    }
    return { tasks };
  });

  /**
   * Get detailed output for a specific task
   */
  fastify.get('/server/tasks/:taskId', { preHandler: requireInternal }, async (request) => {
    const { taskId } = request.params;
    const task = backgroundTasks.get(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    return {
      id: task.id,
      script: task.script,
      status: task.status,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      exitCode: task.exitCode,
      output: task.output,
      errors: task.errors
    };
  });

  /**
   * Clear completed tasks from memory
   */
  fastify.delete('/server/tasks', { preHandler: requireInternal }, async () => {
    let cleared = 0;
    for (const [id, task] of backgroundTasks) {
      if (task.status !== 'running') {
        backgroundTasks.delete(id);
        cleared++;
      }
    }
    return { cleared, remaining: backgroundTasks.size };
  });

  /**
   * Cancel a running task (kills the child process)
   */
  fastify.post('/server/tasks/:taskId/cancel', { preHandler: requireInternal }, async (request) => {
    const { taskId } = request.params;
    const task = backgroundTasks.get(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== 'running') {
      throw ApiError.badRequest(`Task is not running (status: ${task.status})`);
    }

    // Kill the child process if it exists
    if (task.childProcess && !task.childProcess.killed) {
      task.childProcess.kill('SIGTERM');
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      logger.info({ taskId }, 'Task cancelled via API');
    }

    return {
      success: true,
      taskId,
      status: task.status
    };
  });

  /**
   * Debug endpoint to query a job by ID
   * Returns raw database row for debugging
   */
  fastify.get('/server/jobs/:jobId', { preHandler: requireInternal }, async (request) => {
    const { jobId } = request.params;
    const job = await queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw ApiError.notFound('Job not found');
    }
    // Return all columns as-is for debugging
    return {
      raw: job,
      columns: Object.keys(job),
      hasDocumentId: 'document_id' in job,
      documentIdValue: job.document_id,
      documentIdType: typeof job.document_id
    };
  });

  /**
   * Get database table info for debugging
   */
  fastify.get('/server/tables', { preHandler: requireInternal }, async () => {
    const tables = await queryAll(`
      SELECT name, type FROM sqlite_master
      WHERE type IN ('table', 'index')
      ORDER BY type, name
    `);

    // Get row counts for each table
    const tableCounts = {};
    for (const t of tables.filter(t => t.type === 'table' && !t.name.startsWith('sqlite_'))) {
      try {
        const result = await queryOne(`SELECT COUNT(*) as count FROM "${t.name}"`);
        tableCounts[t.name] = result?.count || 0;
      } catch {
        tableCounts[t.name] = 'error';
      }
    }

    return {
      tables: tables.filter(t => t.type === 'table').map(t => t.name),
      indexes: tables.filter(t => t.type === 'index').map(t => t.name),
      counts: tableCounts
    };
  });

  /**
   * Get table schema for debugging
   */
  fastify.get('/server/schema/:table', { preHandler: requireInternal }, async (request) => {
    const { table } = request.params;
    // Sanitize table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw ApiError.badRequest('Invalid table name');
    }
    try {
      const columns = await queryAll(`PRAGMA table_info("${table}")`);
      return { table, columns };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Get Meilisearch index info for debugging
   */
  fastify.get('/server/indexes', { preHandler: requireInternal }, async () => {
    try {
      const stats = await getSearchStats();
      return {
        documents: {
          count: stats.totalDocuments || 0,
          isIndexing: stats.indexing || false,
          religions: stats.religions || 0,
          collections: stats.collections || 0
        },
        paragraphs: {
          count: stats.totalPassages || 0,
          isIndexing: stats.indexing || false,
          collectionCounts: stats.collectionCounts || {}
        }
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Get Meilisearch task queue status
   */
  fastify.get('/server/meili-tasks', { preHandler: requireInternal }, async (request) => {
    try {
      const meili = getMeili();
      const { status, limit = 20 } = request.query || {};
      const query = { limit: Math.min(Number(limit), 100) };
      if (status) query.statuses = [status];

      const tasks = await meili.tasks.getTasks(query);
      return {
        total: tasks.total,
        query,
        results: tasks.results.map(t => ({
          uid: t.uid,
          status: t.status,
          type: t.type,
          indexUid: t.indexUid,
          enqueuedAt: t.enqueuedAt,
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
          error: t.error?.message
        }))
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Cancel pending Meilisearch tasks
   * POST /server/meili-cancel?beforeDate=2025-12-29T00:00:00Z
   */
  fastify.post('/server/meili-cancel', { preHandler: requireInternal }, async (request) => {
    try {
      const meili = getMeili();
      const { beforeDate } = request.query || {};

      if (!beforeDate) {
        throw ApiError.badRequest('beforeDate query parameter required (ISO date string)');
      }

      // Cancel all enqueued tasks before the specified date
      const result = await meili.tasks.cancelTasks({
        statuses: ['enqueued'],
        beforeEnqueuedAt: new Date(beforeDate)
      });

      logger.info({ beforeDate, taskUid: result.taskUid }, 'Meilisearch task cancellation requested');

      return {
        success: true,
        message: `Cancellation task created for enqueued tasks before ${beforeDate}`,
        taskUid: result.taskUid
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Control PM2 processes (stop/start/restart library watcher)
   */
  fastify.post('/server/pm2/:action/:process', { preHandler: requireInternal }, async (request) => {
    const { action, process: processName } = request.params;

    // Only allow specific processes and actions for security
    const allowedProcesses = ['siftersearch-library-watcher', 'siftersearch-jobs'];
    const allowedActions = ['stop', 'start', 'restart'];

    if (!allowedProcesses.includes(processName)) {
      throw ApiError.badRequest(`Process not allowed: ${processName}`);
    }
    if (!allowedActions.includes(action)) {
      throw ApiError.badRequest(`Action not allowed: ${action}`);
    }

    return new Promise((resolve, reject) => {
      const pm2Process = spawn('pm2', [action, processName], {
        cwd: join(import.meta.dirname, '../..'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pm2Process.stdout.on('data', (data) => { stdout += data.toString(); });
      pm2Process.stderr.on('data', (data) => { stderr += data.toString(); });

      pm2Process.on('close', (code) => {
        if (code === 0) {
          logger.info({ action, processName }, 'PM2 command executed');
          resolve({ success: true, action, process: processName, output: stdout.trim() });
        } else {
          reject(ApiError.internal(`PM2 command failed: ${stderr || stdout}`));
        }
      });

      pm2Process.on('error', (err) => {
        reject(ApiError.internal(`Failed to execute PM2: ${err.message}`));
      });
    });
  });

  /**
   * Get PM2 logs for debugging
   */
  fastify.get('/server/logs', { preHandler: requireInternal }, async (request) => {
    const { lines = 50, process: processName = 'siftersearch-api' } = request.query || {};
    const allowedProcesses = ['siftersearch-api', 'siftersearch-library-watcher', 'siftersearch-watchdog', 'siftersearch-jobs'];

    if (!allowedProcesses.includes(processName)) {
      throw ApiError.badRequest(`Process not allowed: ${processName}`);
    }

    return new Promise((resolve, reject) => {
      const pm2Process = spawn('pm2', ['logs', processName, '--lines', String(lines), '--nostream'], {
        cwd: join(import.meta.dirname, '../..'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pm2Process.stdout.on('data', (data) => { stdout += data.toString(); });
      pm2Process.stderr.on('data', (data) => { stderr += data.toString(); });

      pm2Process.on('close', (code) => {
        if (code === 0) {
          resolve({ process: processName, lines: Number(lines), logs: stdout.trim() });
        } else {
          reject(ApiError.internal(`PM2 logs failed: ${stderr || stdout}`));
        }
      });

      pm2Process.on('error', (err) => {
        reject(ApiError.internal(`Failed to get PM2 logs: ${err.message}`));
      });
    });
  });

  /**
   * Validate script parameters without running (dry validation)
   */
  fastify.post('/server/validate', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['script'],
        properties: {
          script: { type: 'string', enum: ['reindex', 'fix-languages', 'populate-translations'] },
          params: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { script, params = {} } = request.body;

    const validation = { valid: true, warnings: [], errors: [] };

    // Validate based on script type
    switch (script) {
      case 'reindex':
        if (params.religion && params.collection) {
          validation.warnings.push('Both religion and collection specified - will filter by both');
        }
        if (params.documentId && (params.religion || params.collection || params.path)) {
          validation.warnings.push('documentId specified - other filters will be ignored');
        }
        break;

      case 'fix-languages':
        if (params.dryRun) {
          validation.warnings.push('Dry run mode - no changes will be made');
        }
        break;

      case 'populate-translations':
        if (!params.limit && !params.documentId) {
          validation.warnings.push('No limit or documentId - will process all documents');
        }
        if (params.force) {
          validation.warnings.push('Force mode - will regenerate existing translations');
        }
        break;
    }

    return validation;
  });

  // ========================================
  // Embedding Cache Management
  // ========================================

  /**
   * Get embedding cache statistics
   * Shows how many embeddings are cached in libsql
   */
  fastify.get('/server/embedding-cache', { preHandler: requireInternal }, async () => {
    const stats = await getEmbeddingCacheStats();
    return stats;
  });

  /**
   * Migrate existing embeddings from Meilisearch to libsql (background task)
   * This preserves paid-for OpenAI embeddings so we don't have to regenerate them
   */
  fastify.post('/server/migrate-embeddings', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false },
          batchSize: { type: 'number', default: 100 }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false, batchSize = 100 } = request.body || {};

    // Check if already running
    const existingTask = [...backgroundTasks.values()].find(
      t => t.script.includes('migrate-embeddings') && t.status === 'running'
    );
    if (existingTask) {
      return {
        success: false,
        message: 'Embedding migration already running',
        taskId: existingTask.id
      };
    }

    const taskId = `migrate-embeddings-${Date.now()}`;
    const scriptPath = join(process.cwd(), 'scripts', 'migrate-embeddings.js');
    const args = [];
    if (dryRun) args.push('--dry-run');
    args.push(`--batch-size=${batchSize}`);

    logger.info({ taskId, dryRun, batchSize }, 'Starting embedding migration as background task');

    const task = runBackgroundTask(taskId, scriptPath, args);

    return {
      success: true,
      taskId: task.id,
      message: `Embedding migration started${dryRun ? ' (dry run)' : ''}. Check /server/tasks/${task.id} for progress.`,
      dryRun,
      batchSize
    };
  });

  // ========================================================================
  // Content Sync Management (Content Table → Meilisearch)
  // ========================================================================

  /**
   * GET /server/sync/status - Get sync worker status and pending counts
   */
  fastify.get('/server/sync/status', { preHandler: requireInternal }, async () => {
    const [stats, unsynced] = await Promise.all([
      getSyncStats(),
      getUnsyncedCount()
    ]);

    return {
      worker: stats,
      pending: unsynced
    };
  });

  /**
   * POST /server/sync/now - Force immediate sync cycle
   */
  fastify.post('/server/sync/now', { preHandler: requireInternal }, async () => {
    logger.info('Manual sync triggered via admin API');
    const result = await forceSyncNow();
    return {
      success: true,
      message: 'Sync cycle completed',
      stats: result
    };
  });

  /**
   * GET /server/sync/orphaned - Find documents without content table entries
   */
  fastify.get('/server/sync/orphaned', { preHandler: requireInternal }, async () => {
    // Find documents in docs table that have no content entries
    const orphaned = await queryAll(`
      SELECT d.id, d.title, d.file_path, d.language, d.paragraph_count
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      WHERE c.id IS NULL
      LIMIT 100
    `);

    // Also find documents with partial content (fewer paragraphs than expected)
    const partial = await queryAll(`
      SELECT d.id, d.title, d.file_path, d.paragraph_count as expected,
             COUNT(c.id) as actual
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      GROUP BY d.id
      HAVING actual < expected AND actual > 0
      LIMIT 100
    `);

    return {
      orphaned: orphaned.length,
      partial: partial.length,
      orphanedDocs: orphaned,
      partialDocs: partial
    };
  });

  // ========================================================================
  // Library Watcher Management (File System → Content Table)
  // ========================================================================

  /**
   * GET /server/watcher/status - Get library watcher status
   */
  fastify.get('/server/watcher/status', { preHandler: requireInternal }, async () => {
    return {
      running: isWatcherRunning(),
      stats: getWatcherStats()
    };
  });

  /**
   * POST /server/populate-content - Populate missing content from Meilisearch
   * Finds documents with paragraph_count > 0 but no content rows and fetches from Meili
   */
  fastify.post('/server/populate-content', { preHandler: requireInternal }, async (request) => {
    const { limit = 100 } = request.query;

    // Find documents with no content
    const orphanedDocs = await queryAll(`
      SELECT d.id, d.title, d.paragraph_count, d.language
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      WHERE d.paragraph_count > 0
      GROUP BY d.id
      HAVING COUNT(c.id) = 0
      LIMIT ?
    `, [limit]);

    if (orphanedDocs.length === 0) {
      return { success: true, message: 'All documents have content', fixed: 0 };
    }

    const meili = getMeili();
    let fixed = 0;
    let errors = [];

    for (const doc of orphanedDocs) {
      try {
        const parasResult = await meili.index('paragraphs').search('', {
          filter: `document_id = "${doc.id}"`,
          limit: 10000,
          sort: ['paragraph_index:asc'],
          attributesToRetrieve: ['id', 'text', 'paragraph_index', 'heading', 'blocktype', '_vectors']
        });

        if (parasResult.hits.length === 0) {
          errors.push({ id: doc.id, error: 'No paragraphs in Meilisearch' });
          continue;
        }

        const now = new Date().toISOString();

        for (const para of parasResult.hits) {
          const contentId = para.id || `${doc.id}_p${para.paragraph_index}_${Date.now()}`;
          const embedding = para._vectors?.default;
          const embeddingBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;

          await query(`
            INSERT OR REPLACE INTO content
            (id, doc_id, paragraph_index, text, heading, blocktype, embedding, synced, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `, [
            contentId,
            doc.id,
            para.paragraph_index || 0,
            para.text || '',
            para.heading || '',
            para.blocktype || 'paragraph',
            embeddingBlob,
            now,
            now
          ]);
        }

        fixed++;
        logger.info({ docId: doc.id, paragraphs: parasResult.hits.length }, 'Populated content from Meilisearch');

      } catch (err) {
        errors.push({ id: doc.id, error: err.message });
      }
    }

    return {
      success: true,
      message: `Populated content for ${fixed} documents`,
      fixed,
      total: orphanedDocs.length,
      errors: errors.length > 0 ? errors : undefined
    };
  });

  // ========================================================================
  // Source File Linking (Link database records to source markdown files)
  // ========================================================================

  /**
   * POST /server/link-source-files - Link database documents to source files
   * Detects platform (Linux vs macOS) and uses correct Dropbox path
   *
   * @param {boolean} dryRun - Preview matches without updating database
   * @returns {object} Summary of matches and updates
   */
  fastify.post('/server/link-source-files', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false, description: 'Preview without updating' }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false } = request.body || {};
    const os = await import('os');
    const { readdir, readFile, stat } = await import('fs/promises');
    const { join, basename } = await import('path');
    const matter = (await import('gray-matter')).default;

    // Platform-specific Dropbox path
    const platform = os.platform();
    const homeDir = os.homedir();
    const LIBRARY_ROOT = join(
      homeDir,
      'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library'
    );

    logger.info({ platform, homeDir, LIBRARY_ROOT, dryRun }, 'Starting source file linking');

    // Recursively find all markdown files
    async function findMarkdownFiles(dir) {
      const files = [];
      async function scan(currentDir) {
        try {
          const entries = await readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await scan(fullPath);
            } else if (entry.name.endsWith('.md')) {
              files.push(fullPath);
            }
          }
        } catch (err) {
          logger.warn({ dir: currentDir, error: err.message }, 'Cannot scan directory');
        }
      }
      await scan(dir);
      return files;
    }

    // Convert filename to database ID format
    function filenameToId(filename) {
      return basename(filename, '.md')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    // Parse source file frontmatter
    async function parseSourceFile(filePath) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = matter(content);
        return {
          path: filePath,
          filename: basename(filePath),
          filenameId: filenameToId(basename(filePath)),
          title: parsed.data.title || null,
          author: parsed.data.author || null,
          language: parsed.data.language || 'en'
        };
      } catch (err) {
        return null;
      }
    }

    // Find matching database record
    function findMatch(sourceFile, allDocs) {
      // Strategy 1: Exact ID match
      const exactMatch = allDocs.find(d => d.id === sourceFile.filenameId);
      if (exactMatch) return { doc: exactMatch, matchType: 'exact_id' };

      // Strategy 2: ID contains filename ID
      const containsMatch = allDocs.find(d =>
        d.id.includes(sourceFile.filenameId) ||
        sourceFile.filenameId.includes(d.id)
      );
      if (containsMatch) return { doc: containsMatch, matchType: 'partial_id' };

      // Strategy 3: Title match
      const normalizeTitle = (t) => t?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const sourceTitle = normalizeTitle(sourceFile.title);
      if (sourceTitle) {
        const titleMatch = allDocs.find(d => normalizeTitle(d.title) === sourceTitle);
        if (titleMatch) return { doc: titleMatch, matchType: 'title' };
      }

      return null;
    }

    // Check library exists
    try {
      await stat(LIBRARY_ROOT);
    } catch (err) {
      throw ApiError.badRequest(`Library not found at: ${LIBRARY_ROOT}`);
    }

    // Find source files
    const sourceFiles = await findMarkdownFiles(LIBRARY_ROOT);
    logger.info({ count: sourceFiles.length }, 'Found source files');

    // Get all database documents
    const allDocs = await queryAll('SELECT id, title, author, language, file_path FROM docs');
    logger.info({ count: allDocs.length }, 'Found database documents');

    // Match files to documents
    const matches = [];
    const unmatched = [];

    for (const filePath of sourceFiles) {
      const sourceFile = await parseSourceFile(filePath);
      if (!sourceFile) continue;

      const match = findMatch(sourceFile, allDocs);
      if (match) {
        matches.push({
          docId: match.doc.id,
          docTitle: match.doc.title,
          filePath: sourceFile.path,
          matchType: match.matchType
        });
      } else {
        unmatched.push({ path: filePath, title: sourceFile.title });
      }
    }

    // Apply updates if not dry run
    let updated = 0;
    if (!dryRun && matches.length > 0) {
      for (const match of matches) {
        await query('UPDATE docs SET file_path = ? WHERE id = ?', [match.filePath, match.docId]);
        updated++;
      }
      logger.info({ updated }, 'Updated document file paths');
    }

    return {
      success: true,
      dryRun,
      platform,
      libraryRoot: LIBRARY_ROOT,
      sourceFilesFound: sourceFiles.length,
      databaseDocuments: allDocs.length,
      matched: matches.length,
      unmatched: unmatched.length,
      updated: dryRun ? 0 : updated,
      sampleMatches: matches.slice(0, 10).map(m => ({
        docId: m.docId,
        matchType: m.matchType,
        path: m.filePath.replace(LIBRARY_ROOT, '.')
      })),
      sampleUnmatched: unmatched.slice(0, 5).map(u => ({
        path: u.path.replace(LIBRARY_ROOT, '.'),
        title: u.title
      }))
    };
  });

  /**
   * GET /server/file-path-stats - Get statistics on documents with/without file paths
   */
  fastify.get('/server/file-path-stats', { preHandler: requireInternal }, async () => {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END) as with_path,
        SUM(CASE WHEN file_path IS NULL THEN 1 ELSE 0 END) as without_path
      FROM docs
    `);

    const sampleWithPath = await queryAll(`
      SELECT id, title, file_path FROM docs WHERE file_path IS NOT NULL LIMIT 5
    `);

    const sampleWithoutPath = await queryAll(`
      SELECT id, title, author FROM docs WHERE file_path IS NULL LIMIT 10
    `);

    return {
      total: stats.total,
      withFilePath: stats.with_path,
      withoutFilePath: stats.without_path,
      coverage: stats.total > 0 ? Math.round(stats.with_path / stats.total * 100) : 0,
      sampleWithPath,
      sampleWithoutPath
    };
  });
}
