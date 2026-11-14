// The reader's site through the turn (Chad 11-14: one fixed order, the site the reader is on first when it holds the text): edge
// origin/home → turn.prefer → tower tool route (link-prefer.js) → linkFor/citation-links rank it first; tool caches keyed by it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { chat, toolKey } from '../../worker/anis/index.js';
import anisToolsRoutes from '../../api/routes/anis-impl-tools.js';
import { linkFor } from '../../api/lib/source-links.js';
import { withPrefer } from '../../api/lib/link-prefer.js';
import { betterCopyLinks } from '../../api/lib/citation-links.js';
import { preferFor } from '../../api/lib/anis-links.js';

const KEY = 'test-secret';
const IQAN = { id: 101, document_id: 101, paragraph_index: 5, religion: "Baha'i", collection: 'Core Tablets', title: 'Kitáb-i-Íqán', author: "Bahá'u'lláh",
  text: 'The essence of all that We have revealed for thee is Justice.', source_url: 'https://oceanlibrary.com/kitab-i-iqan?paraId=para_5', metadata: { bookid: 'BH00064' } };
let app, made = 0;
// the tower's research tools as the route runs them: every passage link made by linkFor inside the call (no prefer passed)
const impl = { search: async () => { made++; const l = linkFor(IQAN, 5); return [{ id: 7, ...IQAN, url: l.url, source_url: l.url }]; } };
impl.fused_search = impl.search;
beforeAll(async () => { process.env.DEPLOY_SECRET = KEY; app = Fastify(); await app.register(anisToolsRoutes, { prefix: '/api/v1/anis', impl }); await app.ready(); });
afterAll(() => app.close());

const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0015_anis_edge.sql', 'utf8')); db.exec(readFileSync('worker/d1/anis/0016_anis_pills.sql', 'utf8'));
  const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql);
    return { first: async () => s.get(...a) ?? null, all: async () => ({ results: s.all(...a) }), run: async () => (s.reader ? (s.get(...a), {}) : s.run(...a)) }; } });
  const vec = { looked: 0 };
  return { _db: db, _vec: vec, TOWER_URL: 'https://tower.test', TOWER_KEY: KEY, ANTHROPIC_API_KEY: 'sk', ANIS_DB: { prepare: stmt },
    ANIS_VEC: { query: async () => (vec.looked++, { matches: [] }), upsert: async () => {} }, AI: { run: async (_m, { text }) => ({ data: text.map(() => [1, 0, 0]) }) } };
};
const sse = (events) => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
const block = (content_block, delta) => sse([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_start', index: 0, content_block },
  { type: 'content_block_delta', index: 0, delta }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const say = (text) => block({ type: 'text', text: '' }, { type: 'text_delta', text });
const callTool = (name, input) => block({ type: 'tool_use', id: 't1', name, input: {} }, { type: 'input_json_delta', partial_json: JSON.stringify(input) });

async function ask(origin) {
  const script = [() => callTool('fused_search', { query: 'Kitáb-i-Íqán justice' }), () => say('Justice is the essence of what was revealed [[P1]].')];
  const turns = [];
  const fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (String(url).startsWith('https://api.anthropic.com')) {
      if (!body.stream) return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(body.system || '').includes('canonical form') ? 'NONE' : '[]' }], stop_reason: 'end_turn', usage: {} }));
      return script.shift()();
    }
    const fn = String(url).split('/tool/')[1];
    if (!impl[fn]) return new Response(JSON.stringify({ out: null }));
    turns.push(body.turn);
    const r = await app.inject({ method: 'POST', url: `/api/v1/anis/tool/${fn}`, headers: { 'x-internal-key': KEY }, payload: body });
    return new Response(r.body, { status: r.statusCode });
  };
  const pending = [], env = mkEnv();
  const res = await chat(new Request('https://anis.test/api/chat/stream', { method: 'POST', headers: { origin }, body: JSON.stringify({ messages: [{ role: 'user', content: 'What does the Íqán say about justice?' }] }) }),
    env, { waitUntil: (p) => pending.push(p) }, { fetch });
  const text = await res.text(); await Promise.all(pending);
  const events = text.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice(6)));
  return { turns, reply: events.filter((e) => e.type === 'chunk').map((e) => e.text).join(''), sets: env._db.prepare('SELECT count(*) n FROM anis_research_sets') .get().n, looked: env._vec.looked };
}

