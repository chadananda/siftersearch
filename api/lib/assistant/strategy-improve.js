// The strategy self-improvement LOOP (strategy graph Phase 3), run by the improve worker at the lowest priority (llm-class, async —
// never inline with a reply): capture gaps (free) → design a candidate for the first READY cluster (Opus) → replay-promote each
// candidate not yet tried (dry runs + the improve judge) → promote or reject, logged. Also the admin job behind
// POST /api/admin/anis/promote. Spend: every call is an improve-* caller (assertSpendCap in ai.js); a candidate stops at the
// config cap. Deps: strategy-candidates-repo, strategy-gaps, strategy-design, strategy-promote, strategy-try.
import { catalog } from '../repos/strategies-repo.js';
import { recordGap, openGaps, logDesign, saveCandidate, listCandidates, pinFor, promote, logPromotion, listPromotions,
  ensureCandidatesSchema, heldQuestions } from '../repos/strategy-candidates-repo.js';
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
