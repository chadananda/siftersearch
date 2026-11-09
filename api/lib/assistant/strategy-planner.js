// The STRATEGY PLANNER (Chad 11-09). Opus thinks deeply ONCE per challenge type and PLANS a decision tree; the tree is then RUN cheaply:
// a matched turn makes ZERO Opus calls (Jev + code tools + light nodes). abstract -> compare -> plan -> planTests -> validate (kinds, units,
// routes, modes, card, run-path cost, tests). Three loops, named so in code and logs: IMPROVE (efficiency + quality edits to existing trees,
// node level), EXTEND (new strategy types: planned candidate -> node tests -> promotion -> probation), TOOLS (element catalog grows -> re-plan).
// route(turn) is the one entry: conversational | strategy{matched|planned|fallback}. Tools never call an LLM (pure JSON in -> JSON out).
// Deps: strategy-design (prompt v2, parse, validate, opusCall), strategy-planner-repo, strategy-candidates-repo, elements registry, units.
import { createHash } from 'node:crypto';
import { catalog } from '../repos/strategies-repo.js';
import { activities as registry } from './activities/index.js';
import { DESIGN_SYSTEM, DESIGN_ROLE, DESIGN_CALLER, parseCandidate, validateCandidate, nearestStrategies, dedupeTarget, opusCall } from './strategy-design.js';
import { IMPROVE_CFG, jaccardWords } from './strategy-gaps.js';
import { UNITS } from './units.js';
import { isUnmatched } from './strategy-seed.js';
import { GENERAL_RESEARCH } from './strategy-general.js';
import { pinFor, rollback, saveCandidate, promote, logDesign } from '../repos/strategy-candidates-repo.js';
import { savePlan, planFor, planForType, setTests, logPlanner, startProbation, activeProbation, recordProbationRun, finishProbation, allPlans, getMeta, setMeta, queueReplan, activeProbationByName } from '../repos/strategy-planner-repo.js';

export const LOOPS = Object.freeze({ IMPROVE: 'IMPROVE', EXTEND: 'EXTEND', TOOLS: 'TOOLS' });
export { DESIGN_SYSTEM, GENERAL_RESEARCH };
export const MODES = ['voice', 'widget', 'site', 'email', 'pdf'];
export const KINDS = ['decide', 'rank', 'process', 'tool', 'synthesize'];
const DECIDERS = new Set(['decide', 'rank']);   // decide-type: Jev or code picks an edge; node tests cover their edges
export const PLAN_CALLER = 'improve-strategy-design', LIVE_PLAN_CALLER = 'unmatched-design', GATE_CALLER = 'unmatched-gate';
const P = IMPROVE_CFG.planner;
const ENDS = { $absence: 'tool', $fallback: 'synthesize', $unavailable: 'process', $end: null };
const ID = /^[a-z][a-z0-9_]{1,30}$/;
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// ── elements: typed JSON in -> JSON out ──
/** An element's node kind (the planner's tag), from the registry entry. Pure. */
export function kindOfAct(name, a) {
  if (!a || !Array.isArray(a.reads)) return null;   // an opaque executor (strategy.*, respond.*), not an element
  if (name === 'rank') return 'rank';   // re-ranking is its own decide-type node
  if (a.kind === 'decision') return 'decide';
  if (a.kind === 'tool' && a.cls === 'llm') return /^(fallback|end\.fallback)/.test(name) ? 'synthesize' : 'process';
  if (a.kind === 'tool') return 'tool';
  return 'process';
}
/** Tools must be pure and fast: a tool node whose element is not plain code (cls llm) or is marked impure hides LLM work. */
export const impureTool = (a) => a?.kind === 'tool' && (a.cls !== 'code' || a.impure === true);
export const edgesOf = (a, params = {}) => (a?.edgesFor ? a.edgesFor(params) : a?.edges) || [];
export const elementList = (acts = registry()) => Object.entries(acts).filter(([n, a]) => a.scope === 'strategy' && kindOfAct(n, a));
/** The element catalog's VERSION: a hash of the names and signatures. A change queues re-plans (TOOLS loop). */
export const catalogVersion = (acts = registry()) => sha(elementList(acts).map(([n, a]) => `${n}|${[...(a.edges || [])]}|${[...(a.params || [])]}|${[...(a.reads || [])]}|${[...(a.writes || [])]}|${a.kind}|${a.cls}`).sort().join('\n'));
const elementCards = (acts) => elementList(acts).map(([n, a]) => `- ${n} [${kindOfAct(n, a)}${a.cls === 'jev' ? ', Jev' : a.cls === 'llm' ? ', small model' : ''}] in ${JSON.stringify(a.reads)} -> out ${JSON.stringify(a.writes)}; edges ${(a.edges || []).join('|') || '(per params)'}; params ${(a.params || []).filter((p) => p !== 'stage').join(', ') || 'none'}`).join('\n');

// ── cost per run PATH (not per tree) ──
const pathClass = (edges) => (edges.some((e) => /^(error|fail)$/.test(e)) ? 'error' : edges.some((e) => /^(conflict|mismatch|contradicts)$/.test(e)) ? 'conflict'
  : edges.some((e) => /^(none|empty|all_none|\$absence)$/.test(e)) ? 'none' : edges.some((e) => /^(thin|some_thin)$/.test(e)) ? 'thin' : edges.some((e) => /^(several|many|some)$/.test(e)) ? 'several' : 'clean');
