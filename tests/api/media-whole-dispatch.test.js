// Whole-order dispatch (Chad 10-28): vendor-blind (boss AMD and aorus NVIDIA both take whole orders), and ONE host per order — upload is the
// bottleneck, so the same audio never goes to two computers.
import { describe, it, expect } from 'vitest';
import { homeEligibleItem, homePick, podPick, homeImage, silences, HOME_BUILDS, homeScaleMode, homeGpuOrder, homeRemaster } from '../../api/lib/ops/media-jobs.js';
import { readFileSync } from 'fs';

const wholeOnly = { queue: [1] };
const st = (extra = {}) => ({ items: { 1: { kind: 'whole' }, 2: { mode: 'restore' } }, home: {}, queue: [1, 2], ...extra });
const accepted = { boss_whole: true, quiet_hosts: ['aorus', 'boss'] };

describe('whole dispatch', () => {
  it('boss takes a whole order once its GPU path is accepted; before that it does not', () => {
    expect(homeEligibleItem('boss', 1, st(wholeOnly), accepted)).toBe(true);
    expect(homeEligibleItem('boss', 1, st(wholeOnly), { ...accepted, boss_whole: false })).toBe(false);
  });
  it('boss takes no whole order while the typed pipeline runs (MEDIA_POD_TYPED): its gate image is not the accepted one', () => {
    expect(homeEligibleItem('boss', 1, st(wholeOnly), accepted, { MEDIA_POD_TYPED: '1' })).toBe(false);
    expect(homeEligibleItem('aorus-1', 1, st(wholeOnly), accepted, { MEDIA_POD_TYPED: '1' })).toBe(true);
  });
  it('scale mode (pods engaged): home hosts take NO gpu or whole order — restore and whole stay for the pods; post/cleanup (CPU) still go home (11-01: boss pegged on UniPASE for #2459)', () => {
    const s = (plan) => ({ items: { 1: { kind: 'whole' }, 2: { mode: 'restore' }, 3: { mode: 'post' }, 4: { mode: 'cleanup' }, 5: {} }, home: {}, queue: [1, 2, 3, 4, 5], pod_plan: plan });
    const typed = { MEDIA_POD_TYPED: '1' };
    for (const host of ['boss', 'aorus-1']) {
      for (const plan of [{ mode: 'scale' }, { mode: 'x', buffer: { home_gpu: false } }]) {
        expect(homeEligibleItem(host, 1, s(plan), accepted, typed)).toBe(false);
        expect(homeEligibleItem(host, 2, s(plan), accepted, typed)).toBe(false);
        expect(homeEligibleItem(host, 5, s(plan), accepted, typed)).toBe(false);   // no mode = restore
        expect(homeEligibleItem(host, 3, s(plan), accepted, typed)).toBe(true);
        expect(homeEligibleItem(host, 4, s(plan), accepted, typed)).toBe(host !== 'boss');   // cleanup never went to the gate host
      }
    }
    const noWhole = (plan) => ({ ...s(plan), queue: [2, 3] });   // a restore yields to a waiting whole order (new talks first), so none here
    expect(homeEligibleItem('aorus-1', 2, noWhole({ mode: 'small' }), accepted, typed)).toBe(true);   // small mode unchanged: aorus does it all
    expect(homeEligibleItem('aorus-1', 1, s({ mode: 'small' }), accepted, typed)).toBe(true);
    expect(homeEligibleItem('aorus-1', 2, noWhole({ mode: 'scale' }), accepted, {})).toBe(true);     // no typed pipeline: no pods to leave it for
    expect(homeScaleMode({ pod_plan: { mode: 'scale' } }, typed)).toBe(true);
    expect(homeGpuOrder({ items: { 7: { mode: 'post', kind: 'whole' } } }, 7)).toBe(true);
  });
  it('aorus takes whole orders and restores alike — no host is reserved for new talks', () => {
    expect(homeEligibleItem('aorus-1', 1, st(wholeOnly), accepted)).toBe(true);
    expect(homeEligibleItem('aorus-1', 2, st({ queue: [2] }), accepted)).toBe(true);
  });
  it('a held lane (tower backlog) still hands a home host post orders — they drain that backlog — and nothing else', () => {
    const s = { items: { 1: { kind: 'whole' }, 2: { mode: 'restore' }, 3: { mode: 'post' } }, home: {}, queue: [1, 2, 3] };
    expect(homePick('aorus-1', s, accepted, true)).toBe(0);    // held: whole talks and post orders still go, whole first (10-31)
    expect(homePick('aorus-1', s, accepted, false)).toBe(0);   // not held: the whole talk first (10-31)
    expect(homePick('aorus-1', { ...s, queue: [2, 3] }, accepted, true)).toBe(1);   // no whole waiting: the post order
    expect(homePick('aorus-1', { ...s, queue: [2] }, accepted, true)).toBe(-1);
  });
  it('a held lane still hands out whole talks — they finish on the worker and never feed tower\'s backlog — to home hosts and pods', () => {
    const s = { items: { 1: { kind: 'whole' }, 2: { mode: 'restore' } }, home: {}, queue: [2, 1] };
    expect(homePick('aorus-1', s, accepted, true)).toBe(1);    // the waiting restore cannot run, so it does not keep the host idle
    expect(homePick('aorus-1', s, accepted, false)).toBe(1);   // not held: new talks first (Chad 10-31)
    const pod = { image: 'img' }, aw = { image: 'img' };
    expect(podPick(s, pod, aw, true)).toBe(1);
    expect(podPick(s, pod, aw, false)).toBe(1);                // whole first even though the restore is ahead in the queue
    expect(podPick(s, { image: 'old' }, aw, true)).toBe(-1);   // whole talks only on the accepted image
    expect(podPick(s, { ...pod, whole_since_restore: 9 }, aw, false)).toBe(1);   // no restore cut-in while a whole talk waits
    expect(podPick(s, { image: 'old' }, aw, false)).toBe(0);   // a pod off the accepted image can't take whole, so it takes the restore
  });
  it('an order another host holds is never eligible: the same audio is not sent to two hosts', () => {
    const s = st({ home: { 'aorus-1': { itemId: 1 } } });
    expect(homeEligibleItem('boss', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('aorus-2', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('boss', 2, { ...s, queue: [2] }, accepted)).toBe(true);   // other orders are unaffected
  });
  it('new talks first (Chad 10-31): a remaster waits while a whole order the host can take is queued, then runs', () => {
    expect(homeEligibleItem('aorus-1', 1, st(), accepted)).toBe(true);           // whole 1 is waiting
    expect(homeEligibleItem('aorus-1', 2, st(), accepted)).toBe(false);          // restore 2 yields
    expect(homeEligibleItem('aorus-1', 2, st({ queue: [2] }), accepted)).toBe(true);   // no whole waiting: remasters run
    const s = st({ home: { aorus: { itemId: 1 } } });
    expect(homeEligibleItem('aorus-2', 2, s, accepted)).toBe(true);              // the only whole is already held by another host
    expect(homeEligibleItem('boss', 2, st(), { ...accepted, boss_whole: false })).toBe(true);   // boss can't take whole yet: it must not idle
  });
  it('a home host whose image lacks the silencer takes nothing (Chad 10-29: its result would carry the restorer\'s noise)', () => {
    expect(homeEligibleItem('aorus-2', 2, st(), { ...accepted, quiet_hosts: ['boss'] })).toBe(false);
    expect(homeEligibleItem('boss', 2, st({ queue: [2] }), { ...accepted, quiet_hosts: ['boss'] })).toBe(true);
    expect(homeEligibleItem('boss', 2, st(), { boss_whole: true })).toBe(false);
  });
  it('a home host runs its own build of the accepted image when one is named; others and pods keep the accepted digest', () => {
    const a = { image: 'ghcr.io/x@sha256:1', home_image: { aorus: 'sifter-media-worker:quiet-1' } };
    expect(homeImage('aorus-3', a)).toBe('sifter-media-worker:quiet-1');
    expect(homeImage('boss', a)).toBe('ghcr.io/x@sha256:1');
  });
  it('the home build of the accepted digest carries the silencer; a newly accepted digest drops it until rebuilt', () => {
    const digest = Object.keys(HOME_BUILDS)[0];
    expect(homeImage('aorus-1', { image: digest })).toBe(HOME_BUILDS[digest].aorus);
    expect(silences('aorus-1', { image: digest })).toBe(true);
    expect(silences('aorus-1', { image: 'ghcr.io/x@sha256:new' })).toBe(false);
    expect(homeImage('aorus-1', { image: 'ghcr.io/x@sha256:new' })).toBe('ghcr.io/x@sha256:new');
  });
  it('the dispatcher picks through homePick (→ homeEligibleItem) and splices exactly once', () => {
    const src = readFileSync('api/lib/ops/media-jobs.js', 'utf8');
    expect(src).toMatch(/eligibleIndex=bossBlocked\?-1:homePick\(h,st,acceptedWorker,homeHeld\)/);
    expect(src.match(/st\.queue\.splice\(eligibleIndex,1\)/g)?.length).toBe(1);
  });
});

import { updateRate, rankedSlots } from '../../api/lib/ops/media-jobs.js';
describe('capability-ranked slots', () => {
  it('EWMA of audio-seconds per wall-second per host; vendor-blind', () => {
    const r = {};
    updateRate(r, 'aorus-2', 3600, 3600); updateRate(r, 'boss', 3600, 1200);
    expect(r.aorus.rate).toBeCloseTo(1); expect(r.boss.rate).toBeCloseTo(3);
    updateRate(r, 'boss', 3600, 3600); expect(r.boss.rate).toBeCloseTo(2.4);
  });
  it('the stronger host keeps its slots, the weaker is cut in proportion, never below 1, unmeasured keeps all', () => {
    const r = { boss: { rate: 3 }, aorus: { rate: 0.75 } };
    expect(rankedSlots(r, 'boss', 2)).toBe(2);
    expect(rankedSlots(r, 'aorus-3', 4)).toBe(1);
    expect(rankedSlots({ boss: { rate: 3 }, aorus: { rate: 1.5 } }, 'aorus', 4)).toBe(2);
    expect(rankedSlots({ boss: { rate: 3 } }, 'aorus', 4)).toBe(4);
    expect(updateRate({}, 'boss', 100, 5)).toEqual({});   // too short to measure
  });
});

describe('homeRemaster re-attach (11-01 #2459: UniPASE ran twice on Boss)', () => {
  it('a copy + transcript this task already landed are reused: no second UniPASE; anything older than the task, or no `since`, runs again', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const fsp = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'homerem-')), enh = join(dir, 'enhanced');
    await mkdir(enh, { recursive: true });
    const since = Date.now() - 60_000;
    await writeFile(join(enh, 'unipase.cloud.flac'), Buffer.alloc(4096));
    await writeFile(join(enh, 'unipase.asr.json'), Buffer.alloc(2048, 32));
    await writeFile(join(enh, 'unipase.done.json'), JSON.stringify({ unipase_s: 3600, gpu: 'boss' }));
    const calls = [];
    const T = { remoteJob: async (...a) => { calls.push('unipase'); await writeFile(a[2].output, Buffer.alloc(4096)); }, asrJob: async (c, o) => { calls.push('asr'); await writeFile(o.output, '{}'); } };
    const C = { jobIdOf: (it) => `t${it.id}` };
    const it_ = { id: 2459, dir }, m = { original: 'orig.mp3' };
    expect(await homeRemaster('boss', it_, m, { T, C, fs: fsp, since })).toMatchObject({ reused: true, unipase_s: 3600 });
    expect(calls).toEqual([]);
    await homeRemaster('boss', it_, m, { T, C, fs: fsp, since: Date.now() + 60_000 });   // landed before this task: a fresh run
    expect(calls).toEqual(['unipase', 'asr']);
    calls.length = 0;
    await homeRemaster('boss', it_, m, { T, C, fs: fsp });   // no since (a new task): always runs
    expect(calls).toEqual(['unipase', 'asr']);
  });
});
