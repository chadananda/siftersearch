import { describe, it, expect } from 'vitest';
import { mapRows, columnsToCarry } from '../../api/lib/ops/carry-map.js';

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
});
