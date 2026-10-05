// SourceHunt: origin choice, citing publications, tablet (linked vs cross-lingual candidates) — all deps faked.
import { describe, it, expect } from 'vitest';
import { sourceHunt, prepareQuote, rankOrigins, quoteAuthorOf } from '../../api/lib/source-hunt.js';

const QUOTE = 'The earth is but one country, and mankind its citizens';
const ROWS = {
  1: { id: 1, doc_id: 10, text: `${QUOTE}. The best beloved of all things.`, authors: null, book_author: "Bahá'u'lláh", title: 'Gleanings', source_site: 'oceanlibrary.com' },
  2: { id: 2, doc_id: 20, text: `As Bahá’u’lláh wrote, “${QUOTE}.”`, authors: '[{"name":"Bahá’u’lláh","role":"author"}]', book_author: 'Helen Hornby', title: 'Lights of Guidance', source_site: null },
  3: { id: 3, doc_id: 30, text: `${QUOTE}`, authors: null, book_author: 'J. E. Esslemont', title: 'Bahá’u’lláh and the New Era', source_site: 'bahai-library.com' },
  4: { id: 4, doc_id: 40, text: 'An unrelated paragraph about gardens and rain.', authors: null, book_author: 'X', title: 'Other', source_site: null },
};
const deps = (over = {}) => ({
  phrases: async (q, { filters }) => (filters?.langGroup ? { hits: [{ paragraph_id: 90, score: 0.71 }] } : { hits: [{ paragraph_id: 2 }, { paragraph_id: 4 }] }),
  keyword: async () => ({ hits: [{ paragraph_id: 1 }, { paragraph_id: 3 }] }),
  rows: async (ids) => ids.map((i) => ROWS[i]).filter(Boolean).map((r) => ({ ...r, url: `u/${r.id}` })),
  links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, {
    sources: id === 2 ? [{ id: 1, link: { coverage: 0.95 } }] : [],
    original: id === 1 && quotedBy ? { id: 77, documentId: 700, document: { title: 'Lawh-i-Maqsud (Arabic)' }, text: 'انّما الارض وطن واحد', url: 'ool/77', path: 'translation' } : null,
    quotedBy: quotedBy ? { count: 2, passages: [] } : undefined,
  }])),
  passages: async (ids) => new Map(ids.map((id) => [id, { id, documentId: 900, document: { title: 'A tablet' }, text: 'نص', url: 'ool/x' }])),
  meta: async (docId) => ({ pin: 'BH00001', links: { oceanoflights: `https://oceanoflights.org/${docId}`, inventory: 'https://portlandiator.github.io/PI_browser/?id=BH00001' } }),
  ...over,
});

describe('prepareQuote', () => {
  it('drops quotation marks and a reference tail; matches the longest run between ellipses', () => {
    const q = prepareQuote('“The earth is but one country … and mankind its citizens, and the rest of it” (Gleanings, p. 250)');
    expect(q.text.startsWith('The earth')).toBe(true);
    expect(q.match).toBe('and mankind its citizens, and the rest of it');
  });
});

describe('rankOrigins', () => {
  it("the writer's own book beats a compilation quoting it, even with a higher overlap", () => {
    const top = rankOrigins([
      { id: 2, ownWork: false, authority: 10, overlap: 1 },
      { id: 1, ownWork: true, authority: 10, overlap: 0.8, source_site: 'oceanlibrary.com' },
    ])[0];
    expect(top.id).toBe(1);
  });
});

describe('sourceHunt', () => {
  it('finds the book, the citing publications, and the linked tablet with its links', async () => {
    const r = await sourceHunt(QUOTE, deps());
    expect(r.origin).toMatchObject({ id: 1, title: 'Gleanings', author: "Bahá'u'lláh" });
    expect(r.citedBy.map((c) => c.title)).toEqual(['Lights of Guidance', 'Bahá’u’lláh and the New Era']);   // library before sites
    expect(r.citedBy.some((c) => c.title === 'Other')).toBe(false);                                          // not verbatim
    expect(r.tablet).toMatchObject({ certain: true, id: 77, basis: 'translation', meta: { pin: 'BH00001' } });
    expect(r.tablet.meta.links.oceanoflights).toContain('oceanoflights.org');
  });

  it('with no linked original, offers cross-lingual candidates labelled as such', async () => {
    const r = await sourceHunt(QUOTE, deps({ links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, { sources: [], original: null, quotedBy: quotedBy ? { count: 0, passages: [] } : undefined }])) }));
    expect(r.tablet.certain).toBe(false);
    expect(r.tablet.candidates[0]).toMatchObject({ id: 90, basis: 'cross-lingual', score: 0.71 });
  });

  it('too short a quote is refused', async () => {
    expect((await sourceHunt('one country', deps())).error).toMatch(/four words/);
  });
});

