// Observatory helpers (src/lib/observatory.js): dial geometry, numbers, interpolation, job → ring, line tones.
import { describe, it, expect } from 'vitest';
import { polar, arcPath, dialLayout, fillDeg, compact, pct, rate, interpolate, duration, ringOfJob, lineTone, sparkPath } from '../../src/lib/observatory.js';

describe('observatory helpers', () => {
  it('polar: 0° is up, 90° is right', () => {
    const [x, y] = polar(0, 0, 10, 0); expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(-10);
    const [x2, y2] = polar(0, 0, 10, 90); expect(x2).toBeCloseTo(10); expect(y2).toBeCloseTo(0);
  });
  it('arcs: empty when no sweep, large-arc flag past 180°', () => {
    expect(arcPath(0, 0, 5, 10, 10, 10)).toBe('');
    expect(arcPath(0, 0, 5, 10, 0, 200)).toMatch(/A10 10 0 1 1/);
  });
  it('dial: traditions share the circle minus the top gap; rings stack outward', () => {
    const d = dialLayout(['a', 'b'], ['x', 'y'], { inner: 100, outer: 200, gapDeg: 40, padDeg: 0, ringGap: 0 });
    expect(d.sectors).toEqual([{ id: 'a', a0: 20, a1: 180 }, { id: 'b', a0: 180, a1: 340 }]);
    expect(d.bands).toEqual([{ id: 'x', r0: 100, r1: 150 }, { id: 'y', r0: 150, r1: 200 }]);
  });
  it('fill: proportional, with a visible sliver for any progress', () => {
    expect(fillDeg(50, 100, 0, 20)).toBe(10);
    expect(fillDeg(1, 1e6, 0, 20)).toBe(0.7);
    expect(fillDeg(0, 100, 0, 20)).toBe(0);
  });
  it('numbers', () => {
    expect(compact(8489697)).toBe('8.49M');
    expect(compact(32783)).toBe('32.8K');
    expect(compact(9000)).toBe('9,000');
    expect(pct(5870, 8455552)).toBe('0.07%');
    expect(pct(50, 100)).toBe('50.0%');
    expect(rate(1200)).toBe('+1,200/h');
    expect(rate(0)).toBe('');
    expect(interpolate(100, 3600, 1800)).toBe(1900);
    expect(interpolate(100, -50, 1800)).toBe(100);
    expect(duration(3725)).toBe('1h 02m');
  });
  it('a job feeds a ring; terminal lines take their tone', () => {
    expect(ringOfJob('phrase-index', 'phrase-index · phrase-islam-1014')).toBe('phrase');
    expect(ringOfJob('hype-index')).toBe('hype');
    expect(lineTone({ kind: 'probe', text: 'words3 "x" → #1 · Gleanings' })).toBe('hit1');
    expect(lineTone({ kind: 'probe', text: 'typo3 "x" → #7 · John' })).toBe('hit');
    expect(lineTone({ kind: 'probe', text: 'recall "x" → not in top 30 · Gita' })).toBe('miss');
    expect(lineTone({ kind: 'job', text: '✗ phrase-index · #5 failed' })).toBe('error');
  });
  it('sparkline', () => {
    expect(sparkPath([1])).toBe('');
    expect(sparkPath([0, 10], 100, 20)).toBe('M0.0 19.0L100.0 1.0');
    // a 10-unit wiggle on a 1000-unit minimum span stays near the middle instead of filling the box
    expect(sparkPath([500, 510], 100, 20, 1000)).toBe('M0.0 10.1L100.0 9.9');
  });
});