/** Every run path of a tree with its class, usd and ms (from the node kinds and config node_cost). kinds: node -> kind. Pure. */
export function pathCosts(graph, kinds, cfg = P) {
  const out = new Map(); for (const e of graph.edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
  const paths = []; let truncated = false;
  const cost = (k) => cfg.node_cost[k] || { usd: 0, ms: 0 };
  const walk = (n, edges, usd, ms) => {
    if (paths.length >= cfg.max_paths) { truncated = true; return; }
    const k = kinds[n], c = cost(k), outs = out.get(n) || [];
    usd += c.usd; ms += c.ms;
    if (!outs.length) { paths.push({ cls: pathClass(edges), usd, ms }); return; }
    for (const e of outs) {
      const taken = [...edges, e.on];
      if (e.to in ENDS) { const ek = ENDS[e.to]; paths.push({ cls: pathClass(e.to === '$absence' ? [...taken, '$absence'] : taken), usd: usd + (ek ? cost(ek).usd : 0), ms: ms + (ek ? cost(ek).ms : 0) }); }
      else walk(e.to, taken, usd, ms);
    }
  };
  walk(graph.entry, [], 0, 0);
  return { paths, truncated };
}
/** Expected (weighted by path_mix over the classes the tree has) and worst path cost. Pure. */
export function expectedCost(paths, mix = P.default_mix) {
  const by = {}; for (const p of paths) (by[p.cls] ||= []).push(p);
  const mean = (xs, f) => xs.reduce((n, x) => n + f(x), 0) / xs.length;
  const w = Object.entries(by).map(([c]) => [c, Number(mix[c]) > 0 ? Number(mix[c]) : 0.01]), tot = w.reduce((n, [, x]) => n + x, 0);
  const exp = (f) => w.reduce((n, [c, x]) => n + (x / tot) * mean(by[c], f), 0);
  return { expected_usd: r4(exp((p) => p.usd)), expected_ms: Math.round(exp((p) => p.ms)), worst_usd: r4(Math.max(...paths.map((p) => p.usd))), worst_ms: Math.max(...paths.map((p) => p.ms)), paths: paths.length };
}

// ── tests: coverage of every decide edge ──
/** The decide nodes of a plan with their edges: [{ node, element, edges }]. */
export function decideNodes(plan, acts = registry()) {
  return Object.entries(plan.graph?.nodes || {}).filter(([, n]) => DECIDERS.has(n.kind)).map(([node, n]) => ({ node, element: n.element, edges: edgesOf(acts[n.element], n.params || {}) }));
}
/** "node.edge" pairs with fewer than node_min_tests_per_edge tests. */
export function testGaps(plan, tests, acts = registry(), min = P.node_min_tests_per_edge) {
  const have = {}; for (const t of tests?.nodes || []) { const k = `${t.node}.${t.edge}`; have[k] = (have[k] || 0) + 1; }
  return decideNodes(plan, acts).flatMap((d) => d.edges.filter((e) => (have[`${d.node}.${e}`] || 0) < min).map((e) => `${d.node}.${e}`));
}

// ── validate: a v2 plan -> v1 candidate (validateCandidate) + the planner's own rules ──
/** Nodes on a cycle (a self-loop or a strongly connected group). Pure. */
export function cycleNodes(edges) {
  const out = new Map(); for (const e of edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e.to); }
  const reach = (a, b, seen = new Set()) => { for (const n of out.get(a) || []) { if (n === b) return true; if (!seen.has(n) && out.has(n)) { seen.add(n); if (reach(n, b, seen)) return true; } } return false; };
  return [...out.keys()].filter((n) => reach(n, n));
}
const hasModes = (t) => MODES.every((m) => String(t || '').toLowerCase().includes(m));
/** Validate a parsed v2 plan. → { ok, errors, normalized?, plan?, cost? }. normalized = what saveCandidate stores (node extras re-attached). */
export function validatePlan(j, { cat, acts = registry(), tests = null, requireTests = false, pending = [] } = {}) {
  if (!j || typeof j !== 'object') return { ok: false, errors: ['not a JSON object'] };
  const errors = [], name = String(j.name || ''), g = j.graph && typeof j.graph === 'object' ? j.graph : {}, nodesIn = g.nodes && typeof g.nodes === 'object' ? g.nodes : {};
  const steps = [], nodes = {}, kinds = {}, activeNames = new Set(cat.strategies.filter((s) => !isUnmatched(s.name)).map((s) => s.name));
  for (const [nid, n] of Object.entries(nodesIn)) {
    const a = acts[n?.element];
    if (!ID.test(nid)) { errors.push(`node id "${nid}" must be snake_case`); continue; }
    if (!a || a.scope !== 'strategy') { errors.push(`node ${nid}: unknown element ${n?.element}`); continue; }
    const k = kindOfAct(n.element, a);
    if (!k) { errors.push(`node ${nid}: ${n.element} is an opaque executor, not an element`); continue; }
    if (!KINDS.includes(n.kind)) errors.push(`node ${nid}: kind must be one of ${KINDS.join('|')}`);
    else if (n.kind !== k) errors.push(`node ${nid}: ${n.element} is a ${k} node, not ${n.kind}`);
    if (n.kind === 'tool' && impureTool(a)) errors.push(`node ${nid}: tools never call an LLM (${n.element} is not a pure tool)`);
    for (const f of ['reads', 'writes']) if (n[f] !== undefined && !Array.isArray(n[f])) errors.push(`node ${nid}: ${f} must be a list of unit names`);
    kinds[nid] = k; steps.push({ id: `${name}.${nid}`, activity: n.element, params: n.params && typeof n.params === 'object' ? n.params : {} }); nodes[nid] = { step: `${name}.${nid}` };
  }
  const written = new Set(Object.values(nodesIn).flatMap((n) => (Array.isArray(n?.writes) ? n.writes : [])));
  for (const [nid, n] of Object.entries(nodesIn)) for (const u of [...(n?.reads || []), ...(n?.writes || [])]) if (!(u in UNITS) && !written.has(u)) errors.push(`node ${nid}: unit "${u}" is not declared (not a registry unit, written by no node)`);
  for (const nd of Array.isArray(j.needs) ? j.needs : []) if (!(nd?.unit in UNITS)) errors.push(`needs: unit "${nd?.unit}" is not in the unit registry`);
  const edges = (Array.isArray(g.edges) ? g.edges : []).map((e) => ({ from: String(e?.from), on: String(e?.on), to: String(e?.to) }));
  for (const e of edges) {
    if (kinds[e.to] === 'synthesize' && !DECIDERS.has(kinds[e.from])) errors.push(`edge ${e.from}.${e.on} -> ${e.to}: a synthesize node is reachable only behind a decide ("needed?") node`);
    if (/^(error|fail)$/.test(e.on) && e.to === '$absence') errors.push(`edge ${e.from}.${e.on}: an error is not an absence (route to $unavailable or $fallback)`);
  }
  // tools over decisions (Chad 11-09): no decide/process inside a loop (a cycle, or a hand.strategy fan-out per item/side/tier); dedup is never a node
  const loopNodes = cycleNodes(edges), wish = 'plan it without the loop and record a wish for the merged tool (e.g. compare_search{sides[]}, fused_search, quotation_candidates)';
  for (const nid of loopNodes) if (kinds[nid] === 'decide' || kinds[nid] === 'process' || kinds[nid] === 'rank') errors.push(`node ${nid}: a ${kinds[nid]} node inside a loop; ${wish}`);
  const hands = Object.entries(nodesIn).filter(([, n]) => n?.element === 'hand.strategy');
  for (const [nid, n] of hands) if (hands.length > 1 || n.params?.units || n.params?.each || n.params?.per) errors.push(`node ${nid}: hand.strategy fan-out per item/side/tier runs decide/process nodes in a loop; ${wish}`);
  for (const [nid, n] of Object.entries(nodesIn)) if (/dedup/i.test(String(n?.element)) || n?.params?.dedupe) errors.push(`node ${nid}: dedup is never a tree node (tools return deduped results)`);
  if (kinds[g.entry] === 'synthesize') errors.push('the entry node cannot be a synthesize node');
  // the card
  const misses = Array.isArray(j.near_misses) ? j.near_misses : [];
  if (misses.length < 3) errors.push('card: at least 3 near_misses');
  for (const m of misses) if (!String(m?.text || '').trim() || !(activeNames.has(m?.goes_to) || m?.goes_to === 'unmatched' || pending.some((p) => p.name === m?.goes_to))) errors.push(`card: near_miss ${JSON.stringify(String(m?.text || '').slice(0, 40))} must go_to an existing strategy or "unmatched"`);
  // shape nodes: templates exist and cover every mode
  const tplNew = new Map((Array.isArray(j.templates) ? j.templates : []).map((t) => [t?.id, t]));
  const shapes = Object.entries(nodesIn).filter(([, n]) => n?.element === 'shape');
  if (!shapes.length) errors.push('no shape node: the tree must end by shaping the answer');
  for (const [nid, n] of shapes) {
    const ids = [n.params?.template, ...Object.values(n.params?.by_count || {})].filter((x) => x && x !== '@sub');
    if (!ids.length) errors.push(`node ${nid}: a shape node needs params.template`);
    for (const id of ids) { const t = tplNew.get(id) || cat.templates.latest.get(id); if (!t) errors.push(`node ${nid}: template ${id} does not exist`); else if (!hasModes(t.text)) errors.push(`template ${id}: needs a block for each mode (${MODES.join(', ')})`); }
  }
  if (!['lookup', 'answer', 'research'].includes(j.budget_class)) errors.push('budget_class must be lookup|answer|research');
  // v1 structure (steps/templates new, params known, every edge routed, acyclic, reachable, node cap)
  const v1 = validateCandidate({ name, description: j.description, exemplars: j.exemplars, templates: j.templates, steps, graph: { entry: g.entry, nodes, edges } }, { cat, acts });
  errors.push(...(v1.errors || []));
  let cost = null;
  if (!errors.length) {
    const { paths, truncated } = pathCosts({ entry: g.entry, edges }, kinds);
    if (truncated) errors.push(`the tree has more than ${P.max_paths} run paths`);
    else {
      cost = expectedCost(paths, { ...P.default_mix, ...(j.path_mix || {}) });
      const b = P.budgets[j.budget_class];
      for (const k of ['expected_usd', 'worst_usd', 'expected_ms', 'worst_ms']) if (b && cost[k] > b[k]) errors.push(`run cost: ${k} ${cost[k]} is over the ${j.budget_class} budget ${b[k]} (prefer decide/tool nodes; a small-model node only where code cannot do it; synthesize only behind "needed?")`);
    }
  }
  if (tests || requireTests) { const gaps = testGaps({ graph: { nodes: nodesIn } }, tests, acts); if (gaps.length) errors.push(`tests: no test for ${gaps.slice(0, 8).join(', ')}${gaps.length > 8 ? ` (+${gaps.length - 8})` : ''}`); }
  if (errors.length || !v1.ok) return { ok: false, errors };
  // the units the tree runs on (graph.needs): declared needs + every registry unit a node reads; entryUnits (graph.js) builds them at run time, so a planned tree has s.units/s.question like the seeded trees
  const needs = [...new Set([...(Array.isArray(j.needs) ? j.needs.map((x) => x?.unit) : []), ...Object.values(nodesIn).flatMap((n) => n?.reads || [])].filter((u) => u in UNITS && !written.has(u)))];
  const strategy = { ...v1.normalized.strategy, graph: { ...v1.normalized.strategy.graph, ...(needs.length ? { needs } : {}), nodes: Object.fromEntries(Object.entries(v1.normalized.strategy.graph.nodes).map(([nid, n]) => [nid,
    { ...n, element: nodesIn[nid].element, kind: nodesIn[nid].kind, reads: nodesIn[nid].reads || [], writes: nodesIn[nid].writes || [] }])) } };
  const wishes = (Array.isArray(j.wishes) ? j.wishes : []).filter((w) => w?.element && !acts[w.element]).map((w) => ({ element: String(w.element), inputs: w.inputs ?? null, outputs: w.outputs ?? null, replaces: w.replaces ?? null, saves: w.saves ?? null }));
  return { ok: true, errors: [], normalized: { ...v1.normalized, strategy }, plan: { ...j, wishes }, cost, wishes };
}

