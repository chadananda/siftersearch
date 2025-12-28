/**
 * Admin Routes
 *
 * All routes require admin tier authentication.
 *
 * GET /api/admin/stats - Dashboard statistics
 * GET /api/admin/users - List users
 * PUT /api/admin/users/:id - Update user (tier, ban, etc.)
 * GET /api/admin/pending - Users awaiting approval
 * POST /api/admin/approve/:id - Approve a user
 * POST /api/admin/index - Index a document
 * POST /api/admin/index/batch - Batch index documents
 * DELETE /api/admin/index/:id - Remove document from index
 * GET /api/admin/index/status - Get indexing queue status
 *
 * Server Management (requires admin JWT or X-Internal-Key header):
 * POST /api/admin/server/reindex - Start library re-indexing
 * POST /api/admin/server/fix-languages - Fix RTL language detection
 * POST /api/admin/server/populate-translations - Start translation population
 * GET /api/admin/server/tasks - Get status of background tasks
 * GET /api/admin/server/tasks/:taskId - Get detailed task output
 * DELETE /api/admin/server/tasks - Clear completed tasks
 */

import { query, queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireTier, requireInternal } from '../lib/auth.js';
import { getStats as getSearchStats } from '../lib/search.js';
import { indexDocumentFromText, batchIndexDocuments, indexFromJSON, removeDocument, getIndexingStatus } from '../services/indexer.js';
import { spawn } from 'child_process';
import { logger } from '../lib/logger.js';

// Track background tasks
const backgroundTasks = new Map();

export default async function adminRoutes(fastify) {
  // All routes require admin tier
  fastify.addHook('preHandler', requireTier('admin'));

  // Dashboard statistics
  fastify.get('/stats', async () => {
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
  fastify.get('/pending', async () => {
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
  fastify.post('/approve/:id', async (request) => {
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
  fastify.post('/ban/:id', async (request) => {
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
  fastify.delete('/index/:id', async (request) => {
    const { id } = request.params;

    try {
      const result = await removeDocument(id);
      return result;
    } catch (err) {
      throw ApiError.internal(`Failed to remove document: ${err.message}`);
    }
  });

  // Get indexing queue status
  fastify.get('/index/status', async () => {
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
      exitCode: null
    };

    backgroundTasks.set(taskId, task);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' }
    });

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
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code;
      task.completedAt = new Date().toISOString();
      logger.info({ taskId, exitCode: code }, 'Background task completed');
    });

    child.on('error', (err) => {
      task.status = 'failed';
      task.errors.push(err.message);
      logger.error({ taskId, error: err.message }, 'Background task error');
    });

    return task;
  }

  /**
   * Start library re-indexing (background task)
   */
  fastify.post('/server/reindex', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          force: { type: 'boolean', default: false },
          limit: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async (request) => {
    const { force = false, limit } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('reindex');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-indexing is already in progress');
    }

    const args = [];
    if (force) args.push('--force');
    if (limit) args.push(`--limit=${limit}`);

    const task = runBackgroundTask('reindex', 'scripts/index-library.js', args);

    logger.info({ args }, 'Library re-indexing started via API');

    return {
      success: true,
      taskId: 'reindex',
      message: 'Library re-indexing started in background',
      status: task.status
    };
  });

  /**
   * Fix RTL language detection (background task)
   */
  fastify.post('/server/fix-languages', { preHandler: requireInternal }, async () => {
    // Check if already running
    const existing = backgroundTasks.get('fix-languages');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Language fix is already in progress');
    }

    const task = runBackgroundTask('fix-languages', 'scripts/fix-rtl-languages.js');

    logger.info('RTL language fix started via API');

    return {
      success: true,
      taskId: 'fix-languages',
      message: 'RTL language fix started in background',
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
}
