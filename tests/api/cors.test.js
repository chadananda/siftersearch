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
  }, 30000); // Server startup can be slow

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
      'X-User-Id',
      'X-Client-Version',
      'X-Request-Id'
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

    // POLICY CHANGED 2026-08-28. This test previously asserted that an unknown origin gets NO
    // access-control-allow-origin — i.e. the origin allowlist was the boundary. It no longer is, by decision:
    // the public API is authenticated by its KEY, and an origin allowlist never protected it anyway (curl and
    // any server-side client send no Origin and bypass CORS entirely). It only blocked legitimate browser
    // consumers, while the rejection path returned a 500 that read as a dead tunnel for a day.
    // What replaces it, asserted here: the origin is allowed to SPEAK to us, but gets no ambient credentials,
    // and gets nothing from the API without a key (covered in the suite below).
    it('lets an unknown origin reach us, but WITHOUT credentials', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'GET'
        }
      });

      expect(response.headers['access-control-allow-origin']).toBe('https://malicious-site.com');
      // THE ACTUAL GUARANTEE: no cookies are ever offered to an origin we do not trust.
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
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

/**
 * THIRD-PARTY ORIGIN ACCESS (2026-08-28).
 *
 * A disallowed origin used to be rejected with `callback(new Error('Not allowed by CORS'))`, which
 * @fastify/cors turns into a 500. Every third-party browser caller of the documented public API got
 * "Internal Server Error" with no Access-Control-Allow-Origin — indistinguishable, from a browser, from the
 * origin being unreachable, and duly diagnosed as a dead Cloudflare tunnel. The same request without an
 * Origin header returned 200 the whole time.
 *
 * The rule now: origin is not the boundary, the KEY is.
 */
describe('Third-party origin access to the public API', () => {
  let server;
  const THIRD_PARTY = 'https://some-other-site.example';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com,http://localhost:5173';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
  }, 30000);

  afterAll(async () => { if (server) await server.close(); });

  it('NEVER answers a disallowed origin with a 500 — the bug that read as an outage', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/search',
      headers: { Origin: THIRD_PARTY, 'Content-Type': 'application/json' },
      payload: { query: 'justice' },
    });
    expect(res.statusCode).not.toBe(500);
  });

  it('allows the preflight from any origin — it carries no key and must not be blocked', async () => {
    const res = await server.inject({
      method: 'OPTIONS', url: '/api/v1/search',
      headers: {
        Origin: THIRD_PARTY,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-api-key',
      },
    });
    expect(res.statusCode).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('rejects a cross-origin API call with NO key as 401, not 500 — and keeps the CORS header on the 401', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/search',
      headers: { Origin: THIRD_PARTY, 'Content-Type': 'application/json' },
      payload: { query: 'justice' },
    });
    expect(res.statusCode).toBe(401);
    // Without this header the browser cannot read the 401 and it looks like a network failure again.
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('does NOT offer credentials to a third-party origin (browsers forbid cookies + reflected origin)', async () => {
    const res = await server.inject({
      method: 'OPTIONS', url: '/api/v1/search',
      headers: { Origin: THIRD_PARTY, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('keeps credentials for our OWN origin, so the site session is untouched', async () => {
    const res = await server.inject({
      method: 'OPTIONS', url: '/api/v1/search',
      headers: { Origin: 'https://siftersearch.com', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // /api/v1/search requires a key for EVERYONE by its own route auth, so it cannot show this. Use an open
  // route: the point is that the cross-origin key hook adds no new 401 for our own pages, which authenticate
  // by session cookie. (Checked on the API surface, since the hook only guards /api/.)
  it('adds no key requirement for our OWN origin — the site authenticates by cookie', async () => {
    const res = await server.inject({
      method: 'GET', url: '/api/v1/health',
      headers: { Origin: 'https://siftersearch.com' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('DOES demand a key for the same open route cross-origin — this is the new boundary', async () => {
    const res = await server.inject({
      method: 'GET', url: '/api/v1/health',
      headers: { Origin: THIRD_PARTY },
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not demand a key from a non-browser caller (no Origin header at all)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
  });
});
