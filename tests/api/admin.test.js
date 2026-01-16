/**
 * Admin Routes Tests
 *
 * Tests for admin API endpoints authentication requirements.
 * These tests verify that all admin endpoints properly require authentication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Admin API Authentication Requirements', () => {
  let server;

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
  }, 30000); // Server startup can be slow

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Admin Stats Endpoints (require admin tier)
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/stats', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/stats'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/analytics'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // User Management Endpoints (require admin tier)
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/users'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/pending', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/pending'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /api/admin/users/:id', () => {
    it('should return 400 or 401 without proper auth', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/api/admin/users/test_user_id',
        payload: { tier: 'researcher' }
      });

      // May return 400 (validation) or 401 (auth required)
      expect([400, 401]).toContain(response.statusCode);
    });
  });

  describe('POST /api/admin/approve/:id', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/admin/approve/test_user_id'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/admin/ban/:id', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/admin/ban/test_user_id'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Index Management Endpoints
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/admin/index', () => {
    it('should return 400 or 401 without proper auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/admin/index',
        payload: { text: 'test content' }
      });

      // May return 400 (validation) or 401 (auth required)
      expect([400, 401]).toContain(response.statusCode);
    });
  });

  describe('DELETE /api/admin/index/:id', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/admin/index/test_doc_id'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/index/status', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/index/status'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Server Management Endpoints (require internal key)
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/server/status', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/status'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/server/tables', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/tables'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/server/indexes', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/indexes'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/server/tasks', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/tasks'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Document File Path Endpoint
  // ─────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/admin/server/documents/:id/file-path', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/admin/server/documents/test_doc_id/file-path',
        payload: { filePath: 'test/path.md' }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Job Queue Endpoints
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/server/job-queue', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/job-queue'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AI Usage Endpoints
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/ai-usage/summary', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/ai-usage/summary'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/ai-usage/recent', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/ai-usage/recent'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/ai-usage/stats', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/ai-usage/stats'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sync and Watcher Endpoints
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/server/sync/status', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/sync/status'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/server/watcher/status', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/watcher/status'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Query Documents Endpoint
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/admin/server/query-documents', () => {
    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/query-documents'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/admin/server/file-path-stats', () => {
    it('should require internal key', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/admin/server/file-path-stats'
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin Response Formats
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin API Response Formats', () => {
  let server;

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
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('should return proper error format for 401', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/stats'
    });

    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('statusCode', 401);
  });

  it('should return JSON content type for errors', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/stats'
    });

    expect(response.headers['content-type']).toContain('application/json');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal Key Rejection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Internal Key Rejection', () => {
  let server;

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
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('should reject invalid internal key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/server/status',
      headers: {
        'X-Internal-Key': 'wrong-key'
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject missing internal key', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/server/status'
    });

    expect(response.statusCode).toBe(401);
  });
});
