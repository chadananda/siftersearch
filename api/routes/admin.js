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
 * GET /api/admin/server/tasks - List all background tasks with status
 * GET /api/admin/server/tasks/:taskId - Get detailed task output
 * POST /api/admin/server/tasks/:taskId/cancel - Cancel a running task
 * DELETE /api/admin/server/tasks - Clear completed tasks from memory
 */

import { join } from 'path';
import { query, queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireTier, requireInternal } from '../lib/auth.js';
import { getStats as getSearchStats, getMeili } from '../lib/search.js';
import { indexDocumentFromText, batchIndexDocuments, indexFromJSON, removeDocument, getIndexingStatus, migrateEmbeddingsFromMeilisearch, getEmbeddingCacheStats } from '../services/indexer.js';
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
      queryOne(`
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
      queryOne(`
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

    const users = await queryAll(sql, params);

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

    const countResult = await queryOne(countSql, countParams);

    return {
      users,
      total: countResult.count,
      limit,
      offset
    };
  });

  // Get users pending approval
  fastify.get('/pending', { preHandler: requireTier('admin') }, async () => {
    const users = await queryAll(`
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
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
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
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedUser = await queryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Approve a user (shortcut for setting tier to 'approved')
  fastify.post('/approve/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await queryOne('SELECT id, tier FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.tier !== 'verified') {
      throw ApiError.badRequest('User is not in verified tier');
    }

    await query(
      `UPDATE users SET tier = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    const updatedUser = await queryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Ban a user
  fastify.post('/ban/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Prevent self-ban
    if (user.id === request.user.sub) {
      throw ApiError.badRequest('Cannot ban yourself');
    }

    await query(`UPDATE users SET tier = 'banned' WHERE id = ?`, [id]);

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

    const events = await queryAll(sql, params);

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
    const [dbStats, searchStats] = await Promise.all([
      // Database stats
      Promise.all([
        queryOne('SELECT COUNT(*) as count FROM docs'),
        queryOne('SELECT COUNT(*) as count FROM content'),
        queryOne('SELECT COUNT(*) as count FROM users'),
        queryOne('SELECT COUNT(*) as count FROM library_nodes')
      ]).then(([docs, content, users, nodes]) => ({
        docs: docs?.count || 0,
        content: content?.count || 0,
        users: users?.count || 0,
        libraryNodes: nodes?.count || 0
      })).catch(() => ({ docs: 0, content: 0, users: 0, libraryNodes: 0 })),
      // Meilisearch stats
      getSearchStats().catch(() => ({ totalDocuments: 0, totalPassages: 0 }))
    ]);

    return {
      database: dbStats,
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
}
