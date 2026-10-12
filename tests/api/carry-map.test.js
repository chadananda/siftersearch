import { describe, it, expect } from 'vitest';
import { mapRows, columnsToCarry, planColumns, linkTargets, countQuestions } from '../../api/lib/ops/carry-map.js';

describe('carry enrichment across a re-ingest', () => {
  it('a merged old row maps to its split pieces; a split old piece maps to the merged new row; unrelated text does not', () => {
    const old = [
      { id: 1, text: 'The first sentence of the passage is here. And the second sentence continues the thought further.' },
      { id: 2, text: 'A completely different passage about prayer and fasting in the month.' },
    ];
    const neu = [
      { id: 10, text: '⁅s1⁆The first sentence of the passage is here.⁅/s1⁆' },
      { id: 11, text: 'And the second sentence continues the thought further.' },
      { id: 12, text: 'Nothing in common with either of them whatsoever, truly.' },
    ];
    const m = mapRows(old, neu);
    expect(m.get(1).map((x) => x.id).sort()).toEqual([10, 11]);
    expect(m.get(2)).toEqual([]);
    const m2 = mapRows([{ id: 5, text: 'And the second sentence continues the thought further.' }],
      [{ id: 20, text: 'The first sentence of the passage is here. And the second sentence continues the thought further.' }]);
    expect(m2.get(5)[0].id).toBe(20);
  });
  it('copies only what the old row has and the new row lacks', () => {
    expect(columnsToCarry({ hyp_questions: '["q"]', hyp_model: 'm', context: '' }, { hyp_model: 'x' })).toEqual({ hyp_questions: '["q"]' });
  });
  it('a merge pools every old row\'s HyPE questions instead of keeping only the first', () => {
    const old = [{ id: 1, text: 'Alpha beta gamma delta epsilon.', hyp_questions: '["q1","q2"]' }, { id: 2, text: 'Zeta eta theta iota kappa.', hyp_questions: '["q3"]' }];
    const neu = [{ id: 9, text: 'Alpha beta gamma delta epsilon. Zeta eta theta iota kappa.' }];
    const plan = planColumns(old, mapRows(old, neu), new Map(neu.map((r) => [r.id, r])));
    expect(plan).toEqual([{ id: 9, set: { hyp_questions: '["q1","q2","q3"]' } }]);
    expect(countQuestions(old)).toBe(3);
  });
  it('links go to every genuine split piece, else to the single best row', () => {
    const m = mapRows([{ id: 1, text: 'One two three four five. Six seven eight nine ten.' }],
      [{ id: 7, text: 'One two three four five.' }, { id: 8, text: 'Six seven eight nine ten.' }]);
    expect(linkTargets(m.get(1)).map((c) => c.id).sort()).toEqual([7, 8]);
    expect(linkTargets([{ id: 3, score: 0.95, piece: false }, { id: 4, score: 0.91, piece: false }]).map((c) => c.id)).toEqual([3]);
  });
});
