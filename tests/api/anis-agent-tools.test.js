// The agent's strategy tools (agent-strategies.js), the tool-result cache, the earned not-found rule and refs → cards. Deps stubbed.
import { describe, it, expect, vi } from 'vitest';
import { toolCache, cachedImpl, callScope, canonicalJson } from '../../api/lib/assistant/tool-cache.js';
import { strategyImpl, sowVolumeOf } from '../../api/lib/assistant/agent-strategies.js';
import { agentAnswer, AGENT_TOOL_NAMES, AGENT_SYSTEM, AGENT_TOOLS, NOT_FOUND } from '../../api/lib/assistant/agent.js';
import { refCards } from '../../api/lib/assistant/quote-cards.js';
import { FILTERS } from '../../api/lib/assistant/tool-kit.js';

const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } });
// a scripted model: each entry is a round — tool calls, or the final text
const script = (...rounds) => { let n = 0; const seen = []; const fn = async ({ messages }) => { seen.push(messages.length); const r = rounds[Math.min(n++, rounds.length - 1)]; return { choices: [{ message: typeof r === 'string' ? { content: r } : { content: '', tool_calls: r } }] }; }; fn.seen = seen; return fn; };
const P1 = { id: 501, text: 'A daughter was born to Mr. and Mrs. Maxwell in Montreal.', title: 'Star of the West, v1, i3', author: null, url: 'https://bahai-education.org/sifter-star-of-the-west/v1.3#~d=9~i=4', place: 'p. 4', doc_id: 9, document_id: 9, para_id: 501 };
const docs = async (ids) => ids.map((id) => ({ id, title: 'Star of the West, v1, i3', author: null, cover_url: null }));

