// The strategy self-improvement LOOP (strategy graph Phase 3), run by the improve worker at the lowest priority (llm-class, async —
// never inline with a reply): capture gaps (free) → design a candidate for the first READY cluster (Opus) → replay-promote each
// candidate not yet tried (dry runs + the improve judge) → promote or reject, logged. Also the admin job behind
// POST /api/admin/anis/promote. Spend: every call is an improve-* caller (assertSpendCap in ai.js); a candidate stops at the
// config cap. Phase 4 (editStage): the analyst's DATA suggestions on one strategy → ONE Opus edit → candidate → replay → promoted
// (suggestions done) or rejected (suggestions rejected, first failed rule) — no human step. Deps: strategy-candidates-repo, strategy-gaps, strategy-design, strategy-promote, strategy-try.
import { catalog } from '../repos/strategies-repo.js';
import { recordGap, openGaps, logDesign, saveCandidate, listCandidates, pinFor, promote, logPromotion, listPromotions,
  ensureCandidatesSchema, heldQuestions, countDesigns, decisionFor } from '../repos/strategy-candidates-repo.js';
import { untestedDataSuggestions, testingSuggestions, markTesting, settleSuggestions, diagnosesFor } from '../repos/improve-repo.js';
import { groupDataSuggestions, uneditable, designEdit } from './strategy-edit.js';
import { gapOf, clusterGaps, IMPROVE_CFG } from './strategy-gaps.js';
import { designCandidate } from './strategy-design.js';
import { runPromotion, liveWriteQuestions, liveJudge } from './strategy-promote.js';

/** Free: a turn → a gap row when it is one. turn: { turnId, threadId, question, path, judge }. → 1 | 0 */
export function captureGap(db, turn) {
  const g = gapOf(turn);
  return g ? (recordGap(db, g), 1) : 0;
}

/** One design unit: the first ready cluster → a saved candidate (or a logged drop). → 'idle' | { design_id, ... } */
export async function designStage(db, { call, cat = catalog(), acts, stats = null } = {}) {
  ensureCandidatesSchema(db);
  const ready = clusterGaps(openGaps(db)).find((c) => c.ready);
  if (!ready) return 'idle';
  const pending = listCandidates(db);
  const d = await designCandidate(ready, { cat, ...(acts ? { acts } : {}), ...(call ? { call } : {}), stats, pending });
  const turnIds = ready.gaps.map((g) => g.turn_id);
  if (!d.ok) {
    const id = logDesign(db, { cluster_key: ready.key, label: ready.label, status: 'dropped', attempts: d.attempts, usd: d.usd, errors: d.errors, turn_ids: turnIds });
    return { design_id: id, status: 'dropped', errors: d.errors, usd: d.usd };
  }
  const saved = saveCandidate(db, d.normalized);
  const id = logDesign(db, { cluster_key: ready.key, label: ready.label, status: d.dedupe ? 'version' : 'new', strategy_id: saved.id, version: saved.version,
    attempts: d.attempts, usd: d.usd, errors: null, turn_ids: turnIds });
  return { design_id: id, status: d.dedupe ? 'version' : 'new', ...saved, dedupe: d.dedupe, usd: d.usd };
}

/** Live promotion deps, in-process (the API job): dry runs via strategy-try, Jev via chooseStrategy with the option added. */
export async function localPromotionDeps() {
  const { tryStrategy, optionsWith } = await import('./strategy-try.js');
  const { chooseStrategy } = await import('./strategy-choice.js');
  return {
    writeQuestions: liveWriteQuestions(), judge: liveJudge(),
    tryTurn: ({ question, pin }) => tryStrategy({ question, pin }),
    jevPick: async ({ question, pin }) => (await chooseStrategy([{ role: 'user', content: question }], { options: optionsWith(pin.row) }))?.strategy?.choice ?? null,
  };
}

/** Replay-promote id@version. dry = measure and log, never change status. → { id, version, promoted, decision, usd, rows } */
export async function promoteCandidate(db, { id, version, dry = false, deps = null, cat = catalog(), capUsd = IMPROVE_CFG.candidate_usd, by = 'improve', onProgress } = {}) {
  ensureCandidatesSchema(db);
  const pin = pinFor(db, id, version);
  if (!pin) throw new Error(`no strategy ${id}@${version}`);
  const run = await runPromotion({ pin, held: heldQuestions(db, id, pin.version), cat, deps: deps || await localPromotionDeps(), capUsd, onProgress });
  const decision = { ...run.decision, rows: run.rows.map((r) => ({ set: r.set, of: r.of ?? null, jev_pick: r.jev_pick ?? r.cand?.jev_pick ?? null,
    cand: r.cand ? { score: r.cand.score, ms: r.cand.ms, usd: r.cand.usd } : null, cur: r.cur ? { score: r.cur.score, ms: r.cur.ms, usd: r.cur.usd } : null })) };
  // the ledger keeps the numbers per row, never the question text (that stays in strategy_gaps)
  let promoted = false;
  if (run.decision.promote && !dry && pin.row.status !== 'active') { promote(db, id, pin.version, { decision, usd: run.usd, by }); promoted = true; }
  else logPromotion(db, { strategy_id: id, version: pin.version, action: dry ? 'dry' : run.decision.promote ? 'already-active' : 'reject', decision, usd: run.usd, by });
  return { id, version: pin.version, promoted, decision: run.decision, usd: run.usd, rows: run.rows.length };
}

