// Anís introduces itself once (Chad 11-14): the prompt forbids a self-introduction unless the reader's turn carries FIRST VISIT,
// which the edge adds only for a chat turn the widget marks first_visit (a reader's first question on this device).
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { chat } from '../../worker/anis/index.js';
import { AGENT_SYSTEM, FIRST_VISIT } from '../../api/lib/assistant/agent-core.js';

const mkEnv = () => {
  const db = new Database(':memory:');
  for (const f of ['0015_anis_edge', '0016_anis_pills', '0020_anis_indications']) db.exec(readFileSync(`worker/d1/anis/${f}.sql`, 'utf8'));
  const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql);
    return { first: async () => s.get(...a) ?? null, all: async () => ({ results: s.all(...a) }), run: async () => (s.reader ? (s.get(...a), {}) : s.run(...a)) }; } });
  return { db, TOWER_URL: 'https://tower.test', TOWER_KEY: 'k', ANTHROPIC_API_KEY: 'sk', ANIS_DB: { prepare: stmt },
    ANIS_VEC: { query: async () => ({ matches: [] }), upsert: async () => {} }, AI: { run: async (_m, { text }) => ({ data: text.map(() => [1, 0, 0]) }) } };
};
const sse = (events) => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
const say = (text) => sse([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const callTool = (id, name, input) => sse([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const rig = (env, script) => {
  const seen = { anthropic: [] }, pending = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (String(url).startsWith('https://api.anthropic.com')) {
      seen.anthropic.push(body);
      if (!body.stream) return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(body.system || '').includes('canonical form') ? 'NONE' : '["Next?"]' }], stop_reason: 'end_turn', usage: {} }));
      return script.shift()();
    }
    if (String(url).includes('/api/v1/widget/config/')) { seen.config = (seen.config || 0) + 1; return new Response(JSON.stringify(env.profile || { name: 'Anís', audience: null })); }
    return new Response(JSON.stringify({ out: null }));
  };
  const ctx = { waitUntil: (p) => pending.push(p) };
  const post = async (extra = {}, { origin = 'https://siftersearch.com', trusted = false, content = 'what happens after death?' } = {}) => {
    const res = await chat(new Request('https://anis.test/api/chat/stream', { method: 'POST', headers: { origin }, body: JSON.stringify({ messages: [{ role: 'user', content }], ...extra }) }), env, ctx, { fetch, trusted });
    const out = res.headers.get('content-type') === 'application/json' ? await res.json() : await res.text();
    await Promise.all(pending);
    return out;
  };
  const agentTurn = () => { const b = seen.anthropic.find((x) => x.stream); return JSON.stringify(b.messages.at(-1)); };
  return { seen, post, agentTurn };
};

describe('introduce only on a first visit', () => {
  it('the system prompt forbids self-introduction unless FIRST VISIT', () => {
    expect(AGENT_SYSTEM).toMatch(/Never introduce yourself[^]*unless the reader's turn carries the line FIRST VISIT/);
    expect(FIRST_VISIT).toMatch(/^FIRST VISIT:/);
  });
  it('no first_visit → no FIRST VISIT line in the turn; the system prompt is the same either way', async () => {
    const a = rig(mkEnv(), [() => say('The soul progresses.')]);
    await a.post({});
    expect(a.agentTurn()).not.toMatch(/FIRST VISIT/);
    const b = rig(mkEnv(), [() => say('The soul progresses.')]);
    await b.post({ first_visit: true });
    expect(b.agentTurn()).toMatch(/FIRST VISIT: this reader is new/);
    const sys = (r) => JSON.stringify(r.seen.anthropic.find((x) => x.stream).system);
    expect(sys(a)).toBe(sys(b));
  });
  it('only a literal true counts, and only in chat', async () => {
    const a = rig(mkEnv(), [() => say('ok')]);
    await a.post({ first_visit: 'yes' });
    expect(a.agentTurn()).not.toMatch(/FIRST VISIT/);
  });
});
