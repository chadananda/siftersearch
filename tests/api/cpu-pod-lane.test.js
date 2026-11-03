// CPU pod lane (Chad 10-31): a CPU pod on the edge (/_q, R2) runs cpu-prep + cpu-finish OVERFLOW; home CPU hosts first. Real queue core on
// both transports; FLAC/WAV never reaches the edge; a cloud prep's rebuilt light.flac is never named as a next-step input. Plus the manual rental.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as Q from '../../worker/queue/core.js';
import { feed, pull, rebalancePrep, TARGET_H } from '../../api/lib/media/queue-feed.js';
import { CONTRACT, requiredFiles, cpuRoute, lanBacklogH, lanDrain } from '../../api/lib/media/stage-jobs.js';
import { REBUILT, isDecoded, transitName } from '../../scripts/media/worker/transit.mjs';
import { createCpuPod, BOOTSTRAP_CPU_AGENT, cpuPodSlots, CPU_POD_PREFIX } from '../../api/lib/media/cloud.js';

const doSql = () => { const db = new Database(':memory:'); return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } }; };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tick = (l) => Object.fromEntries(l.map((s) => [s, { at: 1 }]));
// one transport = the real core + an in-memory files/results store; cloud: refuses decoded names like the https client + the Worker
function mkQueue({ cloud = false } = {}) {
  const sql = doSql(), store = new Map(); Q.migrate(sql);
  const drop = (j) => { for (const k of [...store.keys()]) if (k.startsWith(`results/${j.id}/`) || (!Q.fileInUse(sql, j.file_id) && k.startsWith(`files/${j.file_id}/`))) store.delete(k); };
  const q = {
    capacity: async () => Q.capacity(sql), stats: async (type) => Q.stats(sql, Date.now(), type), enqueue: async (jobs) => Q.enqueue(sql, jobs),
    listDone: async (n, type) => Q.listDone(sql, n, type), withdraw: async (ids) => Q.withdraw(sql, ids),
    cancel: async (ids) => { for (const j of Q.cancel(sql, ids)) drop(j); }, ack: async (ids) => { for (const j of Q.ack(sql, ids)) drop(j); },
    put: async (kind, id, name, file) => {
      if (cloud && isDecoded(name)) throw Object.assign(Error(`put ${kind}/${id}/${name}: FLAC/WAV never goes to the cloud`), { status: 415 });
      const b = await readFile(file); store.set(`${kind}/${id}/${name}`, b); return { key: name, bytes: b.length };
    },
    list: async (kind, id) => [...store.entries()].filter(([k]) => k.startsWith(`${kind}/${id}/`)).map(([k, v]) => ({ name: k.slice(`${kind}/${id}/`.length), bytes: v.length })),
    get: async (kind, id, name, dest) => { const b = store.get(`${kind}/${id}/${name}`); if (!b) throw Object.assign(Error(`get ${kind}/${id}/${name} 404`), { status: 404 }); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, b); return dest; },
  };
  return { sql, store, q, cloud };
}

