// Typed media jobs (planning/stage-queue-20261031.md §3-4): cpu-prep | gpu | cpu-finish claimed by type in preference order, Aorus spill,
// priority bands as ORDER (1 claim in 5 to the oldest lower band), per-type measured rates, soft avoid, and the pod-count formula.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import * as Q from '../../worker/queue/core.js';

const doSql = () => {
  const db = new Database(':memory:');
  return { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } };
};
const T0 = 1e12;
const tj = (id, type, extra = {}) => ({ id, file_id: `f-${id}`, type, stages: [type], invoice: { audio_s: 3600, bytes: 5e7 }, ...extra });
let sql, t;
beforeEach(() => { sql = doSql(); Q.migrate(sql); t = T0; });
const claim = (a) => Q.claim(sql, a, ++t)?.id ?? null;

describe('typed claims', () => {
  it('a host takes only the types it names, in its preference order', () => {
    Q.enqueue(sql, [tj('p', 'cpu-prep'), tj('g', 'gpu'), tj('f', 'cpu-finish')], T0);
    expect(claim({ host: 'pod-1', types: ['gpu'] })).toBe('g');
    expect(claim({ host: 'pod-1', types: ['gpu'] })).toBeNull();                                // never CPU work on a pod
    expect(claim({ host: 'boss', types: ['cpu-finish', 'cpu-prep'] })).toBe('f');               // preference, not age
    expect(claim({ host: 'boss', types: ['cpu-finish', 'cpu-prep'] })).toBe('p');
  });
  it('legacy whole jobs are type media and still go to hosts that ask the old way', () => {
    Q.enqueue(sql, [{ id: 'w', file_id: 'f-w', stages: ['whole'], invoice: { audio_s: 60 } }, tj('g', 'gpu')], T0);
    expect(claim({ host: 'aorus', can: ['whole'] })).toBe('w');
    expect(claim({ host: 'aorus', can: ['whole'] })).toBeNull();                                // a typed job never reaches a legacy agent
  });
  it('a typed job is matched by its type, not by the agent listing every stage', () => {
    Q.enqueue(sql, [{ ...tj('g', 'gpu'), stages: ['grade', 'enhance', 'transcribe', 'diarize', 'remaster', 'realign'] }], T0);
    expect(claim({ host: 'aorus', types: ['gpu'], can: ['whole'] })).toBe('g');
  });
  it('a contract mismatch is never claimed (a stale image would be refused at tower)', () => {
    Q.enqueue(sql, [tj('g', 'gpu', { contract: 4 })], T0);
    expect(claim({ host: 'old', types: ['gpu'], contract: 3 })).toBeNull();
    expect(claim({ host: 'none', types: ['gpu'] })).toBeNull();
    expect(claim({ host: 'new', types: ['gpu'], contract: 4 })).toBe('g');
  });
  it('per-type contracts: { gpu: 4, cpu-finish: 2 }', () => {
    Q.enqueue(sql, [tj('g', 'gpu', { contract: 4 }), tj('f', 'cpu-finish', { contract: 2 })], T0);
    expect(claim({ host: 'h', types: ['cpu-finish', 'gpu'], contract: { gpu: 4, 'cpu-finish': 2 } })).toBe('f');
    expect(claim({ host: 'h', types: ['cpu-finish', 'gpu'], contract: { gpu: 4, 'cpu-finish': 2 } })).toBe('g');
  });
  it('VRAM / RAM needs still gate a typed job', () => {
    Q.enqueue(sql, [tj('g', 'gpu', { need: { vram_mb: 8000 } })], T0);
    expect(claim({ host: 'small', types: ['gpu'], vram_mb: 4000 })).toBeNull();
    expect(claim({ host: 'big', types: ['gpu'], vram_mb: 24000 })).toBe('g');
  });
});

