// Strategy graph Phase 2, public side: the /api/v1/anis/{strategies,activities,tools} shapes leak no turn id, question or
// template/prompt text; the admin stats routes are internal-only; the graph layout; the three docs pages render from the
// API with live refresh; the edge cache lists the reads; the activity catalog covers every registered activity.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { strategiesSnapshot, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { activities } from '../../api/lib/assistant/activities/index.js';
import { activityCatalog, ACTIVITY_META } from '../../api/lib/assistant/activities/catalog.js';
import { REGISTRY } from '../../api/lib/assistant/tools.js';
import { publicStrategies, publicActivities, publicTools } from '../../api/lib/assistant/strategy-docs.js';
import anisDocsRoutes from '../../api/routes/anis-docs.js';
import strategiesAdminRoutes from '../../api/routes/strategies-admin.js';
import { layoutGraph, END } from '../../src/lib/strategy-graph-layout.js';
import { strategiesFlat, activitiesFlat, toolsFlat, show } from '../../src/lib/anis-docs.js';
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
    const acts = JSON.stringify(publicActivities({ activities: activityCatalog(), snapshot: snap, live: {} }));
    expect(acts).not.toContain(SECRET_Q);
  });

  it('activities: every registered one has a catalog entry and its users', () => {
    expect(Object.keys(activities()).filter((n) => !ACTIVITY_META[n])).toEqual([]);
    const { activities: list } = publicActivities({ activities: activityCatalog(), snapshot: strategiesSnapshot(), live: { 'respond.plan': { runs: 3, p50_ms: 10, usd: null } } });
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
  const pages = { 'response-strategies': ['/api/v1/anis/strategies', 'strategiesFlat'], 'anis-activities': ['/api/v1/anis/activities', 'activitiesFlat'], 'anis-tools': ['/api/v1/anis/tools', 'toolsFlat'] };

  it.each(Object.entries(pages))('%s renders from its API with live refresh and reserved numbers', (page, [api, flat]) => {
    const s = src(page);
    expect(s).toContain(`'${api}'`);
    expect(s).toContain(`bindLive(`);
    expect(s).toContain(flat);
    expect(s).toMatch(/data-live=/);
    expect(s.split('---').slice(2).join('---')).not.toMatch(/siftersearch/i);   // public copy never names the host site
    expect(s).not.toMatch(/\[var\(--/);   // semantic tokens, no arbitrary Tailwind values
  });

  it('cross-links: strategy nodes → activities → tools; strategies page has the intro, the flow and <details> cards', () => {
    const s = src('response-strategies');
    expect(s).toContain('/docs/anis-activities#${n.activity}');
    expect(s).toMatch(/<details class="card"/);
    expect(s).toContain('What a strategy is');
    expect(s).toContain('How strategies improve');
    for (const k of ['summary.active', 'summary.candidates', 'summary.promotions_30d']) expect(s).toContain(k);
    expect(src('anis-activities')).toContain('/docs/anis-tools#${t}');
    expect(src('anis-tools')).toContain('/docs/anis-activities#${a}');
    const nav = readFileSync(new URL('../../src/layouts/DocsLayout.astro', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../../src/pages/docs/index.astro', import.meta.url), 'utf8');
    for (const p of Object.keys(pages)) { expect(nav).toContain(`/docs/${p}`); expect(index).toContain(`/docs/${p}`); }
  });

  it('the flat maps feed SSR and live refresh the same text', () => {
    const d = publicStrategies({ snapshot: fixtureSnapshot(), activities: activityCatalog(), stats, branches });
    const m = strategiesFlat({ ...d });
    expect(show(m, 's.respond.score', 'score')).toBe('7.3/10');
    expect(show(m, 's.respond.p50_ms', 'ms')).toBe('900 ms');
    expect(show(m, 'b.respond.abc123abc123.share', 'share')).toBe('100.0%');
    expect(show(m, 's.prayer.score', 'score')).toBe('–');
    expect(activitiesFlat({ activities: [{ name: 'a', live: { runs: 2 } }] })['a.a.runs']).toBe(2);
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