// ── the Opus stages (each: one call, parsed, never throws on a bad answer; a spend cap propagates) ──
const str = (x, n = 600) => String(x ?? '').slice(0, n);
const cards = (cat, pending = []) => [...cat.strategies.filter((s) => s.description && !isUnmatched(s.name)).map((s) => `- ${s.name}: ${s.description}`), ...pending.map((c) => `- ${c.name} (pending): ${c.description}`)].join('\n');
export const typeKeyOf = (t) => (ID.test(String(t?.key || '')) ? t.key : `t_${sha(String(t?.task || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter((w) => w.length > 3).sort().join(' '))}`);

export const ABSTRACT_SYSTEM = `You abstract a reader's CHALLENGE into a challenge TYPE for Anís, a research assistant over a Bahá'í and interfaith library.
The type names what the reader wants DONE, free of the tradition, topic, length and wording of this one question. Use the turn's units, the conversation state and the reader card as context. Judge meaning; never match words.
Answer with ONE JSON object: {"key":"snake_case_slug","task":"one sentence","inputs":["unit names it needs"],"output":"the shape of a good answer","modes":{"voice":"...","widget":"...","site":"...","email":"...","pdf":"..."}}`;
/** challenge (a question or several) + context ({ units, conversation_state, reader }) -> the type. */
export async function abstractChallenge(challenge, context = {}, { call = opusCall, caller = PLAN_CALLER, maxTokens = P.abstract_max_tokens } = {}) {
  const r = await call(DESIGN_ROLE, ABSTRACT_SYSTEM, `CHALLENGE:\n${[].concat(challenge).map((q) => `- ${str(q)}`).join('\n')}\n\nCONTEXT:\n${str(JSON.stringify(context), 3000)}\nUNITS: ${Object.keys(UNITS).join(', ')}`, maxTokens, caller);
  const j = parseCandidate(r.text);
  return { type: j && typeof j.task === 'string' ? { ...j, key: typeKeyOf(j) } : null, usd: r.usd || 0 };
}