describe('spill (Aorus: GPU first, spare cores take CPU only while the CPU queue is long)', () => {
  it('spill types are taken only when no preferred job exists and the CPU queue exceeds 1 h at the CPU hosts\' rate', () => {
    Q.enqueue(sql, [tj('p1', 'cpu-prep', { invoice: { audio_s: 1800 } })], T0);
    expect(claim({ host: 'aorus', types: ['gpu'], spill: ['cpu-prep', 'cpu-finish'] })).toBeNull();   // 0.5 h waiting: Boss has it
    Q.enqueue(sql, [tj('p2', 'cpu-prep', { invoice: { audio_s: 7200 } })], T0);
    expect(claim({ host: 'aorus', types: ['gpu'], spill: ['cpu-prep', 'cpu-finish'] })).toBe('p1');     // 2.5 h waiting
  });
  it('a preferred job always wins over spill', () => {
    Q.enqueue(sql, [tj('p', 'cpu-prep', { invoice: { audio_s: 36000 } }), tj('g', 'gpu')], T0);
    expect(claim({ host: 'aorus', types: ['gpu'], spill: ['cpu-prep'] })).toBe('g');
  });
  it('the backlog is measured against the engaged CPU hosts\' rate', () => {
    // boss runs cpu-prep at 10× real time: 5 h of audio = 0.5 h of work → no spill
    Q.enqueue(sql, [tj('a', 'cpu-prep', { invoice: { audio_s: 3600 } })], T0);
    const j = Q.claim(sql, { host: 'boss', types: ['cpu-prep'] }, T0);
    Q.done(sql, { id: 'a', lease: j.lease, result: {} }, T0 + 360_000);
    Q.enqueue(sql, [tj('b', 'cpu-prep', { invoice: { audio_s: 18000 } })], T0 + 360_000);
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu'], spill: ['cpu-prep'] }, T0 + 360_001)).toBeNull();
    expect(Q.typeBacklogH(sql, 'cpu-prep', T0 + 360_001)).toBeCloseTo(0.5);
  });
});

describe('priority is order, never a filter', () => {
  it('bands: new talk > remaster of a published talk > re-run; oldest first within a band', () => {
    Q.enqueue(sql, [tj('rerun', 'gpu', { band: 'rerun' })], T0);
    Q.enqueue(sql, [tj('rem', 'gpu', { band: 'remaster' })], T0 + 1);
    Q.enqueue(sql, [tj('new2', 'gpu', { band: 'new' })], T0 + 3);
    Q.enqueue(sql, [tj('new1', 'gpu', { band: 'new' })], T0 + 2);
    expect([1, 2, 3, 4].map(() => claim({ host: 'h', types: ['gpu'] }))).toEqual(['new1', 'new2', 'rem', 'rerun']);
  });
  it('every 5th claim of a type goes to the oldest job of a lower band, so no band starves', () => {
    const jobs = [];
    for (let i = 0; i < 10; i++) jobs.push(tj(`n${i}`, 'gpu', { band: 'new' }));
    Q.enqueue(sql, [tj('old-rerun', 'gpu', { band: 'rerun' })], T0 - 10);
    Q.enqueue(sql, [tj('old-rem', 'gpu', { band: 'remaster' })], T0 - 5);
    Q.enqueue(sql, jobs, T0);
    const got = Array.from({ length: 10 }, () => claim({ host: 'h', types: ['gpu'] }));
    expect(got[4]).toBe('old-rerun');    // the OLDEST lower-band job, whichever band
    expect(got[9]).toBe('old-rem');
    expect(got.filter((x) => x.startsWith('n'))).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']);
  });
  it('with nothing in a lower band, the 5th claim is just the next job', () => {
    for (let i = 0; i < 5; i++) Q.enqueue(sql, [tj(`n${i}`, 'gpu', { band: 'new' })], T0 + i);
    expect(Array.from({ length: 5 }, () => claim({ host: 'h', types: ['gpu'] }))).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
  });
});

