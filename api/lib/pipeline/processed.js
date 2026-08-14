// THE definition of "this stage has PROCESSED this paragraph", in one place, for every stage.
//
// The rule that governs all of it: DONE MEANS THE WORK WAS DONE, NEVER THAT IT PRODUCED OUTPUT. We cannot
// know in advance whether a paragraph HAS a disambiguation to make or a hypothetical question worth asking,
// and we will not invent one to satisfy a counter. So completion is measured by the stage's VERSION STAMP —
// proof the stage ran on that paragraph at that version — and the output column is free to be empty.
// Measuring output instead cost two separate multi-hour outages on 2026-08-13 (disambiguation, then hype).
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
            (SELECT COUNT(*) FROM content WHERE ${live} AND ${HYPE_DONE_SQL}) hyped,
            (SELECT COUNT(*) FROM content WHERE ${live} AND length(trim(text)) >= ${Number(hypeMinLen)}) hypeable`;
}


// ── HYPE ──────────────────────────────────────────────────────────────────────────────────────────────
// Same doctrine, same shape. content.hyp_model (migration 98) is the generator's version stamp — the
// analogue of context_model — and it is the ONLY honest completion signal: a paragraph can be legitimately
// processed and yield no questions (a heading fragment, a publisher line, a list of dates), and inventing
// questions to make a counter go up would poison the retrieval index it exists to serve.
//
// The gate previously counted `hyp_questions IS NOT NULL`, so a paragraph the generator could not handle
// was indistinguishable from one never attempted; books 519 and 12443 ran every stage, verified searchable,
// and were re-queued forever (2026-08-13).
//
// LEGACY CLAUSE: hyp_model arrived in migration 98, so rows hyped before it carry questions with no stamp.
// They ARE processed, and re-running millions of paragraphs to prove it would be worse than the bug. The
// `OR hyp_questions IS NOT NULL` arm covers exactly those, and can be dropped once a backfill stamps them.
export const HYPE_DONE_SQL = '(hyp_model IS NOT NULL OR hyp_questions IS NOT NULL)';

/** JS predicate for the stage's own resume filter. Stamped at the CURRENT version ⇒ nothing more to do. */
export function isHyped(paragraph, version) {
  if (paragraph?.hypModel && paragraph.hypModel === version) return true;   // processed at this version
  if (paragraph?.hypModel) return false;                                    // older version → upgrade wanted
  // Unstamped legacy row: fall back to the old evidence (questions present) so it is not redone for nothing.
  try { const a = JSON.parse(paragraph?.hyp ?? 'null'); return Array.isArray(a) && a.length >= 1; }
  catch { return false; }
}

/** The hype completion bar. Separate from the disambiguation bar because the stages differ in nature. */
export const HYPE_THRESHOLD = 0.9;
export function meetsHypeBar(hyped, hypeable, threshold = HYPE_THRESHOLD) {
  if (!hypeable) return true;                 // nothing hypeable ⇒ nothing blocking
  return hyped / hypeable >= threshold;
}
