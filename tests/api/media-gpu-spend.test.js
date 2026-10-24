// GPU spend ∝ work done (Chad 10-24): rent rule, ledger, reaper, dead-man switch, duplicate results, boot deadline, pod loss, system checks.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import * as C from '../../api/lib/media/cloud.js';
import { podsWanted, ledgerTick, efficiency, ledgerSummary, reapReason, runpodTime, LEDGER } from '../../api/lib/media/pod-ledger.js';
import { reapPass } from '../../api/lib/media/pod-reaper.js';
import { podChecks } from '../../scripts/lib/pod-checks.mjs';
import { mediaCloudRemasterJob } from '../../api/lib/ops/media-jobs.js';
import { runItem } from '../../api/lib/media/item.js';
import { sha256File } from '../../api/lib/media/pod-post.js';
import { createHash } from 'crypto';

const MIN = 60_000;
describe('rent rule: work first, rent second', () => {
  it('no queue → no pod; under minHours → none; pods = min(max, floor(hours / minHours))', () => {
    expect(podsWanted({ queueHours: 0, maxPods: 3, minHours: 2 })).toBe(0);
    expect(podsWanted({ queueHours: 1.9, maxPods: 3, minHours: 2 })).toBe(0);
    expect(podsWanted({ queueHours: 4.1, maxPods: 3, minHours: 2 })).toBe(2);
    expect(podsWanted({ queueHours: 90, maxPods: 3, minHours: 2 })).toBe(3);
  });
});

describe('ledger', () => {
  it('counts rented vs busy time from sampled GPU utilisation; idle_since set for a ready pod with no job, cleared when busy', () => {
    const st = { jobs: {}, pods: {} }, p = { id: 'a', status: 'ready', costPerHr: 0.6 };
    let t = 1_000_000_000_000;
    ledgerTick(st, [p], { a: 80 }, t);
    for (let i = 0; i < 10; i++) { t += MIN; ledgerTick(st, [p], { a: i < 7 ? 90 : 0 }, t); }
    expect(p.rented_ms).toBe(10 * MIN); expect(p.busy_ms).toBe(7 * MIN);
    expect(efficiency(st, t)).toBe(0.7);
    expect(p.idle_since).toBeDefined();
    t += MIN; ledgerTick(st, [p], { a: 95 }, t);
    expect(p.idle_since).toBeUndefined();
    st.pods.a = p; st.started = 1;
    const g = ledgerSummary(st, t, () => 1.23, 60);
    expect(g.rented_usd).toBeGreaterThan(g.productive_usd); expect(g.pods[0]).toMatchObject({ name: undefined, live: true });
  });
});

describe('the reaper touches only idle / stuck / unreachable / old / orphan / lane-less sifter-unipase-* pods', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  const pod = (o = {}) => ({ id: 'x', name: 'sifter-unipase-1', desiredStatus: 'RUNNING', lastStartedAt: '2026-10-24 14:30:00.000 +0000 UTC', ...o });
  const st = (o = {}) => ({ updated: now - MIN, pods: { x: { id: 'x', status: 'ready', lastOk: now - MIN, ...o } } });
  it('parses RunPod timestamps', () => expect(runpodTime('2026-10-24 07:33:53.393 +0000 UTC')).toBe(Date.parse('2026-10-24T07:33:53.393Z')));
  it('healthy → null; each failure mode → a reason', () => {
    expect(reapReason(pod(), st().pods.x, st(), now)).toBeNull();
    expect(reapReason(pod(), st({ idle_since: now - 11 * MIN }).pods.x, st({ idle_since: now - 11 * MIN }), now)).toMatch(/idle 11/);
    expect(reapReason(pod(), st({ quiet_since: now - 16 * MIN }).pods.x, st({ quiet_since: now - 16 * MIN }), now)).toBeNull();   // transfers keep the GPU quiet most of the time
    expect(reapReason(pod(), st({ quiet_since: now - 61 * MIN }).pods.x, st({ quiet_since: now - 61 * MIN }), now)).toMatch(/stuck/);
    expect(reapReason(pod(), st({ lastOk: now - 11 * MIN }).pods.x, st({ lastOk: now - 11 * MIN }), now)).toBeNull();   // a long upload queue is not unreachability
    expect(reapReason(pod(), st({ lastOk: now - 26 * MIN }).pods.x, st({ lastOk: now - 26 * MIN }), now)).toMatch(/unreachable/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 05:00:00.000 +0000 UTC' }), st().pods.x, st(), now)).toMatch(/lifetime/);
    expect(reapReason(pod(), null, st(), now)).toMatch(/orphan/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:58:00.000 +0000 UTC' }), null, st(), now)).toBeNull();   // just created: the lane has not saved it yet
    expect(reapReason(pod(), st().pods.x, { ...st(), updated: now - 11 * MIN }, now)).toMatch(/lane is not running/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:40:00.000 +0000 UTC' }), { id: 'x', status: 'booting' }, st(), now)).toMatch(/boot deadline/);
  });
  it('never touches a pod that is not named sifter-unipase-*', () => {
    expect(reapReason(pod({ name: 'searchlayerpdf-1', lastStartedAt: '2020-01-01 00:00:00.000 +0000 UTC' }), null, null, now)).toBeNull();
  });
  it('a pass terminates the verdicts and nothing else, and writes its file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-')), killed = [];
    const r = await reapPass({ now: () => now, write: true, reaperFile: join(dir, 'r.json'), state: st({ idle_since: now - 12 * MIN }),
      listPods: async () => [pod(), pod({ id: 'y', name: 'searchlayerpdf-9', lastStartedAt: '2020-01-01 00:00:00.000 +0000 UTC' }), pod({ id: 'z', name: 'sifter-unipase-2' })],
      terminatePod: async (id) => { killed.push(id); } });
    expect(killed.sort()).toEqual(['x', 'z']);   // x idle, z an untracked orphan; the foreign pod is never looked at
    expect(r.reaped.map((x) => x.name).sort()).toEqual(['sifter-unipase-1', 'sifter-unipase-2']);
    expect(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).reaped).toHaveLength(2);
  });
  it('the lane dead (controller killed): its pods are reaped by the independent pass', async () => {
    const killed = [];
    await reapPass({ now: () => now, write: false, state: { ...st(), updated: now - 30 * MIN }, listPods: async () => [pod()], terminatePod: async (id) => { killed.push(id); } });
    expect(killed).toEqual(['x']);
  });
});

