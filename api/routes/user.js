/**
 * User Profile Routes
 *
 * GET /api/user/profile - Get current user profile
 * PUT /api/user/profile - Update profile
 * PUT /api/user/password - Change password
 * DELETE /api/user - Delete account
 */

import { query, queryOne } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { authenticate, hashPassword, verifyPassword } from '../lib/auth.js';

export default async function userRoutes(fastify) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // Get profile
  fastify.get('/profile', async (request) => {
    const user = await queryOne(
      `SELECT id, email, name, tier, preferred_language, metadata, created_at, approved_at
       FROM users WHERE id = ?`,
      [request.user.sub]
    );

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Parse metadata JSON
    if (user.metadata) {
      try {
        user.metadata = JSON.parse(user.metadata);
      } catch {
        user.metadata = {};
      }
    }

    return { user };
  });

  // Update profile
  fastify.put('/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100 },
          preferred_language: { type: 'string', maxLength: 10 },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { name, preferred_language, metadata } = request.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (preferred_language !== undefined) {
      updates.push('preferred_language = ?');
      values.push(preferred_language);
    }

    if (metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    values.push(request.user.sub);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const user = await queryOne(
      `SELECT id, email, name, tier, preferred_language, metadata, created_at
       FROM users WHERE id = ?`,
      [request.user.sub]
    );

    if (user.metadata) {
      try {
        user.metadata = JSON.parse(user.metadata);
      } catch {
        user.metadata = {};
      }
    }

    return { user };
  });

  // Change password
  fastify.put('/password', {
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request) => {
    const { currentPassword, newPassword } = request.body;

    const user = await queryOne('SELECT password_hash FROM users WHERE id = ?', [request.user.sub]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      throw ApiError.badRequest('Current password is incorrect');
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, request.user.sub]);

    return { success: true };
  });

  // Delete account
  fastify.delete('/', async (request) => {
    // Soft delete - just mark as banned/deleted
    await query(
      `UPDATE users SET tier = 'banned', email = CONCAT('deleted_', id, '_', email) WHERE id = ?`,
      [request.user.sub]
    );

    return { success: true };
  });

  // Get user's conversations
  fastify.get('/conversations', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { limit = 20, offset = 0 } = request.query;

    const conversations = await query(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [request.user.sub, limit, offset]
    );

    return { conversations: conversations.rows };
  });

  // Get a specific conversation
  fastify.get('/conversations/:id', async (request) => {
    const conversation = await queryOne(
      `SELECT id, title, messages, created_at, updated_at
       FROM conversations
       WHERE id = ? AND user_id = ?`,
      [request.params.id, request.user.sub]
    );

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    if (conversation.messages) {
      try {
        conversation.messages = JSON.parse(conversation.messages);
      } catch {
        conversation.messages = [];
      }
    }

    return { conversation };
  });
}
