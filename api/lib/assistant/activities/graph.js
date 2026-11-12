// The strategy-graph INTERPRETER (Phase 1, planning/anis-strategy-graph-plan.md). A strategy row's graph_json
// {entry, nodes:{id:{step, step_version}}, edges:[{from, on, to}]} is compiled once per catalog rev (steps → activities, edges
// → per-node maps, everything validated; an invalid DB graph → the checked-in seed's) and run node by node: each activity
// returns its edge, the edge picks the next node ('*' = any other edge, '$end' = done). Per node it records
// {node, step: 'id@v', ms, edge} into s.trace (→ path.steps). A sync activity is not awaited, so the run adds no ticks to it.
// ANIS_STRATEGY_GRAPH=0 → respond.js / strategies.js run the old code (Phase-1 rollback only). A node whose step params carry
// `enrich` runs inside ctx.jevEnrich — the ONLY way a tested Jev theory reaches the reply path (jev-tuning/enrich.js).
import { catalog } from '../../repos/strategies-repo.js';
import { currentAIContext, withAIContext } from '../../ai-context.js';
import { STRATEGIES as BASE_STRATEGIES, TREE_STRATEGIES, STEPS as SEED_STEPS, END_NODE, LOOKUP_STRATEGIES } from '../strategy-seed.js';
const SEED_STRATEGIES = [...BASE_STRATEGIES, ...TREE_STRATEGIES];
import { strategyOf } from '../strategy-choice.js';
import { activities as registry } from './index.js';
import { GATHERED, quotedSpan } from '../respond.js';
import { buildUnits, emptyState, UNITS } from '../units.js';
import { parseScriptureRef } from '../scripture-ref.js';

// Phase 2 measurement (strategy-stats-repo): each run is offered to the turn's ctx.graphRuns ([{graph:'id@v', trace}], opened by
// turn.js) and each trace entry carries, NON-enumerably, the Jev calls its node made — neither changes path.steps' JSON.
const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true });

// SHARED ENDS (strategy-trees §2): edge targets a tree may route to that are not its own nodes, so they never count toward the node
// limit — the not-found sub-tree, the research-agent fallback, "couldn't search". Each runs its element once and routes on (below).
export const SHARED_ENDS = Object.freeze({ $absence: 'end.absence', $fallback: 'end.fallback', $unavailable: 'end.unavailable' });
const SHARED_ROUTES = { $absence: { any: END_NODE }, $fallback: { out: { answered: END_NODE, fail: '$unavailable' } }, $unavailable: { any: END_NODE } };

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
    if (e.to !== END_NODE && !nodes[e.to] && !SHARED_ENDS[e.to]) throw new Error(`strategy ${row.id}: edge to unknown node ${e.to}`);
    if (e.on === '*') n.any = e.to; else n.out.set(e.on, e.to);
  }
  // a shared end is a node only when something routes to it (and only if the registry has its element). A TREE (declares `needs`, or routes to a shared end)
  // always gets $fallback and $unavailable: they are where an element that throws lands (runGraph), so a bad param never fails the turn
  const tree = !!g.needs || (g.edges || []).some((e) => SHARED_ENDS[e.to]);
  for (const [id, activity] of Object.entries(SHARED_ENDS)) {
    const routed = (g.edges || []).some((e) => e.to === id || (id === '$unavailable' && e.to === '$fallback'));
    if (!routed && !(tree && id !== '$absence' && activities[activity])) continue;
    if (!activities[activity]) throw new Error(`strategy ${row.id}: shared end ${id} needs the ${activity} element`);
    const r = SHARED_ROUTES[id];
    nodes[id] = { id, step: id, activity, run: activities[activity].run, params: {}, out: new Map(Object.entries(r.out || {})), any: r.any, shared: true };
  }
  for (const n of Object.values(nodes)) {
    if (n.shared) continue;
    // an element whose edges depend on its params (switch cases, judge options) lists them with edgesFor
    const edges = activities[n.activity].edgesFor ? activities[n.activity].edgesFor(n.params) : activities[n.activity].edges || [];
    const uncovered = n.any === undefined ? edges.filter((x) => !n.out.has(x)) : [];
    if (uncovered.length) throw new Error(`strategy ${row.id}: node ${n.id} has no route for edge(s) ${uncovered.join(', ')}`);
  }
  return { id: row.id, version: row.version, name: row.name, entry: g.entry, nodes, ...(g.needs ? { needs: g.needs } : {}), ...(g.units ? { units: g.units } : {}) };
}

