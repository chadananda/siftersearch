// Strategy DESIGN (strategy graph Phase 3): for a READY gap cluster (strategy-gaps.js), Opus 5.5 (role strategy-design, billed
// improve-strategy-design) proposes a candidate strategy built ONLY from existing executor activities (scope 'strategy'), param
// variants of them (a new step whose params.how names a template) and new templates. Code validates it (schema, activities exist,
// every edge routed, reachable, acyclic → it always ends at '$end', i.e. in the shared writer + checks of respond.js); invalid →
// one retry with the errors, then dropped and logged. Dedupe: a description near an active strategy's (or the same name) becomes
// a new candidate VERSION of that strategy. Deps: activities registry, graph compileGraph, strategy-gaps (words), audit/improve costOf.
import { compileGraph } from './activities/graph.js';
import { activities as registry } from './activities/index.js';
import { END_NODE, isUnmatched } from './strategy-seed.js';
import { IMPROVE_CFG, jaccardWords } from './strategy-gaps.js';

export const DESIGN_ROLE = 'strategy-design';
export const DESIGN_CALLER = 'improve-strategy-design';
const MAX_NODES = 6;
const ID_OK = /^[a-z][a-z0-9_]{2,30}$/;            // a candidate's own option key (model output, never the reader's text)
const STEP_ID_OK = /^[a-z][a-z0-9_.-]{2,60}$/;
const RESERVED = new Set(['other', 'unmatched', 'respond', 'none']);

export const DESIGN_SYSTEM = `You design RESPONSE STRATEGIES for Anís, a research assistant over a Bahá'í and interfaith library.
A strategy is a small graph of ACTIVITIES (code that already exists). Jev (a small classifier) picks a strategy per question by its
DESCRIPTION, so the description must name the CLASS of request (what the reader wants done), never one particular question.
After the graph ends, the shared writer and quality checks always run; an executor's output (passages + a writer instruction) feeds them.
You may use ONLY: the listed executor activities; NEW steps that are param variants of them (params.how = a template id whose text
rewrites the writer instruction, with {{base}} standing for the executor's own instruction); NEW templates (new ids only).
Edges: each activity returns one of its edges; every edge must be routed (to a node, "$end", or "*" for any). No cycles.
BEFORE designing, decide what the gap class is (an LLM judgement about the task, never about shared words):
(a) a NEW TASK Jev can tell apart from the nearest strategies: give "difference", ONE sentence saying what the reader wants done that none of them does; or
(b) a SETTING of an existing strategy (the same task with another topic, tradition, length, tone, format or source): set "setting_of" to that strategy's name and design nothing.
Jev must not be confused by another option: when in doubt between (a) and (b), choose (b).
Answer with ONE JSON object and nothing else:
{"setting_of":null,"difference":"one sentence: what this does that the nearest strategies do not (null with setting_of)","name":"snake_case_option_key","description":"one or two sentences: the class of request and what this strategy does for it",
 "exemplars":["3-6 NEW class phrasings you wrote yourself — never copies of the gap questions"],
 "templates":[{"id":"<name>.<part>","text":"..."}],
 "steps":[{"id":"<name>.<part>","activity":"<executor>","params":{"how":"<template id>"}}],
 "graph":{"entry":"<node>","nodes":{"<node>":{"step":"<step id>"}},"edges":[{"from":"<node>","on":"<edge>|*","to":"<node>|$end"}]},
 "why":"one sentence: why the existing strategies do not serve this class (for a setting: which strategy and how it is a setting of it)"}`;

const firstJson = (t) => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
export const parseCandidate = (text) => firstJson(text);

/** The executors a design may use: [{ name, edges, params }] (registry scope 'strategy'). */
export const designActivities = (acts = registry()) => Object.entries(acts).filter(([, a]) => a.scope === 'strategy')
  .map(([name, a]) => ({ name, edges: a.edges || [], params: a.params || [] }));

