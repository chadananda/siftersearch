// Strategy graph Phase 2, public side: the /api/v1/anis/{strategies,activities,tools} shapes leak no turn id, question or
// template/prompt text; the admin stats routes are internal-only; the graph layout; the plan merged in (tools by id, ONE strategy list
// built/planned with Unmatched last, reader activities); the three docs pages (Tools → Response Strategies → Activities) render from the API;
// the old /docs/anis-strategies redirects; the edge cache lists the reads; the step catalog covers every registered step.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { strategiesSnapshot, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { activities } from '../../api/lib/assistant/activities/index.js';
import { activityCatalog, ACTIVITY_META } from '../../api/lib/assistant/activities/catalog.js';
import { REGISTRY } from '../../api/lib/assistant/tools.js';
import { publicStrategies, publicSteps, publicTools, publicStrategyPlan, publicStrategyList, publicReaderActivities, PLAN_TO_REGISTRY, SERVES } from '../../api/lib/assistant/strategy-docs.js';
import { isUnmatched } from '../../api/lib/assistant/strategy-seed.js';
import { loadPlan } from '../../api/lib/assistant/anis-docs-data.js';
import anisDocsRoutes from '../../api/routes/anis-docs.js';
import strategiesAdminRoutes from '../../api/routes/strategies-admin.js';
import { layoutGraph, END } from '../../src/lib/strategy-graph-layout.js';
import { strategiesFlat, toolsFlat, show } from '../../src/lib/anis-docs.js';
import { policyFor } from '../../worker/edge-cache.js';

afterAll(() => resetStrategiesCache());

const SECRET_Q = 'What did the secret question ask about zebras?';
const fixtureSnapshot = () => {
  const s = strategiesSnapshot();
  const strategies = s.strategies.map((r) => (r.id === 'prayer'
    ? { ...r, exemplars: [{ question: SECRET_Q, description: 'requests for a prayer for an occasion', class: 'prayer' }] } : r));
  const prayer = strategies.find((r) => r.id === 'prayer' && r.status === 'active');
  strategies.push({ ...prayer, version: prayer.version + 1, status: 'candidate', parent_version: prayer.version, created_by: 'opus', replay: { wins: 7, n: 10 } });
  return { ...s, strategies };
};
const stats = [{ strategy: 'respond', version: 1, key: 'respond@1', turns: 5, share: 0.5, p50_ms: 900, p95_ms: 2000, usd_per_turn: 0.01, judged: 4, n_scored: 3, score: 7.33, weak_pct: 25, top_defects: [] }];
const branches = (id) => (id === 'respond' ? [{ hash: 'abc123abc123', branch: ['a:ok', 'b:found'], versions: [1], turns: 5, share: 1, p50_ms: 900, score: 7.33, n_scored: 3, judged: 4, weak_pct: 25, turn_ids: ['x:1'] }] : []);