/** The worker's promotion unit: the oldest candidate with no ledger row yet. → 'idle' | result */
export async function promotionStage(db, { deps } = {}) {
  ensureCandidatesSchema(db);
  const tried = new Set(listPromotions(db, { limit: 5000 }).map((p) => `${p.strategy_id}@${p.version}`));
  const next = listCandidates(db).reverse().find((c) => !tried.has(`${c.id}@${c.version}`));
  if (!next) return 'idle';
  return promoteCandidate(db, { id: next.id, version: next.version, deps });
}

const ts = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const keyOf = (k) => { const i = String(k).lastIndexOf('@'); return { id: k.slice(0, i), version: Number(k.slice(i + 1)) }; };
const r1 = (x) => (x == null ? '–' : Math.round(Number(x) * 10) / 10);

/** Settle every DATA suggestion whose candidate has a deciding ledger row: promoted → done "promoted id@vN: score a→b";
 *  rejected → rejected with the first failed rule. Reads the ledger, so a replay interrupted by a spend cap (finished later by
 *  promotionStage) still settles. → suggestions settled */
export function settleTested(db, improveDb) {
  const byCand = new Map();
  for (const r of testingSuggestions(improveDb)) { if (!byCand.has(r.candidate)) byCand.set(r.candidate, []); byCand.get(r.candidate).push(r.id); }
  let n = 0;
  for (const [key, ids] of byCand) {
    const { id, version } = keyOf(key);
    const dec = decisionFor(db, id, version);
    if (!dec) continue;
    const num = dec.decision?.numbers || {};
    if (dec.action === 'reject') settleSuggestions(improveDb, ids, 'rejected', `tried ${id}@v${version}, kept current: ${dec.decision?.failed?.[0] || 'not better'}`);
    else settleSuggestions(improveDb, ids, 'done', `promoted ${id}@v${version}: score ${r1(num.mean_current)}→${r1(num.mean_candidate)}`);
    n += ids.length;
  }
  return n;
}

const defaultBranches = async (id) => { try { return (await import('../repos/strategy-stats-repo.js')).branchStats(id, { days: 7 }); } catch { return null; } };

/** Phase 4 unit: settle what the ledger decided, then build ONE edit for the first strategy with untested DATA suggestions (at most
 *  cfg.edits_per_day edits a UTC day, counted from the design log) and replay-promote it at once. A group that cannot become an edit
 *  (no such strategy, the respond graph) is rejected with the reason; an invalid edit rejects its suggestions with the first error.
 *  A strategy with a candidate still under test waits. A spend cap propagates (suggestions stay open, the candidate is finished by
 *  promotionStage). → 'idle' | { settled } | { status, id, version, ... } */
export async function editStage(db, { improveDb, call, cat = catalog(), acts, stats = null, branches = defaultBranches, deps = null, cfg = IMPROVE_CFG, now = Date.now() } = {}) {
  ensureCandidatesSchema(db);
  if (!improveDb) return 'idle';
  let settled = settleTested(db, improveDb);
  const done = () => (settled ? { settled } : 'idle');
  const open = untestedDataSuggestions(improveDb);
  if (!open.length) return done();
  const groups = groupDataSuggestions(open, cat);
  // a suggestion that names no strategy (written before the field existed) stays open: no edit to make, but the diagnosis is kept
  for (const g of groups) { const why = g.name ? uneditable(g) : null; if (why) { settleSuggestions(improveDb, g.rows.map((r) => r.id), 'rejected', why); settled += g.rows.length; } }
  const busy = new Set(testingSuggestions(improveDb).map((r) => keyOf(r.candidate).id));
  const g = groups.find((x) => !uneditable(x) && !busy.has(x.strategy.id));
  if (!g) return done();
  if (countDesigns(db, { prefix: 'edit:', since: `${ts(now).slice(0, 10)} 00:00:00` }) >= (cfg.edits_per_day ?? 10)) return { ...(settled ? { settled } : {}), status: 'capped' };
  const ids = g.rows.map((r) => r.id);
  const diagnoses = diagnosesFor(improveDb, g.rows.flatMap((r) => { try { return JSON.parse(r.evidence_json || '[]'); } catch { return []; } }));
  const d = await designEdit(g, { cat, ...(acts ? { acts } : {}), ...(call ? { call } : {}), stats, branches: branches ? await branches(g.strategy.id) : null, diagnoses });
  const label = `${g.strategy.name}: ${(d.change || g.rows[0].change || '').slice(0, 160)}`;
  if (!d.ok) {
    logDesign(db, { cluster_key: `edit:${g.strategy.id}`, label, status: 'dropped', strategy_id: g.strategy.id, attempts: d.attempts, usd: d.usd, errors: d.errors });
    settleSuggestions(improveDb, ids, 'rejected', `edit invalid: ${d.errors?.[0] || 'no valid answer'}`);
    return { status: 'dropped', id: g.strategy.id, errors: d.errors, usd: d.usd, settled: settled + ids.length };
  }
  const saved = saveCandidate(db, d.normalized, { by: 'opus-edit' });
  logDesign(db, { cluster_key: `edit:${g.strategy.id}`, label, status: 'edit', strategy_id: saved.id, version: saved.version, attempts: d.attempts, usd: d.usd });
  markTesting(improveDb, ids, `${saved.id}@${saved.version}`);
  const r = await promoteCandidate(db, { id: saved.id, version: saved.version, deps, cat, capUsd: cfg.candidate_usd, by: 'improve-edit' });
  settled += settleTested(db, improveDb);
  return { status: r.promoted ? 'promoted' : 'rejected', id: saved.id, version: saved.version, failed: r.decision?.failed, usd: d.usd + r.usd, settled };
}
