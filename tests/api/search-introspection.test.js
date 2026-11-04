// SEARCH INTROSPECTION (Chad 11-04: "There is no reason you should have to write code to check search history").
// A trace keeps its ranked list (compact) and who asked (Anís thread/turn/route/tool/step, via AsyncLocalStorage); the API
// lists/filters/replays it; the CLI prints it. No DB, no LLM: repos and the engine are mocked.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { buildTrace, traceSearch, withSearchContext, rankDiff, expandHits, compactHit, topLayer, HITS_KEPT } from '../../api/lib/search-trace.js';

vi.mock('../../api/lib/auth.js', () => ({ requireInternal: async (req) => {
  if (req.headers['x-internal-key'] !== 'ik') throw Object.assign(new Error('Admin access required'), { statusCode: 401 });
} }));

// ── a realistic hit and row ──────────────────────────────────────────────────────────────────────────────────────────────
const hit = (i, extra = {}) => ({ id: 3_000_000 + i * 7919, doc_id: 20_000 + i, title: `Some Long Book Title Number ${i}`, author: "Bahá'u'lláh", religion: "Baha'i",
  collection: 'Core Tablets', text: 'x'.repeat(400), _rrfScore: 0.0312345 - i * 0.001, _layerRanks: { main: i, hype: null, phrase: i + 1, qkeyword: null }, ...extra });
const HITS = Array.from({ length: 30 }, (_, i) => hit(i));
const CTX = { thread: 'c0ffee00-1111-2222-3333-444455556666', turn: 'c0ffee00-1111-2222-3333-444455556666:3', route: 'research', tool: 'fused_search', step: 'combined_search' };

describe('trace row: ranked list + Anís context', () => {
  it('stores the top 20 as compact [para, doc, score, layer, tier] — and measures the bytes', () => {
    const row = buildTrace({ endpoint: 'multi-index', query: 'what does the Writings say about taxation and the poor', hits: HITS, timings: { total: 412 },
      layers: { main: 30, phrase: 22 }, filters: { religion: "Baha'i" }, options: { limit: 30, filters: { religion: "Baha'i" }, hype: true, traceEndpoint: 'x', noTrace: false }, ctx: CTX });
    const stored = JSON.parse(row.hits_json);
    expect(stored).toHaveLength(HITS_KEPT);
    expect(stored[0]).toEqual([3_000_000, 20_000, 0.03123, 'main', 'W']);
    expect(row).toMatchObject({ thread_id: CTX.thread, turn_id: CTX.turn, route: 'research', tool: 'fused_search', step: 'combined_search', parent_trace: null });
    expect(JSON.parse(row.options_json)).toEqual({ limit: 30, filters: { religion: "Baha'i" }, hype: true });   // trace plumbing dropped
    const bytes = Buffer.byteLength(JSON.stringify(row));
    // the brief asks for bytes per row: ranked list ~1.1 KB of a ~1.9 KB row (asserted loosely so a tier code change does not break it)
    expect(Buffer.byteLength(row.hits_json)).toBeLessThan(1400);
    expect(bytes).toBeLessThan(2600);
  });

  it('top1_layer reads every layer (a Qdrant-path search no longer traces "none"); qhype counts as HyPE-led', () => {
    expect(topLayer({ _layerRanks: { main: null, hype: null, entity: null, phrase: 0, qkeyword: 2 } })).toBe('phrase');
    expect(buildTrace({ hits: [{ _layerRanks: { main: 5, qhype: 0 } }] }).hype_led).toBe(1);
  });

  it('a planned row is never its own parent', () => {
    expect(buildTrace({ traceId: 'p1', ctx: { parent: 'p1' } }).parent_trace).toBe(null);
    expect(buildTrace({ traceId: 'c1', ctx: { parent: 'p1' } }).parent_trace).toBe('p1');
  });

  it('traceSearch picks the context up from AsyncLocalStorage — nothing threaded through signatures', async () => {
    const rows = [];
    await withSearchContext({ thread: 't', turn: 't:0' }, () => withSearchContext({ tool: 'originals_search' }, async () => {
      await Promise.resolve();
      traceSearch({ options: { traceEndpoint: 'multi-index' }, query: 'q', hits: [hit(0)], timings: { total: 5 } }, (r) => rows.push(r));
    }));
    expect(rows[0]).toMatchObject({ thread_id: 't', turn_id: 't:0', tool: 'originals_search' });
  });

  it('an Anís tool run carries its name into every search it makes (tools.run)', async () => {
    const { run } = await import('../../api/lib/assistant/tools.js');
    const { currentAIContext } = await import('../../api/lib/ai-context.js');
    let seen = null;
    const fastSearch = async () => { seen = currentAIContext().trace; return []; };
    await withSearchContext({ turn: 'x:1' }, () => run('originals_search', { query: 'one country' }, { fastSearch }));
    expect(seen).toMatchObject({ turn: 'x:1', tool: 'originals_search' });
  });
});

