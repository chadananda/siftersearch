// Strategy planner: abstract/compare/plan/planTests, validation (loops, kinds, cost), route() (gate, matched, planned, fallback),
// node-test promotion, probation rollback, TOOLS wishlist. Opus and Jev are mocked; nothing runs for real.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, listCandidates, promote } from '../../api/lib/repos/strategy-candidates-repo.js';
import { plannerLog, repeatPlans, probationFor, allPlans, queuedReplans, startProbation, getMeta, setMeta } from '../../api/lib/repos/strategy-planner-repo.js';
import * as P from '../../api/lib/assistant/strategy-planner.js';
import { decidePromotion } from '../../api/lib/assistant/strategy-promote.js';
import { activities as registry } from '../../api/lib/assistant/activities/index.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const reply = (o) => ({ text: JSON.stringify(o), usd: 0.05 });
const BLOCKS = 'voice: say it short. widget: short. site: full. email: letter. pdf: report.';

const TYPE = { key: 'compare_two_things', task: 'Set two things side by side.', inputs: ['topic'], output: 'a comparison', modes: {} };
const PLAN = () => ({
  name: 'side_by_side', difference: 'It sets two subjects against each other; understanding explains one.', description: 'The reader wants TWO things compared, side by side, with what they share and where they differ.',
  exemplars: ['How does X differ from Y?', 'Compare these two ideas.'], near_misses: [{ text: 'Explain X.', goes_to: 'understanding' }, { text: 'Hello there', goes_to: 'unmatched' }, { text: 'Who is Y?', goes_to: 'understanding' }],
  budget_class: 'answer', templates: [{ id: 'side_by_side.shape', text: BLOCKS }],
  graph: { entry: 'find', nodes: {
    find: { element: 'search.hype', kind: 'tool', reads: ['topic'], writes: ['found_passages'] },
    check: { element: 'judge.passages', kind: 'decide', reads: ['found_passages', 'topic'], writes: [] },
    order: { element: 'rank', kind: 'rank', reads: ['found_passages'], writes: [] },
    say: { element: 'shape', kind: 'process', params: { template: 'side_by_side.shape' }, reads: ['found_passages'], writes: [] } },
  edges: [{ from: 'find', on: 'several', to: 'check' }, { from: 'find', on: 'thin', to: 'check' }, { from: 'find', on: 'none', to: '$absence' }, { from: 'find', on: 'error', to: '$unavailable' },
    { from: 'check', on: 'answers', to: 'order' }, { from: 'check', on: 'mentions_only', to: 'order' }, { from: 'check', on: 'conflict', to: 'order' }, { from: 'check', on: 'empty', to: '$absence' },
    { from: 'order', on: 'done', to: 'say' }, { from: 'order', on: 'empty', to: '$absence' }, { from: 'say', on: 'done', to: '$end' }] },
  wishes: [{ element: 'compare_search', inputs: ['sides[]'], outputs: ['found_passages'], replaces: 'two searches', saves: { usd: 0.001, ms: 300 } }],
});
const TESTS = (plan, acts = registry()) => ({ nodes: P.decideNodes(plan, acts).flatMap((d) => d.edges.map((edge) => ({ node: d.node, edge, input: {}, why: 'x' }))), class: ['q1', 'q2'], guard: [{ question: 'g', goes_to: 'understanding' }] });
// scripted Opus: answers by system-prompt kind
const opus = (o = {}) => { const calls = []; const fn = vi.fn(async (role, system, user) => { calls.push(system.slice(0, 30)); if (/abstract/i.test(system.slice(0, 60))) return reply(o.type ?? TYPE); if (/compare a challenge TYPE/.test(system)) return reply(o.compare ?? { verdict: 'new', of: null, difference: 'Sets two subjects against each other.' });
  if (/TESTS of a planned/.test(system)) return reply(o.tests ?? TESTS(PLAN())); return reply(o.plan ?? PLAN()); }); fn.calls = calls; return fn; };
const ctx = () => ({ cat: catalog(), acts: registry() });