export const COMPARE_SYSTEM = `You compare a challenge TYPE with the strategies Anís already has (their cards). Decide by what the reader wants DONE, never by shared words.
duplicate: an existing strategy already serves this type (name it in "of"). setting_of: the same task with another topic, tradition, length, tone, format or source: name it in "of" and give "sets", a patch of units/scope that makes it fit. new: a task Jev can tell apart from every card: give "difference", one sentence. When in doubt between new and setting_of choose setting_of.
Answer with ONE JSON object: {"verdict":"new|setting_of|duplicate","of":"<strategy name>|null","sets":{},"difference":"..."}`;
/** type + cards -> { verdict: 'new'|'setting_of'|'duplicate', of, sets, difference, nearest: [names] }. A 'new' with no difference, or one a card already covers, is coerced to duplicate. */
export async function compareType(type, { cat, pending = [], call = opusCall, caller = PLAN_CALLER, maxTokens = P.compare_max_tokens } = {}) {
  const near = nearestStrategies({ label: type.key || '', questions: [type.task, type.output || ''] }, cat);
  const r = await call(DESIGN_ROLE, COMPARE_SYSTEM, `TYPE: ${JSON.stringify(type)}\n\nCARDS:\n${cards(cat, pending)}\n\nNEAREST BY WORDS (a hint only): ${near.map((s) => s.name).join(', ')}`, maxTokens, caller);
  const j = parseCandidate(r.text) || {}, names = new Set([...cat.strategies.filter((s) => !isUnmatched(s.name)).map((s) => s.name), ...pending.map((p) => p.name)]);
  let verdict = ['new', 'setting_of', 'duplicate'].includes(j.verdict) ? j.verdict : 'new', of = names.has(j.of) ? j.of : null;
  if (verdict !== 'new' && !of) verdict = 'new';
  if (verdict === 'new') {
    const hit = dedupeTarget({ strategy: { name: type.key, description: `${type.task} ${type.output || ''}` } }, { cat, pending }).dedupe;
    if (!String(j.difference || '').trim() || hit) { verdict = 'duplicate'; of = hit?.name ?? near[0]?.name ?? of; }
  }
  return { verdict, of, sets: j.sets && typeof j.sets === 'object' ? j.sets : {}, difference: str(j.difference, 300), nearest: near.map((s) => s.name), usd: r.usd || 0 };
}

export const planMessage = ({ type = null, challenge = null, cat, pending = [], acts = registry(), errors = null }) => [
  'ELEMENTS (typed JSON in -> JSON out; tools are pure code, small-model and Jev work happens only in decide/process/synthesize nodes):', elementCards(acts),
  '', `UNITS: ${Object.keys(UNITS).join(', ')}`, '', 'TEMPLATE IDS THAT EXIST (reuse by id, or write new ids): ' + [...cat.templates.latest.keys()].slice(0, 80).join(', '),
  '', 'CARDS (existing strategies):', cards(cat, pending),
  '', `RUN-PATH BUDGETS (code checks every path): ${JSON.stringify(P.budgets)}; node costs ${JSON.stringify(P.node_cost)}; default path_mix ${JSON.stringify(P.default_mix)}`,
  type ? `\nCHALLENGE TYPE (already abstracted; plan this):\n${JSON.stringify(type)}` : `\nCHALLENGE:\n${[].concat(challenge).map((q) => `- ${str(q)}`).join('\n')}\n(Abstract it first, compare with the cards, then plan.)`,
  ...(errors?.length ? ['', 'YOUR PREVIOUS ANSWER WAS INVALID - fix these and answer again:', ...errors.map((e) => `- ${e}`)] : [])].join('\n');

/**
 * Plan a candidate for a challenge. mode 'fast' (run time, one Opus call: abstract + compare + plan) or 'full' (design time: abstract, compare, plan, tests).
 * -> { ok:true, normalized, dedupe, plan, tests, type, usd, attempts } | { ok:false, settingOf, sets, verdict, ... } (a duplicate / setting of a card: design nothing)
 *  | { ok:false, errors }. A bad answer is one retry with the errors; a spend cap propagates.
 */
