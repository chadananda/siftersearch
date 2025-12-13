/**
 * Authentication Routes
 * POST /api/auth/signup - Create account
 * POST /api/auth/login - Login and get tokens
 * POST /api/auth/refresh - Refresh access token
 * POST /api/auth/logout - Revoke refresh token
 * GET /api/auth/me - Get current user
 */

import { query, queryOne } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  authenticate
} from '../lib/auth.js';
import { getAnonymousUserId, unifyUserId } from '../lib/anonymous.js';
import { MemoryAgent } from '../agents/agent-memory.js';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth'
};

export default async function authRoutes(fastify) {
  // Signup
  fastify.post('/signup', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, name } = request.body;

    // Check if email exists
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      throw ApiError.badRequest('Email already registered');
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await query(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id',
      [email.toLowerCase(), passwordHash, name || null]
    );

    const userId = result.rows[0].id;
    const user = await queryOne('SELECT id, email, name, tier, created_at FROM users WHERE id = ?', [userId]);

    // Unify anonymous user data with new authenticated account
    const anonymousUserId = getAnonymousUserId(request);
    if (anonymousUserId) {
      try {
        // Unify anonymous_users table
        await unifyUserId(anonymousUserId, userId);

        // Unify conversation memories
        const memory = new MemoryAgent();
        await memory.unifyMemories(anonymousUserId, userId.toString());

        logger.info({ anonymousUserId, userId }, 'Unified anonymous user with new account');
      } catch (unifyErr) {
        logger.warn({ unifyErr, anonymousUserId, userId }, 'Failed to unify anonymous user, continuing');
      }
    }

    // Generate tokens
    const accessToken = createAccessToken(user);
    const refresh = await createRefreshToken(userId);

    reply
      .setCookie(REFRESH_COOKIE, refresh.id, {
        ...COOKIE_OPTIONS,
        expires: refresh.expiresAt
      })
      .status(201)
      .send({ user, accessToken });
  });

  // Login
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body;

    const user = await queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (user.tier === 'banned') {
      throw ApiError.forbidden('Account suspended');
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Unify anonymous user data with existing account (on login from new device)
    const anonymousUserId = getAnonymousUserId(request);
    if (anonymousUserId) {
      try {
        // Unify anonymous_users table
        await unifyUserId(anonymousUserId, user.id);

        // Unify conversation memories
        const memoryAgent = new MemoryAgent();
        await memoryAgent.unifyMemories(anonymousUserId, user.id.toString());

        logger.info({ anonymousUserId, userId: user.id }, 'Unified anonymous user on login');
      } catch (unifyErr) {
        logger.warn({ unifyErr, anonymousUserId, userId: user.id }, 'Failed to unify anonymous user on login');
      }
    }

    // Generate tokens
    const accessToken = createAccessToken(user);
    const refresh = await createRefreshToken(user.id);

    // Remove sensitive data
    const { password_hash, ...safeUser } = user;

    reply
      .setCookie(REFRESH_COOKIE, refresh.id, {
        ...COOKIE_OPTIONS,
        expires: refresh.expiresAt
      })
      .send({ user: safeUser, accessToken });
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    const tokenId = request.cookies[REFRESH_COOKIE];
    if (!tokenId) {
      throw ApiError.unauthorized('No refresh token');
    }

    const token = await verifyRefreshToken(tokenId);
    if (!token) {
      reply.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [token.user_id]);
    if (!user || user.tier === 'banned') {
      reply.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
      throw ApiError.unauthorized('Account not found or suspended');
    }

    // Rotate refresh token
    await revokeRefreshToken(tokenId);
    const newRefresh = await createRefreshToken(user.id);
    const accessToken = createAccessToken(user);

    reply
      .setCookie(REFRESH_COOKIE, newRefresh.id, {
        ...COOKIE_OPTIONS,
        expires: newRefresh.expiresAt
      })
      .send({ accessToken });
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const tokenId = request.cookies[REFRESH_COOKIE];
    if (tokenId) {
      await revokeRefreshToken(tokenId);
    }

    reply
      .clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS)
      .send({ success: true });
  });

  // Get current user
  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    const user = await queryOne(
      'SELECT id, email, name, tier, preferred_language, created_at, approved_at FROM users WHERE id = ?',
      [request.user.sub]
    );

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    return { user };
  });
}
