// Short, elliptical turns resolve against the HISTORY and the READER CARD, through Jev — never through word rules
// (Chad 11-03). The card is built and handed to triage, the plan and the resolver; Jev's outcome (search / ask_back /
// none) redirects the route; a short search gets its query written by the resolver; the battery file is well-formed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderReaderCard, loadReaderCard } from '../../api/lib/assistant/reader-card.js';
import { resolveQuery, RESOLVE_SYSTEM } from '../../api/lib/assistant/short-turn.js';
import { OUTCOMES, T } from '../../api/lib/assistant/triage.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { CANNED } from '../../api/lib/assistant/canned.js';

describe('the reader card', () => {
  it('renders what is known in one line; an anonymous first contact says so', () => {
    expect(renderReaderCard({})).toBe('an anonymous visitor; nothing remembered yet');
    expect(renderReaderCard({ participant: { id: 'sess_1' }, channel: { id: 'widget-chat' } })).toBe('a returning visitor (not signed in) via widget-chat; nothing remembered yet');
    const full = renderReaderCard({ participant: { id: 'u1', authed: true }, channel: 'email', relationship: { stage: 'companion' },
      memory: [{ kind: 'studying', content: 'the Dawn-Breakers' }, { content: 'old fact', corrected: true }], premises: [{ text: 'the Báb is a Manifestation' }],
      enrollments: [{ track_id: 'dawn-breakers-challenge', status: 'active' }, { track_id: 'done', status: 'completed' }], reading: { title: 'The Dawn-Breakers', at: '#5.7' }, language: 'fa' });
    expect(full).toBe('a signed-in reader via email; relationship: companion; writes in fa; remembered: studying: the Dawn-Breakers; holds that: the Báb is a Manifestation; studying: dawn-breakers-challenge; reading now: The Dawn-Breakers (at #5.7)');
  });
  it('loads from the companion store, every read failing soft; no id → no store reads', async () => {
    const reads = [];
    const store = { getRelationship: async (id) => { reads.push(id); return { stage: 'acquaintance' }; }, getMemory: async () => { throw new Error('db down'); }, getPremises: async () => [], getEnrollments: async () => [{ track: 't1' }] };
    const c = await loadReaderCard({ id: 'u9' }, { channel: 'widget-chat', store });
    expect(c.text).toBe('a returning visitor (not signed in) via widget-chat; relationship: acquaintance; studying: t1');
    expect(c.data.memory).toEqual([]);
    const anon = await loadReaderCard({}, { store });
    expect(anon.text).toBe('an anonymous visitor; nothing remembered yet');
    expect(reads).toEqual(['u9']);
  });
});

describe('the resolver writes one query from history + card (Haiku, injectable)', () => {
  const m = [{ role: 'user', content: 'what is the Hidden Words' }, { role: 'assistant', content: 'A collection of short utterances…' }, { role: 'user', content: 'more' }];
  it('gives the model the reader card and the conversation, and parses a JSON text or a json field', async () => {
    let seen;
    const r = await resolveQuery({ messages: m, card: 'a signed-in reader; studying: hidden-words', llm: async (p) => { seen = p; return { text: '{"query":"the Hidden Words of Bahá’u’lláh"}' }; } });
    expect(r).toEqual({ query: 'the Hidden Words of Bahá’u’lláh', by: 'haiku' });
    expect(seen.system).toBe(RESOLVE_SYSTEM);
    expect(seen.user).toMatch(/^READER: a signed-in reader; studying: hidden-words\nCONVERSATION:\nuser: what is the Hidden Words\nassistant: A collection of short utterances…\nuser: more/);
    expect(await resolveQuery({ messages: m, llm: async () => ({ json: { query: 'Hidden Words themes' } }) })).toMatchObject({ query: 'Hidden Words themes' });
  });
  it('null on failure, an empty answer or a runaway one — the caller keeps its own query', async () => {
    expect(await resolveQuery({ messages: m, llm: async () => { throw new Error('timeout'); } })).toBeNull();
    expect(await resolveQuery({ messages: m, llm: async () => ({ text: '{"query":""}' }) })).toBeNull();
    expect(await resolveQuery({ messages: m, llm: async () => ({ text: JSON.stringify({ query: Array(45).fill('w').join(' ') }) }) })).toBeNull();
  });
});

