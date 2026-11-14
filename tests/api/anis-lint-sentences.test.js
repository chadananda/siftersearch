// lint.js sentence splits go through sentences.js: abbreviations never end a sentence (11-14 tz4 lost "Revealed in 1281 A.").
import { describe, it, expect } from 'vitest';
import { dropCutOff, dropNarration } from '../../api/lib/assistant/lint.js';
import { sentencesOf } from '../../api/lib/assistant/sentences.js';

const LINES = [
  'Date and recipient. Revealed in 1281 A.H. (1865) for Aḥmad, a native of Yazd.',
  'J. E. Esslemont wrote it in 1923 A.D., e.g. in vol. 2, p. 14.',
  'Dr. Moojan Momen notes this, i.e. the date. It is 205.15 in the compilation…',
];
describe('lint sentence splits keep abbreviations', () => {
  it('dropCutOff keeps a sentence holding A.H.', () => {
    expect(dropCutOff(LINES[0])).toEqual({ text: LINES[0], dropped: 0 });
  });
  it('no line loses words through dropCutOff or dropNarration', () => {
    for (const l of LINES) {
      expect(dropCutOff(l).text).toBe(l);
      const n = dropNarration(l); expect(typeof n === 'string' ? n : n.text).toBe(l);
    }
  });
  it('sentencesOf is lossless and does not end on an abbreviation', () => {
    for (const l of LINES) {
      const s = sentencesOf(l);
      expect(s.join('')).toBe(l);
      for (const x of s.slice(0, -1)) expect(x.trim()).not.toMatch(/\b(?:A\.H|A\.D|e\.g|i\.e|vol|p|Dr|[A-Z])\.$/);
    }
  });
});
