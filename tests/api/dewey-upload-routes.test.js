// Tower side of Dewey uploads: start needs Dewey access, validates type/size/quota; finish needs the internal key and is idempotent.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';

const created = [], enq = [];
let bytes = 0;
vi.mock('../../api/lib/auth.js', () => ({ requireDewey: async (req) => { if (!req.headers.authorization) throw Object.assign(new Error('no'), { statusCode: 401 }); req.user = { sub: 7, email: 'duane@x' }; } }));
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  createItem: async (o) => { const i = { id: created.length + 1, ...o }; created.push(i); return i; }, updateItem: async () => {},
  receivedBytesBy: async () => bytes, findByUploadKey: async (k) => created.find((i) => i.identified?.upload?.key === k) || null }));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue: async (...a) => enq.push(a) }));

let app;
beforeAll(async () => {
  process.env.INTERNAL_API_KEY = 'ik';
  const { default: routes } = await import('../../api/routes/dewey-upload.js');
  app = Fastify(); app.setErrorHandler((e, _r, reply) => reply.code(e.statusCode || 500).send({ error: e.message }));
  await app.register(routes, { prefix: '/api/dewey/upload' });
});
const start = (body, auth = true) => app.inject({ method: 'POST', url: '/api/dewey/upload/start', headers: auth ? { authorization: 'Bearer x' } : {}, payload: body });

describe('start', () => {
  it('needs a Dewey member', async () => expect((await start({ name: 'a.mp3', size: 5 }, false)).statusCode).toBe(401));
  it('issues a token and part plan for a 1.5 GB video', async () => {
    const r = await start({ name: 'Talk 1.mp4', size: 1.5 * 1024 ** 3 });
    const b = r.json(); expect(r.statusCode).toBe(200);
    expect(b).toMatchObject({ kind: 'video', parts: 48 }); expect(b.key).toMatch(/^dewey-uploads\/7\/\d{6}\/[0-9a-f]{10}-Talk 1\.mp4$/);
  });
  it('rejects a type, a size and a full quota', async () => {
    expect((await start({ name: 'x.exe', size: 5 })).statusCode).toBe(400);
    expect((await start({ name: 'x.pdf', size: 9 * 1024 ** 3 })).statusCode).toBe(400);
    bytes = 499 * 1024 ** 3; expect((await start({ name: 'x.mp4', size: 3 * 1024 ** 3 })).statusCode).toBe(413); bytes = 0;
  });
});

describe('finish', () => {
  const fin = (body, key = 'ik') => app.inject({ method: 'POST', url: '/api/dewey/upload/finish', headers: { 'x-internal-key': key }, payload: body });
  const doc = { key: 'dewey-uploads/7/202610/aa-b.pdf', size: 1000, name: 'b.pdf', kind: 'document', userId: 7, email: 'duane@x' };
  it('refuses without the internal key', async () => expect((await fin(doc, 'no')).statusCode).toBe(401));
  it('records a small document and queues the hand-off; a second call is a no-op', async () => {
    expect((await fin(doc)).json().item.state).toBe('received');
    expect(enq.find((e) => e[0] === 'dewey-received')).toBeTruthy();
    expect((await fin(doc)).json().duplicate).toBe(true); expect(created.length).toBe(1);
  });
  it('a big video waits as received, nothing queued for tower', async () => {
    const n = enq.length; const r = await fin({ ...doc, key: 'dewey-uploads/7/202610/bb-c.mp4', name: 'c.mp4', kind: 'video', size: 3e9 });
    expect(r.json().item.why).toMatch(/awaiting processing by the media worker/); expect(enq.length).toBe(n);
  });
});
