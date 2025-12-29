/**
 * JWT Authentication Utilities
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { query, queryOne } from './db.js';
import { ApiError } from './errors.js';

const SALT_ROUNDS = 12;
// Extended token lifetime for persistent login (not a banking app)
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '7d';
const REFRESH_EXPIRES_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES?.replace('d', '') || '90', 10);

// Test mode users for BDD testing (only in development)
const TEST_MODE = process.env.DEV_MODE === 'true' || process.env.NODE_ENV === 'development';
const TEST_USERS = {
  'test_admin_token': { sub: 'user_admin', email: 'admin@test.com', tier: 'admin' },
  'test_approved_token': { sub: 'user_approved', email: 'approved@test.com', tier: 'approved' },
  'test_patron_token': { sub: 'user_patron', email: 'patron@test.com', tier: 'patron' },
  'test_verified_token': { sub: 'user_verified', email: 'verified@test.com', tier: 'verified' },
  'test_user_token': { sub: 'user_test', email: 'test@test.com', tier: 'verified' },
  'test_user123_token': { sub: 'user123', email: 'user123@test.com', tier: 'approved' }
};

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

// Grace period in seconds for recently revoked tokens (handles navigation race condition)
const REVOKE_GRACE_PERIOD_SECONDS = 30;

export async function verifyRefreshToken(tokenId) {
  const now = new Date().toISOString();

  // First check for valid non-revoked token
  let token = await queryOne(
    'SELECT * FROM refresh_tokens WHERE id = ? AND revoked = 0 AND expires_at > ?',
    [tokenId, now]
  );

  // If not found, check for recently revoked token (grace period for navigation race condition)
  // This handles the case where token was rotated but browser sent old cookie during navigation
  if (!token) {
    // Calculate the cutoff time (now - grace period) in ISO format
    const cutoffTime = new Date(Date.now() - REVOKE_GRACE_PERIOD_SECONDS * 1000).toISOString();
    token = await queryOne(
      `SELECT * FROM refresh_tokens
       WHERE id = ?
       AND revoked = 1
       AND revoked_at IS NOT NULL
       AND expires_at > ?
       AND revoked_at > ?`,
      [tokenId, now, cutoffTime]
    );
  }

  return token;
}

export async function revokeRefreshToken(tokenId) {
  const now = new Date().toISOString();
  await query(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE id = ?',
    [now, tokenId]
  );
}

export async function revokeAllUserTokens(userId) {
  const now = new Date().toISOString();
  await query(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE user_id = ?',
    [now, userId]
  );
}

// Fastify authentication hook
export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  // Test mode: accept test tokens in development
  if (TEST_MODE && TEST_USERS[token]) {
    request.user = TEST_USERS[token];
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  request.user = payload;
}

/**
 * Optional authentication - sets request.user if token is valid, but doesn't fail if missing.
 * Used for routes that work for both authenticated and anonymous users.
 */
export async function optionalAuthenticate(request, _reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return; // No auth header, continue as anonymous
  }

  const token = authHeader.slice(7);

  // Test mode: accept test tokens in development
  if (TEST_MODE && TEST_USERS[token]) {
    request.user = { ...TEST_USERS[token], search_count: 0 };
    return;
  }

  const payload = verifyAccessToken(token);

  if (payload) {
    // Fetch full user data including search_count
    const user = await queryOne(
      'SELECT id, email, tier, search_count FROM users WHERE id = ?',
      [payload.sub]
    );
    if (user) {
      request.user = {
        ...payload,
        search_count: user.search_count || 0
      };
    }
  }
  // If token is invalid, just continue as anonymous (don't throw)
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

// Require admin tier
export async function requireAdmin(request, reply) {
  await authenticate(request, reply);

  if (request.user.tier !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }
}

// Alias for authenticated route protection
export const requireAuth = authenticate;

/**
 * Internal API key authentication for server-to-server operations.
 * Checks for X-Internal-Key header (using DEPLOY_SECRET), falls back to admin JWT.
 * Use this for endpoints that need to be called by deploy scripts or other servers.
 */
export async function requireInternal(request, reply) {
  const internalKey = request.headers['x-internal-key'];
  const expectedKey = process.env.DEPLOY_SECRET;

  // If internal key is configured and matches, allow access
  if (expectedKey && internalKey === expectedKey) {
    request.user = { sub: 'internal', email: 'internal@system', tier: 'admin', internal: true };
    return;
  }

  // Fall back to admin JWT auth
  await requireAdmin(request, reply);
}

// Seed admin user from SITE_ADMIN_EMAIL and SITE_ADMIN_PASS environment variables
export async function seedAdminUser() {
  const adminEmail = process.env.SITE_ADMIN_EMAIL;
  const adminPass = process.env.SITE_ADMIN_PASS;

  if (!adminEmail || !adminPass) {
    return null; // No admin credentials configured
  }

  // Check if admin already exists
  const existing = await queryOne('SELECT id, tier, email_verified FROM users WHERE email = ?', [adminEmail.toLowerCase()]);

  if (existing) {
    // Always sync password hash, tier, and email_verified from env credentials
    const passwordHash = await hashPassword(adminPass);
    await query(
      'UPDATE users SET password_hash = ?, tier = ?, email_verified = 1 WHERE id = ?',
      [passwordHash, 'admin', existing.id]
    );
    return { id: existing.id, email: adminEmail, action: 'updated' };
  }

  // Create admin user (pre-verified since we trust the env credentials)
  const passwordHash = await hashPassword(adminPass);
  const now = new Date().toISOString();
  const result = await query(
    'INSERT INTO users (email, password_hash, name, tier, email_verified, approved_at) VALUES (?, ?, ?, ?, 1, ?) RETURNING id',
    [adminEmail.toLowerCase(), passwordHash, 'Admin', 'admin', now]
  );

  return { id: result.rows[0].id, email: adminEmail, action: 'created' };
}
