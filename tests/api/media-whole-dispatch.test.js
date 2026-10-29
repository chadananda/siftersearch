// Whole-order dispatch (Chad 10-28): vendor-blind (boss AMD and aorus NVIDIA both take whole orders), and ONE host per order — upload is the
// bottleneck, so the same audio never goes to two computers.
import { describe, it, expect } from 'vitest';
import { homeEligibleItem } from '../../api/lib/ops/media-jobs.js';
import { readFileSync } from 'fs';

const wholeOnly = { queue: [1] };
const st = (extra = {}) => ({ items: { 1: { kind: 'whole' }, 2: { mode: 'restore' } }, home: {}, queue: [1, 2], ...extra });
const accepted = { boss_whole: true };

describe('whole dispatch', () => {
  it('boss takes a whole order once its GPU path is accepted; before that it does not', () => {
    expect(homeEligibleItem('boss', 1, st(wholeOnly), accepted)).toBe(true);
    expect(homeEligibleItem('boss', 1, st(wholeOnly), { ...accepted, boss_whole: false })).toBe(false);
  });
  it('aorus takes whole orders and restores alike — no host is reserved for new talks', () => {
    expect(homeEligibleItem('aorus-1', 1, st(wholeOnly), accepted)).toBe(true);
    expect(homeEligibleItem('aorus-1', 2, st(), accepted)).toBe(true);
  });
  it('an order another host holds is never eligible: the same audio is not sent to two hosts', () => {
    const s = st({ home: { 'aorus-1': { itemId: 1 } } });
    expect(homeEligibleItem('boss', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('aorus-2', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('boss', 2, s, accepted)).toBe(true);   // other orders are unaffected
  });
  it('published talks first: a whole order waits while a remaster the host can take is queued, then runs', () => {
    expect(homeEligibleItem('aorus-1', 1, st(), accepted)).toBe(false);          // restore 2 is waiting
    expect(homeEligibleItem('aorus-1', 2, st(), accepted)).toBe(true);
    expect(homeEligibleItem('aorus-1', 1, st({ queue: [1] }), accepted)).toBe(true);   // none waiting: new talks run
    const s = st({ items: { 1: { kind: 'whole' }, 2: { mode: 'restore' } }, home: { aorus: { itemId: 2 } } });
    expect(homeEligibleItem('aorus-1', 1, s, accepted)).toBe(true);              // the only restore is already held by another host
  });
  it('hold_whole still keeps whole orders back everywhere', () => {
    expect(homeEligibleItem('boss', 1, st(), { ...accepted, hold_whole: true })).toBe(false);
  });
  it('the dispatcher picks through homeEligibleItem and splices exactly once', () => {
    const src = readFileSync('api/lib/ops/media-jobs.js', 'utf8');
    expect(src).toMatch(/st\.queue\.findIndex\(id=>homeEligibleItem\(h,id,st,acceptedWorker\)\)/);
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
