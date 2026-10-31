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
  it('switch-over host: typed first, then legacy whole jobs it can run', () => {
    Q.enqueue(sql, [{ id: 'w', file_id: 'f-w', stages: ['whole'], invoice: { audio_s: 60 } }], T0 - 100);
    Q.enqueue(sql, [tj('g', 'gpu')], T0);
    const a = { host: 'aorus', types: ['gpu', 'media'], can: ['whole'] };
    expect([claim(a), claim(a), claim(a)]).toEqual(['g', 'w', null]);
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

describe('pod target (Chad 10-31): supportable = floor(min(R_prep, R_finish) / R_pod), limited only by work — no pod or $ cap', () => {
  it('supportable is set by the slower CPU stage; binding names it', () => {
    expect(Q.podTarget({ rPrep: 40, rFinish: 20, rPod: 4, workH: 1000 })).toEqual({ supportable: 5, work: 125, target: 5, binding: 'finish' });
    expect(Q.podTarget({ rPrep: 13, rFinish: 30, rPod: 4, workH: 1000 })).toMatchObject({ supportable: 3, target: 3, binding: 'prep' });
  });
  it('work limits the target: ceil(work / (R_pod · horizon)); binding = backlog', () => {
    expect(Q.podTarget({ rPrep: 40, rFinish: 40, rPod: 4, workH: 10, horizonH: 2 })).toMatchObject({ supportable: 10, work: 2, target: 2, binding: 'backlog' });
    expect(Q.podTarget({ rPrep: 40, rFinish: 40, rPod: 4, workH: 0 })).toMatchObject({ target: 0, binding: 'backlog' });
  });
  it('no cap: thousands of hours of work and fast CPU stages ask for as many pods as they support', () => {
    expect(Q.podTarget({ rPrep: 400, rFinish: 400, rPod: 4, workH: 10_000 }).target).toBe(100);
  });
  it('while any rate is still a prior, one pod (it measures)', () => {
    expect(Q.podTarget({ rPrep: 40, rFinish: 40, rPod: 4, workH: 500, measured: false })).toMatchObject({ target: 1, binding: 'measuring' });
    expect(Q.podTarget({ rPrep: 40, rFinish: 40, rPod: 4, workH: 0, measured: false })).toMatchObject({ target: 0 });
  });
  it('podPlan: measured throughput over priors; priors are named; staged = the edge gpu queue', () => {
    const lan = { by_type: { gpu: { queued_audio_h: 12, home_rate: 2, throughput: 2 }, 'cpu-prep': { queued_audio_h: 30, rate: 6, throughput: 20 }, 'cpu-finish': { queued_audio_h: 1, rate: 1, throughput: 12 } } };
    const edge = { by_type: { gpu: { queued_audio_h: 8, queued: 5, home_rate: 0, pod_throughput: 4 }, 'cpu-prep': {}, 'cpu-finish': {} } };
    const plan = Q.podPlan([lan, edge]);
    expect(plan).toMatchObject({ gpu_queued_h: 20, staged_h: 8, staged_n: 5, r_prep: 20, r_finish: 12, r_pod: 4, priors: [], supportable: 3, binding: 'finish', pods: 3 });
    const fresh = Q.podPlan([{ by_type: { gpu: { queued_audio_h: 50 }, 'cpu-prep': { rate: 6 }, 'cpu-finish': { rate: 1 } } }, null]);
    expect(fresh.priors).toEqual(['prep', 'finish', 'pod']);
    expect(fresh.r_pod).toBe(Q.PRIOR_POD);
    expect(fresh.staged_h).toBe(0);
    expect(fresh.target).toBe(1);
  });
});

describe('throughput: audio finished per busy hour, per host, over the rolling window', () => {
  it('overlapping jobs on one host count their union span; pods are averaged', () => {
    Q.enqueue(sql, [tj('a', 'gpu'), tj('b', 'gpu'), tj('c', 'gpu')], T0);
    const a = Q.claim(sql, { host: 'pod-1', types: ['gpu'] }, T0), b = Q.claim(sql, { host: 'pod-1', types: ['gpu'] }, T0);
    Q.done(sql, { id: a.id, lease: a.lease, result: {} }, T0 + 1_800_000);
    Q.done(sql, { id: b.id, lease: b.lease, result: {} }, T0 + 1_800_000);   // 2 h of audio in a 0.5 h busy span → 4/h
    const c = Q.claim(sql, { host: 'pod-2', types: ['gpu'] }, T0);
    Q.done(sql, { id: c.id, lease: c.lease, result: {} }, T0 + 1_800_000);   // 2/h
    const tp = Q.throughput(sql, 'gpu', T0 + 1_800_001);
    expect(tp.each['pod-1']).toBeCloseTo(4);
    expect(tp.pods).toBeCloseTo(3);
    expect(tp.total).toBeCloseTo(6);
    expect(Q.throughput(sql, 'gpu', T0 + 1_800_000 + Q.RATE_WINDOW_MS + 1).total).toBeNull();
  });
});

describe('claim order (Chad 10-31): the R2 buffer decides whether multi-role hosts prep first', () => {
  it('buffer low → prep, finish, gpu; buffer full → finish, gpu, prep', () => {
    expect(Q.claimOrder(['gpu'], ['cpu-prep', 'cpu-finish'], { buffer_low: true })).toEqual(['cpu-prep', 'cpu-finish', 'gpu']);
    expect(Q.claimOrder(['gpu'], ['cpu-prep', 'cpu-finish'], { buffer_low: false })).toEqual(['cpu-finish', 'gpu', 'cpu-prep']);
    expect(Q.claimOrder(['gpu', 'cpu-finish'], [], { buffer_low: true })).toEqual(['cpu-finish', 'gpu']);
  });
  it('CPU-only hosts (Boss prep → finish, tower finish), single-role hosts and no policy keep their own order', () => {
    expect(Q.claimOrder(['cpu-prep', 'cpu-finish'], [], { buffer_low: false })).toBeNull();
    expect(Q.claimOrder(['gpu'], [], { buffer_low: true })).toBeNull();
    expect(Q.claimOrder(['cpu-finish'], [], { buffer_low: true })).toBeNull();
    expect(Q.claimOrder(['gpu'], ['cpu-prep'], null)).toBeNull();
  });
  it('the policy reaches claim: Aorus (gpu + spill) takes prep first while the buffer is low, then finish before gpu', () => {
    Q.enqueue(sql, [tj('p', 'cpu-prep'), tj('g', 'gpu'), tj('f', 'cpu-finish')], T0);
    Q.setPolicy(sql, { buffer_low: true }, T0);
    const aorus = { host: 'aorus', types: ['gpu'], spill: ['cpu-prep', 'cpu-finish'] };
    expect(claim(aorus)).toBe('p');
    Q.setPolicy(sql, { buffer_low: false }, t);
    expect(claim(aorus)).toBe('f');
    expect(claim(aorus)).toBe('g');
  });
  it('a stale policy (tower stopped setting it) falls back to the host\'s own order', () => {
    Q.enqueue(sql, [tj('p', 'cpu-prep'), tj('g', 'gpu')], T0);
    Q.setPolicy(sql, { buffer_low: true }, T0);
    expect(Q.claim(sql, { host: 'aorus', types: ['gpu', 'cpu-prep'] }, T0 + Q.POLICY_STALE_MS + 1).id).toBe('g');
  });
});

describe('bufferPolicy: ~BUFFER_H of pod work staged on R2', () => {
  const plan = { r_pod: 4, staged_h: 3, target: 2, gpu_queued_h: 10, r_home_gpu: 2.5 };
  it('with pods wanted or live: want = BUFFER_H × R_pod × pods, against the edge', () => {
    expect(Q.bufferPolicy(plan, { pods: 1 })).toEqual({ where: 'edge', buffer_low: true, buffer_h: 3, want_h: 16 });
    expect(Q.bufferPolicy({ ...plan, staged_h: 20 }, { pods: 1 }).buffer_low).toBe(false);
  });
  it('no pods: the home GPUs\' LAN queue', () => {
    expect(Q.bufferPolicy({ ...plan, target: 0 }, { pods: 0 })).toEqual({ where: 'lan', buffer_low: false, buffer_h: 10, want_h: 5 });
  });
});
