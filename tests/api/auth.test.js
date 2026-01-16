/**
 * Auth API Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Auth API', () => {
  describe('Password Hashing', () => {
    it('should hash and verify passwords', async () => {
      // Import dynamically to allow for mocking
      const { hashPassword, verifyPassword } = await import('../../api/lib/auth.js');

      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('wrongPassword', hash)).toBe(false);
    }, 30000); // argon2 hashing can be slow on first run
  });

  describe('JWT Tokens', () => {
    it('should create and verify access tokens', async () => {
      // Set required env vars for test
      process.env.JWT_ACCESS_SECRET = 'test-secret-key-for-testing';

      const { createAccessToken, verifyAccessToken } = await import('../../api/lib/auth.js');

      const user = { id: 1, email: 'test@example.com', tier: 'verified' };
      const token = createAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const payload = verifyAccessToken(token);
      expect(payload).toBeDefined();
      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe(user.email);
      expect(payload.tier).toBe(user.tier);
    });

    it('should reject invalid tokens', async () => {
      const { verifyAccessToken } = await import('../../api/lib/auth.js');

      const payload = verifyAccessToken('invalid-token');
      expect(payload).toBeNull();
    });
  });
});

describe('ApiError', () => {
  it('should create proper error objects', async () => {
    const { ApiError } = await import('../../api/lib/errors.js');

    const badRequest = ApiError.badRequest('Invalid input', { field: 'email' });
    expect(badRequest.statusCode).toBe(400);
    expect(badRequest.message).toBe('Invalid input');
    expect(badRequest.details).toEqual({ field: 'email' });

    const unauthorized = ApiError.unauthorized();
    expect(unauthorized.statusCode).toBe(401);

    const notFound = ApiError.notFound('User not found');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.message).toBe('User not found');
  });
});
