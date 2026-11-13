// sbs/embed-align.js: whole-work alignment by meaning on fake vectors (one topic axis per sentence pair) — no API.
import { describe, it, expect } from 'vitest';
import { units, alignByMeaning } from '../../api/lib/sbs/embed-align.js';

// each piece names its topic word(s); a run's vector = the sum of its topics → the right pairing has cosine 1
const TOPICS = ['king', 'bird', 'beauty', 'witness', 'forget', 'fire', 'learn', 'grief', 'city'];
const vec = (s) => TOPICS.map((w) => (s.toLowerCase().match(new RegExp(w, 'g')) || []).length + 0.01);
const embed = async (texts) => texts.map(vec);

describe('units', () => {
  it('cuts after a star or a sentence end, and joins back to the text', () => {
    const t = 'هو king * ثم bird * ثم beauty';
    expect(units(t)).toEqual(['هو king * ', 'ثم bird * ', 'ثم beauty']);
    const e = 'He is the King! Lo, the bird sings. "Verily," said he. Beauty?';
    expect(units(e).join('')).toBe(e);
    expect(units(e)).toHaveLength(4);
  });
});

describe('alignByMeaning', () => {
  it('pairs by meaning across paragraph lines, keeps verses whole, leaves the verse the translation lacks empty', async () => {
    const verses = ['ar king *', 'ar bird * ar beauty *', 'ar witness * ar forget * ar fire * ar learn * ar grief', 'ar city * ar city again'];
    const tr = 'The King. A bird sings. Such beauty. Bear witness. Forget not. Be a fire. Learn well. In grief, read it.';
    const out = await alignByMeaning(verses, tr, embed);
    expect(out.map((ls) => ls.length)).toEqual([1, 2, 5, 1]);
    expect(out[1].map((l) => l.t)).toEqual(['A bird sings.', 'Such beauty.']);
    expect(out[2][4]).toEqual({ o: 'ar grief', t: 'In grief, read it.' });
    expect(out[3]).toEqual([{ o: 'ar city * ar city again', t: '' }]);
    verses.forEach((v, i) => expect(out[i].map((l) => l.o).join(' ').replace(/\s+/g, ' ')).toBe(v.replace(/\s+/g, ' ')));
    expect(out.flat().map((l) => l.t).filter(Boolean).join(' ')).toBe(tr);
  });
});
