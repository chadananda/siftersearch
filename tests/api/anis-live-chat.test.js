// Live chat speed (11-03, Chad: "within a few seconds, with a few Jev calls and a couple of LLM calls"): on a channel a reader
// watches (channel data `live`), Jev's strategy runs instead of the researcher, the researcher plans ONE round of tool calls
// that run in parallel, and one Sonnet writer (thinking off) streams the answer. Email keeps the full researcher.
import { describe, it, expect, afterEach } from 'vitest';
import { research, booksFound } from '../../api/lib/assistant/researcher.js';
import { anisRespond, agentOn, liveResearch } from '../../api/lib/assistant/respond.js';
import { channelFor, CHANNELS } from '../../api/lib/assistant/channels.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const P = (id) => ({ id, text: `passage ${id} about the soul`, title: 'Gleanings', author: 'Bahá’u’lláh', source_url: `https://oceanlibrary.com/g#${id}`, document_id: 20783, paragraph_index: id, religion: "Bahá'í" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('channels: live is data', () => {
  it('the chat channels are live; the email letter is not', () => {
    expect(CHANNELS['site-chat'].live).toBe(true);
    expect(CHANNELS['widget-chat'].live).toBe(true);
    expect(CHANNELS.email.live).toBeFalsy();
  });
});