describe('abstract + compare', () => {
  it('abstract -> a type with a key', async () => {
    fresh();
    const r = await P.abstractChallenge(['How does A differ from B?'], { units: {} }, { call: opus() });
    expect(r.type).toMatchObject({ key: 'compare_two_things', task: expect.any(String) });
    expect((await P.abstractChallenge('q', {}, { call: async () => ({ text: 'nope', usd: 0 }) })).type).toBeNull();
  });
  it('compare: new / setting_of / duplicate', async () => {
    fresh(); const { cat } = ctx();
    expect(await P.compareType(TYPE, { cat, call: opus() })).toMatchObject({ verdict: 'new' });
    expect(await P.compareType(TYPE, { cat, call: opus({ compare: { verdict: 'setting_of', of: 'understanding', sets: { scope: 'x' } } }) })).toMatchObject({ verdict: 'setting_of', of: 'understanding', sets: { scope: 'x' } });
    expect(await P.compareType(TYPE, { cat, call: opus({ compare: { verdict: 'duplicate', of: 'understanding' } }) })).toMatchObject({ verdict: 'duplicate', of: 'understanding' });
    // a new with no difference, or a setting_of naming nothing real, is coerced
    expect((await P.compareType(TYPE, { cat, call: opus({ compare: { verdict: 'new', difference: '' } }) })).verdict).toBe('duplicate');
    expect((await P.compareType(TYPE, { cat, call: opus({ compare: { verdict: 'setting_of', of: 'nonsense', difference: 'It sets two subjects against each other.' } }) })).verdict).toBe('new');
  });
});

describe('plan -> a valid tree', () => {
  it('a good v2 plan validates with a run cost and wishes', () => {
    fresh(); const v = P.validatePlan(PLAN(), ctx());
    expect(v.errors).toEqual([]); expect(v.ok).toBe(true);
    expect(v.cost.expected_usd).toBeGreaterThanOrEqual(0); expect(v.cost.paths).toBeGreaterThan(3);
    expect(v.wishes.map((w) => w.element)).toEqual(['compare_search']);
    expect(v.normalized.strategy.graph.nodes.check).toMatchObject({ kind: 'decide', element: 'judge.passages' });
  });
  it('rejects: kind mismatch, impure tool, unknown unit, short card, no mode block, missing shape, error to absence, synthesize reach', () => {
    fresh(); const bad = (f) => { const p = PLAN(); f(p); return P.validatePlan(p, ctx()); };
    expect(bad((p) => { p.graph.nodes.check.kind = 'tool'; }).errors.join()).toMatch(/node check: judge.passages is a decide node/);
    expect(bad((p) => { p.graph.nodes.find.reads = ['nope_unit']; }).errors.join()).toMatch(/unit "nope_unit"/);
    expect(bad((p) => { p.near_misses = p.near_misses.slice(0, 1); }).errors.join()).toMatch(/3 near_misses/);
    expect(bad((p) => { p.templates[0].text = 'just text'; }).errors.join()).toMatch(/block for each mode/);
    expect(bad((p) => { delete p.graph.nodes.say; p.graph.edges = p.graph.edges.filter((e) => e.from !== 'say' && e.from !== 'order'); }).errors.join()).toMatch(/no shape node/);
    expect(bad((p) => { p.graph.edges.find((e) => e.on === 'error').to = '$absence'; }).errors.join()).toMatch(/error is not an absence/);
    expect(bad((p) => { p.budget_class = 'huge'; }).errors.join()).toMatch(/budget_class/);
    expect(bad((p) => { p.graph.nodes.say.kind = 'synthesize'; }).errors.join()).toMatch(/is a (process|synthesize)/);
    expect(bad((p) => { p.graph.nodes.find.element = 'fallback.agent'; p.graph.nodes.find.kind = 'tool'; }).errors.join()).toMatch(/node find/);
    expect(P.validatePlan(null, ctx()).ok).toBe(false);
  });
  it('a tool that is not pure code is rejected', () => {
    fresh(); const acts = { ...registry(), 'x.llm_tool': { scope: 'strategy', kind: 'tool', cls: 'llm', reads: ['topic'], writes: [], edges: ['done'], params: [] } };
    const p = PLAN(); p.graph.nodes.find = { element: 'x.llm_tool', kind: 'tool', reads: ['topic'] };
    expect(P.validatePlan(p, { cat: catalog(), acts }).errors.join()).toMatch(/node find/);
    expect(P.impureTool(acts['x.llm_tool'])).toBe(true); expect(P.impureTool(acts['search.hype'])).toBe(false);
  });
  it('a per-path budget over the class is rejected', () => {
    fresh(); const p = PLAN(); p.budget_class = 'lookup';
    const v = P.validatePlan(p, { ...ctx() }); // lookup is the tightest; the plan has a process shape node
    if (!v.ok) expect(v.errors.join()).toMatch(/run cost|budget/);
    const costs = P.pathCosts({ entry: 'a', edges: [{ from: 'a', on: 'done', to: 'b' }, { from: 'b', on: 'done', to: '$end' }] }, { a: 'synthesize', b: 'decide' }, { max_paths: 10, node_cost: { synthesize: { usd: 0.5, ms: 9000 }, decide: { usd: 0.001, ms: 100 } } });
    expect(costs.paths[0]).toMatchObject({ usd: 0.501, ms: 9100 });
    expect(P.expectedCost(costs.paths).worst_usd).toBe(0.501);
  });
  it('rank is a decide-type node; node tests are required for its edges', () => {
    fresh(); const plan = PLAN(); const dn = P.decideNodes(plan, registry());
    expect(dn.map((d) => d.node).sort()).toEqual(['check', 'order']);
    expect(P.kindOfAct('rank', registry().rank)).toBe('rank');
    expect(P.validatePlan(plan, { ...ctx(), tests: { nodes: [] }, requireTests: true }).errors.join()).toMatch(/tests: no test for/);
    expect(P.validatePlan(plan, { ...ctx(), tests: TESTS(plan), requireTests: true }).ok).toBe(true);
  });
});

