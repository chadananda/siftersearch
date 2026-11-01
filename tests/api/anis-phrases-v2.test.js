// Anís phrase step v2 (api/lib/assistant/phrases.js → search/hints.js → respond.js): structured JSON from one Haiku call for
// quote/lookup only; deterministic skips; follow-ups get the previous turn; assistant-only words are no quotation. No network.
import { describe, it, expect } from 'vitest';
import { extractPhrases, parsePhrases, fixedPhrases, hintsOf, phraseStage, leansBack } from '../../api/lib/assistant/phrases.js';
import { hintPlan, applyHints } from '../../api/lib/search/hints.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { timed, timelineOf } from '../../api/lib/assistant/timeline.js';
import { withAIContext } from '../../api/lib/ai-context.js';

const json = (o) => async () => ({ content: JSON.stringify(o) });
const noCall = async () => { throw new Error('no call expected'); };

describe('extractPhrases: structured parse', () => {
  it('a quote → exact (seeker wording), names, author, work, tradition; phrase = the exact wording', async () => {
    const r = await extractPhrases('can you find the quote "the earth is one country" from Bahaullah in Gleanings', { shape: 'quote' },
      { complete: json({ exact: ['the earth is one country'], names: ['Bahaullah', 'Gleanings'], author: 'Bahaullah', work: 'Gleanings', tradition: null, spellings: ["Bahá'u'lláh"] }) });
    expect(r).toMatchObject({ via: 'haiku', phrase: 'the earth is one country', exact: ['the earth is one country'], names: ['Bahaullah', 'Gleanings'], author: 'Bahaullah', work: 'Gleanings', tradition: null, spellings: [] });   // a spelling that folds to a name adds nothing
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });
  it('a lookup → phrase = the name; spellings are transliterations only (a synonym or title is dropped)', async () => {
    const r = await extractPhrases('mulla hosein', { shape: 'lookup' },
      { complete: json({ exact: [], names: ['mulla hosein'], spellings: ['Mullá Ḥusayn', 'Mulla Husayn', 'Bábu’l-Báb', 'first believer'] }) });
    expect(r.phrase).toBe('mulla hosein');
    expect(r.spellings).toEqual(['Mullá Ḥusayn']);   // 'Mulla Husayn' folds to the same; the first is kept
  });
  it('short lookups are asked ("seven valleys")', async () => {
    const r = await extractPhrases('seven valleys', { shape: 'lookup' }, { complete: json({ exact: [], names: ['Seven Valleys'], spellings: [] }) });
    expect(r).toMatchObject({ via: 'haiku', phrase: 'Seven Valleys' });
  });
  it('an exact wording that is not in the seeker\'s words is dropped (no invented quotation)', () => {
    const p = parsePhrases('{"exact":["love is the light that never fades"],"names":[]}', { question: 'where does it say the earth is one country' });
    expect(p.exact).toEqual([]);
  });
  it('JSON wrapped in prose or a code fence is still read', () => {
    expect(parsePhrases('Here:\n```json\n{"exact":["the earth is one country"],"names":[]}\n```', { question: 'the earth is one country quote' }).exact).toEqual(['the earth is one country']);
  });
});

describe('extractPhrases: fallback', () => {
  it('bad JSON → via fallback, reason bad-json, no phrase', async () => {
    const r = await extractPhrases('find the quote about the ocean of his words', { shape: 'quote' }, { complete: async () => ({ content: 'I think you mean the ocean passage.' }) });
    expect(r).toMatchObject({ via: 'fallback', reason: 'bad-json', phrase: null, exact: [], names: [] });
  });
  it('timeout → via fallback, reason timeout, within the budget', async () => {
    const t0 = Date.now();
    const r = await extractPhrases('find the quote about the ocean of his words', { shape: 'quote' }, { timeoutMs: 30, complete: () => new Promise((ok) => setTimeout(() => ok({ content: '{}' }), 500)) });
    expect(r).toMatchObject({ via: 'fallback', reason: 'timeout', phrase: null });
    expect(Date.now() - t0).toBeLessThan(400);
  });
  it('a throwing model → via fallback, reason error; never throws', async () => {
    expect(await extractPhrases('find the quote about the ocean', { shape: 'quote' }, { complete: noCall })).toMatchObject({ via: 'fallback', reason: 'error' });
  });
});

