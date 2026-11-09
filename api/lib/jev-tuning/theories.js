// Decision THEORIES (Chad 11-04, improve v3): a weak verdict whose judge named a Jev gate → Opus diagnoses 1-3 theories
// ({kind:'enrich'|'reword', variant, params} or {kind:'needs-code', what, scenarios}) → each data theory is tested with
// runExperiment over HISTORIC gold (the bank: judge labels + human gold) + a FROZEN synthetic set per gate (Opus-written once,
// append-only, jev-theories-repo) → a win ships as DATA: the gate's decision step gets params.enrich (graph.js applies it before
// Jev) as a new step + strategy version, replay-promoted with Jev's own routing kept (keepChoice). A gate with no graph home, or
// a needs-code theory → a CODE improvement with acceptance scenarios. A loss is logged. No human gate. Every LLM call is an
// improve-* caller (assertSpendCap in ai.js / systemone.rerun). Deps injectable; config/strategy-improve.json `theory`.
import { MIN_CONFIDENCE } from '../scope-extract.js';
import { VARIANTS } from './variants.js';
import { runExperiment } from './experiment.js';
import { parseScenarios, SCENARIO_CHECKS } from '../audit/improve.js';
import { activitiesForGate } from './gates.js';
import { IMPROVE_CFG } from '../assistant/strategy-gaps.js';
import { syntheticSet, appendSynthetic, logTheory, theorizedFor, listTheories, nextStepVersion } from '../repos/jev-theories-repo.js';

export const DIAGNOSE_CALLER = 'improve-jev-diagnose', SYNTH_CALLER = 'improve-jev-synthetic', THEORY_ROLE = 'strategy-design';
export const THEORY_CFG = IMPROVE_CFG.theory;
const firstJson = (t) => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
const clip = (s, n) => String(s ?? '').slice(0, n);
const pct = (x) => (x == null ? '?' : `${Math.round(x * 100)}%`);
const DATA_VARIANTS = Object.keys(VARIANTS).filter((v) => v !== 'baseline');

export const DIAGNOSE_SYSTEM = `You diagnose a WRONG DECISION by Jev, the small classifier that routes a research assistant (Anís).
Jev answers multiple-choice questions about a STATE (the conversation and the reader, as text). The judge says Jev chose the
wrong option on one gate. Propose 1-3 THEORIES of why, each one testable on that gate's whole class of calls, never on this one
question. Each theory is ONE of:
- {"kind":"enrich","variant":"<variant>","params":{...},"why":"..."}: the state lacks something Jev needs. Variants:
${DATA_VARIANTS.filter((v) => v !== 'reword').map((v) => `  ${v}: ${VARIANTS[v].describe}`).join('\n')}
- {"kind":"reword","variant":"reword","params":{"question":"<name>","instructions":"...","options":{"<option>":"<new text>"}},"why":"..."}:
  the question or an option's description misleads Jev. Keep every option name; reword its text only.
- {"kind":"needs-code","what":"<the change to the state builder or a new input Jev needs>","scenarios":[...],"why":"..."}: when
  the fix needs code (a fact the state cannot carry today). scenarios (1-3): {"title","given":{"reader","history":[]},
  "when":{"asks","examples":[2-3 phrasings]},"then":[{"check":"<${SCENARIO_CHECKS.join('|')}>","expect":"..."}]}.
Rules: describe the CLASS of messages, never quote the user's question into params; text you add must hold for every call of the
gate. Reply with JSON only: {"theories":[...]}`;

/** The diagnosis prompt: the verdict (why, the right option) and one real call of the gate (its question schema, a state excerpt). */
export function diagnoseMessage({ verdict, example }) {
  const qs = example?.questions || {};
  return [`GATE ${verdict.gate} — the judge says the right option was "${verdict.right ?? '?'}".`,
    `JUDGE: ${clip(verdict.why, 800)}`, verdict.classes?.length ? `CLASSES: ${verdict.classes.join(', ')}` : '',
    `THE GATE'S QUESTIONS (name → instructions; options):\n${Object.entries(qs).map(([n, d]) => `- ${n}: ${clip(d.instructions, 300)}${d.criteria ? `\n  options: ${Object.entries(d.criteria).map(([o, t]) => `${o} = ${clip(t, 160)}`).join(' | ')}` : ''}`).join('\n')}`,
    example?.state ? `A STATE OF THIS GATE (an example of the input shape, not the failing call):\n${clip(example.state, 2500)}` : ''].filter(Boolean).join('\n\n');
}

