import { expect, it } from 'vitest';
import { greetingEdits } from '../../api/lib/ops/media-greetings.js';
const work = text => ({ paragraphs: [{ n: 2, t0: 10, words: text.split(' ').map(w => ({ w, s: 10, e: 11 })) }] });
it('corrects the unmistakable opening greeting without changing word timing', () => {
  const w = work('Alláh-u-Akbar, friends. Excuse me for sitting down.');
  expect(greetingEdits(w).edits[0]).toMatchObject({ paragraph: 2, index: 0, before: 'Alláh-u-Akbar,', after: 'Alláh-u-Abhá,' });
  expect(w.paragraphs[0].words[0].s).toBe(10);
});
it('holds genuine quotations and ambiguous uses for review', () => {
  for (const text of ['He shouted Alláh-u-Akbar during the battle.', 'Alláh-u-Akbar is an Islamic phrase.']) {
    const r = greetingEdits(work(text)); expect(r.edits).toEqual([]); expect(r.review).toHaveLength(1);
  }
});
