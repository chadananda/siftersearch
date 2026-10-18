// Dewey's holdings check: identify from anything, then title + sub-documents + printed lines merged per document; NOT
// HELD needs the text to miss too.
import { describe, it, expect } from 'vitest';
import { checkHoldings } from '../../api/lib/dewey/holdings.js';
import { identifyText, identifyUrl, sampleLines } from '../../api/lib/dewey/identify.js';

const DB = { id: 21308, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam' };
const deps = (o = {}) => ({
  find: async () => o.titles || [], sections: async () => o.sections || [],
  keyword: async (line) => ({ hits: (o.lines || {})[line] ? [{ doc_id: o.lines[line], paragraph_id: 1 }] : [] }),
  docs: async ({ ids }) => ({ docs: ids.map((id) => (o.byId || {})[id]).filter(Boolean) }),
});

describe('holdings check', () => {
  it('an exact title is held', async () => {
    const r = await checkHoldings({ title: 'The Dawn-Breakers' }, deps({ titles: [DB] }));
    expect(r).toMatchObject({ verdict: 'held', candidates: [{ id: 21308 }] });
  });
  it('printed lines find a work under another title — held by text', async () => {
    const lines = { 'a line of the narrative long enough to search': 21308, 'another full printed line of that very page': 21308 };
    const r = await checkHoldings({ title: "Nabil's Narrative", printed_lines: Object.keys(lines) }, deps({ lines, byId: { 21308: DB } }));
    expect(r.verdict).toBe('held');
    expect(r.candidates[0].evidence[0]).toMatchObject({ kind: 'text', detail: '2 of 2 printed lines found' });
  });
  it('a part inside a compilation counts as held, with the book it is in', async () => {
    const r = await checkHoldings({ title: 'The Dispensation of Bahá’u’lláh' }, deps({ sections: [{ doc_id: 20894, title: 'The Dispensation of Bahá’u’lláh', book: 'The World Order of Bahá’u’lláh' }],
      byId: { 20894: { id: 20894, title: 'The World Order of Bahá’u’lláh' } } }));
    expect(r.verdict).toBe('held');
    expect(r.candidates[0].evidence[0].detail).toContain('inside The World Order');
  });
  it('a title miss alone is not "not held"; a text miss too is', async () => {
    expect((await checkHoldings({ title: 'Unknown Pamphlet' }, deps())).verdict).toBe('not-found-by-title');
    expect((await checkHoldings({ title: 'Unknown Pamphlet', printed_lines: ['some printed line that nothing in the library has at all'] }, deps())).verdict).toBe('not-held');
  });
  it('a title page’s short lines are not text evidence', async () => {
    const r = await checkHoldings({ title: 'Some Pamphlet', printed_lines: ['THE DAWN-BREAKERS', 'Bahai Publishing Trust 1932'] }, deps({ lines: { 'THE DAWN-BREAKERS': 21308 }, byId: { 21308: DB } }));
    expect(r.verdict).toBe('not-found-by-title');
  });
  it('a loose title match is only possible', async () => {
    expect((await checkHoldings({ title: 'Dawn' }, deps({ titles: [DB] }))).verdict).toBe('possible');
  });
});

describe('identify', () => {
  it('typed text: a few words is a title, a sentence is printed lines, a URL is a URL', () => {
    expect(identifyText('The Dawn-Breakers')).toEqual({ title: 'The Dawn-Breakers', from: 'text' });
    expect(identifyText('He is the One Who hath revealed Himself unto all things in the kingdom of His creation').printed_lines).toHaveLength(1);
    expect(identifyText('https://youtu.be/abc')).toEqual({ url: 'https://youtu.be/abc' });
  });
  it('a video URL is read by oEmbed; a web page by its title and text', async () => {
    const yt = await identifyUrl('https://www.youtube.com/watch?v=x', { fetchImpl: async () => ({ ok: true, json: async () => ({ title: 'A Talk on the Seven Valleys', author_name: 'Some Channel' }) }) });
    expect(yt).toMatchObject({ kind: 'video', title: 'A Talk on the Seven Valleys', author: 'Some Channel' });
    const page = await identifyUrl('https://example.org/x', { fetchImpl: async () => ({ ok: true, headers: { get: () => 'text/html' },
      text: async () => '<html><head><meta property="og:title" content="Memorials of the Faithful"></head><body><p>This is a long paragraph of the page that has more than eight words in it.</p></body></html>' }) });
    expect(page).toMatchObject({ kind: 'web page', title: 'Memorials of the Faithful' });
    expect(page.printed_lines[0]).toMatch(/^This is a long paragraph/);
  });
  it('sampleLines keeps complete lines of running text, not headings', () => {
    expect(sampleLines('CHAPTER I\nA short line\nThis line of running text has enough words to identify the passage well.')).toEqual(['This line of running text has enough words to identify the passage well.']);
  });
});