describe('researcher: one round runs its tool calls in parallel', () => {
  it('two searches asked together are in flight at the same time', async () => {
    let inFlight = 0, peak = 0;
    const search = async () => { inFlight++; peak = Math.max(peak, inFlight); await sleep(20); inFlight--; return [P(1)]; };
    const replies = [
      { tool_calls: [call('a', 'combined_search', { query: 'soul after death' }), call('b', 'combined_search', { query: 'progress of the soul' })] },
      { content: 'BRIEF:\nReaching for: the soul\n- it progresses: P1\nKEEP: P1' },
    ];
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create: async () => ({ choices: [{ message: replies.shift() }] }), tools: { search } });
    expect(peak).toBe(2);
    expect(r.steps.map((s) => s.args.query)).toEqual(['soul after death', 'progress of the soul']);   // steps keep the model's order
  });

  it('brief: false → ONE model call that plans the tools; their passages come back with no brief round', async () => {
    const seen = [];
    const create = async (params) => { seen.push(params); return { choices: [{ message: { tool_calls: [call('a', 'combined_search', { query: 'x' }), call('b', 'combined_search', { query: 'y' })] } }] }; };
    let n = 0;
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { search: async () => [P(++n)] }, maxRounds: 1, brief: false });
    expect(seen).toHaveLength(1);
    expect(seen[0].tools.length).toBeGreaterThan(0);
    expect(String(seen[0].messages[0].content)).toMatch(/ONE ROUND/);
    expect(r.brief).toBeNull();
    expect(r.passages.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('researcher: the second round searches INSIDE the books the first round found (coordinator 11-03)', () => {
  const inBook = (doc, n) => ({ ...P(doc * 100 + n), document_id: doc, title: `Book ${doc}` });
  it('the top books of round one, best rank first, each searched with the query that found it; no second model call', async () => {
    const seen = [], within = [];
    const create = async (params) => { seen.push(params); return { choices: [{ message: { tool_calls: [call('a', 'combined_search', { query: 'Mulla Husayn first night' }), call('b', 'combined_search', { query: 'declaration of the Bab Shiraz' })] } }] }; };
    const search = async (q) => q.startsWith('Mulla') ? [inBook(7, 1), inBook(8, 1), inBook(7, 2)] : [inBook(9, 1), inBook(7, 3)];
    const searchIn = async (query, documentId) => { within.push([documentId, query]); return [inBook(documentId, 50)]; };
    const r = await research({ messages: [{ role: 'user', content: 'Tell me the story of the evening Mulla Husayn met the Bab' }], create, tools: { search, searchIn }, maxRounds: 1, brief: false, inBooks: 3 });
    expect(seen).toHaveLength(1);
    expect(within).toEqual([[7, 'Mulla Husayn first night'], [9, 'declaration of the Bab Shiraz'], [8, 'Mulla Husayn first night']]);
    expect(r.passages.map((p) => p.id)).toEqual(expect.arrayContaining([750, 950, 850]));
    expect(r.steps.filter((s) => s.tool === 'in_book_search').map((s) => s.args.document_id)).toEqual([7, 9, 8]);
  });

  it('a book the model asked for by title (document_search) is searched first, with the reader\'s question', async () => {
    const within = [];
    const create = async () => ({ choices: [{ message: { tool_calls: [call('a', 'document_search', { title: 'Gate of the Heart' }), call('b', 'combined_search', { query: 'Saiedi interpretive revelation' })] } }] });
    const r = await research({ messages: [{ role: 'user', content: 'What does Saiedi mean by interpretive revelation?' }], create,
      tools: { search: async () => [inBook(5, 1)], work: async () => ({ doc: { id: 42, title: 'Gate of the Heart', author: 'Nader Saiedi' }, others: [] }),
        searchIn: async (query, documentId) => { within.push([documentId, query]); return [inBook(documentId, 9)]; } },
      maxRounds: 1, brief: false, inBooks: 2 });
    expect(within).toEqual([[42, 'What does Saiedi mean by interpretive revelation?'], [5, 'Saiedi interpretive revelation']]);
    expect(r.passages.some((p) => p.document_id === 42)).toBe(true);
  });

  it('the one-round prompt says a book step follows only when inBooks is set', async () => {
    const seen = [];
    const create = async (params) => { seen.push(params); return { choices: [{ message: { content: '' } }] }; };
    await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { search: async () => [], searchIn: async () => [] }, maxRounds: 1, brief: false, inBooks: 3 });
    await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { search: async () => [] }, maxRounds: 1, brief: false });
    expect(String(seen[0].messages[0].content)).toMatch(/INSIDE the books/);
    expect(String(seen[1].messages[0].content)).not.toMatch(/INSIDE the books/);
  });

  it('perBook: each top book is searched with the round\'s other queries too, all at once (one model call)', async () => {
    const seen = [], within = [];
    const create = async (params) => { seen.push(params); return { choices: [{ message: { tool_calls: [call('a', 'combined_search', { query: 'siege of Tabarsi' }), call('b', 'combined_search', { query: 'Tabarsi chronology 1849 dates' })] } }] }; };
    const search = async (q) => q.startsWith('siege') ? [inBook(7, 1)] : [inBook(9, 1)];
    const searchIn = async (query, documentId) => { within.push([documentId, query]); return [inBook(documentId, 10 + within.length)]; };
    const q = 'How did the siege of Tabarsi end?';
    const r = await research({ messages: [{ role: 'user', content: q }], create, tools: { search, searchIn }, maxRounds: 1, brief: false, inBooks: 2, perBook: 3 });
    expect(seen).toHaveLength(1);
    expect(within).toEqual([[7, 'siege of Tabarsi'], [7, 'Tabarsi chronology 1849 dates'], [7, q], [9, 'Tabarsi chronology 1849 dates'], [9, 'siege of Tabarsi'], [9, q]]);
    expect(r.steps.filter((s) => s.tool === 'in_book_search')).toHaveLength(6);
  });

  it('extraMs: a book\'s own query is always awaited; an extra query past the budget costs only its passages', async () => {
    const create = async () => ({ choices: [{ message: { tool_calls: [call('a', 'combined_search', { query: 'main' }), call('b', 'combined_search', { query: 'other' })] } }] });
    const searchIn = (query, documentId) => new Promise((r) => setTimeout(() => r([inBook(documentId, query === 'main' ? 1 : 2)]), query === 'main' ? 30 : 400));
    const t = Date.now();
    const r = await research({ messages: [{ role: 'user', content: 'main' }], create, tools: { search: async () => [inBook(7, 9)], searchIn }, maxRounds: 1, brief: false, inBooks: 1, perBook: 3, extraMs: 20 });
    expect(Date.now() - t).toBeLessThan(300);
    expect(r.passages.map((p) => p.id)).toEqual(expect.arrayContaining([701]));
    expect(r.passages.some((p) => p.id === 702)).toBe(false);
    expect(r.steps.filter((s) => s.late)).toHaveLength(1);
  });

  it('booksFound: queries are distinct and capped at perBook; perBook 1 keeps the finding query alone', () => {
    const searched = [{ query: 'a', docs: [1] }, { query: 'b', docs: [2] }, { query: 'a', docs: [3] }];
    expect(booksFound({ searched, question: 'a', n: 2, perBook: 3 }).map((b) => b.queries)).toEqual([['a', 'b'], ['b', 'a']]);
    expect(booksFound({ searched, question: 'q', n: 1 }).map((b) => b.queries)).toEqual([['a']]);
  });

  it('the one-round prompt asks for a dates search when the answer turns on when things happened', async () => {
    const seen = [];
    await research({ messages: [{ role: 'user', content: 'q' }], create: async (p) => { seen.push(p); return { choices: [{ message: { content: '' } }] }; }, tools: { search: async () => [] }, maxRounds: 1, brief: false });
    expect(String(seen[0].messages[0].content)).toMatch(/chronology of those events/);
  });

  it('a failed in-book search costs only its own passages', async () => {
    const create = async () => ({ choices: [{ message: { tool_calls: [call('a', 'combined_search', { query: 'x' })] } }] });
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { search: async () => [inBook(7, 1)], searchIn: async () => { throw new Error('timeout'); } },
      maxRounds: 1, brief: false, inBooks: 3 });
    expect(r.passages.map((p) => p.id)).toEqual([701]);
  });
});