// the seed's graphs by id@version; `id` alone = the highest ACTIVE version (a seeded candidate is never the fallback)
let seedCompiled = null;
const seedSteps = new Map(SEED_STEPS.map((x) => [`${x.id}@${x.version}`, x]));
const seedGraph = (id, version = null) => {
  seedCompiled ||= new Map();
  const rows = SEED_STRATEGIES.filter((r) => r.id === id && (version != null ? r.version === version : r.status === 'active'));
  const row = rows.sort((a, b) => b.version - a.version)[0];
  if (!row) return null;
  const k = `${row.id}@${row.version}`;
  if (!seedCompiled.has(k)) seedCompiled.set(k, compileGraph(row, (x) => seedSteps.get(x)));
  return seedCompiled.get(k);
};
const compiledByCatalog = new WeakMap();
/** The compiled graph of strategy `id` from the current catalog (cached per rev); invalid or absent → the seed's. */
const compiledByPin = new WeakMap();
export function graphFor(id, version = null) {
  // a tree names the exact version of a sub-tree it was designed with (hand.strategy version): the seed's row, its steps from the store first
  if (version != null) {
    const row = SEED_STRATEGIES.find((r) => r.id === id && r.version === version);
    if (row) { const c = catalog(); return compileGraph(row, (k) => c.steps.byKey.get(k) ?? seedSteps.get(k)); }
  }
  // a dry run PINS one strategy@version (strategy-try.js, ai-context strategyPin): that row, compiled against the store's steps
  const pin = currentAIContext().strategyPin;
  if (pin?.row?.id === id) {
    if (!compiledByPin.has(pin)) compiledByPin.set(pin, compileGraph(pin.row, (k) => pin.steps.get(k)));
    return compiledByPin.get(pin);
  }
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
  const ac = currentAIContext(), jevCalls = ac.jevTurn?.calls;
  if (Array.isArray(ac.graphRuns)) ac.graphRuns.push({ graph: `${g.id}@${g.version}`, trace: s.trace });
  let id = g.entry;
  for (let hops = 0; id !== END_NODE; hops++) {
    if (hops > 1000) throw new Error(`strategy ${g.id}: no end after 1000 steps`);
    const n = g.nodes[id];
    s.node = id;   // the running node's id: elements key found_outcome / param overrides by it
    const t = performance.now(), j0 = jevCalls?.length ?? 0;
    // a decision step's params.enrich (a tested Jev theory, jev-tuning/theories.js): its Jev calls get the registered enrichers
    // (systemone reads ctx.jevEnrich). No enrich → the node runs exactly as before (one property read).
    // an element that THROWS never fails the turn: its node's `error` edge, else the shared $fallback (→ $unavailable → end); a decision is logged
    let edge, failed = null;
    try {
      edge = n.params.enrich?.length ? withAIContext({ jevEnrich: { list: n.params.enrich, messages: s.messages ?? s.ctx?.messages ?? [] } }, () => n.run(s, n.params))
        : n.run(s, n.params);
      if (edge && typeof edge.then === 'function') edge = await edge;
    } catch (err) {
      const to = n.out.get('error') ?? (id === '$fallback' ? '$unavailable' : id === '$unavailable' ? END_NODE : g.nodes.$fallback ? '$fallback' : n.any);
      if (to === undefined) throw err;
      failed = err?.message || String(err); edge = 'error';
      console.warn(`[strategy-graph] ${g.id}@${g.version} node ${id} (${n.step}) threw: ${failed}; routed to ${to}`);
      (s.direction?.decisions ?? s.ctx?.decisions)?.record?.('graph:error', { by: 'code', saw: { strategy: g.id, node: id, step: n.step, error: failed.slice(0, 200) }, options: ['error edge', '$fallback'], chosen: to, reason: 'an element threw; the turn continues on its error route' });
      s.note = { ...(s.note || {}), error: failed.slice(0, 200) };
      s.route = to;
    }
    const entry = { node: id, step: n.step, ms: Math.round((performance.now() - t) * 100) / 100, edge };
    if (s.note) { Object.assign(entry, s.note); s.note = null; }
    if (jevCalls && jevCalls.length > j0) hide(entry, 'jevCalls', jevCalls.slice(j0));
    s.trace.push(entry);
    if (s.units) (s.units.path ||= []).push(`${id}:${edge}`);   // §2a `path`: templates read judge verdicts from it
    id = failed !== null ? s.route : n.out.get(edge) ?? n.any;
    if (id === undefined) throw new Error(`strategy ${g.id}: node ${n.id} returned unrouted edge ${edge}`);
  }
  return s;
}

