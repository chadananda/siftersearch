// Phrase indexer RAM-disk check: a snapshot's temp copy is not data — wait for it instead of stopping the run.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hotVerdict, dirBytes, parseMemAvailable, hotCapacity, foldVerdict, inQuietHours } from '../../scripts/phrase-index/hot-space.mjs';

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

describe('RAM write tier capacity (Chad 11-10)', () => {
  it('MemAvailable from /proc/meminfo', () => {
    expect(parseMemAvailable('MemTotal:  196000000 kB\nMemFree: 1 kB\nMemAvailable:   62000000 kB\n')).toBe(62000000 * 1024);
    expect(parseMemAvailable('nothing')).toBeNull();
  });
  it('box RAM short → full even with tmpfs room', () => {
    expect(hotVerdict({ free: 40 * GB, used: 10 * GB, minFree: 6 * GB, memAvail: 4 * GB })).toBe('full');
    expect(hotVerdict({ free: 40 * GB, used: 10 * GB, minFree: 6 * GB, memAvail: 60 * GB })).toBe('ok');
  });
  it('capacity = half of (data + room), room = min(tmpfs free, MemAvailable − minFree)', () => {
    // 11-10 tower: 64 G tmpfs, 13 G used, ~62 G available → room min(51, 56) = 51 → capacity 32
    const c = hotCapacity({ free: 51 * GB, used: 13 * GB, minFree: 6 * GB, memAvail: 62 * GB });
    expect(c.capacity / GB).toBeCloseTo(32);
    expect(c.fill).toBeCloseTo(13 / 32);
    // RAM tighter than the tmpfs: room shrinks to MemAvailable − minFree
    expect(hotCapacity({ free: 51 * GB, used: 13 * GB, minFree: 6 * GB, memAvail: 16 * GB }).capacity / GB).toBeCloseTo(11.5);
  });
  it('a snapshot temp copy is not data', () => {
    expect(hotCapacity({ free: 30 * GB, used: 20 * GB, tmp: 7 * GB, minFree: 6 * GB }).data / GB).toBeCloseTo(13);
  });
  it('no room → fill 1 → fold now', () => {
    const c = hotCapacity({ free: 0, used: 0, minFree: 6 * GB, memAvail: 1 * GB });
    expect(c.fill).toBe(1);
    expect(foldVerdict(c)).toBe('fold-now');
  });
  it('fold verdict: over 2/3 now; over 1/3 only in quiet hours', () => {
    expect(foldVerdict({ fill: 0.7 })).toBe('fold-now');
    expect(foldVerdict({ fill: 0.5 }, { quiet: false })).toBe('wait-quiet');
    expect(foldVerdict({ fill: 0.5 }, { quiet: true })).toBe('fold-quiet');
    expect(foldVerdict({ fill: 0.1 }, { quiet: true })).toBe('ok');
  });
  it('quiet hours, including a span over midnight', () => {
    const at = (h) => new Date(2026, 10, 10, h, 30);
    expect(inQuietHours(at(3), '2-7')).toBe(true);
    expect(inQuietHours(at(7), '2-7')).toBe(false);
    expect(inQuietHours(at(23), '22-5')).toBe(true);
    expect(inQuietHours(at(4), '22-5')).toBe(true);
    expect(inQuietHours(at(12), '22-5')).toBe(false);
    expect(inQuietHours(at(3), 'junk')).toBe(false);
  });
});
