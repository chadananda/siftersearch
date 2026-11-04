// Own-source step (own-source.js; Chad's standing rule): production 11-04 — "What did Bahá’u’lláh write about the oneness of
// mankind?" quoted "Ye are the fruits of one tree, and the leaves of one branch" and linked it to The Promised Day Is Come
// (Shoghi Effendi quoting it), not to Bahá'u'lláh's own work.
import { describe, it, expect } from 'vitest';
import { preferOwnWork, quotedSpan, OWN_SOURCE_MS } from '../../api/lib/assistant/own-source.js';
import { toPassage } from '../../api/lib/assistant/tools.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { channelFor } from '../../api/lib/assistant/channels.js';

const B = 'Bahá’u’lláh';
const W = 'Ye are the fruits of one tree, and the leaves of one branch.';
const base = { religion: "Baha'i", source_site: 'oceanlibrary.com', blocktype: 'paragraph' };
// the research passage as libraryTools hands it over (toPassage): author = the paragraph's writer, book_author = the work's
const PROMISED_DAY = toPassage({ ...base, id: 311, document_id: 20901, paragraph_index: 311, title: 'The Promised Day Is Come', author: B,
  book_author: 'Shoghi Effendi', collection: 'Shoghi Effendi', source_url: 'https://oceanlibrary.com/promised-day#311',
  text: `“${W} Deal ye one with another with the utmost love and harmony,” is His counsel to the peoples of the world.` });
// the writer-limited search hit (agentSearch shape): Bahá'u'lláh's own work holding the same words
const GLEANINGS = { ...base, id: 1320, document_id: 8312, doc_id: 8312, paragraph_index: 1320, title: 'Gleanings from the Writings of Bahá’u’lláh',
  author: B, book_author: B, collection: 'Bahá’u’lláh', book_authority: 10, year: 1935, source_url: 'https://oceanlibrary.com/gleanings#cxxxii',
  text: `${W} Deal ye one with another with the utmost love and harmony, with friendliness and fellowship.` };
const OTHER = toPassage({ ...base, id: 77, document_id: 4000, paragraph_index: 77, title: 'Some Study', author: 'A. Scholar', book_author: 'A. Scholar',
  text: 'The oneness of mankind is the pivot round which all the teachings revolve.' });
const wait = (ms, v) => new Promise((r) => setTimeout(r, ms, v));