describe('the pod dead-man switch (runpod_worker.py)', () => {
  const py = (args) => execFileSync('python3', ['-c', `
import importlib.util
sp = importlib.util.spec_from_file_location('w', 'scripts/media/runpod_worker.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
print(m.deadman(${args}))`], { encoding: 'utf8' }).trim();
  it('ends the pod when tower stops beating (10 min) or at the maximum lifetime; carries on while tower beats', () => {
    expect(py('1000, 0, 0, 10, 8')).toMatch(/no heartbeat/);
    expect(py('1000, 0, 900, 10, 8')).toBe('None');
    expect(py('100000, 0, 100000, 10, 8')).toMatch(/maximum lifetime/);
  });
  it('the bootstrap starts the worker with the 10-min idle, 10-min heartbeat and 8 h limits', () => {
    expect(C.BOOTSTRAP).toMatch(/--idle-min 10 --hb-min 10 --max-hours 8/);
  });
});

describe('system checks: CRITICAL findings for paid GPU', () => {
  const g = (o = {}) => ({ running: true, lane_updated_s: 20, spent_usd: 10, cap_usd: 60, efficiency_30m: 0.9, rented_usd: 5, productive_usd: 4.5, pods: [{ name: 'p1', live: true, idle_min: 0, cost_per_hr: 0.9 }], ...o });
  const bad = (x) => podChecks(x).filter((c) => !c.ok).map((c) => c.name);
  it('healthy → nothing', () => expect(bad(g())).toEqual([]));
  it('pods with no lane, an idle pod, low efficiency, spend near the cap', () => {
    expect(bad(g({ running: false }))).toEqual(['GPU pods without a lane']);
    expect(bad(g({ lane_updated_s: 900 }))).toEqual(['GPU pods without a lane']);
    expect(bad(g({ pods: [{ name: 'p1', live: true, idle_min: 12, cost_per_hr: 0.9 }] }))).toEqual(['GPU pods idle']);
    expect(bad(g({ efficiency_30m: 0.5 }))).toEqual(['GPU efficiency 30 min']);
    expect(bad(g({ spent_usd: 49 }))).toEqual(['GPU spend vs cap']);
    expect(podChecks(null)).toEqual([]);
  });
});

