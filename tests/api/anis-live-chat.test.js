// Live chat speed (11-03, Chad: "within a few seconds, with a few Jev calls and a couple of LLM calls"): on a channel a reader
// watches (channel data `live`), Jev's strategy runs instead of the researcher, the researcher plans ONE round of tool calls
// that run in parallel, and one Sonnet writer (thinking off) streams the answer. Email keeps the full researcher.
import { describe, it, expect, afterEach } from 'vitest';
import { research } from '../../api/lib/assistant/researcher.js';
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

describe('liveResearch: the shape of the researcher on a live channel, from Jev\'s depth', () => {
  it('one planning round, no brief; depth=research only widens the round', () => {
    expect(liveResearch({ channel: channelFor('site-chat'), depth: 'answer' })).toEqual({ maxRounds: 1, maxCalls: 5, brief: false });
    expect(liveResearch({ channel: channelFor('site-chat'), depth: null })).toEqual({ maxRounds: 1, maxCalls: 5, brief: false });
    expect(liveResearch({ channel: channelFor('site-chat'), depth: 'research' })).toEqual({ maxRounds: 1, maxCalls: 8, brief: false });
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
    expect(log.research[0]).toMatchObject({ maxRounds: 1, maxCalls: 8, brief: false });
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
