// Anís edge Worker: SSE protocol + order, research-cache hit = zero tower tool calls, tower failure = "tool failed" text, persistence via waitUntil. Fakes: Anthropic + tower fetch, D1 (better-sqlite3), Vectorize, AI.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import worker, { chat, revive, sseEvents } from '../../worker/anis/index.js';
import { capture } from '../../worker/anis/research-store.js';

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0015_anis_edge.sql', 'utf8')); db.exec(readFileSync('worker/d1/anis/0016_anis_pills.sql', 'utf8'));
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
const rig = (env, script, { towerStatus = 200, restated = 'NONE' } = {}) => {
  const seen = { anthropic: [], tower: [] }, pending = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (String(url).startsWith('https://api.anthropic.com')) {
      seen.anthropic.push(body);
      const restating = JSON.stringify(body.system || '').includes('canonical form');
      const pill = restating && /Latest message: (Who translated it\?|Is there an original\?)/.exec(JSON.stringify(body.messages))?.[1];
      if (!body.stream) return new Response(JSON.stringify({ content: [{ type: 'text', text: restating ? pill || restated : '["Who translated it?","Is there an original?"]' }], stop_reason: 'end_turn', usage: {} }));
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
  const post = async (messages = [{ role: 'user', content: 'what is prayer?' }], extra = {}, deps = {}) => {
    const res = await chat(new Request('https://anis.test/api/chat/stream', { method: 'POST', headers: { origin: 'https://site.org' }, body: JSON.stringify({ messages, ...extra }) }), env, ctx, { fetch, ...deps });
    if (res.headers.get('content-type') === 'application/json') { const out = await res.json(); await Promise.all(pending); return { res, out }; }
    const text = await res.text(); await Promise.all(pending);
    return { res, events: text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6))) };
  };
  return { seen, post };
};
const P = (id) => ({ id, document_id: 1, paragraph_index: id, text: `Passage ${id} text.`, title: 'Book', author: 'A', source_url: `https://x/${id}`, religion: 'bahai' });

