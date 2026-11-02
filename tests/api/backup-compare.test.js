// Backup compare: "differs" only when cmp says the bytes differ (11-02: a cmp killed at its 1-h cap was reported as a differing copy).
import { describe, it, expect } from 'vitest';
import { cmpVerdict, compareFiles } from '../../api/lib/backup.js';

describe('backup compare', () => {
  it('tells identical, different and not compared apart', () => {
    expect(cmpVerdict(null)).toEqual({ identical: true, compareError: null });
    expect(cmpVerdict({ status: 1 })).toEqual({ identical: false, compareError: null });
    expect(cmpVerdict({ status: null, signal: 'SIGTERM' })).toEqual({ identical: null, compareError: 'cmp killed by SIGTERM' });
    expect(cmpVerdict({ status: 2, stderr: Buffer.from('cmp: EOF on b') }).identical).toBe(null);
  });
  it('runs cmp with no time cap', () => {
    let opts; compareFiles('a', 'b', (cmd, args, o) => { opts = o; });
    expect(opts.timeout).toBeUndefined();
  });
});
