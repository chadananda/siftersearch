// SourceHunt API: result shaping, the article reader (quote extraction, page text), the public-address guard.
import { describe, it, expect } from 'vitest';
import { toApi, extractQuotes, pageText, fetchArticle, huntPage } from '../../api/lib/source-hunt-api.js';

describe('pageText + extractQuotes', () => {
  const html = `<html><head><style>.x{}</style><script>var q = "this is a script string that must never be taken for a quotation";</script></head>
    <body><nav>Menu</nav><p>As Bahá’u’lláh wrote, “The earth is but one country, and mankind its citizens,” a line often quoted.</p>
    <blockquote><p>O Son of Spirit! My first counsel is this: Possess a pure, kindly and radiant heart.</p></blockquote>
    <p>Short “aside” and a repeat: “The earth is but one country, and mankind its citizens.”</p></body></html>`;
  it('keeps visible text and marks blockquotes; drops scripts, styles and navigation', () => {
    const t = pageText(html);
    expect(t).not.toMatch(/script string|Menu/);
    expect(t).toMatch(/⟦BQ⟧\s*O Son of Spirit/);
  });
  it('finds quotations in page order, 8+ words, de-duplicated', () => {
    const q = extractQuotes(pageText(html));
    expect(q).toEqual([
      'The earth is but one country, and mankind its citizens,',
      'O Son of Spirit! My first counsel is this: Possess a pure, kindly and radiant heart.',
    ]);
  });
});

describe('fetchArticle refuses private addresses', () => {
  for (const u of ['http://127.0.0.1/x', 'http://10.0.0.5/', 'http://192.168.1.2/', 'http://100.106.130.68:8791/', 'http://localhost/', 'file:///etc/passwd']) {
    it(u, async () => { await expect(fetchArticle(u)).rejects.toThrow(/not public|only http/); });
  }
});

describe('toApi', () => {
  it('shapes source, original (linked) and citations with the quoted words', () => {
    const r = toApi({ quote: 'q', quoteAuthor: 'Bahá’u’lláh', ms: 900,
      origin: { id: 1, documentId: 10, title: 'Gleanings', author: 'Bahá’u’lláh', site: 'oceanlibrary.com', url: 'u', text: 'aa The earth bb', highlight: [[3, 12]], highlightBy: 'decision' },
      tablet: { certain: true, title: 'Lawh-i-Maqsud', text: 'عالم یک وطن', highlight: [[0, 4]], url: 'ool', basis: 'translation',
        meta: { pin: 'BH00001', title: 'Tablet of Maqṣúd', first_line_en: 'x', links: { oceanoflights: 'o', inventory: 'i' } } },
      citedBy: [{ title: 'B', author: 'A', site: 'bahai-library.com', url: 'b', paragraphs: 2 }] });
    expect(r.source).toMatchObject({ title: 'Gleanings', site: 'OceanLibrary', quotedText: ['The earth'], matchedBy: 'decision' });
    expect(r.original).toMatchObject({ certain: true, pin: 'BH00001', title: 'Tablet of Maqṣúd', quotedText: ['عالم'], links: { oceanOfLights: 'o', phelpsInventory: 'i' } });
    expect(r.possibleOriginals).toEqual([]);
    expect(r.citedBy[0]).toEqual({ title: 'B', author: 'A', site: "Bahá'í Library Online", url: 'b', passages: 2 });
  });
});

describe('huntPage', () => {
  it('hunts every quotation found in inline text', async () => {
    const out = await huntPage({ text: 'He wrote “The earth is but one country, and mankind its citizens” and more.' },
      { hunt: async (q) => ({ quote: q, quoteAuthor: 'Bahá’u’lláh', origin: null, tablet: null, citedBy: [], ms: 5 }) });
    expect(out.quotesFound).toBe(1);
    expect(out.results[0]).toMatchObject({ quote: 'The earth is but one country, and mankind its citizens', writer: 'Bahá’u’lláh' });
  });
});
