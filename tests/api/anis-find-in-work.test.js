// 'search for "private property" in God Passes By' (live 11-10, conv_920ec4b7:11 — the reply said "I can't run a literal text search
// of the book from here"): Jev's lookup in_work → the work → in_work_search → every place, linked, by code. No Anthropic spend.
import { describe, it, expect, vi } from 'vitest';
import { asWorkResult, inWorkReply, quoteReply, findPassageAnswer, findInWorkAnswer, wordsToFind, holdsWords, excerptOf, passageCards } from '../../api/lib/assistant/find-in-work.js';
import { quoteSearch } from '../../api/lib/assistant/quote-search.js';
import { run, REGISTRY } from '../../api/lib/assistant/tools.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState } from '../../api/lib/assistant/units.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

// the in-book find = quote_search held to one work, shaped as the reply code reads it
const inWorkSearch = async (a, ctx, meaning = null) => asWorkResult(await quoteSearch({ query: a.query, works: [a.work_id], ...(a.from != null ? { from: a.from, to: a.to } : {}) }, ctx,
  meaning ? async (x) => ({ passages: await meaning(x.query, x.filters?.documentId) }) : null), a.query);
const viaTool = async (a, ctx) => asWorkResult(await run('quote_search', { query: a.query, works: [a.work_id] }, ctx), a.query);
const LIVE = 'can you search for "private property" in God Passes By?';
// Chad 11-10: the expected hit — Shoghi Effendi, God Passes By, ¶868, this OceanLibrary short link
const URL868 = 'https://oceanlibrary.com/link/QfGEx/god-passes-by_shoghi-effendi/';
const P868 = 'Its views on the institution of private property, on the relations between capital and labour, are set forth in its laws. On the institution of private property the Faith takes a balanced view.';
const GPB = { id: 21310, title: 'God Passes By', author: 'Shoghi Effendi' };
const rows = [
  { id: 9001, paragraph_index: 10, text: 'CHAPTER I', heading: null, blocktype: 'heading2' },
  { id: 9002, paragraph_index: 11, text: 'The Báb declared His mission in Shíráz.', heading: null, blocktype: 'paragraph' },
  { id: 9868, paragraph_index: 867, text: P868, heading: null, blocktype: 'paragraph' },
  { id: 9870, paragraph_index: 869, text: 'Property, in private hands, is not condemned.', heading: null, blocktype: 'paragraph' },   // not the phrase
];
const deps = (over = {}) => ({
  getDoc: async (id) => (id === 21310 ? GPB : null),
  paragraphTexts: vi.fn(async (id) => (id === 21310 ? rows : [])),
  paragraphsByIds: async (ids) => ids.map((id) => ({ ...rows.find((r) => r.id === id), doc_id: 21310, document_id: 21310, title: GPB.title, author: GPB.author, para_no: 868 })),
  withLinks: async (ps) => ps.map((p) => ({ ...p, url: p.id === 9868 ? URL868 : null })),
  ...over,
});

