// Typed chain on tower (queue-feed.js + stage-jobs.js) over the real queue core: cpu-prep -> gpu -> cpu-finish, deferred acks, never splice, quiet.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as Q from '../../worker/queue/core.js';
import { feed, pull, tick as qtick } from '../../api/lib/media/queue-feed.js';
import { CONTRACT, requiredFiles, fpOf } from '../../api/lib/media/stage-jobs.js';

const doSql = () => { const db = new Database(':memory:'); return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } }; };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tick = (l) => Object.fromEntries(l.map((s) => [s, { at: 1 }]));
let sql, store, q, root, st, repo, wr, items, synced, deps, E;
// one queue = the real core over its own sqlite + an in-memory files/results store (the LAN queue, or the edge /_q)
function mkQueue() {
  const sql = doSql(), store = new Map(); Q.migrate(sql);
  const q = {
    capacity: async () => Q.capacity(sql), stats: async (type) => Q.stats(sql, Date.now(), type), enqueue: async (jobs) => Q.enqueue(sql, jobs),
    listDone: async (n, type) => Q.listDone(sql, n, type), withdraw: async (ids) => Q.withdraw(sql, ids),
    ack: async (ids) => { for (const j of Q.ack(sql, ids)) for (const k of [...store.keys()]) if (k.startsWith(`results/${j.id}/`) || (!Q.fileInUse(sql, j.file_id) && k.startsWith(`files/${j.file_id}/`))) store.delete(k); },
    put: async (kind, id, name, file) => { const b = await readFile(file); store.set(`${kind}/${id}/${name}`, b); return { key: name, bytes: b.length }; },
    get: async (kind, id, name, dest) => { const b = store.get(`${kind}/${id}/${name}`); if (!b) throw Error(`no ${kind}/${id}/${name}`); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, b); return dest; },
  };
  return { sql, store, q };
}
beforeEach(async () => {
  ({ sql, store, q } = mkQueue()); E = mkQueue(); root = await mkdtemp(join(tmpdir(), 'qft-')); synced = [];
  items = {};
  for (const id of [1, 2]) {
    const dir = join(root, String(id)); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'orig.mp3'), `audio-${id}`);
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ slug: `t${id}`, original: 'orig.mp3', duration_s: 3600, stages: tick(['archive']) }));
    items[id] = { id, dir, slug: `t${id}`, state: 'whole_queued' };
  }
  repo = { getMediaItem: async (id) => items[id], updateMediaItem: async (id, p) => Object.assign(items[id], p) };
  wr = {
    fileSha: async (f) => sha(await readFile(f)),
    wholeJob: (it, m, s) => ({ v: 1, id: it.id, input: 'in.mp3', input_sha: s, threads: 2, meta: { slug: m.slug } }),
    adoptWholeResult: async (stg, dir, old, s) => { const r = JSON.parse(await readFile(join(stg, 'result.json'), 'utf8')); if (r.input_sha !== s) throw Error('identity'); return structuredClone(r.meta); },
  };
  st = { queue: [1, 2], items: { 1: { kind: 'whole' }, 2: { kind: 'whole' } }, done: [] };
  deps = { q, repo, wr, typed: true, fraction: 1, syncStages: async (id, s) => synced.push([id, s]) };
});
const engage = () => { for (const [host, types] of [['boss', ['cpu-finish', 'cpu-prep']], ['aorus', ['gpu']]]) Q.claim(sql, { host, types, contract: CONTRACT.contract }); };
// a worker runs the step: result.json + every listed item/<path> under results/<job id>/
function deliver(type, over = {}, where = null) {
  const { sql: qs, store: fs } = where || { sql, store };
  const host = where ? 'pod' : type === 'gpu' ? 'aorus' : 'boss';
  const j = Q.claim(qs, { host, types: type === 'gpu' ? ['gpu'] : ['cpu-finish', 'cpu-prep'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });
  if (!j) return null;
  const stages = { 'cpu-prep': tick(['archive', 'grade']), gpu: tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize']),
    'cpu-finish': { ...tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'remaster', 'verify', 'realign', 'quiet', 'web', 'trim']), transcribe: { at: 1 } } }[type];
  const files = requiredFiles(type).map((path) => { const b = Buffer.from(`${type}:${path}`); fs.set(`results/${j.id}/item/${path}`, b); return { path, sha256: sha(b) }; });
  const r = { v: 1, type, contract: CONTRACT.contract, ok: true, input_sha: j.body.job.input_sha, slug: `t${j.item_id}`, files,
    stages: type === 'gpu' ? { transcribe: { tool: 'whisper-large-v3', settings: { beam: 5 } } } : {},
    meta: { slug: `t${j.item_id}`, stages, remaster: type === 'cpu-finish' ? { status: 'done', swapped: 0, quiet: { v: 1 } } : {} }, ...over };
  fs.set(`results/${j.id}/result.json`, Buffer.from(JSON.stringify(r)));
  Q.done(qs, { id: j.id, lease: j.lease, result: { outputs: [{ name: 'result.json' }, ...files.map((f) => ({ name: 'item/' + f.path }))] } });
  return j;
}

