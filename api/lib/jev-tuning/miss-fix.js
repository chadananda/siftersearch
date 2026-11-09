// Jev MISS → FIX (background, improve loop). A recheck miss (unmatched.js: Haiku named the strategy Jev missed) feeds: gold label on
// Jev's gate call → one Opus diagnosis per gold-strategy group → revised option text as a candidate strategy VERSION → replay
// (experiment.js, stored baseline) on all labelled misses + a labelled-right sample → fixed ≥ 1 and broken = 0 promotes, else logged.
// Generic over gates (MISS_GATES: one registration per gate). Deps: jev-misses-repo, strategy-candidates-repo, strategy-edit, experiment.
import { MIN_CONFIDENCE } from '../scope-extract.js';
import { runExperiment } from './experiment.js';
import { IMPROVE_CFG } from '../assistant/strategy-gaps.js';
import { DESIGN_ROLE, parseCandidate } from '../assistant/strategy-design.js';
import { validateEdit } from '../assistant/strategy-edit.js';
import { isUnmatched } from '../assistant/strategy-seed.js';
import { saveCandidate, logDesign, promote, logPromotion } from '../repos/strategy-candidates-repo.js';
import { syncMisses, unlabelledMisses, markLabelled, pendingGroups, logFix, missCounts, listFixes } from '../repos/jev-misses-repo.js';

export const MISS_CFG = IMPROVE_CFG.miss_fix;
export const MISS_CALLER = 'improve-jev-miss-fix';
/** gate (calls.db task) → the question whose options are the strategies, and where a strategy name lives in the catalog. */
export const MISS_GATES = {
  'anis-strategy': { question: 'strategy', ownerOf: (cat, name) => (isUnmatched(name) ? null : cat.strategies.find((s) => s.name === name) || null) },
};

export const MISS_SYSTEM = `You diagnose why Jev, a small classifier, picked the WRONG strategy for a reader's message in Anís, a research assistant over a Bahá'í and interfaith library.
Jev reads the thread and chooses one OPTION by its description. A stronger check found that the GOLD option was the right one. For each example you get the thread
Jev saw, his choice and confidence, and the gold. Find the CLASS of cause and fix it in the option text, never one particular question.
Causes: gold-wording (the gold description does not name this class of request), confusable-option (another option's description claims it), missing-exemplar (the gold
description lacks the phrasing), thread-state (the thread, not the wording, hid the intent).
Answer with ONE JSON object and nothing else:
{"cause":"gold-wording|confusable-option|missing-exemplar|thread-state","why":"one or two sentences",
 "gold_description":"revised description of the GOLD option, 20-600 characters, naming the class of request",
 "gold_exemplars":["2-6 new class phrasings you wrote yourself (REQUIRED when the gold has fewer than 2 exemplars now, else optional)"],
 "confusable":{"name":"<the option that stole it>","description":"its revised description","exemplars":["2-6 phrasings, required when it has fewer than 2 now"]} or null}`;

/** The diagnosis message: the options (name: description), then the misses. Pure. */
export function diagnoseMessage({ gold, options, examples, exemplars = {} }) {
  const L = [`GOLD OPTION: ${gold}`, '', 'JEV\'S OPTIONS (name: description):', ...Object.entries(options).map(([k, v]) => `- ${k}: ${v}${exemplars[k] ? ` (exemplars now: ${exemplars[k].length})` : ''}`), '', `MISSES (${examples.length}):`];
  for (const e of examples) L.push(`--- Jev chose "${e.chose ?? '?'}" (confidence ${e.confidence ?? '?'}); gold "${gold}"`, 'THREAD AS JEV SAW IT:', String(e.state || '').slice(0, 1500));
  return L.join('\n');
}

/** Opus text → { cause, why, gold_description, gold_exemplars, confusable } | null. Pure (a JSON object; the descriptions are validated later). */
export function parseDiagnosis(text) {
  const j = parseCandidate(text);
  if (!j || typeof j.gold_description !== 'string') return null;
  const list = (x) => (Array.isArray(x) ? x.map((e) => String(e).trim()).filter(Boolean) : null);
  const c = j.confusable && typeof j.confusable === 'object' && typeof j.confusable.name === 'string' && typeof j.confusable.description === 'string' ? { ...j.confusable, exemplars: list(j.confusable.exemplars) } : null;
  return { cause: String(j.cause || ''), why: String(j.why || '').slice(0, 400), gold_description: j.gold_description.trim(),
    gold_exemplars: list(j.gold_exemplars), confusable: c };
}

