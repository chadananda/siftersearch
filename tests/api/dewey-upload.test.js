// Dewey multipart uploads: policy, token, edge route (fake R2), tower start/finish, and the browser queue (resume, retry, multi-file).
import { describe, it, expect, vi } from 'vitest';
import { checkStart, signToken, verifyToken, sniff, deweyUploadRoute, PART_SIZE, partCount, partSizeFor, KINDS } from '../../worker/dewey-upload.js';
import { UploadQueue, fingerprint } from '../../src/lib/dewey-uploader.js';
import { rateOk } from '../../api/routes/dewey-upload.js';

const GB = 1024 ** 3, S = 'secret';
const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const file = (name, size, lastModified = 1) => ({ name, size, lastModified, slice: (a, b) => ({ size: b - a }) });

describe('policy', () => {
  it('accepts audio/video/pdf/images and 20 GB files', () => {
    for (const n of ['a.mp3', 'a.mp4', 'a.pdf', 'a.jpg', 'a.epub', 'a.docx', 'a.txt']) expect(checkStart({ name: n, size: 100 }).ok).toBe(true);
    expect(checkStart({ name: 'talk.wav', size: 20 * GB }).ok).toBe(true);
  });
  it('rejects unknown types, empty files and oversize files', () => {
    expect(checkStart({ name: 'a.exe', size: 5 }).ok).toBe(false);
    expect(checkStart({ name: 'noext', size: 5 }).ok).toBe(false);
    expect(checkStart({ name: 'a.pdf', size: 0 }).ok).toBe(false);
    expect(checkStart({ name: 'a.pdf', size: KINDS.document.max + 1 }).error).toMatch(/too large/);
    expect(checkStart({ name: 'a.mp4', size: 51 * GB }).ok).toBe(false);
  });
  it('sniffs signatures', () => {
    expect(sniff('a.pdf', new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniff('a.pdf', new TextEncoder().encode('MZ......'))).toMatch(/not a PDF/);
    expect(sniff('a.mp3', new Uint8Array(8))).toBeNull();
  });
  it('part size scales: 32 MB under 2 GB, 64 MB above; 20 GB = 320 parts, 50 GB under 10,000', () => {
    expect(partSizeFor(1.5 * GB)).toBe(32 * 1024 ** 2); expect(partSizeFor(2 * GB)).toBe(64 * 1024 ** 2);
    expect(partCount(20 * GB)).toBe(320); expect(partCount(50 * GB)).toBeLessThan(10000);
  });
});

describe('token', () => {
  it('round-trips, and rejects tampering, expiry and a wrong secret', async () => {
    const t = await signToken({ k: 'dewey-uploads/1/x', u: 1, s: 5 }, S);
    expect((await verifyToken(t, S)).u).toBe(1);
    expect(await verifyToken(t, 'other')).toBeNull();
    expect(await verifyToken(t.replace(/.$/, 'A'), S)).toBeNull();
    expect(await verifyToken(t, S, Date.now() + 4 * 24 * 3600_000)).toBeNull();
    expect(await verifyToken('junk', S)).toBeNull();
    expect(await verifyToken(await signToken({ k: 'elsewhere/x', u: 1, s: 5 }, S), S)).toBeNull();   // key outside the prefix
  });
});

function fakeBucket() {
  const parts = {}, objs = {};
  return { objs, createMultipartUpload: async (k) => ({ uploadId: 'U1', key: k }),
    resumeMultipartUpload: (k, id) => ({ uploadPart: async (n, body) => { const b = new Uint8Array(await new Response(body).arrayBuffer()); parts[n] = b.length; return { etag: `e${n}` }; },
      abort: async () => {}, complete: async (ps) => { const size = ps.reduce((a, p) => a + parts[p.partNumber], 0); objs[k] = { size }; return { size }; } }),
    head: async (k) => objs[k] || null, delete: async (k) => { delete objs[k]; }, get: async (k) => objs[k] ? { body: 'x', size: objs[k].size } : null };
}
const call = (env, path, init = {}, tok) => deweyUploadRoute(new Request(`https://siftersearch.com${path}`, { ...init, headers: { ...(tok ? { 'x-upload-token': tok } : {}), ...(init.headers || {}) } }), env,
  { fetchImpl: async (u, i) => Response.json({ item: { id: 9, body: JSON.parse(i.body) } }) });

describe('edge route', () => {
  const env = () => ({ MEDIA_BUCKET: fakeBucket(), S1_KEY: S });
  it('ignores other paths, refuses a missing/bad token', async () => {
    expect(await call(env(), '/api/search')).toBeNull();
    expect((await call(env(), '/api/dewey/upload/init', { method: 'POST' })).status).toBe(401);
    expect((await call(env(), '/api/dewey/upload/init', { method: 'POST' }, 'bad.token')).status).toBe(401);
  });
  it('init → part → complete records the item on tower', async () => {
    const e = env(), size = PART_SIZE + 10;
    const tok = await signToken({ k: 'dewey-uploads/1/abc-a.mp3', u: 1, e: 'd@x', s: size, n: 'a.mp3', t: 'audio' }, S);
    const init = await (await call(e, '/api/dewey/upload/init', { method: 'POST' }, tok)).json();
    expect(init).toMatchObject({ uploadId: 'U1', parts: 2 });
    const put = (n, len) => call(e, `/api/dewey/upload/part?uploadId=U1&n=${n}`, { method: 'PUT', body: new Uint8Array(len), headers: { 'content-length': String(len) } }, tok);
    expect((await put(3, 5)).status).toBe(400);                       // beyond the part count
    expect((await put(1, 100)).status).toBe(400);                     // a non-final part must be exactly PART_SIZE
    expect((await put(1, PART_SIZE)).status).toBe(200);
    expect((await call(e, '/api/dewey/upload/complete?uploadId=U1', { method: 'POST', body: JSON.stringify({ parts: [{ n: 1, etag: 'e1' }] }) }, tok)).status).toBe(400);   // a part missing
    expect((await put(2, 10)).status).toBe(200);
    const done = await (await call(e, '/api/dewey/upload/complete?uploadId=U1', { method: 'POST', body: JSON.stringify({ parts: [{ n: 1, etag: 'e1' }, { n: 2, etag: 'e2' }] }) }, tok)).json();
    expect(done.item.body).toMatchObject({ key: 'dewey-uploads/1/abc-a.mp3', size, kind: 'audio', email: 'd@x' });
  });
  it('rejects a size that does not match the authorised size and removes the object', async () => {
    const e = env(), tok = await signToken({ k: 'dewey-uploads/1/b-a.mp3', u: 1, e: 'd@x', s: 50, n: 'a.mp3', t: 'audio' }, S);
    await call(e, '/api/dewey/upload/init', { method: 'POST' }, tok);
    await call(e, '/api/dewey/upload/part?uploadId=U1&n=1', { method: 'PUT', body: new Uint8Array(40), headers: { 'content-length': '40' } }, tok);
    const r = await call(e, '/api/dewey/upload/complete?uploadId=U1', { method: 'POST', body: JSON.stringify({ parts: [{ n: 1, etag: 'e1' }] }) }, tok);
    expect(r.status).toBe(422); expect(e.MEDIA_BUCKET.objs['dewey-uploads/1/b-a.mp3']).toBeUndefined();
  });
  it('part 1 of a fake PDF is refused', async () => {
    const e = env(), tok = await signToken({ k: 'dewey-uploads/1/c-a.pdf', u: 1, e: 'd@x', s: 20, n: 'a.pdf', t: 'document' }, S);
    await call(e, '/api/dewey/upload/init', { method: 'POST' }, tok);
    const r = await call(e, '/api/dewey/upload/part?uploadId=U1&n=1', { method: 'PUT', body: new TextEncoder().encode('MZ.................'), headers: { 'content-length': '20' } }, tok);
    expect(r.status).toBe(415);
  });
  it('the blob endpoint needs the internal key', async () => {
    expect((await call(env(), '/_dewey/blob?key=dewey-uploads/1/x')).status).toBe(401);
    expect((await call(env(), '/_dewey/blob?key=other/x', { headers: { 'x-internal-key': S } })).status).toBe(400);
  });
});

describe('adaptive parallelism', () => {
  it('halves on trouble, grows back after clean parts, within 1..6', () => {
    const q = new UploadQueue({ storage: mem() });
    expect(q.partConcurrency).toBe(4); q.slower(); expect(q.partConcurrency).toBe(2); q.slower(); q.slower(); expect(q.partConcurrency).toBe(1);
    for (let i = 0; i < 8 * 7; i++) q.faster(); expect(q.partConcurrency).toBe(6);
  });
  it('reports speed and ETA', async () => {
    const q = new UploadQueue({ storage: mem() }); q.items = [{ id: 1, state: 'uploading', size: 1000, sent: 0 }];
    q.progress(); q.samples[0].t -= 4000; q.items[0].sent = 400;
    const p = q.progress(); expect(p.bps).toBeGreaterThan(90); expect(p.etaSec).toBeNull();   // under 1 KB/s: no ETA claimed
  });
});

describe('rate limit', () => {
  it('allows max starts per window per user', () => {
    const m = new Map(); for (let i = 0; i < 3; i++) expect(rateOk(1, 1000 + i, m, { max: 3, windowMs: 1000 })).toBe(true);
    expect(rateOk(1, 1500, m, { max: 3, windowMs: 1000 })).toBe(false);
    expect(rateOk(2, 1500, m, { max: 3, windowMs: 1000 })).toBe(true);
    expect(rateOk(1, 3000, m, { max: 3, windowMs: 1000 })).toBe(true);
  });
});

// a fake server for the queue: start → init → part → complete
function server({ failParts = {}, expire = false } = {}) {
  const log = { puts: [], starts: 0, completes: 0, active: 0, maxActive: 0 }, attempts = {};
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/start')) { log.starts++; const b = JSON.parse(init.body); return Response.json({ token: 'T', key: `dewey-uploads/1/${b.name}`, parts: partCount(b.size) }); }
    if (url.endsWith('/init')) return Response.json({ uploadId: 'U' + log.starts, partSize: PART_SIZE, parts: 99 });
    if (url.includes('/complete')) { log.completes++; return Response.json({ item: { id: 1 } }); }
    return Response.json({});
  };
  const putPart = async (url, blob) => {
    const n = Number(/n=(\d+)/.exec(url)[1]); const k = `${url}`; attempts[k] = (attempts[k] || 0) + 1;
    log.active++; log.maxActive = Math.max(log.maxActive, log.active); await new Promise((r) => setTimeout(r, 1)); log.active--;
    if (expire && attempts[k] === 1 && n === 1 && log.starts === 1) return { status: 401, body: {} };
    if (failParts[n] && attempts[k] <= failParts[n]) return { status: 503, body: {} };
    log.puts.push(n); return { status: 200, body: { etag: `e${n}` } };
  };
  return { fetchImpl, putPart, log };
}
const settle = (q) => new Promise((res) => { const t = setInterval(() => { if (q.items.every((i) => ['done', 'error', 'rejected', 'paused', 'canceled'].includes(i.state))) { clearInterval(t); res(); } }, 2); });