describe('extractPhrases: follow-ups', () => {
  const thread = [
    { role: 'user', content: 'What did Bahá’u’lláh write about the ocean of His words?' },
    { role: 'assistant', content: 'In **Gleanings** He writes: "Immerse yourselves in the ocean of My words, that ye may unravel its secrets" ([Gleanings LXX](https://oceanlibrary.com/x)).' },
  ];
  it('a follow-up gets the previous seeker turn and the trimmed, unmarked reply', async () => {
    let prompt = '';
    const r = await extractPhrases('who wrote that passage?', { shape: 'lookup' }, { messages: [...thread, { role: 'user', content: 'who wrote that passage?' }],
      complete: async (m) => { prompt = m[0].content; return { content: JSON.stringify({ exact: ['Immerse yourselves in the ocean of My words'], names: ['Gleanings'], work: 'Gleanings' }) }; } });
    expect(prompt).toContain('Previous seeker turn: """What did Bahá’u’lláh write about the ocean of His words?"""');
    expect(prompt).toContain('Assistant\'s previous reply (trimmed): """In Gleanings He writes');
    expect(prompt).not.toContain('**');
    expect(prompt).not.toContain('https://');
    // "that passage" asks for the reply's passage → its wording may be hunted
    expect(r).toMatchObject({ via: 'haiku', history: true, exact: ['Immerse yourselves in the ocean of My words'], work: 'Gleanings' });
  });
  it('the assistant\'s own words are not the seeker\'s quotation unless the seeker asks for that passage', async () => {
    const r = await extractPhrases('and what did he say about the sea?', { shape: 'quote' }, { messages: [...thread, { role: 'user', content: 'and what did he say about the sea?' }],
      complete: json({ exact: ['Immerse yourselves in the ocean of My words'], names: ['Bahá’u’lláh'] }) });
    expect(r.exact).toEqual([]);
    expect(r.phrase).toBe('Bahá’u’lláh');
  });
  it('a self-contained question sends no history', async () => {
    let prompt = '';
    await extractPhrases('find the quote ye are the fruits of one tree', { shape: 'quote' }, { messages: [...thread, { role: 'user', content: 'find the quote ye are the fruits of one tree' }],
      complete: async (m) => { prompt = m[0].content; return { content: '{"exact":["ye are the fruits of one tree"]}' }; } });
    expect(prompt).not.toContain('Previous seeker turn');
    expect(leansBack('who wrote it')).toBe(true);
    expect(leansBack('the verse you quoted')).toBe(true);
    expect(leansBack('find the quote about justice')).toBe(false);
  });
});

describe('extractPhrases: what it never touches', () => {
  it('fact / define / topic / converse → null, no call', async () => {
    for (const shape of ['fact', 'define', 'topic', 'converse', undefined]) expect(await extractPhrases('when was the Bab martyred', { shape }, { complete: noCall })).toBeNull();
  });
  it('quote marks → the quote, no call', async () => {
    const r = await extractPhrases('x', { shape: 'quote', quote: { phrase: 'the earth is but one country', via: 'quote-marks' } }, { complete: noCall });
    expect(r).toEqual({ phrase: 'the earth is but one country', via: 'quote-marks', exact: ['the earth is but one country'], names: [], spellings: [] });
  });
  it('the named-object match → a work by its library title, a person in the seeker\'s spelling, no call', async () => {
    expect(await extractPhrases('hidden words', { shape: 'lookup', named: { type: 'work', name: 'Hidden Words', matched: 'hidden words' } }, { complete: noCall }))
      .toMatchObject({ phrase: 'Hidden Words', via: 'named-object' });
    expect(fixedPhrases({ shape: 'lookup', named: { type: 'person', name: 'Quddús', matched: 'Ghoddus' } })).toMatchObject({ phrase: 'Ghoddus', names: ['Ghoddus', 'Quddús'] });
    expect(fixedPhrases({ shape: 'quote', named: { type: 'person', name: 'Quddús', matched: 'Ghoddus' } })).toBeNull();
  });
});