/** Opus text → 1-3 valid theories. enrich: a known variant (not baseline/reword) with object params; reword: params carrying
 *  instructions or options; needs-code: `what` + parsed scenarios. Anything else is dropped. Pure. */
export function parseTheories(text) {
  const j = firstJson(text);
  const xs = Array.isArray(j?.theories) ? j.theories : [];
  const out = [];
  for (const t of xs) {
    if (!t || typeof t !== 'object') continue;
    const why = clip(t.why, 400) || null;
    if (t.kind === 'enrich' && DATA_VARIANTS.includes(t.variant) && t.variant !== 'reword' && t.params && typeof t.params === 'object' && !Array.isArray(t.params))
      out.push({ kind: 'enrich', variant: t.variant, params: t.params, why });
    else if (t.kind === 'reword' && t.params && (typeof t.params.instructions === 'string' || (t.params.options && typeof t.params.options === 'object')))
      out.push({ kind: 'reword', variant: 'reword', params: { ...(t.params.question ? { question: String(t.params.question) } : {}),
        ...(t.params.instructions ? { instructions: String(t.params.instructions) } : {}), ...(t.params.options ? { options: t.params.options } : {}) }, why });
    else if (t.kind === 'needs-code' && typeof t.what === 'string' && t.what.trim())
      out.push({ kind: 'needs-code', what: clip(t.what.trim(), 600), scenarios: parseScenarios(t.scenarios), why });
    if (out.length >= 3) break;
  }
  return out;
}

// ── the frozen synthetic set ──
export const SYNTH_SYSTEM = `You write SYNTHETIC TEST CASES for Jev, a multiple-choice classifier gate of a research assistant over a
Bahá'í and interfaith library. Each case is a STATE in the exact shape of the example (the conversation and the reader as text)
and the GOLD answer: the option a careful human would pick for each question. Cover the whole class evenly: every option, easy
and hard cases, follow-ups that depend on earlier turns, short and long messages, several languages of phrasing. Never copy the
example's content. Reply with JSON only: {"cases":[{"state":"...","gold":{"<question>":"<option>"},"side":"<what makes it hard>"}]}`;

export const synthMessage = ({ gate, example, n }) => [`GATE ${gate}. Write ${n} cases.`,
  `QUESTIONS:\n${Object.entries(example.questions || {}).map(([q, d]) => `- ${q}: ${clip(d.instructions, 300)}${d.criteria ? ` OPTIONS: ${Object.entries(d.criteria).map(([o, t]) => `${o} (${clip(t, 120)})`).join('; ')}` : d.type === 'noul' ? ' (yes|no)' : ''}`).join('\n')}`,
  `EXAMPLE STATE (shape only):\n${clip(example.state, 2500)}`].join('\n\n');

const validGold = (gold, questions) => gold && typeof gold === 'object' && Object.keys(gold).length > 0 && Object.entries(gold).every(([q, v]) => {
  const d = questions?.[q];
  if (!d) return false;
  return d.criteria ? Object.prototype.hasOwnProperty.call(d.criteria, v) : ['yes', 'no'].includes(v);
});
/** Opus text → cases with the gate's real question schema attached; a gold that is not one of the options is dropped. Pure. */
export function parseSynthetic(text, questions) {
  const j = firstJson(text);
  return (Array.isArray(j?.cases) ? j.cases : []).filter((c) => typeof c?.state === 'string' && c.state.trim().length > 10 && validGold(c.gold, questions))
    .map((c) => ({ state: c.state.trim(), questions, gold: c.gold, side: c.side ? clip(c.side, 160) : null }));
}

/** The gate's synthetic set, frozen: written once (Opus, improve-jev-synthetic) up to cfg.synthetic_n, then reused as is.
 *  → { version, rows, usd, written } */