export async function planCandidate(challenge, { context = {}, cat = catalog(), acts = registry(), call = opusCall, pending = [], mode = 'full', caller = PLAN_CALLER, maxTokens = null, db = null } = {}) {
  let usd = 0, type = null, errors = null, attempts = 0;
  if (mode === 'full') {
    const a = await abstractChallenge(challenge, context, { call, caller }); usd += a.usd; type = a.type;
    if (!type) return { ok: false, errors: ['the challenge could not be abstracted into a type'], attempts: 1, usd };
    const prior = db ? planForType(db, type.key) : null;   // already planned (pending or live): that card serves it
    const c = await compareType(type, { cat, pending, call, caller }); usd += c.usd;
    if (c.verdict !== 'new') return { ok: false, settingOf: c.of, sets: c.sets, verdict: c.verdict, type, nearest: c.nearest, why: c.difference, errors: [], attempts: 1, usd, prior: prior?.id ?? null };
    type = { ...type, difference: c.difference };
  }
  for (; attempts < 2;) {
    attempts++;
    const r = await call(DESIGN_ROLE, DESIGN_SYSTEM, planMessage({ type, challenge, cat, pending, acts, errors }), maxTokens ?? (mode === 'fast' ? P.fast_max_tokens : P.max_tokens), caller);
    usd += r.usd || 0;
    const j = parseCandidate(r.text);
    if (j && ['setting_of', 'duplicate'].includes(j.verdict)) {
      const names = new Set([...cat.strategies.filter((s) => !isUnmatched(s.name)).map((s) => s.name), ...pending.map((p) => p.name)]);
      if (names.has(j.of)) return { ok: false, settingOf: j.of, sets: j.sets && typeof j.sets === 'object' ? j.sets : {}, verdict: j.verdict, type: j.type ?? type, why: str(j.why, 300), errors: [], attempts, usd };
      errors = [`"of" must name an existing strategy for a ${j.verdict}, or the verdict is new`]; continue;
    }
    if (j && !String(j.difference || '').trim()) { errors = ['difference: one sentence saying what this does that the cards do not (or the verdict is setting_of/duplicate)']; continue; }
    const v = validatePlan(j, { cat, acts, pending });
    if (!v.ok) { errors = v.errors; continue; }
    const t = type || j.type || null, d = dedupeTarget(v.normalized, { cat, pending });
    let tests = null;
    if (mode === 'full') { const pt = await planTests(v.plan, { acts, call, caller }); usd += pt.usd; tests = pt.tests; if (!tests) { errors = pt.errors; continue; } }
    return { ok: true, ...d, plan: { ...v.plan, type: t, cost: v.cost, typeKey: typeKeyOf(t || { task: j.description }) }, tests, type: t, usd, attempts };
  }
  return { ok: false, errors, attempts, usd };
}

export const TESTS_SYSTEM = `You write the TESTS of a planned strategy tree. For EVERY decide node and EVERY one of its edges write at least one test: the input units that node reads (realistic values; found_passages as a short list of {title,text,authority}) and the edge it must take, with a why. Also write whole-strategy class questions (8, varied, realistic, never tied to one tradition) and 4 guard questions that look alike but belong to another card ("goes_to").
Answer with ONE JSON object: {"nodes":[{"node":"","edge":"","input":{},"why":""}],"class":["..."],"guard":[{"question":"","goes_to":"<strategy>"}]}`;
/** plan -> { tests: { nodes, class, guard }, usd } | { tests: null, errors }. One retry naming the uncovered node.edge pairs. */
export async function planTests(plan, { acts = registry(), call = opusCall, caller = PLAN_CALLER, maxTokens = P.tests_max_tokens } = {}) {
  const dn = decideNodes(plan, acts); let usd = 0, gaps = null, last = null;
  for (let i = 0; i < 2; i++) {
    const user = `STRATEGY ${plan.name}: ${plan.description}\nDECIDE NODES:\n${dn.map((d) => `- ${d.node} (${d.element}) params ${JSON.stringify(plan.graph.nodes[d.node].params || {})} reads ${JSON.stringify(plan.graph.nodes[d.node].reads || [])} edges ${d.edges.join('|')}`).join('\n') || '(none)'}${gaps ? `\n\nYOU MISSED: ${gaps.join(', ')}. Answer again with ALL tests.` : ''}`;
    const r = await call(DESIGN_ROLE, TESTS_SYSTEM, user, maxTokens, caller); usd += r.usd || 0;
    const j = parseCandidate(r.text);
    last = j ? { nodes: (Array.isArray(j.nodes) ? j.nodes : []).filter((t) => t?.node && t?.edge).map((t) => ({ node: String(t.node), edge: String(t.edge), input: t.input && typeof t.input === 'object' ? t.input : {}, why: str(t.why, 200), ...(t.fixture ? { fixture: t.fixture } : {}) })),
      class: (Array.isArray(j.class) ? j.class : []).map((q) => str(q, 400)).filter(Boolean), guard: (Array.isArray(j.guard) ? j.guard : []).filter((g) => g?.question && g?.goes_to).map((g) => ({ question: str(g.question, 400), goes_to: String(g.goes_to) })) } : null;
    gaps = last ? testGaps(plan, last, acts) : ['(unparseable)'];
    if (last && !gaps.length) return { tests: last, usd };
  }
  return { tests: null, errors: [`tests: no test for ${gaps.slice(0, 8).join(', ')}`], usd };
}

// ── the Unmatched GATE: the first node of the Unmatched path, one Jev decide (option text = stored templates, tuned like any decide node) ──
export const gateOptions = (cat = catalog()) => ({ question: cat.templates.latest.get('unmatched.gate.question')?.text, options: { research: cat.templates.latest.get('unmatched.gate.research')?.text, conversational: cat.templates.latest.get('unmatched.gate.conversational')?.text } });
async function liveGate({ question, options, state }) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  const [{ ENDPOINT }, { modelFor }, { jevCall, JEV_LIMITS }, { jevFetch }] = await Promise.all([import('../scope-extract.js'), import('../model-roles.js'), import('./jev-call.js'), import('../systemone.js')]);
  const res = await jevCall('lookup', async (signal) => {
    const r = await jevFetch('anis-unmatched-gate')(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state, questions: { pick: { type: 'choice', instructions: question, criteria: options } }, caller: GATE_CALLER }), signal });
    return r.ok ? (await r.json()).answers?.pick ?? null : null;
  }, JEV_LIMITS.lookup);
  const a = res.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null } : null;
}
/** 'research' | 'conversational'. No Jev answer fails open to research (the reader asked; the planner is bounded). */
export async function gateTurn({ messages = [], question = '' }, { cat = catalog(), jev = liveGate } = {}) {
  const { question: q, options } = gateOptions(cat);
  const state = messages.slice(-4).map((m) => `${m.role}: ${str(m.content, 600)}`).join('\n') || `user: ${question}`;
  const r = await Promise.resolve(jev({ question: q, options, state })).catch(() => null);
  return r?.choice === 'conversational' ? 'conversational' : 'research';
}

