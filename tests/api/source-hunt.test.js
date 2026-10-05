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
  phrases: async (q, { filters }) => (filters?.documentId ? { hits: [{ paragraph_id: 77, score: 0.8 }] }
    : filters?.langGroup ? { hits: [{ paragraph_id: 90, score: 0.71 }] } : { hits: [{ paragraph_id: 2 }, { paragraph_id: 4 }] }),
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
    expect(r.citedBy.map((c) => c.title)).toEqual(['Bahá’u’lláh and the New Era', 'Lights of Guidance']);   // a public copy before a SifterSearch-only one
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

describe('paragraph inside the linked tablet', () => {
  it('the closest paragraph of the linked tablet replaces a linked paragraph that is not among its closest', async () => {
    const r = await sourceHunt(QUOTE, deps({
      phrases: async (q, { filters }) => (filters?.documentId ? { hits: [{ paragraph_id: 78, score: 0.9 }] } : { hits: [{ paragraph_id: 2 }] }),
      passages: async (ids) => new Map(ids.map((id) => [id, { id, documentId: 700, document: { title: 'Lawh-i-Maqsud (Arabic)' }, text: 'الفقرة الصحيحة', url: 'ool/78' }])),
    }));
    expect(r.tablet).toMatchObject({ certain: true, id: 78, basis: 'tablet linked; paragraph by similarity', linkedParagraph: { id: 77 } });
  });
});

describe('decodeEntities', async () => {
  const { decodeEntities } = await import('../../api/lib/source-hunt.js');
  it('decodes the entities stored in scraped text (named and numeric), leaves unknown ones', () => {
    expect(decodeEntities('میفرماید: &quot;طوبی لمن أصبح&quot; &amp; &#1576; &#x628; &bogus;')).toBe('میفرماید: "طوبی لمن أصبح" & ب ب &bogus;');
  });
});

describe('stage events (the live console)', () => {
  it('emits every stage in order with real data, ending in the tablet', async () => {
    const seen = [];
    await sourceHunt(QUOTE, deps(), { emit: (stage, data) => seen.push([stage, data]) });
    expect(seen.map(([s]) => s)).toEqual(['query', 'candidates', 'verbatim', 'links', 'writer', 'targeted', 'origin', 'cited', 'tablet']);
    const cand = seen.find(([s]) => s === 'candidates')[1];
    expect(cand.paragraphs).toBe(4);
    expect(cand.documents.map((x) => x.title)).toContain('Gleanings');
    expect(seen.find(([s]) => s === 'verbatim')[1].count).toBe(3);
  });
  it('a throwing listener never breaks the hunt', async () => {
    const r = await sourceHunt(QUOTE, deps(), { emit: () => { throw new Error('closed'); } });
    expect(r.origin.title).toBe('Gleanings');
  });
});

describe('citations: the public copy wins', async () => {
  const { dedupeCitations, siteOf } = await import('../../api/lib/source-hunt.js');
  it('site comes from where the link points', () => {
    expect(siteOf('https://oceanlibrary.com/gleanings?paraId=para_3', null)).toBe('oceanlibrary.com');
    expect(siteOf('https://siftersearch.com/library/x', null)).toBe('library');
    expect(siteOf('https://bahai-library.com/x', 'bahai-library.com')).toBe('bahai-library.com');
  });
  it('a SifterSearch-only copy is dropped when the same work exists publicly; kept when it is the only copy', () => {
    const out = dedupeCitations([
      { documentId: 1, title: 'The Promised Day Is Come', site: 'library', paragraphs: 1 },
      { documentId: 2, title: 'Promised Day is Come (1980 edition)', site: 'bahai-library.com', paragraphs: 2 },
      { documentId: 3, title: 'The Promised Day is Come', site: 'oceanlibrary.com', paragraphs: 1 },
      { documentId: 4, title: 'A private study', site: 'library', paragraphs: 1 },
    ]);
    expect(out.map((c) => [c.documentId, c.site])).toEqual([[3, 'oceanlibrary.com'], [4, 'library']]);
    expect(out[0]).toMatchObject({ paragraphs: 2, copies: 3 });
  });
});

