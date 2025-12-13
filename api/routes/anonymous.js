/**
 * Anonymous User Routes
 *
 * Tracks anonymous users by client-generated ID for preferences and history.
 * No authentication required - uses X-User-ID header.
 *
 * GET /api/anonymous/profile - Get anonymous user preferences
 * PUT /api/anonymous/profile - Update preferences
 * POST /api/anonymous/track - Track activity (search, page view)
 */

import { query, queryOne } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Extract anonymous user ID from request headers
 */
function getAnonymousUserId(request) {
  const userId = request.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  // Validate format: user_xxx or sess_xxx (for backwards compatibility)
  if (!userId.match(/^(user_|sess_)[a-f0-9-]+$/i)) {
    return null;
  }
  return userId;
}

/**
 * Ensure anonymous user exists in database, create if not
 */
async function ensureAnonymousUser(userId, request) {
  const existing = await queryOne('SELECT id FROM anonymous_users WHERE id = ?', [userId]);

  if (!existing) {
    const userAgent = request.headers['user-agent'] || null;
    await query(
      `INSERT INTO anonymous_users (id, user_agent, first_seen_at, last_seen_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, userAgent]
    );
    logger.info({ userId }, 'Created new anonymous user');
  }

  return userId;
}

export default async function anonymousRoutes(fastify) {
  // Get anonymous user profile/preferences
  fastify.get('/profile', async (request) => {
    const userId = getAnonymousUserId(request);
    if (!userId) {
      throw ApiError.badRequest('Missing or invalid X-User-ID header');
    }

    const user = await queryOne(
      `SELECT id, preferences, interests, search_count, first_seen_at, last_seen_at
       FROM anonymous_users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      // Return empty profile for new users
      return {
        user: {
          id: userId,
          preferences: {},
          interests: [],
          searchCount: 0,
          isNew: true
        }
      };
    }

    // Parse JSON fields
    let preferences = {};
    let interests = [];
    try {
      if (user.preferences) preferences = JSON.parse(user.preferences);
      if (user.interests) interests = JSON.parse(user.interests);
    } catch (e) {
      logger.warn({ userId, error: e.message }, 'Failed to parse anonymous user JSON fields');
    }

    return {
      user: {
        id: user.id,
        preferences,
        interests,
        searchCount: user.search_count,
        firstSeen: user.first_seen_at,
        lastSeen: user.last_seen_at,
        isNew: false
      }
    };
  });

  // Update anonymous user preferences
  fastify.put('/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          preferences: {
            type: 'object',
            properties: {
              theme: { type: 'string', enum: ['light', 'dark', 'system'] },
              language: { type: 'string', maxLength: 10 },
              searchMode: { type: 'string', enum: ['hybrid', 'semantic', 'keyword'] },
              resultsPerPage: { type: 'integer', minimum: 5, maximum: 50 }
            }
          }
        }
      }
    }
  }, async (request) => {
    const userId = getAnonymousUserId(request);
    if (!userId) {
      throw ApiError.badRequest('Missing or invalid X-User-ID header');
    }

    await ensureAnonymousUser(userId, request);

    const { preferences } = request.body;
    if (preferences) {
      await query(
        `UPDATE anonymous_users
         SET preferences = ?, last_seen_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(preferences), userId]
      );
    }

    return { success: true };
  });

  // Track anonymous user activity (search, etc.)
  fastify.post('/track', {
    schema: {
      body: {
        type: 'object',
        required: ['event'],
        properties: {
          event: { type: 'string', enum: ['search', 'view', 'click'] },
          query: { type: 'string', maxLength: 500 },
          data: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const userId = getAnonymousUserId(request);
    if (!userId) {
      throw ApiError.badRequest('Missing or invalid X-User-ID header');
    }

    await ensureAnonymousUser(userId, request);

    const { event, query: searchQuery, data } = request.body;

    if (event === 'search' && searchQuery) {
      await query(
        `UPDATE anonymous_users
         SET search_count = search_count + 1,
             last_search_query = ?,
             last_seen_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [searchQuery, userId]
      );
    } else {
      // Just update last seen
      await query(
        `UPDATE anonymous_users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [userId]
      );
    }

    // Log to analytics (optional, for aggregate stats)
    await query(
      `INSERT INTO analytics (event_type, details, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [`anonymous_${event}`, JSON.stringify({ userId: userId.substring(0, 20), ...data })]
    );

    return { success: true };
  });

  // Get anonymous user's conversation history
  fastify.get('/conversations', async (request) => {
    const userId = getAnonymousUserId(request);
    if (!userId) {
      throw ApiError.badRequest('Missing or invalid X-User-ID header');
    }

    const conversations = await query(
      `SELECT id, title, created_at, updated_at
       FROM anonymous_conversations
       WHERE anonymous_user_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId]
    );

    return { conversations };
  });

  // Save a conversation for anonymous user
  fastify.post('/conversations', {
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', maxLength: 200 },
          messages: { type: 'array' }
        }
      }
    }
  }, async (request) => {
    const userId = getAnonymousUserId(request);
    if (!userId) {
      throw ApiError.badRequest('Missing or invalid X-User-ID header');
    }

    await ensureAnonymousUser(userId, request);

    const { id, title, messages } = request.body;

    // Generate title from first user message if not provided
    const autoTitle = title || messages.find(m => m.role === 'user')?.content?.substring(0, 100) || 'Untitled';

    if (id) {
      // Update existing conversation
      await query(
        `UPDATE anonymous_conversations
         SET messages = ?, title = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND anonymous_user_id = ?`,
        [JSON.stringify(messages), autoTitle, id, userId]
      );
      return { id, title: autoTitle };
    } else {
      // Create new conversation
      const result = await query(
        `INSERT INTO anonymous_conversations (anonymous_user_id, title, messages)
         VALUES (?, ?, ?) RETURNING id`,
        [userId, autoTitle, JSON.stringify(messages)]
      );
      return { id: result.lastInsertRowid, title: autoTitle };
    }
  });
}
