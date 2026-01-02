/**
 * Forum Routes
 *
 * Reddit-style threaded discussions for community engagement.
 *
 * GET /api/forum/posts - List posts with pagination
 * GET /api/forum/posts/:id - Get post with replies
 * POST /api/forum/posts - Create a new post (verified+ users)
 * POST /api/forum/posts/:id/reply - Reply to a post (verified+ users)
 * PUT /api/forum/posts/:id - Update own post
 * DELETE /api/forum/posts/:id - Delete own post (or admin)
 * POST /api/forum/posts/:id/vote - Upvote/downvote a post
 */

import { userQuery as query, userQueryOne as queryOne, userQueryAll as queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { authenticate, optionalAuthenticate } from '../lib/auth.js';

// Minimum tier required to post
const POSTING_TIERS = ['verified', 'approved', 'patron', 'institutional', 'admin'];

function canPost(tier) {
  return POSTING_TIERS.includes(tier);
}

export default async function forumRoutes(fastify) {
  // List posts with pagination
  fastify.get('/posts', {
    preHandler: optionalAuthenticate,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          sort: { type: 'string', enum: ['newest', 'popular', 'active'], default: 'newest' },
          category: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 20, offset = 0, sort = 'newest', category } = request.query;

    let orderBy = 'p.created_at DESC';
    if (sort === 'popular') {
      orderBy = '(p.upvotes - p.downvotes) DESC, p.created_at DESC';
    } else if (sort === 'active') {
      orderBy = 'p.last_activity_at DESC';
    }

    const categoryFilter = category ? 'AND p.category = ?' : '';
    const params = category ? [category, limit, offset] : [limit, offset];

    const posts = await queryAll(`
      SELECT
        p.id, p.title, p.content, p.category, p.created_at, p.updated_at,
        p.upvotes, p.downvotes, p.reply_count, p.last_activity_at,
        u.id as author_id, u.name as author_name, u.tier as author_tier
      FROM forum_posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.deleted_at IS NULL AND p.parent_id IS NULL
      ${categoryFilter}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, params);

    // Get total count
    const countParams = category ? [category] : [];
    const countResult = await queryOne(`
      SELECT COUNT(*) as total FROM forum_posts
      WHERE deleted_at IS NULL AND parent_id IS NULL
      ${categoryFilter}
    `, countParams);

    return {
      posts,
      total: countResult?.total || 0,
      limit,
      offset
    };
  });

  // Get single post with replies (threaded)
  fastify.get('/posts/:id', {
    preHandler: optionalAuthenticate
  }, async (request) => {
    const { id } = request.params;

    const post = await queryOne(`
      SELECT
        p.id, p.title, p.content, p.category, p.created_at, p.updated_at,
        p.upvotes, p.downvotes, p.reply_count, p.last_activity_at,
        u.id as author_id, u.name as author_name, u.tier as author_tier
      FROM forum_posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `, [id]);

    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    // Get all replies (flat list - UI will handle threading)
    const replies = await queryAll(`
      SELECT
        r.id, r.content, r.parent_id, r.root_post_id, r.created_at, r.updated_at,
        r.upvotes, r.downvotes, r.reply_count, r.depth,
        u.id as author_id, u.name as author_name, u.tier as author_tier
      FROM forum_posts r
      LEFT JOIN users u ON r.author_id = u.id
      WHERE r.root_post_id = ? AND r.id != ? AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
    `, [id, id]);

    // Get user's votes if authenticated
    let userVotes = {};
    if (request.user?.sub) {
      const votes = await queryAll(`
        SELECT post_id, vote FROM forum_votes
        WHERE user_id = ? AND post_id IN (?, ${replies.map(() => '?').join(', ')})
      `, [request.user.sub, id, ...replies.map(r => r.id)]);

      for (const v of votes) {
        userVotes[v.post_id] = v.vote;
      }
    }

    return { post, replies, userVotes };
  });

  // Create a new post
  fastify.post('/posts', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          content: { type: 'string', minLength: 10, maxLength: 10000 },
          category: { type: 'string', maxLength: 50 }
        }
      }
    }
  }, async (request) => {
    const { title, content, category = 'general' } = request.body;

    // Check user tier
    const user = await queryOne('SELECT tier FROM users WHERE id = ?', [request.user.sub]);
    if (!user || !canPost(user.tier)) {
      throw ApiError.forbidden('You must be a verified user to create posts');
    }

    const now = new Date().toISOString();
    const result = await query(`
      INSERT INTO forum_posts (
        title, content, category, author_id, root_post_id,
        created_at, updated_at, last_activity_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
    `, [title, content, category, request.user.sub, now, now, now]);

    // Update root_post_id to point to itself for top-level posts
    const postId = Number(result.lastInsertRowid);
    await query('UPDATE forum_posts SET root_post_id = ? WHERE id = ?', [postId, postId]);

    const post = await queryOne(`
      SELECT
        p.id, p.title, p.content, p.category, p.created_at,
        p.upvotes, p.downvotes, p.reply_count,
        u.id as author_id, u.name as author_name, u.tier as author_tier
      FROM forum_posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = ?
    `, [postId]);

    return { post };
  });

  // Reply to a post
  fastify.post('/posts/:id/reply', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 10000 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { content } = request.body;

    // Check user tier
    const user = await queryOne('SELECT tier FROM users WHERE id = ?', [request.user.sub]);
    if (!user || !canPost(user.tier)) {
      throw ApiError.forbidden('You must be a verified user to reply');
    }

    // Get parent post
    const parent = await queryOne(`
      SELECT id, root_post_id, depth FROM forum_posts
      WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    if (!parent) {
      throw ApiError.notFound('Post not found');
    }

    const now = new Date().toISOString();
    const rootPostId = parent.root_post_id || parent.id;
    const depth = (parent.depth || 0) + 1;

    const result = await query(`
      INSERT INTO forum_posts (
        content, author_id, parent_id, root_post_id, depth,
        created_at, updated_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [content, request.user.sub, id, rootPostId, depth, now, now, now]);

    const replyId = Number(result.lastInsertRowid);

    // Update parent's reply count
    await query(`
      UPDATE forum_posts SET
        reply_count = reply_count + 1,
        last_activity_at = ?
      WHERE id = ?
    `, [now, id]);

    // Update root post's activity
    if (rootPostId !== id) {
      await query(`
        UPDATE forum_posts SET
          reply_count = reply_count + 1,
          last_activity_at = ?
        WHERE id = ?
      `, [now, rootPostId]);
    }

    const reply = await queryOne(`
      SELECT
        r.id, r.content, r.parent_id, r.root_post_id, r.created_at, r.depth,
        r.upvotes, r.downvotes,
        u.id as author_id, u.name as author_name, u.tier as author_tier
      FROM forum_posts r
      LEFT JOIN users u ON r.author_id = u.id
      WHERE r.id = ?
    `, [replyId]);

    return { reply };
  });

  // Update a post
  fastify.put('/posts/:id', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          content: { type: 'string', minLength: 1, maxLength: 10000 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { title, content } = request.body;

    const post = await queryOne(`
      SELECT author_id, parent_id FROM forum_posts
      WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    // Check ownership or admin
    const user = await queryOne('SELECT tier FROM users WHERE id = ?', [request.user.sub]);
    if (post.author_id !== request.user.sub && user?.tier !== 'admin') {
      throw ApiError.forbidden('You can only edit your own posts');
    }

    const updates = [];
    const values = [];

    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }

    // Only allow title update for top-level posts
    if (title !== undefined && !post.parent_id) {
      updates.push('title = ?');
      values.push(title);
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await query(`
      UPDATE forum_posts SET ${updates.join(', ')} WHERE id = ?
    `, values);

    const updated = await queryOne(`
      SELECT
        p.id, p.title, p.content, p.created_at, p.updated_at,
        u.id as author_id, u.name as author_name
      FROM forum_posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = ?
    `, [id]);

    return { post: updated };
  });

  // Delete a post (soft delete)
  fastify.delete('/posts/:id', {
    preHandler: authenticate
  }, async (request) => {
    const { id } = request.params;

    const post = await queryOne(`
      SELECT author_id FROM forum_posts WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    // Check ownership or admin
    const user = await queryOne('SELECT tier FROM users WHERE id = ?', [request.user.sub]);
    if (post.author_id !== request.user.sub && user?.tier !== 'admin') {
      throw ApiError.forbidden('You can only delete your own posts');
    }

    await query(`
      UPDATE forum_posts SET deleted_at = ? WHERE id = ?
    `, [new Date().toISOString(), id]);

    return { success: true };
  });

  // Vote on a post
  fastify.post('/posts/:id/vote', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['vote'],
        properties: {
          vote: { type: 'integer', enum: [-1, 0, 1] }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { vote } = request.body;

    const post = await queryOne(`
      SELECT id, upvotes, downvotes FROM forum_posts
      WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    // Get existing vote
    const existingVote = await queryOne(`
      SELECT vote FROM forum_votes WHERE user_id = ? AND post_id = ?
    `, [request.user.sub, id]);

    const oldVote = existingVote?.vote || 0;

    if (vote === 0) {
      // Remove vote
      await query('DELETE FROM forum_votes WHERE user_id = ? AND post_id = ?',
        [request.user.sub, id]);
    } else {
      // Upsert vote
      await query(`
        INSERT INTO forum_votes (user_id, post_id, vote, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, post_id) DO UPDATE SET vote = ?, created_at = ?
      `, [request.user.sub, id, vote, new Date().toISOString(), vote, new Date().toISOString()]);
    }

    // Update vote counts
    let upvoteDelta = 0;
    let downvoteDelta = 0;

    if (oldVote === 1) upvoteDelta--;
    if (oldVote === -1) downvoteDelta--;
    if (vote === 1) upvoteDelta++;
    if (vote === -1) downvoteDelta++;

    await query(`
      UPDATE forum_posts SET
        upvotes = upvotes + ?,
        downvotes = downvotes + ?
      WHERE id = ?
    `, [upvoteDelta, downvoteDelta, id]);

    const updated = await queryOne(`
      SELECT upvotes, downvotes FROM forum_posts WHERE id = ?
    `, [id]);

    return {
      upvotes: updated.upvotes,
      downvotes: updated.downvotes,
      userVote: vote
    };
  });

  // Get categories
  fastify.get('/categories', async () => {
    const categories = await queryAll(`
      SELECT category, COUNT(*) as post_count
      FROM forum_posts
      WHERE deleted_at IS NULL AND parent_id IS NULL
      GROUP BY category
      ORDER BY post_count DESC
    `);

    return { categories };
  });
}
