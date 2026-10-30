// GPU spend ∝ work done (Chad 10-24): rent rule, ledger, reaper, dead-man switch, duplicate results, boot deadline, pod loss, system checks.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import * as C from '../../api/lib/media/cloud.js';
import { podsWanted, ledgerTick, efficiency, ledgerSummary, reapReason, runpodTime, LEDGER } from '../../api/lib/media/pod-ledger.js';
import { reapPass, reapedWhy } from '../../api/lib/media/pod-reaper.js';
import { podChecks } from '../../scripts/lib/pod-checks.mjs';
import { mediaCloudRemasterJob, mediaComputeJob, laneKeeperPass } from '../../api/lib/ops/media-jobs.js';
import { runItem } from '../../api/lib/media/item.js';
import { sha256File } from '../../api/lib/media/pod-post.js';
import { createHash } from 'crypto';

const MIN = 60_000;
describe('persistent operator rental pause', () => {
  it('uses actual runtime SSH ports when the REST networking fields are empty',async()=>{
    const c=await C.getPodConnection('p',{fetchFn:async()=>({status:200,json:async()=>({data:{myself:{pods:[{id:'p',runtime:{ports:[{ip:'10.0.0.1',privatePort:22,publicPort:22,type:'tcp',isIpPublic:false},{ip:'1.2.3.4',privatePort:22,publicPort:2222,type:'tcp',isIpPublic:true}]},machine:{gpuDisplayName:'RTX 4090'}}]}}})})});
    expect(c).toEqual({publicIp:'1.2.3.4',portMappings:{22:2222},machine:{gpuDisplayName:'RTX 4090'}});
  });
  it('keeps concurrent import orders and acknowledges only the exact persisted tickets', async()=>{
    const dir=mkdtempSync(join(tmpdir(),'concurrent-orders-')),file=join(dir,'orders.json');
    try{
      await Promise.all(Array.from({length:12},(_,i)=>C.addOrders([{id:i+1,mode:'whole',kind:'whole'}],file)));
      const pending=await C.peekOrders(file);expect(pending).toHaveLength(12);
      await C.addOrders([{id:1,mode:'whole',kind:'whole',redo:true}],file);
      await C.ackOrders(pending,file);
      const remaining=await C.peekOrders(file);expect(remaining).toHaveLength(1);expect(remaining[0]).toMatchObject({id:1,redo:true});
      await C.ackOrders(remaining,file);expect(await C.peekOrders(file)).toEqual([]);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('routes imports into the durable whole-recording farm queue without starting per-stage work',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'whole-farm-dispatch-'));
    try{
      writeFileSync(join(dir,'meta.json'),JSON.stringify({slug:'test',duration_s:100,original:'original/test.mp3',stages:{archive:{at:'now'}}}));
      const addOrders=vi.fn(),updateMediaItem=vi.fn();
      const r=await mediaComputeJob({id:1},{cloud:{acceptedWorker:async()=>({image:'accepted-digest',whole_imports:'cloud'}),addOrders},repo:{getMediaItem:async()=>({id:1,dir,slug:'test',state:'scheduled'}),updateMediaItem}});
      expect(r.whole_queued).toBe(true);expect(addOrders).toHaveBeenCalledWith([expect.objectContaining({id:1,kind:'whole',mode:'whole'})]);
      expect(updateMediaItem).toHaveBeenCalledWith(1,expect.objectContaining({state:'scheduled',stage:'whole'}));
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('new-import dispatch adopts the whole worker result and proceeds directly to text enrichment', async () => {
    const dir=mkdtempSync(join(tmpdir(),'whole-dispatch-'));
    try {
      writeFileSync(join(dir,'meta.json'),JSON.stringify({slug:'test',original:'original/test.mp3',stages:{archive:{at:'now'}}}));
      const updateMediaItem=vi.fn(),homeWholeRecording=vi.fn(async()=>({stages:{archive:{},grade:{},enhance:{},remaster:{},web:{},transcribe:{},diarize:{},trim:{}}}));
      const r=await mediaComputeJob({id:1},{cloud:{acceptedWorker:async()=>({image:'accepted-digest',whole_imports:true})},repo:{getMediaItem:async()=>({id:1,dir,state:'scheduled'}),updateMediaItem},tools:{},draining:()=>false,homeWholeRecording});
      expect(r.whole_worker).toBe(true);expect(homeWholeRecording).toHaveBeenCalledOnce();
      expect(updateMediaItem).toHaveBeenCalledWith(1,expect.objectContaining({state:'transcribed'}));
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it('accepts only an immutable image with recorded Aorus acceptance', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'accepted-worker-'));
    const file = join(directory, 'accepted.json');
    try {
      expect(await C.acceptedWorker(file)).toBeNull();
      writeFileSync(file, JSON.stringify({ image:'ghcr.io/chadananda/sifter-media-worker:latest', aorus_accepted_at:'2026-10-26' }));
      await expect(C.acceptedWorker(file)).rejects.toThrow('Invalid accepted worker');
      const accepted = {image:'ghcr.io/chadananda/sifter-media-worker@sha256:'+'a'.repeat(64),aorus_accepted_at:'2026-10-26'};
      writeFileSync(file, JSON.stringify(accepted));
      expect(await C.acceptedWorker(file)).toEqual(accepted);
      expect(C.BOOTSTRAP_WHOLE).toContain('HF_HUB_OFFLINE=1');
      expect(C.BOOTSTRAP_WHOLE).not.toMatch(/pkill|pip install|tar xzf/);
      expect(C.BOOTSTRAP_WHOLE).toContain('farm_worker.py');
    } finally { rmSync(directory, {recursive:true,force:true}); }
  });
  it('changes rental capacity from a durable runtime file without changing the requested maximum', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rental-capacity-'));
    const file = join(directory, 'capacity.json');
    try {
      writeFileSync(file, JSON.stringify({ maxPods: 1 }));
      expect(await C.rentalCapacity(3, file)).toBe(1);
      writeFileSync(file, JSON.stringify({ maxPods: 2 }));
      expect(await C.rentalCapacity(3, file)).toBe(2);
      expect(await C.rentalCapacity(1, file)).toBe(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('rents 32 vCPUs per GPU first, then any vCPU count; max_jobs scales with vCPU', async () => {
    const bodies = [];
    const fetchFn = vi.fn(async (url, init) => { const b = JSON.parse(init.body); bodies.push(b); return b.minVCPUPerGPU ? new Response('no capacity', { status: 400 }) : new Response('{"id":"p1"}', { status: 200 }); });
    const dir = mkdtempSync(join(tmpdir(), 'rent-'));
    expect(await C.createPod('sifter-unipase-t', 'k', { fetchFn, pauseFile: join(dir, 'none'), acceptedWorkerFile: join(dir, 'none.json') })).toEqual({ id: 'p1' });
    expect(bodies[0].minVCPUPerGPU).toBe(32);
    expect(bodies.at(-1).minVCPUPerGPU).toBeUndefined();
    expect([C.maxJobsFor({ vcpuCount: 32 }), C.maxJobsFor({ vcpuCount: 18 }), C.maxJobsFor({ vcpuCount: 8 }), C.maxJobsFor({ vcpuCount: 64 }), C.maxJobsFor({ memoryInGb: 46 }), C.maxJobsFor({})]).toEqual([12, 9, 6, 12, 8, 6]);
  });
  it('the capacity file sets the spend cap (over the env) and refuses bad values', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rental-cap-'));
    const file = join(directory, 'capacity.json');
    try {
      expect(C.capFromFile(file)).toBeNull();
      writeFileSync(file, JSON.stringify({ maxPods: 2 }));
      expect(await C.setRentalCapacity({ capUsd: 98 }, file)).toEqual({ maxPods: 2, capUsd: 98 });
      expect(C.capFromFile(file)).toBe(98);
      expect(await C.setRentalCapacity({ maxPods: 1 }, file)).toEqual({ maxPods: 1, capUsd: 98 });
      expect(await C.rentalCapacity(3, file)).toBe(1);
      await expect(C.setRentalCapacity({ maxPods: 0 }, file)).rejects.toThrow(/maxPods/);
      await expect(C.setRentalCapacity({ capUsd: 5000 }, file)).rejects.toThrow(/capUsd/);
      expect(C.capFromFile(file)).toBe(98);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('blocks the rental API before any request, until the pause file is removed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rental-pause-'));
    const pauseFile = join(directory, 'hold');
    const fetchFn = vi.fn();
    try {
      writeFileSync(pauseFile, 'Awaiting Aorus image validation');
      expect(await C.rentalPauseReason(pauseFile)).toBe('Awaiting Aorus image validation');
      await expect(C.createPod('sifter-unipase-test', 'public-key', { pauseFile, fetchFn })).rejects.toThrow(/rentals paused/);
      expect(fetchFn).not.toHaveBeenCalled();
      rmSync(pauseFile);
      expect(await C.rentalPauseReason(pauseFile)).toBeNull();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('prevents the lane keeper from restarting paid work after a reboot', async () => {
    const queue = vi.fn();
    const result = await laneKeeperPass({ cloud: { rentalPauseReason: async () => 'Awaiting Aorus image validation' }, queue });
    expect(result).toEqual({ action: 'paused', why: 'Awaiting Aorus image validation' });
    expect(queue).not.toHaveBeenCalled();
  });
});
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
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 05:00:00.000 +0000 UTC' }), st({ idle_since: now - MIN }).pods.x, st({ idle_since: now - MIN }), now)).toMatch(/lifetime/);
    expect(reapReason(pod(), null, st(), now)).toMatch(/orphan/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:58:00.000 +0000 UTC' }), null, st(), now)).toBeNull();   // just created: the lane has not saved it yet
    expect(reapReason(pod(), st().pods.x, { ...st(), updated: now - 11 * MIN }, now)).toMatch(/lane is not running/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-24 14:40:00.000 +0000 UTC' }), { id: 'x', status: 'booting' }, st(), now)).toMatch(/boot deadline/);
  });
  it('past 8 h a productive pod is spared (10-30: #348 reaped mid-run at 18.8x); idle / unreached ones are not; 24 h is hard', () => {
    const old = pod({ lastStartedAt: '2026-10-24 05:00:00.000 +0000 UTC' });   // 10 h
    expect(reapReason(old, st().pods.x, st(), now)).toBeNull();
    expect(reapReason(old, st({ lastOk: now - 6 * MIN }).pods.x, st({ lastOk: now - 6 * MIN }), now)).toMatch(/480 min lifetime/);
    expect(reapReason(old, st({ idle_since: now - 2 * MIN }).pods.x, st({ idle_since: now - 2 * MIN }), now)).toMatch(/480 min lifetime/);
    expect(reapReason(pod({ lastStartedAt: '2026-10-23 14:00:00.000 +0000 UTC' }), st().pods.x, st(), now)).toMatch(/1440 min hard lifetime/);
  });
  it("the reaper's reason is found by pod id, so the lane does not call a reaped pod 'unreachable'", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-')), f = join(dir, 'r.json');
    writeFileSync(f, JSON.stringify({ history: [{ id: 'x', why: 'idle 11 min' }] }));
    expect(await reapedWhy('x', f)).toBe('idle 11 min');
    expect(await reapedWhy('y', f)).toBeNull();
    expect(await reapedWhy('x', join(dir, 'none.json'))).toBeNull();
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
  it('the bootstrap starts the worker with the 10-min idle, 10-min heartbeat and 24 h limits', () => {
    expect(C.BOOTSTRAP).toMatch(/--idle-min 10 --hb-min 10 --max-hours 24/);
  });
});

describe('system checks: CRITICAL findings for paid GPU', () => {
  const g = (o = {}) => ({ running: true, lane_updated_s: 20, spent_usd: 10, cap_usd: 60, efficiency_30m: 0.9, rented_usd: 5, productive_usd: 4.5, pods: [{ name: 'p1', live: true, idle_min: 0, cost_per_hr: 0.9 }], ...o });
  const bad = (x) => podChecks(x).filter((c) => !c.ok).map((c) => c.name);
  it('healthy → nothing', () => expect(bad(g())).toEqual([]));
  it('an intentional rental pause is healthy with no pods, but still flags pods billing without a lane', () => {
    const paused = { rentals_paused: 'Aorus validation pending', queue: 20, lane_updated_s: 900 };
    expect(bad(g({ ...paused, pods: [] }))).toEqual([]);
    expect(bad(g({ ...paused, running: false }))).toEqual(['GPU pods without a lane']);
  });
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
    peekOrders:vi.fn(async()=>[]),ackOrders:vi.fn(async()=>{}),getPodConnection:vi.fn(async()=>({})),
    createPod: vi.fn(async () => ({ id: `p${++pods}`, costPerHr: 0.34 })),
    getPod: vi.fn(async () => ({ publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: { gpuDisplayName: 'RTX 4090' } })),
    terminatePod: vi.fn(async (id) => { killed.push(id); return {}; }),
    accountBalance: vi.fn(async () => ({ balance: 157 })) };
  const run = vi.fn(async (cmd, args) => {
    const last = args.at(-1);
    if (poll) { const r = poll(cmd, last, args); if (r) return r; }
    if (cmd === 'ssh' && last.startsWith('pgrep -fc')) return { stdout: '0' };
    if (cmd === 'scp') {
      const [src, dst] = args.slice(-2);
      if (dst.includes('/spool/') && dst.includes('/in.')) spool[dst.split('/spool/')[1].split('/')[0]] = 'uploaded';
      if (src.includes('root@')) { const f = src.split('/').pop(); writeFileSync(dst, f === 'done.json' ? '{"audio_s":600,"seconds":40,"gpu":"RTX 4090"}' : f === 'asr.json' ? '{"segments":[]}' : 'FLAC'); }
      return { stdout: '' };
    }
    if (last.includes('.worker-ready')) return { stdout: 'READY' };
    if (last.includes("device='cuda'")) return { stdout: 'CUDA_OK RTX 4090' };
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
  it('preserves the requested pool size across a drain under a temporary lower cap', async () => {
    const x = setup({ talks: 2, seconds: 3600 });
    const before = process.env.MEDIA_CLOUD_MAX_PODS;
    process.env.MEDIA_CLOUD_MAX_PODS = '1';
    let stop = false;
    try {
      const r = await mediaCloudRemasterJob({ write: true, maxPods: 3 }, { ...x.deps, draining: () => stop, nap: async () => { stop = true; } });
      expect(r).toMatchObject({ yielded: true, resume: { maxPods: 3 } });
      expect(x.cloud.createPod).toHaveBeenCalledTimes(1);
    } finally { if (before === undefined) delete process.env.MEDIA_CLOUD_MAX_PODS; else process.env.MEDIA_CLOUD_MAX_PODS = before; }
  });
  it('a persistent pause drains assigned work, leaves queued talks untouched, and closes the existing pod', async () => {
    const x = setup({ talks: 2, seconds: 3600 });
    x.cloud.rentalPauseReason = async () => 'Aorus validation pending';
    x.spool.j1 = 'ready';
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, pods: { p1: { id: 'p1', name: 'test-pod', status: 'ready', ip: '1.2.3.4', port: 2222, created: x.clock() - 1000, costPerHr: 0.34 } },
      jobs: { j1: { itemId: 1, pod: 'p1', since: x.clock() - 1000 } }, queue: [2], attempts: {}, done: [], failed: [],
      items: { 1: { duration_s: 3600 }, 2: { duration_s: 3600 } }, spent_closed: 0 }));
    const result = await mediaCloudRemasterJob({ write: true, maxPods: 0 }, x.deps);
    expect(result).toMatchObject({ done: 1, queue: 1, in_flight: 0, stop: 'operator pause: Aorus validation pending' });
    expect(x.cloud.createPod).not.toHaveBeenCalled();
    expect(x.killed).toEqual(['p1']);
    expect(x.queued.map(([, params]) => params.id)).toEqual([1]);
  });
  it('stages only one recording per pod per pass so other pods are polled between uploads', async () => {
    const x = setup({ talks: 4, seconds: 3600 });
    const times = [], run = x.deps.run;
    x.deps.run = async (cmd, args, opts) => {
      if (cmd === 'scp' && /\/spool\/.*\/in\./.test(args.at(-1))) times.push(x.clock());
      return run(cmd, args, opts);
    };
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, x.deps);
    expect(r.done).toBe(4);
    expect(times).toHaveLength(4);
    expect(new Set(times).size).toBe(4);
  });
  it('fetches only one completed recording per pod per pass, including a backlog of ready results', async () => {
    const x = setup({ talks: 3 });
    const times = [], run = x.deps.run;
    for (const id of [1, 2, 3]) x.spool[`j${id}`] = 'ready';
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, pods: { p1: { id: 'p1', name: 'test-pod', status: 'ready', ip: '1.2.3.4', port: 2222, created: x.clock() - 1000, costPerHr: 0.34 } },
      jobs: Object.fromEntries([1, 2, 3].map(id => [`j${id}`, { itemId: id, pod: 'p1', since: x.clock() - 1000 }])),
      queue: [], attempts: {}, done: [], failed: [], items: {}, spent_closed: 0 }));
    x.deps.run = async (cmd, args, opts) => {
      if (cmd === 'scp' && args.at(-2).endsWith('/done.json')) times.push(x.clock());
      return run(cmd, args, opts);
    };
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, x.deps);
    expect(r.done).toBe(3);
    expect(times).toHaveLength(3);
    expect(new Set(times).size).toBe(3);
  });
  it('persists a paid allocation before an existing pod starts a slow audio transfer', async () => {
    const x = setup({ talks: 4, seconds: 3600 });
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, proven: true, pods: { old: { id: 'old', name: 'old-pod', status: 'ready', ip: '1.2.3.4', port: 2222, created: x.clock() - 1000, costPerHr: 0.34 } },
      jobs: {}, queue: [1, 2, 3, 4], attempts: {}, done: [], failed: [], items: Object.fromEntries([1, 2, 3, 4].map(id => [id, { duration_s: 3600 }])), spent_closed: 0 }));
    const recorded = [], run = x.deps.run;
    x.deps.run = async (cmd, args, opts) => {
      if (cmd === 'scp' && /\/spool\/.*\/in\./.test(args.at(-1))) recorded.push(!!JSON.parse(readFileSync(x.deps.stateFile, 'utf8')).pods.p1);
      return run(cmd, args, opts);
    };
    await mediaCloudRemasterJob({ write: true, maxPods: 2 }, x.deps);
    expect(recorded[0]).toBe(true);
  });
  it('drains surplus pods under the configured cap without discarding assigned work or feeding them again', async () => {
    const x = setup({ talks: 4, seconds: 3600 });
    const before = process.env.MEDIA_CLOUD_MAX_PODS;
    process.env.MEDIA_CLOUD_MAX_PODS = '1';
    const events = [], run = x.deps.run, terminate = x.cloud.terminatePod;
    for (const id of [1, 2]) x.spool[`j${id}`] = 'ready';
    const pod = (id, ip, created) => ({ id, name: id, status: 'ready', ip, port: 2222, created, costPerHr: 0.34 });
    writeFileSync(x.deps.stateFile, JSON.stringify({ started: 1, proven: true, pods: { keep: pod('keep', '1.2.3.4', x.clock() - 2000), drain: pod('drain', '2.2.2.2', x.clock() - 1000) },
      jobs: { j1: { itemId: 1, pod: 'keep', since: x.clock() }, j2: { itemId: 2, pod: 'drain', since: x.clock() } },
      queue: [3, 4], attempts: {}, done: [], failed: [], items: Object.fromEntries([1, 2, 3, 4].map(id => [id, { duration_s: 3600 }])), spent_closed: 0 }));
    x.deps.run = async (cmd, args, opts) => {
      if (cmd === 'scp' && args.at(-2).endsWith('/j2/done.json')) events.push('fetched-surplus');
      if (cmd === 'scp' && /\/spool\/.*\/in\./.test(args.at(-1))) expect(args.at(-1)).not.toContain('2.2.2.2');
      return run(cmd, args, opts);
    };
    x.cloud.terminatePod = async (id) => { events.push(`closed-${id}`); return terminate(id); };
    try {
      const r = await mediaCloudRemasterJob({ write: true, maxPods: 3 }, x.deps);
      expect(r.done).toBe(4);
      expect(events.indexOf('closed-drain')).toBeGreaterThan(events.indexOf('fetched-surplus'));
      expect(events).toContain('fetched-surplus');
      expect(x.cloud.createPod).not.toHaveBeenCalled();
    } finally { if (before === undefined) delete process.env.MEDIA_CLOUD_MAX_PODS; else process.env.MEDIA_CLOUD_MAX_PODS = before; }
  });
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
    expect(x.cloud.createPod.mock.calls.length).toBeGreaterThanOrEqual(1); expect(x.cloud.createPod.mock.calls.length).toBeLessThanOrEqual(2);   // canary first, then up to one per 2 h
    expect(r).toMatchObject({ done: 4, failed: 0, queue: 0 });
    expect(x.killed.length).toBe(x.cloud.createPod.mock.calls.length);   // every pod terminated
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
  it('a pod whose GPU CUDA cannot open is closed before it gets a talk; the replacement does them (pod 342, 10-29)', async () => {
    let n = 0;
    const x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => (cmd === 'ssh' && last.includes("device='cuda'") && n === 1 ? { stdout: 'RuntimeError: CUDA unknown error' } : null) });
    const orig = x.cloud.createPod;
    x.cloud.createPod = vi.fn(async (...a) => { n++; return orig(...a); });
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(r).toMatchObject({ done: 2, failed: 0 });
    const st = JSON.parse(readFileSync(x.deps.stateFile, 'utf8'));
    expect(st.pods.p1).toMatchObject({ gpu_broken: true, why: 'GPU unusable: CUDA does not initialise' });
    expect(st.pods.p1.jobs_assigned || 0).toBe(0);
    expect(st.done.every((d) => d.pod !== 'p1')).toBe(true);
  });
  it('a machine whose GPU failed the proof is never booted again (343 landed on 342\'s machine)', async () => {
    const { brokenHosts } = await import('../../api/lib/media/cloud.js');
    expect([...brokenHosts({ pods: { a: { host_key: 'm1', gpu_broken: true }, b: { host_key: 'm2' }, c: { gpu_broken: true } } })]).toEqual(['m1']);
  });
  it('a pod whose talks keep failing (3 in 15 min, none finished) is dropped; the replacement does them', async () => {
    let n = 0;
    const x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => (cmd === 'ssh' && last.startsWith('cd /workspace/spool') && n === 1
      ? { stdout: 'STATUS {"limit":1,"running":0,"failures_15m":3,"gpu_util":0,"at":1}\nUTIL 0' } : null) });
    const orig = x.cloud.createPod;
    x.cloud.createPod = vi.fn(async (...a) => { n++; return orig(...a); });
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(r).toMatchObject({ done: 2, failed: 0 });
    const st = JSON.parse(readFileSync(x.deps.stateFile, 'utf8'));
    expect(st.pods.p1.why).toBe('jobs keep failing: 3 in 15 min, none finished');
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
    writeFileSync(join(pod, 'post.json'), JSON.stringify({ ok: true, work_sha: sha, guard: { sentences: 20, swapped: 0, swapped_pct: 0, fallback_sent_pct: 0, lag_ms: 20 }, realign: { placed: 2, total: 2 }, web }));
    const meta = { slug: 'x', original: 'original/a.mp3', duration_s: 3, quality: { overall: 'D' }, moments: [{ para: 1, i0: 0, i1: 3, t0_ms: 1000, t1_ms: 2000 }],
      enhancement: { listening: 'safe', variants: [{ name: 'original', file: 'original/a.mp3' }, { name: 'safe', file: 'original/a.mp3', af: 'loudnorm' }] },
      stages: Object.fromEntries(['archive', 'grade', 'enhance', 'transcribe', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog', 'headings', 'quotes', 'links', 'assess', 'update'].map((k) => [k, { at: 'x' }])) };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    const tools = { remasterGuard: vi.fn(async () => ({ sentences: 20, swapped: 0, swapped_pct: 0, fallback_sent_pct: 0, lag_ms: 25 })),
      tool: vi.fn(async (sub, input, opts) => { writeFileSync(opts.output, JSON.stringify({ times: { 1: [[1.03, 1.52], [1.53, 1.72], null] } })); return { placed: 2, total: 2 }; }),
      ffmpeg: vi.fn(async (args) => writeFileSync(args.at(-1), 'enc')), ffprobe: vi.fn(async () => ({ duration_s: 3 })), pcmStream: vi.fn(async () => {}) };
    const deps = { tools, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' };
    return { dir, tools, deps, item: { id: 5, dir, state: 'done', source_kind: 'file' } };
  };
  it('guard, alignment and the four encodes come from the worker: tower runs no guard, no aligner, no ffmpeg', async () => {
    const t = await talk();
    const before=JSON.parse(readFileSync(join(t.dir,'meta.json'),'utf8'));
    Object.assign(before,{version:12,audio_version:7});writeFileSync(join(t.dir,'meta.json'),JSON.stringify(before));
    await runItem(t.item, { redo: ['remaster', 'verify', 'realign', 'web'], only: ['remaster', 'verify', 'realign', 'web'], remaster: true }, { ...t.deps, verifyRemaster: async () => ({ verdict: 'changed' }) });
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.version).toBe(12);expect(meta.audio_version).toBe(8);
    expect(meta.audio_publish_pending).toBe(true);expect(meta.audio_alignment_version).toBe(8);
    expect(meta.enhancement.listening).toBe('unipase'); expect(meta.aligned_to).toBe('unipase');
    expect(t.tools.remasterGuard).not.toHaveBeenCalled(); expect(t.tools.tool).not.toHaveBeenCalled(); expect(t.tools.ffmpeg).not.toHaveBeenCalled();
    expect(readFileSync(join(t.dir, 'web', 'x.ogg'), 'utf8')).toBe('x.ogg'); expect(readFileSync(join(t.dir, 'web', 'x.original.m4a'), 'utf8')).toBe('x.original.m4a');
    expect(meta.web_original).toEqual({ ogg: 'web/x.original.ogg', m4a: 'web/x.original.m4a' });
    expect(meta.qa.remaster.verdict).toMatch(/usable|partial/);
  });
  it('verify: a remaster measured as unchanged is demoted to review, the listening copy reverts, the tier is dropped, and it is not complete', async () => {
    const t = await talk();
    await runItem(t.item, { redo: ['remaster', 'verify'], only: ['remaster', 'verify'], remaster: true }, { ...t.deps, verifyRemaster: async () => ({ verdict: 'unchanged', why: 'no measurable change vs original' }) });
    const meta = JSON.parse(readFileSync(join(t.dir, 'meta.json'), 'utf8'));
    expect(meta.stages.verify.verdict).toBe('unchanged');
    expect(meta.enhancement.listening).not.toBe('unipase');
    expect(meta.remaster_tier).toBeUndefined();
    expect(meta.remaster).toMatchObject({ status: 'review', verdict: 'review' });
    expect(meta.qa.remaster.verdict).not.toMatch(/usable|partial/);
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
    calls.append(cmd[0] if cmd[0] in ('ffmpeg', 'ffprobe') else cmd[1].split('/')[-1])
    if 'remaster_guard.py' in cmd[1]: return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': ${guardPct}, 'swapped_pct': ${guardPct}}) + '\\n')
    if 'media_tool.py' in cmd[1]:
        if not ${realignOk ? 'True' : 'False'}: raise RuntimeError('no whisperx')
        return types.SimpleNamespace(stdout=json.dumps({'placed': 100, 'total': 100}) + '\\n')
    return types.SimpleNamespace(stdout='')
r = post.process(${JSON.stringify(dir)}, runner=runner, silence=lambda *a, **k: {'version': 1, 'quiet_s': 0.0, 'stretches': 0, 'loud': [], 'loud_s': 0.0, 'voiced_kept': []})
print(json.dumps({'r': {k: v for k, v in r.items() if k != 'guard'}, 'calls': calls}))`], { encoding: 'utf8' });
    return JSON.parse(out);
  };
  it('a passing talk: guard, realign, 4 encodes', () => {
    const o = run(4);
    expect(o.calls).toEqual(['remaster_guard.py', 'media_tool.py', 'ffmpeg', 'ffmpeg', 'ffmpeg', 'ffmpeg', 'ffprobe']);
    expect(o.r.waveform_file).toBe('waveform.json');
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
r = post.process(${JSON.stringify(dir)}, runner=runner, transcribe=lambda p: {'segments': []}, cv_python=${haveCv ? 'sys.executable' : "'/nonexistent'"}, silence=lambda *a, **k: {'version': 1, 'quiet_s': 0.0, 'stretches': 0, 'loud': [], 'loud_s': 0.0, 'voiced_kept': []})
print(json.dumps({'method': r.get('method'), 'qa': r['qa'], 'held': r.get('held'), 'calls': calls, 'web': bool(r.get('web'))}))`], { encoding: 'utf8' });
    return JSON.parse(out);
  };
  it('a pure generative copy is usable; any sentence from the original is spliced, never published (Chad 10-29)', () => {
    expect(run([0])).toMatchObject({ method: 'restored', qa: { verdict: 'usable' } });
    expect(run([3])).toMatchObject({ method: 'restored', qa: { verdict: 'spliced' } });
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

describe('light backfill drains without holding the rental manager', () => {
  it('passes the stop callback into encodes and starts no later talk after a drain', async () => {
    const { mediaLightBackfillJob } = await import('../../api/lib/ops/media-jobs.js');
    const dir = mkdtempSync(join(tmpdir(), 'lt-drain-'));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'first', original: 'o.mp3' }));
    let draining = false;
    const stop = () => draining;
    const encodeRemote = vi.fn(async (recipe, input, output, opts) => {
      expect(opts.stop).toBe(stop);
      draining = true;
      throw Object.assign(new Error('draining'), { code: 'DRAIN' });
    });
    const r = await mediaLightBackfillJob({ limit: 5 }, { draining: stop, tools: { encodeRemote }, ops: { pendingRuns: async () => [] },
      repo: { remasterCandidates: async () => [{ id: 1, dir }, { id: 2, dir }] } });
    expect(encodeRemote).toHaveBeenCalledTimes(2);
    expect(r.done).toEqual([]);
    expect(r.waiting).toEqual([]);
  });
});