describe('public shapes', () => {
  const pub = publicStrategies({ snapshot: fixtureSnapshot(), activities: activityCatalog(), stats, branches });

  it('strategies: active ones with graph, template names, stats, branches, candidates and the summary', () => {
    const r = pub.strategies.find((s) => s.id === 'respond');
    expect(r.graph.nodes.length).toBeGreaterThan(5);
    expect(r.graph.nodes.every((n) => n.activity)).toBe(true);
    expect(r.stats).toMatchObject({ score: 7.33, n_scored: 3 });
    expect(r.branches[0]).toEqual(expect.objectContaining({ hash: 'abc123abc123', share: 1 }));
    expect(r.templates.every((t) => Object.keys(t).sort().join() === 'id,version')).toBe(true);
    const p = pub.strategies.find((s) => s.id === 'prayer');
    expect(p.exemplars).toEqual(['requests for a prayer for an occasion']);
    expect(p.candidates).toHaveLength(1);
    expect(p.candidates[0]).toMatchObject({ status: 'candidate', replay: { wins: 7, n: 10 } });
    expect(pub.summary).toMatchObject({ active: pub.strategies.length, candidates: 1 });
  });

  it('candidates carry their latest replay verdict from the promotions ledger; promotions_30d counts ledger promotes', () => {
    const snap = fixtureSnapshot();
    const v = snap.strategies.find((r) => r.id === 'prayer' && r.status === 'candidate').version;
    const now = Date.now(), iso = new Date(now - 3600_000).toISOString();
    const promotions = [
      { strategy_id: 'prayer', version: v, action: 'reject', usd: 1.2, created_at: iso,
        decision: { promote: false, failed: ['mean score 6.1 vs 6.4: not better by 0.5'], numbers: { n_class: 6, mean_candidate: 6.1, mean_current: 6.4 } } },
      { strategy_id: 'respond', version: 2, action: 'promote', usd: 2, created_at: iso, decision: { promote: true, failed: [], numbers: {} } },
    ];
    const out = publicStrategies({ snapshot: snap, activities: activityCatalog(), stats, branches, promotions, now });
    const c = out.strategies.find((s) => s.id === 'prayer').candidates[0];
    expect(c.replay).toMatchObject({ action: 'reject', promote: false, numbers: { n_class: 6 }, usd: 1.2 });
    expect(out.summary.promotions_30d).toBe(1);
  });

  it('leaks no turn id, question or template text', () => {
    const snap = fixtureSnapshot();
    const json = JSON.stringify(pub);
    expect(json).not.toContain(SECRET_Q);
    expect(json).not.toContain('turn_id');
    expect(json).not.toContain('x:1');
    for (const t of snap.templates) for (const field of ['body', 'text', 'template', 'prompt']) {
      const v = t[field];
      if (typeof v === 'string' && v.length > 40) expect(json).not.toContain(v.slice(0, 40));
    }
    const acts = JSON.stringify(publicSteps({ activities: activityCatalog(), snapshot: snap, live: {} }));
    expect(acts).not.toContain(SECRET_Q);
  });

  it('building steps: every registered one has a catalog entry and its users', () => {
    expect(Object.keys(activities()).filter((n) => !ACTIVITY_META[n])).toEqual([]);
    const { steps: list } = publicSteps({ activities: activityCatalog(), snapshot: strategiesSnapshot(), live: { 'respond.plan': { runs: 3, p50_ms: 10, usd: null } } });
    const plan = list.find((a) => a.name === 'respond.plan');
    expect(plan.used_by.some((u) => u.strategy === 'respond')).toBe(true);
    expect(plan.live.runs).toBe(3);
  });

  it('tools: registry entries with schemas, callers and live numbers', () => {
    const tools = Object.values(REGISTRY).filter((e) => !e.internal);
    const out = publicTools({ tools, activities: activityCatalog(), live: { document_search: { calls: 2, errors: 0, p50_ms: 5, p95_ms: 9 } } });
    const d = out.tools.find((t) => t.name === 'document_search');
    expect(d.activities).toContain('respond.work');
    expect(d.live.calls).toBe(2);
    expect(JSON.stringify(out.schemas)).not.toContain('"$id"');
  });
});

