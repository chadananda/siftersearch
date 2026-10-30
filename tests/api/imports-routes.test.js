// /api/admin/imports routes: admin guard, filters passed to the repo, decision validation, bulk, report summary.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';

const calls = [];
vi.mock('../../api/lib/auth.js', () => ({ requireInternal: async (req) => {
  if (req.headers['x-internal-key'] !== 'ik') throw Object.assign(new Error('Admin access required'), { statusCode: 401 });
  req.user = { sub: 1, email: 'chad@x', tier: 'admin' };
} }));
const rows = [{ section: 'main', kind: 'book', match: 'new', decision: null, n: 5 }, { section: 'main', kind: 'talk', match: 'held', decision: 'approve', n: 2 },
  { section: 'set-aside', kind: 'junk', match: 'junk', decision: null, n: 10 }];
vi.mock('../../api/lib/repos/archives-repo.js', () => ({
  listDonors: async () => [{ id: 'duane', name: 'Duane' }],
  listDrives: async () => [{ id: 'golden-age', donor_id: 'duane', label: 'GOLDEN AGE' }],
  itemCounts: async () => rows,
  getDrive: async (id) => (id === 'golden-age' ? { id } : null),
  getItem: async (id) => (id === 7 ? { id } : null),
  listItems: async (drive, f) => { calls.push(['list', drive, f]); return Array.from({ length: Math.min(f.limit, 3) }, (_, i) => ({ id: i + 1 })); },
  decideItem: async (id, d) => { calls.push(['decide', id, d]); return { id, ...d }; },
  decideItems: async (ids, d) => { calls.push(['bulk', ids, d]); return ids.length; },
  driveReport: async (id) => (id === 'golden-age' ? { drive: { id }, imported: [], counts: rows } : null),
  donorReport: async (id) => (id === 'duane' ? { donor: { id }, drives: [{ drive: { id: 'golden-age' }, imported: [], selected: [], counts: rows, buckets: { items: 17 } }], buckets: { items: 17 }, files: 9 } : null),
}));

let app;
beforeAll(async () => {
  const { default: routes } = await import('../../api/routes/imports.js');
  app = Fastify(); app.setErrorHandler((e, _r, reply) => reply.code(e.statusCode || 500).send({ error: e.message }));
  await app.register(routes, { prefix: '/api/admin' });
});
const get = (url, key = 'ik') => app.inject({ method: 'GET', url: `/api/admin/imports${url}`, headers: { 'x-internal-key': key } });
const post = (url, payload) => app.inject({ method: 'POST', url: `/api/admin/imports${url}`, headers: { 'x-internal-key': 'ik' }, payload });

describe('imports routes', () => {
  it('needs admin', async () => expect((await get('/donors-drives', 'no')).statusCode).toBe(401));
  it('donors carry their drives with folded counts', async () => {
    const b = (await get('/donors-drives')).json();
    expect(b.donors[0].drives[0].counts).toMatchObject({ total: 17, section: { main: 7, 'set-aside': 10 }, match: { new: 5, held: 2, junk: 10 }, decision: { undecided: 15, approve: 2 } });
  });
  it('items: filters reach the repo, paging reports more', async () => {
    const b = (await get('/drives/golden-age/items?section=main&kind=book&match=new,unsure&decision=undecided&q=tablet&limit=2&offset=4')).json();
    expect(b).toMatchObject({ offset: 4, limit: 2, more: true }); expect(b.items).toHaveLength(2);
    expect(calls.at(-1)).toEqual(['list', 'golden-age', { section: 'main', kind: 'book', match: 'new,unsure', decision: 'undecided', q: 'tablet', limit: 3, offset: 4 }]);
    expect((await get('/drives/nope/items')).statusCode).toBe(404);
    expect((await get('/drives/golden-age/items?section=bogus')).statusCode).toBe(400);
  });
  it('decision: validated, attributed to the admin, more_info needs a note', async () => {
    expect((await post('/items/7/decision', { decision: 'approve' })).json().item).toMatchObject({ decision: 'approve', by: 'chad@x' });
    expect((await post('/items/7/decision', { decision: 'maybe' })).statusCode).toBe(400);
    expect((await post('/items/7/decision', { decision: 'more_info' })).statusCode).toBe(400);
    expect((await post('/items/7/decision', { decision: 'more_info', note: 'which edition?' })).statusCode).toBe(200);
    expect((await post('/items/7/decision', { decision: null })).json().item.decision).toBeNull();
    expect((await post('/items/8/decision', { decision: 'deny' })).statusCode).toBe(404);
  });
  it('bulk decision and report', async () => {
    expect((await post('/items/decision-bulk', { ids: [1, 2, 3], decision: 'deny' })).json()).toEqual({ updated: 3, decision: 'deny' });
    expect((await post('/items/decision-bulk', { ids: [], decision: 'deny' })).statusCode).toBe(400);
    const r = (await get('/drives/golden-age/report')).json();
    expect(r.summary.kind).toMatchObject({ book: 5, talk: 2, junk: 10 });
    expect((await get('/drives/x/report')).statusCode).toBe(404);
  });
  it('donor report: every drive with its folded summary; 404 for an unknown donor; admin only', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/admin/imports/donors/duane/report', headers: { 'x-internal-key': 'ik' } })).json();
    expect(r).toMatchObject({ donor: { id: 'duane' }, buckets: { items: 17 }, files: 9 });
    expect(r.drives[0].summary).toMatchObject({ total: 17, section: { main: 7 } });
    expect((await app.inject({ method: 'GET', url: '/api/admin/imports/donors/nobody/report', headers: { 'x-internal-key': 'ik' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/admin/imports/donors/duane/report', headers: { 'x-internal-key': 'no' } })).statusCode).toBe(401);
  });
});
