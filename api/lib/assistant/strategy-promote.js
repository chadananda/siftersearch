// Replay PROMOTION of a candidate strategy (strategy graph Phase 3). Never tuned to particular questions: the test set is
// (1) up to n_fresh FRESH class questions Opus writes from the candidate's description alone, (2) the gap cluster's questions,
// HELD OUT (never shown to the designer's question writer), (3) n_guard GUARD questions of OTHER active strategies (their
// exemplars, else Opus-written from their descriptions). Class questions run as a dry run twice — candidate forced, current
// route — and both replies go to the improve judge (score 0-10). Guards only ask Jev (with the candidate's option added).
// decidePromotion (pure) promotes when: mean score better by `margin`; no question worse by more than `max_regress`; p50 ms and
// mean $/turn within ms_ratio / usd_ratio of the current route; Jev picks the candidate for ≥ jev_class_share of class questions
// and for at most jev_guard_max guards. A per-candidate $ cap (config candidate_usd) stops the run (decision: over-budget).
// Also (Chad 11-08, distinguishable): `replay` = the option added to Jev and up to regress_n REAL labelled strategy calls re-asked
// (jev-tuning/experiment.js, stored baseline): a call that changes away from its label (broken) or falls from ≥ MIN_CONFIDENCE
// below it (confidence_drops) rejects the candidate.
// Planner (11-09): deps.nodeTests({pin}) runs the node tests (every decide edge); a decide node under node_pass_bar rejects the candidate naming it;
// a cost/time cut at equal quality (promote.equal_eps, saving) is promotable without the margin. Deps (injectable): writeQuestions, tryTurn, judge, jevPick, replay, nodeTests. Config: config/strategy-improve.json.
import { IMPROVE_CFG } from './strategy-gaps.js';
import { isUnmatched } from './strategy-seed.js';
import { DESIGN_ROLE, opusCall } from './strategy-design.js';

export const QUESTIONS_CALLER = 'improve-strategy-questions', JUDGE_CALLER = 'improve-strategy-judge';

export const QUESTIONS_SYSTEM = `You write TEST QUESTIONS for a research assistant over a Bahá'í and interfaith library.
Given one strategy's description (a CLASS of request), write varied, realistic reader questions that belong to that class — different
topics, lengths and phrasings, as real readers would ask. Then, for the OTHER strategies listed, write questions that clearly belong
to THEM and not to the first class. Answer with ONE JSON object and nothing else:
{"class":["..."],"guard":[{"strategy":"<other name>","question":"..."}]}`;

const firstJson = (t) => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
const median = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mean = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((n, x) => n + x, 0) / a.length : null; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/** A judge verdict → 0-10. The judge's own `score` when it gives one; else pass 10, weak 10 − 3·severity. An unreadable verdict
 *  (verdict null) is UNJUDGED → null, never a made-up 4: it drops out of the means and is counted. Pure. */
export const scoreOf = (j) => (j == null || (j.verdict == null && j.score == null) ? null : Number.isFinite(Number(j.score)) && j.score !== null ? Math.max(0, Math.min(10, Number(j.score)))
  : j.verdict === 'pass' ? 10 : Math.max(0, 10 - 3 * (Number(j.severity) || 2)));

/** The question set. → { questions: [{ question, set: 'fresh'|'held'|'historic'|'guard', of? }], usd, fresh: [to freeze] | null }.
 *  frozen (the strategy's frozen class set, jev-theories-repo classSet) → reused as is, no Opus call; else Opus writes it and
 *  `fresh` is returned for the caller to freeze. historic = real questions this strategy served (forensics), measured as class rows.
 *  Pure apart from `writeQuestions`. */