describe('avoid: a failing host steps aside, but never strands the job', () => {
  it('the host that failed a job does not get it back while another could take it', () => {
    Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0 - 1);   // aorus is engaged for gpu
    Q.enqueue(sql, [tj('g', 'gpu')], T0);
    const j = Q.claim(sql, { host: 'pod-1', types: ['gpu'] }, T0);
    Q.fail(sql, { id: 'g', lease: j.lease, error: 'cuda oom' }, T0 + 1);
    expect(Q.claim(sql, { host: 'pod-1', types: ['gpu'] }, T0 + 2)).toBeNull();
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0 + 3).id).toBe('g');
  });
  it('a sole host for the type retries at once (avoid never strands a talk)', () => {
    Q.enqueue(sql, [tj('g', 'gpu')], T0);
    const j = Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0);
    Q.fail(sql, { id: 'g', lease: j.lease, error: 'x' }, T0 + 1);
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0 + 2).id).toBe('g');
  });
  it('after AVOID_MS the avoided host may take it again even while another host is engaged', () => {
    Q.claim(sql, { host: 'pod-1', types: ['gpu'] }, T0 - 1);
    Q.enqueue(sql, [tj('g', 'gpu')], T0);
    const j = Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0);
    Q.fail(sql, { id: 'g', lease: j.lease, error: 'x' }, T0 + 1);
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0 + Q.AVOID_MS + 2).id).toBe('g');
  });
});

describe('per-type measured rates', () => {
  it('a host learns one rate per job type; capacity reports each type\'s backlog in hours at its engaged hosts\' rate', () => {
    Q.enqueue(sql, [tj('p', 'cpu-prep'), tj('g', 'gpu')], T0);
    const p = Q.claim(sql, { host: 'boss', types: ['cpu-prep', 'cpu-finish'] }, T0);
    Q.done(sql, { id: 'p', lease: p.lease, result: {} }, T0 + 600_000);       // 1 h audio in 10 min → 6×
    const g = Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0);
    Q.done(sql, { id: 'g', lease: g.lease, result: {} }, T0 + 1_200_000);     // 3×
    Q.enqueue(sql, [tj('g2', 'gpu', { invoice: { audio_s: 6 * 3600 } }), tj('f', 'cpu-finish', { invoice: { audio_s: 3600 } })], T0 + 1_200_000);
    const c = Q.capacity(sql, T0 + 1_200_001);
    expect(c.by_type.gpu.rate).toBeCloseTo(3);
    expect(c.by_type.gpu.queued_audio_h).toBe(6);
    expect(c.by_type.gpu.queued_h).toBeCloseTo(2);
    expect(c.by_type['cpu-prep'].rate).toBeCloseTo(6);
    expect(c.by_type['cpu-finish'].hosts).toEqual(['boss']);
    expect(c.by_type['cpu-finish'].rate).toBe(1);                              // engaged, not yet measured for this type: real time
    const boss = c.hosts.find((h) => h.host === 'boss');
    expect(boss.types).toEqual(['cpu-prep', 'cpu-finish']);
    expect(boss.rates['cpu-prep']).toBeCloseTo(6);
  });
  it('the legacy whole window counts only legacy hosts and media jobs (a CPU-only Boss never inflates it)', () => {
    Q.enqueue(sql, [{ id: 'w', file_id: 'f', stages: ['whole'], invoice: { audio_s: 3600 } }, tj('p', 'cpu-prep')], T0);
    Q.claim(sql, { host: 'boss', types: ['cpu-prep'] }, T0);
    Q.claim(sql, { host: 'aorus', can: ['whole'] }, T0 + 1);
    Q.enqueue(sql, [{ id: 'w2', file_id: 'f2', stages: ['whole'], invoice: { audio_s: 3600 } }], T0 + 2);
    const c = Q.capacity(sql, T0 + 3);
    expect(c.hosts.filter((h) => h.types.includes('media')).map((h) => h.host)).toEqual(['aorus']);
    expect(c.rate).toBe(1);
    expect(c.queued_audio_h).toBe(1);
  });
});