// ── route(turn): the one entry ──
/** Jev's matched strategy as a route record, or null (Unmatched). Pure: no call of any kind. */
export function matchRoute(turn, cat = null) {
  const c = turn?.strategy?.choice ?? turn?.strategy?.strategy?.choice ?? null;
  if (!c || isUnmatched({ strategy: { choice: c } })) return null;
  let row = null; try { row = (cat || catalog()).strategies.find((s) => s.name === c) ?? null; } catch { /* no store: the name stands */ }
  return { kind: 'strategy', name: c, version: row?.version ?? null, source: 'matched', gate: null };
}
/**
 * turn: { question, messages, strategy: Jev's choice }. io: { cat, gate, reuse(turn) -> {name,version,pin}|null, plan(turn) -> planUnmatched result, record(rec), log(db row) }.
 * -> { kind:'conversational', gate } | { kind:'strategy', name, version, source:'matched'|'planned'|'fallback', gate, ... }. A matched turn makes no Opus call and no gate call.
 * The fallback is the stored tree general_research; reaching it is a DEFECT against the planner (logged).
 */
export async function route(turn, io = {}) {
  const cat = io.cat || catalog(), rec = (r) => { try { io.record?.(r); } catch { /* a log never fails a turn */ } return r; };
  const m = matchRoute(turn, cat);
  if (m) return rec(m);
  const gate = await (io.gate || gateTurn)(turn, { cat });
  if (gate === 'conversational') return rec({ kind: 'conversational', gate });
  const reused = await Promise.resolve(io.reuse?.(turn)).catch(() => null);
  if (reused?.name) return rec({ kind: 'strategy', name: reused.name, version: reused.version, source: 'matched', gate, via: 'recheck', ...(reused.pin ? { pin: reused.pin } : {}) });
  const p = await Promise.resolve((io.plan || (() => ({ ok: false, errors: ['no planner'] })))(turn)).catch((err) => ({ ok: false, errors: [String(err?.message || err)] }));
  if (p?.ok) return rec({ kind: 'strategy', name: p.name, version: p.version, source: 'planned', gate, ...(p.sets ? { sets: p.sets } : {}), ...(p.pin ? { pin: p.pin } : {}), ...(p.saved ? { saved: p.saved } : {}) });
  const g = cat.strategies.find((s) => s.name === GENERAL_RESEARCH);
  io.defect?.(`planner failed: ${p?.errors?.[0] || 'no valid plan'}`);
  return rec({ kind: 'strategy', name: GENERAL_RESEARCH, version: g?.version ?? 1, source: 'fallback', gate, defect: `planner failed: ${str(p?.errors?.[0] || 'no valid plan', 160)}` });
}

const race = (p, ms) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error('planner timeout')), ms); t.unref?.(); })]).finally(() => clearTimeout(t)); };
/** Run-time FAST planning for an Unmatched research turn (EXTEND loop): one Opus call, saved as a candidate (source 'unmatched'). A setting_of / duplicate runs the existing strategy
 *  with its sets. -> { ok:true, name, version, source:'planned', pin?, sets?, saved? } | { ok:false, errors } */
export async function planUnmatched({ question, messages = [], context = {} }, { db, cat = catalog(), call = opusCall, acts = registry(), caller = LIVE_PLAN_CALLER, listCandidates }) {
  const pending = listCandidates(db);
  const d = await race(planCandidate([...messages.slice(-3).filter((m) => m.role === 'user').map((m) => m.content), question].filter(Boolean).slice(-3), { context, cat, pending, call, acts, mode: 'fast', caller, db }), P.fast_timeout_ms);
  if (!d.ok && d.settingOf) {
    const row = cat.strategies.find((s) => s.name === d.settingOf) || pending.find((p) => p.name === d.settingOf);
    logPlanner(db, { kind: d.verdict || 'setting_of', loop: LOOPS.EXTEND, type_key: d.type ? typeKeyOf(d.type) : null, strategy_id: row?.id ?? d.settingOf, usd: d.usd, note: d.why });
    return { ok: true, name: row?.name ?? d.settingOf, version: row?.version ?? 1, source: 'planned', sets: d.sets || {}, usd: d.usd };
  }
  if (!d.ok) { logDesign(db, { cluster_key: `unmatched#${sha(question)}`, label: 'unmatched', status: 'dropped', attempts: d.attempts, usd: d.usd, errors: d.errors }); return { ok: false, errors: d.errors, usd: d.usd }; }
  const typeKey = d.plan.typeKey, before = planForType(db, typeKey);
  const saved = saveCandidate(db, d.normalized, { by: 'unmatched-live' });
  savePlan(db, saved.id, saved.version, { typeKey, plan: d.plan, tests: d.tests, wishes: d.plan.wishes, source: 'unmatched' });
  logPlanner(db, { kind: 'plan', loop: LOOPS.EXTEND, type_key: typeKey, strategy_id: saved.id, version: saved.version, usd: d.usd });
  if (before) logPlanner(db, { kind: 'defect', loop: LOOPS.EXTEND, type_key: typeKey, strategy_id: saved.id, version: saved.version, note: `a second plan for the type ${typeKey} (first: ${before.id}@${before.version}): it should have matched` });
  logDesign(db, { cluster_key: `unmatched#${sha(question)}`, label: 'unmatched', status: d.dedupe ? 'version' : 'new', strategy_id: saved.id, version: saved.version, attempts: d.attempts, usd: d.usd });
  return { ok: true, name: saved.id, version: saved.version, source: 'planned', pin: pinFor(db, saved.id, saved.version), saved: { ...saved, dedupe: d.dedupe }, usd: d.usd };
}
/** After a planned tree RAN for a turn: it joins Jev's cards at once, on probation (a version of an existing strategy waits for promotion instead). */
export function activateProvisional(db, saved) {
  if (!saved || saved.dedupe) return false;
  promote(db, saved.id, saved.version, { by: 'unmatched-provisional', decision: { provisional: true } });
  startProbation(db, saved.id, saved.version, { need: P.probation.runs, provisional: true });
  return true;
}
/** The general_research fallback was used: a defect against the planner. */
export const logFallbackDefect = (db, { question, why }) => logPlanner(db, { kind: 'defect', loop: LOOPS.EXTEND, strategy_id: GENERAL_RESEARCH, note: `fallback used (${str(why, 200)})` });