export async function questionSet({ row, held = [], cat, writeQuestions, nFresh = IMPROVE_CFG.promote.n_fresh, nGuard = IMPROVE_CFG.promote.n_guard, frozen = null, historic = [] }) {
  const heldSet = new Set(held.map((q) => q.trim()));
  const hist = [...new Set(historic.map((q) => String(q || '').trim()).filter((q) => q && !heldSet.has(q)))].map((question) => ({ question, set: 'historic' }));
  const tail = [...held.map((question) => ({ question, set: 'held' })), ...hist];
  if (frozen?.length) {
    const f = frozen.filter((q) => !heldSet.has(q.question) && !hist.some((h) => h.question === q.question));
    return { questions: [...f.filter((q) => q.set === 'fresh'), ...tail, ...f.filter((q) => q.set === 'guard')], usd: 0, fresh: null };
  }
  const others = cat.strategies.filter((s) => s.id !== row.id && !isUnmatched(s.name) && s.name !== row.name);
  const fromExemplars = [];
  for (let i = 0; fromExemplars.length < nGuard && others.some((s) => (s.exemplars || [])[i]); i++)
    for (const s of others) if (s.exemplars?.[i] && fromExemplars.length < nGuard) fromExemplars.push({ question: s.exemplars[i], set: 'guard', of: s.name });
  const w = await writeQuestions({ row, others, nFresh, nGuard: nGuard - fromExemplars.length });
  const fresh = (w.class || []).map((q) => String(q).trim()).filter((q) => q && !heldSet.has(q)).slice(0, nFresh).map((question) => ({ question, set: 'fresh' }));
  const guards = [...fromExemplars, ...(w.guard || []).filter((g) => g?.question && others.some((s) => s.name === g.strategy))
    .map((g) => ({ question: String(g.question), set: 'guard', of: g.strategy }))].slice(0, nGuard);
  return { questions: [...fresh, ...tail, ...guards], usd: w.usd || 0, fresh: [...fresh, ...guards] };
}

/** The decision over measured rows. rows: class rows { set, cand:{score, ms, usd, jev_pick}, cur:{score, ms, usd} } and guard
 *  rows { set:'guard', jev_pick }. → { promote, failed: [reasons], numbers }. Pure. */
