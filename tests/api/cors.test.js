/**
 * CORS Configuration Tests
 *
 * Ensures CORS is properly configured to allow:
 * - Expected HTTP methods (GET, POST, PUT, PATCH, DELETE, OPTIONS)
 * - Expected headers for API authentication
 * - Expected origins (production, preview domains)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('CORS Configuration', () => {
  let server;

  beforeAll(async () => {
    // Set required env vars for server
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com,https://api.siftersearch.com,http://localhost:5173';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';

    // Import and create server
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Allowed Methods', () => {
    const requiredMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    it.each(requiredMethods)('should allow %s method in preflight', async (method) => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/library/documents/test-doc',
        headers: {
          'Origin': 'https://siftersearch.com',
          'Access-Control-Request-Method': method
        }
      });

      const allowedMethods = response.headers['access-control-allow-methods'];
      expect(allowedMethods).toBeDefined();
      expect(allowedMethods).toContain(method);
    });

    it('should include all required methods in preflight response', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/library/documents/test-doc',
        headers: {
          'Origin': 'https://siftersearch.com',
          'Access-Control-Request-Method': 'PUT'
        }
      });

      const allowedMethods = response.headers['access-control-allow-methods'];
      expect(allowedMethods).toBeDefined();

      requiredMethods.forEach(method => {
        expect(allowedMethods).toContain(method);
      });
    });
  });

  describe('Allowed Headers', () => {
    const requiredHeaders = [
      'Content-Type',
      'Authorization',
      'X-Internal-Key',
      'X-API-Key',
      'X-Requested-With',
      'X-User-Id'
    ];

    it('should include all required headers in preflight response', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/library/documents/test-doc',
        headers: {
          'Origin': 'https://siftersearch.com',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'Content-Type, X-Internal-Key'
        }
      });

      const allowedHeaders = response.headers['access-control-allow-headers'];
      expect(allowedHeaders).toBeDefined();

      requiredHeaders.forEach(header => {
        expect(allowedHeaders.toLowerCase()).toContain(header.toLowerCase());
      });
    });
  });

  describe('Allowed Origins', () => {
    it('should allow requests from production origin', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'https://siftersearch.com'
        }
      });

      expect(response.headers['access-control-allow-origin']).toBe('https://siftersearch.com');
    });

    it('should allow requests from localhost development', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'http://localhost:5173'
        }
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should allow requests from Cloudflare Pages preview domains', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'https://abc123.siftersearch.pages.dev'
        }
      });

      expect(response.headers['access-control-allow-origin']).toBe('https://abc123.siftersearch.pages.dev');
    });

    it('should reject requests from unauthorized origins', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      });

      // CORS rejection should return an error or no allow-origin header
      const allowOrigin = response.headers['access-control-allow-origin'];
      expect(allowOrigin).not.toBe('https://malicious-site.com');
    });

    it('should allow requests with no origin (server-to-server)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
        // No Origin header - simulates server-to-server requests
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Credentials', () => {
    it('should allow credentials in CORS response', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'https://siftersearch.com'
        }
      });

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Admin Endpoints', () => {
    it('should allow PUT to document update endpoint (CORS)', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/library/documents/doc_test123',
        headers: {
          'Origin': 'https://siftersearch.com',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });

      expect(response.statusCode).toBeLessThan(400);
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
    });

    it('should allow PUT to raw document update endpoint (CORS)', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/library/documents/doc_test123/raw',
        headers: {
          'Origin': 'https://siftersearch.com',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'Content-Type, X-Internal-Key'
        }
      });

      expect(response.statusCode).toBeLessThan(400);
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
    });
  });
});