// ── the lane, with a fake pod fleet and a fake clock ──
const setup = ({ talks = 2, seconds = 600, poll = null } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'gs-'));
  const items = {};
  for (let id = 1; id <= talks; id++) {
    const dir = join(root, `t${id}`); mkdirSync(join(dir, 'original'), { recursive: true });
    writeFileSync(join(dir, 'original', 'a.mp3'), 'x'); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ original: 'original/a.mp3', duration_s: seconds }));
    items[id] = { id, slug: `talk-${id}`, dir, duration_s: seconds };
  }
  let t = 1_800_000_000_000, pods = 0;
  const spool = {}, queued = [], killed = [];
  const cloud = { ...C,
    createPod: vi.fn(async () => ({ id: `p${++pods}`, costPerHr: 0.34 })),
    getPod: vi.fn(async () => ({ publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: { gpuDisplayName: 'RTX 4090' } })),
    terminatePod: vi.fn(async (id) => { killed.push(id); return {}; }),
    accountBalance: vi.fn(async () => ({ balance: 157 })) };
  const run = vi.fn(async (cmd, args) => {
    const last = args.at(-1);
    if (poll) { const r = poll(cmd, last, args); if (r) return r; }
    if (cmd === 'scp') {
      const [src, dst] = args.slice(-2);
      if (dst.includes('/spool/') && dst.includes('/in.')) spool[dst.split('/spool/')[1].split('/')[0]] = 'uploaded';
      if (src.includes('root@')) { const f = src.split('/').pop(); writeFileSync(dst, f === 'done.json' ? '{"audio_s":600,"seconds":40,"gpu":"RTX 4090"}' : f === 'asr.json' ? '{"segments":[]}' : 'FLAC'); }
      return { stdout: '' };
    }
    if (last.includes('.worker-ready')) return { stdout: 'READY' };
    if (last.startsWith('cd /workspace/spool')) return { stdout: `${Object.keys(spool).filter((j) => spool[j] === 'ready').map((j) => `DONE ${j}`).join('\n')}\nUTIL 90` };
    const m = /touch \/workspace\/spool\/([^/]+)\/ready/.exec(last); if (m) spool[m[1]] = 'ready';
    const r = /rm -rf \/workspace\/spool\/(\S+)/.exec(last); if (r) delete spool[r[1]];
    return { stdout: 'ok' };
  });
  const deps = { cloud, run, homeHosts: [], stateFile: join(root, 'state.json'), publicKey: 'ssh-ed25519 AAA test', nap: async (ms) => { t += ms; }, now: () => t, draining: () => false,
    repo: { getMediaItem: async (id) => items[id], getMediaBySlug: async (s) => Object.values(items).find((x) => x.slug === s), remasterCandidates: async () => Object.values(items) },
    queue: async (n, p) => queued.push([n, p]) };
  return { root, items, deps, queued, killed, cloud, clock: () => t, spool };
};

describe('the lane: GPU is rented only for work', () => {
  it('an empty queue launches no pod', async () => {
    const x = setup({ talks: 0 });
    const r = await mediaCloudRemasterJob({ write: true, ids: null }, { ...x.deps, minHours: 2 });
    expect(x.cloud.createPod).not.toHaveBeenCalled(); expect(r.done).toBe(0);
  });
  it('a queue below the rent threshold launches no pod and the run ends spending nothing', async () => {
    const x = setup({ talks: 2, seconds: 600 });   // 0.33 h < 2 h
    const r = await mediaCloudRemasterJob({ write: true }, { ...x.deps, minHours: 2 });
    expect(x.cloud.createPod).not.toHaveBeenCalled(); expect(r.stop).toMatch(/below the 2 h/); expect(r.queue).toBe(2);
  });
  it('enough work: one pod per 2 audio hours, every talk done once, every pod terminated', async () => {
    const x = setup({ talks: 4, seconds: 3600 });   // 4 h → 2 pods
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 3 }, { ...x.deps, minHours: 2 });
    expect(x.cloud.createPod).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ done: 4, failed: 0, queue: 0 });
    expect(x.killed.sort()).toEqual(['p1', 'p2']);
    const st = JSON.parse(readFileSync(x.deps.stateFile, 'utf8'));
    expect(Object.values(st.pods).every((p) => p.rented_ms > 0 && p.busy_ms > 0)).toBe(true);
  });
  it('a boot failure (no SSH within 15 min) is terminated and replaced', async () => {
    let boots = 0;
    const x = setup({ talks: 2, seconds: 3600 });
    x.cloud.getPod = vi.fn(async () => (++boots <= 80 ? {} : { publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: {} }));   // 80 polls × 15 s = 20 min of nothing
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(x.cloud.createPod.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(x.killed).toContain('p1'); expect(r.done).toBe(2);
  });
  it('a pod lost mid-talk re-queues only its talk; the talk is done once on the replacement', async () => {
    let dead = true;
    const x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => (dead && cmd === 'ssh' && last.startsWith('cd /workspace/spool') ? (() => { throw new Error('ssh exit 255: Connection refused'); })() : null) });
    const orig = x.cloud.createPod; let n = 0;
    x.cloud.createPod = vi.fn(async (...a) => { if (++n >= 2) dead = false; return orig(...a); });
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(r).toMatchObject({ done: 2, failed: 0 });
    expect(x.queued.filter(([, p]) => p.id === 1)).toHaveLength(1);   // queued for its tower run exactly once
  });
  it('a duplicate result for a talk already done never queues a second tower run', async () => {
    const x = setup({ talks: 2, seconds: 3600 });
    mkdirSync(join(x.root), { recursive: true });
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, pods: {}, jobs: {}, queue: [1, 2], attempts: {}, done: [{ id: 1, slug: 'talk-1' }], failed: [], items: { 1: { duration_s: 3600 }, 2: { duration_s: 3600 } }, spent_closed: 0 }));
    await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(x.queued.filter(([, p]) => p.id === 1)).toHaveLength(0);
    expect(x.queued.filter(([, p]) => p.id === 2)).toHaveLength(1);
  });
  it('a talk Chad kept or deferred while queued is dropped without GPU time', async () => {
    const x = setup({ talks: 4, seconds: 3600 });
    writeFileSync(join(x.items[3].dir, 'meta.json'), JSON.stringify({ original: 'original/a.mp3', duration_s: 3600, remaster: { status: 'kept' } }));
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, pods: {}, jobs: {}, queue: [1, 2, 3, 4], attempts: {}, done: [], failed: [], items: { 1: { duration_s: 3600 }, 2: { duration_s: 3600 }, 3: { duration_s: 3600 }, 4: { duration_s: 3600 } }, spent_closed: 0 }));
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(r.done).toBe(3); expect(x.queued.map(([, p]) => p.id).sort()).toEqual([1, 2, 4]);
  });
  it('backpressure: no pod is rented and no talk handed out while tower holds more finished results than it can consume', async () => {
    const x = setup({ talks: 2, seconds: 3600 });
    let calls = 0, atFirstPod = null;
    const orig = x.cloud.createPod;
    x.cloud.createPod = vi.fn(async (...a) => { atFirstPod ??= calls; return orig(...a); });
    const ops = { pendingRuns: vi.fn(async () => (++calls <= 3 ? Array(20).fill({ status: 'queued' }) : [])) };
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2, ops, maxBacklog: 12 });
    expect(atFirstPod).toBeGreaterThanOrEqual(4); expect(r.done).toBe(2);
  });
  it('a pod idle past 10 min is closed by the lane too (and the ledger saw it idle)', () => {
    const st = { jobs: {}, pods: {} }, p = { id: 'a', status: 'ready', costPerHr: 1, created: 0 };
    let t = 5e11; ledgerTick(st, [p], { a: 0 }, t); t += 11 * MIN; ledgerTick(st, [p], { a: 0 }, t);
    expect(t - p.idle_since).toBeGreaterThan(LEDGER.idleMs);
  });
});