describe('pod count', () => {
  const R = { gpuAorus: 2, prep: 6, pod: 4 };
  it('pods = clamp(ceil(((G + P) / 2 h − R_aorus) / R_pod), 0, maxPods)', () => {
    expect(Q.podsWanted({ gpuQueuedH: 20, prepQueuedH: 0, rAorus: R.gpuAorus, rPrep: R.prep, rPod: R.pod, maxPods: 6 })).toBe(2);   // (10 − 2) / 4
    expect(Q.podsWanted({ gpuQueuedH: 4, prepQueuedH: 0, rAorus: R.gpuAorus, rPrep: R.prep, rPod: R.pod, maxPods: 6 })).toBe(0);    // Aorus keeps up
    expect(Q.podsWanted({ gpuQueuedH: 200, prepQueuedH: 0, rAorus: R.gpuAorus, rPrep: R.prep, rPod: R.pod, maxPods: 3 })).toBe(3);
  });
  it('queued prep counts only as far as Boss can prepare it within the horizon (pods never outrun prep)', () => {
    // 100 h waiting for prep, Boss preps 6 audio-h/h → 12 h usable in 2 h; G 0 → (12/2 − 2)/4 = 1
    expect(Q.podsWanted({ gpuQueuedH: 0, prepQueuedH: 100, rAorus: 2, rPrep: 6, rPod: 4, maxPods: 6 })).toBe(1);
  });
  it('until a pod has been measured, at most one pod (it measures R_pod)', () => {
    expect(Q.podsWanted({ gpuQueuedH: 200, prepQueuedH: 0, rAorus: 2, rPrep: 6, rPod: null, maxPods: 6 })).toBe(1);
    expect(Q.podsWanted({ gpuQueuedH: 2, prepQueuedH: 0, rAorus: 2, rPrep: 6, rPod: null, maxPods: 6 })).toBe(0);
  });
  it('podPlan reads the rates from capacity: R_aorus = engaged non-pod GPU hosts, R_pod = the pods\' measured gpu rate', () => {
    Q.enqueue(sql, [tj('g1', 'gpu'), tj('g2', 'gpu')], T0);
    const a = Q.claim(sql, { host: 'aorus', types: ['gpu'] }, T0);
    Q.done(sql, { id: 'g1', lease: a.lease, result: {} }, T0 + 1_800_000);   // 2×
    const p = Q.claim(sql, { host: 'pod-9', types: ['gpu'] }, T0);
    Q.done(sql, { id: 'g2', lease: p.lease, result: {} }, T0 + 900_000);      // 4×
    Q.claim(sql, { host: 'boss', types: ['cpu-prep'] }, T0 + 1_800_000);
    Q.enqueue(sql, [tj('g3', 'gpu', { invoice: { audio_s: 20 * 3600 } })], T0 + 1_800_000);
    const plan = Q.podPlan(Q.capacity(sql, T0 + 1_800_001), { maxPods: 6 });
    expect(plan.r_aorus).toBeCloseTo(2);
    expect(plan.r_pod).toBeCloseTo(4);
    expect(plan.gpu_queued_h).toBe(20);
    expect(plan.pods).toBe(2);
  });
  it('podPlan merges tower\'s two queues (LAN: Aorus + Boss; edge: pods)', () => {
    const lan = { by_type: { gpu: { queued_audio_h: 12, home_rate: 2, pod_rate: null }, 'cpu-prep': { queued_audio_h: 0, rate: 6 } } };
    const edge = { by_type: { gpu: { queued_audio_h: 8, home_rate: 0, pod_rate: 4 }, 'cpu-prep': { queued_audio_h: 0, rate: 0 } } };
    expect(Q.podPlan([lan, edge, null], { maxPods: 6 })).toMatchObject({ gpu_queued_h: 20, r_aorus: 2, r_pod: 4, r_prep: 6, pods: 2 });
  });
});