describe('quote_search (works filter): every place in one work, literal and folded', () => {
  it('d21310 + "private property" → ¶868, its place and link, the words bold', async () => {
    const r = await viaTool({ work_id: 21310, query: 'private property' }, { deps: deps() });
    expect(r).toMatchObject({ mode: 'literal', total: 1, work: { id: 21310, title: 'God Passes By', author: 'Shoghi Effendi' } });
    expect(r.passages[0]).toMatchObject({ id: 9868, document_id: 21310, author: 'Shoghi Effendi', place: '#868', url: URL868 });
    expect(r.passages[0].excerpt).toContain('on the institution of **private property**');
    expect(r.passages[0].text).toContain('on the institution of private property');
  });
  it('the code-built reply: one place = the passage quoted, its linked citation under it, the words bold — no count line, no writer', async () => {
    const r = await inWorkSearch({ work_id: 21310, query: 'private property' }, { deps: deps() });
    const reply = inWorkReply(r);
    expect(reply).toMatch(/^> “…?.*\*\*private property\*\*.*”\n>\n> — Shoghi Effendi, \[\*God Passes By\*/);
    expect(reply).toContain(`[*God Passes By*, #868](${URL868})`);
    expect(reply).not.toMatch(/One place|mentions/);
    expect(reply).toContain('**private property**');
    expect(reply).not.toMatch(/can['’]?t|cannot|unable/i);
  });
  it('a long one-sentence paragraph narrows to the clause with the words, cut only at a clause mark (Chad 11-10: a passage, not the context)', () => {
    const P = 'The courage, the fervor and the spiritual vitality evinced by these communities; the highly organized state of their administrative institutions; the facilities provided for the religious education and training of their youth; the conversion of a number of broad-minded Russian citizens, imbued with ideas closely related to the tenets of the Faith; the growing realization of the implications of its principles, with their emphasis on religion, on the sanctity of family life, on the institution of private property, and their repudiation of all discrimination between classes and of the doctrine of the absolute equality of men — these combined to excite the suspicion, and later to arouse the fierce antagonism, of the ruling authorities, and to precipitate one of the gravest crises in the history of the first Bahá’í century.';
    expect(excerptOf(P, 'private property')).toBe('…the growing realization of the implications of its principles, with their emphasis on religion, on the sanctity of family life, on the institution of **private property**, and their repudiation of all discrimination between classes and of the doctrine of the absolute equality of men…');
    expect(excerptOf('A short sentence holds private property here; and more.', 'private property')).toBe('A short sentence holds **private property** here; and more.');
  });
  it('accents, case and curly apostrophes never hide an occurrence; headings are not hits', () => {
    expect(holdsWords('the Báb’s declaration', "bab's declaration")).toBe(true);
    expect(holdsWords('PRIVATE—Property', 'private property')).toBe(true);
    expect(holdsWords('privately property', 'private property')).toBe(false);
    expect(excerptOf('First. Here is Bahá’u’lláh speaking. Last.', "Baha'u'llah")).toBe('… Here is **Bahá’u’lláh** speaking. …');
  });
  it('0 literal hits → the closest in MEANING inside the work, labelled; the fallback search is held to the work', async () => {
    const seen = [];
    const d = deps({ paragraphTexts: async () => rows.slice(0, 2),
      resolveQdrantFilters: async (f) => { seen.push(f); return f; },
      searchPhrases: async () => ({ hits: [{ paragraph_id: 9870, score: 0.7 }] }), searchHypeQdrant: async () => ({ hits: [] }),
      paragraphsByIds: async (ids) => ids.map((id) => ({ ...rows.find((r) => r.id === id), doc_id: 21310, document_id: 21310, title: GPB.title, author: GPB.author, para_no: 870 })) });
    const r = await viaTool({ work_id: 21310, query: 'ownership of wealth' }, { deps: d });
    expect(r.mode).toBe('meaning');
    expect(r.passages.map((p) => p.id)).toEqual([9870]);
    expect(r.passages[0].found_by).toEqual(['meaning']);
    expect(seen.some((f) => JSON.stringify(f).includes('21310'))).toBe(true);
    expect(inWorkReply(r)).toMatch(/^No passage in \*God Passes By\* has the exact words “ownership of wealth”\. This passage is the closest to them in meaning:/);
  });
  it('nothing literal and nothing near → says what was searched, never that it cannot search', async () => {
    const r = await inWorkSearch({ work_id: 21310, query: 'zzz' }, { deps: deps() }, async () => []);
    expect(r.mode).toBe('none');
    expect(inWorkReply(r)).toBe('I searched all of *God Passes By* for “zzz”: the words are not in it, and no passage in it comes close in meaning.');
  });
  it('is a registered contract tool (search tools take query first), no LLM', () => {
    expect(REGISTRY.quote_search.input.required).toEqual(['query']);
    expect(REGISTRY.quote_search.cost.llm).toBe(false);
  });
});

describe('the words and the work are resolved by code; the intent is Jev\'s', () => {
  it('words = the quoted span that is not the title, else Jev\'s topic', () => {
    expect(wordsToFind({ quoted: ['private property'], titles: ['God Passes By'] })).toBe('private property');
    expect(wordsToFind({ quoted: ['God Passes By'], topic: 'private property', titles: ['God Passes By'] })).toBe('private property');
    expect(wordsToFind({ quoted: [], topic: null, titles: ['God Passes By'] })).toBeNull();
  });
  it('the live sentence → in_work_search on d21310 with "private property"', async () => {
    const search = vi.fn(async (a) => quoteSearch(a, { deps: deps() }));
    const bookFastPath = vi.fn(async () => ({ kind: 'work', work: { doc: GPB, others: [] }, via: 'named' }));
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: LIVE }], names: [], deps: { bookFastPath }, search });
    expect(search).toHaveBeenCalledWith({ query: 'private property', works: [21310] });
    expect(got.reply).toContain(URL868);
  });
  it('one literal hit → one passage card (cover absolute, phrase, place, link); several hits or meaning → none', async () => {
    const search = async (a) => quoteSearch(a, { deps: deps({ getDoc: async () => ({ ...GPB, cover_url: '/covers/gpb.jpg' }) }) });
    const bookFastPath = async () => ({ kind: 'work', work: { doc: GPB, others: [] }, via: 'named' });
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: LIVE }], deps: { bookFastPath }, search });
    expect(got.cards).toHaveLength(1);
    expect(got.cards[0]).toMatchObject({ work_id: 21310, title: 'God Passes By', author: 'Shoghi Effendi', place: '#868', url: URL868, phrase: 'private property', cover_url: expect.stringMatching(/^https?:\/\/.+\/covers\/gpb\.jpg$/) });
    expect(got.cards[0].excerpt).toContain('**private property**');
    expect(passageCards({ mode: 'literal', total: 2, passages: [{}, {}], work: GPB })).toEqual([]);
    expect(passageCards({ mode: 'meaning', total: 1, passages: [{}], work: GPB })).toEqual([]);
  });
  it('a section the book finder picked → only its paragraph range', async () => {
    const search = vi.fn(async () => ({ works: [GPB], mode_used: 'none', total: 0, passages: [] }));
    const bookFastPath = async () => ({ kind: 'section', sec: { doc_id: 21310, title: 'Chapter V', start_index: 100, end_index: 180, book: 'God Passes By', author: 'Shoghi Effendi' }, doc: null });
    await findInWorkAnswer({ messages: [{ role: 'user', content: 'find "the Covenant" in chapter V of God Passes By' }], deps: { bookFastPath }, search });
    expect(search).toHaveBeenCalledWith({ query: 'the Covenant', works: [21310], from: 100, to: 180 });
  });
});

