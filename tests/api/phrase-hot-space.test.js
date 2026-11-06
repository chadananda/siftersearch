// Phrase indexer RAM-disk check: a snapshot's temp copy is not data — wait for it instead of stopping the run.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hotVerdict, dirBytes } from '../../scripts/phrase-index/hot-space.mjs';

const GB = 1e9;
describe('hotVerdict', () => {
  it('11-05 case: 13 GB data + a snapshot copy in tmp → wait, not stop', () => {
    expect(hotVerdict({ free: 21.5 * GB, used: 22.5 * GB, tmp: 9.5 * GB, minFree: 6 * GB })).toBe('snapshot');
  });
  it('after the snapshot: 13 GB data, 31 GB free → ok', () => {
    expect(hotVerdict({ free: 31 * GB, used: 13 * GB, tmp: 0, minFree: 6 * GB })).toBe('ok');
  });
  it('real growth past half the disk still stops', () => {
    expect(hotVerdict({ free: 20 * GB, used: 24 * GB, tmp: 0, minFree: 6 * GB })).toBe('full');
    expect(hotVerdict({ free: 5 * GB, used: 2 * GB, tmp: 0, minFree: 6 * GB })).toBe('full');
  });
  it('no statfs → ok', () => expect(hotVerdict({ free: null, used: 0, minFree: 6 * GB })).toBe('ok'));
});
describe('dirBytes', () => {
  it('sums nested files; a missing dir is 0', () => {
    const d = mkdtempSync(join(tmpdir(), 'hot-'));
    mkdirSync(join(d, 'a'));
    writeFileSync(join(d, 'x'), '12345'); writeFileSync(join(d, 'a', 'y'), '123');
    expect(dirBytes(d)).toBe(8);
    expect(dirBytes(join(d, 'nope'))).toBe(0);
  });
});
