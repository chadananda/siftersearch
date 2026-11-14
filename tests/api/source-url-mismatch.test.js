// Source links bound by title alone to ANOTHER book (backfill-doc-source-urls.mjs; Taherzadeh's "Revelation" volumes → the KJV Apocalypse):
// the source-url-mismatch report finds them with the edge guard's own rule (card-text otherBook); the ops endpoint clears/sets one doc's
// source_url through docs-repo (single writer tag 'docs-repo:set-source-url'), attributed.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

const h = vi.hoisted(() => ({ db: null, tags: [] }));
vi.mock('../../api/lib/db.js', () => {
  const run = (sql, p = [], tag) => { h.tags.push(tag); const st = h.db.prepare(sql); return st.reader ? { rows: st.all(...p) } : { rows: [{ changes: st.run(...p).changes }] }; };
  return { query: async (sql, p, tag) => run(sql, p, tag), queryAll: async (sql, p, tag) => run(sql, p, tag).rows, queryOne: async (sql, p, tag) => run(sql, p, tag).rows[0] || null };
});
vi.mock('../../api/lib/auth.js', async (orig) => ({ ...(await orig()), requireInternal: async (req, reply) => { if (req.headers['x-internal-key'] !== 'k') reply.code(401).send({ error: 'no' }); } }));

const { mismatches, sourceUrlMismatchReport } = await import('../../api/lib/ops/source-url-mismatch.js');
const { REPORTS } = await import('../../api/lib/ops/reports.js');
const repo = await import('../../api/lib/docs-repo.js');

const KJV = 'https://oceanlibrary.com/kjv-apocalypse-saint-john-of-patmos';
const DOCS = [
  { id: 429, title: 'Revelation', author: 'Adib Taherzadeh', source_url: KJV },
  { id: 430, title: 'Revelation', author: 'Adib Taherzadeh', source_url: KJV },
  { id: 432, title: 'Revelation', author: 'Adib Taherzadeh', source_url: KJV },
  // true links that must stay: the KJV's own Apocalypse, Nabíl, the Gleanings
  { id: 500, title: 'The Bible (KJV), The Revelation of Saint John', author: 'King James Bible', source_url: KJV },
  { id: 21308, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', source_url: 'https://oceanlibrary.com/dawn-breakers_nabil/' },
  { id: 3, title: "Gleanings from the Writings of Bahá'u'lláh", author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah' },
];

beforeAll(() => {
  h.db = new Database(':memory:');
  h.db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, source_url TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, synced INTEGER DEFAULT 1, deleted_at TEXT)`);
  const ins = h.db.prepare('INSERT INTO docs (id, title, author, source_url) VALUES (?,?,?,?)');
  for (const d of DOCS) ins.run(d.id, d.title, d.author, d.source_url);
  ins.run(600, 'A Gone Book', 'Nobody', KJV); h.db.prepare("UPDATE docs SET deleted_at = 'x' WHERE id = 600").run();
  ins.run(700, 'Revelation', 'Adib Taherzadeh', 'https://bahai-library.com/taherzadeh_revelation');
  h.db.prepare('INSERT INTO content (doc_id) VALUES (430), (430), (21308)').run();
});

describe('source-url-mismatch report', () => {
  it('flags Taherzadeh 429/430/432 (Revelation → KJV Apocalypse) and keeps the true links', () => {
    expect(mismatches(DOCS)).toEqual([429, 430, 432].map((id) => ({ id, title: 'Revelation', author: 'Adib Taherzadeh', source_url: KJV, slug: 'kjv-apocalypse-saint-john-of-patmos' })));
  });
  it('the registered report reads live OceanLibrary-linked docs through docs-repo (deleted and other hosts skipped)', async () => {
    const r = await REPORTS['source-url-mismatch']({});
    expect(r.checked).toBe(6);
    expect(r.hits.map((x) => x.id)).toEqual([429, 430, 432]);
    expect(r.by_slug).toEqual([{ slug: 'kjv-apocalypse-saint-john-of-patmos', n: 3 }]);
    expect(h.tags).toContain('docs-repo:ocean-linked');
  });
  it('pages by id until a short page', async () => {
    const pages = [Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, title: 'Revelation', author: 'Adib Taherzadeh', source_url: KJV })), [{ id: 2001, ...DOCS[4] }]];
    const seen = [];
    const r = await sourceUrlMismatchReport({ limit: 5 }, { read: async ({ afterId }) => { seen.push(afterId); return pages.shift() || []; } });
    expect(seen).toEqual([0, 2000]);
    expect([r.checked, r.total, r.hits.length]).toEqual([2001, 2000, 5]);
  });
});

describe('POST /api/admin/ops/docs/:id/source-url', () => {
  let app;
  beforeAll(async () => {
    app = Fastify();
    const routes = (await import('../../api/routes/ops-reports.js')).default;
    await app.register(routes, { prefix: '/api/admin' });
    await app.ready();
  });
  afterAll(async () => app?.close());
  const post = (id, body, key = 'k') => app.inject({ method: 'POST', url: `/api/admin/ops/docs/${id}/source-url`, headers: { 'x-internal-key': key }, payload: body });

  it('clears one doc\'s link through docs-repo, attributed, and re-syncs its paragraphs', async () => {
    h.tags = [];
    const r = await post(430, { source_url: null, by: 'anis-r8', reason: 'slug names the KJV Apocalypse' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, doc_id: 430, before: KJV, after: null, by: 'anis-r8', reason: 'slug names the KJV Apocalypse' });
    expect(h.db.prepare('SELECT source_url FROM docs WHERE id = 430').get().source_url).toBeNull();
    expect(h.db.prepare('SELECT COUNT(*) n FROM content WHERE doc_id = 430 AND synced = 0').get().n).toBe(2);
    expect(h.db.prepare('SELECT COUNT(*) n FROM content WHERE doc_id = 21308 AND synced = 0').get().n).toBe(0);
    expect(h.tags).toContain('docs-repo:set-source-url');
    expect(h.db.prepare('SELECT source_url FROM docs WHERE id = 429').get().source_url).toBe(KJV);   // one doc, never a batch
  });
  it('sets a new https link', async () => {
    const url = 'https://oceanlibrary.com/revelation-of-bahaullah-taherzadeh';
    expect((await post(432, { source_url: url, by: 'anis-r8' })).json()).toMatchObject({ before: KJV, after: url });
  });
  it('refuses: no key, no by, no source_url field, a non-https URL, a deleted or missing doc', async () => {
    expect((await post(429, { source_url: null, by: 'x' }, 'wrong')).statusCode).toBe(401);
    expect((await post(429, { source_url: null })).statusCode).toBe(400);
    expect((await post(429, { by: 'x' })).statusCode).toBe(400);
    expect((await post(429, { source_url: 'http://x.org/a', by: 'x' })).statusCode).toBe(400);
    expect((await post(600, { source_url: null, by: 'x' })).statusCode).toBe(404);
    expect((await post(99999, { source_url: null, by: 'x' })).statusCode).toBe(404);
    expect(h.db.prepare('SELECT source_url FROM docs WHERE id = 429').get().source_url).toBe(KJV);
  });
  it('docs-repo.setDocSourceUrl returns the old value', async () => {
    expect(await repo.setDocSourceUrl(700, '')).toMatchObject({ changed: 1, before: 'https://bahai-library.com/taherzadeh_revelation' });
  });
});