export function decidePromotion(rows, { name, cfg = IMPROVE_CFG.promote, replay = null, nodes = null, nodeBar = IMPROVE_CFG.planner?.node_pass_bar ?? 0.8 } = {}) {
  const cls = rows.filter((r) => r.set !== 'guard' && r.cand?.score != null && r.cur?.score != null);
  const guards = rows.filter((r) => r.set === 'guard');
  const asked = rows.filter((r) => r.set !== 'guard' && (r.cand || r.cur)).length, unjudged = asked - cls.length;
  const failed = [];
  if (!cls.length) failed.push('no class question was measured');
  else if (unjudged * 2 > asked) failed.push(`judge unreadable on ${unjudged}/${asked} class questions: too few measured`);
  const mc = mean(cls.map((r) => r.cand.score)), mu = mean(cls.map((r) => r.cur.score));
  const worst = cls.reduce((w, r) => (r.cur.score - r.cand.score > (w?.drop ?? -Infinity) ? { question: r.question, drop: r.cur.score - r.cand.score } : w), null);
  const p50c = median(cls.map((r) => r.cand.ms)), p50u = median(cls.map((r) => r.cur.ms));
  const usdC = mean(cls.map((r) => r.cand.usd)), usdU = mean(cls.map((r) => r.cur.usd));
  const picks = cls.filter((r) => r.cand.jev_pick === name).length;
  const steals = guards.filter((r) => r.jev_pick === name).length;
  const share = cls.length ? picks / cls.length : 0;
  // IMPROVE edits that cut cost/time at equal quality are promotable: quality within equal_eps of the current route and $/turn or p50 down by `saving`
  const saving = cfg.saving ?? 0.2, costSaving = cls.length > 0 && mc - mu >= -(cfg.equal_eps ?? 0.2) && ((usdU > 0 && usdC <= usdU * (1 - saving)) || (p50u > 0 && p50c <= p50u * (1 - saving)));
  if (cls.length && !(mc - mu >= cfg.margin) && !costSaving) failed.push(`mean score ${r3(mc)} vs ${r3(mu)}: not better by ${cfg.margin}`);
  if (worst && worst.drop > cfg.max_regress) failed.push(`regression of ${worst.drop} on one question (max ${cfg.max_regress})`);
  if (p50c != null && p50u != null && p50c > p50u * cfg.ms_ratio) failed.push(`p50 ${p50c} ms vs ${p50u} ms (max ×${cfg.ms_ratio})`);
  if (usdC != null && usdU != null && usdC > Math.max(usdU * cfg.usd_ratio, usdU + 0.001)) failed.push(`$/turn ${r3(usdC)} vs ${r3(usdU)} (max ×${cfg.usd_ratio})`);
  if (cls.length && share < cfg.jev_class_share) failed.push(`Jev picks it for ${picks}/${cls.length} class questions (need ${cfg.jev_class_share})`);
  if (steals > cfg.jev_guard_max) failed.push(`Jev picks it for ${steals} guard question(s) of other strategies (max ${cfg.jev_guard_max})`);
  const broken = replay?.broken ?? 0, drops = replay?.confidence_drops ?? 0;
  if (broken > (cfg.max_replay_broken ?? 0)) failed.push(`re-asking ${replay.labelled} real labelled strategy calls with it added: ${broken} now go to another option (max ${cfg.max_replay_broken ?? 0})`);
  if (drops > (cfg.max_confidence_drops ?? 0)) failed.push(`${drops} real call(s) fall from confident to below the Jev floor with it added (max ${cfg.max_confidence_drops ?? 0})`);
  if (replay?.truncated) failed.push(`real-call replay stopped: ${replay.truncated}`);
  // node tests (planner): any decide node under its pass bar rejects the candidate, naming the node
  const weak = Object.entries(nodes?.nodes || {}).filter(([, n]) => n.rate < nodeBar).map(([node, n]) => ({ node, rate: n.rate, pass: n.pass, total: n.total }));
  for (const w of weak) failed.push(`node ${w.node}: ${w.pass}/${w.total} node tests pass (${w.rate}; bar ${nodeBar})`);
  return { promote: failed.length === 0, failed, nodes: nodes ? { rate: nodes.rate, per_node: nodes.nodes, failed: nodes.failed, weak } : null, cost_saving: costSaving, numbers: { replay_n: replay?.labelled ?? 0, replay_broken: broken, replay_confidence_drops: drops, n_class: cls.length, n_guard: guards.length, mean_candidate: r3(mc), mean_current: r3(mu),
    worst_drop: worst?.drop ?? null, unjudged, p50_ms_candidate: p50c, p50_ms_current: p50u, usd_turn_candidate: r3(usdC), usd_turn_current: r3(usdU),
    jev_class_picks: picks, jev_guard_steals: steals } };
}

/**
 * Run the replay for one candidate pin. deps: { writeQuestions({row, others, nFresh, nGuard}) → {class, guard, usd},
 * tryTurn({question, pin}) → {reply, path, ms, usd, jev_pick}, judge({question, reply, path}) → {verdict, score, usd},
 * jevPick({question, pin}) → name }. Stops at capUsd. → { decision, rows, usd, stopped }
 */