describe('the plan (planning/anis-strategies.json) on the three pages', () => {
  const plan = loadPlan();
  const tools = Object.values(REGISTRY).filter((e) => !e.internal);
  const strategies = publicStrategies({ snapshot: strategiesSnapshot(), activities: activityCatalog() }).strategies;

  it('loads, and every alias points at a registered tool', () => {
    expect(plan?.strategies?.length).toBeGreaterThan(30);
    const names = new Set(tools.map((t) => t.name));
    expect(Object.values(PLAN_TO_REGISTRY).filter((n) => !names.has(n))).toEqual([]);
    expect(loadPlan('/nonexistent/plan.json')).toBeNull();
  });

  it('tools: registry rows carry the plan row; every plan tool lands exactly once (merged, built or planned)', () => {
    const out = publicTools({ tools, activities: activityCatalog(), plan });
    const fw = out.tools.find((t) => t.name === 'document_search');
    expect(fw.plan).toMatchObject({ id: 'find_work', status_class: 'live' });
    expect(fw.plan.does).toBeTruthy();
    expect(fw.plan.classes).toContain('A2');
    expect(fw.plan.reader_activities).toContain('read_book');
    const placed = [...out.tools.filter((t) => t.plan).map((t) => t.plan.id), ...out.built.map((t) => t.id), ...out.planned.map((t) => t.id)];
    expect(placed.sort()).toEqual(plan.tools.map((t) => t.id).sort());
    expect(out.built.every((t) => t.status_class === 'live')).toBe(true);
    expect(out.planned.length).toBeGreaterThan(0);
    expect(out.planned.every((t) => t.status_class !== 'live')).toBe(true);
    expect(out.counts.exists + out.counts.partial + out.counts.to_build).toBe(plan.tools.length);
    expect(publicTools({ tools, activities: [], plan: null })).toMatchObject({ built: [], planned: [], plan_source: null });
  });

  it('ONE list: built strategies, then built-in-the-reply patterns, then planned ones, Unmatched last; no question-class vocabulary', () => {
    const list = publicStrategyList({ plan, strategies });
    const p = publicStrategyPlan({ plan });
    expect(list.every((s) => ['built', 'planned'].includes(s.status))).toBe(true);
    // every plan pattern lands in exactly one card
    expect(list.flatMap((s) => s.patterns.map((x) => x.id)).sort()).toEqual(plan.strategies.map((s) => s.id).sort());
    // order: own-graph built → shared-reply built → planned → Unmatched
    const rank = (s) => (s.where === 'own' && s.status === 'built' && s.name !== 'unmatched' ? 0 : s.where === 'shared-reply' ? 1 : s.status === 'planned' ? 2 : 3);
    expect(list.map(rank)).toEqual([...list.map(rank)].sort((x, y) => x - y));
    expect(list.at(-1)).toMatchObject({ id: 'respond', name: 'unmatched', status: 'built' });
    expect(list.at(-1).graph.nodes.length).toBeGreaterThan(5);
    expect(list.filter((s) => s.name === 'unmatched')).toHaveLength(1);
    // seeded strategies merge the patterns they serve (comparison = C1+C2+C3 → one card); numbers stay on the graph
    const active = new Set(strategies.map((s) => s.id));
    for (const [id, cls] of Object.entries(SERVES)) if (active.has(id)) {
      const card = list.find((s) => s.id === id);
      expect(card).toMatchObject({ status: 'built', where: 'own' });
      expect(card.patterns.map((x) => x.id)).toEqual(cls);
      expect(card.graph.nodes.length).toBeGreaterThan(0);
    }
    expect(list.find((s) => s.id === 'comparison').tests.lead).toBe(['C1', 'C2', 'C3'].reduce((n, c) => n + plan.strategies.find((x) => x.id === c).test_questions.lead, 0));
    // lookups that live as branches of the shared reply are their own built entries, labelled so, with the nodes that run them
    const book = list.find((s) => s.id === 'a2');
    expect(book).toMatchObject({ status: 'built', where: 'shared-reply', inside: { strategy: 'respond', name: 'unmatched', nodes: ['work'] }, graph: null });
    for (const id of ['a4', 'a6', 'a7', 'h1']) expect(list.find((s) => s.id === id)).toMatchObject({ status: 'built', where: 'shared-reply' });
    const respondNodes = new Set(list.at(-1).graph.nodes.map((n) => n.id));
    for (const s of list.filter((x) => x.where === 'shared-reply')) for (const n of s.inside.nodes) expect(respondNodes.has(n)).toBe(true);
    // planned: no graph, falls back to Unmatched
    const a1 = list.find((s) => s.id === 'a1');
    expect(a1).toMatchObject({ status: 'planned', graph: null, where: null });
    expect(a1.patterns[0].falls_back).toMatch(/^no strategy of its own yet: it goes to Unmatched/);
    expect(a1.patterns[0].sounds_like.length).toBeGreaterThan(0);
    expect(a1.patterns[0].route.some((r) => r.jev)).toBe(true);
    expect(a1.patterns[0].ideal_answer).toBeTruthy();
    expect(a1.patterns[0].jev.near_misses.length).toBeGreaterThan(0);
    expect(a1.patterns[0].tiers[1].steps.find((s) => s.id === 'bm25').href).toBe('/docs/anis-tools#literal_search');   // plan id → registry name
    expect(a1.patterns[0].tiers[0].steps.find((s) => s.id === 'people').href).toBe('/docs/anis-tools#people');         // plan-only tool, own row
    // the plan half no longer carries a second list
    expect(p.classes).toBeUndefined();
    expect(p.families).toBeUndefined();
    expect(p.decisions.some((d) => d.date === '2026-11-03')).toBe(true);
    expect(p.composition.sets.length).toBeGreaterThan(0);
    expect(p.ladder.length).toBeGreaterThan(3);
    // a row carrying its own classes overrides the default map
    const own = publicStrategyList({ plan, strategies: [{ id: 'x', name: 'x', classes: ['A1'], graph: { nodes: [], edges: [] }, templates: [], branches: [], candidates: [], exemplars: [] }] });
    expect(own[0]).toMatchObject({ id: 'x', status: 'built' });
    expect(own.find((s) => s.id === 'a1')).toBeUndefined();
    expect(publicStrategyPlan({ plan: null })).toBeNull();
  });

  it('the rename: respond@2 is Unmatched and keeps the numbers counted under its old name (other)', () => {
    const r = publicStrategies({ snapshot: strategiesSnapshot(), activities: activityCatalog(), stats }).strategies.find((s) => s.id === 'respond');
    expect(r).toMatchObject({ name: 'unmatched', version: 2 });
    expect(r.stats).toMatchObject({ turns: 5 });   // stats recorded on respond@1 attach to respond@2
    expect(isUnmatched('other') && isUnmatched('unmatched') && !isUnmatched('prayer')).toBe(true);
  });

  it('reader activities: steps link the strategy or tool they use', () => {
    const r = publicReaderActivities({ plan, strategies });
    expect(r.about).toBeTruthy();
    const book = r.activities.find((a) => a.name === 'Read a book with him');
    expect(book.start).toBeTruthy();
    expect(book.schedule).toBeTruthy();
    const links = book.steps.flatMap((s) => s.links);
    expect(links).toContainEqual(expect.objectContaining({ kind: 'tool', id: 'find_work', href: '/docs/anis-tools#document_search' }));
    expect(links).toContainEqual(expect.objectContaining({ kind: 'class', id: 'B2', href: '/docs/response-strategies#class-B2', strategy: 'understanding' }));
    expect(book.reuses.every((x) => x.href)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('respond.');   // no code building step names on the activities page
    expect(publicReaderActivities({ plan: null })).toMatchObject({ activities: [] });
  });
});

describe('routes', () => {
  const app = async (routes, prefix, deps) => { const f = Fastify(); await f.register(routes, { prefix, deps }); await f.ready(); return f; };

  it('public reads answer with cacheable JSON and no turn ids', async () => {
    const f = await app(anisDocsRoutes, '/api/v1/anis', { snapshot: fixtureSnapshot, strategyStats: () => stats, branchStats: branches,
      quality: () => new Map(), activityStats: () => ({}), toolStats: () => ({}) });
    for (const p of ['strategies', 'activities', 'tools']) {
      const r = await f.inject({ url: `/api/v1/anis/${p}` });
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toContain('public');
      expect(r.json().days).toBe(7);
      expect(r.body).not.toContain('turn_id');
      expect(r.body).not.toContain(SECRET_Q);
    }
    await f.close();
  });

  it('a stats store that throws still serves the structure', async () => {
    const boom = () => { throw new Error('no store'); };
    const f = await app(anisDocsRoutes, '/api/v1/anis', { strategyStats: boom, branchStats: boom, quality: boom, activityStats: boom, toolStats: boom });
    const r = await f.inject({ url: '/api/v1/anis/strategies' });
    expect(r.statusCode).toBe(200);
    expect(r.json().strategies.length).toBeGreaterThan(0);
    expect(r.json().strategies.at(-1).name).toBe('unmatched');
    await f.close();
  });

  it('admin stats are internal-only and pass days through (clamped)', async () => {
    process.env.DEPLOY_SECRET = 'k';
    const seen = [];
    const f = await app(strategiesAdminRoutes, '/api/admin', { strategyStats: (o) => (seen.push(o), stats),
      branchStats: (id, o) => (seen.push({ id, ...o }), []), stepStats: (o) => (seen.push(o), []) });
    expect((await f.inject({ url: '/api/admin/anis/strategies/stats' })).statusCode).toBeGreaterThanOrEqual(401);
    const h = { 'x-internal-key': 'k' };
    expect((await f.inject({ url: '/api/admin/anis/strategies/stats?days=3', headers: h })).json().strategies[0].key).toBe('respond@1');
    await f.inject({ url: '/api/admin/anis/strategies/respond/branches?days=999&version=2', headers: h });
    await f.inject({ url: '/api/admin/anis/steps/stats', headers: h });
    expect(seen).toEqual([{ days: 3 }, { id: 'respond', days: 90, version: '2' }, { days: 7 }]);
    await f.close();
  });
});

describe('graph layout', () => {
  it('layers by longest path, ends last, and routes long edges out to the side', () => {
    const L = layoutGraph({ entry: 'a', nodes: [{ id: 'a', activity: 'x' }, { id: 'b' }, { id: 'c' }],
      edges: [{ from: 'a', on: '*', to: 'b' }, { from: 'b', on: 'ok', to: 'c' }, { from: 'a', on: 'answered', to: END }, { from: 'c', on: '*', to: END }] });
    const y = Object.fromEntries(L.nodes.map((n) => [n.id, n.y]));
    expect(y.a < y.b && y.b < y.c && y.c < y[END]).toBe(true);
    expect(L.edges.find((e) => e.from === 'a' && e.to === END)).toMatchObject({ side: true, label: 'answered' });
    expect(L.edges.find((e) => e.from === 'a' && e.to === 'b').label).toBe('');
    expect(L.width).toBeGreaterThan(176);
  });
  it('survives a cycle and the seeded respond graph', () => {
    expect(() => layoutGraph({ entry: 'a', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', on: '*', to: 'b' }, { from: 'b', on: '*', to: 'a' }] })).not.toThrow();
    const r = publicStrategies({ snapshot: strategiesSnapshot(), activities: activityCatalog() }).strategies.find((s) => s.id === 'respond');
    const L = layoutGraph(r.graph);
    expect(L.nodes.length).toBe(r.graph.nodes.length + 1);
  });
});

describe('docs pages', () => {
  const src = (p) => readFileSync(new URL(`../../src/pages/docs/${p}.astro`, import.meta.url), 'utf8');
  const pages = { 'anis-tools': ['/api/v1/anis/tools', 'toolsFlat'], 'response-strategies': ['/api/v1/anis/strategies', 'strategiesFlat'], 'anis-activities': ['/api/v1/anis/activities', null] };

  it.each(Object.entries(pages))('%s renders from its API (live refresh where it has numbers), names the plan file', (page, [api, flat]) => {
    const s = src(page);
    expect(s).toContain(`'${api}'`);
    if (flat) { expect(s).toContain('bindLive('); expect(s).toContain(flat); expect(s).toMatch(/data-live=/); }
    expect(s).toMatch(/source\.file|plan_source\.file/);   // footer: planned strategies: planning/anis-strategies.json
    expect(s.split('---').slice(2).join('---')).not.toMatch(/siftersearch/i);   // public copy never names the host site
    expect(s).not.toMatch(/\[var\(--/);   // semantic tokens, no arbitrary Tailwind values
  });

  it('three layers: tools → ONE strategy list (built, planned, Unmatched last), building steps → activities; nav order; the old page redirects', () => {
    const s = src('response-strategies');
    expect(s).toContain('#step-${n.activity}');
    expect(s).toContain('id={`step-${a.name}`}');
    expect(s).toContain('id={`class-${p.id}`}');   // the A1–H2 ids survive only as anchors
    expect(s).toContain('id={`strategy-${s.id}`}');
    expect(s).toMatch(/<details class="card"/);
    for (const h of ['What a strategy is', 'How strategies improve', 'How a strategy is built', 'Building steps', 'Combining strategies', 'Follow-up moves', 'Decisions']) expect(s).toContain(h);
    expect(s.indexOf('How a strategy is built')).toBeLessThan(s.indexOf('<h2>The strategies</h2>'));
    expect(s.indexOf('<h2>The strategies</h2>')).toBeLessThan(s.indexOf('<h2>Building steps</h2>'));
    expect(s.split('---').slice(2).join('---')).not.toMatch(/question class/i);   // one list: no second concept
    expect(s.match(/<h2>The strategies<\/h2>/g)).toHaveLength(1);
    expect(s).toContain('built');
    expect(s).toContain('planned');
    for (const k of ['summary.active', 'summary.candidates', 'summary.promotions_30d']) expect(s).toContain(k);
    const t = src('anis-tools');
    expect(t).toContain('/docs/response-strategies#step-${a}');
    expect(t).toContain('Planned tools');
    const a = src('anis-activities');
    expect(a).not.toMatch(/`step-\$\{|activitiesFlat|data-live/);   // the code step catalog lives on the strategies page only
    expect(a).toContain('How it starts');
    const nav = readFileSync(new URL('../../src/layouts/DocsLayout.astro', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../../src/pages/docs/index.astro', import.meta.url), 'utf8');
    for (const p of Object.keys(pages)) { expect(nav).toContain(`/docs/${p}`); expect(index).toContain(`/docs/${p}`); }
    expect(nav).toContain("order: ['anis-tools', 'response-strategies', 'anis-activities',");
    expect(nav).not.toContain("'anis-strategies'");
    const astro = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
    expect(astro).toMatch(/'\/docs\/anis-strategies': \{ status: 301, destination: '\/docs\/response-strategies' \}/);
  });

  it('the flat maps feed SSR and live refresh the same text', () => {
    const d = publicStrategies({ snapshot: fixtureSnapshot(), activities: activityCatalog(), stats, branches });
    const m = strategiesFlat({ ...d });
    expect(show(m, 's.respond.score', 'score')).toBe('7.3/10');
    expect(show(m, 's.respond.p50_ms', 'ms')).toBe('900 ms');
    expect(show(m, 'b.respond.abc123abc123.share', 'share')).toBe('100.0%');
    expect(show(m, 's.prayer.score', 'score')).toBe('–');
    expect(strategiesFlat({ steps: [{ name: 'a', live: { runs: 2 } }] })['a.a.runs']).toBe(2);
    expect(toolsFlat({ tools: [{ name: 't', live: null }] })['t.t.calls']).toBeNull();
  });
});

describe('edge cache', () => {
  it.each(['strategies', 'activities', 'tools'])('/api/v1/anis/%s is cached; the docs pages are HTML-cached; admin stats bypass', (p) => {
    const U = (path) => new URL(`https://example.org${path}`);
    expect(policyFor(U(`/api/v1/anis/${p}`), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'api', fresh: 120, l2: true });
    expect(policyFor(U('/docs/response-strategies'), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'html' });
    expect(policyFor(U('/api/admin/anis/strategies/stats'), 'GET', new Headers())).toMatchObject({ mode: 'bypass' });
  });
});
