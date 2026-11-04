// Strategy EDIT (strategy graph Phase 4): the improve analyst's DATA suggestions (target strategy|step|template) on ONE existing
// strategy → Opus 5.5 (role strategy-design, billed improve-strategy-edit) rewrites that strategy as a candidate VERSION: same id
// and name, existing steps reused, changed steps/templates as NEW ids. Validated like a design (strategy-design.js
// validateCandidate, name forced to the target), one retry with the errors. Several suggestions on one strategy → ONE edit.
// The respond graph ('other') runs respond.* activities no strategy may use, so it is not editable. Deps: strategy-design.
import { activities as registry } from './activities/index.js';
import { DESIGN_ROLE, designActivities, validateCandidate, parseCandidate, opusCall } from './strategy-design.js';
import { IMPROVE_CFG } from './strategy-gaps.js';

export const EDIT_CALLER = 'improve-strategy-edit';
const NOT_EDITABLE = new Set(['other', 'respond']);

export const EDIT_SYSTEM = `You EDIT one existing RESPONSE STRATEGY of Anís, a research assistant over a Bahá'í and interfaith library.
A strategy is a small graph of ACTIVITIES (code that already exists); Jev picks a strategy per question by its DESCRIPTION; after the
graph ends, the shared writer and quality checks always run. An improvement analyst diagnosed weak answers and proposed changes to
this strategy. Apply them as the SMALLEST edit that fixes the CLASS of failure, never one particular question.
Rules: keep "name" exactly as given. Reuse existing steps by id wherever they do not change. A changed step or template gets a NEW id
("<name>.<part>"); params.how names a template whose text rewrites the writer instruction ({{base}} = the executor's own instruction).
Use ONLY the listed executor activities. Every edge must be routed (to a node, "$end" or "*"); no cycles; at most 6 nodes.
Keep or sharpen the description (20-600 characters, the class of request) and give 2-6 exemplars: class phrasings you wrote yourself.
Answer with ONE JSON object and nothing else:
{"name":"<the strategy name, unchanged>","description":"…","exemplars":["…"],
 "templates":[{"id":"<name>.<part>","text":"..."}],
 "steps":[{"id":"<name>.<part>","activity":"<executor>","params":{"how":"<template id>"}}],
 "graph":{"entry":"<node>","nodes":{"<node>":{"step":"<step id>"}},"edges":[{"from":"<node>","on":"<edge>|*","to":"<node>|$end"}]},
 "change":"one line: what this edit changes"}`;

/** Open DATA suggestion rows → [{ strategy (active row) | null, name, rows }] — grouped by the strategy each names (id or name). */
export function groupDataSuggestions(rows, cat) {
  const byKey = new Map();
  for (const r of rows) {
    const s = r.strategy ? cat.strategies.find((x) => x.id === r.strategy || x.name === r.strategy) : null;
    const key = s ? s.id : `?${r.strategy || ''}`;
    if (!byKey.has(key)) byKey.set(key, { strategy: s || null, name: r.strategy || null, rows: [] });
    byKey.get(key).rows.push(r);
  }
  return [...byKey.values()];
}
/** Why a group cannot become an edit (→ its suggestions are rejected with this), or null. */
export function uneditable(group) {
  if (!group.strategy) return group.name ? `no active strategy "${group.name}" to edit` : 'names no strategy to edit';
  if (NOT_EDITABLE.has(group.strategy.name) || NOT_EDITABLE.has(group.strategy.id)) return 'the respond graph is code (respond.* activities), not an editable strategy';
  return null;
}

/** The user message: the activity catalog (+ per-activity stats), existing steps, the strategy now (+ branch stats), the suggestions
 *  and the diagnoses behind them. stats: name → { p50_ms, usd }; branches: branchStats() rows. */
