// Anís edge Worker: SSE protocol + order, research-cache hit = zero tower tool calls, tower failure = "tool failed" text, persistence via waitUntil. Fakes: Anthropic + tower fetch, D1 (better-sqlite3), Vectorize, AI.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import worker, { chat, revive, sseEvents } from '../../worker/anis/index.js';
import { capture } from '../../worker/anis/research-store.js';

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0015_anis_edge.sql', 'utf8'));
  const stored = new Map();
  const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql);
    return { first: async () => s.get(...a) ?? null, all: async () => ({ results: s.all(...a) }), run: async () => (s.reader ? (s.get(...a), {}) : s.run(...a)) }; } });
  return { db, TOWER_URL: 'https://tower.test', TOWER_KEY: 'k', ANTHROPIC_API_KEY: 'sk', ANIS_DB: { prepare: stmt },
    ANIS_VEC: { query: async (v, { topK }) => ({ matches: [...stored].map(([id, o]) => ({ id, score: cos(v, o.values) })).slice(0, topK) }), upsert: async (items) => items.forEach((i) => stored.set(i.id, i)) },
    AI: { run: async (_m, { text }) => ({ data: text.map(() => [1, 0, 0]) }) } };
};

// ── fake Anthropic: the agent model consumes `script` in order (streamed), the follow-up model gets a JSON message ──
const sse = (events) => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
const say = (text) => sse([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const callTool = (id, name, input) => sse([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const rig = (env, script, { towerStatus = 200 } = {}) => {
  const seen = { anthropic: [], tower: [] }, pending = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (String(url).startsWith('https://api.anthropic.com')) {
      seen.anthropic.push(body);
      if (!body.stream) return new Response(JSON.stringify({ content: [{ type: 'text', text: '["Who translated it?","Is there an original?"]' }], stop_reason: 'end_turn', usage: {} }));
      return script.shift()();
    }
    const fn = String(url).split('/tool/')[1];
    seen.tower.push(fn);
    if (towerStatus !== 200) return new Response('boom', { status: towerStatus });
    if (fn === 'upgradeLinks') return new Response(JSON.stringify({ out: body.args[0] }));
    if (fn === 'fused_search' || fn === 'search') return new Response(JSON.stringify({ out: [{ id: 7, document_id: 1, paragraph_index: 1, text: 'God is love.', title: 'Book', author: 'A', url: 'https://x/b' }] }));
    return new Response(JSON.stringify({ out: null }));
  };
  const ctx = { waitUntil: (p) => pending.push(p) };
  const post = async (messages = [{ role: 'user', content: 'what is prayer?' }], extra = {}) => {
    const res = await chat(new Request('https://anis.test/api/chat/stream', { method: 'POST', headers: { origin: 'https://site.org' }, body: JSON.stringify({ messages, ...extra }) }), env, ctx, { fetch });
    const text = await res.text(); await Promise.all(pending);
    return { res, events: text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6))) };
  };
  return { seen, post };
};
const P = (id) => ({ id, document_id: 1, paragraph_index: id, text: `Passage ${id} text.`, title: 'Book', author: 'A', source_url: `https://x/${id}`, religion: 'bahai' });