describe('the turn: Jev\'s lookup in_work routes to the find, even when the strategy call timed out', () => {
  const turn = ({ strat = null, lookup = { choice: 'in_work', confidence: 0.9 } } = {}) => {
    const calls = { respond: 0, find: [] }, closed = [], events = [];
    const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, lookup,
      outcome: { choice: 'search', confidence: 0.9 }, features: { first: true, turn: 0, words: 9, short: false } };
    const d = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      lookup: vi.fn(async () => null),
      findInWork: async (a) => { calls.find.push(a); return findInWorkAnswer({ ...a, deps: { bookFastPath: async () => ({ kind: 'work', work: { doc: GPB, others: [] } }) }, search: (x) => quoteSearch(x, { deps: deps() }) }); },
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 0 }), close: async (x) => { closed.push(x); }, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { calls, closed, events, d, run: () => anisTurn({ messages: [{ role: 'user', content: LIVE }], participant: { id: 's', authed: true }, clientKey: 's', onEvent: (e) => events.push(e), deps: d }) };
  };
  it('strategy timed out (null) → still the in-work list, no research, no writer', async () => {
    const h = turn();
    const r = await h.run();
    expect(h.calls.respond).toBe(0);
    expect(r.reply).toMatch(/^> “…?.*\*\*private property\*\*.*”\n>\n> — Shoghi Effendi, \[\*God Passes By\*/);
    expect(r.reply).toContain(URL868);
    const types = h.events.map((e) => e.type);
    expect(types.indexOf('passage')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('passage')).toBeLessThan(types.indexOf('text'));
    expect(h.events.find((e) => e.type === 'passage').passage).toMatchObject({ work_id: 21310, place: '#868', url: URL868, phrase: 'private property' });
    expect(h.closed[0].path).toMatchObject({ route: 'in_work', work: 21310, find: 'private property', mode: 'literal', total: 1, strategy_timed_out: true });
    expect(h.d.lookup).not.toHaveBeenCalled();
  });
  it('Jev\'s named_work is passed to the book finder when the strategy answered', async () => {
    const h = turn({ strat: { strategy: { choice: 'book', confidence: 0.8 }, sides: [], sources: {}, decisions: [], units: { named_work: 'God Passes By', topic: 'private property' } } });
    const r = await h.run();
    expect(h.calls.find[0].names).toEqual(['God Passes By']);
    expect(r.reply).toContain(URL868);
  });
  it('another lookup kind → the find never runs', async () => {
    const h = turn({ lookup: { choice: 'none', confidence: 0.9 } });
    expect((await h.run()).reply).toBe('researched');
    expect(h.calls.find).toEqual([]);
  });
});