describe('highlight in the original', () => {
  it('marks the best phrases of the original, found by content in the displayed text', async () => {
    const RAW = 'مقدمة ⁅s1⁆انّما الارض وطن واحد⁅/s1⁆ و &quot;من عليها&quot; اهله';
    const r = await sourceHunt(QUOTE, deps({
      passages: async (ids) => new Map(ids.map((id) => [id, { id, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW.replace(/⁅\/?s\d+⁆/g, ''), url: 'ool/77' }])),
      links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, { sources: [], quotedBy: quotedBy ? { count: 0, passages: [] } : undefined,
        original: quotedBy ? { id: 77, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW.replace(/⁅\/?s\d+⁆/g, ''), url: 'ool/77', path: 'translation' } : null }])),
      spans: async () => [{ start: RAW.indexOf('انّما'), end: RAW.indexOf('واحد') + 4, score: 0.8 }, { start: 0, end: 5, score: 0.5 }],
      rawText: async () => RAW,
    }));
    const t = r.tablet;
    expect(t.highlight).toHaveLength(1);
    expect(t.text.slice(...t.highlight[0])).toBe('انّما الارض وطن واحد');
  });
});

describe('highlight by decision (Clef-flash / Jev clause choice)', () => {
  const RAW = 'امروز انسان کسی است که بخدمت جمیع قیام نماید. فی‌الحقیقه عالم یک وطن محسوب است و من علی الأرض اهل آن. و این بیان روشن است.';
  const base = (decide) => deps({
    passages: async (ids) => new Map(ids.map((id) => [id, { id, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW, url: 'ool/77' }])),
    links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, { sources: [], quotedBy: quotedBy ? { count: 0, passages: [] } : undefined,
      original: quotedBy ? { id: 77, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW, url: 'ool/77', path: 'translation' } : null }])),
    spans: async () => [], rawText: async () => RAW,
    decide: (task, ...a) => (task === 'sourcehunt-highlight' ? decide(task, ...a) : Promise.resolve(null)),
  });
  it('marks the clause(s) the decision model picks; the task is sourcehunt-highlight', async () => {
    let seen;
    const r = await sourceHunt(QUOTE, base(async (task, state, q) => {
      seen = { task, opts: Object.keys(q) };
      const clauses = Object.fromEntries([...state.matchAll(/\[(c\d+)\] ([^\n]*)/g)].map((m) => [m[1], m[2]]));
      return { answers: Object.fromEntries(Object.entries(clauses).map(([k, t]) => [k, { noul: t.includes('وطن') ? 0.9 : 0.05 }])) };
    }));
    expect(seen.task).toBe('sourcehunt-highlight');
    expect(seen.opts.every((k) => /^c\d+$/.test(k))).toBe(true);
    expect(r.tablet.highlightBy).toBe('decision');
    expect(r.tablet.text.slice(...r.tablet.highlight[0])).toContain('عالم یک وطن');
  });
  it('"none" or no decision → the vector spans stand (here none)', async () => {
    const r = await sourceHunt(QUOTE, base(async (task, state, q) => ({ answers: Object.fromEntries(Object.keys(q).map((k) => [k, { noul: 0.05 }])) })));
    expect(r.tablet.highlightBy).toBe(null);
  });
});

