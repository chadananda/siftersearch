// 'search for "private property" in God Passes By' (live 11-10, conv_920ec4b7:11 — the reply said "I can't run a literal text search
// of the book from here"): Jev's lookup in_work → the work → in_work_search → every place, linked, by code. No Anthropic spend.
import { describe, it, expect, vi } from 'vitest';
import { inWorkSearch, inWorkReply, findInWorkAnswer, wordsToFind, holdsWords, excerptOf } from '../../api/lib/assistant/find-in-work.js';
import { run, REGISTRY } from '../../api/lib/assistant/tools.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState } from '../../api/lib/assistant/units.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

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

describe('in_work_search: every place in one work, literal and folded', () => {
  it('d21310 + "private property" → ¶868, its place and link, the words bold', async () => {
    const r = await run('in_work_search', { work_id: 21310, query: 'private property' }, { deps: deps() });
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
    const r = await run('in_work_search', { work_id: 21310, query: 'ownership of wealth' }, { deps: d });
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
    expect(REGISTRY.in_work_search.input.required).toEqual(['query', 'work_id']);
    expect(REGISTRY.in_work_search.cost.llm).toBe(false);
  });
});

describe('the words and the work are resolved by code; the intent is Jev\'s', () => {
  it('words = the quoted span that is not the title, else Jev\'s topic', () => {
    expect(wordsToFind({ quoted: ['private property'], titles: ['God Passes By'] })).toBe('private property');
    expect(wordsToFind({ quoted: ['God Passes By'], topic: 'private property', titles: ['God Passes By'] })).toBe('private property');
    expect(wordsToFind({ quoted: [], topic: null, titles: ['God Passes By'] })).toBeNull();
  });
  it('the live sentence → in_work_search on d21310 with "private property"', async () => {
    const search = vi.fn(async (a) => inWorkSearch(a, { deps: deps() }));
    const bookFastPath = vi.fn(async () => ({ kind: 'work', work: { doc: GPB, others: [] }, via: 'named' }));
    const got = await findInWorkAnswer({ messages: [{ role: 'user', content: LIVE }], names: [], deps: { bookFastPath }, search });
    expect(search).toHaveBeenCalledWith({ work_id: 21310, query: 'private property' });
    expect(got.reply).toContain(URL868);
  });
  it('a section the book finder picked → only its paragraph range', async () => {
    const search = vi.fn(async () => ({ work: GPB, query: 'x', mode: 'none', total: 0, passages: [] }));
    const bookFastPath = async () => ({ kind: 'section', sec: { doc_id: 21310, title: 'Chapter V', start_index: 100, end_index: 180, book: 'God Passes By', author: 'Shoghi Effendi' }, doc: null });
    await findInWorkAnswer({ messages: [{ role: 'user', content: 'find "the Covenant" in chapter V of God Passes By' }], deps: { bookFastPath }, search });
    expect(search).toHaveBeenCalledWith({ work_id: 21310, query: 'the Covenant', from: 100, to: 180 });
  });
});

describe('the turn: Jev\'s lookup in_work routes to the find, even when the strategy call timed out', () => {
  const turn = ({ strat = null, lookup = { choice: 'in_work', confidence: 0.9 } } = {}) => {
    const calls = { respond: 0, find: [] }, closed = [];
    const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, lookup,
      outcome: { choice: 'search', confidence: 0.9 }, features: { first: true, turn: 0, words: 9, short: false } };
    const d = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      lookup: vi.fn(async () => null),
      findInWork: async (a) => { calls.find.push(a); return findInWorkAnswer({ ...a, deps: { bookFastPath: async () => ({ kind: 'work', work: { doc: GPB, others: [] } }) }, search: (x) => inWorkSearch(x, { deps: deps() }) }); },
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 0 }), close: async (x) => { closed.push(x); }, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { calls, closed, d, run: () => anisTurn({ messages: [{ role: 'user', content: LIVE }], participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: d }) };
  };
  it('strategy timed out (null) → still the in-work list, no research, no writer', async () => {
    const h = turn();
    const r = await h.run();
    expect(h.calls.respond).toBe(0);
    expect(r.reply).toMatch(/^> “…?.*\*\*private property\*\*.*”\n>\n> — Shoghi Effendi, \[\*God Passes By\*/);
    expect(r.reply).toContain(URL868);
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
