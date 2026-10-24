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
    expect(reapReason(pod(), st({ quiet_since: now - 16 * MIN }).pods.x, st({ quiet_since: now - 16 * MIN }), now)).toMatch(/stuck/);
    expect(reapReason(pod(), st({ lastOk: now - 11 * MIN }).pods.x, st({ lastOk: now - 11 * MIN }), now)).toMatch(/unreachable/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 05:00:00.000 +0000 UTC' }), st().pods.x, st(), now)).toMatch(/lifetime/);
    expect(reapReason(pod(), null, st(), now)).toMatch(/orphan/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:58:00.000 +0000 UTC' }), null, st(), now)).toBeNull();   // just created: the lane has not saved it yet
    expect(reapReason(pod(), st().pods.x, { ...st(), updated: now - 11 * MIN }, now)).toMatch(/lane is not running/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:45:00.000 +0000 UTC' }), { id: 'x', status: 'booting' }, st(), now)).toMatch(/boot deadline/);
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
  it('a boot failure (no SSH within 8 min) is terminated and replaced', async () => {
    let boots = 0;
    const x = setup({ talks: 2, seconds: 3600 });
    x.cloud.getPod = vi.fn(async () => (++boots <= 40 ? {} : { publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: {} }));   // 40 polls × 15 s = 10 min of nothing
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