/** The active strategies nearest a cluster (label first, then description overlap with the questions). */
export function nearestStrategies(cluster, cat, k = IMPROVE_CFG.design.nearest) {
  const text = cluster.questions.join(' ');
  return cat.strategies.filter((s) => !isUnmatched(s.name))
    .map((s) => ({ s, score: (s.name === cluster.label ? 1 : 0) + jaccardWords(s.description || '', text) }))
    .sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.s);
}

/** The user message for one cluster. stats (optional, Phase 2): name → { p50_ms, usd } per activity. */
export function designMessage({ cluster, cat, acts = registry(), stats = null, errors = null }) {
  const L = ['ACTIVITIES (executors you may use):'];
  for (const a of designActivities(acts)) {
    const st = stats?.[a.name];
    L.push(`- ${a.name}: edges ${a.edges.join('|')}; params ${a.params.join(', ') || 'none'}${st ? `; p50 ${st.p50_ms} ms, $${st.usd}` : ''}`);
  }
  L.push('', 'EXISTING STEPS (strategy scope):');
  for (const s of cat.steps.latest.values()) if (acts[s.activity]?.scope === 'strategy') L.push(`- ${s.id}@${s.version} → ${s.activity} ${JSON.stringify(s.params || {})}`);
  L.push('', 'NEAREST ACTIVE STRATEGIES:');
  for (const s of nearestStrategies(cluster, cat)) L.push(`- ${s.name} (v${s.version}): ${s.description}\n  graph ${JSON.stringify(s.graph)}`);
  L.push('', `GAP CLASS — Jev leaned to "${cluster.label}" but was unsure, or the judge said the strategy was wrong. Questions (${cluster.questions.length}):`);
  for (const q of cluster.questions) L.push(`- ${q}`);
  if (cluster.reasons?.length) { L.push('', 'JUDGE REASONS:'); for (const r of cluster.reasons) L.push(`- ${r}`); }
  if (errors?.length) { L.push('', 'YOUR PREVIOUS ANSWER WAS INVALID — fix these and answer again:'); for (const e of errors) L.push(`- ${e}`); }
  return L.join('\n');
}

const hasCycle = (nodes, edges) => {
  const out = new Map(Object.keys(nodes).map((n) => [n, []]));
  for (const e of edges) if (e.to !== END_NODE && out.has(e.from)) out.get(e.from).push(e.to);
  const state = new Map();
  const visit = (n) => { if (state.get(n) === 1) return true; if (state.get(n) === 2) return false; state.set(n, 1);
    for (const m of out.get(n) || []) if (visit(m)) return true; state.set(n, 2); return false; };
  return Object.keys(nodes).some((n) => visit(n));
};
const reachable = (entry, edges) => {
  const seen = new Set([entry]), todo = [entry];
  while (todo.length) { const n = todo.pop(); for (const e of edges) if (e.from === n && e.to !== END_NODE && !seen.has(e.to)) { seen.add(e.to); todo.push(e.to); } }
  return seen;
};

/**
 * Validate a parsed candidate against the catalog and the registry. → { ok, errors, normalized?: { strategy, steps, templates } }
 * normalized.strategy.id = name (dedupe may re-point it). New step/template ids must be new: a template id is never re-versioned,
 * because a live strategy reads its template's latest version.
 */
