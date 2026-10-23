// adaptiveBatches (api/lib/adaptive-batch.js): no single-writer transaction runs long — a slow batch shrinks the next.
import { describe, it, expect } from 'vitest';
import { adaptiveBatches } from '../../api/lib/adaptive-batch.js';

describe('adaptive write batches', () => {
  it('every statement is written once, in order', async () => {
    const st = Array.from({ length: 537 }, (_, i) => i), seen = [];
    await adaptiveBatches(st, async (b) => { seen.push(...b); }, { yieldFn: async () => {} });
    expect(seen).toEqual(st);
  });
  it('at 100 ms a row (the 10-23 content table) batches shrink so each stays near the 1.5 s target', async () => {
    let clock = 0; const sizes = [];
    await adaptiveBatches(Array(600).fill(0), async (b) => { sizes.push(b.length); clock += 100 * b.length; }, { now: () => clock, yieldFn: async () => {} });
    expect(sizes[0]).toBe(100);                         // the first batch is the old size
    expect(Math.max(...sizes.slice(1))).toBeLessThanOrEqual(15);   // after it, ≤ 1.5 s each
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(600);
  });
  it('a fast writer keeps (or regains) the full batch', async () => {
    let clock = 0; const sizes = [];
    await adaptiveBatches(Array(400).fill(0), async (b) => { sizes.push(b.length); clock += b.length; }, { now: () => clock, yieldFn: async () => {} });
    expect(sizes).toEqual([100, 100, 100, 100]);
  });
  it('never below the minimum', async () => {
    let clock = 0; const sizes = [];
    await adaptiveBatches(Array(400).fill(0), async (b) => { sizes.push(b.length); clock += 5000 * b.length; }, { now: () => clock, yieldFn: async () => {}, min: 5 });
    expect(Math.min(...sizes)).toBe(5);
  });
});