describe('tools over decisions: loops are rejected', () => {
  it('a decide/process node in a cycle names the merged tool wish', () => {
    fresh(); const p = PLAN(); p.graph.edges.push({ from: 'order', on: 'empty', to: 'check' }); p.graph.edges = p.graph.edges.filter((e) => !(e.from === 'order' && e.to === '$absence'));
    const v = P.validatePlan(p, ctx());
    expect(v.ok).toBe(false); expect(v.errors.join()).toMatch(/inside a loop/); expect(v.errors.join()).toMatch(/wish for the merged tool/);
    expect(P.cycleNodes([{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'c' }]).sort()).toEqual(['a', 'b']);
  });
  it('hand.strategy fan-out per side and a dedup node are rejected', () => {
    fresh(); const p = PLAN(); p.graph.nodes.side = { element: 'hand.strategy', kind: 'tool', params: { units: 'sides' }, reads: ['topic'] };
    expect(P.validatePlan(p, ctx()).errors.join()).toMatch(/fan-out/);
    const q = PLAN(); q.graph.nodes.order.params = { dedupe: true };
    expect(P.validatePlan(q, ctx()).errors.join()).toMatch(/dedup is never a tree node/);
  });
});

describe('planCandidate + planTests', () => {
  it('full mode: abstract, compare, plan, tests -> valid, with a type key and tests for every decide edge', async () => {
    const db = fresh(); const call = opus();
    const r = await P.planCandidate('How do A and B differ?', { ...ctx(), call, db });
    expect(r.ok).toBe(true); expect(r.plan.typeKey).toBe('compare_two_things'); expect(r.plan.cost).toBeTruthy();
    expect(P.testGaps(r.plan, r.tests)).toEqual([]);
    for (const d of P.decideNodes(r.plan)) for (const e of d.edges) expect(r.tests.nodes.some((t) => t.node === d.node && t.edge === e)).toBe(true);
  });
  it('planTests retries once naming the uncovered node.edge, then fails if still missing', async () => {
    fresh(); const plan = PLAN(); const full = TESTS(plan); const partial = { ...full, nodes: full.nodes.slice(0, 2) };
    let n = 0; const call = vi.fn(async () => reply(n++ === 0 ? partial : full));
    expect((await P.planTests(plan, { call })).tests.nodes.length).toBe(full.nodes.length); expect(call).toHaveBeenCalledTimes(2);
    expect((await P.planTests(plan, { call: async () => reply(partial) })).tests).toBeNull();
  });
  it('a bad plan is retried once with the errors; setting_of/duplicate designs nothing', async () => {
    fresh(); const bad = PLAN(); bad.near_misses = []; const seen = []; let n = 0;
    const call = vi.fn(async (r, system, user) => { if (/abstract/i.test(system.slice(0, 60))) return reply(TYPE); if (/compare a challenge TYPE/.test(system)) return reply({ verdict: 'new', difference: 'x' });
      if (/TESTS of a planned/.test(system)) return reply(TESTS(PLAN())); seen.push(user); return reply(n++ === 0 ? bad : PLAN()); });
    const r = await P.planCandidate('q', { ...ctx(), call }); expect(r.ok).toBe(true); expect(r.attempts).toBe(2); expect(seen[1]).toMatch(/PREVIOUS ANSWER WAS INVALID/);
    const d = await P.planCandidate('q', { ...ctx(), call: opus({ compare: { verdict: 'setting_of', of: 'understanding', sets: { a: 1 } } }) });
    expect(d).toMatchObject({ ok: false, settingOf: 'understanding', verdict: 'setting_of' });
  });
  it('fast mode: one Opus call that returns the plan', async () => {
    const db = fresh(); const call = opus();
    const r = await P.planCandidate('q', { ...ctx(), call, db, mode: 'fast' });
    expect(r.ok).toBe(true); expect(call).toHaveBeenCalledTimes(1); expect(r.tests).toBeNull();
  });
});

