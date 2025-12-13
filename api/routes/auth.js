/**
 * Authentication Routes
 * POST /api/auth/signup - Create account (sends verification email)
 * POST /api/auth/verify-email - Verify email with code
 * POST /api/auth/resend-verification - Resend verification code
 * POST /api/auth/login - Login and get tokens
 * POST /api/auth/refresh - Refresh access token
 * POST /api/auth/logout - Revoke refresh token
 * POST /api/auth/forgot-password - Request password reset
 * POST /api/auth/reset-password - Reset password with token
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
import {
  sendVerificationCode,
  verifyCode,
  resendVerificationCode,
  sendPasswordReset,
  verifyResetToken,
  resetPassword
} from '../services/verification.js';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth'
};

export default async function authRoutes(fastify) {
  // Signup - creates unverified account and sends verification code
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
    const existing = await queryOne('SELECT id, email_verified FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      if (!existing.email_verified) {
        // User exists but not verified - resend code
        await resendVerificationCode(email);
        return reply.status(200).send({
          needsVerification: true,
          message: 'Account exists but is not verified. A new verification code has been sent.'
        });
      }
      throw ApiError.badRequest('Email already registered');
    }

    // Create user (unverified)
    const passwordHash = await hashPassword(password);
    const result = await query(
      'INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, ?, ?, 0) RETURNING id',
      [email.toLowerCase(), passwordHash, name || null]
    );

    const userId = result.rows[0].id;

    // Send verification email
    try {
      await sendVerificationCode(email, userId);
    } catch (err) {
      logger.error({ email, error: err.message }, 'Failed to send verification email on signup');
      // Still return success - user can request resend
    }

    logger.info({ userId, email }, 'User registered, verification email sent');

    reply.status(201).send({
      needsVerification: true,
      message: 'Account created. Please check your email for a verification code.',
      email: email.toLowerCase()
    });
  });

  // Verify email with code
  fastify.post('/verify-email', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'code'],
        properties: {
          email: { type: 'string', format: 'email' },
          code: { type: 'string', minLength: 6, maxLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, code } = request.body;

    const result = await verifyCode(email, code);

    if (!result.valid) {
      throw ApiError.badRequest(result.error);
    }

    // Get user and generate tokens
    const user = await queryOne(
      'SELECT id, email, name, tier, created_at FROM users WHERE id = ?',
      [result.userId]
    );

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Unify anonymous user data
    const anonymousUserId = getAnonymousUserId(request);
    if (anonymousUserId) {
      try {
        await unifyUserId(anonymousUserId, user.id);
        const memory = new MemoryAgent();
        await memory.unifyMemories(anonymousUserId, user.id.toString());
        logger.info({ anonymousUserId, userId: user.id }, 'Unified anonymous user after verification');
      } catch (unifyErr) {
        logger.warn({ unifyErr, anonymousUserId, userId: user.id }, 'Failed to unify anonymous user');
      }
    }

    // Generate tokens
    const accessToken = createAccessToken(user);
    const refresh = await createRefreshToken(user.id);

    reply
      .setCookie(REFRESH_COOKIE, refresh.id, {
        ...COOKIE_OPTIONS,
        expires: refresh.expiresAt
      })
      .send({
        success: true,
        message: 'Email verified successfully',
        user,
        accessToken
      });
  });

  // Resend verification code
  fastify.post('/resend-verification', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    const { email } = request.body;

    const result = await resendVerificationCode(email);

    if (!result.success) {
      throw ApiError.tooManyRequests(result.error);
    }

    reply.send({
      success: true,
      message: 'Verification code sent',
      expiresIn: result.expiresIn
    });
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

    // Check if email is verified
    if (!user.email_verified) {
      // Resend verification code
      try {
        await resendVerificationCode(email);
      } catch (err) {
        logger.warn({ email, error: err.message }, 'Failed to resend verification on login');
      }
      return reply.status(403).send({
        needsVerification: true,
        message: 'Please verify your email first. A new verification code has been sent.',
        email: email.toLowerCase()
      });
    }

    // Unify anonymous user data with existing account (on login from new device)
    const anonymousUserId = getAnonymousUserId(request);
    if (anonymousUserId) {
      try {
        await unifyUserId(anonymousUserId, user.id);
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

  // Forgot password - request reset
  fastify.post('/forgot-password', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    const { email } = request.body;

    // Always return success to not reveal if email exists
    await sendPasswordReset(email);

    reply.send({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });
  });

  // Verify reset token (for frontend to check before showing reset form)
  fastify.get('/verify-reset-token', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 64, maxLength: 64 }
        }
      }
    }
  }, async (request, reply) => {
    const { token } = request.query;

    const result = await verifyResetToken(token);

    if (!result.valid) {
      throw ApiError.badRequest(result.error);
    }

    reply.send({
      valid: true,
      email: result.email
    });
  });

  // Reset password with token
  fastify.post('/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 64, maxLength: 64 },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    const { token, password } = request.body;

    const passwordHash = await hashPassword(password);
    const result = await resetPassword(token, passwordHash);

    if (!result.success) {
      throw ApiError.badRequest(result.error);
    }

    reply.send({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });
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
      'SELECT id, email, name, tier, preferred_language, email_verified, created_at, approved_at FROM users WHERE id = ?',
      [request.user.sub]
    );

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    return { user };
  });
}
