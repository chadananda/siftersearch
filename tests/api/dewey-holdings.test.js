// Dewey's holdings check: identify from anything, then title + sub-documents + printed lines merged per document; NOT
// HELD needs the text to miss too.
import { describe, it, expect } from 'vitest';
import { checkHoldings } from '../../api/lib/dewey/holdings.js';
import { identifyText, identifyUrl, sampleLines, withText } from '../../api/lib/dewey/identify.js';

const DB = { id: 21308, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam' };
const deps = (o = {}) => ({
  find: async () => o.titles || [], sections: async () => o.sections || [],
  keyword: async (line) => ({ hits: (o.lines || {})[line] ? [{ doc_id: o.lines[line], paragraph_id: 1 }] : [] }),
  docs: async ({ ids }) => ({ docs: ids.map((id) => (o.byId || {})[id]).filter(Boolean) }),
  // the hit paragraph holds the searched line unless the test says otherwise (o.paraText: id → text)
  texts: async (ids) => ids.map((id) => ({ id, text: (o.paraText || {})[id] ?? Object.keys(o.lines || {}).join(' ') })),
});

describe('holdings check', () => {
  it('an exact title is held', async () => {
    const r = await checkHoldings({ title: 'The Dawn-Breakers' }, deps({ titles: [DB] }));
    expect(r).toMatchObject({ verdict: 'held', candidates: [{ id: 21308 }] });
  });
  it('"Title by Author" typed as one string is held on the title alone (agents send it that way)', async () => {
    const r = await checkHoldings(identifyText('The Dawn-Breakers by Nabíl'), deps({ titles: [DB] }));
    expect(r.verdict).toBe('held');
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
  it('a BM25 top hit that does not contain the line is not evidence (the false "held" of 10-17)', async () => {
    const lines = { 'a line of the narrative long enough to search': 21308, 'another full printed line of that very page': 21308 };
    const r = await checkHoldings({ title: 'Diary', printed_lines: Object.keys(lines) }, deps({ lines, byId: { 21308: DB }, paraText: { 1: 'an unrelated paragraph about universities and their nature' } }));
    expect(r.verdict).toBe('not-held');
  });
  it('a title page’s short lines are not text evidence', async () => {
    const r = await checkHoldings({ title: 'Some Pamphlet', printed_lines: ['THE DAWN-BREAKERS', 'Bahai Publishing Trust 1932'] }, deps({ lines: { 'THE DAWN-BREAKERS': 21308 }, byId: { 21308: DB } }));
    expect(r.verdict).toBe('not-found-by-title');
  });
  it('a loose title match is only possible', async () => {
    expect((await checkHoldings({ title: 'Dawn' }, deps({ titles: [DB] }))).verdict).toBe('possible');
  });
});

describe('file names are not titles (Chad 10-17)', () => {
  it('a document is identified by its contents; the file name is kept only as file_name', async () => {
    const { identifyFile } = await import('../../api/lib/dewey/identify.js');
    const id = await identifyFile({ name: '1921 John and Louise Bosch Box 11 John Bosch.txt', bytes: new TextEncoder().encode('Notes of a Visit to Haifa\n\nWe arrived in the evening and were met at the pilgrim house by the friends of the Guardian.') });
    expect(id).toMatchObject({ title: 'Notes of a Visit to Haifa', file_name: '1921 John and Louise Bosch Box 11 John Bosch.txt' });
  });
  it('with nothing readable it says it cannot tell — file-name matches are hints, never a determination', async () => {
    const r = await checkHoldings({ title: null, file_name: 'The Dawn-Breakers.pdf', kind: 'scan' }, deps({ titles: [DB] }));
    expect(r.verdict).toBe('undetermined');
    expect(r.reason).toMatch(/could not be examined/);
  });
});

describe('holdings check — full-text path', () => {
  const words = (n, seed) => Array.from({ length: n }, (_, i) => `w${(i * seed) % 997}x${i % 13}`).join(' ');
  const sentences = (t) => t.split(' ').reduce((a, w, i) => a + w + ((i + 1) % 15 === 0 ? '. ' : ' '), '');
  const OURS = sentences(words(900, 7));
  const textDeps = (libText, extra = {}) => ({
    find: async () => [], sections: async () => [],
    keyword: async () => ({ hits: [{ doc_id: 500, paragraph_id: 1 }] }),
    texts: async (ids) => ids.map((id) => ({ id, text: libText })),
    docs: async ({ ids }) => ({ docs: ids.map((id) => ({ id, title: 'Library copy', author: 'X' })) }),
    paragraphs: async () => [{ text: libText }],
    ...extra,
  });
  it('a file whose text the library holds is held, with the relation and its percentages', async () => {
    const id = withText({ title: 'Notes', from: 'file' }, OURS);
    const r = await checkHoldings(id, textDeps(OURS));
    expect(r.verdict).toBe('held');
    expect(r.candidates[0]).toMatchObject({ id: 500, relation: { relation: 'same' } });
    expect(r.candidates[0].evidence.find((e) => e.kind === 'text').detail).toMatch(/^the same text: 100%/);
    expect(JSON.stringify(id)).not.toMatch(/_text/);   // the full text never leaves in a response
  });
  it('the library holding only the first part is partly-held', async () => {
    const r = await checkHoldings(withText({ title: 'Notes' }, OURS), textDeps(OURS.split('. ').slice(0, 12).join('. ')));
    expect(r.verdict).toBe('partly-held');
  });
  it('nothing in common is not-held, even when BM25 returns a top hit', async () => {
    const r = await checkHoldings(withText({ title: 'Notes' }, OURS), textDeps(sentences(words(900, 11))));
    expect(r.verdict).toBe('not-held');
  });
});

describe('identify', () => {
  it('typed text: a few words is a title, a sentence is printed lines, a URL is a URL', () => {
    expect(identifyText('The Dawn-Breakers')).toEqual({ title: 'The Dawn-Breakers', from: 'text' });
    expect(identifyText('He is the One Who hath revealed Himself unto all things in the kingdom of His creation').printed_lines).toHaveLength(1);
    expect(identifyText('https://youtu.be/abc')).toEqual({ url: 'https://youtu.be/abc' });
  });
  it('"Title by Author" keeps the whole string as the title, and offers the split', () => {
    expect(identifyText('The Chosen Highway by Lady Blomfield')).toEqual({ title: 'The Chosen Highway by Lady Blomfield', title_alt: 'The Chosen Highway', author: 'Lady Blomfield', from: 'text' });
    expect(identifyText('Prayers Revealed by the Báb').title).toBe('Prayers Revealed by the Báb');
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