describe('typed chain: prep on Boss -> gpu on Aorus -> finish on Boss -> adopted with quiet, swapped 0', () => {
  it('feeds nothing typed until hosts for all three steps are engaged; fraction 0 keeps the whole path', async () => {
    Q.claim(sql, { host: 'boss', types: ['cpu-finish', 'cpu-prep'] });
    expect((await feed(st, deps)).typed).toMatchObject({ fed: 0, why: expect.stringMatching(/gpu/) });
    engage();
    expect((await feed(st, { ...deps, fraction: 0 })).typed.fed).toBe(0);
    expect(st.queue).toEqual([1, 2]);
  });
  it('one talk end to end: each step takes the previous step\'s files, acks trail one step behind, tools stamped', async () => {
    engage(); st.queue = [1];
    expect((await feed(st, deps)).typed.fed).toBe(1);
    expect(Q.claim(sql, { host: 'old', types: ['cpu-prep'], contract: 0 })).toBeNull();   // a stale image never takes it
    const p = deliver('cpu-prep');
    expect(p.file_id).toMatch(/^t1-/); expect(p.body.job.meta).toEqual({ slug: 't1' }); expect(p.body.inputs).toEqual([]);
    expect(String(store.get(`files/${p.file_id}/in.mp3`))).toBe('audio-1');

    expect((await pull(st, deps)).typed).toMatchObject({ steps: 1, errors: 0 });
    const g = deliver('gpu');
    expect(g.file_id).toBe(p.file_id);
    expect(g.body.inputs.map((i) => i.path)).toEqual(requiredFiles('cpu-prep').map((f) => 'item/' + f));
    expect(g.body.inputs.every((i) => i.store === 'results' && i.id === p.id && /^[0-9a-f]{64}$/.test(i.sha256))).toBe(true);
    expect(store.has(`results/${p.id}/result.json`)).toBe(true);   // prep stays until gpu has run

    await pull(st, deps);
    expect(store.has(`results/${p.id}/result.json`)).toBe(false);  // gpu done → prep acked
    const f = deliver('cpu-finish');
    expect(f.body.inputs.every((i) => i.id === g.id)).toBe(true);

    const r = await pull(st, deps);
    expect(r.typed).toMatchObject({ adopted: 1, errors: 0 });
    expect(items[1].state).toBe('transcribed');
    const meta = JSON.parse(await readFile(join(items[1].dir, 'meta.json'), 'utf8'));
    expect(meta.remaster).toMatchObject({ swapped: 0, quiet: { v: 1 } });
    expect(meta.stages.transcribe).toMatchObject({ tool: 'whisper-large-v3', fp: fpOf('whisper-large-v3', { beam: 5 }), host: 'aorus', job: g.id });
    expect(meta.stages.quiet).toMatchObject({ tool: 'quiet.py', host: 'boss', job: f.id });
    expect(synced[0][0]).toBe(1);
    expect(st.done[0]).toMatchObject({ id: 1, mode: 'typed', prep: 'boss', gpu: 'aorus', finish: 'boss' });
    expect([...store.keys()].filter((k) => k.startsWith('results/'))).toEqual([]);
    expect(st.qjobs).toEqual({}); expect(st.chains).toEqual({});
  });
  it('never splice: a finish result carrying original audio is refused, the whole chain acked, the talk retried', async () => {
    engage(); st.queue = [1];
    await feed(st, deps); deliver('cpu-prep'); await pull(st, deps); deliver('gpu'); await pull(st, deps);
    deliver('cpu-finish', { meta: { slug: 't1', stages: {}, remaster: { swapped: 3, quiet: { v: 1 } } } });
    expect((await pull(st, deps)).typed.errors).toBe(1);
    expect(st.queue).toEqual([1]); expect(st.chains).toEqual({}); expect(st.qjobs).toEqual({});
    expect([...store.keys()].filter((k) => k.startsWith('results/'))).toEqual([]);
    expect(JSON.parse(await readFile(join(items[1].dir, 'meta.json'), 'utf8')).remaster).toBeUndefined();   // nothing landed
  });
  it('quiet required: a finish without the quiet pass is not complete', async () => {
    engage(); st.queue = [1];
    await feed(st, deps); deliver('cpu-prep'); await pull(st, deps); deliver('gpu'); await pull(st, deps);
    deliver('cpu-finish', { meta: { slug: 't1', stages: {}, remaster: { status: 'done', swapped: 0 } } });
    expect((await pull(st, deps)).typed.errors).toBe(1);
    expect(items[1].state).toBe('whole_queued');
  });
  it('a gpu step that ticked nothing is refused rather than looping; a second failure marks the talk failed', async () => {
    engage(); st.queue = [1];
    for (let n = 0; n < 2; n++) {
      await feed(st, deps); deliver('cpu-prep'); await pull(st, deps);
      deliver('gpu', { meta: { slug: 't1', stages: {}, remaster: {} } });
      expect((await pull(st, deps)).typed.errors).toBe(1);
    }
    expect(items[1].state).toBe('failed'); expect(items[1].why).toMatch(/without its stages/);
  });
  it('a step the queue gave up on (3 attempts) drops the chain and retries the talk', async () => {
    engage(); st.queue = [1];
    await feed(st, deps);
    for (let n = 0; n < 3; n++) { const j = Q.claim(sql, { host: 'boss', types: ['cpu-finish', 'cpu-prep'], contract: CONTRACT.contract, ram_gb: 32 }); Q.fail(sql, { id: j.id, lease: j.lease, error: 'decode failed' }); }
    expect((await pull(st, deps)).typed.errors).toBe(1);
    expect(st.queue).toEqual([1]); expect(st.chains).toEqual({});
  });
});