describe('quote author', () => {
  it("a UHJ letter quoting Bahá’u’lláh: the quote is His, and His own book wins over the letter's 'own work'", () => {
    const m = [
      { id: 5, writer: 'Universal House of Justice', authors: '[{"name":"Universal House of Justice","role":"author"},{"name":"Bahá’u’lláh","role":"quoted"}]' },
      { id: 6, writer: 'Helen Hornby', authors: null },
    ];
    expect(quoteAuthorOf(m)).toBe('Bahá’u’lláh');
    const top = rankOrigins([
      { id: 5, writer: 'Universal House of Justice', ownWork: true, authority: 9, overlap: 1 },
      { id: 1, writer: 'Bahá’u’lláh', ownWork: true, authority: 10, overlap: 0.7 },
    ], 'Bahá’u’lláh')[0];
    expect(top.id).toBe(1);
  });
  it('a name merely mentioned does not vote; the writers of the matches do', () => {
    const m = [
      { writer: 'Shoghi Effendi', authors: null },
      { writer: 'Shoghi Effendi', authors: null },
      { writer: 'J. Smith', authors: '[{"name":"Shoghi Effendi","role":"quoted"}]' },
      { writer: 'Bahá’u’lláh', authors: null },
    ];
    expect(quoteAuthorOf(m)).toBe('Shoghi Effendi');
  });
  it("same writer: Core Publications, then the earliest; a candidate that doesn't hold the quote never wins", () => {
    const own = { writer: 'Shoghi Effendi', ownWork: true, authority: 8, overlap: 0.8 };
    expect(rankOrigins([{ ...own, id: 1, title: 'Call to the Nations', year: 1977 }, { ...own, id: 2, title: 'World Order', year: 1938 }], 'Shoghi Effendi')[0].id).toBe(2);
    expect(rankOrigins([{ ...own, id: 3, year: 1900 }, { ...own, id: 4, year: 1990, collection: 'Core Publications' }], 'Shoghi Effendi')[0].id).toBe(4);
    expect(rankOrigins([{ ...own, id: 5, overlap: 0.2, collection: 'Core Publications' }, { ...own, id: 6 }], 'Shoghi Effendi')[0].id).toBe(6);
  });
  it('no one of standing → null', () => {
    expect(quoteAuthorOf([{ writer: 'J. Smith', authors: null }])).toBeNull();
  });
});

describe('quoteRanges (highlight the quote in the passage)', async () => {
  const { quoteRanges } = await import('../../api/lib/source-hunt.js');
  it('marks the quoted words, accent- and apostrophe-blind', () => {
    const p = 'O people of Bahá! The earth is but one country, and mankind its citizens. Blessed is he.';
    const [[a, b]] = quoteRanges(p, '“the earth is but one country, and mankind its citizens”');
    expect(p.slice(a, b)).toBe('The earth is but one country, and mankind its citizens');
    const [[c, d]] = quoteRanges('As Bahá’u’lláh wrote: thou art My lamp.', "Baha'u'llah wrote thou art");
    expect('As Bahá’u’lláh wrote: thou art My lamp.'.slice(c, d)).toBe('Bahá’u’lláh wrote: thou art');
  });
  it('an elided quote marks each run; two-word fragments are not marked', () => {
    const p = 'Possess a pure, kindly and radiant heart, that thine may be a sovereignty ancient, imperishable and everlasting.';
    const r = quoteRanges(p, 'Possess a pure, kindly and radiant heart … a sovereignty ancient, imperishable … of the');
    expect(r.map(([a, b]) => p.slice(a, b))).toEqual(['Possess a pure, kindly and radiant heart', 'a sovereignty ancient, imperishable']);
  });
});
