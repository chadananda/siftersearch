// /api/media/:slug/feedback: GET public + no-store; PUT needs a signed-in user, a published talk and valid input. Also the edge
// cache never stores it, and the client clock parser.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

const saved = [];
const TALKS = {
  live: { id: 10, slug: 'live', state: 'done', restored: 1, duration_s: 600 },
  draft: { id: 11, slug: 'draft', state: 'done', restored: 0, duration_s: 600 },
};
const userFrom = (req) => {
  const h = req.headers.authorization;
  if (h === 'Bearer user7') return { sub: 7 };
  if (h === 'Bearer system') return { sub: 'system_admin' };
  return null;
};
vi.mock('../../api/lib/auth.js', () => ({
  authenticate: async (req) => { const u = userFrom(req); if (!u) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 }); req.user = u; },
  optionalAuthenticate: async (req) => { req.user = userFrom(req); },
}));
vi.mock('../../api/lib/repos/media-repo.js', () => ({ getMediaBySlug: async (s) => TALKS[s] || null }));
vi.mock('../../api/lib/repos/talk-feedback-repo.js', () => ({
  saveFeedback: async (o) => { saved.push(o); },
  feedbackFor: async (id, { userId }) => ({ count: saved.length, mediaId: id, userId }),
}));

let app, validateFeedback;
beforeAll(async () => {
  const mod = await import('../../api/routes/talk-feedback.js');
  validateFeedback = mod.validateFeedback;
  app = Fastify(); app.setErrorHandler((e, _r, reply) => reply.code(e.statusCode || 500).send({ error: e.message }));
  await app.register(mod.default, { prefix: '/api/media' });
});
beforeEach(() => { saved.length = 0; });

const put = (slug, payload, auth = 'Bearer user7') =>
  app.inject({ method: 'PUT', url: `/api/media/${slug}/feedback`, headers: auth ? { authorization: auth } : {}, payload });

describe('GET', () => {
  it('is public, never cached, and passes the signed-in user through', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/media/live/feedback' });
    expect(anon.statusCode).toBe(200);
    expect(anon.headers['cache-control']).toBe('private, no-store');
    expect(anon.json()).toMatchObject({ slug: 'live', mediaId: 10, userId: null });
    const me = await app.inject({ method: 'GET', url: '/api/media/live/feedback', headers: { authorization: 'Bearer user7' } });
    expect(me.json().userId).toBe(7);
  });
  it('404s an unpublished or unknown talk', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/media/draft/feedback' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/media/nope/feedback' })).statusCode).toBe(404);
  });
});

describe('PUT', () => {
  it('401 when signed out; 403 for a system caller with no user account', async () => {
    expect((await put('live', { score: 4 }, null)).statusCode).toBe(401);
    expect((await put('live', { score: 4 }, 'Bearer system')).statusCode).toBe(403);
    expect(saved).toEqual([]);
  });
  it('saves the user\'s own row and answers no-store', async () => {
    const r = await put('live', { score: 4, comment: '  lovely\r\ntalk ', suggested_start_s: 12.34 });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json()).toMatchObject({ slug: 'live', saved: true });
    expect(saved).toEqual([{ mediaId: 10, userId: 7, score: 4, comment: 'lovely\ntalk', startS: 12.3 }]);
  });
  it('404 for an unpublished talk', async () => { expect((await put('draft', { score: 4 })).statusCode).toBe(404); });
  it.each([
    [{ score: 0 }], [{ score: 6 }], [{ score: 2.5 }], [{ score: 'x' }],
    [{ comment: 'x'.repeat(4001) }], [{ comment: 5 }],
    [{ suggested_start_s: -1 }], [{ suggested_start_s: 601 }], [{ suggested_start_s: 'abc' }],
    [{}], [{ score: '', comment: '   ', suggested_start_s: null }],
  ])('400 for %j', async (body) => {
    expect((await put('live', body)).statusCode).toBe(400);
    expect(saved).toEqual([]);
  });
});

describe('validateFeedback', () => {
  it('accepts a start alone, a comment at the limit, and the talk\'s last second', () => {
    expect(validateFeedback({ suggested_start_s: 0 })).toEqual({ score: null, comment: null, startS: 0 });
    expect(validateFeedback({ comment: 'y'.repeat(4000) }).comment).toHaveLength(4000);
    expect(validateFeedback({ suggested_start_s: 600 }, { duration: 600 }).startS).toBe(600);
    expect(validateFeedback({ score: '3' }).score).toBe(3);
  });
});

describe('edge cache', () => {
  it('never stores feedback reads', async () => {
    const { policyFor } = await import('../../worker/edge-cache.js');
    const p = policyFor(new URL('https://siftersearch.com/api/media/live/feedback'), 'GET', new Headers());
    expect(p.mode).toBe('bypass');
  });
});

describe('client clock', () => {
  it('parses and formats m:ss / h:mm:ss / seconds', async () => {
    const { parseClock, formatClock } = await import('../../src/lib/talk-feedback.js');
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('95.5')).toBe(95.5);
    expect(parseClock('')).toBeNull();
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('a:10')).toBeNull();
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(null)).toBe('');
  });
});