describe('the reader’s site goes first, end to end', () => {
  it('Íqán asked from oceanoflights.org → the turn carries it → the Ocean of Lights link', async () => {
    const { turns, reply } = await ask('https://oceanoflights.org');
    expect(turns[0].prefer).toEqual(['oceanoflights.org']);
    expect(reply).toMatch(/\]\(https:\/\/oceanoflights\.org\/[^)]*\)/);
    expect(reply).not.toMatch(/oceanlibrary\.com\/kitab-i-iqan/);
  });
  it('a reader-site turn neither reads nor writes the shared research cache (its links are ranked for that site)', async () => {
    const site = await ask('https://oceanoflights.org'), plain = await ask('https://example.org');
    expect([site.looked, site.sets]).toEqual([0, 0]);
    expect(plain.looked).toBeGreaterThan(0);
  });
  it('the same question from anis.oceanlibrary.com → Ocean Library (the configured order)', async () => {
    const { turns, reply } = await ask('https://anis.oceanlibrary.com');
    expect(turns[0].prefer).toBeNull(); // Anís's own app is no reader site
    expect(reply).toMatch(/\]\(https:\/\/oceanlibrary\.com\/kitab-i-iqan[^)]*\)/);
  });
  it('a page that is not a collaborator sends no preference: the order alone', async () => {
    const { turns, reply } = await ask('https://example.org');
    expect(turns[0].prefer).toBeNull();
    expect(reply).toMatch(/oceanlibrary\.com\/kitab-i-iqan/);
  });
});

describe('pieces', () => {
  it('preferFor: the deployment home wins, else a collaborator page host, else none', () => {
    expect(preferFor({ home: { hosts: ['bahai-library.com'] }, site: 'oceanoflights.org' })).toEqual(['bahai-library.com']);
    expect(preferFor({ site: 'www.oceanoflights.org' })).toEqual(['oceanoflights.org']);
    expect(preferFor({ site: 'localhost:4321' })).toBeNull();
    expect(preferFor({ site: 'anis.oceanlibrary.com' })).toBeNull();
    expect(preferFor({})).toBeNull();
  });
  it('linkFor reads the call’s preference; an explicit prefer still wins', async () => {
    expect(linkFor(IQAN, 5).site).toBe('oceanlibrary.com');
    expect(await withPrefer(['oceanoflights.org'], async () => linkFor(IQAN, 5).site)).toBe('oceanoflights.org');
    expect(await withPrefer(['oceanoflights.org'], async () => linkFor(IQAN, 5, { prefer: null }).site)).toBe('oceanlibrary.com');
  });
  it('citation-links: the reader’s site copy beats a better-ranked one', async () => {
    const items = [{ id: 1, title: 'Kitáb-i-Íqán', link: { url: 'https://oceanlibrary.com/kitab-i-iqan?paraId=para_5', site: 'oceanlibrary.com', tier: 1 } }];
    const copies = async () => new Map([[1, [{ doc_id: 9, paragraph_index: 5, title: 'Kitáb-i-Íqán', religion: "Baha'i", collection: 'x', source_url: 'https://bahai-library.com/iqan' }]]]);
    expect((await betterCopyLinks(items, { copies })).size).toBe(0);   // no reader site: Ocean Library stays
    expect((await betterCopyLinks(items, { copies, prefer: ['bahai-library.com'] })).get(1).site).toBe('bahai-library.com');
  });
  it('caches are per reader site: tower tool cache and the edge R2 key', async () => {
    const before = made;
    const call = (prefer) => app.inject({ method: 'POST', url: '/api/v1/anis/tool/search', headers: { 'x-internal-key': KEY }, payload: { args: ['cache-probe'], turn: { prefer } } });
    const a = JSON.parse((await call(['oceanoflights.org'])).body).out[0].url, b = JSON.parse((await call(null)).body).out[0].url;
    expect(a).toMatch(/oceanoflights\.org/); expect(b).toMatch(/oceanlibrary\.com/); expect(made - before).toBe(2);
    expect(await toolKey('search', ['q'], ['oceanoflights.org'])).not.toBe(await toolKey('search', ['q']));
    expect(await toolKey('search', ['q'], null)).toBe(await toolKey('search', ['q']));
  });
});