// ── tower takes the worker's guard / alignment / encodes and does none of it itself ──
describe('the pod does the heavy half of a remaster; tower validates and places', () => {
  const talk = async ({ stale = false } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'pp-'));
    for (const d of ['enhanced/pod/web', 'original', 'web']) mkdirSync(join(dir, d), { recursive: true });
    for (const f of ['unipase.cloud.flac', 'unipase.asr.json']) writeFileSync(join(dir, 'enhanced', f), '{}');
    writeFileSync(join(dir, 'transcript.raw.json'), '{"segments":[]}');
    const words = [{ w: 'Today,', s: 1.0, e: 1.5 }, { w: 'the', s: 1.5, e: 1.7 }, { w: 'world', s: 1.7, e: 2.0 }];
    const workJson = JSON.stringify({ paragraphs: [{ n: 1, t0: 1.0, t1: 2.0, words, sentences: [[0, 3]] }] });
    writeFileSync(join(dir, 'transcript.work.json'), workJson);
    const sha = createHash('sha256').update(stale ? 'other' : workJson).digest('hex');
    const pod = join(dir, 'enhanced', 'pod');
    writeFileSync(join(pod, 'unipase.flac'), 'FLAC'); writeFileSync(join(pod, 'unipase.guard.json'), '{}');
    writeFileSync(join(pod, 'realign.json'), JSON.stringify({ times: { 1: [[1.03, 1.52], [1.53, 1.72], null] } }));
    const web = { ogg: 'x.ogg', m4a: 'x.m4a', orig_ogg: 'x.original.ogg', orig_m4a: 'x.original.m4a' };
    for (const f of Object.values(web)) writeFileSync(join(pod, 'web', f), f);
    writeFileSync(join(pod, 'post.json'), JSON.stringify({ ok: true, work_sha: sha, guard: { sentences: 20, swapped: 1, swapped_pct: 5, fallback_sent_pct: 5, lag_ms: 20 }, realign: { placed: 2, total: 2 }, web }));
    const meta = { slug: 'x', original: 'original/a.mp3', duration_s: 3, quality: { overall: 'D' }, moments: [{ para: 1, i0: 0, i1: 3, t0_ms: 1000, t1_ms: 2000 }],
      enhancement: { listening: 'safe', variants: [{ name: 'original', file: 'original/a.mp3' }, { name: 'safe', file: 'original/a.mp3', af: 'loudnorm' }] },
      stages: Object.fromEntries(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog', 'headings', 'quotes', 'links', 'assess', 'update'].map((k) => [k, { at: 'x' }])) };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    const tools = { remasterGuard: vi.fn(async () => ({ sentences: 20, swapped: 1, swapped_pct: 5, fallback_sent_pct: 5, lag_ms: 25 })),
      tool: vi.fn(async (sub, input, opts) => { writeFileSync(opts.output, JSON.stringify({ times: { 1: [[1.03, 1.52], [1.53, 1.72], null] } })); return { placed: 2, total: 2 }; }),
      ffmpeg: vi.fn(async (args) => writeFileSync(args.at(-1), 'enc')), ffprobe: vi.fn(async () => ({ duration_s: 3 })), pcmStream: vi.fn(async () => {}) };
    const deps = { tools, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' };
    return { dir, tools, deps, item: { id: 5, dir, state: 'done', source_kind: 'file' } };
  };
  it('guard, alignment and the four encodes come from the worker: tower runs no guard, no aligner, no ffmpeg', async () => {
    const t = await talk();
    await runItem(t.item, { redo: ['remaster', 'realign', 'web'], only: ['remaster', 'realign', 'web'], remaster: true }, t.deps);
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.enhancement.listening).toBe('unipase'); expect(meta.aligned_to).toBe('unipase');
    expect(t.tools.remasterGuard).not.toHaveBeenCalled(); expect(t.tools.tool).not.toHaveBeenCalled(); expect(t.tools.ffmpeg).not.toHaveBeenCalled();
    expect(readFileSync(join(t.dir, 'web', 'x.ogg'), 'utf8')).toBe('x.ogg'); expect(readFileSync(join(t.dir, 'web', 'x.original.m4a'), 'utf8')).toBe('x.original.m4a');
    expect(meta.web_original).toEqual({ ogg: 'web/x.original.ogg', m4a: 'web/x.original.m4a' });
    expect(meta.qa.remaster.verdict).toMatch(/usable|partial/);
  });
  it('a worker result made for a DIFFERENT transcript is ignored: tower computes everything itself', async () => {
    const t = await talk({ stale: true });
    await runItem(t.item, { redo: ['remaster', 'realign', 'web'], only: ['remaster', 'realign', 'web'], remaster: true }, t.deps);
    expect(t.tools.remasterGuard).toHaveBeenCalled(); expect(t.tools.tool).toHaveBeenCalled(); expect(t.tools.ffmpeg).toHaveBeenCalled();
  });
});

