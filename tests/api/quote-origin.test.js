// Quote origin (quote-origin.js, Chad 11-04): "Religion is the greatest of all means for the establishment of order in the world"
// was answered from The Bahá'í World vol II (a periodical, exact match, rank 1). The words are Bahá'u'lláh's, from the Tablet
// Words of Paradise, in Shoghi Effendi's translation (Epistle to the Son of the Wolf): his translation leads, the Tablet is named,
// the Persian original is attached, the periodical is never the source.
import { describe, it, expect } from 'vitest';
import { resolveLookup } from '../../api/lib/assistant/lookup.js';
import { traceQuote, quoteSourceHow, isPeriodical, originRank } from '../../api/lib/assistant/quote-origin.js';
import { clip } from '../../api/lib/assistant/respond.js';

const P = 'Religion is the greatest of all means for the establishment of order in the world';
const B = 'Bahá’u’lláh', UHJ = 'Universal House of Justice';
const base = { religion: "Baha'i", source_site: 'oceanlibrary.com', blocktype: 'paragraph' };
const BW2 = { ...base, id: 9001, document_id: 40002, paragraph_index: 12, title: 'The Bahá’í World, Volume II', author: B, book_author: B,
  collection: 'Core Publications', book_authority: 7, year: 1928, text: `${P} and for the tranquillity of all that dwell therein.` };
const STATEMENT = { ...base, id: 9002, document_id: 40003, paragraph_index: 4, title: 'Statement on Nature', author: B,
  book_author: 'Bahá’í International Community', collection: 'Core Publications', book_authority: 7, year: 1987, text: `Bahá’u’lláh wrote: “${P}…”` };
const PROMISE = { ...base, id: 9003, document_id: 40004, paragraph_index: 31, title: 'The Promise of World Peace', author: B, book_author: UHJ,
  collection: 'Universal House of Justice', book_authority: 9, year: 1985, text: `“${P} and for the tranquillity of all that dwell therein.”` };
const TABLETS = { ...base, id: 9004, document_id: 20781, paragraph_index: 233, title: 'Tablets of Bahá’u’lláh Revealed after the Kitáb-i-Aqdas', author: B,
  book_author: B, collection: 'Core Tablets', book_authority: 10, year: 1978, heading: 'Kalimát-i-Firdawsíyyih (Words of Paradise)',
  text: `The second leaf of the Most Exalted Paradise: ${P} and for the tranquillity of all that dwell therein.` };
const ESW = { ...base, id: 9005, document_id: 20790, paragraph_index: 58, title: 'Epistle to the Son of the Wolf', author: B, book_author: B,
  collection: 'Bahá’u’lláh', book_authority: 10, year: 1941, text: `${P}, and for the tranquillity of all that dwell therein.` };
const PERSIAN = { text: 'دین الله و مذهب الله سبب کبیر و علت عظیم از برای نظم عالم و اطمینان من فی الامکان است', language: 'fa',
  title: 'کلمات فردوسیه', url: 'https://oceanlibrary.com/x#p3', document_id: 50001, paragraph_index: 3 };
const HITS = [BW2, STATEMENT, PROMISE, TABLETS, ESW];   // the periodical's exact match at rank 1, the Tablet and ESW lower
const user = (content) => [{ role: 'user', content }];
const deps = { translatorsOf: async () => new Map([[9005, 'Shoghi Effendi'], [9004, 'Habib Taherzadeh']]),
  originalsOf: async (ids) => new Map(ids.includes(9004) ? [[9004, PERSIAN]] : []) };