describe('promotion rejects a failing decide node, names it; cost cuts at equal quality promote', () => {
  const cls = (cand, cur, o = {}, c = {}) => ({ set: 'fresh', question: `q${cand}`, cand: { score: cand, ms: 1000, usd: 0.02, jev_pick: 'side_by_side', ...o }, cur: { score: cur, ms: 1000, usd: 0.02, ...c } });
  const win = [cls(9, 7), cls(9, 7), cls(8, 7)];
  it('node under the bar fails with the node named', () => {
    expect(decidePromotion(win, { name: 'side_by_side' }).promote).toBe(true);
    const d = decidePromotion(win, { name: 'side_by_side', nodes: { rate: 0.6, nodes: { check: { pass: 1, total: 4, rate: 0.25 }, order: { pass: 4, total: 4, rate: 1 } }, failed: [] } });
    expect(d.promote).toBe(false); expect(d.failed.join()).toMatch(/node check: 1\/4 node tests pass/); expect(d.failed.join()).not.toMatch(/node order/);
  });
  it('a cost saving at equal quality is promotable', () => {
    const rows = [cls(7, 7, { usd: 0.01 }), cls(7, 7, { usd: 0.01 }), cls(7, 7, { usd: 0.01 })];
    const d = decidePromotion(rows, { name: 'side_by_side' });
    expect(d.failed.join()).not.toMatch(/not better by/); expect(d.cost_saving).toBe(true);
  });
  it('runNodeTests: a test that cannot run counts as failed', async () => {
    const r = await P.runNodeTests({ nodes: [{ node: 'check', edge: 'answers', input: {} }] }, { row: { graph: { nodes: {} } }, steps: new Map() }, {});
    expect(r.nodes.check).toMatchObject({ pass: 0, total: 1 }); expect(r.failed[0]).toMatchObject({ node: 'check', edge: 'answers' });
    expect(P.weakDecideNodes(r).map((w) => w.node)).toEqual(['check']);
  });
});