describe('post.py orchestration (guard, then realign, then four encodes; held talks skip the rest)', () => {
  const run = (guardPct, realignOk = true) => {
    const dir = mkdtempSync(join(tmpdir(), 'po-'));
    writeFileSync(join(dir, 'in.mp3'), 'x'); writeFileSync(join(dir, 'out.flac'), 'y'); writeFileSync(join(dir, 'asr.json'), '{}');
    writeFileSync(join(dir, 'work.json'), '{"paragraphs":[]}');
    const sha = createHash('sha256').update('{"paragraphs":[]}').digest('hex');
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ post: { af: 'loudnorm', max_fallback_pct: 15, slug: 's', work_sha: sha, ogg: ['-c:a', 'libopus'], m4a: ['-c:a', 'aac'], orig_ogg: ['-c:a', 'libopus'], orig_m4a: ['-c:a', 'aac'] } }));
    const out = execFileSync('python3', ['-c', `
import sys, json, subprocess, types
sys.path.insert(0, 'scripts/media/worker')
import post
calls = []
def runner(cmd, **kw):
    calls.append(cmd[1].split('/')[-1] if cmd[0] != 'ffmpeg' else 'ffmpeg')
    if 'remaster_guard.py' in cmd[1]: return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': ${guardPct}, 'swapped_pct': ${guardPct}}) + '\\n')
    if 'media_tool.py' in cmd[1]:
        if not ${realignOk ? 'True' : 'False'}: raise RuntimeError('no whisperx')
        return types.SimpleNamespace(stdout=json.dumps({'placed': 100, 'total': 100}) + '\\n')
    return types.SimpleNamespace(stdout='')
r = post.process(${JSON.stringify(dir)}, runner=runner)
print(json.dumps({'r': {k: v for k, v in r.items() if k != 'guard'}, 'calls': calls}))`], { encoding: 'utf8' });
    return JSON.parse(out);
  };
  it('a passing talk: guard, realign, 4 encodes', () => {
    const o = run(4);
    expect(o.calls).toEqual(['remaster_guard.py', 'media_tool.py', 'ffmpeg', 'ffmpeg', 'ffmpeg', 'ffmpeg']);
    expect(o.r.web).toMatchObject({ ogg: 's.ogg', orig_m4a: 's.original.m4a' });
  });
  it('a held talk (> 15 %) stops after the guard — no GPU / CPU wasted on realign or encodes', () => {
    const o = run(30);
    expect(o.calls).toEqual(['remaster_guard.py']); expect(o.r.held).toBe(true);
  });
  it('no aligner on this machine: the guard result stands and tower aligns itself', () => {
    const o = run(4, false);
    expect(o.r.why).toMatch(/realign unavailable/); expect(o.r.web).toBeUndefined(); expect(o.calls).toEqual(['remaster_guard.py', 'media_tool.py']);
  });
});