// what anisRespond reads after gathering (the old cascade's locals), or the reply an early step answered with
const GATHER_KEYS = ['fast', 'plan', 'conversational', 'work', 'live', 'researched', 'wantsOriginal', 'asks', 'huntAsEvidence', 'huntP', 'sourced', 'original',
  'study', 'strat', 'position', 'language', 'res', 'searchQ'];
/** anisRespond's gather: by the lookup strategy's graph when Jev chose one (book, quote_trace, term, original, about), else the 'respond' graph (Unmatched). */
/** A lookup strategy whose graph runs over the whole turn state (a v1 lookup graph). Its tree (declares `needs`: quote_trace/term/original@2) is an
 * executor instead (respond.strategy → runStrategyGraph, with the turn's units): run over the turn state it had no units (quotation_candidates got the whole
 * question) and its s.out never reached the writer (11-10 quote_trace@2: passages found, "writer passages: none recorded"). */
export const runsOverTurn = (name) => LOOKUP_STRATEGIES.has(name) && !graphFor(name)?.needs;

export async function gatherByGraph(s) {
  const own = strategyOf(s.direction?.strategy);
  await runGraph((runsOverTurn(own) && graphFor(own)) || graphFor('respond'), s);
  if (s.done) return s.done;
  return { [GATHERED]: true, ...Object.fromEntries(GATHER_KEYS.map((k) => [k, s[k]])), asks: s.asks || [] };   // asks: Unmatched has no hunt node now
}

/** A W3 strategy's executor by its graph (strategies.js runStrategy). → the executor's output (null = nothing to execute). */
export async function runStrategyGraph(name, choice, ctx) {
  const g = graphFor(name);
  if (!g) return undefined;   // no such graph: the caller runs the registry tool directly
  const units = g.needs ? entryUnits(g, choice, ctx) : null, trace = [];
  if (units) await quotedByJev(g, units, trace, ctx);
  const s = await runGraph(g, { choice, ctx, trace, question: ctx?.query ?? ctx?.question ?? '', messages: ctx?.messages, state: ctx?.state ?? undefined, onEvent: ctx?.onEvent ?? (() => {}), executor: true, ...(units ? { units } : {}) });
  if (s.fellThrough) return null;   // $absence with nothing found: the ordinary research path answers the turn
  return s.out === undefined && !s.done ? undefined : (s.out ?? null);   // the research agent answered (a tree's $fallback): nothing to execute, the ordinary path has the reply
}

// a quotation tree whose reader used no quotation marks: Jev picks the attributed wording among the message's structural spans (judges.js);
// none → the unit stays as it was (the question). Recorded as a step so the turn trace shows what was searched.
export async function quotedByJev(g, u, trace, ctx = {}) {
  if (!g.needs?.includes('quoted_words') || String(u.quoted_words ?? '').trim()) return;
  const t = performance.now(), judge = ctx.judgeQuotedWords || (await import('../judges.js')).judgeQuotedWords;
  const r = await judge({ question: u.current_user_question ?? ctx.query ?? '' }).catch(() => null);
  if (r?.words) { u.quoted_words = r.words; if (!String(u.quoted_clean ?? '').trim()) u.quoted_clean = r.words; }
  trace.push({ graph: `${g.id}@${g.version}`, node: 'quoted', step: 'units.quoted_words@1', ms: Math.round((performance.now() - t) * 100) / 100, edge: r?.words ? 'found' : 'none', ...(r?.words ? { saw: r.words } : {}) });
}

