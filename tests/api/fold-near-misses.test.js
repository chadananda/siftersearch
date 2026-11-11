// foldNearMisses keeps the saved description within the 600-character limit (whole near misses only).
import { describe, it, expect } from 'vitest';
import { foldNearMisses, DESC_MAX } from '../../api/lib/repos/strategy-candidates-repo.js';

describe('foldNearMisses', () => {
  it('folds every near miss when they fit', () => {
    expect(foldNearMisses('Finds a named letter inside a collection.', [{ text: 'a quote.' }, { text: 'a topic?' }])).toBe('Finds a named letter inside a collection. Not for: a quote; a topic.');
  });
  it('drops the near misses that would overrun the limit, never cutting one', () => {
    const base = 'x'.repeat(500);
    const out = foldNearMisses(base, [{ text: 'a'.repeat(40) }, { text: 'b'.repeat(40) }, { text: 'c'.repeat(40) }]);
    expect(out.length).toBeLessThanOrEqual(DESC_MAX);
    expect(out).toBe(`${base} Not for: ${'a'.repeat(40)}; ${'b'.repeat(40)}.`);
  });
  it('none fit → the description alone', () => {
    expect(foldNearMisses('y'.repeat(590), [{ text: 'z'.repeat(30) }])).toBe('y'.repeat(590));
  });
});
