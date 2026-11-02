// holdWhy: a held remaster names the reason that actually held it (11-02: 2313 held by realign, shown as a words-% hold).
import { describe, it, expect } from 'vitest';
import { holdWhy } from '../../api/lib/media/item.js';

describe('holdWhy', () => {
  it("the worker's own hold wins over the words check", () => {
    const pod = { held: true, why: 'realign placed too few words', qa: { reason: 'realign placed too few words on the restored copy', output_assessment: { passed: true } } };
    expect(holdWhy({ spliced: false, pod, wordsPct: 11, maxPct: 15 })).toBe('realign placed too few words on the restored copy');
    expect(holdWhy({ spliced: false, pod: { held: true, why: 'x' }, wordsPct: 1, maxPct: 15 })).toBe('x');
  });
  it('a splice is named first; a failed assessment gives its reason; else the words check', () => {
    expect(holdWhy({ spliced: true, g: { swapped: 3 }, pod: { held: true, why: 'x' } })).toMatch(/mixes original and remastered audio \(3 sentences/);
    expect(holdWhy({ spliced: false, pod: { qa: { reason: 'worse', output_assessment: { passed: false } } } })).toBe('worse');
    expect(holdWhy({ spliced: false, pod: {}, wordsPct: 22, maxPct: 15 })).toMatch(/22 % of sentences \(> 15 %\)/);
  });
});