export async function runPromotion({ pin, held = [], cat, deps, capUsd = IMPROVE_CFG.candidate_usd, cfg = IMPROVE_CFG.promote, onProgress = () => {},
  frozen = null, historic = [], onFreeze = null }) {
  const row = pin.row;
  let usd = 0, stopped = null;
  const qs = await questionSet({ row, held, cat, writeQuestions: deps.writeQuestions, nFresh: cfg.n_fresh, nGuard: cfg.n_guard, frozen, historic });
  if (qs.fresh?.length && onFreeze) { try { onFreeze(qs.fresh); } catch { /* freezing is a saving, never a failure */ } }
  usd += qs.usd;
  // the real-call replay: only when the candidate adds or rewords an option (a pinned graph Jev already routes to, keepChoice, adds none)
  let replay = null;
  if (deps.replay && !pin.keepChoice) { replay = await deps.replay({ pin, n: cfg.regress_n }); usd += replay?.usd || 0; }
  // node tests: every decide edge of the planned tree (Jev replayed on its test inputs; tools vs fixtures)
  const nodes = deps.nodeTests ? await deps.nodeTests({ pin }).catch((e) => ({ nodes: {}, failed: [{ node: '(runner)', edge: null, got: String(e?.message || e) }], rate: null })) : null;
  const rows = [];
  for (const q of qs.questions) {
    if (usd >= capUsd) { stopped = 'over-budget'; break; }
    if (q.set === 'guard') { rows.push({ ...q, jev_pick: await deps.jevPick({ question: q.question, pin }).catch(() => null) }); continue; }
    const [cand, cur] = await Promise.all([deps.tryTurn({ question: q.question, pin }), deps.tryTurn({ question: q.question, pin: null })]);   // side by side: the job fits its 30-min window
    const [jc, ju] = await Promise.all([deps.judge({ question: q.question, reply: cand.reply, path: cand.path }), deps.judge({ question: q.question, reply: cur.reply, path: cur.path })]);
    usd += (cand.usd || 0) + (cur.usd || 0) + (jc?.usd || 0) + (ju?.usd || 0);
    rows.push({ ...q, cand: { score: scoreOf(jc), ms: cand.ms, usd: cand.usd, jev_pick: cand.jev_pick, why: jc?.why ?? null },
      cur: { score: scoreOf(ju), ms: cur.ms, usd: cur.usd, why: ju?.why ?? null } });
    onProgress({ done: rows.length, of: qs.questions.length, usd });
  }
  const decision = stopped ? { promote: false, failed: [`stopped: ${stopped} ($${r3(usd)} of $${capUsd})`], numbers: decidePromotion(rows, { name: row.name, cfg, replay, nodes }).numbers }
    : decidePromotion(rows, { name: row.name, cfg, replay, nodes });
  return { decision, rows, usd: Math.round(usd * 1e6) / 1e6, stopped };
}

// ── the live deps ──
/** Opus writes the class + guard questions (billed improve-strategy-questions). */
export function liveWriteQuestions(call = opusCall) {
  return async ({ row, others, nFresh, nGuard }) => {
    const user = [`STRATEGY ${row.name}: ${row.description}`, `Write ${nFresh} class questions.`,
      nGuard > 0 ? `OTHER STRATEGIES (write ${nGuard} guard questions, spread across them):\n${others.map((s) => `- ${s.name}: ${s.description}`).join('\n')}` : 'Write no guard questions.'].join('\n\n');
    const r = await call(DESIGN_ROLE, QUESTIONS_SYSTEM, user, 1500, QUESTIONS_CALLER);
    const j = firstJson(r.text) || {};
    return { class: Array.isArray(j.class) ? j.class : [], guard: Array.isArray(j.guard) ? j.guard : [], usd: r.usd || 0 };
  };
}
/** The improve judge (audit/improve.js rubric, Opus, billed improve-strategy-judge) on one dry-run reply. */
export function liveJudge(call = opusCall) {
  return async ({ question, reply, path }) => {
    const { JUDGE_SYSTEM, JUDGE_ROLE, judgeMessage, parseJudge, turnFromPath, itemsForTurn } = await import('../audit/improve.js');
    const item = itemsForTurn(turnFromPath({ question, reply, path: path || {} }), { messageId: 'dry-run' }).reply;
    // one retry on an unreadable verdict; still unreadable → unjudged (score null), with the head of the raw text as the why
    let usd = 0, r = null, j = null;
    for (let i = 0; i < 2 && !j; i++) { r = await call(JUDGE_ROLE, JUDGE_SYSTEM, judgeMessage(item), 1500, JUDGE_CALLER); usd += r.usd || 0; j = parseJudge(r.text); }
    return j ? { ...j, usd } : { verdict: null, score: null, usd, why: `unjudged: ${String(r?.text ?? '').slice(0, 200) || '(empty reply)'}` };
  };
}
