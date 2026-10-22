// 10-21: a 116-page walk of GET /api/admin/docs?scope=canonicalWithProse&religion=Baha'i recounted the whole scope (a prose
// EXISTS per document) on EVERY page and OFFSET re-walked every skipped document — 1–2 s per page on the search API's main
// thread. The total now comes with the first page only and the route takes a keyset cursor (?afterId=, next_after_id).
// Fails on the old code: every page issued the COUNT, and afterId never reached the query.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const seen = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async (sql) => { seen.push(sql); return { n: 3 }; }),
  queryAll: vi.fn(async (sql, params) => { seen.push(sql); const lim = params[params.length - 2]; return Array.from({ length: lim }, (_, i) => ({ id: 100 + i })); }),
}));
vi.mock('../../api/lib/auth.js', () => ({ requireInternal: async () => {} }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { default: docsRoutes } = await import('../../api/routes/docs.js');
const app = Fastify();
await app.register(docsRoutes, { prefix: '/api/admin' });

const get = async (qs) => (await app.inject({ method: 'GET', url: `/api/admin/docs?scope=canonicalWithProse&religion=Baha%27i&fields=id,file_path&${qs}` })).json();
const counts = () => seen.filter((s) => /COUNT\(\*\)/.test(s)).length;

beforeEach(() => { seen.length = 0; });

describe('docs listing pages cheaply', () => {
  it('the first page carries the total and a cursor', async () => {
    const r = await get('limit=2&offset=0');
    expect(r.total).toBe(3);
    expect(r.next_after_id).toBe(101);
    expect(counts()).toBe(1);
  });
  it('a later OFFSET page does not recount the scope', async () => {
    const r = await get('limit=2&offset=500');
    expect(counts()).toBe(0);
    expect(r.total).toBeNull();
  });
  it('a keyset page reads by id and does not recount', async () => {
    const r = await get('limit=2&afterId=101');
    expect(counts()).toBe(0);
    expect(seen[0]).toMatch(/d\.id > \?/);
    expect(seen[0]).toMatch(/OFFSET \?/);
    expect(r.next_after_id).toBe(101);
  });
  it('?count=1 still asks for the total on any page', async () => {
    await get('limit=2&offset=500&count=1');
    expect(counts()).toBe(1);
  });
});