// ── quote_search filters + the library-wide route (Chad 11-10)
describe('quote_search: religion / author / work filters', () => {
  const DOCS = { 1: { id: 1, title: 'Gleanings', author: "Bahá'u'lláh", religion: "Baha'i" }, 2: { id: 2, title: 'The Gospel of John', author: 'John', religion: 'Christianity' }, 3: { id: 3, title: 'Some Answered Questions', author: "'Abdu'l-Bahá", religion: "Baha'i" } };
  const TXT = { 1: [{ id: 11, paragraph_index: 1, text: 'Love is the light.', blocktype: 'paragraph' }], 2: [{ id: 21, paragraph_index: 1, text: 'God is love, and love abides.', blocktype: 'paragraph' }], 3: [{ id: 31, paragraph_index: 1, text: 'The love of God is everything.', blocktype: 'paragraph' }] };
  const d = { getDoc: async (id) => DOCS[id], paragraphTexts: async (id) => TXT[id] || [], withLinks: async (ps) => ps,
    paragraphsByIds: async (ids) => ids.map((id) => { const doc = Object.values(DOCS).find((x) => TXT[x.id].some((r) => r.id === id)); return { ...TXT[doc.id].find((r) => r.id === id), document_id: doc.id, title: doc.title, author: doc.author }; }),
    findTitled: async ([t]) => { const doc = Object.values(DOCS).find((x) => x.title === t); return doc ? { doc } : null; } };
  const q = (a) => quoteSearch({ query: 'love', ...a }, { deps: d });
  it('works are OR (ids or titles); religion and author narrow them (AND)', async () => {
    expect((await q({ works: [1, 'The Gospel of John'] })).passages.map((p) => p.para_id).sort()).toEqual([11, 21]);
    expect((await q({ works: [1, 2], religions: ['Christianity'] })).passages.map((p) => p.para_id)).toEqual([21]);
    expect((await q({ works: [1, 2, 3], authors: ["Abdu'l-Bahá"] })).passages.map((p) => p.para_id)).toEqual([31]);
    expect((await q({ works: [1, 2], religions: ["Baha'i"], authors: ['John'] })).mode_used).toBe('none');
    expect((await q({ works: ['No Such Title'] })).passages).toEqual([]);
  });
  it('no works: the library by the literal layer, one call per religion, authors as a list; only real hits kept; meaning fallback', async () => {
    const calls = [];
    const fused = async (a) => { calls.push(a); return { passages: a.layers[0] === 'literal' ? [{ id: 11, text: 'Love is the light.', title: 'Gleanings', document_id: 1 }, { id: 99, text: 'nothing here', title: 'X', document_id: 9 }] : [{ id: 77, text: 'Kindness', title: 'Y', document_id: 7 }] }; };
    const r = await quoteSearch({ query: 'love is the light', religions: ["Baha'i", 'Islam'], authors: ["Bahá'u'lláh"] }, { deps: d }, fused);
    expect(calls.map((c) => c.filters)).toEqual([{ tradition: "Baha'i", author: ["Bahá'u'lláh"] }, { tradition: 'Islam', author: ["Bahá'u'lláh"] }]);
    expect(r).toMatchObject({ mode_used: 'literal', total: 1 });
    expect(r.passages[0]).toMatchObject({ para_id: 11, doc_id: 1, work: 'Gleanings' });
    expect(r.passages[0].excerpt).toContain('**Love is the light**');
    const m = await quoteSearch({ query: 'zzz' }, { deps: d }, fused);
    expect(m).toMatchObject({ mode_used: 'meaning' });
    expect((await quoteSearch({ query: 'zzz', mode: 'literal' }, { deps: d }, fused)).mode_used).toBe('none');
  });
  it('the library-wide route: Jev\'s find_passage + his author unit → quote_search filtered by that author; reply cites each work', async () => {
    const search = vi.fn(async () => ({ mode_used: 'literal', total: 1, passages: [{ para_id: 11, document_id: 1, work: 'Gleanings', author: "Bahá'u'lláh", place: '#4', url: 'https://x/y', excerpt: '**Love** is the light.' }] }));
    const got = await findPassageAnswer({ messages: [{ role: 'user', content: 'find the passage where Baha\'u\'llah says love is the light' }], authors: ["Bahá'u'lláh"], topic: 'love is the light', search });
    expect(search).toHaveBeenCalledWith({ query: 'love is the light', authors: ["Bahá'u'lláh"] });
    expect(got.reply).toBe('> “**Love** is the light.”\n>\n> — Bahá\'u\'lláh, [*Gleanings*, #4](https://x/y)');
    expect(got.cards[0]).toMatchObject({ work_id: 1, title: 'Gleanings' });
    expect(await findPassageAnswer({ messages: [{ role: 'user', content: 'hmm' }], search })).toBeNull();
    expect(quoteReply({ query: 'zzz', mode: 'none', total: 0, passages: [] }, { scope: 'the Islam texts' })).toMatch(/^I searched the Islam texts for “zzz”/);
  });
  it('the turn: lookup find_passage → quote_search with the author unit, no writer', async () => {
    const calls = { respond: 0, got: [] };
    const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, lookup: { choice: 'find_passage', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: { first: true, turn: 0, words: 9, short: false } };
    const strat = { strategy: { choice: 'quotation', confidence: 0.8 }, sides: [], sources: {}, decisions: [], units: { named_person: "Bahá'u'lláh", topic: 'love is the light' } };
    const events = [];
    const d2 = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} }, lookup: vi.fn(async () => null),
      findPassage: async (a) => { calls.got.push(a); return findPassageAnswer({ ...a, search: async () => ({ mode_used: 'literal', total: 1, passages: [{ para_id: 1, document_id: 1, work: 'Gleanings', author: "Bahá'u'lláh", excerpt: 'Love', place: '#1', url: null }] }) }); },
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    const r = await anisTurn({ messages: [{ role: 'user', content: 'find the passage where Baha\'u\'llah says love is the light' }], participant: { id: 's', authed: true }, clientKey: 's', onEvent: (e) => events.push(e), deps: d2 });
    expect(calls.respond).toBe(0);
    expect(calls.got[0]).toMatchObject({ authors: ["Bahá'u'lláh"], topic: 'love is the light', works: [] });
    expect(r.reply).toContain('Gleanings');
  });
});