describe('rankDiff', () => {
  it('old vs new: rank, move, entered, dropped, top-1 change', () => {
    const a = [{ para_id: 1 }, { para_id: 2 }, { para_id: 3 }], b = [{ para_id: 2 }, { para_id: 1 }, { para_id: 9 }];
    const d = rankDiff(a, b);
    expect(d.rows.map((r) => [r.para_id, r.old_rank, r.move])).toEqual([[2, 2, 1], [1, 1, -1], [9, null, 'new']]);
    expect(d).toMatchObject({ same: false, top1_changed: true, kept: 2, entered: 1, dropped_count: 1 });
    expect(d.dropped[0]).toMatchObject({ para_id: 3, old_rank: 3 });
    expect(rankDiff(a, a).same).toBe(true);
  });
  it('expandHits titles the stored list and reads a layer hit\'s tier from its document', () => {
    const titles = new Map([[5, { title: 'Gleanings', author: "Bahá'u'lláh", religion: "Baha'i", collection: 'Core Tablets' }]]);
    const [h] = expandHits(JSON.stringify([compactHit({ paragraph_id: 9, doc_id: 5, score: 0.5, _layer: 'phraseSearch' })]), titles);
    expect(h).toMatchObject({ rank: 1, doc_id: 5, para_id: 9, title: 'Gleanings', tier: 'writings', layer: 'phraseSearch', score: 0.5 });
  });
});

// ── the replay engine ────────────────────────────────────────────────────────────────────────────────────────────────────
const stored = (ids) => JSON.stringify(ids.map((p) => [p, p + 1000, 0.1, 'main', null]));
describe('replay (no LLM, untraced)', () => {
  it('re-runs an engine row with its stored options and noTrace; a planned row replays its children; a layer row its layer', async () => {
    const { replayTrace, replayTurn } = await import('../../api/lib/search/trace-replay.js');
    const engineCalls = [], layerCalls = [];
    const deps = {
      engine: async (q, o) => { engineCalls.push([q, o]); return { hits: [{ id: 2, doc_id: 1002 }, { id: 7, doc_id: 1007 }] }; },
      layer: async (name, q, o) => { layerCalls.push([name, q, o]); return { hits: [{ paragraph_id: 1, doc_id: 1001 }] }; },
      children: async (id) => (id === 'P' ? [{ trace_id: 'c1', endpoint: 'planned:topic', query: 'q', options_json: '{"limit":10,"hype":true}', hits_json: stored([1, 2]) }] : []),
      titles: async () => new Map([[1007, { title: 'New Book' }]]),
    };
    const r = await replayTrace({ trace_id: 'P', endpoint: 'planned', query: 'q' }, deps);
    expect(engineCalls[0]).toEqual(['q', { limit: 10, hype: true, noTrace: true }]);
    expect(r.replays[0].diff).toMatchObject({ top1_changed: true, entered: 1, dropped_count: 1 });
    expect(r.replays[0].diff.rows[1]).toMatchObject({ para_id: 7, title: 'New Book', move: 'new' });
    const t = await replayTurn([{ trace_id: 'P', endpoint: 'planned' }, { trace_id: 'L', endpoint: 'layer:phraseSearch', query: 'one country', options_json: '{"limit":8}', hits_json: stored([1]) },
      { trace_id: 'old', endpoint: 'multi-index', query: 'z' }], deps);
    expect(layerCalls[0]).toEqual(['phraseSearch', 'one country', { limit: 8, filters: undefined }]);
    expect(t).toMatchObject({ searches: 3, replayed: 2 });
    expect(t.replays[0].diff.same).toBe(true);
    expect(t.replays[1].error).toMatch(/no stored ranked list/);
  });
});

