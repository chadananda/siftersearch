// The strategy-graph INTERPRETER (Phase 1, planning/anis-strategy-graph-plan.md). A strategy row's graph_json
// {entry, nodes:{id:{step, step_version}}, edges:[{from, on, to}]} is compiled once per catalog rev (steps → activities, edges
// → per-node maps, everything validated; an invalid DB graph → the checked-in seed's) and run node by node: each activity
// returns its edge, the edge picks the next node ('*' = any other edge, '$end' = done). Per node it records
// {node, step: 'id@v', ms, edge} into s.trace (→ path.steps). A sync activity is not awaited, so the run adds no ticks to it.
// ANIS_STRATEGY_GRAPH=0 → respond.js / strategies.js run the old code (Phase-1 rollback only).
import { catalog } from '../../repos/strategies-repo.js';
import { STRATEGIES as SEED_STRATEGIES, STEPS as SEED_STEPS, END_NODE } from '../strategy-seed.js';
import { activities as registry } from './index.js';
import { GATHERED } from '../respond.js';

export const strategyGraphOn = (env = process.env.ANIS_STRATEGY_GRAPH) => env !== '0';

/** Compile one strategy row against a step lookup (key 'id@v' → step row). Throws on anything that would not run. Pure. */
export function compileGraph(row, stepOf, activities = registry()) {
  const g = row?.graph;
  if (!g?.entry || !g.nodes?.[g.entry]) throw new Error(`strategy ${row?.id}: no entry node`);
  const nodes = {};
  for (const [id, n] of Object.entries(g.nodes)) {
    const key = `${n.step}@${n.step_version}`;
    const step = stepOf(key);
    if (!step) throw new Error(`strategy ${row.id}: node ${id} → unknown step ${key}`);
    const act = activities[step.activity];
    if (!act) throw new Error(`strategy ${row.id}: step ${key} → unknown activity ${step.activity}`);
    nodes[id] = { id, step: key, activity: step.activity, run: act.run, params: step.params || {}, out: new Map(), any: undefined };
  }
  for (const e of g.edges || []) {
    const n = nodes[e.from];
    if (!n) throw new Error(`strategy ${row.id}: edge from unknown node ${e.from}`);
    if (e.to !== END_NODE && !nodes[e.to]) throw new Error(`strategy ${row.id}: edge to unknown node ${e.to}`);
    if (e.on === '*') n.any = e.to; else n.out.set(e.on, e.to);
  }
  for (const n of Object.values(nodes)) {
    const uncovered = n.any === undefined ? (activities[n.activity].edges || []).filter((x) => !n.out.has(x)) : [];
    if (uncovered.length) throw new Error(`strategy ${row.id}: node ${n.id} has no route for edge(s) ${uncovered.join(', ')}`);
  }
  return { id: row.id, version: row.version, name: row.name, entry: g.entry, nodes };
}

let seedCompiled = null;
const seedGraph = (id) => {
  if (!seedCompiled) {
    const steps = new Map(SEED_STEPS.map((x) => [`${x.id}@${x.version}`, x]));
    seedCompiled = new Map(SEED_STRATEGIES.map((r) => [r.id, compileGraph(r, (k) => steps.get(k))]));
  }
  return seedCompiled.get(id) || null;
};
const compiledByCatalog = new WeakMap();
/** The compiled graph of strategy `id` from the current catalog (cached per rev); invalid or absent → the seed's. */
export function graphFor(id) {
  const c = catalog();
  let m = compiledByCatalog.get(c);
  if (!m) { m = new Map(); compiledByCatalog.set(c, m); }
  if (!m.has(id)) {
    const row = c.strategies.find((s) => s.id === id);
    let g = null;
    if (row) {
      try { g = compileGraph(row, (k) => c.steps.byKey.get(k)); } catch (err) { console.warn(`[strategy-graph] ${err.message}; using the seed graph`); }
    }
    m.set(id, g || seedGraph(id));
  }
  return m.get(id);
}

/** Run a compiled graph over the state `s` (s.trace collects the steps). Returns s. */
export async function runGraph(g, s) {
  s.trace ||= [];
  let id = g.entry;
  for (let hops = 0; id !== END_NODE; hops++) {
    if (hops > 1000) throw new Error(`strategy ${g.id}: no end after 1000 steps`);
    const n = g.nodes[id];
    const t = performance.now();
    let edge = n.run(s, n.params);
    if (edge && typeof edge.then === 'function') edge = await edge;
    const entry = { node: id, step: n.step, ms: Math.round((performance.now() - t) * 100) / 100, edge };
    if (s.note) { Object.assign(entry, s.note); s.note = null; }
    s.trace.push(entry);
    id = n.out.get(edge) ?? n.any;
    if (id === undefined) throw new Error(`strategy ${g.id}: node ${n.id} returned unrouted edge ${edge}`);
  }
  return s;
}

// what anisRespond reads after gathering (the old cascade's locals), or the reply an early step answered with
const GATHER_KEYS = ['fast', 'plan', 'conversational', 'work', 'live', 'researched', 'wantsOriginal', 'asks', 'huntAsEvidence', 'huntP', 'sourced', 'original',
  'study', 'strat', 'position', 'language', 'res', 'searchQ'];
/** anisRespond's gather by the 'respond' graph. */
export async function gatherByGraph(s) {
  await runGraph(graphFor('respond'), s);
  if (s.done) return s.done;
  return { [GATHERED]: true, ...Object.fromEntries(GATHER_KEYS.map((k) => [k, s[k]])) };
}

/** A W3 strategy's executor by its graph (strategies.js runStrategy). → the executor's output (null = nothing to execute). */
export async function runStrategyGraph(name, choice, ctx) {
  const g = graphFor(name);
  if (!g) return undefined;   // no such graph: the caller runs the registry tool directly
  const s = await runGraph(g, { choice, ctx, trace: [] });
  return s.out;
}