// ── node tests: every decide edge. Live runner replays Jev decide nodes (and tool nodes against fixtures) on the tree's own steps ──
/** tests.nodes run against pin (pinFor). io: { jev(q) -> {choice}, tools: {name: fn}, acts }. → { nodes: {node: {pass, total, rate}}, failed: [{node, edge, got}], rate }. A test that cannot run counts as failed. */
export async function runNodeTests(tests, pin, io = {}) {
  const acts = io.acts || registry(), nodes = {}, failed = [];
  for (const t of tests?.nodes || []) {
    const n = pin?.row?.graph?.nodes?.[t.node], step = n && pin.steps.get(`${n.step}@${n.step_version}`), act = step && acts[step.activity];
    const slot = (nodes[t.node] ||= { pass: 0, total: 0, rate: 0 });
    slot.total++;
    let got = null;
    try {
      if (act && !(act.kind === 'tool' && !t.fixture && !io.tools?.[step.activity])) {
        const r = await act.run({ units: { ...(t.fixture || {}), ...(t.input || {}) }, node: t.node, jev: io.jev, tools: io.tools || {}, templates: pin.templatesLatest, messages: [] }, step.params || {});
        got = typeof r === 'string' ? r : r?.edge ?? r?.on ?? null;
      }
    } catch { got = null; }
    if (got === t.edge) slot.pass++; else failed.push({ node: t.node, edge: t.edge, got });
  }
  let pass = 0, total = 0;
  for (const s of Object.values(nodes)) { s.rate = s.total ? r4(s.pass / s.total) : 0; pass += s.pass; total += s.total; }
  return { nodes, failed, rate: total ? r4(pass / total) : null };
}
/** Decide nodes under the bar -> [{node, rate, bar}] (the promotion rejection names the first). */
export const weakDecideNodes = (res, bar = P.node_pass_bar) => Object.entries(res?.nodes || {}).filter(([, s]) => s.rate < bar).map(([node, s]) => ({ node, rate: s.rate, bar }));

// ── probation: first N runs, every run judged, per-node stats, auto-rollback, weak nodes feed IMPROVE ──
/** Judge score (0-10) of a run of strategy `name`. nodes: [{node, edge, ms}]. io: { baseline?, suggest(item), now } -> { state:'none'|'probation'|'cleared'|'rolled_back', node?, ... }. No human gate. */
export function observeProbation(db, { name, score = null, ms = 0, usd = 0, nodes = [] }, io = {}) {
  const pr = activeProbationByName(db, name);
  if (!pr) return { state: 'none' };
  const cfg = P.probation, now = recordProbationRun(db, pr.id, pr.version, { score, ms, usd, nodes: nodes.map((n) => ({ node: n.node, edge: n.edge, ok: n.edge !== 'error' })) });
  const base = now.baseline ?? io.baseline ?? null, minScored = cfg.min_scored ?? 5;
  const badNode = Object.entries(now.nodes).find(([, s]) => s.runs >= cfg.node_min_runs && s.ok / s.runs < cfg.node_floor)?.[0] ?? null;
  const worst = Object.entries(now.nodes).filter(([, s]) => s.runs >= 1).sort((a, b) => a[1].ok / a[1].runs - b[1].ok / b[1].runs)[0]?.[0] ?? null;
  const regressed = now.scored >= minScored && now.mean != null && (base != null ? now.mean < base - cfg.regress : now.mean < (cfg.floor ?? 5));
  if (regressed || badNode) {
    const node = badNode || worst, why = badNode ? `node ${badNode} failed ${Object.values({ x: now.nodes[badNode] }).map((s) => `${s.runs - s.ok}/${s.runs}`)[0]}` : `mean ${r4(now.mean)} < ${base != null ? `baseline ${base} - ${cfg.regress}` : `floor ${cfg.floor ?? 5}`}`;
    let restored = null; try { restored = rollback(db, pr.id, { by: 'probation' }).restored ?? null; } catch { /* nothing to roll back to is still a rollback of this one */ }
    finishProbation(db, pr.id, pr.version, { phase: 'rolled_back', note: `${why}; failing node ${node ?? '(none)'}` });
    logPlanner(db, { kind: 'rollback', loop: LOOPS.IMPROVE, strategy_id: pr.id, version: pr.version, note: `${why}; failing node ${node ?? '(none)'}` });
    return { state: 'rolled_back', node, why, restored, id: pr.id, version: pr.version };
  }
  // weak nodes feed IMPROVE (an improvements row for editStage), never a gate
  for (const [node, s] of Object.entries(now.nodes)) if (s.runs >= cfg.weak_node_runs && s.ok / s.runs < cfg.weak_below)
    io.suggest?.({ stage: 'strategy', file: null, fn: node, target: 'strategy', strategy: name, change: `Strategy ${name}: node ${node} ok in ${s.ok}/${s.runs} probation runs; revise its option/params text`, expected_effect: 'node ok-rate above the bar', severity: 2, classes: [], evidence: [{ loop: LOOPS.IMPROVE, node, runs: s.runs, ok: s.ok }] });
  if (now.runs >= now.need) { finishProbation(db, pr.id, pr.version, { phase: 'cleared', note: `${now.runs} clean runs, mean ${now.mean == null ? 'n/a' : r4(now.mean)}` }); logPlanner(db, { kind: 'cleared', loop: LOOPS.EXTEND, strategy_id: pr.id, version: pr.version }); return { state: 'cleared', id: pr.id, version: pr.version }; }
  return { state: 'probation', runs: now.runs, need: now.need };
}
/** Branches that never ran in a probation (after weak_node_runs runs): IMPROVE can prune them. → [{node, edge}] */
export const deadEdges = (plan, pr, acts = registry()) => (pr?.runs ?? 0) < P.probation.weak_node_runs ? [] : decideNodes(plan, acts).flatMap((d) => d.edges.filter((e) => !(pr.nodes?.[d.node]?.edges?.[e])).map((e) => ({ node: d.node, edge: e })));
/** Probation status for the strategy row / admin: { phase, runs, need, mean, baseline, usd, ms, nodes } or null. */
export const probationStatus = (db, id, version) => { const p = activeProbation(db, id); return p && (version == null || p.version === version) ? p : null; };

