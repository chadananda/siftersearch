// Generator-output integrity — the detector for a paragraph a stage marked PROCESSED while producing NOTHING.
//
// THE INCIDENT (2026-06-02 → 2026-08-27): `api/lib/ai.js` sent DeepSeek's `thinking` parameter as
// `extra_body` — a Python-SDK idiom that openai@6 for Node drops — so thinking was never disabled on any
// DeepSeek call. deepseek-v4-flash spent its whole max_tokens budget reasoning and returned content of
// length 0 with finish_reason:"length". Every caller saw an unparseable response rather than a truncation,
// exhausted its retry ladder, and stamped the paragraph done with empty output. On Some Answered Questions
// that was 536 of 778 paragraphs (69%) — stamped at the current version, unreachable by search, and never
// eligible for retry again, because resume is BY STAMP.
//
// WHY NOTHING NOTICED: `docs-repo.enrichmentCoverage` counts `hyp_questions IS NOT NULL`, and an emptied
// paragraph holds '[]' — not NULL. So a gutted book reported 100% hyped. The same shape as the canonical
// incident next door in canonical-integrity.js: a steady-state defect that every transition-watching check
// reads as health.
//
// THE DISCRIMINATOR IS THE LENGTH CURVE, NOT THE COUNT. Some paragraphs legitimately yield nothing — a
// two-word fragment has no questions in it, and a paragraph naming no one yields no entity claims. What
// this bug looks like is emptiness that RISES WITH PARAGRAPH LENGTH (SAQ: 23% under 200 chars, 92% over
// 900, 100% over 1500), because a longer passage needs more reasoning before it can answer. A book whose
// empties are concentrated in its SHORT paragraphs is healthy; one whose long paragraphs are empty is not.
//
// Deps: db (read-only).
import { queryAll } from './db.js';

const LONG = 900;    // the length above which SAQ's failure rate hit 92% — the signature band
const PROSE = `COALESCE(blocktype,'paragraph') IN ('paragraph','quote')`;
const EMPTY_HYPE = `(c.hyp_questions IS NULL OR TRIM(c.hyp_questions) IN ('', '[]', 'null'))`;

/**
 * Per-document HyPE emptiness: stamped by the generator, holding no questions.
 * `emptyLongPct` is the number to read; `emptyShortPct` is the control.
 */
export async function emptiedHype({ query = queryAll, minStamped = 20 } = {}) {
  const rows = await query(`
    SELECT c.doc_id, d.title, d.file_path, d.language,
           COUNT(*)                                                          stamped,
           SUM(${EMPTY_HYPE})                                                empty,
           SUM(LENGTH(c.text) >= ${LONG})                                    long_stamped,
           SUM(LENGTH(c.text) >= ${LONG} AND ${EMPTY_HYPE})                  long_empty,
           SUM(LENGTH(c.text) <  ${LONG})                                    short_stamped,
           SUM(LENGTH(c.text) <  ${LONG} AND ${EMPTY_HYPE})                  short_empty,
           GROUP_CONCAT(DISTINCT c.hyp_model)                                versions
      FROM content c JOIN docs d ON d.id = c.doc_id
     WHERE c.hyp_model IS NOT NULL AND c.deleted_at IS NULL AND ${PROSE}
     GROUP BY c.doc_id
    HAVING stamped >= ?
     ORDER BY long_empty DESC, empty DESC`, [minStamped], 'audit:emptied-hype');
  return rows.map(shape);
}

/** Same shape for disambiguation, whose terminal failure writes a KNOWN marker rather than an empty string. */
export async function emptiedDisambig({ query = queryAll, minStamped = 20 } = {}) {
  const empty = `(c.context IS NULL OR TRIM(c.context) = '' OR c.context LIKE '%[unresolvable:%')`;
  const rows = await query(`
    SELECT c.doc_id, d.title, d.file_path, d.language,
           COUNT(*) stamped, SUM(${empty}) empty,
           SUM(LENGTH(c.text) >= ${LONG}) long_stamped,
           SUM(LENGTH(c.text) >= ${LONG} AND ${empty}) long_empty,
           SUM(LENGTH(c.text) <  ${LONG}) short_stamped,
           SUM(LENGTH(c.text) <  ${LONG} AND ${empty}) short_empty,
           GROUP_CONCAT(DISTINCT c.context_model) versions
      FROM content c JOIN docs d ON d.id = c.doc_id
     WHERE c.context_model IS NOT NULL AND c.deleted_at IS NULL AND ${PROSE}
     GROUP BY c.doc_id
    HAVING stamped >= ?
     ORDER BY long_empty DESC, empty DESC`, [minStamped], 'audit:emptied-disambig');
  return rows.map(shape);
}

/**
 * Extraction is the WEAKEST of the three signals and must be read as such: a paragraph that names nobody
 * legitimately yields zero claims, so a high empty rate is not on its own evidence of the bug. Only the
 * long/short split carries information here.
 */
export async function emptiedExtract({ query = queryAll, minStamped = 20 } = {}) {
  const empty = `NOT EXISTS (SELECT 1 FROM entity_claims ec WHERE ec.para_id = CAST(c.id AS TEXT))
             AND NOT EXISTS (SELECT 1 FROM concept_claims cc WHERE cc.para_id = CAST(c.id AS TEXT))`;
  const rows = await query(`
    SELECT c.doc_id, d.title, d.file_path, d.language,
           COUNT(*) stamped, SUM(${empty}) empty,
           SUM(LENGTH(c.text) >= ${LONG}) long_stamped,
           SUM(LENGTH(c.text) >= ${LONG} AND (${empty})) long_empty,
           SUM(LENGTH(c.text) <  ${LONG}) short_stamped,
           SUM(LENGTH(c.text) <  ${LONG} AND (${empty})) short_empty,
           GROUP_CONCAT(DISTINCT c.extract_model) versions
      FROM content c JOIN docs d ON d.id = c.doc_id
     WHERE c.extract_model IS NOT NULL AND c.deleted_at IS NULL AND ${PROSE}
     GROUP BY c.doc_id
    HAVING stamped >= ?
     ORDER BY long_empty DESC, empty DESC`, [minStamped], 'audit:emptied-extract');
  return rows.map(shape);
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

// SUSPECT = the long paragraphs are the ones that came back empty. That is the bug's fingerprint and it is
// what separates it from a book that simply has little to say. A flat or inverted curve is NOT this defect,
// however many empties it has — say so rather than reporting a count and letting the reader assume.
function shape(r) {
  const emptyLongPct = pct(r.long_empty, r.long_stamped);
  const emptyShortPct = pct(r.short_empty, r.short_stamped);
  return {
    docId: r.doc_id, title: r.title, path: r.file_path, language: r.language,
    stamped: r.stamped, empty: r.empty, emptyPct: pct(r.empty, r.stamped),
    longStamped: r.long_stamped, longEmpty: r.long_empty, emptyLongPct,
    shortStamped: r.short_stamped, shortEmpty: r.short_empty, emptyShortPct,
    versions: r.versions,
    verdict: r.long_stamped < 5 ? 'too-few-long-paragraphs-to-judge'
      : emptyLongPct >= 50 && emptyLongPct > emptyShortPct ? 'SUSPECT: long paragraphs emptied'
      : emptyLongPct >= 50 ? 'empty but curve is flat — check separately'
      : 'healthy',
  };
}