/** Promote iff the replay fixed ≥ 1 target miss, broke nothing, dropped no right call below MIN_CONFIDENCE (and was not cut short). → { promote, failed, numbers }. Pure. */
export function decideMissFix(res, cfg = MISS_CFG) {
  const failed = [], fixed = res?.by_src?.target?.fixed ?? 0, broken = res?.broken ?? 0;
  if (!res?.labelled) failed.push('no labelled row was measured');
  if (fixed < 1) failed.push('fixed none of the target misses');
  const drops = res?.confidence_drops ?? 0;
  if (broken > 0) failed.push(`broke ${broken} previously right call(s)`);
  if (drops > (cfg.max_confidence_drops ?? 0)) failed.push(`${drops} right call(s) fall below the Jev confidence floor`);
  if (res?.truncated) failed.push(`stopped: ${res.truncated}`);
  return { promote: failed.length === 0, failed, numbers: { mean_current: res?.accuracy?.baseline ?? null, mean_candidate: res?.accuracy?.variant ?? null, n_class: res?.labelled ?? 0, fixed, broken, confidence_drops: drops,
    n_target: res?.by_src?.target?.n ?? 0, n_regress: res?.by_src?.regress?.n ?? 0, usd: res?.usd ?? 0 } };
}

/**
 * deps: { label(gate, ref, gold) → n labelled, calls(gate, ref) → bank rows of that turn, wrong(gate, n) → labelled-wrong rows, right(gate, n) → labelled sample,
 *   call(role, system, user, maxTokens, caller) → {text, usd}, rerun(task, state, questions), catalog() → cat }
 * One group of one gate per call (a unit of the loop). → 'idle' | { gate, gold, status, ... }. A spend cap propagates (the misses stay open).
 */
export async function missFixStage(db, { deps, gates = MISS_GATES, cfg = MISS_CFG } = {}) {
  for (const [gate, g] of Object.entries(gates)) {
    syncMisses(db, gate);
    // (1) gold label: the recheck's answer on the gate call of the turn (by the turn ref the Jev call carries); a call the gate never offered that option on stays unlabelled
    for (const m of unlabelledMisses(db, gate)) {
      if (!deps.label(gate, m.turn_id, m.gold)) continue;
      const c = (await deps.calls(gate, m.turn_id)).find((x) => x.gold?.[g.question] === m.gold);
      if (c) markLabelled(db, m.turn_id, c.id);
    }
    const group = pendingGroups(db, gate)[0];
    if (group) return fixGroup(db, { gate, g, group, deps, cfg });
  }
  return 'idle';
}

async function fixGroup(db, { gate, g, group, deps, cfg }) {
  const { gold, misses } = group, turnIds = misses.map((m) => m.turn_id), cat = await deps.catalog();
  const log = (status, o = {}, close = true) => ({ gate, gold, status, ...o, fix_id: logFix(db, { gate, gold, status, misses: misses.length, ...o }, close ? turnIds : []) });
  const goldRow = g.ownerOf(cat, gold);
  if (!goldRow) return log('no-strategy', { result: { why: `no active strategy "${gold}" to revise` } });
  const targets = (await deps.wrong(gate, cfg.targets_max)).filter((c) => c.gold?.[g.question] === gold);
  if (!targets.length) return log('no-target', { result: { why: 'no labelled call chose another option than the gold (nothing to replay)' } });
  const missIds = new Set(misses.map((m) => m.call_id)), shown = [...targets.filter((c) => missIds.has(c.id)), ...targets.filter((c) => !missIds.has(c.id))].slice(0, 6);
  const options = Object.fromEntries(Object.entries(shown[0].questions?.[g.question]?.criteria || {}));
  const d = await deps.call(DESIGN_ROLE, MISS_SYSTEM, diagnoseMessage({ gold, options, exemplars: Object.fromEntries(cat.strategies.map((s) => [s.name, s.exemplars || []])), examples: shown.map((c) => ({ state: c.state, chose: c.chosen?.[g.question], confidence: c.answers?.[g.question]?.confidence })) }), IMPROVE_CFG.design.max_tokens, MISS_CALLER);
  let usd = d.usd || 0;
  const dx = parseDiagnosis(d.text);
  if (!dx) return log('dropped', { targets: targets.length, usd, result: { why: 'unparseable diagnosis' } });
  // (3) the revised option text as candidate VERSIONS of the existing strategies (validated like an edit; same graph)
  const edits = [{ row: goldRow, description: dx.gold_description, exemplars: dx.gold_exemplars?.length ? dx.gold_exemplars : goldRow.exemplars }];
  const conf = dx.confusable && dx.confusable.name !== gold ? { row: g.ownerOf(cat, dx.confusable.name), description: dx.confusable.description.trim() } : null;
  if (conf?.row) edits.push({ ...conf, exemplars: dx.confusable.exemplars?.length ? dx.confusable.exemplars : conf.row.exemplars });
  const valid = edits.map((e) => ({ e, v: validateEdit({ name: e.row.name, description: e.description, exemplars: e.exemplars, graph: e.row.graph }, { strategy: e.row, cat }) }));
  const bad = valid.find((x) => !x.v.ok);
  if (bad) return log('dropped', { targets: targets.length, usd, result: { why: dx.why, cause: dx.cause, errors: bad.v.errors } });
  const saved = valid.map(({ e, v }) => ({ ...saveCandidate(db, v.normalized, { by: 'opus-miss-fix' }), name: e.row.name, description: e.description }));
  saved.forEach((s, i) => logDesign(db, { cluster_key: `miss:${gate}:${gold}`, label: `${s.name}: option text revised after ${misses.length} Jev miss(es) — ${dx.why}`.slice(0, 200), status: 'miss-fix', strategy_id: s.id, version: s.version, usd: i ? 0 : usd }));
  // (4) replay: the revised options substituted into every labelled miss of this gold + a labelled-right regression sample
  const tIds = new Set(targets.map((c) => c.id));
  const regress = (await deps.right(gate, cfg.regress_n)).filter((c) => c.correct === true && !tIds.has(c.id));
  const res = await runExperiment({ task: gate, baseline: 'stored', maxUsd: IMPROVE_CFG.theory.max_usd, minConfidence: MIN_CONFIDENCE,
    variant: { id: 'reword', params: { question: g.question, options: Object.fromEntries(saved.map((s) => [s.name, s.description])) } },
    rows: [...targets.map((c) => ({ ...c, src: 'target' })), ...regress.map((c) => ({ ...c, src: 'regress' }))] }, { rerun: deps.rerun });
  usd += res.usd || 0;
  const dec = decideMissFix(res, cfg), decision = { failed: dec.failed, numbers: dec.numbers };
  // (5) promote or log: a rejected version gets its ledger row so promotionStage never re-tries it
  for (const s of saved) {
    if (dec.promote) promote(db, s.id, s.version, { decision, usd, by: 'improve-miss-fix' });
    else logPromotion(db, { strategy_id: s.id, version: s.version, action: 'reject', decision, usd, by: 'improve-miss-fix' });
  }
  const capped = !dec.promote && /spend cap/.test(res.truncated || '');   // cut short by the spend cap: the misses stay open for a later, complete attempt
  return log(dec.promote ? 'promoted' : capped ? 'capped' : 'rejected', { targets: targets.length, usd, strategies: saved.map((s) => `${s.id}@${s.version}`),
    result: { why: dx.why, cause: dx.cause, ...dec.numbers, failed: dec.failed } }, !capped);
}

