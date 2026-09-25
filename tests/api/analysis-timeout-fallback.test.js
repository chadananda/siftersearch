// When LLM passage analysis times out, the public search must still return passage text.
// Regression: the fallback passed raw passages (no `excerpt`), so every result had text: undefined.
import { describe, it, expect } from 'vitest';
import { unanalyzedResults } from '../../api/lib/parallel-analyzer.js';

describe('unanalyzedResults (analysis-timeout fallback)', () => {
  const passages = [
    { id: 1, text: 'Science and religion are conjoined and cannot be separated.', title: 'A', _rankingScore: 0.4 },
    { id: 2, text: 'Religion and science are the two wings.', title: 'B', _rankingScore: 0.9 },
  ];

  it('carries the passage text into the fields the response reads', () => {
    const out = unanalyzedResults(passages);
    for (const r of out) {
      expect(r.excerpt).toBeTruthy();
      expect(r.highlightedText).toBeTruthy();
    }
    expect(out.map((r) => r.excerpt)).toEqual(expect.arrayContaining([passages[0].text, passages[1].text]));
  });

  it('keeps retrieval order and gives every result a numeric score', () => {
    const out = unanalyzedResults(passages);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(out.every((r) => typeof r.score === 'number')).toBe(true);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });
});
