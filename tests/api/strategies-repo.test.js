// strategies-repo (strategy graph, Phase 1): its own SQLite, seeded insert-if-absent; a bump adds a version and moves the rev;
// the catalog is cached per rev and falls back to the checked-in seed; the interpreter runs the DB's graph, not the code's.
import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { openStrategiesDb, seedStrategies, readAll, revOf, catalog, resetStrategiesCache, strategiesSnapshot } from '../../api/lib/repos/strategies-repo.js';
import * as SEED from '../../api/lib/assistant/strategy-seed.js';
import { graphFor, runGraph, compileGraph } from '../../api/lib/assistant/activities/graph.js';
import { activityList } from '../../api/lib/assistant/activities/index.js';
import { render, fill } from '../../api/lib/assistant/activities/templates.js';

afterEach(() => resetStrategiesCache());

describe('strategies store', () => {
  it('opens with the schema and the seed; re-seeding adds nothing and leaves the rev alone', () => {
    const db = openStrategiesDb(':memory:');
    const all = readAll(db);
    expect(all.templates.length).toBe(SEED.TEMPLATES.length);
    expect(all.steps.length).toBe(SEED.STEPS.length);
    expect(all.strategies.map((s) => s.id)).toEqual(SEED.STRATEGIES.map((s) => s.id));
    expect(all.strategies.find((s) => s.id === 'respond').graph).toEqual(SEED.STRATEGIES.find((s) => s.id === 'respond').graph);
    const rev = revOf(db);
    expect(seedStrategies(db)).toBe(0);
    expect(revOf(db)).toBe(rev);
    db.close();
  });

  it('a seed bump inserts a NEW version beside the old one; the catalog serves the latest after the rev moves', () => {
    const db = openStrategiesDb(':memory:');
    resetStrategiesCache({ db });
    const t = Date.now();
    const before = catalog({ now: t });
    expect(before.source).toBe('db');
    expect(render('prayer.how', {})).toBe(fill(SEED.TEMPLATES.find((t) => t.id === 'prayer.how').text, {}));
    const bumped = { ...SEED.TEMPLATES.find((t) => t.id === 'prayer.how'), version: 2, text: 'PRAYER v2' };
    expect(seedStrategies(db, { TEMPLATES: [bumped], STEPS: [], STRATEGIES: [] })).toBe(1);
    expect(readAll(db).templates.filter((t) => t.id === 'prayer.how').map((t) => t.version)).toEqual([1, 2]);
    expect(catalog({ now: t + 2 })).toBe(before);                   // within the re-check window: the cached catalog, no read
    const after = catalog({ now: t + 60_000 });
    expect(after.rev).toBe(before.rev + 1);
    expect(after.templates.latest.get('prayer.how').text).toBe('PRAYER v2');
  });

  it('an unusable store → the checked-in seed, never a throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetStrategiesCache({ db: { prepare: () => { throw new Error('disk gone'); } } });
    const c = catalog({ now: 5 });
    expect(c.source).toBe('seed');
    expect(c.strategies.map((s) => s.id)).toEqual([...new Set(SEED.STRATEGIES.map((s) => s.id))]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the admin snapshot: rev, source, every row', () => {
    resetStrategiesCache({ db: openStrategiesDb(':memory:') });
    const s = strategiesSnapshot();
    expect(s.source).toBe('db'); expect(s.rev).toBeGreaterThan(0);
    expect(s.strategies.map((x) => x.id)).toContain('respond');
    expect(s.steps.every((x) => typeof x.activity === 'string')).toBe(true);
  });
});

describe('the interpreter runs the DB graph', () => {
  it('every seeded step names a registered activity; every graph compiles', () => {
    const names = new Set(activityList().map((a) => a.name));
    for (const s of SEED.STEPS) expect(names, s.id).toContain(s.activity);
    const steps = new Map(SEED.STEPS.map((x) => [`${x.id}@${x.version}`, x]));
    for (const r of SEED.STRATEGIES) expect(() => compileGraph(r, (k) => steps.get(k))).not.toThrow();
    for (const a of activityList()) { expect(['tool', 'decision', 'transform', 'writer', 'check']).toContain(a.kind); expect(['code', 'jev', 'llm']).toContain(a.cls); }
  });

  it('a new graph version in the store is what runs (and an invalid one falls back to the seed graph)', async () => {
    const db = openStrategiesDb(':memory:');
    resetStrategiesCache({ db });
    const row = SEED.STRATEGIES.find((s) => s.id === 'prayer');
    expect(Object.keys(graphFor('prayer').nodes)).toEqual(['execute']);
    // v2: a guard node before the executor (a transform that only notes it ran)
    const g2 = { entry: 'first', nodes: { first: { step: 'respond.stage-search', step_version: 1 }, execute: row.graph.nodes.execute },
      edges: [{ from: 'first', on: '*', to: '$end' }, ...row.graph.edges] };   // ends before the executor (no library here)
    seedStrategies(db, { TEMPLATES: [], STEPS: [], STRATEGIES: [{ ...row, version: 2, graph: g2, parent_version: 1 }] });
    resetStrategiesCache({ db });
    expect(graphFor('prayer').version).toBe(2);
    const events = [];
    const s = await runGraph(graphFor('prayer'), { onEvent: (e) => events.push(e), choice: {}, ctx: {}, trace: [] });
    expect(events).toEqual([{ type: 'stage', stage: 'search' }]);
    expect(s.trace.map((x) => [x.node, x.step])).toEqual([['first', 'respond.stage-search@1']]);
    // v3 names a step that does not exist → the seed's graph, with a warning
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedStrategies(db, { TEMPLATES: [], STEPS: [], STRATEGIES: [{ ...row, version: 3, graph: { ...g2, nodes: { ...g2.nodes, first: { step: 'nope', step_version: 1 } } } }] });
    resetStrategiesCache({ db });
    expect(graphFor('prayer').version).toBe(1);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/unknown step nope@1/);
    warn.mockRestore();
  });
});

describe('GET /api/admin/anis/strategies', () => {
  it('internal key only; rows + rev + source + the activity registry', async () => {
    const saved = { d: process.env.DEPLOY_SECRET, i: process.env.INTERNAL_API_KEY };
    process.env.DEPLOY_SECRET = 'ik'; delete process.env.INTERNAL_API_KEY;
    resetStrategiesCache({ db: openStrategiesDb(':memory:') });
    const app = Fastify();
    await app.register((await import('../../api/routes/strategies-admin.js')).default, { prefix: '/api/admin' });
    const get = (key) => app.inject({ method: 'GET', url: '/api/admin/anis/strategies', headers: { 'x-internal-key': key } });
    expect((await get('no')).statusCode).toBe(401);
    const j = (await get('ik')).json();
    expect(j.source).toBe('db');
    expect(j.strategies.map((s) => s.id)).toEqual(SEED.STRATEGIES.map((s) => s.id));
    expect(j.activities.find((a) => a.name === 'strategy.comparison')).toMatchObject({ kind: 'tool', cls: 'code' });
    await app.close();
    if (saved.d === undefined) delete process.env.DEPLOY_SECRET; else process.env.DEPLOY_SECRET = saved.d;
    if (saved.i !== undefined) process.env.INTERNAL_API_KEY = saved.i;
  });
});
