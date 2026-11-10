// Precached common questions (precache.js + the cache step in anisTurn): eligibility, the stale-is-a-miss rule, the warm job (dry, real,
// capped, draining) and the turn reading a fresh row / only the warm turn writing. All on fakes.
import { describe, it, expect } from 'vitest';
import { keyText, cacheKey, cacheEligible, unpack, cacheDeps, anisPrecacheJob } from '../../api/lib/assistant/precache.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const one = (content) => [{ role: 'user', content }];

describe('precache pure helpers', () => {
  it('keyText drops trailing punctuation; cacheKey is persona × channel', () => {
    expect(keyText('  Who was Jesus? ')).toBe('Who was Jesus');
    expect(cacheKey('Anís', 'site-chat')).toBe('Anís|site-chat');
  });
  it('only an opening site-chat question with no host profile or override is cacheable', () => {
    expect(cacheEligible({ messages: one('Who was Jesus?'), channel: 'site-chat' })).toBe(true);
    expect(cacheEligible({ messages: one('Who was Jesus?'), channel: 'widget-chat' })).toBe(false);
    expect(cacheEligible({ messages: [...one('a'), { role: 'assistant', content: 'b' }, ...one('c')], channel: 'site-chat' })).toBe(false);
    expect(cacheEligible({ messages: one('x'), channel: 'site-chat', profile: { scope_config: {} } })).toBe(false);
    expect(cacheEligible({ messages: one('x'), channel: 'site-chat', overrides: [undefined, 'claude'] })).toBe(false);
  });
  it('unpack replays only book/passage events; a broken row is a miss', () => {
    const u = unpack({ id: 7, question_hash: 'h', search_version: 'v', answer_md: 'A', citations_json: '[{"id":1}]',
      research_json: JSON.stringify({ events: [{ type: 'book' }, { type: 'text' }, { type: 'passage' }, { type: 'quote_cards', cards: [] }], strategy: 'topic' }) });
    expect(u).toMatchObject({ id: 7, reply: 'A', citations: [{ id: 1 }], strategy: 'topic' });
    expect(u.events.map((e) => e.type)).toEqual(['book', 'passage', 'quote_cards']);
    expect(unpack({ answer_md: 'A', research_json: '{bad' })).toBe(null);
    expect(unpack({ answer_md: '' })).toBe(null);
  });
});

function fakeAc(rows = {}) {
  const serves = [], touched = [], stored = [];
  return { serves, touched, stored,
    checkAnswerCache: async (q) => rows[q] ? { entry: rows[q].entry, stale: rows[q].stale } : { entry: null },
    recordServe: (s) => serves.push(s), touchEntry: (id) => touched.push(id),
    storeAnswer: async (q, o) => { stored.push({ q, ...o }); rows[q] = { entry: { id: 9, question_hash: 'h', search_version: 'v', answer_md: o.answer, research_json: JSON.stringify(o.research), citations_json: JSON.stringify(o.citations) }, stale: false }; } };
}

describe('cacheDeps', () => {
  it('a stale row is a miss and is recorded as miss-stale; a fresh row is a hit', async () => {
    const entry = { id: 1, question_hash: 'h', search_version: 'old', answer_md: 'A' };
    const ac = fakeAc({ 'Who was Jesus': { entry, stale: true }, 'Who was Moses': { entry, stale: false } });
    const c = cacheDeps(ac);
    expect(await c.lookup('Who was Jesus?', 'Anís|site-chat')).toBe(null);
    expect(ac.serves[0]).toMatchObject({ cache_status: 'miss-stale' });
    expect(await c.has('Who was Moses?', 'k')).toBe(true);
  });
  it('store keeps the reply whole and slims sources', async () => {
    const ac = fakeAc(); const long = 'x'.repeat(5000);
    await cacheDeps(ac).store('Q?', 'k', { reply: long, citations: Array.from({ length: 50 }, (_, i) => ({ id: i, text: long })), retrieved: [], events: [{ type: 'book' }] });
    expect(ac.stored[0].answer).toBe(long);   // never truncated
    expect(ac.stored[0].citations).toHaveLength(40);
    expect(ac.stored[0].citations[0].text).toHaveLength(400);
  });
});

function jobDeps({ cached = new Set(), turnStatus = 'answered', draining = false } = {}) {
  const asked = [];
  return { asked, deps: {
    bankIds: () => ['christianity'],
    bank: () => ({ questions: [{ id: 'c1', q: 'Who was Jesus?' }, { id: 'c2', q: 'What is grace?', held_out: true }, { id: 'c3', q: 'What is baptism?' }] }),
    cache: { has: async (q) => cached.has(q) },
    turn: async (a) => { asked.push(a); if (turnStatus === 'answered') cached.add(a.messages[0].content); return { status: turnStatus, limit: turnStatus === 'limited' ? 'spend-cap' : undefined }; },
    draining: async () => draining, log: async () => {} } };
}