describe('liveResearch: the shape of the researcher on a live channel, from Jev\'s depth', () => {
  it('one planning round, no brief; depth=research only widens the round', () => {
    expect(liveResearch({ channel: channelFor('site-chat'), depth: 'answer' })).toEqual({ maxRounds: 1, maxCalls: 5, brief: false, inBooks: 3 });
    expect(liveResearch({ channel: channelFor('site-chat'), depth: null })).toEqual({ maxRounds: 1, maxCalls: 5, brief: false, inBooks: 3 });
    expect(liveResearch({ channel: channelFor('site-chat'), depth: 'research' })).toEqual({ maxRounds: 1, maxCalls: 8, brief: false, inBooks: 4, perBook: 2, extraMs: 800 });
    expect(liveResearch({ channel: channelFor('email', { trusted: true }), depth: 'answer' })).toBeNull();   // email: the full loop
  });
});

describe('agentOn: a live chat never falls back to ANIS_RESEARCH', () => {
  const saved = process.env.ANIS_RESEARCH;
  afterEach(() => { if (saved === undefined) delete process.env.ANIS_RESEARCH; else process.env.ANIS_RESEARCH = saved; });
  it('ANIS_RESEARCH=all with ANIS_AGENT unset: no agent on site chat, the agent still on email', () => {
    process.env.ANIS_RESEARCH = 'all';
    expect(agentOn({ channel: channelFor('site-chat') }, undefined)).toBe(false);
    expect(agentOn({ channel: channelFor('email', { trusted: true }) }, undefined)).toBe(true);
    expect(agentOn({ channel: channelFor('site-chat') }, 'site-chat')).toBe(true);   // an explicit ANIS_AGENT still wins
    expect(agentOn({ engine: 'agent', channel: channelFor('site-chat') }, '')).toBe(true);
  });
});

const respondDeps = (over = {}) => {
  const log = { research: [], crafts: [], searches: [] };
  const d = {
    search: async (a) => { log.searches.push(a); return { passages: a.religion === 'Islam' ? [{ ...P(1), religion: 'Islam' }] : [{ ...P(2), religion: 'Christian' }] }; },
    research: async (a) => { log.research.push(a); return { passages: [P(3), P(4)], brief: null, steps: [], ms: 1 }; },
    craft: async (args) => { log.crafts.push(args); args.onChunk('The soul progresses.'); return 'The soul progresses.'; },
    companion: async () => null,
    ...over,
  };
  return { d, log };
};
const soulQ = [{ role: 'user', content: 'What does the Bahá’í view of the soul after death come down to?' }];

