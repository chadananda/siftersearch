// A concept must be findable by its ROOT and by any rendering, not only by the English label — one English
// word collapses distinct concepts (insáf vs ‘adl both gloss "justice"). RED-FIRST.
import { describe, it, expect } from 'vitest';
import { conceptDoc } from '../../api/lib/search/concepts.js';

describe('conceptDoc', () => {
  it('keeps the original-language root — the concept identity', () => {
    expect(conceptDoc({ id: 1, canonical: 'justice', root: 'عدل' })).toMatchObject({ root: 'عدل', canonical: 'justice' });
  });
  it('flattens renderings so any word the reader knows can match', () => {
    expect(conceptDoc({ id: 1, canonical: 'justice', renderings: ['equity', 'fairness'] }).renderings).toBe('equity · fairness');
  });
  it('parses renderings stored as a JSON string (the DB column is TEXT)', () => {
    expect(conceptDoc({ id: 1, canonical: 'x', renderings: '["a","b"]' }).renderings).toBe('a · b');
  });
  it('survives malformed renderings rather than throwing mid-sync', () => {
    expect(conceptDoc({ id: 1, canonical: 'x', renderings: 'not json' }).renderings).toBe('not json');
  });
  it('defaults concept_type but never invents a tradition or importance', () => {
    const d = conceptDoc({ id: 1, canonical: 'x' });
    expect(d.concept_type).toBe('concept');
    expect(d.tradition).toBeNull();
    expect(d.importance).toBeNull();
  });
  it('two concepts glossing the same English word stay DISTINCT by root', () => {
    const a = conceptDoc({ id: 1, canonical: 'justice', root: 'انصاف' });
    const b = conceptDoc({ id: 2, canonical: 'justice', root: 'عدل' });
    expect(a.root).not.toBe(b.root);
    expect(a.id).not.toBe(b.id);
  });
});