describe('browser queue', () => {
  it('uploads many files, 2 at a time, and reports overall progress', async () => {
    const s = server(), q = new UploadQueue({ ...s, storage: mem(), sleep: async () => {} });
    let peak = 0; q.onChange = (items) => { peak = Math.max(peak, items.filter((i) => i.state === 'uploading').length); };
    q.add([1, 2, 3, 4, 5].map((n) => file(`f${n}.mp3`, PART_SIZE * 2 + 5)));
    await settle(q);
    expect(q.items.every((i) => i.state === 'done')).toBe(true);
    expect(peak).toBe(2); expect(s.log.completes).toBe(5); expect(q.progress()).toMatchObject({ pct: 100, done: 5 });
    expect(s.log.maxActive).toBeLessThanOrEqual(6);
  });
  it('rejects types and sizes before sending anything', async () => {
    const s = server(), q = new UploadQueue({ ...s, storage: mem() });
    q.add([file('x.exe', 10), file('big.pdf', 6 * GB)]);
    expect(q.items.map((i) => i.state)).toEqual(['rejected', 'rejected']); expect(s.log.starts).toBe(0);
  });
  it('retries a failing part with backoff', async () => {
    const s = server({ failParts: { 2: 2 } }), sleeps = [], q = new UploadQueue({ ...s, storage: mem(), sleep: async (ms) => sleeps.push(ms) });
    q.add([file('a.mp3', PART_SIZE * 2)]); await settle(q);
    expect(q.items[0].state).toBe('done'); expect(sleeps).toEqual([1000, 2000]);
  });
  it('gives up after the retries and can be retried', async () => {
    const s = server({ failParts: { 1: 99 } }), q = new UploadQueue({ ...s, storage: mem(), sleep: async () => {}, retries: 2 });
    q.add([file('a.mp3', 100)]); await settle(q);
    expect(q.items[0].state).toBe('error');
  });
  it('resumes after a refresh: only the missing parts are sent, with no new start', async () => {
    const storage = mem(), f = file('big.wav', PART_SIZE * 4);
    const a = server(); const q1 = new UploadQueue({ ...a, storage, sleep: async () => {} });
    let calls = 0; const inflight = []; const realPut = q1.putPart; q1.putPart = async (...x) => { if (++calls > 2) { await Promise.all(inflight); q1.pause(1); return { status: 503, body: {} }; } const r = realPut(...x); inflight.push(r); return r; };   // pause only after the two good parts have landed (parts upload in parallel)
    q1.add([f]); await settle(q1);
    expect(q1.items[0].state).toBe('paused'); expect(JSON.parse(storage.getItem('dewey-uploads-v1'))[fingerprint(f)].etags).toBeDefined();
    const b = server(), q2 = new UploadQueue({ ...b, storage, sleep: async () => {} });   // "after a refresh": new queue, same storage
    q2.add([f]); await settle(q2);
    expect(q2.items[0].state).toBe('done'); expect(b.log.starts).toBe(0);
    expect(b.log.puts.length).toBeLessThan(4); expect(b.log.completes).toBe(1);
  });
  it('restarts the session when the edge says the upload expired (401)', async () => {
    const s = server({ expire: true }), q = new UploadQueue({ ...s, storage: mem(), sleep: async () => {} });
    q.add([file('a.mp3', 100)]); await settle(q);
    expect(q.items[0].state).toBe('done'); expect(s.log.starts).toBe(2);
  });
  it('cancel aborts and forgets the saved session', async () => {
    const storage = mem(), s = server(), q = new UploadQueue({ ...s, storage, sleep: async () => {} });
    q.add([file('a.mp3', 100)]); await q.cancel(1);
    expect(q.items[0].state).toBe('canceled'); expect(JSON.parse(storage.getItem('dewey-uploads-v1') || '{}')).toEqual({});
  });
});