describe('typed chain over two transports: prep on Boss (LAN) -> gpu on a pod (edge /_q, R2) -> finish on Boss (LAN)', () => {
  const lanOnly = () => Q.claim(sql, { host: 'boss', types: ['cpu-finish', 'cpu-prep'], contract: CONTRACT.contract });
  const onEdge = (type) => [...E.store.keys()].filter((k) => k.startsWith(type));
  it('no home GPU + pods allowed typed: the gpu step goes to the edge with its inputs copied there; finish comes back to the LAN', async () => {
    lanOnly(); st.queue = [1];
    const d = { ...deps, edge: E.q };
    expect((await feed(st, deps)).typed.fed).toBe(0);   // without the edge there is no gpu host at all
    expect((await feed(st, d)).typed.fed).toBe(1);
    const p = deliver('cpu-prep');
    expect((await pull(st, d)).typed).toMatchObject({ steps: 1, errors: 0 });
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 })).toBeNull();   // not on the LAN
    const g = deliver('gpu', {}, E);
    expect(g.file_id).toBe(p.file_id);
    expect(String(E.store.get(`files/${g.file_id}/in.mp3`))).toBe('audio-1');   // the original, staged on the edge
    expect(g.body.inputs.map((i) => [i.store, i.id, i.path])).toEqual(requiredFiles('cpu-prep').map((f) => ['files', p.file_id, 'item/' + f]));
    for (const i of g.body.inputs) expect(sha(E.store.get(`files/${i.id}/${i.path}`))).toBe(i.sha256);   // what the pod checks
    expect(store.has(`results/${p.id}/result.json`)).toBe(true);   // prep stays until gpu has run

    expect((await pull(st, d)).typed).toMatchObject({ steps: 1, errors: 0 });
    expect(store.has(`results/${p.id}/result.json`)).toBe(false);   // gpu done → prep acked (LAN)
    expect(E.store.has(`results/${g.id}/result.json`)).toBe(true);   // gpu stays (edge) until finish has run
    const f = deliver('cpu-finish');
    expect(f.body.inputs.every((i) => i.store === 'files' && i.id === p.file_id)).toBe(true);
    for (const i of f.body.inputs) expect(store.get(`files/${i.id}/${i.path}`)).toEqual(E.store.get(`results/${g.id}/${i.path}`));

    expect((await pull(st, d)).typed).toMatchObject({ adopted: 1, errors: 0 });
    const meta = JSON.parse(await readFile(join(items[1].dir, 'meta.json'), 'utf8'));
    expect(meta.remaster).toMatchObject({ swapped: 0, quiet: { v: 1 } });
    expect(meta.stages.transcribe).toMatchObject({ host: 'pod', job: g.id });
    expect(st.done[0]).toMatchObject({ id: 1, mode: 'typed', prep: 'boss', gpu: 'pod', finish: 'boss' });
    expect([...onEdge('results/'), ...onEdge('files/')]).toEqual([]);   // edge acked: R2 emptied
    expect(Q.stats(E.sql, Date.now(), 'gpu').states).toEqual({});
    expect(st.qjobs).toEqual({}); expect(st.chains).toEqual({});
  });
  it('Aorus engaged and under TARGET_H keeps the gpu step home even with pods allowed', async () => {
    engage(); st.queue = [1];
    const d = { ...deps, edge: E.q };
    await feed(st, d); deliver('cpu-prep'); await pull(st, d);
    expect(deliver('gpu')).toBeTruthy(); expect(onEdge('files/')).toEqual([]);
  });
  it('a pod engaged beside a LAN gpu backlog: the waiting step moves to the edge (inputs staged) and the chain finishes on the LAN', async () => {
    engage(); st.queue = [1];
    const d = { ...deps, edge: E.q };
    await feed(st, d); const p = deliver('cpu-prep'); await pull(st, d);
    expect(Q.stats(sql, Date.now(), 'gpu').states.queued.n).toBe(1);   // home GPU under TARGET_H: the step stays home
    expect((await qtick(st, d)).moved).toEqual({ moved: 0 });   // no pod engaged: nothing moves
    Q.claim(E.sql, { host: 'pod-x', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });   // the pod's first (empty) claim engages it
    expect((await qtick(st, d)).moved).toEqual({ moved: 1 });
    expect(Q.stats(sql, Date.now(), 'gpu').states).toEqual({});
    const g = deliver('gpu', {}, E);
    expect(String(E.store.get(`files/${g.file_id}/in.mp3`))).toBe('audio-1');
    for (const i of g.body.inputs) { expect(i.store).toBe('files'); expect(sha(E.store.get(`files/${i.id}/${i.path}`))).toBe(i.sha256); }
    expect((await pull(st, d)).typed).toMatchObject({ steps: 1, errors: 0 });
    expect(store.has(`results/${p.id}/result.json`)).toBe(false);   // prep acked on the LAN
    deliver('cpu-finish');
    expect((await pull(st, d)).typed).toMatchObject({ adopted: 1, errors: 0 });
    expect(st.done[0]).toMatchObject({ gpu: 'pod', prep: 'boss', finish: 'boss' });
    expect([...onEdge('results/'), ...onEdge('files/')]).toEqual([]);
  });
  it('a LAN gpu step already leased by a home GPU is never moved', async () => {
    engage(); st.queue = [1];
    const d = { ...deps, edge: E.q };
    await feed(st, d); deliver('cpu-prep'); await pull(st, d);
    Q.claim(sql, { host: 'aorus', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });
    Q.claim(E.sql, { host: 'pod-x', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });
    expect((await qtick(st, d)).moved).toEqual({ moved: 0 });
    expect(onEdge('files/')).toEqual([]);
  });
  it('an edge gpu step the queue gave up on drops the chain on both transports and retries the talk', async () => {
    lanOnly(); st.queue = [1];
    const d = { ...deps, edge: E.q };
    await feed(st, d); deliver('cpu-prep'); await pull(st, d);
    for (let n = 0; n < 3; n++) { const j = Q.claim(E.sql, { host: 'pod', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 }); Q.fail(E.sql, { id: j.id, lease: j.lease, error: 'cuda oom' }); }
    expect((await pull(st, d)).typed.errors).toBe(1);
    expect(st.queue).toEqual([1]); expect(st.chains).toEqual({}); expect(st.qjobs).toEqual({});
    expect([...store.keys()].filter((k) => k.startsWith('results/'))).toEqual([]);
    expect([...onEdge('results/'), ...onEdge('files/')]).toEqual([]);
  });
});
