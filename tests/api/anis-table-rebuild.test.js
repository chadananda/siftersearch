// Round 6 (11-14 Íqán thread): "email me the final table" must carry the latest table row by row — rows 1…N kept, each person's facts in
// his own row. Real turn-2 (source) and turn-4 (rebuilt) tables from the live replay.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { numberedRows, tableDrift } from '../../api/lib/assistant/lint.js';
import { rebuiltDrift, driftAsk } from '../../api/lib/assistant/agent-core.js';

const read = (f) => readFileSync(new URL(`../fixtures/anis/${f}`, import.meta.url), 'utf8');
const T2 = read('iqan-t2.md'), T4 = read('iqan-t4.md');

describe('rebuilt table keeps every row', () => {
  it('reads the numbered rows', () => {
    expect(numberedRows(T2).map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(numberedRows(T4).map((r) => r.n)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it('the live t4 rebuild is flagged: row 2 (Vaḥíd) missing, his Nayríz facts moved into row 1', () => {
    const d = tableDrift(T2, T4);
    expect(d.missing).toEqual([{ n: 2, name: 'siyyid yahya' }]);
    expect(d.renamed).toEqual([]);                                   // "Mullá Báqir (-i-Kandí)" is still row 11's person
    expect(d.moved).toEqual([expect.objectContaining({ n: 1, from: 2 })]);
    expect(d.moved[0].words).toEqual(expect.arrayContaining(['nayriz']));
  });
  it('the source table against itself, or with a corrected row\'s wording, is not flagged', () => {
    expect(tableDrift(T2, T2)).toBeNull();
    expect(tableDrift(T2, T2.replace('Brother of Mullá Mihdíy-i-Kandí and martyred at Ṭabarsí', 'Brother of Mullá Mihdíy-i-Kandí, not the Letter of the Living'))).toBeNull();
  });
  it('rebuiltDrift compares against the latest numbered table in the conversation; a one-row correction is not a rebuild', () => {
    const t3 = '| # | Name | Who he was | Source |\n|---|---|---|---|\n| 11 | **Mullá Báqir** (-i-Kandí) | Brother of Mullá Mihdíy-i-Kandí. | x |';
    const messages = [{ role: 'user', content: 'who were they' }, { role: 'assistant', content: T2 }, { role: 'user', content: 'row 11 is wrong' },
      { role: 'assistant', content: t3 }, { role: 'user', content: 'email me the final table' }];
    expect(rebuiltDrift(messages, t3)).toBeNull();
    const d = rebuiltDrift(messages, T4);
    expect(d.missing.map((m) => m.n)).toEqual([2]);
    expect(driftAsk(d)).toContain('row 2 (siyyid yahya)');
    expect(rebuiltDrift(messages, T2)).toBeNull();
  });
});
