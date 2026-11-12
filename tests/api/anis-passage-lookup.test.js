// Numbered references answer with the book's text (Chad 11-04): the whole numbered unit, verse-numbered works by verse,
// and blockquotes that hold only book text. Fixtures: Gleanings 27 (pn sections), Dhammapada 183 (verse-numbered, no
// numbers in the edition), Some Answered Questions 33 (chapters numbered by order). All deps mocked; no DB.
import { describe, it, expect } from 'vitest';
import { resolveLookup, headingNumber, referenceHow, ensureWholeReference } from '../../api/lib/assistant/lookup.js';
import { verseWork, versePlace, VERSE_WORKS } from '../../api/lib/assistant/numbering.js';
import { bookOnlyBlockquotes } from '../../api/lib/assistant/quotes.js';

const user = (content) => [{ role: 'user', content }];
const links = async (h) => h.map((x) => ({ ...x, url: `https://x/${x.doc_id}#${x.paragraph_index}` }));
const inRangeOf = (rows) => async (id, a, b, { limit = 400 } = {}) => rows.filter((r) => r.paragraph_index >= a && r.paragraph_index <= b).slice(0, limit);

// Gleanings: section XXVII = pn XXVII, XXVII.2 … XXVII.6 under "– XXVII –" (doc 20783, pi 118–123 in the live edition)
const GL = { doc: { id: 20783, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh' }, score: 1 };
const glRows = [
  { id: 1, paragraph_index: 117, heading: '– XXVI –', text: 'How bewildering to me, insignificant as I am, is the attempt.', block_attrs: '{"pn":"XXVI.4"}' },
  ...[1, 2, 3, 4, 5, 6].map((k) => ({ id: 10 + k, paragraph_index: 117 + k, heading: '– XXVII –', text: `Section twenty-seven, paragraph ${k}, the words of the book.`,
    block_attrs: JSON.stringify({ pn: k === 1 ? 'XXVII' : `XXVII.${k}` }) })),
  { id: 30, paragraph_index: 124, heading: '– XXVIII –', text: 'Happy is the man who will arise to serve My Cause.', block_attrs: '{"pn":"XXVIII"}' },
];

// Dhammapada (Müller): one paragraph per verse, headings "[pg N]  Chapter <roman>: …", no verse numbers anywhere
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI'];
const DH = { doc: { id: 20925, title: 'The Dhammapada', author: 'F. Max Müller' }, score: 1 };
function dhammapada(counts) {
  const rows = [];
  let n = 0;
  counts.forEach((c, ch) => { for (let k = 0; k < c; k++) rows.push({ id: 1000 + n, paragraph_index: n++, heading: `[pg  ${9 + ch * 2}]  Chapter ${ROMAN[ch]}: Title ${ch + 1}`,
    text: ch === 13 && k === 4 ? 'Not to commit any sin, to do good, and to purify one’s mind, that is the teaching of all the Awakened.' : `Chapter ${ch + 1} verse-row ${k + 1}, a line long enough to stand alone as a verse.` }); });
  const heads = rows.filter((r, i) => !i || rows[i - 1].heading !== r.heading);   // headingStarts: the first row under each heading
  return { rows, heads };
}
const dhDeps = ({ rows, heads }) => ({ intent: 'reference', findTitled: async () => DH, paragraphsByPn: async () => [], headingStarts: async () => heads,
  paragraphsInRange: inRangeOf(rows), withLinks: links });

describe('numbered reference → the whole numbered unit', () => {
  it('Gleanings 27: every paragraph of section XXVII, in order, linked — not one line', async () => {
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference', findTitled: async () => GL, headingStarts: async () => [],
      paragraphsByPn: async (id, pn) => glRows.filter((x) => JSON.parse(x.block_attrs).pn === String(pn)), paragraphsInRange: inRangeOf(glRows), withLinks: links });
    expect(r).toMatchObject({ kind: 'reference', exact: true, label: `${GL.doc.title}, XXVII` });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([118, 119, 120, 121, 122, 123]);
    expect(r.passages[0].source_url).toBe('https://x/20783#118');
  });
  it('Some Answered Questions 33: the whole chapter (every row of the numbering table\'s range), heading row dropped', async () => {
    const SAQ = { id: 20911, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', paragraph_count: 788 };
    const rows = [{ id: 1, paragraph_index: 355, heading: 'The Return', text: '# The Return' },
      ...[356, 357, 358, 359, 360, 361, 362, 363, 364].map((i) => ({ id: i, paragraph_index: i, heading: 'The Return', text: `Paragraph ${i} of the chapter.` }))];
    const r = await resolveLookup(user('Some Answered Questions 33'), { intent: 'reference', findTitled: async () => ({ doc: SAQ }), paragraphsByPn: async () => [],
      headingStarts: async () => [], paragraphsInRange: inRangeOf(rows), withLinks: links });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([356, 357, 358, 359, 360, 361, 362, 363, 364]);
    expect(r.label).toBe('Some Answered Questions, chapter 33');
  });
  it('a numbered chapter heading: every row under it', async () => {
    const rows = [{ id: 1, paragraph_index: 3, heading: '32. A', text: 'a a a' }, { id: 2, paragraph_index: 9, heading: '33. B', text: 'first of 33' },
      { id: 3, paragraph_index: 10, heading: '33. B', text: 'second of 33' }, { id: 4, paragraph_index: 11, heading: '34. C', text: 'c' }];
    const r = await resolveLookup(user('Some Book 33'), { intent: 'reference', findTitled: async () => ({ doc: { id: 5, title: 'Some Book' } }), paragraphsByPn: async () => [],
      headingStarts: async () => [rows[0], rows[1], rows[3]], paragraphsInRange: inRangeOf(rows), withLinks: links });
    expect(r.passages.map((p) => p.text)).toEqual(['first of 33', 'second of 33']);
  });
});

describe('verse-numbered works (Dhammapada 183 is verse 183, not chapter or paragraph 183)', () => {
  it('the layout is data: 26 chapters, 423 verses; verse 183 is chapter XIV, its 5th verse', () => {
    const t = verseWork({ title: 'The Dhammapada' });
    expect(t).toBe(VERSE_WORKS[0]);
    expect(t.chapters.reduce((a, b) => a + b, 0)).toBe(423);
    expect(versePlace(t, 183)).toEqual({ chapter: 14, offset: 4, verses: 18 });
    expect(versePlace(t, 1)).toEqual({ chapter: 1, offset: 0, verses: 20 });
    expect(versePlace(t, 424)).toBeNull();
    expect(verseWork({ title: 'Gleanings' })).toBeNull();
  });
  it('page markers do not hide a heading\'s number', () => {
    expect(headingNumber('[pg  49]  Chapter XIV: The Buddha (The Awakened)')).toBe(14);
    expect(headingNumber('Chapter I: The Twin-Verses')).toBe(1);
  });
  it('one paragraph per verse in the chapter: the exact verse', async () => {
    const r = await resolveLookup(user('Dhammapada 183'), dhDeps(dhammapada(VERSE_WORKS[0].chapters)));
    expect(r).toMatchObject({ kind: 'reference', exact: true, label: 'The Dhammapada, verse 183' });
    expect(r.passages).toHaveLength(1);
    expect(r.passages[0].text).toMatch(/^Not to commit any sin/);
  });
  it('live edition shape: earlier chapters merged verses, chapter XIV still whole → still exact (pi 178)', async () => {
    const counts = [20, 12, 11, 15, 16, 13, 10, 15, 13, 17, 10, 10, 12, 18, 12, 12, 13, 21, 14, 17, 16, 14, 14, 26, 23, 41];   // chapters IV, VI, VIII, XI, XVII, XIX short, as ingested; XIV starts at 174
    const d = dhammapada(counts);
    const r = await resolveLookup(user('Dhammapada 183'), dhDeps(d));
    expect(r.exact).toBe(true);
    expect(r.passages[0]).toMatchObject({ paragraph_index: 178 });
  });
  it('a chapter whose paragraphs do not match its verses: the nearest rows, marked approximate', async () => {
    const counts = [...VERSE_WORKS[0].chapters]; counts[3] = 15;   // chapter IV: 15 paragraphs for 16 verses
    const r = await resolveLookup(user('Dhammapada 50'), dhDeps(dhammapada(counts)));
    expect(r).toMatchObject({ exact: false, approx: { unit: 'verse', chapter: 4, verses: 16, paragraphs: 15 } });
    expect(r.passages.length).toBeGreaterThan(1);
    expect(referenceHow(r)).toMatch(/approximate/);
  });
  it('an edition whose headings do not carry the chapters is not this layout: falls through (no guessed verse)', async () => {
    const d = dhammapada(VERSE_WORKS[0].chapters);
    const r = await resolveLookup(user('Dhammapada 183'), { ...dhDeps(d), headingStarts: async () => d.heads.slice(0, 10) });
    expect(r).toBeNull();
  });
});

describe('the reply is the passage', () => {
  const ref = { kind: 'reference', label: 'Gleanings, XXVII', exact: true,
    passages: [{ text: 'All praise to the unity of God, and all honor to Him.', source_url: 'https://x/g#118', title: 'Gleanings' },
      { text: '[pg 12] Having created the world and all that liveth and moveth therein.', source_url: 'https://x/g#119', title: 'Gleanings' }] };
  it('referenceHow: verbatim, one blockquote, the linked citation, no interpretation', () => {
    const how = referenceHow(ref);
    expect(how).toMatch(/VERBATIM/);
    expect(how).toMatch(/ONE markdown blockquote/);
    expect(how).toMatch(/No interpretation/);
    expect(how).toMatch(/Gleanings, XXVII/);
  });
  it('a reply that already quotes every passage whole stands', () => {
    const t = 'From Gleanings:\n\n> All praise to the unity of God, and all honor to Him.\n>\n> Having created the world and all that liveth and moveth therein.\n>\n> — [Gleanings, XXVII](https://x/g#118)';
    expect(ensureWholeReference(t, ref)).toBe(t);
  });
  it('a paraphrase or a one-line quote is replaced by code: every passage verbatim, page markers out, linked', () => {
    const out = ensureWholeReference('This passage speaks of God\'s unity; the library holds only this.\n\n> All praise to the unity of God', ref);
    expect(out).toBe('> All praise to the unity of God, and all honor to Him.\n>\n> Having created the world and all that liveth and moveth therein.\n>\n> — [Gleanings, XXVII](https://x/g#118)');
  });
});

describe('blockquotes hold only book text', () => {
  const ps = [{ text: 'Not to commit any sin, to do good, and to purify one’s mind, that is the teaching of all the Awakened.' }];
  it('Anís\'s own words leave the blockquote; the book\'s stay', () => {
    const t = 'Verse 183:\n\n> Not to commit any sin, to do good, and to purify one’s mind, that is the teaching of all the Awakened.\n> This verse sums up the whole path in three simple steps.';
    const r = bookOnlyBlockquotes(t, ps);
    expect(r.unquoted).toBe(1);
    expect(r.text).toBe('Verse 183:\n\n> Not to commit any sin, to do good, and to purify one’s mind, that is the teaching of all the Awakened.\n\nThis verse sums up the whole path in three simple steps.');
  });
  it('a blockquote of only the writer\'s words is unquoted and loses its source line', () => {
    const t = 'Here:\n\n> The Buddha teaches that restraint is the beginning of wisdom.\n> — [The Dhammapada](https://x/d#1)\n\nMore.';
    const r = bookOnlyBlockquotes(t, ps);
    expect(r.text).toBe('Here:\n\nThe Buddha teaches that restraint is the beginning of wisdom.\n\nMore.');
  });
  it('book text with an ellipsis, a verse number, page markers or a link stays quoted; the reader\'s words count', () => {
    const t = '> 183. Not to commit any sin … that is the teaching of all the Awakened.\n> — [The Dhammapada](https://x/d#178)\n\n> what is the teaching of all the awakened ones';
    expect(bookOnlyBlockquotes(t, ps, { asked: ['what is the teaching of all the awakened ones?'] })).toEqual({ text: t, unquoted: 0 });
  });
  it('no blockquote: the text is untouched', () => {
    expect(bookOnlyBlockquotes('Plain words.', ps)).toEqual({ text: 'Plain words.', unquoted: 0 });
  });
});

// Hidden Words: Arabic and Persian each counted from 1 (numbering.js WORK_PARTS). Live 11-11: "What is Arabic Hidden Word number 5?"
// parsed the title as "What is Arabic Hidden Word", found no work, fell to search and said the text was not found.
describe('a work numbered in parts', () => {
  const HW = { id: 20809, title: 'The Hidden Words of Bahá’u’lláh', author: 'Bahá’u’lláh', paragraph_count: 314 };
  const rows = [10, 12, 14, 141, 142, 144, 145, 147, 149, 184, 186, 188].map((i) => ({ id: i, paragraph_index: i, heading: null, text: `Row ${i} of the book.` }));
  const deps = (asked) => ({ intent: 'reference', findTitled: async (c) => { asked.push(...c); return { doc: HW }; }, paragraphsByPn: async () => [],
    headingStarts: async () => [], paragraphsInRange: inRangeOf(rows), withLinks: links });
  it('the part comes from the reference; the edition from the table, not the question\'s words', async () => {
    const asked = [];
    const r = await resolveLookup(user('What is Arabic Hidden Word number 5?'), deps(asked));
    expect(asked).toEqual(['The Hidden Words of Bahá’u’lláh']);
    expect(r).toMatchObject({ kind: 'reference', exact: true, label: 'The Hidden Words of Bahá’u’lláh, Arabic 5' });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([12]);
  });
  it('Arabic 70 spans two rows; Arabic 71 ends before the Persian invocation; Persian 20 opens with its own line', async () => {
    expect((await resolveLookup(user('Arabic Hidden Words 70'), deps([]))).passages.map((p) => p.paragraph_index)).toEqual([141, 142]);
    expect((await resolveLookup(user('Arabic Hidden Words 71'), deps([]))).passages.map((p) => p.paragraph_index)).toEqual([144]);
    expect((await resolveLookup(user('Persian Hidden Words 1'), deps([]))).passages.map((p) => p.paragraph_index)).toEqual([147]);
    expect((await resolveLookup(user('Persian Hidden Word no. 20'), deps([]))).passages.map((p) => p.paragraph_index)).toEqual([184, 186]);
  });
  it('another edition (paragraph count differs) is not read by the table', async () => {
    const r = await resolveLookup(user('Persian Hidden Words 1'), { ...deps([]), findTitled: async () => ({ doc: { ...HW, paragraph_count: 334 } }) });
    expect(r).toBeNull();
  });
});