describe('own source: a Central Figure quoted in another author\'s book → the same words in His own work', () => {
  it('reads only the quoted span of the quoting paragraph', () => {
    expect(quotedSpan(PROMISED_DAY.text)).toBe('Ye are the fruits of one tree, and the leaves of one branch. Deal ye one with another with the utmost love and harmony,');
    expect(quotedSpan('Short.')).toBeNull();
  });
  it('the own work wins: Gleanings takes the Promised Day slot (with its link); the quoting book stays only as context, last', async () => {
    const calls = [];
    const search = async (q, t, n, f) => { calls.push({ q, f }); return [PROMISED_DAY, GLEANINGS]; };
    const r = await preferOwnWork([PROMISED_DAY, OTHER], { search, shape: toPassage });
    expect(calls).toHaveLength(1);
    expect(calls[0].f).toEqual({ author: B });
    expect(calls[0].q).not.toContain('is His counsel');           // the span, not the whole paragraph
    expect(r.passages.map((p) => p.id)).toEqual([1320, 77, 311]);
    expect(r.passages[0]).toMatchObject({ title: 'Gleanings from the Writings of Bahá’u’lláh', book_author: B, source_url: 'https://oceanlibrary.com/gleanings#cxxxii' });
    expect(r.swapped).toEqual([{ from: 311, to: 1320, writer: B }]);
    expect(r.searches).toBe(1);
    expect(r.ms).toBeLessThan(OWN_SOURCE_MS);
  });
  it('a search later than the budget keeps the original passage, and the step ends at the budget', async () => {
    const search = async () => wait(1000, [GLEANINGS]);
    const t0 = Date.now();
    const r = await preferOwnWork([PROMISED_DAY, OTHER], { search, shape: toPassage, budgetMs: 80 });
    const ms = Date.now() - t0;
    expect(r.passages.map((p) => p.id)).toEqual([311, 77]);
    expect(r.late).toBe(1);
    expect(ms).toBeGreaterThanOrEqual(75);
    expect(ms).toBeLessThan(250);
  });
  it('a failed or empty search keeps the original passage', async () => {
    expect((await preferOwnWork([PROMISED_DAY], { search: async () => { throw new Error('down'); } })).passages.map((p) => p.id)).toEqual([311]);
    expect((await preferOwnWork([PROMISED_DAY], { search: async () => [] })).passages.map((p) => p.id)).toEqual([311]);
  });
  it('a passage already in its writer\'s own work causes no search', async () => {
    let n = 0;
    const own = toPassage(GLEANINGS);
    const r = await preferOwnWork([own, OTHER], { search: async () => { n++; return []; } });
    expect(n).toBe(0);
    expect(r.passages).toEqual([own, OTHER]);
  });
  it('the own passage already in the list moves into the quoting slot, with no search and no duplicate', async () => {
    let n = 0;
    const own = toPassage(GLEANINGS);
    const r = await preferOwnWork([PROMISED_DAY, OTHER, own], { search: async () => { n++; return []; } });
    expect(n).toBe(0);
    expect(r.passages.map((p) => p.id)).toEqual([1320, 77, 311]);
  });
  it('a scholar\'s words in a scholar\'s book, or a writer outside the Central Figures and the Guardian, are left alone', async () => {
    let n = 0;
    const uhj = toPassage({ ...base, id: 9, title: 'Some Compilation', author: 'The Universal House of Justice', book_author: 'Compiler', text: '“Lorem ipsum dolor sit amet consectetur.”' });
    await preferOwnWork([OTHER, uhj], { search: async () => { n++; return []; } });
    expect(n).toBe(0);
  });
  it('several quoted passages search in parallel: wall time ≈ one search, not the sum', async () => {
    const pd2 = { ...PROMISED_DAY, id: 312, paragraph_index: 312 };
    const t0 = Date.now();
    const r = await preferOwnWork([PROMISED_DAY, pd2], { search: async () => wait(60, [GLEANINGS]), shape: toPassage });
    const ms = Date.now() - t0;
    expect(r.searches).toBe(2);
    expect(ms).toBeLessThan(110);
    expect(r.passages.map((p) => p.id)).toEqual([1320, 311, 312]);   // one Gleanings, both quoting passages kept as context
  });
});

describe('own source in the research path (respond.js): the passages handed to the writer', () => {
  const run = async (ownSourceSearch) => {
    const crafts = [];
    const d = { search: async () => ({ passages: [] }), companion: async () => null,
      research: async () => ({ passages: [PROMISED_DAY, OTHER], brief: null, steps: [], ms: 1 }),
      craft: async (args) => { crafts.push(args); args.onChunk('ok'); return 'ok'; }, ...(ownSourceSearch ? { ownSourceSearch } : {}) };
    const r = await anisRespond({ messages: [{ role: 'user', content: 'What did Bahá’u’lláh write about the oneness of mankind?' }], deps: d,
      direction: { channel: channelFor('site-chat'), research: true } });
    return { r, crafts };
  };
  it('the writer gets Bahá’u’lláh\'s own passage first, linked to it; The Promised Day only after, as context', async () => {
    const { r, crafts } = await run(async () => [GLEANINGS]);
    const q = crafts[0].retrieved_quotes;
    expect(q[0]).toMatchObject({ source_title: 'Gleanings from the Writings of Bahá’u’lláh', book_author: B, citation_url: 'https://oceanlibrary.com/gleanings#cxxxii' });
    expect(q.map((x) => x.source_title)).toEqual(['Gleanings from the Writings of Bahá’u’lláh', 'Some Study', 'The Promised Day Is Come']);
    expect(q[2].book_author).toBe('Shoghi Effendi');
    expect(r.plan.ownSource).toMatchObject({ swapped: [{ from: 311, to: 1320 }], searches: 1, late: 0 });
  });
  it('injected deps without an own-source search: no search, passages unchanged', async () => {
    const { crafts } = await run(null);
    expect(crafts[0].retrieved_quotes.map((x) => x.source_title)).toEqual(['The Promised Day Is Come', 'Some Study']);
  });
});