export async function ensureSynthetic(db, gate, { example, call, cfg = THEORY_CFG }) {
  const have = syntheticSet(db, gate);
  const want = cfg.synthetic_n ?? 40;
  if (have.rows.length >= want || !example?.questions) return { ...have, usd: 0, written: 0 };
  const r = await call(THEORY_ROLE, SYNTH_SYSTEM, synthMessage({ gate, example, n: want - have.rows.length }), cfg.synthetic_max_tokens ?? 6000, SYNTH_CALLER);
  const added = appendSynthetic(db, gate, parseSynthetic(r.text, example.questions)).added;
  return { ...syntheticSet(db, gate), usd: r.usd || 0, written: added };
}

// ── the test and the decision ──
/** Run one data theory on historic + synthetic rows (deps.rerun = systemone.rerun, billed improve-jev-try:<gate>). */
export const testTheory = ({ gate, theory, historic = [], synthetic = [], cfg = THEORY_CFG }, deps) => runExperiment({ task: gate,
  variant: { id: theory.variant, params: theory.params }, rows: [...historic.map((r) => ({ ...r, src: 'historic' })), ...synthetic.map((r) => ({ ...r, src: 'synthetic' }))],
  maxUsd: cfg.max_usd ?? 1, minConfidence: cfg.max_confidence_drops != null ? MIN_CONFIDENCE : null }, deps);

/** The decision over an experiment. Win = accuracy up by ≥ margin, broken ≤ max_broken, variant tokens ≤ token_ratio × baseline.
 *  → { win, failed, numbers: { before, after, n_historic, n_synthetic, broken, fixed, token_ratio, usd } }. Pure. */
export function decideTheory(res, cfg = THEORY_CFG) {
  const failed = [];
  const before = res?.accuracy?.baseline ?? null, after = res?.accuracy?.variant ?? null;
  const bt = res?.avg_tokens?.baseline || 0, vt = res?.avg_tokens?.variant || 0;
  const ratio = bt ? +(vt / bt).toFixed(2) : null;
  if (!res?.labelled) failed.push('no labelled row was measured');
  else if (!(after - before >= cfg.margin - 1e-9)) failed.push(`accuracy ${pct(before)} → ${pct(after)}: not up by ${pct(cfg.margin)}`);
  if ((res?.broken || 0) > cfg.max_broken) failed.push(`broke ${res.broken} (max ${cfg.max_broken})`);
  if (cfg.max_confidence_drops != null && (res?.confidence_drops || 0) > cfg.max_confidence_drops) failed.push(`${res.confidence_drops} right call(s) fall below the Jev confidence floor (max ${cfg.max_confidence_drops})`);
  if (ratio != null && ratio > cfg.token_ratio) failed.push(`tokens ×${ratio} (max ×${cfg.token_ratio})`);
  if (res?.truncated) failed.push(`stopped: ${res.truncated}`);
  return { win: failed.length === 0, failed, numbers: { before, after, n_historic: res?.by_src?.historic?.n ?? 0, n_synthetic: res?.by_src?.synthetic?.n ?? 0,
    broken: res?.broken ?? 0, confidence_drops: res?.confidence_drops ?? 0, fixed: res?.fixed ?? 0, token_ratio: ratio, usd: res?.usd ?? 0 } };
}
/** "Jev on <gate>: 71% → 88% on 140 historic + 40 synthetic, broke 1" */
export const theoryLabel = (gate, n) => `Jev on ${gate}: ${pct(n.before)} → ${pct(n.after)} on ${n.n_historic} historic + ${n.n_synthetic} synthetic, broke ${n.broken}`;

// ── shipping as data ──
/** Where a gate's decision lives in the graph: the first active strategy with a node whose step runs an activity that asks the
 *  gate. → { row, step, nodes: [node ids] } | null (no graph home → the theory becomes a CODE improvement). Pure. */
export function theoryHome(gate, cat) {
  const acts = new Set(activitiesForGate(gate));
  if (!acts.size) return null;
  const stepOf = (k) => cat.steps?.byKey?.get?.(k);
  // the general (Unmatched) graph first: the lookup graphs share the same decision steps, but a theory is tested on the whole stream
  for (const row of [...(cat.strategies || [])].sort((x, y) => (y.id === 'respond') - (x.id === 'respond'))) {
    const nodes = Object.entries(row.graph?.nodes || {}).filter(([, n]) => acts.has(stepOf(`${n.step}@${n.step_version}`)?.activity));
    if (nodes.length) return { row, step: stepOf(`${nodes[0][1].step}@${nodes[0][1].step_version}`), nodes: nodes.map(([id]) => id) };
  }
  return null;
}
/** The candidate a winning theory becomes: the step at its next version with the theory in params.enrich (one entry per gate ×
 *  variant, the newest wins), the strategy's graph pointing those nodes at it. Pure apart from reading the next step version. */