export function validateCandidate(c, { cat, acts = registry() } = {}) {
  const errors = [];
  if (!c || typeof c !== 'object') return { ok: false, errors: ['not a JSON object'] };
  const name = String(c.name || '');
  if (!ID_OK.test(name) || RESERVED.has(name)) errors.push(`name "${name}" must be a snake_case key (3-31 chars), not other/respond/none`);
  const description = String(c.description || '').trim();
  if (description.length < 20 || description.length > 600) errors.push('description must be 20-600 characters');
  const exemplars = Array.isArray(c.exemplars) ? c.exemplars.map((x) => String(x).trim()).filter(Boolean) : [];
  if (exemplars.length < 2) errors.push('exemplars: at least 2 class phrasings');
  const templates = Array.isArray(c.templates) ? c.templates : [];
  const steps = Array.isArray(c.steps) ? c.steps : [];
  const newTpl = new Map();
  for (const t of templates) {
    if (!STEP_ID_OK.test(String(t?.id || '')) || !String(t?.text || '').trim()) { errors.push(`template ${JSON.stringify(t?.id)}: needs an id and text`); continue; }
    if (cat.templates.latest.has(t.id) || newTpl.has(t.id)) { errors.push(`template ${t.id} already exists — templates are new ids only`); continue; }
    newTpl.set(t.id, { id: t.id, version: 1, text: String(t.text) });
  }
  const newSteps = new Map();
  for (const s of steps) {
    const id = String(s?.id || ''), act = acts[s?.activity];
    if (!STEP_ID_OK.test(id)) { errors.push(`step ${JSON.stringify(s?.id)}: bad id`); continue; }
    if (cat.steps.latest.has(id) || newSteps.has(id)) { errors.push(`step ${id} already exists — new steps need new ids`); continue; }
    if (!act) { errors.push(`step ${id}: unknown activity ${s?.activity}`); continue; }
    if (act.scope !== 'strategy') { errors.push(`step ${id}: activity ${s.activity} is not an executor a strategy may use`); continue; }
    const params = s.params && typeof s.params === 'object' ? s.params : {};
    const bad = Object.keys(params).filter((k) => !(act.params || []).includes(k));
    if (bad.length) { errors.push(`step ${id}: unknown params ${bad.join(', ')}`); continue; }
    if (params.how && !newTpl.has(params.how) && !cat.templates.latest.has(params.how)) { errors.push(`step ${id}: params.how names unknown template ${params.how}`); continue; }
    const tv = params.how ? (newTpl.get(params.how)?.version ?? cat.templates.latest.get(params.how)?.version) : null;
    newSteps.set(id, { id, version: 1, activity: s.activity, params, template_id: params.how || null, template_version: tv });
  }
  const g = c.graph && typeof c.graph === 'object' ? c.graph : {};
  const nodesIn = g.nodes && typeof g.nodes === 'object' ? g.nodes : {};
  const nodes = {};
  for (const [nid, n] of Object.entries(nodesIn)) {
    const sid = String(n?.step || '');
    const known = newSteps.get(sid) || (n?.step_version != null ? cat.steps.byKey.get(`${sid}@${n.step_version}`) : cat.steps.latest.get(sid));
    if (!known) { errors.push(`node ${nid}: unknown step ${sid}`); continue; }
    if (acts[known.activity]?.scope !== 'strategy') { errors.push(`node ${nid}: step ${sid} runs ${known.activity}, which a designed strategy may not use`); continue; }
    nodes[nid] = { step: sid, step_version: known.version };
  }
  const nn = Object.keys(nodesIn).length;
  if (!nn) errors.push('graph has no nodes');
  if (nn > MAX_NODES) errors.push(`graph has ${nn} nodes (at most ${MAX_NODES})`);
  const edges = (Array.isArray(g.edges) ? g.edges : []).map((e) => ({ from: String(e?.from), on: String(e?.on), to: String(e?.to) }));
  if (!errors.length) {
    const graph = { entry: String(g.entry || ''), nodes, edges };
    const stepOf = (k) => { const [sid, v] = [k.slice(0, k.lastIndexOf('@')), Number(k.slice(k.lastIndexOf('@') + 1))]; const ns = newSteps.get(sid); return ns && ns.version === v ? ns : cat.steps.byKey.get(k); };
    try { compileGraph({ id: name, version: 0, name, graph }, stepOf, acts); } catch (err) { errors.push(err.message.replace(`strategy ${name}: `, '')); }
    if (!errors.length) {
      if (hasCycle(nodes, edges)) errors.push('graph has a cycle');
      const seen = reachable(graph.entry, edges);
      const lost = Object.keys(nodes).filter((n) => !seen.has(n));
      if (lost.length) errors.push(`nodes not reachable from the entry: ${lost.join(', ')}`);
    }
    if (!errors.length) {
      return { ok: true, errors: [], normalized: { strategy: { id: name, name, description, exemplars, graph }, steps: [...newSteps.values()], templates: [...newTpl.values()] } };
    }
  }
  return { ok: false, errors };
}

