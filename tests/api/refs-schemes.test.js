// Traditional references — the Hidden Words numbering and the refs-assign guard: a scheme that does not reproduce the
// work's totals writes nothing.
import { describe, it, expect } from 'vitest';
import { hiddenWords, gleanings, aqdas, iqan, romanToInt } from '../../api/lib/refs/schemes.js';
import { refsAssignJob } from '../../api/lib/ops/refs-assign-job.js';

const A = 'Part One: From the Arabic', P = 'Part Two: From the Persian';
const book = (arabic = 71, persian = 82) => [
  { id: 1, heading: '', text: '© Bahá’í International Community' },
  { id: 2, heading: A, text: 'He Is the Glory of Glories' },
  ...Array.from({ length: arabic }, (_, k) => ({ id: 100 + k, heading: A, text: `O Son of Spirit! saying ${k + 1}` })),
  { id: 300, heading: P, text: 'In the Name of the Lord of Utterance, the Mighty.' },
  ...Array.from({ length: persian }, (_, k) => k === 19
    ? [{ id: 400 + k * 2, heading: P, text: 'In the eighth of the most holy lines, in the fifth Tablet of Paradise, He saith:' },
      { id: 401 + k * 2, heading: P, text: 'O ye that are lying as dead on the couch of heedlessness!' }]
    : k === 44 ? [{ id: 400 + k * 2, heading: P, text: 'Alas! Alas! O Lovers of Worldly Desire!' }, { id: 401 + k * 2, heading: P, text: 'Even as the swiftness of lightning…' }]
      : [{ id: 400 + k * 2, heading: P, text: `O My Servant! saying ${k + 1}` }]).flat(),
  { id: 900, heading: P, text: 'The mystic and wondrous Bride, hidden ere this beneath the veiling of utterance…' },
];

describe('Hidden Words numbering', () => {
  const paras = book();
  const { pn, counts, issues } = hiddenWords(paras);
  const at = (id) => pn[paras.findIndex((p) => p.id === id)];
  it('Arabic 1–71, Persian 1–82; no number on the copyright line, invocations or the closing passage', () => {
    expect(counts).toEqual({ Arabic: 71, Persian: 82 }); expect(issues).toEqual([]);
    expect([at(1), at(2), at(300), at(900)]).toEqual([null, null, null, null]);
    expect([at(100), at(170)]).toEqual(['Arabic 1', 'Arabic 71']);
  });
  it('a lead-in takes the number of the saying it introduces; a continuation keeps its saying', () => {
    expect([at(438), at(439)]).toEqual(['Persian 20', 'Persian 20']);
    expect([at(488), at(489)]).toEqual(['Persian 45', 'Persian 45']);
  });
  it('a copy that does not reproduce 71/82 is reported', () => expect(hiddenWords(book(70)).issues).toEqual(['Arabic sayings 70, expected 71']));
});

const toRoman = (n) => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
describe('Gleanings, Aqdas, Íqán numbering', () => {
  it('Roman numerals', () => expect([romanToInt('CXXV'), romanToInt('CLXVI'), romanToInt('XLIX'), romanToInt('abc')]).toEqual([125, 166, 49, null]));
  it('Gleanings: section on its first paragraph, .2/.3 after; I…CLXVI in order', () => {
    const paras = Array.from({ length: 166 }, (_, k) => Array.from({ length: k === 124 ? 3 : 1 }, () => ({ heading: `– ${toRoman(k + 1)} –`, text: 'x' }))).flat();
    const r = gleanings(paras);
    expect(r.issues).toEqual([]);
    expect(r.pn.slice(124, 127)).toEqual(['CXXV', 'CXXV.2', 'CXXV.3']);
    expect(gleanings(paras.filter((p) => p.heading !== '– XL –')).issues[0]).toBe('section XLI follows 39');
  });
  it('Aqdas: invocation none, text 1–190, Q&A 1–107; notes skipped', () => {
    const paras = [{ heading: 'The Most Holy Book', text: 'In the name of Him Who is the Supreme Ruler over all that hath been and all that is to be' },
      ...Array.from({ length: 190 }, () => ({ heading: 'The Most Holy Book', text: 'law' })),
      ...Array.from({ length: 107 }, () => ({ heading: 'Questions and Answers', text: 'Question: … Answer: …' })),
      { heading: 'Questions and Answers', text: 'Adrianople {language="en"}' }];
    const r = aqdas(paras);
    expect(r.issues).toEqual([]);
    expect([r.pn[0], r.pn[1], r.pn[190], r.pn[191], r.pn[297], r.pn[298]]).toEqual([null, '1', '190', 'Q&A 1', 'Q&A 107', null]);
  });
  it('Íqán: 1–290 after the invocation; notes skipped; a short copy refused', () => {
    const paras = [{ heading: 'Part One', text: 'In the name of our Lord, the Exalted, the Most High.' }, ...Array.from({ length: 290 }, () => ({ heading: 'Part One', text: 'p' })), { heading: 'END', text: 'Qur’án 43:36. {language="en"}' }];
    expect(iqan(paras)).toMatchObject({ issues: [], counts: { paragraphs: 290 } });
    expect(iqan(paras.slice(0, 200)).issues).toEqual(['paragraphs 199, expected 290']);
  });
});

describe('refs-assign', () => {
  it('writes only changed rows; a mismatched copy writes nothing', async () => {
    const writes = [];
    const write = async (rows) => writes.push(...rows);
    const ok = await refsAssignJob({ doc: 1, scheme: 'hidden-words' }, { read: async () => book().map((p, i) => ({ ...p, pn: i === 2 ? 'Arabic 1' : null })), write, remeasure: false });
    expect(ok).toMatchObject({ numbered: 155, written: 154, issues: [] });
    const bad = await refsAssignJob({ doc: 1, scheme: 'hidden-words' }, { read: async () => book(70), write: async () => { throw new Error('must not write'); }, remeasure: false });
    expect(bad).toMatchObject({ written: 0, issues: ['Arabic sayings 70, expected 71'] });
  });
});