describe('quote origin: the Guardian\'s translation of the Tablet, never a periodical', () => {
  it('kinds of work: a periodical and a statement are never the writer\'s own work', () => {
    expect(isPeriodical(BW2)).toBe(true);
    expect(isPeriodical(STATEMENT)).toBe(true);
    expect(isPeriodical({ title: 'The World Order of Bahá’u’lláh' })).toBe(false);
    expect(isPeriodical(ESW)).toBe(false);
    expect(originRank(ESW)).toBe(0);                                  // Shoghi Effendi's translation (his translation list)
    expect(originRank(TABLETS, 'Habib Taherzadeh')).toBe(2);           // the author's work, another translation
    expect(originRank(PROMISE)).toBe(4);
    expect(originRank(BW2)).toBe(6);
  });

  it('resolveLookup: chosen source = Epistle to the Son of the Wolf, the Tablet named, the Persian attached, the periodical not cited', async () => {
    const r = await resolveLookup(user(`Where is "${P}" from?`), { intent: 'quote', findTitled: async () => null, search: async () => HITS, ...deps });
    expect(r.kind).toBe('quote');
    const o = r.origin;
    expect(o.source.id).toBe(9005);
    expect(o.kind).toBe('guardian-translation');
    expect(o.translatedBy).toBe('Shoghi Effendi');
    expect(o.writer).toBe(B);
    expect(o.tablet).toBe('Kalimát-i-Firdawsíyyih (Words of Paradise)');
    expect(o.original.text).toBe(PERSIAN.text);
    expect(o.secondaryOnly).toBe(false);
    expect(o.passages.map((p) => p.id)).not.toContain(9001);          // the periodical is not cited
    expect(o.passages.map((p) => p.id)).not.toContain(9002);
    expect(o.alsoIn.map((p) => p.title)).toContain('The Promise of World Peace');
    const how = quoteSourceHow(o);
    expect(how).toContain('Shoghi Effendi\'s translation');
    expect(how).toContain('Kalimát-i-Firdawsíyyih (Words of Paradise)');
    expect(how).toContain('*Epistle to the Son of the Wolf*');
    expect(how).toContain('Persian');
    expect(how).not.toMatch(/Bahá’í World/);
  });

  it('translator METADATA alone makes a copy the Guardian\'s (a title not on his list)', async () => {
    const other = { ...TABLETS, id: 9006, title: 'A Compilation of Tablets', heading: null };
    const o = await traceQuote([BW2, TABLETS, other], { phrase: P, translatorsOf: async () => new Map([[9006, 'Shoghi Effendi']]), originalsOf: null });
    expect(o.source.id).toBe(9006);
    expect(o.rank).toBe(0);
  });

  it('only a secondary copy: say where the words are quoted and that the original work was not found', async () => {
    const o = await traceQuote([BW2, PROMISE], { phrase: P, translatorsOf: null, originalsOf: null });
    expect(o.source.id).toBe(9003);
    expect(o.secondaryOnly).toBe(true);
    const how = quoteSourceHow(o);
    expect(how).toContain('only as quoted in *The Promise of World Peace*');
    expect(how).toMatch(/not found in the library/);
    expect(how).toMatch(/never mention search/i);
  });
});

describe('clip: the writer sees the whole paragraph up to PASSAGE_CHARS, cuts at whole sentences', () => {
  it('a paragraph under 4,000 characters is whole, highlight or not', () => {
    const t = 'A sentence. '.repeat(300).trim();   // 3,599 chars
    expect(clip(t, [[2000, 2010]])).toBe(t);
  });
  it('a longer one: a window around the highlight that starts and ends at sentence boundaries', () => {
    const s = (i) => `Sentence number ${i} stands here with some words.`;
    const t = Array.from({ length: 200 }, (_, i) => s(i)).join(' ');
    const at = t.indexOf(s(120));
    const out = clip(t, [[at, at + 20]]);
    expect(out.length).toBeLessThanOrEqual(4000 + 120);
    expect(out).toContain(s(120));
    expect(out).toMatch(/^… Sentence number \d+ /);
    expect(out).toMatch(/words\. …$/);
  });
});

describe('quote origin: uncompiled letter files are the last resort (Chad 11-04, "Man will always have to toil…")', () => {
  it('Lights of Guidance (a compilation) outranks Uncompiled Published Letters for the same Guardian letter', async () => {
    const { originRank } = await import('../../api/lib/assistant/quote-origin.js');
    const upl = { title: 'Uncompiled Published Letters', collection: 'Shoghi Effendi', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: "Bahá'í" };
    const log = { title: 'Lights of Guidance', collection: 'Compilations', author: 'Shoghi Effendi', book_author: 'Helen Hornby', religion: "Bahá'í" };
    expect(originRank(upl)).toBe(5);
    expect(originRank(log)).toBeLessThan(originRank(upl));
  });
});