let L, E, root, st, repo, wr, items, deps, t;
async function mkItems(spec) {   // spec: { id: ext }
  items = {};
  for (const [id, ext] of Object.entries(spec)) {
    const dir = join(root, id); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `orig.${ext}`), `audio-${id}`);
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ slug: `t${id}`, original: `orig.${ext}`, duration_s: 3600, stages: tick(['archive']) }));
    items[id] = { id: Number(id), dir, slug: `t${id}`, state: 'whole_queued' };
  }
  st = { queue: Object.keys(spec).map(Number), items: Object.fromEntries(Object.keys(spec).map((id) => [id, { kind: 'whole' }])), done: [] };
}
beforeEach(async () => {
  L = mkQueue(); E = mkQueue({ cloud: true }); root = await mkdtemp(join(tmpdir(), 'cpupod-')); t = 1e12;
  repo = { getMediaItem: async (id) => items[id], updateMediaItem: async (id, p) => Object.assign(items[id], p) };
  wr = {
    fileSha: async (f) => sha(await readFile(f)),
    wholeJob: (it, m, s) => ({ v: 1, id: it.id, input: 'in' + m.original.slice(m.original.lastIndexOf('.')), input_sha: s, threads: 2, meta: { slug: m.slug } }),
    adoptWholeResult: async (stg, dir, old, s) => { const r = JSON.parse(await readFile(join(stg, 'result.json'), 'utf8')); if (r.input_sha !== s) throw Error('identity'); return structuredClone(r.meta); },
  };
  deps = { q: L.q, edge: E.q, repo, wr, typed: true, fraction: 1, now: () => t++, syncStages: async () => {}, run: async (cmd, args) => { await mkdir(dirname(args.at(-1)), { recursive: true }); await writeFile(args.at(-1), 'decoded'); } };
});
const claimLan = (host, types) => Q.claim(L.sql, { host, types, contract: CONTRACT.contract });
const cpuPod = (types = ['cpu-prep', 'cpu-finish']) => Q.claim(E.sql, { host: 'cpupod-x1', types, contract: CONTRACT.contract });
// a worker runs one step. On the edge (cloud) it behaves like queue-agent's cloudManifest: REBUILT not uploaded, other FLAC as an Opus transit
function deliver(type, T, host) {
  const j = Q.claim(T.sql, { host, types: [type], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });
  if (!j) return null;
  if (/^cpupod-|^boss/.test(host)) T.sql.exec('UPDATE hosts SET types = ? WHERE host = ?', JSON.stringify(['cpu-prep', 'cpu-finish']), host);   // a CPU host keeps both roles
  const stages = { 'cpu-prep': tick(['archive', 'grade']), gpu: tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize']),
    'cpu-finish': tick(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'remaster', 'verify', 'realign', 'quiet', 'web', 'trim']) }[type];
  const files = [], outputs = [{ name: 'result.json' }];
  for (const path of requiredFiles(type)) {
    const b = Buffer.from(`${type}:${path}`);
    if (T.cloud && REBUILT.has(path)) { files.push({ path, sha256: sha(b) }); continue; }   // listed, never uploaded
    if (T.cloud && isDecoded(path)) { const tp = transitName(path); T.store.set(`results/${j.id}/item/${tp}`, b); files.push({ path: tp, sha256: sha(b), transit_of: path }); outputs.push({ name: 'item/' + tp }); continue; }
    T.store.set(`results/${j.id}/item/${path}`, b); files.push({ path, sha256: sha(b) }); outputs.push({ name: 'item/' + path });
  }
  const r = { v: 1, type, contract: CONTRACT.contract, ok: true, input_sha: j.body.job.input_sha, slug: `t${j.item_id}`, files, stages: {},
    meta: { slug: `t${j.item_id}`, stages, remaster: type === 'cpu-finish' ? { status: 'done', swapped: 0, quiet: { v: 2 } } : {} } };
  T.store.set(`results/${j.id}/result.json`, Buffer.from(JSON.stringify(r)));
  Q.done(T.sql, { id: j.id, lease: j.lease, result: { outputs } });
  return j;
}
const decodedOnEdge = () => [...E.store.keys()].filter((k) => isDecoded(k));

