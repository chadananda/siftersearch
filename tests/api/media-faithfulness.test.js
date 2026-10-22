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
    const r = revertInsertions(heard, para(e));
    expect(r.reverted[0]).toMatchObject({ heard: '', now: '(1957)' });
    expect(r.paragraphs[0].words.map((w) => w.w).join(' ')).toBe(heard.map((w) => w.w).join(' '));
  });
});

describe('faithfulness on real ASR quirks', () => {
  it('overlapping segment times (a repeated phrase in the raw ASR) are not insertions', () => {
    const raw = 'of the hunger strikes. the hunger strikes and it was'.split(' ').map((w, i) => ({ w, s: [2.2, 2.3, 3.0, 3.4, 2.8, 3.0, 3.4, 3.8, 3.9, 4.1][i], e: 0 }));
    raw.forEach((w) => { w.e = w.s + 0.3; });
    expect(regions(raw, para(raw.map((w) => ({ ...w }))))).toEqual([]);
  });
});

describe('insertionOf (10-22 audit cases)', async () => {
  const { insertionOf } = await import('../../api/lib/media/faithfulness.js');
  it('respellings that split a garbled name pass; added content does not', () => {
    expect(insertionOf("Abdu'l-Bahá, like Shoghi-Fezi,", '‘Abdu’l-Bahá, like Shoghi Effendi,')).toBeNull();
    expect(insertionOf('follow, That Choghefendi', 'follow. That Shoghi Effendi')).toBeNull();
    expect(insertionOf("Nabeel's narrative,", 'Nabips Narrative (Vol II),')).toMatch(/brackets/);
    expect(insertionOf('', 'strength by your')).toMatch(/nothing was heard/);
    expect(insertionOf('the book', 'the book of the Covenant')).toMatch(/more words/);
    expect(insertionOf('foreigner', 'forerunner')).toBeNull();
    expect(insertionOf('Robart.', 'John Robarts.')).toMatch(/more words/);
  });
  it('a capitalisation edit beside a repeated phrase is not an insertion (furutan 64:36)', () => {
    const raw = 'serve the Faith by your energy, By your strength, by your health, and'.split(' ').map((w, i) => ({ w, s: i, e: i + 0.9 }));
    const fin = raw.map((w) => ({ ...w })); fin[6] = { ...fin[6], w: 'by' }; fin[8] = { ...fin[8], w: 'strength' };
    expect(regions(raw, para(fin))).toEqual([]);
  });
});
