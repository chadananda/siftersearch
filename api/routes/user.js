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
import { authenticate, hashPassword, verifyPassword, revokeAllUserTokens } from '../lib/auth.js';

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

  // Update profile handler (shared by PUT and PATCH)
  const updateProfileSchema = {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        preferred_language: { type: 'string', maxLength: 10 },
        metadata: { type: 'object' }
      }
    }
  };

  async function updateProfileHandler(request) {
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

    return user;
  }

  // Register both PUT and PATCH for profile updates
  fastify.put('/profile', { schema: updateProfileSchema }, updateProfileHandler);
  fastify.patch('/profile', { schema: updateProfileSchema }, updateProfileHandler);

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

  // Get active sessions (refresh tokens)
  fastify.get('/sessions', async (request) => {
    const sessions = await query(
      `SELECT id, created_at, expires_at
       FROM refresh_tokens
       WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')
       ORDER BY created_at DESC`,
      [request.user.sub]
    );

    return {
      sessions: sessions.rows.map((s, i) => ({
        id: s.id,
        created_at: s.created_at,
        expires_at: s.expires_at,
        current: i === 0 // Most recent is likely current
      }))
    };
  });

  // Logout from all devices
  fastify.post('/logout-all', async (request) => {
    await revokeAllUserTokens(request.user.sub);
    return { success: true, message: 'All sessions have been logged out' };
  });

  // Request account deletion (starts deletion process)
  fastify.post('/request-deletion', async (request) => {
    // In a real app, this might send a confirmation email
    // For now, we'll just mark the account for deletion with a grace period
    const deletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      'UPDATE users SET deletion_requested_at = ? WHERE id = ?',
      [new Date().toISOString(), request.user.sub]
    );

    return {
      success: true,
      message: 'Account deletion requested',
      deletion_date: deletionDate.toISOString()
    };
  });

  // Confirm and execute account deletion
  fastify.post('/confirm-deletion', async (request) => {
    // Revoke all tokens
    await revokeAllUserTokens(request.user.sub);

    // Soft delete the account
    await query(
      `UPDATE users SET
         tier = 'banned',
         email = 'deleted_' || id || '_' || email,
         deletion_requested_at = NULL
       WHERE id = ?`,
      [request.user.sub]
    );

    return { success: true, message: 'Account has been deleted' };
  });

  // Cancel deletion request
  fastify.post('/cancel-deletion', async (request) => {
    await query(
      'UPDATE users SET deletion_requested_at = NULL WHERE id = ?',
      [request.user.sub]
    );

    return { success: true, message: 'Deletion request cancelled' };
  });

  // Get referral information
  fastify.get('/referrals', async (request) => {
    const user = await queryOne('SELECT id, referral_code FROM users WHERE id = ?', [request.user.sub]);

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Generate referral code if not exists
    let referralCode = user.referral_code;
    if (!referralCode) {
      referralCode = `ref_${request.user.sub.slice(0, 8)}`;
      await query('UPDATE users SET referral_code = ? WHERE id = ?', [referralCode, request.user.sub]);
    }

    // Get referral stats
    const referrals = await query(
      `SELECT id, name, tier, created_at as joined_at
       FROM users
       WHERE referred_by = ?
       ORDER BY created_at DESC`,
      [request.user.sub]
    );

    const stats = {
      total: referrals.rows.length,
      approved: referrals.rows.filter(r => r.tier === 'approved' || r.tier === 'patron' || r.tier === 'admin').length,
      pending: referrals.rows.filter(r => r.tier === 'verified' || r.tier === 'anonymous').length
    };

    const baseUrl = process.env.PUBLIC_URL || 'https://siftersearch.com';

    return {
      referral_code: referralCode,
      referral_url: `${baseUrl}?ref=${referralCode}`,
      stats,
      referrals: referrals.rows
    };
  });
}