export function editMessage({ group, cat, acts = registry(), stats = null, branches = null, diagnoses = [], errors = null }) {
  const s = group.strategy;
  const L = ['ACTIVITIES (executors you may use):'];
  for (const a of designActivities(acts)) {
    const st = stats?.[a.name];
    L.push(`- ${a.name}: edges ${a.edges.join('|')}; params ${a.params.join(', ') || 'none'}${st ? `; p50 ${st.p50_ms} ms, $${st.usd}` : ''}`);
  }
  L.push('', 'EXISTING STEPS (strategy scope):');
  for (const st of cat.steps.latest.values()) if (acts[st.activity]?.scope === 'strategy') L.push(`- ${st.id}@${st.version} → ${st.activity} ${JSON.stringify(st.params || {})}`);
  L.push('', `THE STRATEGY TO EDIT: ${s.name} (v${s.version})`, `description: ${s.description}`, `exemplars: ${JSON.stringify(s.exemplars || [])}`, `graph: ${JSON.stringify(s.graph)}`);
  if (branches?.length) {
    L.push('', 'ITS BRANCHES (last 7 days):');
    for (const b of branches.slice(0, 6)) L.push(`- ${b.branch.join(' > ') || '(entry)'}: ${b.turns} turns, share ${b.share ?? '–'}, mean score ${b.score ?? '–'}, weak ${b.weak_pct ?? '–'}%, p50 ${b.p50_ms ?? '–'} ms`);
  }
  L.push('', `SUGGESTED CHANGES (${group.rows.length}):`);
  for (const r of group.rows) L.push(`- [${r.target}${r.stage ? ` · ${r.stage}` : ''} · evidence ${r.evidence_n ?? 1}] ${r.change}${r.expected_effect ? ` → ${r.expected_effect}` : ''}`);
  const dx = diagnoses.filter((d) => d.diagnosis || d.root_cause).slice(0, 6);
  if (dx.length) { L.push('', 'DIAGNOSES BEHIND THEM:'); for (const d of dx) L.push(`- ${d.diagnosis || ''}${d.root_cause ? ` (cause: ${d.root_cause})` : ''}`); }
  if (errors?.length) { L.push('', 'YOUR PREVIOUS ANSWER WAS INVALID — fix these and answer again:'); for (const e of errors) L.push(`- ${e}`); }
  return L.join('\n');
}

const sameGraph = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Validate an edit: the design schema with the name forced to the target; an edit that changes nothing is invalid.
 *  → { ok, errors, normalized?, change } (normalized.strategy.id = the target's id). */
export function validateEdit(c, { strategy, cat, acts = registry() }) {
  if (!c || typeof c !== 'object') return { ok: false, errors: ['not a JSON object'] };
  const v = validateCandidate({ ...c, name: strategy.name, description: c.description || strategy.description }, { cat, acts });
  if (!v.ok) return v;
  const n = v.normalized;
  const out = { ...n, strategy: { ...n.strategy, id: strategy.id, name: strategy.name } };
  if (!n.steps.length && !n.templates.length && sameGraph(n.strategy.graph, strategy.graph) && n.strategy.description === strategy.description) {
    return { ok: false, errors: ['the edit changes nothing — change the graph, a step or a template'] };
  }
  return { ok: true, errors: [], normalized: out, change: String(c.change || '').trim().slice(0, 200) || null };
}

/** One edit for one group: call → parse → validate (one retry with the errors). Never throws on a bad answer; a spend cap propagates.
 *  → { ok, normalized?, change?, errors, attempts, usd } */
export async function designEdit(group, { cat, acts = registry(), call = opusCall, stats = null, branches = null, diagnoses = [], maxTokens = IMPROVE_CFG.design.max_tokens } = {}) {
  let errors = null, usd = 0, attempts = 0;
  for (; attempts < 2;) {
    attempts++;
    const r = await call(DESIGN_ROLE, EDIT_SYSTEM, editMessage({ group, cat, acts, stats, branches, diagnoses, errors }), maxTokens, EDIT_CALLER);
    usd += r.usd || 0;
    const v = validateEdit(parseCandidate(r.text), { strategy: group.strategy, cat, acts });
    if (v.ok) return { ok: true, normalized: v.normalized, change: v.change, errors: [], attempts, usd };
    errors = v.errors;
  }
  return { ok: false, errors, attempts, usd };
}