describe('anisPrecacheJob', () => {
  it('dry lists every question (held-out included) with its cached flag and asks nothing', async () => {
    const j = jobDeps({ cached: new Set(['Who was Jesus?']) });
    const r = await anisPrecacheJob({ tradition: 'Christianity', dry: true }, j.deps);
    expect(j.asked).toHaveLength(0);
    expect(r).toMatchObject({ total: 3, fresh: 1, would_warm: 2 });
    expect(r.questions.find((q) => q.id === 'c2')).toMatchObject({ held_out: true, cached: false });
  });
  it('warms only questions not fresh, as test+warm site-chat turns', async () => {
    const j = jobDeps({ cached: new Set(['Who was Jesus?']) });
    const r = await anisPrecacheJob({ tradition: 'christianity' }, j.deps);
    expect(r).toMatchObject({ fresh: 1, warmed: 2, not_stored: [] });
    expect(j.asked[0]).toMatchObject({ test: true, warm: true, channel: 'site-chat', clientKey: 'precache:c2' });
  });
  it('heldOut false and limit narrow the list; the cap or a drain stops the run', async () => {
    expect((await anisPrecacheJob({ tradition: 'christianity', dry: true, heldOut: false }, jobDeps().deps)).total).toBe(2);
    expect((await anisPrecacheJob({ tradition: 'christianity', dry: true, limit: 1 }, jobDeps().deps)).total).toBe(1);
    const capped = jobDeps({ turnStatus: 'limited' });
    expect((await anisPrecacheJob({ tradition: 'christianity' }, capped.deps)).stopped).toBe('spend-cap');
    expect(capped.asked).toHaveLength(1);
    const drain = jobDeps({ draining: true });
    expect((await anisPrecacheJob({ tradition: 'christianity' }, drain.deps)).stopped).toBe('draining');
    expect(drain.asked).toHaveLength(0);
  });
  it('an unknown bank is a 400', async () => {
    await expect(anisPrecacheJob({ tradition: 'nope' }, jobDeps().deps)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('anisTurn and the answer cache', () => {
  const t = { malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } };
  function harness(cache) {
    const calls = { respond: 0, close: [] };
    const deps = { open: async () => ({ conversationId: 'conv_1', round: 0 }), close: async (a) => { calls.close.push(a); }, fail: async () => {},
      triage: async () => t, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {}, cache,
      respond: async ({ onEvent } = {}) => { calls.respond++; onEvent?.({ type: 'passage', doc_id: 1 }); return { reply: 'The answer.', citations: [{ id: 1 }], retrieved: [], plan: { shape: 'topic' }, timings: {} }; } };
    const run = (o = {}) => { const events = []; return anisTurn({ messages: one('Who was Jesus?'), channel: 'site-chat', participant: { id: 's' }, clientKey: 's', onEvent: (e) => events.push(e), deps, ...o }).then((r) => ({ r, events })); };
    return { calls, run };
  }
  const hitRow = { id: 3, hash: 'h', version: 'v', reply: 'Cached answer.', citations: [{ id: 2 }], retrieved: [], events: [{ type: 'book', doc_id: 5 }, { type: 'quote_cards', cards: [{ n: 1 }] }], strategy: 'topic', warmed_at: 'w' };

  it('a fresh row answers at once (no Jev, no respond), replays the cards, logs gate cache', async () => {
    let served = 0;
    const h = harness({ lookup: async () => hitRow, served: async () => { served++; } });
    const { r, events } = await h.run();
    expect(r).toMatchObject({ reply: 'Cached answer.', status: 'answered', plan: { shape: 'cache' }, quote_cards: [{ n: 1 }] });
    expect(h.calls.respond).toBe(0);
    expect(events).toContainEqual({ type: 'book', doc_id: 5 });
    expect(h.calls.close[0].path).toMatchObject({ gate: 'cache', cache: { id: 3 } });
    expect(served).toBe(1);
  });
  it('a test turn never reads the cache; a reader turn never writes it', async () => {
    const stored = []; let looked = 0;
    const h = harness({ lookup: async () => { looked++; return null; }, store: async (...a) => { stored.push(a); } });
    await h.run({ test: true });
    expect(looked).toBe(0);
    await h.run();
    expect(looked).toBe(1);
    expect(stored).toHaveLength(0);
  });
  it('the warm turn stores the reply as sent with the cards shown', async () => {
    const stored = [];
    const h = harness({ lookup: async () => hitRow, store: async (...a) => { stored.push(a); } });
    const { r } = await h.run({ test: true, warm: true });
    expect(h.calls.respond).toBe(1);   // warm never reads
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).toBe('Who was Jesus?');
    expect(stored[0][1]).toBe('Anís|site-chat');
    expect(stored[0][2]).toMatchObject({ reply: r.reply });
  });
});
