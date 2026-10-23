// The server enforces the copyright preview (Chad 10-23: "the first 40 paragraphs is all we do"): an encumbered book's
// by-path, documents/:id, bilingual and segments endpoints never return paragraph 41+ to a reader (anonymous or signed in);
// admins and editors read in full (never shared-cached); downloads refuse. Real in-memory SQLite behind the db layer.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

const db = new Database(':memory:');
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params = []) => db.prepare(sql).run(...params)),
  queryAll: vi.fn(async (sql, params = []) => db.prepare(sql).all(...params)),
  queryOne: vi.fn(async (sql, params = []) => db.prepare(sql).get(...params)),
  userQueryOne: vi.fn(async () => null),
}));
vi.mock('../../api/lib/auth.js', async (orig) => {
  const real = await orig();
  // the test's "signed-in user": x-test-role header → request.user
  const optionalAuthenticate = async (request) => { const r = request.headers['x-test-role']; if (r) request.user = { sub: 1, role: r, tier: r }; };
  return { ...real, optionalAuthenticate };
});

let app;
beforeAll(async () => {
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT, year TEXT,
    description TEXT, file_path TEXT, filename TEXT, paragraph_count INTEGER, source_site TEXT, source_url TEXT, duplicate_of INTEGER, deleted_at TEXT,
    slug TEXT, created_at TEXT, updated_at TEXT, metadata TEXT, cover_url TEXT, encumbered INTEGER DEFAULT 0, purchase_url TEXT)`);
  db.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, heading TEXT, blocktype TEXT,
    translation TEXT, translation_segments TEXT, block_attrs TEXT, context TEXT, language TEXT, deleted_at TEXT)`);
  db.exec('CREATE TABLE document_assets (document_id INTEGER, asset_type TEXT, storage_url TEXT, file_name TEXT, file_size INTEGER, content_type TEXT)');
  const ins = db.prepare(`INSERT INTO docs (id, title, author, religion, collection, language, paragraph_count, slug, encumbered, purchase_url)
    VALUES (?, ?, ?, 'Baha''i', 'Books', 'en', 100, ?, ?, ?)`);
  ins.run(1, 'A Modern Book', 'An Author', 'an-author_a-modern-book', 1, 'https://example.org/buy');
  ins.run(2, 'Gleanings', 'Bahá’u’lláh', 'bahaullah_gleanings', 0, null);
  const p = db.prepare('INSERT INTO content (doc_id, paragraph_index, text, blocktype) VALUES (?, ?, ?, ?)');
  for (const d of [1, 2]) for (let i = 0; i < 100; i++) p.run(d, i, `doc ${d} paragraph ${i}`, 'paragraph');
  app = Fastify();
  const { errorHandler } = await import('../../api/lib/errors.js');
  app.setErrorHandler(errorHandler);
  await app.register((await import('../../api/routes/library.js')).default, { prefix: '/api/library' });
  await app.register((await import('../../api/routes/documents.js')).default, { prefix: '/api/documents' });
  await app.ready();
}, 60_000);
afterAll(async () => { await app?.close(); });

const get = async (url, role) => { const r = await app.inject({ method: 'GET', url, headers: role ? { 'x-test-role': role } : {} }); return { status: r.statusCode, body: r.json(), headers: r.headers }; };
const idx = (paras) => paras.map((p) => p.paragraph_index ?? p.index);

describe('encumbered book: 40 paragraphs, enforced by the server', () => {
  it('by-path: the first 40, then nothing past paragraph 40 (anonymous and signed-in)', async () => {
    const a = await get('/api/library/by-path/bahai/books/an-author_a-modern-book?limit=200');
    expect(a.status).toBe(200);
    expect(a.body.paragraphs).toHaveLength(40);
    expect(Math.max(...idx(a.body.paragraphs))).toBe(39);
    expect(a.body).toMatchObject({ hasMore: false, previewEnded: true, previewLimit: 40 });
    expect(a.body.document.purchase_url).toBe('https://example.org/buy');
    for (const role of [null, 'user', 'patron']) {
      const b = await get('/api/library/by-path/bahai/books/an-author_a-modern-book?limit=50&offset=40', role);
      expect(b.body.paragraphs, String(role)).toEqual([]);
    }
  });
  it('documents/:id, bilingual and segments refuse paragraph 41 onward', async () => {
    const d = await get('/api/library/documents/1?paragraphLimit=1000&paragraphOffset=0');
    expect(d.body.paragraphs).toHaveLength(40);
    expect((await get('/api/library/documents/1?paragraphOffset=40')).body.paragraphs).toEqual([]);
    const b = await get('/api/library/documents/1/bilingual?limit=500');
    expect(b.body.paragraphs).toHaveLength(40);
    expect((await get('/api/library/documents/1/bilingual?offset=40', 'user')).body.paragraphs).toEqual([]);
    const s = await get('/api/documents/1/segments?limit=10000');
    expect(s.body.segments).toHaveLength(40);
    expect((await get('/api/documents/1/segments?offset=40')).body.segments).toEqual([]);
  });
  it('downloads of an encumbered book are refused', async () => {
    expect((await get('/api/documents/1/download?format=txt')).status).toBe(403);
  });
  it('admin override: admins and editors read in full, never shared-cached', async () => {
    for (const role of ['admin', 'editor']) {
      const r = await get('/api/library/by-path/bahai/books/an-author_a-modern-book?limit=50&offset=40', role);
      expect(r.body.paragraphs, role).toHaveLength(50);
      expect(r.headers['cache-control']).toBe('private, no-store');
    }
    expect((await get('/api/library/documents/1?paragraphLimit=100', 'admin')).body.paragraphs).toHaveLength(100);
  });
  it('an unencumbered book is untouched', async () => {
    const r = await get('/api/library/by-path/bahai/books/bahaullah_gleanings?limit=50&offset=40');
    expect(r.body.paragraphs).toHaveLength(50);
    expect(r.body.previewEnded).toBe(false);
    expect((await get('/api/documents/2/segments?limit=10000')).body.segments).toHaveLength(100);
  });
});
