// The Library landing's pure helpers (src/lib/library-stacks.js): folding, covers (art and typographic), sections,
// featured works, the catalogue search, and the wall's sources.
import { describe, it, expect } from 'vitest';
import { fold, coverSpec, renderBook, fitText, sectionsFrom, featured, catalogFrom, searchCatalog, coveredBooks, wallSources,
  shuffle, compact, thousands, CLOTHS, STAGES } from '../../src/lib/library-stacks.js';

const book = (id, o = {}) => ({ id, title: `Book ${id}`, author: 'Bahá’u’lláh', url: `/library/bahai/x/book-${id}`, paras: 300, ...o });

describe('fold', () => {
  it('drops diacritics, ‘ayn/hamza marks and apostrophes so plain typing finds transliterated names', () => {
    expect(fold('Bahá’u’lláh')).toBe('bahaullah');
    expect(fold("Baha'u'llah")).toBe('bahaullah');
    expect(fold('‘Abdu’l-Bahá')).toBe('abdul baha');
    expect(fold('Kitáb-i-Íqán')).toBe('kitab i iqan');
    expect(fold('  The  Ḥidden   Words ')).toBe('the hidden words');
  });
});

describe('covers', () => {
  it('typographic covers are deterministic per book and drawn from the tradition’s cloths', () => {
    for (let i = 1; i < 200; i++) {
      const b = book(i, { title: `A title of some length number ${i}` });
      const s = coverSpec(b, 'Islam');
      expect(coverSpec(b, 'Islam')).toEqual(s);
      expect(CLOTHS).toContain(s.cloth);
      expect(['forest', 'teal', 'prussian', 'parchment']).toContain(s.cloth);
      expect(['frame', 'rule', 'star', 'band']).toContain(s.variant);
      if (s.cloth === 'parchment') expect(['band', 'rule']).toContain(s.variant); else expect(s.variant).not.toBe('band');
    }
  });
  it('vary across a shelf, scale the title by its length, and drop an Unknown author', () => {
    const specs = Array.from({ length: 40 }, (_, i) => coverSpec(book(i + 1), "Baha'i"));
    expect(new Set(specs.map((s) => s.cloth)).size).toBeGreaterThan(2);
    expect(new Set(specs.map((s) => s.variant)).size).toBeGreaterThan(1);
    expect(coverSpec(book(1, { title: 'Peace' }), 'Tao').size).toBe(1);
    expect(coverSpec(book(1, { title: 'x'.repeat(80) }), 'Tao').size).toBe(4);
    expect(coverSpec(book(1, { author: 'Unknown' }), 'Tao').author).toBe('');
  });
  it('fit long titles with an ellipsis at a word boundary', () => {
    expect(fitText('Gleanings from the Writings', 12)).toBe('Gleanings…');
    expect(fitText('Short', 12)).toBe('Short');
  });
  it('render art through the image service (width only, never cropped) over the typographic cover', () => {
    const html = renderBook(book(5, { cover: '/img/covers/5?v=1' }), "Baha'i", { eager: true });
    expect(html).toMatch(/^<a class="bk has-art"/);
    expect(html).toContain('href="/library/bahai/x/book-5"');
    expect(html).toContain('src="https://siftersearch.com/img/covers/5?v=1&amp;tr=w-240,q-80,e-sharpen"');
    expect(html).not.toMatch(/tr=[^"]*h-\d/);                 // no height: the art keeps its proportions
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('class="tc tc-');
    expect(html).toContain('data-c="/img/covers/5?v=1"');
  });
  it('render a coverless book as its typographic cover, escaped, with lazy art never requested', () => {
    const html = renderBook(book(6, { title: 'A <b> & "c"' }), "Baha'i", { caption: false });
    expect(html).toMatch(/^<a class="bk"/);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('aria-label="A &lt;b&gt; &amp; &quot;c&quot;, Bahá’u’lláh"');
    expect(html).not.toContain('bk-cap');
    expect(renderBook({ id: 1, title: 'Avesta', kind: 'work', parts: 3, url: '/x' }, 'Zoroastrian')).toContain('data-work="3"');
  });
});

const shelves = { traditions: [
  { name: "Baha'i", slug: 'bahai', total: 100, shelves: [
    { name: 'Bahá’u’lláh', key: 'Bahá’u’lláh', count: 3, items: [book(1, { title: 'Kitáb-i-Íqán', cover: '/img/covers/1' }), book(2, { title: 'The Hidden Words', cover: '/img/covers/2' }), book(3, { title: 'Prayers' })], more: { count: 50, authors: ['Bahá’u’lláh'] } },
    { name: 'Empty', key: 'e', count: 0, items: [] }],
    library: [{ name: 'Tablet Translations', collection: 'Tablet Translations', count: 26519, url: '/library/bahai/tablet-translations' },
      { name: 'Core Tablets · Bahá’u’lláh', collection: 'Core Tablets', authors: ['Bahá’u’lláh'], count: 10278, url: null },
      { name: 'Bahá’í Library Online', collection: null, site: 'bahai-library.com', count: 4537, url: null }] },
  { name: 'Christian', slug: 'christian', total: 9, shelves: [{ name: 'More works', key: '', count: 2, items: [book(8, { title: 'Untitled' }),
    { id: 7, kind: 'work', title: 'The Bible (KJV)', author: 'Various', parts: 2, cover: '/img/covers/7', url: '/library/christian/b/gen', list: [book(70, { title: 'Genesis', author: '' }), book(71, { title: 'Exodus', author: '' })] }] }],
    library: [{ name: 'Gospels', collection: 'Gospels', count: 12, url: null }] },
  { name: 'Sikh', slug: 'sikh', total: 0, shelves: [], library: [] },
] };

describe('sections', () => {
  const s = sectionsFrom(shelves, { traditions: [{ name: "Baha'i", documents: 123 }] });
  it('keep traditions with something to show, prefer live counts, drop empty shelves', () => {
    expect(s.map((x) => x.slug)).toEqual(['bahai', 'christian']);
    expect(s[0]).toMatchObject({ display: 'The Bahá’í Faith', key: 'bahai', total: 123 });
    expect(s[0].rows).toHaveLength(1);
    expect(s[1].total).toBe(9);
  });
  it('lead with a covered book and put covered books first in each row; generic shelf names become unnamed rows', () => {
    expect(s[0].lead.id).toBe(1);
    expect(s[1].rows[0].items[0].id).toBe(7);
    expect(s[1].rows[0].name).toBeNull();
    expect(s[1].lead.id).toBe(7);
  });
  it('feature curated works first, covered single books only, at most three per tradition', () => {
    const f = featured(s, 8);
    expect(f[0].title).toBe('Kitáb-i-Íqán');
    expect(f.map((b) => b.id)).toEqual([1, 2]);
    expect(f.every((b) => b.cover && b.kind !== 'work' && b.religion)).toBe(true);
  });
});

describe('catalogue', () => {
  const cat = catalogFrom(shelves);
  it('holds books, work parts and linked collections once each', () => {
    expect(cat.map((e) => e.t)).toEqual(['Kitáb-i-Íqán', 'The Hidden Words', 'Prayers', 'Tablet Translations', 'Untitled', 'The Bible (KJV)', 'Genesis', 'Exodus']);
  });
  it('finds as you type without diacritics, all words required, title prefixes first', () => {
    expect(searchCatalog(cat, 'kitab iqan').map((e) => e.t)).toEqual(['Kitáb-i-Íqán']);
    expect(searchCatalog(cat, 'hidden bahaullah')[0].t).toBe('The Hidden Words');
    expect(searchCatalog(cat, 'ex')[0].t).toBe('Exodus');
    expect(searchCatalog(cat, 'tablet')[0].k).toBe('collection');
    expect(searchCatalog(cat, '  ')).toEqual([]);
  });
});

describe('the wall', () => {
  it('starts with every covered book once, each knowing its tradition', () => {
    expect(coveredBooks(shelves).map((b) => [b.id, b.religion])).toEqual([[1, "Baha'i"], [2, "Baha'i"], [7, 'Christian']]);
  });
  it('continues through every collection, interleaved by tradition, with the right query for each', () => {
    const w = wallSources(shelves);
    expect(w.map((x) => x.religion)).toEqual(["Baha'i", 'Christian', "Baha'i", "Baha'i"]);
    expect(w[0].params).toEqual({ collection: 'Tablet Translations' });
    expect(w[2].params).toEqual({ collection: 'Core Tablets', authors: 'Bahá’u’lláh' });
    expect(w[3].params).toEqual({ site: 'bahai-library.com' });
  });
  it('shuffles the same way for the same day, differently on another', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffle(list, 42)).toEqual(shuffle(list, 42));
    expect(shuffle(list, 42)).not.toEqual(shuffle(list, 43));
    expect([...shuffle(list, 42)].sort((a, b) => a - b)).toEqual(list);
  });
});

describe('figures', () => {
  it('compact large counts and group thousands', () => {
    expect(compact(9100065)).toBe('9.1M');
    expect(compact(35368510)).toBe('35M');
    expect(compact(586795)).toBe('587K');
    expect(compact(472)).toBe('472');
    expect(compact(null)).toBe('');
    expect(thousands(69848)).toBe('69,848');
    expect(thousands(null)).toBe('');
  });
  it('seven stages, each reading its figure from the landing payload', () => {
    expect(STAGES).toHaveLength(7);
    const p = { acquire: { week: 472, waiting: 156 }, link: { references: 586795 }, index: { questions: 2305848, phrases: 35368510 } };
    expect(STAGES[0].stat(p)).toBe(472);
    expect(STAGES[0].sub(p)).toBe('156 awaiting review');
    expect(STAGES[4].stat(p)).toBe(586795);
    expect(STAGES[6].sub(p)).toBe('35M phrases indexed');
    expect(STAGES[1].stat(null)).toBeUndefined();
  });
});