/** Dedupe against the active strategies (and pending candidates by name): near description or same name → a VERSION of it. */
export function dedupeTarget(normalized, { cat, pending = [], similarity = IMPROVE_CFG.design.dedupe_similarity } = {}) {
  const s = normalized.strategy;
  const pool = [...cat.strategies.filter((r) => !isUnmatched(r.name)), ...pending];
  let best = null;
  for (const r of pool) {
    const sim = r.name === s.name ? 1 : jaccardWords(r.description || '', s.description);
    if (sim >= similarity && (!best || sim > best.sim)) best = { id: r.id, name: r.name, sim: Math.round(sim * 100) / 100 };
  }
  if (!best) return { normalized, dedupe: null };
  return { normalized: { ...normalized, strategy: { ...s, id: best.id, name: best.name } }, dedupe: best };
}

/** Default Opus call: role → registry model, billed `caller` (improve group). → { text, usage, usd } */
export async function opusCall(role, system, user, maxTokens, caller) {
  const [{ chatCompletion }, { withAIContext }, { modelFor }, { costOf }] = await Promise.all([import('../ai.js'), import('../ai-context.js'),
    import('../model-roles.js'), import('../audit/improve.js')]);
  const { provider, model } = modelFor(role);
  const res = await withAIContext({ caller, stage: `improve:${caller}` },
    () => chatCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], { provider, model, maxTokens, usePromptCache: true }));
  return { text: res.content, usage: res.usage || {}, usd: costOf(res.usage || {}, model) };
}

/** Design one candidate for a ready cluster: call → parse → validate (one retry with the errors) → dedupe.
 *  → { ok, normalized?, dedupe?, errors, attempts, usd } | { ok:false, settingOf, why } (the cluster is a setting of that strategy) (never throws on a bad answer; a spend cap propagates). */
export async function designCandidate(cluster, { cat, acts = registry(), call = opusCall, stats = null, pending = [], maxTokens = IMPROVE_CFG.design.max_tokens } = {}) {
  let errors = null, usd = 0, attempts = 0;
  for (; attempts < 2;) {
    attempts++;
    const r = await call(DESIGN_ROLE, DESIGN_SYSTEM, designMessage({ cluster, cat, acts, stats, errors }), maxTokens, DESIGN_CALLER);
    usd += r.usd || 0;
    const j = parseCandidate(r.text);
    // (b) a setting of an existing strategy: no candidate (the caller logs setting-of:<name>); it must name an active strategy
    if (j?.setting_of) {
      const owner = cat.strategies.find((s) => s.name === j.setting_of && !isUnmatched(s.name));
      if (owner) return { ok: false, settingOf: owner.name, why: String(j.why || '').slice(0, 300), errors: [], attempts, usd };
      errors = [`setting_of "${j.setting_of}" is not an active strategy; name one of the strategies above or set it to null`]; continue;
    }
    if (j && !String(j.difference || '').trim()) { errors = ['difference: one sentence saying what this does that the nearest strategies do not (or set setting_of)']; continue; }
    const v = validateCandidate(j, { cat, acts });
    if (v.ok) { const d = dedupeTarget(v.normalized, { cat, pending }); return { ok: true, ...d, errors: [], attempts, usd }; }
    errors = v.errors;
  }
  return { ok: false, errors, attempts, usd };
}