/** The live deps (improve worker). Lazy imports keep the reply path free of them. */
export async function liveMissDeps() {
  const [{ opusCall }, calls, sys, { catalog }] = await Promise.all([import('../assistant/strategy-design.js'), import('../repos/jev-calls-repo.js'), import('../systemone.js'), import('../repos/strategies-repo.js')]);
  return {
    label: (gate, ref, gold) => calls.labelByRef(gate, ref, gold, 'unmatched-recheck'),
    calls: (gate, ref) => calls.listCalls({ task: gate, ref, limit: 5 }),
    wrong: (gate, n) => calls.listCalls({ task: gate, gold: 'wrong', limit: n }),
    right: (gate, n) => calls.sampleBank(gate, { n }),
    call: opusCall, rerun: (task, state, questions) => sys.rerun(task, state, questions), catalog,
  };
}

/** The digest block: misses this period vs the one before (per 100 gate calls), fixes tried / promoted, by gold. A miss rate that does
 *  not fall is a defect. countCalls(gate, {from, to}) injected (ms). → { since, misses, calls, rate, prev_rate, trend, defect, fixes_tried, promoted, rejected, by_gold, fixes } */
export function missDigest(db, { since, now = Date.now(), countCalls, gate = 'anis-strategy' }) {
  const from = Date.parse(since), span = now - from, iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const sum = (rows) => rows.reduce((a, r) => a + r.n, 0);
  const cur = missCounts(db, gate, { from: iso(from), to: iso(now + 1000) }), prev = missCounts(db, gate, { from: iso(from - span), to: iso(from) });
  const cc = countCalls ? countCalls(gate, { from, to: now }) : 0, pc = countCalls ? countCalls(gate, { from: from - span, to: from }) : 0;
  const rate = cc ? +(100 * sum(cur) / cc).toFixed(2) : null, prevRate = pc ? +(100 * sum(prev) / pc).toFixed(2) : null;
  const fixes = listFixes(db, { since: iso(from) });
  return { since, gate, misses: sum(cur), calls: cc, rate, prev_rate: prevRate, trend: rate == null || prevRate == null ? null : rate < prevRate ? 'falling' : rate > prevRate ? 'rising' : 'flat',
    defect: sum(cur) > 0 && rate != null && prevRate != null && rate >= prevRate, fixes_tried: fixes.length, promoted: fixes.filter((f) => f.status === 'promoted').length,
    rejected: fixes.filter((f) => ['rejected', 'dropped'].includes(f.status)).length, by_gold: Object.fromEntries(cur.map((r) => [r.gold, r.n])),
    fixes: fixes.slice(0, 10).map((f) => ({ gold: f.gold, status: f.status, misses: f.misses, strategies: f.strategies, why: f.result?.why ?? null, failed: f.result?.failed ?? null })) };
}
