// kernel/segment — partitioning. Pure, no ports.
import { describe, it, expect } from 'vitest';
import { segment } from '../../api/lib/rag/kernel/segment.js';

const paras = (n, heading = 'H', chapter) => Array.from({ length: n }, (_, i) => ({ id: i, heading, chapter }));

describe('kernel/segment', () => {
  it('bounded: keeps a run together until a heading edge past segMax', () => {
    const ps = [...paras(3, 'A'), ...paras(3, 'B')];        // segMax 2: cut at the A→B edge once past 2
    const segs = segment(ps, { mode: 'bounded', segMax: 2 });
    expect(segs.map((s) => s.length)).toEqual([3, 3]);
  });

  it('bounded: hard-cuts at segMax*3 even with no heading change (heading-less books still split)', () => {
    const segs = segment(paras(7, 'same'), { mode: 'bounded', segMax: 2 }); // hard cut at 6
    expect(segs.map((s) => s.length)).toEqual([6, 1]);
  });

  it('toc: groups consecutive paragraphs by chapter label', () => {
    const ps = [paras(1, 'x', 'I')[0], paras(1, 'x', 'I')[0], paras(1, 'x', 'II')[0]];
    expect(segment(ps, { mode: 'toc' }).map((s) => s.length)).toEqual([2, 1]);
  });

  it('toc: falls back to bounded when no chapter labels are present', () => {
    const segs = segment(paras(5, 'same'), { mode: 'toc', segMax: 2 });
    expect(segs.length).toBeGreaterThan(0);                 // does not throw / lose paragraphs
    expect(segs.flat()).toHaveLength(5);
  });
});