describe('tool cache', () => {
  it('stores by name + canonical args, ignores key order, counts hit/miss per call', async () => {
    const c = toolCache(), f = vi.fn(async (a) => [a.q]), w = c.wrap('s', f);
    const a = await callScope(() => w({ q: 'x', n: 1 })), b = await callScope(() => w({ n: 1, q: 'x' }));
    expect(f).toHaveBeenCalledTimes(1);
    expect([a.cache, b.cache]).toEqual(['miss', 'hit']);
    expect(c.stats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });
  it('never caches an error or an empty result; expires after the TTL; evicts the oldest past max', async () => {
    let t = 0;
    const c = toolCache({ ttl: 100, max: 2, now: () => t });
    let n = 0;
    const flaky = c.wrap('f', async () => { if (n++ === 0) throw new Error('down'); return n === 2 ? [] : ['ok']; });
    await expect(flaky()).rejects.toThrow('down');
    expect(await flaky()).toEqual([]);          // empty: not stored
    expect(await flaky()).toEqual(['ok']);      // computed again, stored
    expect(c.stats().size).toBe(1);
    t = 101; await flaky(); expect(n).toBe(4);  // expired
    const g = c.wrap('g', async (x) => [x]);
    await g(1); await g(2); await g(3);
    expect(c.stats().size).toBe(2);
  });
  it('cachedImpl wraps functions only; a call with no cached work reports none', async () => {
    const impl = cachedImpl({ search: async () => ['p'], notes: 5 }, toolCache());
    expect(impl.notes).toBe(5);
    expect((await callScope(() => impl.search())).cache).toBe('miss');
    expect((await callScope(async () => 1)).cache).toBe('none');
  });
});

describe('strategyImpl', () => {
  it('search_in_work: every wording, exact AND meaning, merged and deduped; Star of the West years narrow the issues', async () => {
    const quote = vi.fn(async ({ query, mode }) => ({ total: 1, passages: mode === 'literal' && query === 'a daughter was born' ? [P1] : mode === 'meaning' ? [P1, { ...P1, id: 502, para_id: 502, text: 'Another' }] : [] }));
    const sowDocs = async () => [{ id: 9, title: 'Star of the West, v1, i3' }, { id: 20, title: 'Star of the West, v2, i1' }, { id: 30, title: 'Star of the West, v11, i1' }];
    const s = strategyImpl({ deps: { quoteSearch: quote, findTitled: async () => ({ doc: { id: 1, title: 'Star of the West' }, others: [] }), sowDocs } });
    const r = await s.searchInWork({ work: 'Star of the West', queries: ['a daughter was born', 'birth of a child'], years: [1910] });
    expect(sowVolumeOf(1910)).toBe(1);
    expect(quote).toHaveBeenCalledTimes(4);
    expect(quote.mock.calls.every(([a]) => a.works.length === 1 && a.works[0] === 9)).toBe(true);
    expect(quote.mock.calls.map(([a]) => a.mode).sort()).toEqual(['literal', 'literal', 'meaning', 'meaning']);
    expect(r.work.title).toBe('Star of the West');
    expect(r.passages.map((p) => p.id)).toEqual([501, 502]);   // deduped, exact hits first
    expect(r.per_query[0]).toMatchObject({ query: 'a daughter was born', exact: 1 });
  });
  it('search_in_work: a year with no issue says so; an unknown work is null', async () => {
    const find = async (t) => (t === 'Nope' ? null : { doc: { id: 1, title: 'Star of the West' }, others: [] });
    const s = strategyImpl({ deps: { quoteSearch: vi.fn(), findTitled: find, sowDocs: async () => [{ id: 9, title: 'Star of the West, v1, i3' }] } });
    expect((await s.searchInWork({ work: 'Star of the West', queries: ['x'], years: [1920] })).passages).toEqual([]);
    expect(await s.searchInWork({ work: 'Nope', queries: ['x'] })).toBeNull();
  });
  it('search_in_work: one wording as a plain string is searched, not dropped (11-12 live: the agent sent a string)', async () => {
    const quote = vi.fn(async () => ({ total: 0, passages: [] }));
    const s = strategyImpl({ deps: { quoteSearch: quote, findTitled: async () => ({ doc: { id: 7, title: 'Some Book' }, others: [] }) } });
    await s.searchInWork({ work: 'Some Book', queries: 'a daughter was born' });
    expect(quote.mock.calls.map(([a]) => a.query)).toEqual(['a daughter was born', 'a daughter was born']);
  });
  it('a document filter holds every Star of the West issue (395; the cap of 10 failed every in-periodical meaning search, 11-12)', async () => {
    const Ajv = (await import('ajv')).default;
    const v = new Ajv({ strict: false }).compile(FILTERS.properties.documentId);
    expect(v(Array.from({ length: 395 }, (_, i) => i + 1))).toBe(true);
  });
  it('find_passage maps author / religion / work to the quote search', async () => {
    const quote = vi.fn(async () => ({ total: 0, passages: [], mode_used: 'none' }));
    await strategyImpl({ deps: { quoteSearch: quote } }).findPassage({ query: 'q', religions: ['Islam'], author: 'Muhammad', work: 'Quran' });
    expect(quote.mock.calls[0][0]).toMatchObject({ query: 'q', religions: ['Islam'], authors: ['Muhammad'], works: ['Quran'] });
  });
  it('find_passage puts the words\' own source ahead of books that quote them (Esslemont quoting the Short Obligatory Prayer)', async () => {
    const t = 'I bear witness, O my God, that Thou hast created me to know Thee and to worship Thee.';
    const P = (id, title, author, book_author, authority) => ({ id, document_id: id, paragraph_index: 1, text: t, title, author, book_author, authority, religion: "Baha'i" });
    const quote = async () => ({ mode_used: 'literal', total: 3, passages: [P(1, 'Reality, Soul, and the Worlds of God', '7321', '7321', 'scholarship'),
      P(2, 'Bahá’u’lláh and the New Era', 'Bahá’u’lláh', 'John E. Esslemont', 'scholarship'), P(3, 'Prayers and Meditations', 'Bahá’u’lláh', 'Bahá’u’lláh', 'scripture')] });
    const r = await strategyImpl({ deps: { quoteSearch: quote } }).findPassage({ query: 'I bear witness, O my God, that Thou hast created me to know Thee and to worship Thee' });
    expect(r.passages[0].title).toBe('Prayers and Meditations');
    expect(r.passages).toHaveLength(3);
  });
  it('extract_from_work resolves the title then asks the extractor with the selection as the request', async () => {
    const ex = vi.fn(async () => ({ result: { total: 0, passages: [] } }));
    await strategyImpl({ deps: { findTitled: async () => ({ doc: { id: 5, title: 'Tablets' }, others: [] }), extractFromWork: ex } }).extractFromWork({ work: 'Tablets', select: 'the prayers' });
    expect(ex.mock.calls[0][0]).toMatchObject({ doc: { id: 5 }, messages: [{ role: 'user', content: 'the prayers' }] });
  });
  it('book_card: the finder\'s pick → the card the book answer builds', async () => {
    const book = { id: 7, title: 'The Hidden Words', author: "Bahá'u'lláh", url: 'https://x/hw', description: 'Short sayings.' };
    const s = strategyImpl({ deps: { bookFastPath: async () => ({ kind: 'work', work: { doc: { id: 7, title: 'The Hidden Words' }, others: [] } }),
      titleAnswer: async (w, { onEvent }) => onEvent({ type: 'book', book }) } });
    expect(await s.bookCard({ title: 'Hidden Words' })).toMatchObject({ kind: 'work', book });
  });
});

describe('the agent over the strategy tools', () => {
  const impl = (o = {}) => ({ search: async () => [], searchInWork: async () => ({ work: { id: 1, title: 'Star of the West' }, total: 1, passages: [P1], per_query: [] }), ...o });
  const base = { messages: [{ role: 'user', content: 'Was a daughter born to the Maxwells? It is in the 1910 issue.' }], cardDocs: docs };
  it('are on the agent\'s tool list and taught in the prompt', () => {
    for (const n of ['book_card', 'search_in_work', 'find_passage', 'extract_from_work']) {
      expect(AGENT_TOOL_NAMES).toContain(n);
      expect(AGENT_TOOLS.find((t) => t.function.name === n).function.parameters.required.length).toBeGreaterThan(0);
      expect(AGENT_SYSTEM).toContain(n);
    }
    expect(AGENT_SYSTEM).toMatch(/at least 3 differently worded searches/);
  });
  it('search_in_work returns [P#] the reply can cite; the trace records tool, args, ms, cache, count', async () => {
    const create = script([call('a', 'search_in_work', { work: 'Star of the West', queries: ['a daughter was born'], years: [1910] })], 'Yes: a daughter was born to them [[P1]].');
    const r = await agentAnswer({ ...base, create, tools: impl(), cache: toolCache() });
    expect(r.reply).toContain('bahai-education.org/sifter-star-of-the-west/v1.3');
    expect(r.agent.steps[0]).toMatchObject({ tool: 'search_in_work', args: { years: [1910] }, count: 1, cache: 'miss' });
    expect(typeof r.agent.steps[0].ms).toBe('number');
    expect(r.agent.searches).toBe(1);
    expect(r.agent.cache).toEqual({ miss: 1 });
  });
  it('the same call again is a cache hit and does not run the strategy twice', async () => {
    const cache = toolCache(), searchInWork = vi.fn(async () => ({ work: { id: 1, title: 'SoW' }, total: 1, passages: [P1], per_query: [] }));
    const mk = () => script([call('a', 'search_in_work', { work: 'SoW', queries: ['x'] })], 'ok [[P1]]');
    await agentAnswer({ ...base, create: mk(), tools: impl({ searchInWork }), cache });
    const r = await agentAnswer({ ...base, create: mk(), tools: impl({ searchInWork }), cache });
    expect(searchInWork).toHaveBeenCalledTimes(1);
    expect(r.agent.steps[0].cache).toBe('hit');
    expect(r.reply).toContain('v1.3');   // refs still resolve on a hit: the cache holds passages, not turn-local refs
  });
  it('book_card gives a [B#] and its book card; a passage card for the same work suppresses the duplicate', async () => {
    const book = { id: 9, title: 'Star of the West, v1, i3', author: null, url: 'https://x/sow', description: 'The magazine.' };
    const create = () => script([call('a', 'book_card', { title: 'Star of the West' }), call('b', 'search_in_work', { work: 'Star of the West', queries: ['x'] })], 'Here is [[B1]]; it says [[P1]].');
    const only = await agentAnswer({ ...base, create: script([call('a', 'book_card', { title: 'Hidden Words' })], 'Read [[B1]].'), cardDocs: docs,
      tools: impl({ bookCard: async () => ({ kind: 'work', doc: { id: 7 }, book: { ...book, id: 7, title: 'The Hidden Words', url: 'https://x/hw' } }) }) });
    expect(only.reply).toContain('[*The Hidden Words*](https://x/hw)');
    expect(only.cards.books.map((b) => b.id)).toEqual([7]);
    const both = await agentAnswer({ ...base, create: create(), tools: impl({ bookCard: async () => ({ kind: 'work', doc: { id: 9 }, book }) }) });
    expect(both.cards.passage).toMatchObject({ work_id: 9, url: P1.url });
    expect(both.cards.books).toEqual([]);   // the passage card already shows that work
  });
  it('find_passage and extract_from_work give citable passages; a miss says how to go on', async () => {
    const create = script([call('a', 'find_passage', { query: 'the earth is one country' }), call('b', 'extract_from_work', { work: 'Tablets', select: 'prayers' })], 'x [[P1]]');
    const r = await agentAnswer({ ...base, create, tools: impl({ findPassage: async () => ({ total: 1, mode_used: 'literal', passages: [P1] }), extractFromWork: async () => null }) });
    expect(r.agent.steps.map((s) => s.count)).toEqual([1, 0]);
  });
});

describe('research cache as the agent\'s first tool', () => {
  const base = { messages: [{ role: 'user', content: 'How do Bahá\'ís pray?' }], cardDocs: docs };
  it('a held set comes back as [P#] the reply cites (never through the tool cache); the cited passages are captured under the standalone question', async () => {
    const researchLookup = vi.fn(async () => ({ status: 'curated', similarity: 0.95, passages: [P1] })), researchCapture = vi.fn(async () => null);
    const mk = () => script([call('a', 'research_lookup', { question: 'How do Bahá\'ís pray?' })], 'They pray daily [[P1]].');
    const cache = toolCache();
    await agentAnswer({ ...base, create: mk(), tools: { search: async () => [], researchLookup, researchCapture }, cache });
    const r = await agentAnswer({ ...base, create: mk(), tools: { search: async () => [], researchLookup, researchCapture }, cache });
    expect(researchLookup).toHaveBeenCalledTimes(2);
    expect(r.agent.steps[0]).toMatchObject({ tool: 'research_lookup', count: 1 });
    expect(r.reply).toContain(P1.url);
    expect(researchCapture).toHaveBeenLastCalledWith('How do Bahá\'ís pray?', [expect.objectContaining({ id: P1.id })]);
    expect(AGENT_TOOL_NAMES[0]).toBe('research_lookup');
  });
  it('nothing held → the agent is told to research; nothing cited → nothing captured', async () => {
    const researchCapture = vi.fn(async () => null);
    const r = await agentAnswer({ ...base, create: script([call('a', 'research_lookup', { question: 'q' })], 'No refs.'), tools: { search: async () => [], researchLookup: async () => null, researchCapture } });
    expect(r.agent.steps[0].count).toBe(0);
    expect(researchCapture).not.toHaveBeenCalled();
  });
});

describe('earned not-found', () => {
  const msgs = [{ role: 'user', content: 'Anything on the Maxwell birth?' }], tools = { search: async () => [] };
  it('a lacking verdict on fewer than 3 searches gets one more round naming the rule; the marker never reaches the reader', async () => {
    const create = script([call('a', 'fused_search', { query: 'maxwell birth' })], `${NOT_FOUND} The library holds nothing on it.`, [call('b', 'fused_search', { query: 'a daughter was born' }), call('c', 'fused_search', { query: 'May Maxwell daughter' }), call('d', 'fused_search', { query: 'Mary Maxwell' })], `${NOT_FOUND} Nothing found.`);
    const r = await agentAnswer({ messages: msgs, create, tools });
    expect(r.agent.nudged).toBe(true);
    expect(r.agent.searches).toBe(4);
    expect(r.reply).toBe('Nothing found.');
    expect(r.reply).not.toContain('NOT_IN_LIBRARY');
  });
  it('the nudge text carries the rule; it is given once; 3+ searches are accepted as earned', async () => {
    const seen = [];
    const create = async ({ messages }) => { seen.push(messages.at(-1)); return seen.length === 1 ? { choices: [{ message: { content: `${NOT_FOUND} none` } }] } : { choices: [{ message: { content: `${NOT_FOUND} still none` } }] }; };
    const r = await agentAnswer({ messages: msgs, create, tools });
    expect(seen[1].content).toMatch(/at least 3 differently worded searches/);
    expect(r.reply).toBe('still none');
    const three = script([1, 2, 3].map((i) => call(`t${i}`, 'fused_search', { query: `q${i}` })), `${NOT_FOUND} none`);
    expect((await agentAnswer({ messages: msgs, create: three, tools })).agent.nudged).toBe(false);
  });
  it('a plain conversational reply (no marker, no searches) is never nudged', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Thank you!' }], create: script('You are welcome.'), tools });
    expect(r.agent).toMatchObject({ nudged: false, searches: 0 });
  });
});