describe('CPU overflow: home CPU hosts first, the CPU pod on the edge takes the excess prep', () => {
  it('the feed adds the CPU pod\'s measured rate; rebalancePrep moves only the excess over TARGET_H at the home rate, newest first', async () => {
    await mkItems({ 1: 'opus', 2: 'opus', 3: 'opus', 4: 'opus' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']);
    expect((await feed(st, { ...deps, edge: null })).typed.fed).toBe(3);   // home only: TARGET_H (2.5 h) at boss's 1x → 3 talks of 1 h
    await mkItems({ 1: 'opus', 2: 'opus', 3: 'opus', 4: 'opus' }); L = mkQueue(); deps.q = L.q;
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']); cpuPod();
    expect((await feed(st, deps)).typed.fed).toBe(4);   // + the CPU pod's rate: 5 h wanted, 4 talks exist
    expect(Q.stats(E.sql, Date.now(), 'cpu-prep').states).toEqual({});   // the feed itself never uploads
    const r = await rebalancePrep(st, deps);
    expect(r).toMatchObject({ moved: 2 });   // LAN 4 h → 2 h (≤ 2.5 h at the home rate)
    const onEdge = Object.values(st.qjobs).filter((x) => x.where === 'edge').map((x) => x.itemId).sort();
    expect(onEdge).toEqual([3, 4]);   // newest moved; home keeps the ones it reaches first
    expect(Q.stats(L.sql, Date.now(), 'cpu-prep').states.queued.n).toBe(2);
    expect(Q.stats(E.sql, Date.now(), 'cpu-prep').states.queued.n).toBe(2);
    for (const id of [3, 4]) expect(String(E.store.get(`files/${st.chains[id].fileId}/in.opus`))).toBe(`audio-${id}`);
    expect((await rebalancePrep(st, deps)).moved).toBe(0);   // balanced: nothing more moves
  });
  it('home keeps only what it measurably DRAINS: a slow home (0.5 audio-h/h finished in the window) sends the rest of the prep to the CPU pod', async () => {
    await mkItems({ 1: 'opus', 2: 'opus', 3: 'opus', 4: 'opus' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']); cpuPod();
    await feed(st, deps);
    L.sql.exec(`INSERT INTO done_log (host, type, audio_s, claimed, at) VALUES ('boss', 'cpu-prep', 3600, ?, ?)`, Date.now() - 600_000, Date.now() - 60_000);
    expect(Q.capacity(L.sql).by_type['cpu-prep'].drain).toBeCloseTo(0.5);   // 1 audio-h in the 2 h window
    const r = await rebalancePrep(st, deps);
    expect(r.moved).toBe(3);   // keep 2.5 h × 0.5 = 1.25 audio-h home (one talk), not 2.5 h at boss's 1x single-job speed (two)
  });
  it('no CPU pod engaged on the edge: nothing moves', async () => {
    await mkItems({ 1: 'opus', 2: 'opus', 3: 'opus' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']);
    await feed(st, deps);
    expect(await rebalancePrep(st, deps)).toMatchObject({ moved: 0, why: expect.stringMatching(/no edge cpu-prep host/) });
    expect(E.store.size).toBe(0);
  });
  it('a talk whose original still needs its Opus made (WAV, FLAC, MP3, video) stays on the LAN for prep: its original never goes up the uplink', async () => {
    await mkItems({ 1: 'opus', 2: 'wav', 3: 'flac', 4: 'opus', 5: 'mp3' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']); cpuPod();
    expect((await feed(st, { ...deps, max: 5 })).typed.fed).toBe(5);
    const r = await rebalancePrep(st, deps);
    expect(r).toMatchObject({ moved: 2, kept_lan: 3 });
    const onEdge = Object.values(st.qjobs).filter((x) => x.where === 'edge').map((x) => x.itemId).sort();
    expect(onEdge).toEqual([1, 4]);
    expect(decodedOnEdge()).toEqual([]);
    for (const id of [2, 3, 5]) expect(st.qjobs[Object.keys(st.qjobs).find((k) => st.qjobs[k].itemId === id)].where).toBeUndefined();
  });
  it('a home host that leased the step meanwhile keeps it; an edge that refuses a withdrawn step gets it back on the LAN', async () => {
    await mkItems({ 1: 'opus', 2: 'opus', 3: 'opus', 4: 'opus' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']); claimLan('aorus', ['gpu']); cpuPod();
    await feed(st, deps);
    const enq = E.q.enqueue; E.q.enqueue = async () => { throw Error('edge 503'); };
    try { expect((await rebalancePrep(st, deps)).moved).toBe(0); } finally { E.q.enqueue = enq; }
    expect(Q.stats(L.sql, Date.now(), 'cpu-prep').states.queued.n).toBe(4);   // nothing lost
    expect(Object.values(st.qjobs).every((x) => !x.where)).toBe(true);
    expect(st.q_move_prep_error.error).toMatch(/edge 503/);
  });
});

describe('a step that finished on the edge is pulled, routed and acked there whatever its type', () => {
  async function prepOnEdge(spec = { 1: 'opus', 2: 'opus', 3: 'opus', 4: 'opus' }) {
    await mkItems(spec);
    claimLan('boss', ['cpu-prep', 'cpu-finish']); cpuPod();
    claimLan('aorus', ['gpu']);
    await feed(st, deps); await rebalancePrep(st, deps);
    return deliver('cpu-prep', E, 'cpupod-x1');
  }
  it('edge prep → gpu stays on the edge (pods): inputs come from the edge results and never name the rebuilt light.flac (no 404)', async () => {
    const p = await prepOnEdge();
    Q.claim(L.sql, { host: 'aorus', types: ['cpu-prep'], contract: CONTRACT.contract });   // no home GPU now: the gpu step goes to the pods
    const r = (await pull(st, deps)).typed;
    expect(r).toMatchObject({ steps: 1, errors: 0 });
    const gq = Q.stats(E.sql, Date.now(), 'gpu').states.queued.n;
    expect(gq).toBe(1);
    const g = Q.claim(E.sql, { host: 'pod-9', types: ['gpu'], contract: CONTRACT.contract, vram_mb: 24000, ram_gb: 32 });
    expect(g.body.inputs.map((i) => i.path)).not.toContain('item/enhanced/light.flac');
    for (const i of g.body.inputs) { expect(i).toMatchObject({ store: 'results', id: p.id }); expect(E.store.has(`results/${i.id}/${i.path}`)).toBe(true); }   // what the agent fetches
    expect(E.store.has(`results/${p.id}/result.json`)).toBe(true);   // prep stays until gpu has run
    expect(decodedOnEdge()).toEqual([]);
  });
  it('edge prep → gpu on the home GPU (under TARGET_H): the original + prep files (no light.flac) copied into the LAN; prep acked on the edge after gpu', async () => {
    const p = await prepOnEdge();
    expect((await pull(st, deps)).typed).toMatchObject({ steps: 1, errors: 0 });
    const g = deliver('gpu', L, 'aorus');
    expect(g.item_id).toBe(p.item_id);
    expect(String(L.store.get(`files/${g.file_id}/in.opus`))).toBe(`audio-${p.item_id}`);
    expect(g.body.inputs.map((i) => i.path)).not.toContain('item/enhanced/light.flac');
    for (const i of g.body.inputs) { expect(i.store).toBe('files'); expect(sha(L.store.get(`files/${i.id}/${i.path}`))).toBe(i.sha256); }
    expect((await pull(st, deps)).typed).toMatchObject({ steps: 1, errors: 0, edge_acked: 1 });
    expect(E.store.has(`results/${p.id}/result.json`)).toBe(false);   // prep acked on the edge (R2 emptied)
    expect(deliver('cpu-finish', L, 'boss')).toBeTruthy();   // finish home (boss under TARGET_H)
    expect((await pull(st, deps)).typed).toMatchObject({ adopted: 1, errors: 0 });
    expect(st.done[0]).toMatchObject({ prep: 'cpupod-x1', gpu: 'aorus', finish: 'boss' });
  });
  it('edge gpu → cpu-finish on the CPU pod when no home host takes finish; adopted from the edge (no decoded master, Opus kept); every edge step acked', async () => {
    await prepOnEdge();
    Q.claim(L.sql, { host: 'aorus', types: ['cpu-prep'], contract: CONTRACT.contract });   // no home GPU
    Q.claim(L.sql, { host: 'boss', types: ['cpu-prep'], contract: CONTRACT.contract });    // no home finish either
    await pull(st, deps);
    const g = deliver('gpu', E, 'pod-9');
    expect((await pull(st, deps)).typed).toMatchObject({ steps: 1, errors: 0, edge_acked: 1 });   // the edge prep is acked when its gpu step routes
    expect(Q.stats(L.sql, Date.now(), 'cpu-finish').states).toEqual({});
    const f = deliver('cpu-finish', E, 'cpupod-x1');
    for (const i of f.body.inputs) expect(i).toMatchObject({ store: 'results', id: g.id });
    const r = (await pull(st, deps)).typed;
    expect(r).toMatchObject({ adopted: 1, errors: 0, edge_acked: 2 });   // gpu + finish
    const it = items[f.item_id], meta = JSON.parse(await readFile(join(it.dir, 'meta.json'), 'utf8'));
    expect(meta.master_transit).toBeUndefined();   // 11-01: the finish lists no decoded master; the kept stage is the Opus itself, adopted as is
    expect(st.done[0]).toMatchObject({ prep: 'cpupod-x1', gpu: 'pod-9', finish: 'cpupod-x1' });
    expect([...E.store.keys()].filter((k) => k.includes(`-${f.item_id}-`) && k.startsWith('results/'))).toEqual([]);
    expect(decodedOnEdge()).toEqual([]);
  });
  it('a WAV talk is planned for Opus; a prep result without the Opus input is refused — no gpu step, nothing on the edge (11-03: no WAV fallback)', async () => {
    await mkItems({ 1: 'wav' });
    claimLan('boss', ['cpu-prep', 'cpu-finish']);
    await feed(st, deps);
    expect(st.chains[1].plan).toMatchObject({ how: 'opus' });
    deliver('cpu-prep', L, 'boss');
    expect((await pull(st, { ...deps, stageInline: true })).typed).toMatchObject({ steps: 0, errors: 1 });
    expect(Q.stats(L.sql, Date.now(), 'gpu').states.queued?.n || 0).toBe(0);
    expect(E.store.size).toBe(0);
  });
});

describe('cpuRoute: home first, the edge only with a CPU pod and a full home queue', () => {
  const cap = (type, hosts, queued_h = 0) => ({ by_type: { [type]: { hosts, queued_h } } });
  it('routes', () => {
    expect(cpuRoute('cpu-finish', cap('cpu-finish', ['boss']), cap('cpu-finish', []))).toBe('lan');
    expect(cpuRoute('cpu-finish', cap('cpu-finish', ['boss'], 1), cap('cpu-finish', ['cpupod-a']))).toBe('lan');
    expect(cpuRoute('cpu-finish', cap('cpu-finish', ['boss'], TARGET_H), cap('cpu-finish', ['cpupod-a']))).toBe('edge');
    expect(cpuRoute('cpu-finish', cap('cpu-finish', []), cap('cpu-finish', ['cpupod-a']))).toBe('edge');
    expect(cpuRoute('cpu-finish', null, null)).toBe('lan');
  });
  it('reads the backlog at the MEASURED drain, not the hosts\' single-job speeds (11-01: 120 audio-h queued, queued_h 2.34, drain 24 → the CPU pod got 0 jobs)', () => {
    const lan = (extra) => ({ by_type: { 'cpu-finish': { hosts: ['aorus', 'boss'], queued_h: 2.34, queued_audio_h: 119.9, rate: 51.3, ...extra } } });
    const pod = cap('cpu-finish', ['cpupod-a']);
    expect(cpuRoute('cpu-finish', lan({}), pod)).toBe('lan');                 // older queue, no drain field: as before
    expect(cpuRoute('cpu-finish', lan({ drain: 24 }), pod)).toBe('edge');     // 5 h at what home actually drains
    expect(cpuRoute('cpu-finish', lan({ drain: 0 }), pod)).toBe('lan');       // cold start (nothing finished yet): the hosts' speeds
    expect(cpuRoute('cpu-finish', lan({ drain: 24, queued_audio_h: 30 }), pod)).toBe('lan');   // 1.25 h: home keeps it
    expect(cpuRoute('cpu-finish', lan({ drain: 24 }), cap('cpu-finish', []))).toBe('lan');      // no CPU pod: nowhere else to go
    expect(lanBacklogH({ drain: 24, queued_audio_h: 120 })).toBe(5);
    expect(lanDrain({ drain: 24, rate: 51 })).toBe(24);
    expect(lanDrain({ drain: 0, rate: 51 })).toBe(51);
  });
});

describe('createCpuPod: ONE RunPod CPU instance, rented by hand', () => {
  it('posts a CPU pod whose bootstrap marks the lane seen and runs the agent on cpu-prep,cpu-finish with no GPU; $/h comes from RunPod', async () => {
    const calls = [];
    const fetchFn = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'abc123', costPerHr: 0.987 }), { status: 200 }); };
    const dir = await mkdtemp(join(tmpdir(), 'cpupod-c-'));
    const pod = await createCpuPod({ publicKey: 'ssh-ed25519 AAA tower', queueKey: 'qk', vcpu: 32, flavor: 'cpu5c', fetchFn, pauseFile: join(dir, 'none'), acceptedWorkerFile: join(dir, 'none.json') });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://rest.runpod.io/v1/pods');
    const body = JSON.parse(calls[0].init.body);
    expect(body).toMatchObject({ computeType: 'CPU', cpuFlavorIds: ['cpu5c'], vcpuCount: 32, ports: ['22/tcp', '8788/http'] });   // 8788: the agent's GET /health via RunPod's proxy (health-poll.js)
    expect(body.name.startsWith(CPU_POD_PREFIX)).toBe(true);
    expect(body.gpuTypeIds).toBeUndefined();
    expect(body.env).toMatchObject({ MEDIA_QUEUE_KEY: 'qk', AGENT_SLOTS: String(cpuPodSlots(32)), PUBLIC_KEY: 'ssh-ed25519 AAA tower', SIFTER_IMAGE: body.imageName });
    expect(pod.health_port).toBe(8788);
    const boot = Buffer.from(body.env.SIFTER_BOOT_B64, 'base64').toString();
    expect(boot).toBe(BOOTSTRAP_CPU_AGENT);
    expect(boot.split('\n')[0]).toMatch(/touch \/workspace\/\.lane-seen/);   // first thing: the entrypoint's 25-min guard
    expect(boot).toMatch(/--types cpu-prep,cpu-finish/); expect(boot).toMatch(/--device none/); expect(boot).toMatch(/--idle-exit-min 10/);
    expect(boot).toMatch(/self-terminate\.sh/);
    expect(boot).not.toMatch(/--device cuda|nvidia/);
    expect(body.dockerEntrypoint.at(-1)).toMatch(/exec \/usr\/local\/bin\/entrypoint\.sh$/);   // the image's guards still run
    expect(pod).toMatchObject({ id: 'abc123', host: 'cpupod-abc123', costPerHr: 0.987, slots: 8 });
  });
  it('honors the rentals pause; no price is assumed when RunPod gives none', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cpupod-p-'));
    await writeFile(join(dir, 'pause'), JSON.stringify({ reason: 'test pause' }));
    let called = 0;
    const fetchFn = async () => { called++; return new Response(JSON.stringify({ id: 'z' }), { status: 200 }); };
    await expect(createCpuPod({ queueKey: 'qk', fetchFn, pauseFile: join(dir, 'pause'), acceptedWorkerFile: join(dir, 'x.json') })).rejects.toThrow(/paused/);
    expect(called).toBe(0);
    expect((await createCpuPod({ queueKey: 'qk', fetchFn, pauseFile: join(dir, 'none'), acceptedWorkerFile: join(dir, 'x.json') })).costPerHr).toBeNull();
  });
});
