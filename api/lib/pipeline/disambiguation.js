// THE definition of "this paragraph is disambiguated", in one place.
//
// It used to live in five: rag-adapter/store.js (the gate's coverage SQL), pipeline/queue.js
// (isDoneFromArtifacts + reachedBound), pipeline/plan.js (resumeStageFor), rag/kernel/gate.js (the
// threshold) and rag/enrich/disambiguate.js (the worker's resume predicate). They drifted — the worker
// keyed on a version stamp while every measure keyed on the note, and the gate sat at 0.99 while the resume
// bar sat at 0.98 — and books ground to a halt reporting "did not reach verify" forever with zero model
// calls. Three of the five were patched separately on 2026-08-12; this removes the possibility of a fourth.
//
// Rules that must stay together, because they only make sense together:
//   1. DONE = the stage PROCESSED the paragraph, i.e. `context IS NOT NULL`. NOT that it produced an
//      entity: the stage writes '' for a paragraph it examined and found nothing to resolve, which is a
//      complete result. Measuring entity YIELD brands sparse books incomplete forever.
//   2. The bar is 0.98 EVERYWHERE. A gate stricter than the resume bar strands every book in the gap:
//      the follower calls disambiguation done and resumes from a later stage, which then fails the gate
//      forever without re-running disambiguate.
//   3. The population is live prose only (paragraph|quote, not deleted). Counting headers or deleted rows
//      inflates coverage past 100% and books "complete" without being processed.

/** Live prose only — the population every measure must agree on. */
export const PROSE_SQL = "blocktype IN ('paragraph','quote') AND deleted_at IS NULL";

/** DONE for SQL. Processed, not yielded. */
export const DISAMB_DONE_SQL = 'context IS NOT NULL';

/** The single coverage bar. Gate, resume, and done-check all read this. */
export const DISAMB_THRESHOLD = 0.98;

/**
 * DONE for JS, for the worker's resume filter. Requires BOTH the current version stamp AND a note: a
 * paragraph carrying a stamp with no note (re-ingest can carry the columns forward independently) is NOT
 * done, and treating it as done is what made a book unworkable while every measure called it incomplete.
 * An empty-string note IS done.
 */
export function isDisambiguated(paragraph, version) {
  return paragraph?.contextModel === version && paragraph?.context != null;
}

/** Coverage → does it clear the bar? One function so no caller invents its own comparison. */
export function meetsDisambBar(done, total, threshold = DISAMB_THRESHOLD) {
  if (!total) return true;                 // nothing to disambiguate ⇒ nothing blocking
  return done / total >= threshold;
}

/**
 * The four per-doc counts every stage decision is made from — prose / disambiguated / hyped / hypeable.
 * queue.js (the bound check) and plan.js (the resume decision) each hand-rolled this SELECT; when the
 * disambiguated column drifted in one, the two disagreed and books stalled. One builder ⇒ they cannot.
 * `hypeMinLen` is passed in because it belongs to the hype stage, not to this measure.
 */
export function coverageSelect(hypeMinLen) {
  const live = `doc_id=? AND ${PROSE_SQL}`;
  return `SELECT (SELECT COUNT(*) FROM content WHERE ${live}) prose,
            (SELECT COUNT(*) FROM content WHERE ${live} AND ${DISAMB_DONE_SQL}) disamb,
            (SELECT COUNT(*) FROM content WHERE ${live} AND hyp_questions IS NOT NULL) hyped,
            (SELECT COUNT(*) FROM content WHERE ${live} AND length(trim(text)) >= ${Number(hypeMinLen)}) hypeable`;
}