// ── routes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TRACE = { trace_id: 'T1', endpoint: 'multi-index', query: 'taxation', query_hash: 'h', created_at: 1_790_000_000, total_ms: 40, result_count: 2, top1_layer: 'main',
  hits_json: stored([10, 11]), options_json: '{"limit":10}', thread_id: 'th', turn_id: 'th:0', tool: 'fused_search', step: 'combined_search' };
const listCalls = [];
vi.mock('../../api/lib/repos/search-trace-repo.js', () => ({
  listTraces: async (f) => { listCalls.push(f); return [TRACE]; },
  getTrace: async (id) => (id === 'T1' ? TRACE : id === 'P' ? { ...TRACE, trace_id: 'P', endpoint: 'planned', hits_json: null } : null),
  sameQuestion: async () => [{ trace_id: 'T0', total_ms: 90 }],
  childTraces: async (id) => (id === 'P' ? [{ ...TRACE, trace_id: 'C', endpoint: 'planned:topic', parent_trace: 'P' }] : []),
  tracesSince: async () => [TRACE, { ...TRACE, tool: null, result_count: 0 }],
  tracesForThread: async () => [TRACE],
  tracesForTurn: async (id) => (id === 'th:0' ? [TRACE] : []),
  docTitles: async (ids) => new Map(ids.map((d) => [Number(d), { title: `Doc ${d}`, author: "'Abdu'l-Bahá", religion: "Baha'i" }])),
  docIdsByTitle: async (s) => (s === 'Gleanings' ? [1011] : []),
}));
vi.mock('../../api/lib/repos/anis-threads-repo.js', () => ({
  listAnisThreads: async () => [], anisThread: async (id) => (id === 'th' ? { id: 'th', channel: 'site-chat', participant_id: null } : null),
  anisThreadMessages: async () => [{ id: 1, round_index: 0, role: 'user', content: 'What about taxation?' },
    { id: 2, round_index: 0, role: 'assistant', content: 'See [Gleanings](https://oceanlibrary.com/g#p4).', status: 'answered',
      path_json: JSON.stringify({ gate: 'research', recipe: 'topic', evidence: [{ title: 'Gleanings', author: "Bahá'u'lláh", religion: "Baha'i", url: 'https://oceanlibrary.com/g#p4' },
        { title: 'A Commentary', author: 'Someone', religion: "Baha'i", url: 'https://x/c' }] }) }],
}));
vi.mock('../../api/lib/repos/audit-store-repo.js', () => ({ auditsSince: () => [], auditsFor: () => new Map() }));
vi.mock('../../api/lib/search.js', () => ({ multiIndexSearch: async () => ({ hits: [{ id: 11, doc_id: 1011 }, { id: 10, doc_id: 1010 }] }) }));

let app;
beforeAll(async () => {
  const { default: traceRoutes } = await import('../../api/routes/search-trace-admin.js');
  const { default: anisRoutes } = await import('../../api/routes/assistant-admin.js');
  app = Fastify(); app.setErrorHandler((e, _r, reply) => reply.code(e.statusCode || 500).send({ error: e.message }));
  await app.register(traceRoutes, { prefix: '/api/admin' });
  await app.register(anisRoutes, { prefix: '/api/admin' });
});
const req = (method, url, key = 'ik') => app.inject({ method, url: `/api/admin${url}`, headers: { 'x-internal-key': key }, ...(method === 'POST' ? { payload: {} } : {}) });

describe('GET /search-trace', () => {
  it('needs the internal key', async () => expect((await req('GET', '/search-trace', 'no')).statusCode).toBe(401));
  it('filters by thread, turn, tool; hits come back ranked and titled', async () => {
    const b = (await req('GET', '/search-trace?thread=th&turn=th:0&tool=fused_search&limit=5')).json();
    expect(listCalls.at(-1)).toMatchObject({ thread: 'th', turn: 'th:0', tool: 'fused_search', limit: '5', docIds: null });
    expect(b.traces[0].hits[0]).toMatchObject({ rank: 1, doc_id: 1010, title: 'Doc 1010' });
    expect(b.traces[0].hits_json).toBeUndefined();
  });
  it('doc= a title → its ids, and each trace says where it ranked', async () => {
    const b = (await req('GET', '/search-trace?doc=Gleanings')).json();
    expect(listCalls.at(-1).docIds).toEqual([1011]);
    expect(b.traces[0].doc_ranks).toEqual([{ rank: 2, doc_id: 1011, title: 'Doc 1011' }]);
    expect((await req('GET', '/search-trace?doc=Nothing')).json()).toMatchObject({ count: 0, note: expect.stringMatching(/no document title/) });
    await req('GET', '/search-trace?doc=1010');
    expect(listCalls.at(-1).docIds).toEqual([1010]);
  });
});