describe('Jev decides the outcome; the prior for quoted words is context, not code', () => {
  it('the three outcomes are defined, with the quoted-words prior inside the search criterion', () => {
    expect(Object.keys(OUTCOMES)).toEqual(['search', 'ask_back', 'none']);
    expect(OUTCOMES.search).toMatch(/quoted words/i);
    expect(T.askBack).toBeGreaterThanOrEqual(T.outcome);
  });
  it('no production module decides intent from the words of a short turn (no "yes|ok|more|thanks" rules)', () => {
    for (const f of ['triage.js', 'turn.js', 'short-turn.js', 'reader-card.js', 'request-features.js', 'deep-report.js']) {
      const src = readFileSync(new URL(`../../api/lib/assistant/${f}`, import.meta.url), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\/\^?\\?b?\(?(yes|ok|okay|more|thanks|thank you|next|why)\b[^/]*\/[gimsuy]*\.test/i);
    }
  });
});

describe('anisTurn: card in, outcome routes, short searches resolved', () => {
  function harness({ triage, resolve = async () => ({ query: 'the Hidden Words of Bahá’u’lláh', by: 'haiku' }), card = async () => ({ text: 'a signed-in reader via widget-chat; studying: hidden-words', data: {} }) } = {}) {
    const calls = { triage: [], respond: [], resolve: [], card: [] };
    const deps = {
      open: async () => ({ conversationId: 'conv_1', round: 0 }), close: async () => {}, fail: async () => {},
      triage: async (messages, opts) => { calls.triage.push({ messages, opts }); return triage; },
      respond: async (a) => { calls.respond.push(a); return { reply: 'The passage reads…', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      resolve: resolve && (async (a) => { calls.resolve.push(a); return resolve(a); }),
      card: card && (async (p, o) => { calls.card.push({ p, o }); return card(p, o); }),
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
    };
    const run = (messages) => anisTurn({ messages, participant: { id: 'sess_1', authed: true }, clientKey: 'sess_1', onEvent: () => {}, deps });
    return { calls, run };
  }
  const base = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' } };
  const thread = [{ role: 'user', content: 'what is the Hidden Words' }, { role: 'assistant', content: 'A collection…' }, { role: 'user', content: 'more' }];
  const shortFollow = { first: false, turn: 2, words: 1, short: true, quoted: 0, script: null };

  it('loads the card for the participant and channel, hands it to triage and rides it on the messages array', async () => {
    const h = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: shortFollow } });
    await h.run(thread);
    expect(h.calls.card[0]).toMatchObject({ p: { id: 'sess_1', authed: true }, o: { channel: expect.any(String) } });
    expect(h.calls.triage[0].opts).toEqual({ card: 'a signed-in reader via widget-chat; studying: hidden-words', channel: 'widget-chat' });
    expect(h.calls.triage[0].messages.card).toBe('a signed-in reader via widget-chat; studying: hidden-words');
    expect(Object.keys(h.calls.triage[0].messages)).toEqual(['0', '1', '2']);   // non-enumerable: never serialised to the model as a message
    expect(h.calls.respond[0].direction).toMatchObject({ card: 'a signed-in reader via widget-chat; studying: hidden-words' });
  });

  it('a short follow-up Jev reads as a SEARCH goes to research with the resolver\'s query in the direction', async () => {
    const h = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: shortFollow } });
    await h.run(thread);
    expect(h.calls.resolve).toHaveLength(1);
    expect(h.calls.resolve[0]).toMatchObject({ card: 'a signed-in reader via widget-chat; studying: hidden-words' });
    expect(h.calls.respond[0].direction).toMatchObject({ outcome: { choice: 'search', confidence: 0.9 }, query: 'the Hidden Words of Bahá’u’lláh' });
  });

  it('a first message or a long message is never resolved (its own words are the query); a resolver failure keeps the turn', async () => {
    const long = { first: true, turn: 1, words: 9, short: false, quoted: 0, script: null };
    const h = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: long } });
    await h.run([{ role: 'user', content: 'what does the Hidden Words say about justice and love' }]);
    expect(h.calls.resolve).toHaveLength(0);
    expect(h.calls.respond[0].direction.query).toBeNull();
    const g = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: shortFollow }, resolve: async () => { throw new Error('down'); } });
    const r = await g.run(thread);
    expect(r.status).toBe('answered');
    expect(g.calls.respond[0].direction.query).toBeNull();
  });

  it('Jev\'s outcome redirects: unclear + search → research; research + ask_back → a short question back, zero LLM calls', async () => {
    const a = harness({ triage: { ...base, kind: { choice: 'unclear', confidence: 0.8 }, outcome: { choice: 'search', confidence: 0.85 }, features: shortFollow } });
    const ra = await a.run(thread);
    expect(a.calls.respond).toHaveLength(1);
    expect(ra.status).toBe('answered');
    const b = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.8 }, outcome: { choice: 'ask_back', confidence: 0.9 }, features: { first: true, turn: 1, words: 1, short: true, quoted: 0, script: null } } });
    const rb = await b.run([{ role: 'user', content: 'yes' }]);
    expect(b.calls.respond).toHaveLength(0);
    expect(CANNED.unclear).toContain(rb.reply);
    const c = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.8 }, outcome: { choice: 'ask_back', confidence: 0.6 }, features: shortFollow } });
    await c.run(thread);
    expect(c.calls.respond).toHaveLength(1);   // below T.askBack Jev's kind stands
  });

  it('the card failing to load never fails the turn', async () => {
    const h = harness({ triage: { ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: shortFollow }, card: async () => { throw new Error('store down'); } });
    const r = await h.run(thread);
    expect(r.status).toBe('answered');
    expect(h.calls.triage[0].opts).toEqual({ card: null, channel: 'widget-chat' });
  });
});