describe('hints → planned-search reordering', () => {
  const hit = (id, o) => ({ id, text: '', title: '', author: '', religion: '', ...o });
  it('only haiku results carry hints; the stage record lists every searched string', () => {
    expect(hintsOf({ via: 'quote-marks', phrase: 'x' })).toBeNull();
    const p = { via: 'haiku', phrase: 'mulla hosein', exact: [], names: ['mulla hosein'], spellings: ['Mulla Husayn'], author: null, work: null, tradition: null, ms: 900 };
    expect(hintsOf(p)).toMatchObject({ names: ['mulla hosein'], spellings: ['Mulla Husayn'] });
    expect(phraseStage(p)).toEqual({ choice: ['mulla hosein'], by: 'haiku', ms: 900, names: ['mulla hosein'], spellings: ['Mulla Husayn'] });
  });
  it('names apply to lookups only; a hedged author is no preference; a plan author wins', () => {
    const h = { exact: [], names: ['Quddus'], spellings: ['Quddús'], author: 'Jesus', work: null, tradition: null };
    expect(hintPlan(h, { shape: 'quote' }, { question: 'love your enemies, was it Jesus?' })).toMatchObject({ names: [], author: null });
    expect(hintPlan(h, { shape: 'quote' }, { question: 'Jesus said love your enemies' }).author).toBe('Jesus');
    expect(hintPlan(h, { shape: 'quote', prefer: { author: 'X' } }, { question: 'Jesus said love your enemies' }).author).toBeNull();
    expect(hintPlan(h, { shape: 'lookup' }).names).toEqual(['Quddus']);   // the spelling folds to the same name
  });
  it('a hit with the exact wording leads; author/work only reorder, never drop', () => {
    const hits = [hit(1, { text: 'unrelated', author: 'Abdu’l-Bahá' }), hit(2, { text: 'other', author: 'Bahá’u’lláh', title: 'Gleanings' })];
    const exactHits = [hit(3, { text: 'He said: the earth is but one country and mankind its citizens.' })];
    const out = applyHints(hits, { exact: ['the earth is but one country'], names: [], author: 'Bahaullah', work: 'Gleanings', tradition: null }, { exactHits, limit: 8 });
    expect(out.map((h) => h.id)).toEqual([3, 2, 1]);
  });
});

describe('respond: phrases wired beside the routed stages', () => {
  const base = (over = {}) => {
    const calls = { search: [], phrases: [] };
    return { calls, search: async (a) => { calls.search.push(a); return { passages: [], _plan: { shape: 'quote' } }; },
      craft: async () => 'ok', companion: async () => ({}), sourceHunt: async () => null, ...over };
  };
  it('a haiku phrase replaces the v1 query (no leftover previous-turn words) and its hints reach the search; search_query is what was searched', async () => {
    const d = base({ plan: async () => ({ shape: 'lookup' }),
      phrases: async (q, plan, o) => { d.calls.phrases.push(o.messages.length); return { phrase: 'Mulla Husayn', via: 'haiku', exact: [], names: ['Mulla Husayn'], spellings: ['Mullá Ḥusayn'] }; } });
    const messages = [{ role: 'user', content: 'tell me about the Bab' }, { role: 'assistant', content: 'The Báb …' }, { role: 'user', content: 'who was his first believer' }];
    const r = await anisRespond({ messages, deps: d });
    expect(d.calls.phrases).toEqual([3]);
    expect(d.calls.search[0].query).toBe('Mulla Husayn');
    expect(d.calls.search[0].plan.hints).toMatchObject({ names: ['Mulla Husayn'], spellings: ['Mullá Ḥusayn'] });
    expect(r.search_query).toBe('Mulla Husayn');
    expect(r.plan.phrases).toMatchObject({ via: 'haiku' });
  });
  it('a fallback keeps the v1 query and sends no hints', async () => {
    const d = base({ plan: async () => ({ shape: 'quote' }), phrases: async () => ({ phrase: null, via: 'fallback', reason: 'timeout', exact: [], names: [], spellings: [] }) });
    await anisRespond({ messages: [{ role: 'user', content: 'find the quote about the ocean of his words' }], deps: d });
    expect(d.calls.search[0].query).toBe('find the quote about the ocean of his words');
    expect(d.calls.search[0].plan.hints).toBeUndefined();
  });
  it('the phrase call starts before the source hunt finishes (parallel), and the timeline records its via', async () => {
    const order = [];
    const d = base({ plan: async () => ({ shape: 'quote' }),
      sourceHunt: async () => { order.push('hunt-start'); await new Promise((ok) => setTimeout(ok, 30)); order.push('hunt-end'); return null; },
      phrases: async () => { order.push('phrases'); return { phrase: 'ocean of my words', via: 'haiku', exact: ['ocean of my words'], names: [], spellings: [] }; } });
    const tl = [];
    await withAIContext({ timeline: tl }, () => anisRespond({ messages: [{ role: 'user', content: 'where is this from: immerse yourselves in the ocean of my words' }], deps: d }));
    expect(order.indexOf('phrases')).toBeLessThan(order.indexOf('hunt-end'));
    expect(timelineOf(tl, 0).find((x) => x.name === 'phrases')).toMatchObject({ via: 'haiku' });
  });
  it('timed() records a describe() result and survives a throwing describe', async () => {
    const tl = [];
    await withAIContext({ timeline: tl }, async () => {
      await timed('a', async () => 1, () => ({ via: 'x' }));
      await timed('b', async () => 2, () => { throw new Error('no'); });
    });
    expect(tl.map(({ name, via }) => [name, via])).toEqual([['a', 'x'], ['b', undefined]]);
  });
});
