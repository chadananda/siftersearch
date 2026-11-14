// Anís reader indications bio + no assumed tradition (Chad 11-14): neutral base prompt, TRADITION line (question → bio → the deployment's audience description → none; no host list), the note_indication
// tool (validation, D1 row, silent), bio rendering (cap, evidence, order), chat + letter turns carry the bio, GET/DELETE /api/chat/bio.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import worker, { chat } from '../../worker/anis/index.js';
import { AGENT_SYSTEM } from '../../api/lib/assistant/agent-core.js';
import { validIndication, renderBio, mergeIndications, traditionLine, BIO_MAX } from '../../api/lib/assistant/indications.js';
import { readerOf, noteIndication, loadBio } from '../../worker/anis/bio.js';

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
const DEV = '0f8e2c4a-1b2c-4d5e-8f90-1234567890ab';

describe('tradition is never assumed', () => {
  it('the base prompt is tradition-neutral; the Bahá\'í rules apply when the Bahá\'í Faith is in play', () => {
    expect(AGENT_SYSTEM).not.toMatch(/above all the Bahá'í Writings/);
    expect(AGENT_SYSTEM).not.toMatch(/a well-read Bahá'í scholar/);
    expect(AGENT_SYSTEM).toMatch(/TRADITION — NEVER ASSUMED/);
    expect(AGENT_SYSTEM).toMatch(/never presume the reader's faith/i);
    expect(AGENT_SYSTEM).toMatch(/CORE TEXTS FIRST \(the Bahá'í Faith in play\)/);
    expect(AGENT_SYSTEM).toMatch(/note_indication/);
  });
  it('identity: a companion researcher for Ocean, an interfaith library; no host list exists', () => {
    expect(AGENT_SYSTEM).toMatch(/companion researcher for Ocean, an interfaith library/);
    expect(AGENT_SYSTEM).not.toMatch(/Bahá'í Writings most fully/);
    expect(readFileSync('worker/anis/index.js', 'utf8')).not.toMatch(/anis-hosts|oceanlibrary/);
  });
  it('the TRADITION line: the reader\'s own words, then the deployment\'s audience text (quoted, never mapped), else none — the question always decides first', () => {
    const rows = [{ kind: 'tradition', value: 'Catholic', evidence: "I'm a Catholic", at: 1 }];
    const aud = "Bahá'ís and Bahá'í seekers";
    const none = traditionLine({});
    expect(none).toMatch(/none is assumed: this is an interfaith library/);
    const onlyAud = traditionLine({ audience: aud });
    expect(onlyAud).toMatch(/Otherwise this deployment describes its audience as: "Bahá'ís and Bahá'í seekers"/);
    expect(onlyAud).not.toMatch(/none is assumed/);
    const both = traditionLine({ audience: aud, rows });
    expect(both.indexOf('theirs is Catholic')).toBeLessThan(both.indexOf('describes its audience'));
    expect(traditionLine({ rows })).toMatch(/theirs is Catholic \("I'm a Catholic"\)/);
    expect(traditionLine({ audience: 'x'.repeat(900) }).length).toBeLessThan(700);
    for (const l of [none, onlyAud, both]) expect(l).toMatch(/^TRADITION: If the question itself names or plainly implies a tradition/);
  });
  it('no description → "none assumed" on any host; the profile\'s audience (or a page\'s data-audience) rides in the turn; the system prompt is the same', async () => {
    const a = rig(mkEnv(), [() => say('Many traditions speak of it.')]);
    await a.post({}, { origin: 'https://anis.oceanlibrary.com' });
    expect(a.agentTurn()).toMatch(/TRADITION: .*none is assumed/);
    const env = mkEnv(); env.profile = { name: 'Anís', audience: "Bahá'ís and Bahá'í seekers" };
    const b = rig(env, [() => say('The soul progresses.')]);
    await b.post({ widget_token: 'wgt_audience_test' });
    expect(b.agentTurn()).toMatch(/describes its audience as: \\"Bahá'ís and Bahá'í seekers\\"/);
    const c = rig(mkEnv(), [() => say('ok')]);
    await c.post({ audience: 'Students of comparative religion' });
    expect(c.agentTurn()).toMatch(/describes its audience as: \\"Students of comparative religion\\"/);
    const sys = (r) => JSON.stringify(r.seen.anthropic.find((x) => x.stream).system);
    expect(sys(a)).toBe(sys(b));
  });
});

describe('indications bio', () => {
  it('validIndication: kind from the list, value and evidence required, evidence clipped to 120', () => {
    expect(validIndication({ kind: 'faith', value: 'x', evidence: 'y' }).error).toMatch(/kind must be/);
    expect(validIndication({ kind: 'role', value: '', evidence: 'y' }).error).toMatch(/value/);
    expect(validIndication({ kind: 'role', value: 'tutor', evidence: ' ' }).error).toMatch(/evidence/);
    expect(validIndication({ kind: 'Level', value: ' new ', evidence: 'x'.repeat(300) })).toEqual({ kind: 'level', value: 'new', evidence: 'x'.repeat(120) });
  });
  it('the reader id: a trusted letter keeps mail:<hash>; a public caller cannot claim it; a device id; else the conversation', () => {
    expect(readerOf({ reader_id: 'mail:0123456789abcdef0123' }, { trusted: true })).toBe('mail:0123456789abcdef0123');
    expect(readerOf({ reader_id: 'mail:0123456789abcdef0123' }, { conversationId: 'c1' })).toBe('conv:c1');
    expect(readerOf({ reader_id: DEV }, { conversationId: 'c1' })).toBe(`dev:${DEV}`);
    expect(readerOf({ reader_id: '1731500000000' }, { conversationId: 'c1' })).toBe('conv:c1');
  });
  it('the tool stores one row (kind, value, evidence, conversation, round, at); a bad call stores nothing and tells the agent why', async () => {
    const env = mkEnv(), note = noteIndication(env, { reader: `dev:${DEV}`, conversationId: 'c1', round: 2 });
    expect(await note({ kind: 'role', value: 'study-circle tutor', evidence: 'I tutor a Ruhi book 1 group' })).toBe('noted');
    expect(await note({ kind: 'mood', value: 'x', evidence: 'y' })).toMatch(/^not noted: kind/);
    const rows = env.db.prepare('SELECT * FROM anis_indications').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reader: `dev:${DEV}`, kind: 'role', value: 'study-circle tutor', evidence: 'I tutor a Ruhi book 1 group', conversation_id: 'c1', round: 2 });
    expect(rows[0].at).toBeGreaterThan(0);
  });
  it('renderBio: strongest first (tradition, role, level…; repeats, then newest), each with its evidence, whole lines under the cap', () => {
    const rows = [
      { kind: 'interest', value: 'the Báb', evidence: 'tell me more about the Báb', at: 5 },
      { kind: 'interest', value: 'prayer', evidence: 'I love the prayers', at: 1 },
      { kind: 'interest', value: 'Prayer', evidence: 'prayer again', at: 2 },
      { kind: 'tradition', value: 'Catholic', evidence: "I'm a Catholic", at: 3 },
      { kind: 'level', value: 'newcomer', evidence: 'I am new to this', at: 4 },
    ];
    const b = renderBio(rows);
    expect(b.split('\n')[0]).toMatch(/^WHAT THIS READER HAS INDICATED/);
    expect(b.split('\n').slice(1)).toEqual(['- tradition: Catholic ("I\'m a Catholic")', '- level: newcomer ("I am new to this")', '- interest: Prayer ("prayer again")', '- interest: the Báb ("tell me more about the Báb")']);
    expect(mergeIndications(rows).find((x) => x.value === 'Prayer').n).toBe(2);
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'interest', value: `topic ${i}`, evidence: 'e'.repeat(40), at: i }));
    const lines = renderBio(many).split('\n').slice(1).join('\n');
    expect(lines.length).toBeLessThanOrEqual(BIO_MAX);
    expect(renderBio([])).toBe('');
  });
  it('chat: note_indication called beside a search stores the row silently (no status line); the next turn carries the bio and its tradition', async () => {
    const env = mkEnv();
    const r1 = rig(env, [() => callTool('t1', 'note_indication', { kind: 'tradition', value: 'Catholic', evidence: "I'm a Catholic" }), () => say('Christian scripture speaks of it.')]);
    const ev = await r1.post({ reader_id: DEV, conversationId: 'c1' }, { content: "I'm a Catholic — what happens after death?" });
    expect(ev).not.toMatch(/note_indication/);
    expect(env.db.prepare('SELECT reader, kind, value, conversation_id, round FROM anis_indications').all()).toEqual([{ reader: `dev:${DEV}`, kind: 'tradition', value: 'Catholic', conversation_id: 'c1', round: 1 }]);
    expect(r1.seen.anthropic.find((x) => x.stream).tools.some((t) => t.name === 'note_indication')).toBe(true);
    const r2 = rig(env, [() => say('Purgatory is…')]);
    await r2.post({ reader_id: DEV, conversationId: 'c2' }, { content: 'and purgatory?' });
    const t = r2.agentTurn();
    expect(t).toMatch(/theirs is Catholic/);
    expect(t).toMatch(/WHAT THIS READER HAS INDICATED/);
    expect(t).toMatch(/- tradition: Catholic/);
    // the follow-up pills are steered by it too (never mentioned)
    expect(r2.seen.anthropic.some((b) => !b.stream && /what this reader has said of themselves/.test(JSON.stringify(b.messages)))).toBe(true);
  });
  it('letter mode: the mail Worker\'s reader id brings the bio into the letter\'s turn', async () => {
    const env = mkEnv(), reader = 'mail:0123456789abcdef0123456789abcdef';
    await noteIndication(env, { reader, conversationId: 'mail-x', round: 1 })({ kind: 'level', value: 'deep student', evidence: 'I have read the Íqán many times' });
    const r = rig(env, [() => say('Dear Lal, …')]);
    const out = await r.post({ mode: 'email', reader_name: 'Lal', reader_id: reader, conversationId: 'mail-x' }, { trusted: true, origin: '' });
    expect(out.status).toBe('answered');
    expect(r.agentTurn()).toMatch(/- level: deep student \(\\"I have read the Íqán many times\\"\)/);
  });
  it('GET /api/chat/bio returns the reader\'s own; DELETE erases it; a missing or short id is refused; a letter\'s bio is never served', async () => {
    const env = mkEnv();
    await noteIndication(env, { reader: `dev:${DEV}`, conversationId: 'c1', round: 1 })({ kind: 'language', value: 'Spanish', evidence: 'prefiero español' });
    await noteIndication(env, { reader: 'mail:0123456789abcdef0123456789abcdef', conversationId: 'm', round: 1 })({ kind: 'role', value: 'tutor', evidence: 'I tutor' });
    const call = (method, q) => worker.fetch(new Request(`https://anis.test/api/chat/bio${q}`, { method }), env, { waitUntil: () => {} });
    const got = await (await call('GET', `?reader=${DEV}`)).json();
    expect(got.indications).toEqual([expect.objectContaining({ kind: 'language', value: 'Spanish', evidence: 'prefiero español' })]);
    expect((await call('GET', '')).status).toBe(400);
    expect((await call('GET', '?reader=mail:0123456789abcdef0123456789abcdef')).status).toBe(400);
    expect((await (await call('DELETE', `?reader=${DEV}`)).json()).deleted).toBe(1);
    expect(await loadBio(env, `dev:${DEV}`)).toEqual([]);
    expect(await loadBio(env, 'mail:0123456789abcdef0123456789abcdef')).toHaveLength(1);
  });
});