describe('the worker decides: cleanup for held talks, the verdict, and strict mode (tower never reprocesses audio)', () => {
  const run = (guardSeq, { cleanup = true, bw = 5, haveCv = true, cleanupFails = false } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'cl-'));
    writeFileSync(join(dir, 'in.mp3'), 'x'); writeFileSync(join(dir, 'out.flac'), 'y'); writeFileSync(join(dir, 'asr.json'), '{}');
    writeFileSync(join(dir, 'work.json'), '{"paragraphs":[]}');
    const sha = createHash('sha256').update('{"paragraphs":[]}').digest('hex');
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ post: { af: 'loudnorm', max_fallback_pct: 15, slug: 's', work_sha: sha, bw_khz: bw, cleanup, ogg: [], m4a: [], orig_ogg: [], orig_m4a: [] } }));
    const out = execFileSync('python3', ['-c', `
import sys, json, types
sys.path.insert(0, 'scripts/media/worker')
import post
seq = iter(${JSON.stringify(guardSeq)}); calls = []
def runner(cmd, **kw):
    name = cmd[1].split('/')[-1] if cmd[0] != 'ffmpeg' else 'ffmpeg'; calls.append(name)
    if name == 'remaster_guard.py': return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': next(seq), 'swapped_pct': 0}) + '\\n')
    if name == 'cleanup.py':
        if ${cleanupFails ? 'True' : 'False'}: raise RuntimeError('no GPU')
        return types.SimpleNamespace(stdout=json.dumps({'chain': 'F', 'seconds': 1}) + '\\n')
    if name == 'media_tool.py': return types.SimpleNamespace(stdout=json.dumps({'placed': 100, 'total': 100}) + '\\n')
    return types.SimpleNamespace(stdout='')
r = post.process(${JSON.stringify(dir)}, runner=runner, transcribe=lambda p: {'segments': []}, cv_python=${haveCv ? 'sys.executable' : "'/nonexistent'"})
print(json.dumps({'method': r.get('method'), 'qa': r['qa'], 'held': r.get('held'), 'calls': calls, 'web': bool(r.get('web'))}))`], { encoding: 'utf8' });
    return JSON.parse(out);
  };
  it('a passing generative copy: usable / partial by fallback', () => {
    expect(run([3])).toMatchObject({ method: 'restored', qa: { verdict: 'usable' } });
    expect(run([11])).toMatchObject({ method: 'restored', qa: { verdict: 'partial' } });
  });
  it('a held copy gets the deterministic cleanup, the SAME guard, and is published as cleaned', () => {
    const o = run([40, 2]);
    expect(o).toMatchObject({ method: 'cleaned', qa: { verdict: 'cleaned' }, web: true });
    expect(o.calls.slice(0, 4)).toEqual(['remaster_guard.py', 'cleanup.py', 'remaster_guard.py', 'media_tool.py']);
    expect(o.qa.metrics).toMatchObject({ restored_fallback_pct: 40, fallback_pct: 2 });
  });
  it('a cleanup the guard also rejects, or that cannot run, leaves the talk held: review, or unrepairable at ~2 kHz', () => {
    expect(run([40, 30])).toMatchObject({ held: true, method: null, qa: { verdict: 'review' } });
    expect(run([40], { haveCv: false, bw: 1.95 })).toMatchObject({ held: true, qa: { verdict: 'unrepairable' } });
    expect(run([40], { cleanupFails: true })).toMatchObject({ held: true, qa: { verdict: 'review' } });
  });
});

