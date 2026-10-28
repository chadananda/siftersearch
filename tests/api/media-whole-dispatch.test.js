// Whole-order dispatch (Chad 10-28): vendor-blind (boss AMD and aorus NVIDIA both take whole orders), and ONE host per order — upload is the
// bottleneck, so the same audio never goes to two computers.
import { describe, it, expect } from 'vitest';
import { homeEligibleItem } from '../../api/lib/ops/media-jobs.js';
import { readFileSync } from 'fs';

const st = (extra = {}) => ({ items: { 1: { kind: 'whole' }, 2: { mode: 'restore' } }, home: {}, queue: [1, 2], ...extra });
const accepted = { reserve_aorus_for_whole: true, boss_whole: true };

describe('whole dispatch', () => {
  it('boss takes a whole order once its GPU path is accepted; before that it does not', () => {
    expect(homeEligibleItem('boss', 1, st(), accepted)).toBe(true);
    expect(homeEligibleItem('boss', 1, st(), { ...accepted, boss_whole: false })).toBe(false);
  });
  it('aorus takes whole orders too (no vendor preference), but not restores while reserved for whole', () => {
    expect(homeEligibleItem('aorus-1', 1, st(), accepted)).toBe(true);
    expect(homeEligibleItem('aorus-1', 2, st(), accepted)).toBe(false);
  });
  it('an order another host holds is never eligible: the same audio is not sent to two hosts', () => {
    const s = st({ home: { 'aorus-1': { itemId: 1 } } });
    expect(homeEligibleItem('boss', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('aorus-2', 1, s, accepted)).toBe(false);
    expect(homeEligibleItem('boss', 2, s, accepted)).toBe(true);   // other orders are unaffected
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
