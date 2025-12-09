/**
 * JWT Authentication Utilities
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { query, queryOne } from './db.js';
import { ApiError } from './errors.js';

const SALT_ROUNDS = 12;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES?.replace('d', '') || '90', 10);

// Password hashing
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// JWT tokens
export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, tier: user.tier },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    return null;
  }
}

// Refresh tokens (stored in DB)
export async function createRefreshToken(userId) {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO refresh_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
    [id, userId, expiresAt.toISOString()]
  );

  return { id, expiresAt };
}

export async function verifyRefreshToken(tokenId) {
  const token = await queryOne(
    'SELECT * FROM refresh_tokens WHERE id = ? AND revoked = 0 AND expires_at > datetime("now")',
    [tokenId]
  );
  return token;
}

export async function revokeRefreshToken(tokenId) {
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [tokenId]);
}

export async function revokeAllUserTokens(userId) {
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
}

// Fastify authentication hook
export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  request.user = payload;
}

// Tier authorization
export function requireTier(...allowedTiers) {
  return async (request, reply) => {
    await authenticate(request, reply);

    if (!allowedTiers.includes(request.user.tier)) {
      throw ApiError.forbidden(`Requires tier: ${allowedTiers.join(' or ')}`);
    }
  };
}