describe('strict mode: with no complete worker result tower waits, it never touches the audio', () => {
  it('the remaster stage records "waiting" and runs no guard / aligner / ffmpeg', async () => {
    const prev = process.env.MEDIA_REMASTER_STRICT; process.env.MEDIA_REMASTER_STRICT = '1';
    try {
      const t = await (async () => {
        const dir = mkdtempSync(join(tmpdir(), 'st-'));
        mkdirSync(join(dir, 'enhanced'), { recursive: true }); mkdirSync(join(dir, 'original'), { recursive: true });
        for (const f of ['unipase.cloud.flac', 'unipase.asr.json']) writeFileSync(join(dir, 'enhanced', f), '{}');
        writeFileSync(join(dir, 'transcript.raw.json'), '{"segments":[]}');
        writeFileSync(join(dir, 'transcript.work.json'), JSON.stringify({ paragraphs: [{ n: 1, t0: 1, t1: 2, words: [{ w: 'a', s: 1, e: 2 }], sentences: [[0, 1]] }] }));
        writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'x', original: 'original/a.mp3', quality: { overall: 'D' }, enhancement: { listening: 'safe', variants: [{ name: 'original', file: 'original/a.mp3' }, { name: 'safe', file: 'original/a.mp3', af: 'loudnorm' }] },
          stages: Object.fromEntries(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog', 'headings', 'quotes', 'links', 'assess', 'update'].map((k) => [k, { at: 'x' }])) }));
        const tools = { remasterGuard: vi.fn(), tool: vi.fn(), ffmpeg: vi.fn() };
        return { dir, tools, deps: { tools, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' }, item: { id: 5, dir, state: 'done', source_kind: 'file' } };
      })();
      await runItem(t.item, { redo: ['remaster'], only: ['remaster'], remaster: true }, t.deps);
      const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
      expect(meta.remaster.status).toBe('waiting'); expect(meta.enhancement.listening).toBe('safe');
      expect(t.tools.remasterGuard).not.toHaveBeenCalled(); expect(t.tools.tool).not.toHaveBeenCalled(); expect(t.tools.ffmpeg).not.toHaveBeenCalled();
    } finally { if (prev === undefined) delete process.env.MEDIA_REMASTER_STRICT; else process.env.MEDIA_REMASTER_STRICT = prev; }
  });
});

describe('light tier backfill: raw original beside the playing copy, encoded on boss, never on tower', () => {
  it('encodes both raw copies through the remote host, stamps tier + fields; a busy/failed host just waits; touched talks are skipped', async () => {
    const { mediaLightBackfillJob } = await import('../../api/lib/ops/media-jobs.js');
    const mk = (id, extra = {}) => { const dir = mkdtempSync(join(tmpdir(), 'lt-')); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: `t${id}`, original: 'o.mp3', version: 2, enhancement: { listening: 'safe', variants: [] }, ...extra })); return { id, dir, slug: `t${id}` }; };
    const items = [mk(1), mk(2), mk(3, { web_original: { m4a: 'x' } }), mk(4)];
    const enc = vi.fn(async (recipe, input, output, o) => { if (o.job.startsWith('t2')) { o.local(); } writeFileSync(output, 'enc'); });
    const deps = { repo: { remasterCandidates: async () => items }, tools: { encodeRemote: enc }, ops: { pendingRuns: async (n) => (n === 'media-item' ? [{ params: { id: 4 } }] : []) } };
    const r = await mediaLightBackfillJob({ limit: 5 }, deps);
    expect(r.done).toEqual(['t1']); expect(r.waiting[0]).toMatch(/^t2: no free encode host/); expect(r.skipped).toBe(2);   // t3 has one already, t4 has a run on it
    const m = JSON.parse(readFileSync(join(items[0].dir, 'meta.json'), 'utf8'));
    expect(m).toMatchObject({ remaster_tier: 'light', version: 3, web_original: { ogg: 'web/t1.original.ogg', m4a: 'web/t1.original.m4a' } });
    expect(m.qa.remaster).toMatchObject({ verdict: 'light', tier: 'light' });
    expect(enc.mock.calls.every(([, , out]) => out.endsWith('.original.ogg') || out.endsWith('.original.m4a'))).toBe(true);
  });
});

describe('work orders: cleanup and post runs join the running lane', () => {
  it('orders are written once, taken once; post orders are queued after the fresh talks (their upload is five times the bytes) and a stale post result is dropped', async () => {
    const { mediaCloudOrderJob } = await import('../../api/lib/ops/media-jobs.js');
    const x = setup({ talks: 3, seconds: 3600 });
    for (const id of [1, 2]) { mkdirSync(join(x.items[id].dir, 'enhanced'), { recursive: true }); for (const f of ['unipase.cloud.flac', 'unipase.asr.json']) writeFileSync(join(x.items[id].dir, 'enhanced', f), '{}'); }
    writeFileSync(join(x.items[3].dir, 'meta.json'), JSON.stringify({ original: 'original/a.mp3', duration_s: 3600, remaster: { status: 'review' } }));
    const ordersFile = join(x.root, 'orders.json');
    const ops = { pendingRuns: async () => [{ status: 'queued', params: { id: 2 } }, { status: 'queued', params: { id: 1 } }, { status: 'running', params: { id: 3 } }] };
    const post = await mediaCloudOrderJob({ mode: 'post' }, { ...x.deps, ops, ordersFile });
    expect(post.ordered).toBe(2);
    const cleanup = await mediaCloudOrderJob({ mode: 'cleanup' }, { ...x.deps, ops, ordersFile });
    expect(cleanup.ordered).toBe(1);
    expect((await mediaCloudOrderJob({ mode: 'post' }, { ...x.deps, ops, ordersFile })).ordered).toBe(2);   // asked again: still two candidates, but the file dedupes them
    const taken = await C.takeOrders(ordersFile);
    expect(taken.map((o) => `${o.mode}:${o.id}`)).toEqual(['post:2', 'post:1', 'cleanup:3']);
    expect(await C.takeOrders(ordersFile)).toEqual([]);
  });
});