describe('work orders: cleanup and post runs join the running lane', () => {
  it('orders are written once, taken once; post orders are queued after the fresh talks (their upload is five times the bytes) and a stale post result is dropped', async () => {
    const { mediaCloudOrderJob } = await import('../../api/lib/ops/media-jobs.js');
    const x = setup({ talks: 3, seconds: 3600 });
    for (const id of [1, 2]) {
      mkdirSync(join(x.items[id].dir,'enhanced'),{recursive:true});
      writeFileSync(join(x.items[id].dir,'enhanced/unipase.cloud.flac'),Buffer.alloc(2048));
      writeFileSync(join(x.items[id].dir,'enhanced/unipase.asr.json'),'{"segments":[]}');
    }
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
    if name == 'remaster_guard.py': return types.SimpleNamespace(stdout=json.dumps({'sentences': 10, 'fallback_sent_pct': 0, 'swapped_pct': 0, 'swapped': 0}) + '\\n', stderr='')
    if name == 'media_tool.py':
        cpu = (kw.get('env') or {}).get('CUDA_VISIBLE_DEVICES') == ''
        envs.append(cpu)
        return types.SimpleNamespace(stdout=json.dumps({'placed': 100 if cpu else 0, 'total': 100}) + '\\n', stderr='cuda error' if not cpu else '')
    return types.SimpleNamespace(stdout='', stderr='')
r = post.process(${JSON.stringify(dir)}, runner=runner, silence=lambda *a, **k: {'version': 1, 'quiet_s': 0.0, 'stretches': 0, 'loud': [], 'loud_s': 0.0, 'voiced_kept': []})
print(json.dumps({'envs': envs, 'held': r.get('held'), 'web': bool(r.get('web')), 'gpu': r.get('realign_gpu'), 'verdict': r['qa']['verdict']}))`], { encoding: 'utf8' }));
    expect(o).toMatchObject({ envs: [false, true], web: true, gpu: { placed: 0, total: 100 }, verdict: 'usable' }); expect(o.held).toBeFalsy();
  });
});

describe('a pod whose worker stopped is replaced and its talks go back to the queue', () => {
  it('replaces a heartbeating worker stranded on staged inputs and requeues every talk', async () => {
    let x, gatePolls = 0;
    x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => {
      if (cmd === 'ssh' && last.startsWith('pgrep -fc')) return { stdout: ++gatePolls < 3 ? '2' : '0' };
      if (cmd === 'ssh' && last.startsWith('cd /workspace/spool') && !x.killed.length) {
        return { stdout: `WAIT stranded\nUTIL 0\nSTATUS ${JSON.stringify({ at: x.clock(), running: 0, cpu_jobs: 0, gpu_util: 0 })}` };
      }
      return null;
    } });
    const result = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(result).toMatchObject({ done: 2, failed: 0 });
    expect(x.killed).toContain('p1');
    expect(gatePolls).toBe(3);  // wait for auxiliary jobs before retiring the stalled worker
    expect(x.queued.map(([, p]) => p.id).sort()).toEqual([1, 2]);
    const state = JSON.parse(readFileSync(x.deps.stateFile, 'utf8'));
    expect(state.pods.p1.why).toMatch(/admission stalled/);
  });
  it('no status change for 4 min on a ready pod with jobs: closed, jobs requeued, a new pod takes them', async () => {
    let calls = 0;
    const x = setup({ talks: 2, seconds: 3600, poll: (cmd, last) => {
      if (cmd === 'ssh' && last.startsWith('cd /workspace/spool')) { calls++; return { stdout: `UTIL 0\nSTATUS {"at": 1, "state": "ok", "limit": 1}` }; }   // the same status forever: the worker is gone
      return null;
    } });
    const sleeps = { n: 0 }; x.deps.nap = async (ms) => { sleeps.n++; };
    let t = 1_800_000_000_000; x.deps.now = () => (t += 20_000);
    let loops = 0; x.deps.draining = () => ++loops > 60;   // the workers never come back: the run is stopped by a drain once the replacement has been rented
    await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(x.killed.length).toBeGreaterThanOrEqual(1);
    expect(x.cloud.createPod.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the baked image is found by the worker', () => {
  it('the bootstrap exports HF_HOME for the pre-loaded aligners (an ssh session has no image ENV)', () => {
    expect(C.BOOTSTRAP_BAKED).toMatch(/export HF_HOME=\/opt\/models\/hf/);
    expect(C.BOOTSTRAP_BAKED).toContain('TORCH_HOME=/root/.cache/torch');
    expect(C.BOOTSTRAP_BAKED.indexOf('export HF_HOME')).toBeLessThan(C.BOOTSTRAP_BAKED.indexOf('runpod_worker.py'));
  });
});

describe('the lane keeper: the cloud lane always comes back (10-25: down 3.7 h with 261 talks queued)', () => {
  const st0 = (o = {}) => ({ started: 1, finished: null, queue: [1, 2], jobs: {}, pods: {}, spent_closed: 0, ...o });
  const keep = async (state, { pending = [], balance = 120 } = {}) => {
    const queued = [];
    const r = await laneKeeperPass({ state, balance, ops: { pendingRuns: async () => pending }, queue: async (n, p, by) => queued.push([n, p, by]), cloud: C });
    return { r, queued };
  };
  it('queues a run when work waits and none is queued or running; leaves a live run alone; idle when nothing waits or the run finished', async () => {
    const a = await keep(st0()); expect(a.r.action).toBe('queued'); expect(a.queued[0][0]).toBe('media-cloud-remaster'); expect(a.queued[0][1].write).toBe(true);
    expect((await keep(st0(), { pending: [{ id: 5 }] })).r.action).toBe('running');
    expect((await keep(st0({ queue: [], jobs: {} }))).r.action).toBe('idle');
    expect((await keep(st0({ finished: 1 }))).r.action).toBe('idle');
  });
  it('a money stop that has cleared (balance topped up / cap raised) restarts the lane; one that still holds does not', async () => {
    const stopped = st0({ cloud_stopped: 'account balance $80 < $90 kept for SearchLayerPDF' });
    expect((await keep(stopped, { balance: 60 })).r.action).toBe('money');     // floor is 90 by default in the test env → still stopped
    const prev = process.env.MEDIA_CLOUD_KEEP_BALANCE; process.env.MEDIA_CLOUD_KEEP_BALANCE = '50';
    try { expect((await keep(stopped, { balance: 60 })).r.action).toBe('queued'); } finally { if (prev === undefined) delete process.env.MEDIA_CLOUD_KEEP_BALANCE; else process.env.MEDIA_CLOUD_KEEP_BALANCE = prev; }
  });
  it('a restart mid-run: the first tick of the resumed run writes the beat file at once (the lane beats again well inside 2 minutes)', async () => {
    const x = setup({ talks: 2, seconds: 7200 });
    let ticks = 0; x.deps.draining = () => ++ticks > 3;
    const r1 = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });
    expect(r1.yielded).toBe(true);                                   // the restart: the run yields and is requeued by the service
    const { existsSync, statSync } = await import('fs');
    const beatFile = `${x.deps.stateFile}.beat`;
    expect(existsSync(beatFile)).toBe(true);
    const before = statSync(beatFile).mtimeMs;
    x.deps.draining = () => false;
    const r2 = await mediaCloudRemasterJob({ write: true, maxPods: 1 }, { ...x.deps, minHours: 2 });   // the new process picks it up
    expect(r2.done).toBe(2); expect(statSync(beatFile).mtimeMs).toBeGreaterThanOrEqual(before);
  });
});

describe('rental circuit breaker + canary', () => {
  it('three pods in a row that never work stop the renting (30 min), cost is logged as wasted, and the next rental is ONE canary', async () => {
    const x = setup({ talks: 4, seconds: 7200, poll: (cmd, last) => { if (cmd === 'ssh' || cmd === 'scp') throw new Error('ssh exit 255: Connection refused'); return null; } });
    x.cloud.getPod = vi.fn(async () => ({ publicIp: '1.2.3.4', portMappings: { 22: 2222 }, machine: {}, costPerHr: 0.89 }));
    let calls = 0; const clock = { t: 1_800_000_000_000 };
    const deps = { ...x.deps, minHours: 2, now: () => clock.t, nap: async (ms) => { clock.t += ms; if (++calls > 400) throw new Error('runaway'); }, breakerMs: 3_600_000 };
    deps.draining = () => calls > 220;
    await mediaCloudRemasterJob({ write: true, maxPods: 3 }, deps);
    const st = JSON.parse(readFileSync(x.deps.stateFile, 'utf8'));
    expect(st.breaker_until).toBeGreaterThan(0); expect(st.wasted_usd).toBeGreaterThan(0); expect(st.waste_log.length).toBeGreaterThanOrEqual(3);
    expect(x.cloud.createPod.mock.calls.length).toBeLessThanOrEqual(4);       // 3 failures, then it stopped (never a fourth pod while the breaker is open)
    expect(st.proven).toBe(false);
  });
  it('the canary: while nothing is proven only ONE pod is rented, however much work waits; a finished talk lifts the limit', async () => {
    const x = setup({ talks: 4, seconds: 7200 });
    const r = await mediaCloudRemasterJob({ write: true, maxPods: 3 }, { ...x.deps, minHours: 2 });
    const first = x.cloud.createPod.mock.calls.length;
    expect(r.done).toBe(4); expect(first).toBeGreaterThanOrEqual(1);
    const st = JSON.parse(readFileSync(x.deps.stateFile, 'utf8')); expect(st.proven).toBe(true);
  });
});

describe('host preference learned from the ledger', () => {
  it('data centres that booted twice, fast and worked are preferred; SECURE after a breaker trip; per-dc boot times are in the stats', () => {
    const st = { pods: {
      a: { dc: 'EU-1', created: 0, ready_at: 200_000, jobs_assigned: 3, terminated: 1 }, b: { dc: 'EU-1', created: 0, ready_at: 260_000, jobs_assigned: 2, terminated: 1 },
      c: { dc: 'US-9', created: 0, ready_at: 900_000, jobs_assigned: 1, terminated: 1 }, d: { dc: 'US-9', created: 0, jobs_assigned: 0, terminated: 1 }, e: { dc: 'US-9', created: 0, ready_at: 500_000, jobs_assigned: 0, terminated: 1 } } };
    expect(C.hostStats(st)['EU-1']).toMatchObject({ n: 2, ok: 2, fails: 0, avg_boot_s: 230 });
    expect(C.rentalPrefer(st)).toEqual({ dcs: ['EU-1'], cloud: 'COMMUNITY' });
    expect(C.rentalPrefer({ ...st, breaker_trips: 1 }).cloud).toBe('SECURE');
  });
});
it('reports restoration throughput separately from new whole-recording work over 30 minutes',async()=>{
 const {processingRates}=await import('../../api/lib/media/pod-ledger.js');
 expect(processingRates({done:[{at:10000000,audio_s:1800},{at:9999999,audio_s:900,mode:'whole'},{at:1,audio_s:9999},{audio_s:9999}]},10000000)).toEqual({restoration_checks_per_hour:2,audio_jobs_per_hour:4,audio_hours_per_hour:1.5});
});
it('keeps complete remote recordings visible after the short dispatch run has finished',async()=>{
 const {activeRecordings}=await import('../../api/lib/media/pod-ledger.js');
 expect(activeRecordings({jobs:{j:{itemId:7,pod:'p',since:100}},pods:{p:{worker:{jobs:[{id:'j',stage:'restore_asr',at:200}]}}},home:{boss:{itemId:8,since:150}}})).toEqual([{id:7,stage:'transcribe',since:100,stage_at:200},{id:8,stage:'enhance',since:150}]);
});

describe('boss restores, aorus keeps the whole imports (Chad 10-28)', () => {
  it('the boss chain runs UniPASE (ROCm gate) first, then the CPU tail in the worker image; its record carries both timings', async () => {
    const { gateRestoreChain } = await import('../../api/lib/ops/media-jobs.js');
    const calls = [];
    const r = await gateRestoreChain('boss', { id: 1, slug: 's' }, { duration_s: 600 }, { T: {}, C: {}, fs: {}, image: 'img@sha256:x', stop: () => false,
      deps: { homeRemaster: async (h) => { calls.push(['unipase', h]); return { unipase_s: 90, asr_s: 40, seconds: 130, audio_s: 600 }; },
        homeRecording: async (h, it, m, o) => { calls.push(['post', h, o.mode]); return { seconds: 50, post_s: 50 }; } } });
    expect(calls).toEqual([['unipase', 'boss'], ['post', 'boss', 'post']]);
    expect(r).toMatchObject({ unipase_s: 90, asr_s: 40, post_s: 50, seconds: 180, gpu: 'boss' });
  });
  it('the backfill order lists the D/E talks that have only the basic cleanup, worst first, and none already restored / held / decided', async () => {
    const { mediaCloudOrderJob } = await import('../../api/lib/ops/media-jobs.js');
    const metas = { 1: { original: 'o', remaster: null, quality: { overall: 'E', raw: { bandwidth_khz: 3, snr_db: 10 } } }, 2: { original: 'o', quality: { overall: 'E', raw: { bandwidth_khz: 2, snr_db: 8 } } },
      3: { original: 'o', remaster: { status: 'done' }, quality: { overall: 'E', raw: {} } }, 4: { original: 'o', quality: { overall: 'D', raw: { bandwidth_khz: 5 } } }, 5: { original: 'o', remaster: { status: 'kept' }, quality: { overall: 'E', raw: {} } } };
    const file = join(mkdtempSync(join(tmpdir(), 'bf-')), 'orders.json');
    const items = Object.keys(metas).map((id) => ({ id: Number(id), slug: `t${id}`, dir: `/x/${id}`, duration_s: 3600, grade: metas[id].quality.overall }));
    const r = await mediaCloudOrderJob({ mode: 'backfill', grades: 'D,E' }, { repo: { remasterCandidates: async () => items }, cloud: C, ordersFile: file, readMeta: async (dir) => metas[dir.split('/').pop()] });
    expect(r.ordered).toBe(3); expect(r.sample[0]).toMatch(/^E 2kHz t2/);
    const taken = await C.takeOrders(file);
    expect(taken.map((o) => o.id)).toEqual([2, 1, 4]); expect(taken.every((o) => o.mode === 'restore' && !o.redo)).toBe(true);
  });
});

describe('a home host that stops answering rests; its talk goes back, no attempt used (10-28: boss offline, 41 talks lost their attempts)', () => {
  it('the error handler source carries the rule', () => {
    const src = readFileSync(join(import.meta.dirname, '../../api/lib/ops/media-jobs.js'), 'utf8');
    expect(src).toMatch(/hostUnreachable\(st, h, cur, err\?\.message \|\| err, now\(\), deps\.hostRestMs\)/);
    expect(src).toMatch(/\(st\.host_down\?\.\[h\.replace\(\/-\\d\+\$\/, ''\)\] \|\| 0\) > now\(\)/);
  });
  it('strikes 1-2 keep the task attached with a short rest; strike 3 requeues at the front and rests 10 min; the error text is kept (10-29: boss ran 663 while called unreachable)', async () => {
    const { hostUnreachable } = await import('../../api/lib/ops/media-jobs.js');
    const st = { home: { 'boss-2': { itemId: 663, since: 1 } }, queue: [5] };
    expect(hostUnreachable(st, 'boss-2', st.home['boss-2'], 'gate: Operation timed out', 1000)).toBe('kept');
    expect(st.home['boss-2']).toMatchObject({ itemId: 663, unreachable: 1 }); expect(st.queue).toEqual([5]);
    expect(st.host_down.boss).toBe(1000 + 120_000); expect(st.home_last_error).toMatch(/Operation timed out/);
    hostUnreachable(st, 'boss-2', st.home['boss-2'], 'x', 2000);
    expect(hostUnreachable(st, 'boss-2', st.home['boss-2'], 'Connection refused', 3000)).toBe('requeued');
    expect(st.home['boss-2']).toBeUndefined(); expect(st.queue).toEqual([663, 5]); expect(st.host_down.boss).toBe(3000 + 600_000);
    expect(st.home_last_error).toMatch(/host unreachable — resting 10 min \(Connection refused\)/);
  });
});

describe('talks taken off the air go first (Chad 10-29)', () => {
  it('first > whole > fresh > post, stable inside each band', async () => {
    const { laneOrder } = await import('../../api/lib/ops/media-jobs.js');
    const items = { 1: { mode: 'post' }, 2: {}, 3: { kind: 'whole' }, 4: { mode: 'post', first: true }, 5: { mode: 'restore', first: true }, 6: {} };
    expect(laneOrder([1, 2, 3, 4, 5, 6], items)).toEqual([4, 5, 3, 2, 6, 1]);
  });
  it('an order with first carries the flag', async () => {
    const { mediaCloudOrderJob } = await import('../../api/lib/ops/media-jobs.js');
    const x = setup({ talks: 1, seconds: 3600 });
    const ordersFile = join(x.root, 'orders-first.json');
    await mediaCloudOrderJob({ mode: 'restore', ids: [1], first: true }, { ...x.deps, ordersFile });
    expect((await C.takeOrders(ordersFile))[0]).toMatchObject({ id: 1, mode: 'restore', redo: true, first: true });
  });
  it('the newest first order goes to the very front, ahead of earlier first talks; a done talk with redo comes back', async () => {
    const { intakeOrder, laneOrder } = await import('../../api/lib/ops/media-jobs.js');
    const st = { jobs: { a: { itemId: 9 } }, queue: [2, 3, 4], done: [{ id: 7, mode: 'restore' }], failed: [], attempts: { 7: 2 },
      items: { 2: { first: true }, 3: { first: true }, 4: {}, 7: { mode: 'restore' } } };
    intakeOrder(st, { id: 7, slug: 's', mode: 'restore', redo: true, first: true });
    expect(laneOrder(st.queue, st.items)).toEqual([7, 2, 3, 4]);
    expect(st.done).toEqual([]); expect(st.attempts[7]).toBeUndefined();
    intakeOrder(st, { id: 9, mode: 'restore', first: true });   // already running: not queued twice
    expect(st.queue).toEqual([7, 2, 3, 4]);
    st.home = { 'boss-2': { itemId: 5 } };
    intakeOrder(st, { id: 5, mode: 'restore', first: true });   // running on a home host counts as running too
    expect(st.queue).toEqual([7, 2, 3, 4]);
  });
  it('a withdrawn order leaves the queue; a running one keeps its item and finishes (10-30)', async () => {
    const { intakeOrder, mediaCloudOrderJob } = await import('../../api/lib/ops/media-jobs.js');
    const st = { jobs: { a: { itemId: 9 } }, home: {}, queue: [7, 2], done: [], failed: [], attempts: {}, items: { 7: { redo: true }, 9: { redo: true }, 2: {} } };
    intakeOrder(st, { id: 7, withdraw: true }); intakeOrder(st, { id: 9, withdraw: true });
    expect(st.queue).toEqual([2]); expect(st.items[7]).toBeUndefined(); expect(st.items[9]).toEqual({ redo: true });
    const added = [];
    const r = await mediaCloudOrderJob({ mode: 'withdraw', ids: [7] }, { cloud: { addOrders: async (o) => added.push(...o) }, repo: { getMediaItem: async (id) => ({ id, slug: 's', dir: '/x' }) }, ops: {}, readMeta: async () => { throw new Error('not read'); } });
    expect(r.ordered).toBe(1); expect(added).toEqual([{ id: 7, slug: 's', mode: 'withdraw', withdraw: true }]);
  });
  it('an item whose mode is withdraw is never work: intake withdraws it, the lane drops any already queued (10-30)', async () => {
    const { intakeOrder, dropWithdrawn } = await import('../../api/lib/ops/media-jobs.js');
    const st = { jobs: {}, home: {}, queue: [7, 2, 8], done: [], failed: [], attempts: {}, items: { 7: { mode: 'restore', redo: true }, 2: { mode: 'withdraw' }, 8: { mode: 'post' } } };
    intakeOrder(st, { id: 7, mode: 'withdraw' });
    expect(st.queue).toEqual([2, 8]); expect(st.items[7]).toBeUndefined();
    expect(dropWithdrawn(st)).toEqual([8]); expect(st.items[2]).toBeUndefined();
  });
});