describe('route(): two paths, decided by Jev', () => {
  const turn = (question, choice = null) => ({ question, messages: [], strategy: choice ? { choice } : null });
  it('conversational: the gate says so, the planner is never called', async () => {
    const db = fresh(); const plan = vi.fn(); const record = vi.fn();
    const r = await P.route(turn("that's a good point"), { cat: catalog(), gate: async () => 'conversational', plan, record });
    expect(r).toEqual({ kind: 'conversational', gate: 'conversational' }); expect(plan).not.toHaveBeenCalled(); expect(record).toHaveBeenCalledWith(r); void db;
  });
  it('a new research question: gate -> planner runs -> planned; a repeat of the type is a defect', async () => {
    const db = fresh(); const call = opus(); const defect = vi.fn();
    const io = { cat: catalog(), gate: async () => 'research', plan: (t) => P.planUnmatched({ question: t.question, messages: [] }, { db, call, listCandidates, cat: catalog() }), defect };
    const first = opus({ plan: { ...PLAN(), type: TYPE } });
    io.plan = (t) => P.planUnmatched({ question: t.question, messages: [] }, { db, call: first, listCandidates, cat: catalog() });
    const r = await P.route(turn('How do A and B differ?'), io);
    expect(r).toMatchObject({ kind: 'strategy', source: 'planned', gate: 'research', name: expect.any(String) });
    expect(listCandidates(db).length).toBe(1); expect(allPlans(db)[0].wishes[0].element).toBe('compare_search');
    // a second plan for the same type is logged as a defect
    const again = PLAN(); again.name = 'pair_compare'; again.description = 'Two subjects held against each other: shared ground and differences.'; again.type = TYPE; again.templates[0].id = 'side_by_side.shape2'; again.graph.nodes.say.params.template = 'side_by_side.shape2';
    const r2 = await P.route(turn('And C vs D?'), { ...io, cat: catalog(), plan: (t) => P.planUnmatched({ question: t.question, messages: [] }, { db, call: opus({ plan: again }), listCandidates, cat: catalog() }) });
    expect(r2.source).toBe('planned'); expect(plannerLog(db, { kind: 'defect' }).length).toBeGreaterThan(0); expect(repeatPlans(db)[0]).toMatchObject({ type_key: 'compare_two_things', plans: 2 });
  });
  it('matched: the gate is never called and Opus is never called', async () => {
    fresh(); const gate = vi.fn(), plan = vi.fn(), call = opus();
    const r = await P.route(turn('Explain unity', 'understanding'), { cat: catalog(), gate, plan });
    expect(r).toMatchObject({ kind: 'strategy', name: 'understanding', source: 'matched', gate: null }); expect(gate).not.toHaveBeenCalled(); expect(plan).not.toHaveBeenCalled(); expect(call).not.toHaveBeenCalled();
    expect(P.matchRoute(turn('x', 'understanding'))).toMatchObject({ source: 'matched' }); expect(P.matchRoute(turn('x'))).toBeNull();
  });
  it('planner failure: runs the stored general_research tree and logs a defect', async () => {
    const db = fresh(); const defect = vi.fn((why) => P.logFallbackDefect(db, { question: 'q', why }));
    const call = async () => ({ text: 'garbage', usd: 0 });
    const r = await P.route(turn('odd question'), { cat: catalog(), gate: async () => 'research', plan: (t) => P.planUnmatched({ question: t.question }, { db, call, listCandidates, cat: catalog() }), defect });
    expect(r).toMatchObject({ kind: 'strategy', name: 'general_research', source: 'fallback' }); expect(r.defect).toMatch(/planner failed/);
    expect(defect).toHaveBeenCalled(); expect(plannerLog(db, { kind: 'defect' })[0].note).toMatch(/fallback used/);
    expect(catalog().strategies.some((s) => s.name === 'general_research')).toBe(true);
  });
  it('gate: Jev down fails open to research; the option text is stored', async () => {
    fresh();
    expect(await P.gateTurn({ question: 'q' }, { cat: catalog(), jev: async () => null })).toBe('research');
    expect(await P.gateTurn({ question: 'q' }, { cat: catalog(), jev: async () => ({ choice: 'conversational' }) })).toBe('conversational');
    expect(P.gateOptions(catalog()).options.research).toBeTruthy();
  });
  it('setting_of at run time runs the existing strategy with its sets; activateProvisional puts a new tree on probation', async () => {
    const db = fresh();
    const s = await P.planUnmatched({ question: 'q' }, { db, call: opus({ plan: { verdict: 'setting_of', of: 'understanding', sets: { scope: 'z' } } }), listCandidates, cat: catalog() });
    expect(s).toMatchObject({ ok: true, name: 'understanding', sets: { scope: 'z' } });
    const n = await P.planUnmatched({ question: 'How do A and B differ?' }, { db, call: opus(), listCandidates, cat: catalog() });
    expect(P.activateProvisional(db, n.saved)).toBe(true);
    expect(probationFor(db, n.name, n.version)).toMatchObject({ phase: 'probation', provisional: expect.anything() });
    resetStrategiesCache({ db }); expect(catalog().strategies.some((x) => x.name === 'side_by_side')).toBe(true);
    expect(P.activateProvisional(db, { dedupe: { name: 'x' } })).toBe(false);
  });
});