export function theoryCandidate(db, { gate, theory, home }) {
  const version = nextStepVersion(db, home.step.id);
  const enrich = [...(home.step.params?.enrich || []).filter((e) => !(e.gate === gate && e.variant === theory.variant)), { gate, variant: theory.variant, params: theory.params }];
  const graph = JSON.parse(JSON.stringify(home.row.graph));
  for (const id of home.nodes) graph.nodes[id].step_version = version;
  return { strategy: { id: home.row.id, name: home.row.name, description: home.row.description, exemplars: home.row.exemplars || [], graph },
    steps: [{ id: home.step.id, version, activity: home.step.activity, params: { ...(home.step.params || {}), enrich }, template_id: home.step.template_id ?? null,
      template_version: home.step.template_version ?? null }] };
}

const codeSuggestion = ({ gate, change, effect, scenarios = [], verdict }) => ({ stage: 'STRATEGY', file: null, fn: null, target: 'other-code', strategy: null,
  change: clip(`Jev gate ${gate}: ${change}`, 600), expected_effect: clip(effect, 300), scenarios, classes: verdict.classes || [], severity: 2, evidence: [verdict.item_key] });

/**
 * One unit of the loop (improve worker, after the judge): the newest weak gate verdict not yet diagnosed → theories → tests → ship.
 * deps: { call(role, system, user, maxTokens, caller) → {text, usd}, weak() → verdicts, sample(gate, {n}) → bank rows,
 *   rerun(task, state, questions), history?, applySuggestions(inserts) → ids, saveCandidate, logDesign, promote({id, version, cfg}) → {promoted, decision, usd} }
 * → 'idle' | 'capped' | { gate, item_key, theories: [{ kind, verdict, label?, ... }], usd }
 */