describe('RunPod calls never hang the lane', () => {
  it('retries a network error and a 502, gives a timeout signal to every call, and gives up after the last try', async () => {
    let n = 0, signals = 0;
    const flaky = async (url, init) => { signals += init.signal ? 1 : 0; n++; if (n === 1) throw new TypeError('fetch failed'); if (n === 2) return { status: 502, ok: false, text: async () => 'bad gateway' }; return { status: 200, ok: true, text: async () => '{"id":"p"}' }; };
    expect(await C.getPod('p', { fetchFn: flaky })).toEqual({ id: 'p' }); expect(n).toBe(3); expect(signals).toBe(3);
    await expect(C.fetchRetry('https://x', {}, { fetchFn: async () => { throw new TypeError('fetch failed'); }, tries: 2, backoffMs: 1 })).rejects.toThrow('fetch failed');
    const e = await C.getPod('p', { fetchFn: async () => ({ status: 404, ok: false, text: async () => 'nope' }) }).catch((x) => x);
    expect(e.message).toMatch(/404/);   // a real answer is not retried
  });
});

describe('transfers keep the pod alive in the ledger', () => {
  it('a successful ssh / scp refreshes lastOk', async () => {
    const p = { ip: '1.2.3.4', port: 22, lastOk: 0 };
    await C.podPut(async () => ({ stdout: '' }), p, 'a', '/b'); expect(p.lastOk).toBeGreaterThan(0);
    p.lastOk = 0; await C.podSsh(async () => ({ stdout: '' }), p, 'true'); expect(p.lastOk).toBeGreaterThan(0);
    p.lastOk = 0; await expect(C.podGet(async () => { throw new Error('refused'); }, p, '/a', 'b')).rejects.toThrow(); expect(p.lastOk).toBe(0);
  });
});

describe('realign that places nothing on the GPU is retried on the CPU', () => {
  it('0 of N on the first try, all of N with CUDA hidden: the talk is published, not held', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rg-'));
    writeFileSync(join(dir, 'in.mp3'), 'x'); writeFileSync(join(dir, 'out.flac'), 'y'); writeFileSync(join(dir, 'asr.json'), '{}'); writeFileSync(join(dir, 'work.json'), '{"paragraphs":[]}');
    const sha = createHash('sha256').update('{"paragraphs":[]}').digest('hex');
    writeFileSync(join(dir, 'job.json'), JSON.stringify({ post: { af: 'l', max_fallback_pct: 15, slug: 's', work_sha: sha, bw_khz: 5, ogg: [], m4a: [], orig_ogg: [], orig_m4a: [] } }));
    const o = JSON.parse(execFileSync('python3', ['-c', `
import sys, json, types
sys.path.insert(0, 'scripts/media/worker')
import post
envs = []
def runner(cmd, **kw):
    name = cmd[1].split('/')[-1] if cmd[0] != 'ffmpeg' else 'ffmpeg'
    if name == 'remaster_guard.py': return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': 3, 'swapped_pct': 3}) + '\\n', stderr='')
    if name == 'media_tool.py':
        cpu = (kw.get('env') or {}).get('CUDA_VISIBLE_DEVICES') == ''
        envs.append(cpu)
        return types.SimpleNamespace(stdout=json.dumps({'placed': 100 if cpu else 0, 'total': 100}) + '\\n', stderr='cuda error' if not cpu else '')
    return types.SimpleNamespace(stdout='', stderr='')
r = post.process(${JSON.stringify(dir)}, runner=runner)
print(json.dumps({'envs': envs, 'held': r.get('held'), 'web': bool(r.get('web')), 'gpu': r.get('realign_gpu'), 'verdict': r['qa']['verdict']}))`], { encoding: 'utf8' }));
    expect(o).toMatchObject({ envs: [false, true], web: true, gpu: { placed: 0, total: 100 }, verdict: 'usable' }); expect(o.held).toBeFalsy();
  });
});

describe('a pod whose worker stopped is replaced and its talks go back to the queue', () => {
  it('no status change for 4 min on a ready pod with jobs: closed, jobs requeued, a new pod takes them', async () => {
    let calls = 0;
    const x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => {
      if (cmd === 'ssh' && last.startsWith('cd /workspace/spool')) { calls++; return { stdout: `UTIL 0\nSTATUS {"at": 1, "state": "ok", "limit": 1}` }; }   // the same status forever: the worker is gone
      return null;
    } });
    const sleeps = { n: 0 }; x.deps.nap = async (ms) => { sleeps.n++; };
    let t = 1_800_000_000_000; x.deps.now = () => (t += 20_000);
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(x.killed.length).toBeGreaterThanOrEqual(1);
    expect(x.cloud.createPod.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