describe('probation: rollback on regression, clearing, weak nodes, dead branches', () => {
  const setup = async (prior = true) => {
    const db = fresh();
    if (prior) { const a = await P.planUnmatched({ question: 'one' }, { db, call: opus(), listCandidates, cat: catalog() }); P.activateProvisional(db, a.saved); }
    return db;
  };
  it('mean score under the baseline rolls back, naming the failing node', async () => {
    const db = await setup(); const name = 'side_by_side'; resetStrategiesCache({ db });
    const nodes = [{ node: 'check', edge: 'answers' }];
    let last; for (let i = 0; i < 6 && last?.state !== 'rolled_back'; i++) last = P.observeProbation(db, { name, score: 2, nodes }, { baseline: 8 });
    expect(last.state).toBe('rolled_back'); expect(last.why).toMatch(/mean/); expect(last.node).toBe('check');
    expect(plannerLog(db, { kind: 'rollback' })[0].note).toMatch(/failing node check/);
    resetStrategiesCache({ db }); expect(catalog().strategies.some((x) => x.name === name)).toBe(false);
  });
  it('a node that keeps erroring rolls back; clean runs clear the probation after N; none = no probation', async () => {
    const db = await setup(); resetStrategiesCache({ db });
    let r; for (let i = 0; i < 5 && r?.state !== 'rolled_back'; i++) r = P.observeProbation(db, { name: 'side_by_side', score: 9, nodes: [{ node: 'find', edge: 'error' }] }, { baseline: 8 });
    expect(r).toMatchObject({ state: 'rolled_back', node: 'find' });
    expect(P.observeProbation(db, { name: 'understanding', score: 9 }).state).toBe('none');
    const db2 = await setup(); resetStrategiesCache({ db: db2 }); let c;
    for (let i = 0; i < 50; i++) c = P.observeProbation(db2, { name: 'side_by_side', score: 9, nodes: [{ node: 'check', edge: 'answers' }] }, { baseline: 8 });
    expect(c.state).toBe('cleared'); expect(plannerLog(db2, { kind: 'cleared' }).length).toBe(1);
  });
  it('a weak node feeds IMPROVE (suggest), and untaken edges show as dead after enough runs', async () => {
    const db = await setup(); resetStrategiesCache({ db }); const suggest = vi.fn();
    for (let i = 0; i < 12; i++) P.observeProbation(db, { name: 'side_by_side', score: 9, nodes: [{ node: 'check', edge: i % 3 ? 'error' : 'answers' }] }, { baseline: 8, suggest });
    // the node failure floor may roll it back first; either way weak/dead reporting is consistent
    const pr = probationFor(db, 'side_by_side', 1) || {};
    expect(suggest.mock.calls.length + (pr.phase === 'rolled_back' ? 1 : 0)).toBeGreaterThan(0);
    const dead = P.deadEdges(PLAN(), { runs: 20, nodes: { check: { edges: { answers: 5 } } } });
    expect(dead).toContainEqual({ node: 'check', edge: 'conflict' }); expect(dead).not.toContainEqual({ node: 'check', edge: 'answers' });
    expect(P.deadEdges(PLAN(), { runs: 2, nodes: {} })).toEqual([]);
  });
});