describe('refCards', () => {
  const pass = { ...P1, citation_url: P1.url, document_id: 9, excerpt: 'a **daughter** was born' };
  it('exactly one open passage becomes a card; several stay a text list; a blockquoted one is left to the quote card', async () => {
    expect((await refCards({ reply: 'See it.', passages: [pass] }, { docs })).passage).toMatchObject({ work_id: 9, url: P1.url, excerpt: 'a **daughter** was born' });
    expect((await refCards({ reply: 'x', passages: [pass, { ...pass, url: 'https://y', citation_url: 'https://y' }] }, { docs })).passage).toBeNull();
    const quoted = `> A daughter was born to Mr. and Mrs. Maxwell in Montreal.\n>\n> — [Star of the West](${P1.url})`;
    expect((await refCards({ reply: quoted, passages: [pass], books: [{ id: 9 }] }, { docs }))).toMatchObject({ passage: null, books: [] });
  });
});

describe('the channel frame', () => {
  it('reaches the agent\'s system prompt, and only when there is one', async () => {
    const seen = [];
    const create = async ({ messages }) => { seen.push(messages[0].content); return { choices: [{ message: { content: 'Hi.' } }] }; };
    const m = [{ role: 'user', content: 'hello' }];
    await agentAnswer({ messages: m, create, tools: {}, frame: 'Reply in under about 80 words.' });
    await agentAnswer({ messages: m, create, tools: {} });
    expect(seen[0]).toContain('REPLY FRAME');
    expect(seen[0]).toContain('under about 80 words');
    expect(seen[1]).not.toContain('REPLY FRAME');
  });
});