describe('anisRespond on a live channel', () => {
  it('Jev chose a strategy → the strategy runs, the researcher does not, and the Sonnet writer writes with thinking off', async () => {
    const { d, log } = respondDeps();
    const decisions = decisionLog();
    await anisRespond({ messages: [{ role: 'user', content: 'How do the Qur’án and the Gospel each speak of forgiveness?' }], profile: { default_tradition: "Baha'i" }, deps: d,
      direction: { channel: channelFor('site-chat'), research: true, strategy: { strategy: { choice: 'comparison', confidence: 0.9 }, sides: ['Islam', 'Christian'] }, decisions } });
    expect(log.research).toHaveLength(0);
    expect(log.searches.map((s) => s.religion)).toEqual(['Islam', 'Christian']);
    expect(log.crafts[0].llm).toMatchObject({ model: 'claude-sonnet-5-5', thinking: false });
  });

  it('no strategy → one quick research round (shape from Jev\'s depth), then one Sonnet writer, thinking off', async () => {
    const { d, log } = respondDeps();
    const r = await anisRespond({ messages: soulQ, deps: d, direction: { channel: channelFor('site-chat'), research: true, depth: 'research' } });
    expect(log.research).toHaveLength(1);
    expect(log.research[0]).toMatchObject({ maxRounds: 1, maxCalls: 8, brief: false, inBooks: 4, perBook: 2, extraMs: 800 });
    expect(log.crafts).toHaveLength(1);
    expect(log.crafts[0].llm).toMatchObject({ model: 'claude-sonnet-5-5', thinking: false });
    expect(log.crafts[0].direction.format.id).toBe('research');
    expect(r.format).toMatchObject({ id: 'research', by: 'researcher' });
  });

  it('email keeps the full researcher loop and the thinking writer', async () => {
    const { d, log } = respondDeps();
    await anisRespond({ messages: soulQ, deps: d, direction: { channel: channelFor('email', { trusted: true }), research: true } });
    expect(log.research[0].maxRounds).toBeUndefined();
    expect(log.crafts[0].llm.thinking).toBeUndefined();
  });
});

describe('anisTurn passes Jev\'s depth to respond', () => {
  it('direction.depth = triage depth choice', async () => {
    const respond = [];
    const deps = {
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, depth: { choice: 'research', confidence: 0.8 } }),
      respond: async (a) => { respond.push(a); return { reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
    };
    await anisTurn({ messages: soulQ, participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(respond[0].direction.depth).toBe('research');
  });
});

describe('quotation source: core literature only (Chad 11-03: "limited to core literature, not secondary commentary")', () => {
  it('respond asks the source hunt for core-literature holders only', async () => {
    const opts = [];
    const deps = { plan: async () => ({ shape: 'quote' }), search: async () => ({ passages: [], _plan: { shape: 'quote' } }),
      craft: async () => 'ok', companion: async () => ({}), phrases: async () => ({ phrase: null, via: 'fallback', exact: [], names: [], spellings: [] }),
      sourceHunt: async (q, d, o) => { opts.push(o); return null; } };
    await anisRespond({ messages: [{ role: 'user', content: 'where is this from: immerse yourselves in the ocean of my words' }], deps });
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0]).toMatchObject({ coreOnly: true });
  });
});

describe('anisTurn passes Jev\'s lookup intent to respond even when the lookup finds nothing', () => {
  it('direction.lookupIntent = book, no direction.lookup', async () => {
    const respond = [];
    const deps = {
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, lookup: { choice: 'book', confidence: 0.9 } }),
      lookup: async () => null,
      respond: async (a) => { respond.push(a); return { reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
    };
    await anisTurn({ messages: [{ role: 'user', content: 'Dawnbreakers' }], participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(respond[0].direction.lookupIntent).toBe('book');
    expect(respond[0].direction.lookup).toBeUndefined();
  });
});

describe('replyCap: the writer has room for a two-sided or a study answer (coordinator 11-03: comparison/understanding hit 1,100)', () => {
  it('comparison and understanding get 2,400; research 8,000; a plain chat reply 1,100; a letter +2,000', async () => {
    const { replyCap } = await import('../../api/lib/assistant/craft.js');
    expect(replyCap({ format: { id: 'comparison' } })).toBe(2400);
    expect(replyCap({ format: { id: 'understanding' } })).toBe(2400);
    expect(replyCap({ format: { id: 'research' } })).toBe(8000);
    expect(replyCap({ format: { id: 'prayer' } })).toBe(1100);
    expect(replyCap({ format: { id: 'prayer' } }, 'low')).toBe(1500);
    expect(replyCap({ format: { id: 'position' } })).toBe(3100);
    expect(replyCap({ format: { id: 'guidance' }, channel: { id: 'email' } })).toBe(3100);
  });
});
