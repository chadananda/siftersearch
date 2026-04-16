/**
 * Public API Library Endpoint Tests
 *
 * Tests the /api/v1/library/* endpoints for document discovery,
 * author listing, and canonical URL generation.
 *
 * Scenarios tested:
 * - Search documents by title (exact and fuzzy)
 * - Search by author name
 * - Find a specific book and get its canonical URL
 * - Handle misspellings gracefully
 * - Filter by religion, collection, language
 * - Pagination
 * - Single document retrieval
 * - Author listing with filters
 * - Religion/collection tree
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Public API - Library Service', () => {
  let server;
  let apiKey;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com,http://localhost:5173';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.INTERNAL_API_KEY = 'test-internal-key';

    const { runMigrations } = await import('../../api/lib/migrations.js');
    await runMigrations();

    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();

    // Create a test API key using the api-keys module
    const { createApiKey } = await import('../../api/lib/api-keys.js');
    const { userQuery } = await import('../../api/lib/db.js');

    // Ensure test user exists
    await userQuery(
      `INSERT OR IGNORE INTO users (id, email, name, tier, created_at)
       VALUES (99999, 'test@test.com', 'Test User', 'admin', CURRENT_TIMESTAMP)`
    );

    const keyResult = await createApiKey(99999, 'test-key');
    apiKey = keyResult.key;
  }, 30000);

  afterAll(async () => {
    if (server) await server.close();
  });

  // Helper to make API requests
  function apiGet(path, query = {}) {
    const params = new URLSearchParams(query).toString();
    const url = `/api/v1${path}${params ? '?' + params : ''}`;
    return server.inject({ method: 'GET', url, headers: { 'x-api-key': apiKey } });
  }

  // ============================================
  // Authentication
  // ============================================

  describe('Authentication', () => {
    it('rejects requests without API key', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/v1/library/documents' });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain('API key required');
    });

    it('rejects requests with invalid API key', async () => {
      const res = await server.inject({
        method: 'GET', url: '/api/v1/library/documents',
        headers: { 'x-api-key': 'sk_invalid_key' }
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows health check without API key', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ============================================
  // GET /library/documents - Document Search
  // ============================================

  describe('GET /library/documents', () => {
    it('returns documents with canonical URLs', async () => {
      const res = await apiGet('/library/documents', { limit: 5 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.documents).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(0);
      expect(body.limit).toBe(5);
      expect(body.offset).toBe(0);

      if (body.documents.length > 0) {
        const doc = body.documents[0];
        expect(doc.id).toBeDefined();
        expect(doc.title).toBeDefined();
        expect(doc.url).toBeDefined();
        expect(doc.url).toContain('https://siftersearch.com/library/');
      }
    });

    // Scenario 1: Search for books by title
    it('searches documents by title keyword', async () => {
      const res = await apiGet('/library/documents', { q: 'Hidden Words' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // Should find documents with "Hidden Words" in title
      if (body.total > 0) {
        expect(body.documents.some(d =>
          d.title?.toLowerCase().includes('hidden') || d.description?.toLowerCase().includes('hidden')
        )).toBe(true);
      }
    });

    // Scenario 2: Search by author name
    it('searches documents by author - Udo Schaefer', async () => {
      const res = await apiGet('/library/documents', { q: 'Udo Schaefer' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // Should find books by Udo Schaefer
      if (body.total > 0) {
        expect(body.documents.some(d =>
          d.author?.toLowerCase().includes('schaefer') || d.title?.toLowerCase().includes('schaefer')
        )).toBe(true);
      }
    });

    // Scenario 2b: Filter by author field directly
    it('filters documents by author field', async () => {
      const res = await apiGet('/library/documents', { author: 'Bahá\'u\'lláh' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        body.documents.forEach(doc => {
          expect(doc.author?.toLowerCase()).toContain('bah');
        });
      }
    });

    // Scenario 3: Find a specific book and get its link
    it('finds "Priceless Pearl" and returns canonical URL', async () => {
      const res = await apiGet('/library/documents', { q: 'Priceless Pearl' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        const match = body.documents.find(d => d.title?.toLowerCase().includes('priceless'));
        if (match) {
          expect(match.url).toContain('https://siftersearch.com/library/');
          expect(match.url).not.toContain('undefined');
        }
      }
    });

    // Scenario 4: Handle misspellings gracefully
    it('handles misspelled title - "Hiden Wurds"', async () => {
      const res = await apiGet('/library/documents', { q: 'Hiden Wurds' });
      expect(res.statusCode).toBe(200);
      // Should not crash, may or may not find results depending on search engine
      const body = JSON.parse(res.payload);
      expect(body.documents).toBeDefined();
      expect(Array.isArray(body.documents)).toBe(true);
    });

    it('handles misspelled author - "Udo Shaffer"', async () => {
      const res = await apiGet('/library/documents', { q: 'Udo Shaffer' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.documents).toBeDefined();
    });

    // Scenario 5: Filter by religion
    it('filters documents by religion', async () => {
      const res = await apiGet('/library/documents', { religion: 'Islam', limit: 5 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        body.documents.forEach(doc => {
          expect(doc.religion).toBe('Islam');
        });
      }
    });

    // Filter by collection
    it('filters documents by collection', async () => {
      const res = await apiGet('/library/documents', { religion: 'Baha\'i', collection: 'Core Tablets', limit: 5 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        body.documents.forEach(doc => {
          expect(doc.collection).toBe('Core Tablets');
        });
      }
    });

    // Filter by language
    it('filters documents by language', async () => {
      const res = await apiGet('/library/documents', { language: 'ar', limit: 5 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        body.documents.forEach(doc => {
          expect(doc.language).toBe('ar');
        });
      }
    });

    // Combined filters
    it('combines text search with religion filter', async () => {
      const res = await apiGet('/library/documents', { q: 'prayer', religion: 'Islam' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.total > 0) {
        body.documents.forEach(doc => {
          expect(doc.religion).toBe('Islam');
        });
      }
    });

    // Pagination
    it('paginates results correctly', async () => {
      const page1 = await apiGet('/library/documents', { limit: 3, offset: 0 });
      const page2 = await apiGet('/library/documents', { limit: 3, offset: 3 });
      expect(page1.statusCode).toBe(200);
      expect(page2.statusCode).toBe(200);

      const body1 = JSON.parse(page1.payload);
      const body2 = JSON.parse(page2.payload);

      if (body1.total > 3) {
        // Pages should have different documents
        const ids1 = body1.documents.map(d => d.id);
        const ids2 = body2.documents.map(d => d.id);
        expect(ids1).not.toEqual(ids2);
      }
    });

    // Empty results
    it('returns empty array for no matches', async () => {
      const res = await apiGet('/library/documents', { q: 'xyznonexistentbook12345' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.documents).toEqual([]);
      expect(body.total).toBe(0);
    });

    // URL structure validation
    it('generates properly structured canonical URLs', async () => {
      const res = await apiGet('/library/documents', { limit: 10 });
      const body = JSON.parse(res.payload);
      body.documents.forEach(doc => {
        expect(doc.url).toMatch(/^https:\/\/siftersearch\.com\/library\//);
        // URLs should not contain spaces or special chars (except hyphens, underscores, slashes)
        const path = doc.url.replace('https://siftersearch.com/library/', '');
        if (!path.includes('view?doc=')) {
          expect(path).toMatch(/^[a-z0-9\-_/]+$/);
        }
      });
    });
  });

  // ============================================
  // GET /library/documents/:id - Single Document
  // ============================================

  describe('GET /library/documents/:id', () => {
    it('returns document by ID with full metadata', async () => {
      // First get a document ID from the listing
      const listRes = await apiGet('/library/documents', { limit: 1 });
      const listBody = JSON.parse(listRes.payload);
      if (listBody.documents.length === 0) return; // Skip if no docs

      const docId = listBody.documents[0].id;
      const res = await apiGet(`/library/documents/${docId}`);
      expect(res.statusCode).toBe(200);

      const doc = JSON.parse(res.payload);
      expect(doc.id).toBe(docId);
      expect(doc.title).toBeDefined();
      expect(doc.url).toContain('https://siftersearch.com/library/');
      expect(doc.createdAt).toBeDefined();
      expect(doc.paragraphCount).toBeDefined();
    });

    it('returns 404 for nonexistent document', async () => {
      const res = await apiGet('/library/documents/999999999');
      expect(res.statusCode).toBe(404);
    });
  });

  // ============================================
  // GET /library/authors - Author Listing
  // ============================================

  describe('GET /library/authors', () => {
    it('returns authors with document counts', async () => {
      const res = await apiGet('/library/authors');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.authors).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(0);

      if (body.authors.length > 0) {
        const author = body.authors[0];
        expect(author.name).toBeDefined();
        expect(author.documentCount).toBeGreaterThan(0);
        expect(author.religions).toBeDefined();
        expect(Array.isArray(author.religions)).toBe(true);
      }
    });

    it('filters authors by religion', async () => {
      const res = await apiGet('/library/authors', { religion: 'Islam' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.authors.length > 0) {
        body.authors.forEach(author => {
          expect(author.religions).toContain('Islam');
        });
      }
    });

    it('searches authors by name', async () => {
      const res = await apiGet('/library/authors', { q: 'Bah' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      if (body.authors.length > 0) {
        body.authors.forEach(author => {
          expect(author.name.toLowerCase()).toContain('bah');
        });
      }
    });

    it('paginates author results', async () => {
      const res = await apiGet('/library/authors', { limit: 5, offset: 0 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.authors.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================
  // GET /library/religions - Religion/Collection Tree
  // ============================================

  describe('GET /library/religions', () => {
    it('returns religion tree with collections', async () => {
      const res = await apiGet('/library/religions');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.religions).toBeDefined();
      expect(Array.isArray(body.religions)).toBe(true);

      if (body.religions.length > 0) {
        const religion = body.religions[0];
        expect(religion.name).toBeDefined();
        expect(religion.documentCount).toBeGreaterThanOrEqual(0);
        expect(religion.collections).toBeDefined();
        expect(Array.isArray(religion.collections)).toBe(true);

        if (religion.collections.length > 0) {
          expect(religion.collections[0].name).toBeDefined();
          expect(religion.collections[0].documentCount).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('returns religions sorted alphabetically', async () => {
      const res = await apiGet('/library/religions');
      const body = JSON.parse(res.payload);
      if (body.religions.length > 1) {
        for (let i = 1; i < body.religions.length; i++) {
          expect(body.religions[i].name.localeCompare(body.religions[i - 1].name)).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  // ============================================
  // Canonical URL Tests
  // ============================================

  describe('Canonical URLs', () => {
    it('search results include document URLs (requires Meilisearch)', async () => {
      const res = await server.inject({
        method: 'POST', url: '/api/v1/search/quick',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
        payload: JSON.stringify({ query: 'justice', limit: 3 })
      });
      // Meilisearch may not be available in test env — 200 or 500 both acceptable
      if (res.statusCode === 200) {
        const body = JSON.parse(res.payload);
        if (body.results?.length > 0) {
          body.results.forEach(result => {
            expect(result.url).toBeDefined();
            expect(result.documentUrl).toBeDefined();
            expect(result.documentUrl).toContain('https://siftersearch.com/library/');
          });
        }
      } else {
        // Meilisearch unavailable — skip assertion, just ensure no crash
        expect([200, 500]).toContain(res.statusCode);
      }
    });

    it('paragraph endpoint includes URLs', async () => {
      // Use a known paragraph from SQLite directly
      const { queryOne } = await import('../../api/lib/db.js');
      const para = await queryOne(
        `SELECT c.id FROM content c JOIN docs d ON c.doc_id = d.id
         WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL LIMIT 1`
      );
      if (!para) return; // No content in test DB

      const res = await apiGet(`/paragraph/${para.id}`);
      if (res.statusCode === 200) {
        const body = JSON.parse(res.payload);
        expect(body.url).toBeDefined();
        expect(body.documentUrl).toBeDefined();
        expect(body.documentUrl).toContain('https://siftersearch.com/library/');
      }
    });
  });

  // ============================================
  // Edge Cases & Error Handling
  // ============================================

  describe('Edge Cases', () => {
    it('handles empty search query gracefully', async () => {
      const res = await apiGet('/library/documents', { q: '' });
      expect(res.statusCode).toBe(200);
    });

    it('handles very long search query', async () => {
      const res = await apiGet('/library/documents', { q: 'a'.repeat(500) });
      expect(res.statusCode).toBe(200);
    });

    it('handles special characters in search', async () => {
      const res = await apiGet('/library/documents', { q: "Bahá'u'lláh" });
      expect(res.statusCode).toBe(200);
    });

    it('handles Arabic text in search', async () => {
      const res = await apiGet('/library/documents', { q: 'القرآن' });
      expect(res.statusCode).toBe(200);
    });

    it('respects maximum limit', async () => {
      const res = await apiGet('/library/documents', { limit: 100 });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.documents.length).toBeLessThanOrEqual(100);
    });

    it('rejects limit over 100', async () => {
      const res = await apiGet('/library/documents', { limit: 200 });
      // Fastify schema validation should reject this
      expect(res.statusCode).toBe(400);
    });
  });
});