describe('GET /search-trace/:id, POST replay, GET /search-stats', () => {
  it('one trace: titled list, same question, a planned row\'s engine calls', async () => {
    expect((await req('GET', '/search-trace/none')).statusCode).toBe(404);
    expect((await req('GET', '/search-trace/T1')).json()).toMatchObject({ trace: { trace_id: 'T1', hits: [{ rank: 1 }, { rank: 2 }] }, same_question: [{ trace_id: 'T0' }] });
    expect((await req('GET', '/search-trace/P')).json().engine_calls[0]).toMatchObject({ trace_id: 'C', parent_trace: 'P' });
  });
  it('replay: old vs new on current code', async () => {
    const b = (await req('POST', '/search-trace/T1/replay')).json();
    expect(b.replays[0].diff).toMatchObject({ top1_changed: true, kept: 2, entered: 0 });
    expect(b.replays[0].diff.rows[0]).toMatchObject({ para_id: 11, old_rank: 2, move: 1 });
    expect((await req('POST', '/search-trace/none/replay')).statusCode).toBe(404);
  });
  it('stats carry a per-tool breakdown', async () => {
    const b = (await req('GET', '/search-stats?days=3')).json();
    expect(b.by_tool.fused_search.searches).toBe(1);   // the untooled row is in overall only
    expect(b.overall.searches).toBe(2);
  });
});

describe('Anís thread + turn introspection', () => {
  it('thread detail: per round searches[], writer_passages[] with standing, cited[]', async () => {
    const r = (await req('GET', '/anis/threads/th')).json().rounds[0].reply;
    expect(r.searches[0]).toMatchObject({ tool: 'fused_search', step: 'combined_search', query: 'taxation', ms: 40, hits: [{ rank: 1, title: 'Doc 1010' }, { rank: 2 }] });
    expect(r.writer_passages).toEqual([expect.objectContaining({ title: 'Gleanings', tier: 'writings', cited: true }), expect.objectContaining({ title: 'A Commentary', tier: 'secondary', cited: false })]);
    expect(r.cited).toEqual([expect.objectContaining({ n: 1, url: 'https://oceanlibrary.com/g#p4' })]);
  });
  it('GET /anis/turns/:id/trace — question, route, searches, writer passages', async () => {
    const b = (await req('GET', '/anis/turns/th:0/trace')).json();
    expect(b).toMatchObject({ turn: 'th:0', thread: 'th', round: 0, question: 'What about taxation?', route: { gate: 'research', strategy: 'topic' } });
    expect(b.searches).toHaveLength(1);
    expect(b.cited).toHaveLength(1);
    expect((await req('GET', '/anis/turns/nope/trace')).statusCode).toBe(404);
  });
  it('POST /anis/turns/:id/replay re-runs the turn\'s engine calls', async () => {
    const b = (await req('POST', '/anis/turns/th:0/replay')).json();
    expect(b).toMatchObject({ turn: 'th:0', searches: 1, replayed: 1 });
    expect(b.replays[0].diff.top1_changed).toBe(true);
    expect((await req('POST', '/anis/turns/th:9/replay')).statusCode).toBe(404);
    expect((await req('POST', '/anis/turns/bad/replay')).statusCode).toBe(400);
  });
});

describe('CLI tables (scripts/ops/trace-format.mjs)', () => {
  it('prints a turn, a list and a replay as text', async () => {
    const f = await import('../../scripts/ops/trace-format.mjs');
    const turn = (await req('GET', '/anis/turns/th:0/trace')).json();
    expect(f.turnText(turn)).toMatch(/TURN th:0[\s\S]*fused_search[\s\S]*Doc 1010[\s\S]*CITED/);
    expect(f.traceListText((await req('GET', '/search-trace?doc=Gleanings')).json())).toMatch(/rank 2/);
    expect(f.replayText((await req('POST', '/search-trace/T1/replay')).json())).toMatch(/TOP-1 CHANGED/);
    expect(f.threadText((await req('GET', '/anis/threads/th')).json())).toMatch(/ROUND 0 {2}\(turn th:0\)/);
    expect(f.traceText((await req('GET', '/search-trace/P')).json())).toMatch(/TRACE P/);
  });
});
