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
 */

import { query, queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireTier } from '../lib/auth.js';
import { getStats as getSearchStats } from '../lib/search.js';
import { indexDocumentFromText, batchIndexDocuments, indexFromJSON, removeDocument, getIndexingStatus } from '../services/indexer.js';

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
}