describe('anis worker chat', () => {
  it('an inline template the writer chose → a widget event before the text, its marker in place, never streamed raw, no tower call', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { seen, post } = rig(env, [() => callTool('t1', 'research_lookup', { question: 'what is prayer?' }), () => say('Prayer is communion with God [[P1]].\n\n{{quote P2}}\n\n{{quote P9}}')]);
    const { events } = await post();
    const types = events.map((e) => e.type), w = events.find((e) => e.type === 'widget')?.widget;
    expect(w).toMatchObject({ kind: 'quote', id: 'quote-1', text: 'Passage 2 text.', url: 'https://x/2', title: 'Book', author: 'A' });
    expect(types.indexOf('widget')).toBeLessThan(types.indexOf('chunk'));
    const reply = events.filter((e) => e.type === 'chunk').map((e) => e.text).join('');
    expect(reply).toContain('<!-- widget:quote-1 -->'); expect(reply).toContain('> Passage 2 text.'); expect(reply).not.toContain('{{');
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).not.toContain('{{');
    expect(events.at(-1).meta.timings.widgets).toEqual(['quote']);
    expect(seen.tower).toEqual(['logUsage']);
  });

  it('formatting is live: a template becomes its widget the moment its line streams, and the reply is exactly what streamed', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { post } = rig(env, [() => callTool('t1', 'research_lookup', { question: 'what is prayer?' }),
      () => say('Prayer is communion with God, the essence of worship for every soul who turns to Him in the morning and the evening, in joy and in sorrow, alone or gathered with friends, with words revealed for that purpose [[P1]].\n\n{{quote P2}}\n\nSo pray each day.')]);
    const { events } = await post();
    const iw = events.findIndex((e) => e.type === 'widget'), it = events.findIndex((e) => e.type === 'text' && e.content.includes('<!-- widget:quote-1 -->'));
    expect(iw).toBeGreaterThan(-1); expect(it).toBeGreaterThan(iw);
    expect(events.findIndex((e) => e.type === 'text' && e.content.includes('So pray'))).toBeGreaterThan(it);   // the card shows before the next sentence streams
    expect(events.filter((e) => e.type === 'widget')).toHaveLength(1);
    const streamed = events.filter((e) => e.type === 'text').map((e) => e.content).join('').trim();
    expect(streamed).toContain('](https://x/1)');
    expect(events.filter((e) => e.type === 'chunk').map((e) => e.text).join('')).toBe(streamed);
  });

  it('mode email (internal callers only): the same turn, its letter frame, returned whole — card markers dropped, quotations kept, no pills', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { seen, post } = rig(env, [() => say('Dear Lal, prayer is communion with God [[P1]].\n\n{{quote P2}}\n\nWith love, Anís')]);
    const msgs = [{ role: 'user', content: 'what is prayer?' }];
    const { res, out } = await post(msgs, { mode: 'email', reader_name: 'Lal' }, { trusted: true });
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(out).toMatchObject({ mode: 'email', status: 'answered', format: 'agent' });
    expect(out.reply).toContain('> Passage 2 text.'); expect(out.reply).not.toContain('<!-- widget'); expect(out.reply).not.toContain('{{');
    expect(out.widgets.map((w) => w.kind)).toEqual(['quote']);
    const agentSys = JSON.stringify(seen.anthropic.find((b) => b.stream)?.system);
    expect(agentSys).toContain('short letter'); expect(agentSys).toContain('\\"Lal\\"');
    expect(seen.anthropic.some((b) => JSON.stringify(b.system || '').includes('read a letter'))).toBe(true);   // the triage call
    expect(seen.anthropic.some((b) => /Who translated it/.test(JSON.stringify(b)) && !JSON.stringify(b.system || '').includes('canonical form'))).toBe(false);   // no pills
    // a public caller cannot claim the letter mode: it gets chat (SSE)
    const pub = rig(mkEnv(), [() => say('Prayer is communion.')]);
    expect((await pub.post(msgs, { mode: 'email' })).res.headers.get('content-type')).toBe('text/event-stream');
  });
  it('mode audio: streamed, spoken — no cards, links or markdown, no pills', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { seen, post } = rig(env, [() => say('Prayer is *communion* with God [[P1]].\n\n{{quote P2}}')]);
    const { res, events } = await post(undefined, { mode: 'audio' });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const types = events.map((e) => e.type);
    expect(types).not.toContain('widget'); expect(types).not.toContain('followups');
    const reply = events.filter((e) => e.type === 'chunk').map((e) => e.text).join('');
    expect(reply).toContain('Prayer is communion with God'); expect(reply).not.toMatch(/[*\[\]<>]/);
    expect(JSON.stringify(seen.anthropic.find((b) => b.stream)?.system)).toContain('SPOKEN');
    expect(events.at(-1).meta.mode).toBe('audio');
  });
  it('pills: each offered pill is backed by a research set; a click resolves to its pinned question with no restatement', async () => {
    const env = mkEnv();
    await capture(env, 'what is prayer?', [P(1), P(2)]);
    const { seen, post } = rig(env, [() => callTool('t1', 'research_lookup', { question: 'what is prayer?' }), () => say('Prayer is communion with God [[P1]].'), () => say('Translated by Shoghi Effendi.')]);
    const first = await post();
    const pills = first.events.find((e) => e.type === 'followups').items, reply = first.events.filter((e) => e.type === 'chunk').map((e) => e.text).join('');
    expect(pills).toEqual(['Who translated it?', 'Is there an original?']);
    expect(env.db.prepare('SELECT question FROM anis_pills ORDER BY question').all().map((r) => r.question)).toEqual(['what is prayer?', 'what is prayer?']);
    const before = seen.anthropic.length;
    await post([{ role: 'user', content: 'what is prayer?' }, { role: 'assistant', content: reply }, { role: 'user', content: pills[0] }]);
    const restates = seen.anthropic.slice(before).filter((b) => JSON.stringify(b.system || '').includes('canonical form') && /Latest message: Who translated/.test(JSON.stringify(b.messages)));
    expect(restates).toHaveLength(0);
  });

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
    const done = events.at(-1); expect(done.meta.engine).toBe('anis-edge'); expect(done.meta.timings).toMatchObject({ rounds: 2, tower_calls: 0 });
    expect(done.meta.timings.first_text_ms).toBeGreaterThanOrEqual(0);
    expect(seen.tower).toEqual(['logUsage']);   // research_lookup and the display never left the edge; usage goes to the ledger after the turn
    // persisted through waitUntil: both turns + the question log with a cache hit
    expect(env.db.prepare('SELECT role, content FROM anis_turns ORDER BY role').all().map((t) => t.role)).toEqual(['assistant', 'user']);
    expect(env.db.prepare('SELECT outcome FROM anis_question_log').get().outcome).toBe('hit');
  });
  it('Haiku restates the message first: a hit on the canonical question is held in the turn (no research_lookup round), metered as anis-restate-edge', async () => {
    const env = mkEnv();
    await capture(env, 'Who was the Báb?', [P(1), P(2)]);
    env.AI.run = async (_m, { text }) => ({ data: text.map((t) => (/báb/i.test(t) ? [1, 0, 0] : [0, 1, 0])) });
    const { seen, post } = rig(env, [() => say('The Báb was the Herald [[P1]].')], { restated: 'Who was the Báb?' });
    const { events } = await post([{ role: 'user', content: 'who is the bab in the bahai faith' }]);
    const done = events.at(-1); expect(done.type).toBe('complete');
    expect(done.meta.timings).toMatchObject({ rounds: 1, restated: 'Who was the Báb?', research: { similarity: 1, question: 'Who was the Báb?' } });
    const agent = seen.anthropic.filter((b) => b.stream);
    expect(JSON.stringify(agent[0].messages)).toContain('RESEARCH HELD FOR THIS QUESTION');
    const usage = JSON.parse(JSON.stringify(seen.tower)); expect(usage).toContain('logUsage');
  });
  it('a restated miss tells the agent research_lookup is done; a follow-up is restated with its conversation', async () => {
    const env = mkEnv();
    const { seen, post } = rig(env, [() => say('His sons were…')], { restated: "Who were Bahá'u'lláh's sons?" });
    await post([{ role: 'user', content: "who was baha'u'llah" }, { role: 'assistant', content: "Bahá'u'lláh was the Founder." }, { role: 'user', content: 'what about his sons?' }]);
    const r = seen.anthropic.find((b) => !b.stream);
    expect(r.model).toBe('claude-haiku-5-5'); expect(r.max_tokens).toBe(80);
    expect(JSON.stringify(r.messages)).toContain("Bahá'u'lláh was the Founder."); expect(JSON.stringify(r.messages)).toContain('what about his sons?');
    expect(JSON.stringify(seen.anthropic.find((b) => b.stream).messages)).toContain('NO RESEARCH HELD');
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
  it('over the per-visitor limit → 429 before any model call', async () => {
    const env = { ...mkEnv(), CHAT_LIMIT: { limit: async ({ key }) => ({ success: key !== '9.9.9.9' }) } };
    const res = await chat(new Request('https://anis.test/api/chat/stream', { method: 'POST', headers: { 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }), env, { waitUntil() {} }, { fetch: async () => { throw new Error('no call expected'); } });
    expect(res.status).toBe(429); expect(res.headers.get('retry-after')).toBe('60');
  });
  it('rejects an empty body, answers preflight and healthz', async () => {
    const env = mkEnv(), ctx = { waitUntil() {} };
    expect((await chat(new Request('https://a/api/chat/stream', { method: 'POST', body: '{}' }), env, ctx)).status).toBe(400);
    expect((await worker.fetch(new Request('https://a/api/chat/stream', { method: 'OPTIONS', headers: { origin: 'https://s.org' } }), env, ctx)).status).toBe(204);
    expect(await (await worker.fetch(new Request('https://a/healthz'), env, ctx)).json()).toEqual({ ok: true, service: 'anis' });
  });
});

describe('anis restatement', () => {
  it('clips the history and keeps every Haiku prompt far under the long-context price boundary', async () => {
    const { restateMessages, underPriceBoundary, restate } = await import('../../worker/anis/restate.js');
    const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(50000) }));
    const msgs = restateMessages([...long, { role: 'user', content: 'and then?' }]);
    expect(msgs[1].content.length).toBeLessThan(8000);
    expect(underPriceBoundary('claude-haiku-5-5', msgs).ok).toBe(true);
    expect(underPriceBoundary('claude-haiku-5-5', [{ content: 'x'.repeat(200000) }]).ok).toBe(false);
    const reply = (text) => async () => ({ choices: [{ message: { content: text } }] });
    expect(await restate(reply('"Who was Táhirih?"\n'), 'claude-haiku-5-5', [{ role: 'user', content: 'tahirih' }])).toBe('Who was Táhirih?');
    expect(await restate(reply('NONE'), 'claude-haiku-5-5', [{ role: 'user', content: 'thanks!' }])).toBeNull();
    expect(await restate(async () => { throw new Error('x'); }, 'claude-haiku-5-5', [{ role: 'user', content: 'q' }])).toBeNull();
    expect(await restate(() => new Promise(() => {}), 'claude-haiku-5-5', [{ role: 'user', content: 'q' }], { timeoutMs: 20 })).toBeNull();
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

describe('site worker → Anís edge switch', () => {
  // the site worker imports the Astro bundle, so its routing is checked in source (as docs-edge-purge.test.js does)
  it('chat turns go to the ANIS service only while the ANIS_EDGE secret is "1"; the binding is declared', () => {
    const w = readFileSync(new URL('../../worker/index.js', import.meta.url), 'utf8');
    expect(w).toContain("if (env.ANIS_EDGE === '1' && env.ANIS && url.pathname === '/api/chat/stream' && request.method === 'POST') return env.ANIS.fetch(request);");
    expect(w.indexOf("env.ANIS_EDGE === '1'")).toBeLessThan(w.indexOf('if (isApiPath(url.pathname))'));
    expect(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')).toMatch(/"services": \[\{ "binding": "ANIS", "service": "anis" \}\]/);
  });
});

describe('anis modes', () => {
  it('each mode names its channel and whether it streams; speakable strips what a voice cannot say; triage reads JSON', async () => {
    const { CHANNELS, MODES, channelOfMode, speakable } = await import('../../api/lib/assistant/channels.js');
    expect(Object.fromEntries(Object.entries(MODES).map(([m, c]) => [m, CHANNELS[c].stream]))).toEqual({ chat: true, audio: true, email: false, document: false });
    expect(channelOfMode('chat', { widget: true })).toBe('widget-chat'); expect(channelOfMode('nope')).toBe('site-chat');
    expect(speakable('## Hi\n> *He* is [God](http://x) [[P1]]\n\n<!-- widget:q-1 -->\n- one')).toBe('Hi\nHe is God\n\none');
    const { triageLetter } = await import('../../worker/anis/triage.js');
    const said = (t) => async () => ({ choices: [{ message: { content: t } }] });
    expect(await triageLetter(said('{"stop": 1, "personal": false}'), 'please stop')).toEqual({ stop: 1, kind: 'question', stance: null });
    expect(await triageLetter(said('```json\n{"stop":0,"personal":true}\n```'), 'my mother died')).toMatchObject({ stop: 0, kind: 'personal' });
    expect(await triageLetter(said('no idea'), 'x')).toBeNull();
  });
});
