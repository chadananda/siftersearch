import { describe, it, expect } from 'vitest';
import { planDoc } from '../../api/lib/ops/block-attrs-job.js';

describe('block-attrs job (file ids → rows, by word hash)', () => {
  it('matches rows by text (markers ignored) and only writes what differs', () => {
    const file = '---\ntitle: T\n---\n# H\n\nFirst paragraph here.\n{id="para_1" pn="1"}\n\nSecond one.\n{id="para_2" pn="2"}\n';
    const rows = [
      { id: 10, text: '⁅s1⁆First paragraph here.⁅/s1⁆', block_attrs: null },
      { id: 11, text: 'Second one.', block_attrs: JSON.stringify({ id: 'para_2', pn: '2', ilm_id: 'x' }) },
      { id: 12, text: 'Not in the file.', block_attrs: null },
    ];
    const p = planDoc(file, rows);
    expect(p).toMatchObject({ matched: 2, blocks: 2, textRows: 3, unmatchedText: 1 });
    expect(p.changes).toEqual([{ id: 10, attrs: { id: 'para_1', pn: '1' } }]);
  });
});