// ── TOOLS loop: wishes -> wishlist -> catalog change -> re-plan ──
const addNum = (acc, v) => { if (typeof v === 'number') return (acc ?? 0) + v; if (v && typeof v === 'object') { const o = { ...(acc || {}) }; for (const [k, x] of Object.entries(v)) if (typeof x === 'number') o[k] = (o[k] ?? 0) + x; return o; } return acc; };
/** Wished-for elements across all stored plans: [{ element, count, strategies, inputs, outputs, replaces, saves }], most wished first. */
export function toolWishlist(db) {
  const by = new Map();
  for (const pl of allPlans(db)) for (const w of pl.wishes || []) {
    const x = by.get(w.element) || { element: w.element, count: 0, strategies: [], inputs: w.inputs, outputs: w.outputs, replaces: w.replaces, saves: null };
    x.count++; if (!x.strategies.includes(pl.id)) x.strategies.push(pl.id); x.saves = addNum(x.saves, w.saves); by.set(w.element, x);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.element.localeCompare(b.element));
}
/** Gherkin code recommendations for the improve digest (loop TOOLS). Text only; nothing waits on a human. */
export const wishlistGherkin = (list) => list.map((w) => `Feature: tool ${w.element} (loop ${LOOPS.TOOLS}, wished ${w.count}x)
  Scenario: strategies ${w.strategies.join(', ')} would use ${w.element}
    Given the element catalog has no "${w.element}"
    When a tree needs ${w.replaces ? JSON.stringify(w.replaces) : 'it'} with inputs ${JSON.stringify(w.inputs ?? null)}
    Then add a pure JSON tool "${w.element}" returning ${JSON.stringify(w.outputs ?? null)} with no LLM call
    And IMPROVE re-plans the wishing strategies, promoted only if simpler/cheaper/faster at equal or better quality (summed saves ${JSON.stringify(w.saves)})`).join('\n\n');
/** Compare the catalog version with the stored one; on a change queue a re-plan for every strategy that wished for an element that now exists. → { changed, version, queued: [id] } */
export function checkCatalog(db, acts = registry()) {
  const version = catalogVersion(acts), prev = getMeta(db, 'catalog_version');
  if (prev === version) return { changed: false, version, queued: [] };
  setMeta(db, 'catalog_version', version);
  if (!prev) return { changed: false, version, queued: [] };
  const queued = [];
  for (const pl of allPlans(db)) {
    const hit = (pl.wishes || []).find((w) => acts[w.element]);
    if (hit && queueReplan(db, { strategy_id: pl.id, element: hit.element, catalog_version: version })) { queued.push(pl.id); logPlanner(db, { kind: 'replan', loop: LOOPS.TOOLS, strategy_id: pl.id, version: pl.version, note: `catalog ${prev} -> ${version}: ${hit.element} now exists` }); }
  }
  return { changed: true, version, queued };
}
/** A re-planned candidate replaces the active tree only when cheaper/faster at equal-or-better quality. Pure. */
export const replanWins = (old, next, { quality: [q0, q1] = [null, null] } = {}) =>
  !!old && !!next && (q0 == null || q1 == null || q1 >= q0) && ((next.cost?.expected_usd ?? Infinity) < (old.cost?.expected_usd ?? 0) || (next.cost?.expected_ms ?? Infinity) < (old.cost?.expected_ms ?? 0));

// ── offline: plan from known question classes (no DB, no run). Opus is injected; tests mock it. ──
/** Parse the strategy-classes text (### name | strategy | status | classes=[..] | t="..", then `desc:` and ` key: value` lines). */
export function parseClassCards(text) {
  const out = []; let cur = null;
  for (const line of String(text).split('\n')) {
    const h = /^### (\S+) \|/.exec(line);
    if (h) { cur = { name: h[1] }; out.push(cur); continue; }
    if (!cur) continue;
    const m = /^\s*([a-z_ ]+?):\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].trim().replace(/ /g, '_'); let v = m[2];
    if (/^[[{"]/.test(v)) { try { v = JSON.parse(v); } catch { /* keep text */ } }
    cur[k] = v;
  }
  return out;
}
/** classes: [{ name, desc, sounds_like[], ideal_answer?, ... }] (or the text). heldOut: questions never used as exemplars (the Immerse 61).
 *  → { candidates: [{ class, ok, name, normalized, plan, tests, settingOf, errors }], tools: wishlist, fields: [unit names wished for] }. */
export async function planFromClasses(classes, { call = opusCall, cat = catalog(), acts = registry(), heldOut = [], pending = [] } = {}) {
  const list = typeof classes === 'string' ? parseClassCards(classes) : classes, held = new Set(heldOut.map((q) => String(q).trim().toLowerCase()));
  const candidates = [], seen = [...pending];
  for (const c of list) {
    const qs = [...new Set([...(Array.isArray(c.sounds_like) ? c.sounds_like : []), ...(Array.isArray(c.jev?.example_phrasings) ? c.jev.example_phrasings : [])])].filter((q) => !held.has(String(q).trim().toLowerCase()));
    const challenge = [`Class ${c.name}: ${c.desc || c.name}`, ...qs.slice(0, 4), ...(c.ideal_answer ? [`Ideal answer: ${c.ideal_answer}`] : [])];
    const d = await planCandidate(challenge, { context: { class: c.name }, cat, pending: seen, call, acts, mode: 'full' });
    candidates.push({ class: c.name, ok: !!d.ok, name: d.normalized?.strategy?.name ?? d.settingOf ?? null, normalized: d.normalized ?? null, plan: d.plan ?? null, tests: d.tests ?? null, settingOf: d.settingOf ?? null, errors: d.errors ?? [] });
    if (d.ok) seen.push({ name: d.normalized.strategy.name, description: d.normalized.strategy.description });
  }
  const tools = new Map(), fields = new Set();
  for (const x of candidates) for (const w of x.plan?.wishes || []) {
    const t = tools.get(w.element) || { element: w.element, count: 0, strategies: [], inputs: w.inputs, outputs: w.outputs, replaces: w.replaces, saves: null };
    t.count++; t.strategies.push(x.name); t.saves = addNum(t.saves, w.saves); tools.set(w.element, t);
    for (const f of [...[].concat(w.inputs || []), ...[].concat(w.outputs || [])]) if (typeof f === 'string') fields.add(f);
  }
  return { candidates, tools: [...tools.values()].sort((a, b) => b.count - a.count), fields: [...fields].sort() };
}