describe('short-turns.jsonl is a well-formed, balanced battery', () => {
  const rows = readFileSync(new URL('../quality/questions/short-turns.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  it('≥ 60 cases, unique ids, every case labelled with one outcome and its history + card; all three outcomes represented', () => {
    expect(rows.length).toBeGreaterThanOrEqual(60);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(['search', 'ask_back', 'none']).toContain(r.expect.outcome);
      expect(Array.isArray(r.history)).toBe(true);
      expect(typeof r.text).toBe('string');
      if (r.expect.outcome === 'search' && r.expect.query_terms) expect(r.expect.query_terms.length).toBeGreaterThan(0);
    }
    const n = (k) => rows.filter((r) => r.expect.outcome === k).length;
    expect(n('search')).toBeGreaterThanOrEqual(30); expect(n('none')).toBeGreaterThanOrEqual(10); expect(n('ask_back')).toBeGreaterThanOrEqual(8);
  });
  it('holds the quoted-words prior AND its counter-examples (scare quotes → none; a quoted term to explain → search)', () => {
    const quoted = rows.filter((r) => /["“«]/.test(r.text) || /(^|\s)'[^']{3,}'/.test(r.text));
    expect(quoted.filter((r) => r.expect.outcome === 'search').length).toBeGreaterThanOrEqual(6);
    expect(quoted.filter((r) => r.expect.outcome === 'none').length).toBeGreaterThanOrEqual(2);
    expect(rows.find((r) => r.id === 'quoted-term-explain').expect.outcome).toBe('search');
    const same = (id) => rows.find((r) => r.id === id);
    expect(same('in-persian').expect.outcome).toBe('search'); expect(same('in-persian-first').expect.outcome).toBe('ask_back');   // identical words, different context
    expect(same('yes-to-offer').expect.outcome).toBe('search'); expect(same('yes-first').expect.outcome).toBe('ask_back');
  });
});