describe('anis worker chat', () => {
  it('cache hit: research_lookup is local (no tower call), events arrive in protocol order, turn is persisted', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { seen, post } = rig(env, [() => callTool('t1', 'research_lookup', { question: 'what is prayer?' }), () => say('Prayer is communion with God [[P1]].')]);
    const { res, events } = await post(undefined, { conversationId: 'c1' });
    expect(res.headers.get('content-type')).toBe('text/event-stream'); expect(res.headers.get('access-control-allow-credentials')).toBe('true'); expect(res.headers.get('access-control-allow-origin')).toBe('https://site.org');
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('session'); expect(events[0].conversation_id).toBe('c1');
    expect(types.indexOf('stage')).toBeLessThan(types.indexOf('status')); expect(types).toContain('status');
    expect(types.indexOf('chunk')).toBeLessThan(types.indexOf('followups')); expect(types.indexOf('followups')).toBeLessThan(types.indexOf('complete')); expect(types.at(-1)).toBe('complete');
    expect(events.filter((e) => e.type === 'chunk').map((e) => e.text).join('')).toContain('Prayer is communion with God');
    expect(events.find((e) => e.type === 'followups').items).toEqual(['Who translated it?', 'Is there an original?']);
    const done = events.at(-1); expect(done.meta.engine).toBe('anis-edge'); expect(done.meta.timings).toMatchObject({ rounds: 2, tower_calls: 1 });
    expect(done.meta.timings.first_text_ms).toBeGreaterThanOrEqual(0);
    expect(seen.tower).toEqual(['upgradeLinks', 'logUsage']);   // research_lookup never left the edge; usage goes to the ledger after the turn
    // persisted through waitUntil: both turns + the question log with a cache hit
    expect(env.db.prepare('SELECT role, content FROM anis_turns ORDER BY role').all().map((t) => t.role)).toEqual(['assistant', 'user']);
    expect(env.db.prepare('SELECT outcome FROM anis_question_log').get().outcome).toBe('hit');
  });
  it('the reply gets the tower form pass: unbalanced emphasis repaired before it streams', async () => {
    const env = mkEnv();
    const { post } = rig(env, [() => say('She was **utterly fearless* and calm.')]);
    const { events } = await post();
    expect(events.at(-1).type).toBe('complete');
    expect(events.filter((e) => e.type === 'chunk').map((e) => e.text).join('')).toContain('She was *utterly fearless* and calm.');
  });
  it('a tower failure reaches the model as "tool failed" text, never a crash', async () => {
    const env = mkEnv();
    const { seen, post } = rig(env, [() => callTool('t1', 'fused_search', { query: 'prayer' }), () => say('The library did not answer.'), () => say('The library did not answer.')], { towerStatus: 500 });
    const { events } = await post();
    expect(events.at(-1).type).toBe('complete'); expect(events.some((e) => e.type === 'error')).toBe(false);
    const second = seen.anthropic.filter((b) => b.stream)[1];
    expect(JSON.stringify(second.messages)).toContain('tool failed');
  });
  it('an Anthropic failure ends the stream with an error event', async () => {
    const env = mkEnv();
    const { post } = rig(env, [() => new Response('overloaded', { status: 400 })]);
    const { events } = await post();
    expect(events.at(-1)).toEqual({ type: 'error', message: 'An error occurred. Please try again.' });
  });
  it('rejects an empty body, answers preflight and healthz', async () => {
    const env = mkEnv(), ctx = { waitUntil() {} };
    expect((await chat(new Request('https://a/api/chat/stream', { method: 'POST', body: '{}' }), env, ctx)).status).toBe(400);
    expect((await worker.fetch(new Request('https://a/api/chat/stream', { method: 'OPTIONS', headers: { origin: 'https://s.org' } }), env, ctx)).status).toBe(204);
    expect(await (await worker.fetch(new Request('https://a/healthz'), env, ctx)).json()).toEqual({ ok: true, service: 'anis' });
  });
});

describe('anis worker utilities', () => {
  it('_anis endpoints need the tower key; embed and lookup work', async () => {
    const env = mkEnv(), ctx = { waitUntil() {} };
    await capture(env, 'what is prayer?', [P(1)]);
    const call = (path, body, key) => worker.fetch(new Request(`https://a${path}`, { method: 'POST', headers: key ? { 'x-internal-key': key } : {}, body: JSON.stringify(body) }), env, ctx);
    expect((await call('/_anis/embed', { texts: ['a'] })).status).toBe(401);
    expect((await (await call('/_anis/embed', { texts: ['a', 'b'] }, 'k')).json()).vectors).toHaveLength(2);
    expect((await (await call('/_anis/lookup', { question: 'What is prayer?' }, 'k')).json())).toMatchObject({ hit: true, similarity: 1, same: true });
  });
  it('revive rebuilds Map and Set; sseEvents parses frames split across chunks and throws on error events', async () => {
    expect(JSON.parse('{"a":{"__map":[[1,[2]]]},"b":{"__set":[3]}}', revive)).toEqual({ a: new Map([[1, [2]]]), b: new Set([3]) });
    const enc = new TextEncoder(), body = new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"type":"a"}\n\ndata: {"ty')); c.enqueue(enc.encode('pe":"b"}\n\n')); c.close(); } });
    const got = []; for await (const e of sseEvents(body)) got.push(e.type);
    expect(got).toEqual(['a', 'b']);
    const bad = new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"type":"error","error":{"message":"x"}}\n\n')); c.close(); } });
    await expect((async () => { for await (const e of sseEvents(bad)) void e; })()).rejects.toThrow('x');
  });
});
