// Find-passage by description (11-11 "five diamonds"): asking frame out of the words, no "exact words" for a description, one author
// spelling, the matched sentence shown, markers/emphasis out, other-language matches → linked translation, author filter on every layer.
import { describe, it, expect } from 'vitest';
import { describedWords, wordsToFind, oneSpelling, quoteReply, briefAround, findPassageAnswer } from '../../api/lib/assistant/find-in-work.js';
import { plainText, bestSentence, quoteSearch } from '../../api/lib/assistant/quote-search.js';

const ELLIS = '"How many followers have you?" The answer was: "We have no statistics and we do not consider these things important. It is the quality of the believers we care for. If a few are characterized with the attributes of God and live according to the divine Teachings, it is praiseworthy. Five diamonds are worth more than five million stones." Again the journalist asked: "Have you not many followers in America?"';

describe('described passage', () => {
  it('drops the asking frame from Jev\'s topic', () => {
    expect(describedWords('find the statement about how five diamonds is worth five million grains of sand')).toBe('five diamonds is worth five million grains of sand');
    expect(wordsToFind({ topic: 'find the passage that says the earth is but one country' })).toBe('the earth is but one country');
    expect(wordsToFind({ quoted: ['find the statement'], topic: 'x' })).toBe('find the statement');   // quoted words stand as written
    expect(describedWords('justice')).toBe('justice');
  });
  it('one spelling per author', () => {
    expect(oneSpelling(['’Abdu’l-Bahá', "'Abdu'l-Bahá", '‘Abdu’l-Bahá', 'abdul-baha', "‘Abdu'l-Bahá"])).toEqual(['’Abdu’l-Bahá']);
  });
  it('a description is never quoted back as "the exact words"', () => {
    const r = { query: 'five diamonds is worth five million grains of sand', mode: 'meaning', total: 1, passages: [{ excerpt: ELLIS, match: bestSentence(ELLIS, 'five diamonds is worth five million grains of sand'), work: 'Star of the West', author: "'Abdu'l-Bahá", url: 'https://x' }] };
    const out = quoteReply(r, { scope: '’Abdu’l-Bahá', described: true });
    expect(out).not.toMatch(/exact words/);
    expect(out).toMatch(/closest to what you describe/);
    expect(out).toMatch(/Five diamonds are worth more than five million stones/);
  });
  it('the excerpt opens at the matched sentence', () => {
    const m = bestSentence(ELLIS, 'five diamonds worth five million grains of sand');
    expect(m).toMatch(/^Five diamonds/);
    expect(briefAround(ELLIS, m)).toMatch(/^… Five diamonds/);
    expect(briefAround('Short text. Five diamonds here.', 'Five diamonds here.')).toBe('Short text. Five diamonds here.');
  });
  it('plain text: markers, footnotes, emphasis out', () => {
    expect(plainText('⁅s1⁆ای احبّای⁅/s1⁆ ⁅s2⁆x⁅/s2⁆')).toBe('ای احبّای x');
    expect(plainText('He hoped "_that the melody may travel_." [^3] {id="p1"}')).toBe('He hoped "that the melody may travel."');
  });
});

describe('quote_search meaning', () => {
  const fused = async () => ({ passages: [
    { id: 1, document_id: 10, title: 'Canada and Greenland II', author: "'Abdu'l-Bahá", language: 'fa', text: '⁅s1⁆ريگ هامون بسيار⁅/s1⁆' },
    { id: 2, document_id: 20, title: 'May Ellis Maxwell', author: 'Universal House of Justice', language: 'en', text: 'diamonds' },
    { id: 3, document_id: 30, title: 'Words to William Ellis', author: "'Abdu'l-Bahá", language: 'en', text: ELLIS },
  ] });
  const deps = {
    getDoc: async () => null,
    withLinks: async (ps) => ps.map((p) => ({ ...p, url: `https://site/${p.id}${p.quote ? '#q' : ''}` })),
    resolveLinks: async (ids) => new Map(ids.map((id) => [Number(id), { translations: id === 1 ? [{ id: 9, documentId: 90, paragraphIndex: 189, language: 'en', text: 'The plain is covered with pebbles, but precious stones are rare.', document: { title: 'Tablets of the Divine Plan', author: '‘Abdu’l-Bahá' }, url: 'https://ol/para_233' }] : [] }])),
  };
  it('holds the author filter on every layer, shows the English translation, ranges the link', async () => {
    const r = await quoteSearch({ query: 'five diamonds worth five million stones', mode: 'meaning', authors: ["'Abdu'l-Bahá"], language: 'en' }, { deps }, fused);
    expect(r.passages.map((p) => p.work)).toEqual(['Tablets of the Divine Plan', 'Words to William Ellis']);
    expect(r.passages.every((p) => !/⁅/.test(p.excerpt))).toBe(true);
    expect(r.passages[1].url).toBe('https://site/3#q');
    expect(r.passages[1].match).toMatch(/^Five diamonds/);
  });
});

describe('find_passage: provisional → published copy', () => {
  it('uses the published copy for the citation, keeps the speaker', async () => {
    const search = async () => ({ mode_used: 'meaning', total: 1, passages: [{ id: 3, doc_id: 30, work: 'Words to William Ellis (provisional translation)', author: "'Abdu'l-Bahá", excerpt: ELLIS, match: 'Five diamonds are worth more than five million stones."' }] });
    const publishedCopies = async (ps) => ps.map((p) => ({ ...p, work: 'Star of the West, v1, i17', url: 'https://bahai-education.org/sifter-star-of-the-west/v1.17-p5?hl=x' }));
    const got = await findPassageAnswer({ messages: [{ role: 'user', content: 'find the statement from Abdu\'l-Baha about how five diamonds is worth five million grains of sand' }], authors: [], topic: 'find the statement about how five diamonds is worth five million grains of sand', search, deps: { quotedSpans: () => [], publishedCopies } });
    expect(got.reply).toMatch(/Star of the West, v1, i17\*\]\(https:\/\/bahai-education\.org/);
    expect(got.reply).toMatch(/'Abdu'l-Bahá, \[/);
    expect(got.reply).not.toMatch(/exact words/);
  });
});