describe('translation variants', async () => {
  const { contentContainment } = await import('../../api/lib/source-hunt.js');
  it('a close variant keeps nearly all content words even when its 3-word runs differ', () => {
    const src = 'In another passage He hath proclaimed: It is not for him to pride himself who loveth his own country, but rather for him who loveth the whole world. The earth is but one country, and mankind its citizens. The peoples of the world are its people.';
    expect(contentContainment('The earth is but one country, and the people of the world its citizens.', src)).toBeGreaterThanOrEqual(0.75);
    expect(contentContainment('Justice is the best beloved of all things in My sight', src)).toBeLessThan(0.5);
  });
  it('the variant reaches the writer’s own book (not dropped by the verbatim gate)', async () => {
    const VAR = 'The earth is but one country, and the people of the world its citizens.';
    const r = await sourceHunt(VAR, deps({ rows: async (ids) => ids.map((i) => ROWS[i]).filter(Boolean).map((x) => ({ ...x,
      text: x.id === 1 ? 'The earth is but one country, and mankind its citizens. The peoples of the world are thy people.' : x.text, url: `u/${x.id}` })) }));
    expect(r.origin.title).toBe('Gleanings');
  });
});

describe('holds-the-quote by DECISION (cross-translation)', () => {
  it('a paraphrase the wording test would reject is kept when the decision says it holds the statement', async () => {
    const VAR = 'All the earth forms a single homeland, and humankind are its people.';   // shares almost no 3-word runs
    let asked;
    const r = await sourceHunt(VAR, deps({
      decide: async (task, state, q) => {
        if (task === 'sourcehunt-holds') {
          asked = Object.keys(q).length;
          // the passage numbering follows the candidate order; say yes to the Gleanings paragraph (contains 'one country')
          const ids = [...state.matchAll(/\[p(\d+)\] ([^\n]*)/g)].map((m) => [m[1], m[2]]);
          return { answers: Object.fromEntries(ids.map(([n, t]) => [`p${n}`, { noul: /one country/.test(t) && !/As Bahá/.test(t) ? 0.92 : 0.1 }])) };
        }
        return null;
      },
    }));
    expect(asked).toBeGreaterThan(0);
    expect(r.origin.title).toBe('Gleanings');
  });
  it('no decision available → the wording fallback still works', async () => {
    const r = await sourceHunt(QUOTE, deps({ decide: async () => null }));
    expect(r.origin.title).toBe('Gleanings');
  });
});

describe('one continuous run for an un-elided quote', () => {
  const RAW = 'امروز انسان کسی است که بخدمت جمیع من علی الأرض قیام نماید. فی‌الحقیقه عالم یک وطن محسوب است و من علی الأرض اهل آن. و این بیان روشن است.';
  const run = (quote, scores) => sourceHunt(quote, deps({
    passages: async (ids) => new Map(ids.map((id) => [id, { id, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW, url: 'ool/77' }])),
    links: async (ids, { quotedBy }) => new Map(ids.map((id) => [id, { sources: [], quotedBy: quotedBy ? { count: 0, passages: [] } : undefined,
      original: quotedBy ? { id: 77, documentId: 700, document: { title: 'Lawh-i-Maqsud' }, text: RAW, url: 'ool/77', path: 'translation' } : null }])),
    spans: async () => [], rawText: async () => RAW,
    decide: async (task, state, q) => (task !== 'sourcehunt-highlight' ? null : { answers: Object.fromEntries(
      [...state.matchAll(/\[(c\d+)\] ([^\n]*)/g)].map(([, k, t]) => [k, { noul: scores(t) }])) }),
  }));
  it('a stray clause elsewhere (0.61) is dropped; the strongest run stays', async () => {
    const r = await run(QUOTE, (t) => (t.includes('وطن') ? 0.9 : t.includes('بخدمت') ? 0.61 : 0.05));
    expect(r.tablet.highlight).toHaveLength(1);
    expect(r.tablet.text.slice(...r.tablet.highlight[0])).toContain('وطن');
  });
  it('an elided quote keeps separate runs', async () => {
    const r = await run('That one indeed is a man who … the earth is but one country, and mankind its citizens', (t) => (t.includes('روشن') || t.includes('بخدمت') ? 0.9 : 0.05));   // first and last clauses: not adjacent
    expect(r.tablet.highlight.length).toBeGreaterThan(1);
  });
});