export async function theoryStage(db, { deps, cat, cfg: baseCfg = THEORY_CFG, now = Date.now() }) {
  const today = `${new Date(now).toISOString().slice(0, 10)} 00:00:00`;
  const v = (await deps.weak()).find((x) => x.gate && !theorizedFor(db, x.item_key));
  if (!v) return 'idle';
  const { gates: _g, ...rest } = baseCfg, g = baseCfg.gates?.[v.gate] || {};
  const cfg = { ...rest, ...g, promote: { ...rest.promote, ...(g.promote || {}) } };   // per-gate rules (strategy gate: broken 0, no guard override)
  if (new Set(listTheories(db, { since: today }).map((t) => t.evidence_key)).size >= (cfg.per_day ?? 6)) return 'capped';
  const historic = (await deps.sample(v.gate, { n: cfg.historic_n ?? 140 })) || [];
  const example = historic[0] || (await deps.sample(v.gate, { n: 1, gold: 'any' }))?.[0] || null;
  if (!example) { logTheory(db, { gate: v.gate, kind: 'none', verdict: 'no-bank', evidence_key: v.item_key }); return { gate: v.gate, item_key: v.item_key, theories: [], usd: 0 }; }
  const d = await deps.call(THEORY_ROLE, DIAGNOSE_SYSTEM, diagnoseMessage({ verdict: v, example }), cfg.diagnose_max_tokens ?? 1500, DIAGNOSE_CALLER);
  let usd = d.usd || 0;
  const theories = parseTheories(d.text);
  if (!theories.length) { logTheory(db, { gate: v.gate, kind: 'none', verdict: 'unparsed', evidence_key: v.item_key, usd }); return { gate: v.gate, item_key: v.item_key, theories: [], usd }; }
  let syn = null;
  const out = [];
  for (const [i, t] of theories.entries()) {
    const spent = i === 0 ? usd : 0;
    if (t.kind === 'needs-code') {
      const [id] = deps.applySuggestions([codeSuggestion({ gate: v.gate, change: t.what, effect: t.why || 'Jev chooses the right option on this class', scenarios: t.scenarios, verdict: v })]);
      logTheory(db, { gate: v.gate, kind: t.kind, theory: t, verdict: 'code', improvement_id: id ?? null, evidence_key: v.item_key, usd: spent });
      out.push({ kind: t.kind, verdict: 'code', improvement_id: id ?? null });
      continue;
    }
    if (!syn) { syn = await ensureSynthetic(db, v.gate, { example, call: deps.call, cfg }); usd += syn.usd; }
    const res = await testTheory({ gate: v.gate, theory: t, historic, synthetic: syn.rows, cfg }, { rerun: deps.rerun, history: deps.history });
    usd += res.usd || 0;
    const dec = decideTheory(res, cfg);
    const label = theoryLabel(v.gate, dec.numbers);
    const result = { ...dec.numbers, failed: dec.failed, synthetic_version: syn.version, label };
    if (!dec.win) {
      logTheory(db, { gate: v.gate, kind: t.kind, theory: t, result, verdict: 'lost', evidence_key: v.item_key, usd: spent + (res.usd || 0) });
      out.push({ kind: t.kind, verdict: 'lost', label, failed: dec.failed });
      continue;
    }
    const home = theoryHome(v.gate, cat);
    if (!home) {   // a measured win with nowhere to ship it as data: the gate's state builder must carry it (code)
      const [id] = deps.applySuggestions([codeSuggestion({ gate: v.gate, change: `ship the tested ${t.variant} ${JSON.stringify(t.params)} in the gate's state/question builder (no graph step asks this gate)`,
        effect: label, scenarios: [], verdict: v })]);
      logTheory(db, { gate: v.gate, kind: t.kind, theory: t, result, verdict: 'code', improvement_id: id ?? null, evidence_key: v.item_key, usd: spent + (res.usd || 0) });
      out.push({ kind: t.kind, verdict: 'code', label, improvement_id: id ?? null });
      continue;
    }
    const saved = deps.saveCandidate(theoryCandidate(db, { gate: v.gate, theory: t, home }));
    deps.logDesign({ cluster_key: `theory:${v.gate}`, label, status: 'theory', strategy_id: saved.id, version: saved.version, usd: spent + (res.usd || 0) });
    const p = await deps.promote({ id: saved.id, version: saved.version, cfg: cfg.promote });
    usd += p?.usd || 0;
    logTheory(db, { gate: v.gate, kind: t.kind, theory: t, result: { ...result, promoted: !!p?.promoted, promotion_failed: p?.decision?.failed ?? [] }, verdict: 'won',
      strategy_id: saved.id, version: saved.version, evidence_key: v.item_key, usd: spent + (res.usd || 0) + (p?.usd || 0) });
    out.push({ kind: t.kind, verdict: 'won', label, id: saved.id, version: saved.version, promoted: !!p?.promoted });
  }
  return { gate: v.gate, item_key: v.item_key, theories: out, usd: Math.round(usd * 1e6) / 1e6 };
}

/** The live deps (improve worker). Lazy imports keep the reply path free of them. */
export async function liveTheoryDeps({ improveDb, db }) {
  const [{ opusCall }, calls, sys, imp, cand, si] = await Promise.all([import('../assistant/strategy-design.js'), import('../repos/jev-calls-repo.js'),
    import('../systemone.js'), import('../repos/improve-repo.js'), import('../repos/strategy-candidates-repo.js'), import('../assistant/strategy-improve.js')]);
  return {
    call: opusCall,
    weak: async () => imp.weakGateVerdicts(improveDb, { limit: 20 }),
    sample: async (gate, o) => calls.sampleBank(gate, o),
    rerun: (task, state, questions) => sys.rerun(task, state, questions),
    applySuggestions: (inserts) => imp.applySuggestions(improveDb, { inserts, bumps: [] }),
    saveCandidate: (c) => cand.saveCandidate(db, c, { by: 'opus-theory' }),
    logDesign: (row) => cand.logDesign(db, row),
    promote: ({ id, version, cfg }) => si.promoteCandidate(db, { id, version, cfg, keepChoice: true, by: 'improve-theory' }),
  };
}