/** The term a term question names, from structure only (quotes, script, transliteration marks); null when none. Pure. */
export function termSpan(q) {
  const t = String(q || ''), quoted = quotedSpan(t, 1);
  if (quoted && quoted.split(/\s+/).length <= 4) return quoted;
  const script = t.match(/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF]+(?:\s+[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u4E00-\u9FFF]+)*/u);
  if (script) return script[0];
  const marked = t.split(/[\s,;:?!.()"“”]+/).filter((w) => /[\p{L}]/u.test(w) && /[\u00C0-\u024F\u1E00-\u1EFF\u02BB\u02BC\u02BE\u02BF]/u.test(w) || /^[‘’ʻʼʾʿ][\p{L}]/u.test(w));
  return marked.length ? marked.join(' ').replace(/^['’]+|['’]+$/g, '') : null;
}

/**
 * The units a TREE runs on (units.js buildUnits): the scope the turn resolved through its layers (ctx.scope.units, the turn's highest layer — a default
 * authority_floor stays 'any', as the old executors filtered nothing), the conversation_state, the reader's channel and depth, and the request units the
 * tree declares in `needs` (from Jev's choice: sides → compare_sides). A one-node graph (no `needs`) keeps the old executor's world: no units are built.
 */
export function entryUnits(g, choice, ctx = {}) {
  // the floor is the turn's only when a layer above the default set it (ctx.scope.sources: unit → layer, turn.js): a religion Jev set for the turn once carried the
  // DEFAULT floor 'interpretation' along with it, and every history/scholarship passage was filtered out (11-10 history_fact: 6 hits → writer passages empty)
  const sc = ctx.scope?.units || {}, floorLayer = ctx.scope?.sources ? ctx.scope.sources.authority_floor : ctx.scope?.source;
  const turnLayer = { ...(sc.religions_specified ? { religions_specified: sc.religions_specified } : {}), ...(sc.reply_language ? { reply_language: sc.reply_language } : {}),
    ...(floorLayer && floorLayer !== 'default' && sc.authority_floor ? { authority_floor: sc.authority_floor } : {}) };
  const ch = ctx.channel?.id ?? ctx.channel ?? null;
  const u = buildUnits({ question: ctx.query ?? ctx.question ?? '', messages: ctx.messages || [], state: ctx.state || emptyState(), turnLayer, profile: ctx.profile || {}, needs: g.needs || [],
    request: { ...(choice?.units || {}), ...(choice?.sides?.length ? { compare_sides: choice.sides } : {}) }, channel: ch, depth: ctx.depth ?? null });
  if (u.authority_floor === 'interpretation' && !turnLayer.authority_floor && (u.scope_sources?.authority_floor ?? 'default') === 'default') u.authority_floor = 'any';   // the registry default is not a filter
  Object.assign(u, g.units || {});   // the tree's own unit defaults (absence_template)
  u.given = ctx.state?.given || [];
  if (g.needs?.includes('scripture_reference')) u.scripture_reference = parseScriptureRef(u.current_user_question);
  if (g.needs?.includes('compare_sides') && !u.compare_sides && Array.isArray(u.religions_specified) && u.religions_specified.length > 1) u.compare_sides = u.religions_specified;
  // the term asked about (term tree): Jev's span kinds see only capitalised names, so a lowercase transliteration ("irfán") never reached the unit and every
  // {{term}} search ran the whole question (round 4). Code resolves it from the question's own marks: quotation marks, then a non-Latin-script run, then the
  // transliterated words (Latin letters with diacritics or ‘ayn/hamza marks); none → the unit stays empty and the slot falls back as before
  if (g.needs?.includes('term') && !String(u.term ?? '').trim()) u.term = termSpan(u.current_user_question) ?? u.term;
  if (g.needs?.includes('quoted_words') && !String(u.quoted_words ?? '').trim()) u.quoted_words = quotedSpan(u.current_user_question) ?? quotedSpan(u.current_user_question, 2) ?? u.quoted_words;   // the reader's own quotation marks
  // tradition first (review rule 1): the side Jev named is the scope over the site default (11-10: "hatred ceases" in the Dhammapada searched with religion Baha'i)
  if (!g.needs?.includes('compare_sides') && choice?.sides?.length && ['site', 'default', undefined].includes(u.scope_sources?.religions_specified)) u.religions_specified = [...choice.sides];
  if (choice?.sources && Object.keys(choice.sources).length) { u.named_sources = Object.values(choice.sources); u.side_sources = choice.sources; }   // side_sources: tradition → the book Jev named for that side
  // Jev says the message takes its subject from the last turn: searches use that topic, never the follow-up's own words (follows_topic), and the anchor loads the last turn's passages
  // …except a new question about the same subject ("How did he die?"): the executor glued it to the last topic (strategies.js) and that is what is searched
  if (choice?.refersBack) { u.refers_back = true; const q = String(ctx.query ?? ''), glued = !choice.aboutReply && u.last_topic && q.includes(String(u.last_topic)) && q.length > String(u.last_topic).length;
    if (u.last_topic) u.follows_topic = (glued ? q : String(u.last_topic)).slice(0, 300); }
  return u;
}
