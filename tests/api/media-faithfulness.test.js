// Faithfulness (Chad 10-22: "(Vol II)" hallucinated by the name pass): the edited layers are aligned to the heard words by
// time; anything added to what was heard is reverted; respellings and dropped fillers pass.
import { describe, it, expect } from 'vitest';
import { regions, revertInsertions } from '../../api/lib/media/faithfulness.js';
import { applyEdits } from '../../api/lib/media/vocab.js';

const heard = "For that purpose, he wrote that chapter, he translated Nabeel's narrative, he wrote so many passages".split(' ').map((w, i) => ({ w, s: i, e: i + 0.9 }));
const para = (words) => [{ n: 1, t0: 0, t1: 20, spk: 'S1', words, sentences: [[0, words.length]] }];

describe('faithfulness', () => {
  it('the "(Vol II)" insertion is found and reverted to the heard words, with their times', () => {
    const edited = applyEdits(heard, [{ i0: 9, i1: 11, to: 'Nabips Narrative (Vol II)' }]);
    expect(edited.map((w) => w.w).join(' ')).toContain('Nabips Narrative (Vol II),');
    const g = regions(heard, para(edited));
    expect(g.filter((x) => x.insertion)).toHaveLength(1);
    const r = revertInsertions(heard, para(edited));
    expect(r.paragraphs[0].words.map((w) => w.w).join(' ')).toBe(heard.map((w) => w.w).join(' '));
    expect(r.reverted[0]).toMatchObject({ heard: "Nabeel's narrative,", now: 'Nabips Narrative (Vol II),' });
    expect(r.paragraphs[0].words[9]).toMatchObject({ w: "Nabeel's", s: 9 });
  });
  it('respellings, a garbled word split into a name, and hidden fillers are kept', () => {
    let e = applyEdits(heard, [{ i0: 9, i1: 10, to: 'Nabíl’s' }]);
    e = e.map((w, i) => (i === 0 ? { ...w, hide: true } : w));
    const r = revertInsertions(heard, para(e));
    expect(r.reverted).toEqual([]);
    expect(r.paragraphs[0].words[9].w).toBe('Nabíl’s');
    const one = [{ w: 'from', s: 0, e: 1 }, { w: 'Sogefendik', s: 1, e: 2 }];
    expect(revertInsertions(one, para(applyEdits(one, [{ i0: 1, i1: 2, to: 'Shoghi Effendi' }]))).reverted).toEqual([]);
  });
  it('an added year or bracket in the clean layer is reverted', () => {
    const e = applyEdits(heard, [{ i0: 7, i1: 8, to: 'he (1957)' }]);
    expect(revertInsertions(heard, para(e)).reverted[0].now).toBe('he (1957)');
  });
});