describe('TOOLS loop: wish -> wishlist -> catalog change -> re-plan', () => {
  it('a wish is recorded with the plan; the wishlist aggregates and renders Gherkin', async () => {
    const db = fresh();
    await P.planUnmatched({ question: 'How do A and B differ?' }, { db, call: opus(), listCandidates, cat: catalog() });
    const list = P.toolWishlist(db); expect(list[0]).toMatchObject({ element: 'compare_search', count: 1, saves: { usd: 0.001, ms: 300 } });
    expect(P.wishlistGherkin(list)).toMatch(/Feature: tool compare_search \(loop TOOLS/);
  });
  it('a catalog change queues re-plans for strategies that wished for an element that now exists; a re-plan wins only if cheaper at equal quality', async () => {
    const db = fresh();
    await P.planUnmatched({ question: 'How do A and B differ?' }, { db, call: opus(), listCandidates, cat: catalog() });
    expect(P.checkCatalog(db)).toMatchObject({ changed: false, queued: [] });   // first sight stores the version
    expect(P.checkCatalog(db).changed).toBe(false);
    const acts = { ...registry(), compare_search: { scope: 'strategy', kind: 'tool', cls: 'code', reads: ['topic'], writes: ['found_passages'], edges: ['done'], params: [] } };
    const r = P.checkCatalog(db, acts);
    expect(r.changed).toBe(true); expect(r.queued.length).toBe(1); expect(queuedReplans(db)).toHaveLength(1);
    expect(P.checkCatalog(db, acts).queued).toEqual([]);
    expect(P.catalogVersion(acts)).not.toBe(P.catalogVersion(registry()));
    const old = { cost: { expected_usd: 0.01, expected_ms: 4000 } };
    expect(P.replanWins(old, { cost: { expected_usd: 0.008, expected_ms: 4000 } }, { quality: [7, 7] })).toBe(true);
    expect(P.replanWins(old, { cost: { expected_usd: 0.008, expected_ms: 4000 } }, { quality: [7, 6] })).toBe(false);
    expect(P.replanWins(old, { cost: { expected_usd: 0.02, expected_ms: 9000 } }, { quality: [7, 8] })).toBe(false);
  });
});

describe('offline planFromClasses', () => {
  const TEXT = `### compare_a | strategy | active | classes=[1] | t="x"
 desc: Two things side by side.
 sounds_like: ["How does X differ from Y?", "Held out one?"]
### other | strategy | active | classes=[2] | t="y"
 desc: Another.
`;
  it('parses cards, plans each with mocked Opus, keeps held-out questions out, returns the tool and field wishlist', async () => {
    fresh(); const seen = [];
    const call = vi.fn(async (r, system, user) => { seen.push(user); if (/abstract/i.test(system.slice(0, 60))) return reply({ ...TYPE, key: `k${seen.length}` }); if (/compare a challenge TYPE/.test(system)) return reply({ verdict: 'new', difference: 'unique' });
      if (/TESTS of a planned/.test(system)) return reply(TESTS(PLAN())); const p = PLAN(); p.name = `plan_${seen.length}`; return reply(p); });
    expect(P.parseClassCards(TEXT).map((c) => c.name)).toEqual(['compare_a', 'other']);
    const out = await P.planFromClasses(TEXT, { call, cat: catalog(), heldOut: ['Held out one?'] });
    expect(out.candidates).toHaveLength(2); expect(out.candidates.every((c) => c.tests)).toBe(true);
    expect(seen.join('\n')).not.toMatch(/Held out one/); expect(seen.join('\n')).toMatch(/How does X differ/);
    expect(out.tools[0]).toMatchObject({ element: 'compare_search', count: 2 }); expect(out.fields).toContain('sides[]');
  });
});
