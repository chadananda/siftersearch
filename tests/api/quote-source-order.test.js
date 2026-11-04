// Quote fast path (lookup.js quoteCandidates): among core passages holding the words, the work BY the words' author comes first —
// production 11-03 23:30: "The earth is but one country" cited The World Order of Bahá'u'lláh (Shoghi Effendi quoting the line),
// then a Bahá'í World volume, ahead of Gleanings CXVII and the Tablet of Maqṣúd.
import { describe, it, expect } from 'vitest';
import { resolveLookup, quoteCandidates, pickQuoteOrBook } from '../../api/lib/assistant/lookup.js';

const P = 'The earth is but one country, and mankind its citizens.';
const B = 'Bahá’u’lláh';
const base = { religion: "Baha'i", source_site: 'oceanlibrary.com', blocktype: 'paragraph' };
// the paragraph's writer is `author` (paragraphDoc); the work's author is `book_author`
const WORLD_ORDER = { ...base, id: 501, document_id: 20894, paragraph_index: 501, title: 'The World Order of Bahá’u’lláh', author: B,
  book_author: 'Shoghi Effendi', collection: 'Shoghi Effendi', book_authority: 10, year: 1938,
  text: `“${P}” This is the proclamation of Bahá’u’lláh to the whole of mankind.` };
const BAHAI_WORLD = { ...base, id: 902, document_id: 31000, paragraph_index: 77, title: 'The Bahá’í World, Volume XIV', author: B,
  book_author: 'Bahá’í World Centre', collection: 'Core Publications', book_authority: 7, year: 1974, text: `As Bahá’u’lláh wrote, “${P}”` };
const GLEANINGS = { ...base, id: 117, document_id: 8312, paragraph_index: 606, title: 'Gleanings from the Writings of Bahá’u’lláh', author: B,
  book_author: B, collection: 'Bahá’u’lláh', book_authority: 10, year: 1935,
  text: `It is not for him to pride himself who loveth his own country, but rather for him who loveth the whole world. ${P}` };
const MAQSUD = { ...base, id: 3301, document_id: 20781, paragraph_index: 40, title: 'Tablets of Bahá’u’lláh Revealed after the Kitáb-i-Aqdas', author: B,
  book_author: B, collection: 'Core Tablets', book_authority: 10, year: 1978,
  text: `Lawḥ-i-Maqṣúd. … It is not his to boast who loveth his country, but it is his who loveth the world. ${P}` };
const user = (content) => [{ role: 'user', content }];

describe('quote source order (Chad: the work by the author of the words beats a work quoting them)', () => {
  it('search order put the quoting works first; the Bahá’u’lláh-authored passage comes first after ranking', async () => {
    const hits = [WORLD_ORDER, BAHAI_WORLD, MAQSUD, GLEANINGS];
    const r = await resolveLookup(user(`Where is the quote "The earth is but one country" from?`), { intent: 'quote', findTitled: async () => null, search: async () => hits });
    expect(r.kind).toBe('quote');
    expect(r.passages[0].book_author).toBe(B);
    // Shoghi Effendi's own translation-publication first among Bahá'u'lláh's works, then the Tablets volume; the quoting works after
    expect(r.passages.map((p) => p.id)).toEqual([117, 3301, 501, 902]);
  });
  it('among works that only QUOTE the words, the higher author\'s book first (Shoghi Effendi before a Bahá’í World volume)', async () => {
    const out = await quoteCandidates([BAHAI_WORLD, WORLD_ORDER], P);
    expect(out.map((p) => p.id)).toEqual([501, 902]);
  });
  it('the source missing from the first hits: one search inside the writer\'s own texts brings it, and it leads', async () => {
    const calls = [];
    const search = async (q, t, n, f) => { calls.push(f || null); return f?.author ? [GLEANINGS, WORLD_ORDER] : [WORLD_ORDER, BAHAI_WORLD]; };
    const out = await quoteCandidates([WORLD_ORDER, BAHAI_WORLD], P, search);
    expect(calls).toEqual([{ author: B }]);
    expect(out.map((p) => p.id)).toEqual([117, 501, 902]);   // World Order not repeated
  });
  it('no second search when the writer\'s own work is already among the hits', async () => {
    let n = 0;
    await quoteCandidates([WORLD_ORDER, GLEANINGS], P, async () => { n++; return []; });
    expect(n).toBe(0);
  });
  it('the quote criterion Jev reads names the top passage\'s work and its author (the source), not a quoting book', async () => {
    let body;
    const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { target: { choice: 'quote', confidence: 0.9 } } }) }; };
    const quote = { passages: await quoteCandidates([WORLD_ORDER, GLEANINGS], P) };
    const book = { work: { doc: { title: 'The Earth Is But One Country', author: 'Someone', paragraph_count: 300 } } };
    await pickQuoteOrBook(user(P), { book, quote }, { fetchImpl, apiKey: 'k' });
    const c = body.questions.target.criteria.quote;
    expect(c).toContain('Gleanings from the Writings of Bahá’u’lláh, Bahá’u’lláh');
    expect(c).not.toContain('World Order');
  });
  it('a quoting work is named by its own author, with the quoted writer marked', async () => {
    let body;
    const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { target: null } }) }; };
    const book = { work: { doc: { title: 'X', author: 'Y', paragraph_count: 300 } } };
    await pickQuoteOrBook(user(P), { book, quote: { passages: [WORLD_ORDER] } }, { fetchImpl, apiKey: 'k' });
    expect(body.questions.target.criteria.quote).toContain('The World Order of Bahá’u’lláh, Shoghi Effendi (quoting Bahá’u’lláh)');
  });
});
