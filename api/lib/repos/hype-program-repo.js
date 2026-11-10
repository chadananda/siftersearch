// hype-program-repo — reads for the HyPE program: which paragraphs still need HyPE at a version (per doc, optionally with the
// paragraph's authors for tiering), per-doc totals, and the written questions of given rows (for the 1% grader). Read-only.
// "Done" mirrors processed.js isHyped: stamped at the version, or unstamped with questions. Callers: pipeline/hype-tiers.js, hype-program.js.
import { queryAll } from '../db.js';

const MIN_LEN = 60;   // retrieval.js MIN_LEN: shorter paragraphs are never planned
const DONE = `(hyp_model = ? OR (COALESCE(hyp_model, '') = '' AND LENGTH(COALESCE(hyp_questions, '')) > 2))`;
const ELIGIBLE = `deleted_at IS NULL AND blocktype IN ('paragraph','quote') AND LENGTH(text) >= ${MIN_LEN}`;
const ph = (a) => a.map(() => '?').join(',');
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Eligible paragraphs of the docs → [{ id, doc_id, len, done, authors? }] (authors only when asked: the column is large).
 *  pendingOnly drops the done ones. Chunked by doc so no read is long. */
export async function hypeParagraphs(docIds, version, { authors = false, pendingOnly = false } = {}) {
  const out = [];
  for (const ch of chunks(docIds, 200)) {
    const rows = await queryAll(`SELECT id, doc_id, LENGTH(text) AS len, ${DONE} AS done${authors ? ', authors' : ''} FROM content
      WHERE doc_id IN (${ph(ch)}) AND ${ELIGIBLE}${pendingOnly ? ` AND NOT ${DONE}` : ''} ORDER BY doc_id, paragraph_index`,
    pendingOnly ? [version, ...ch, version] : [version, ...ch], 'hype-program:paragraphs');
    for (const r of rows) out.push({ ...r, done: !!r.done });   // never push(...rows): a big chunk overflows the call stack
  }
  return out;
}

/** Per-doc totals → Map(docId → { total, done, pending, longN, longChars }) — longN/longChars = pending paragraphs over 4000
 *  characters (sliced into several requests). Aggregates only: no row leaves the database. */
export async function paragraphTotals(docIds, version) {
  const m = new Map();
  for (const ch of chunks(docIds, 200)) {
    const rows = await queryAll(`SELECT doc_id, COUNT(*) AS total, SUM(${DONE}) AS done,
        SUM(CASE WHEN NOT ${DONE} AND LENGTH(text) > 4000 THEN 1 ELSE 0 END) AS long_n,
        SUM(CASE WHEN NOT ${DONE} AND LENGTH(text) > 4000 THEN LENGTH(text) ELSE 0 END) AS long_chars
      FROM content WHERE doc_id IN (${ph(ch)}) AND ${ELIGIBLE} GROUP BY doc_id`, [version, version, version, ...ch], 'hype-program:totals');
    for (const r of rows) m.set(r.doc_id, { total: r.total, done: r.done || 0, pending: r.total - (r.done || 0), longN: r.long_n || 0, longChars: r.long_chars || 0 });
  }
  return m;
}

/** The written questions (and passage) of content rows, by id → [{ id, doc_id, text, original_text, hyp_questions, hyp_model }]. */
export async function hypeRows(ids) {
  const out = [];
  for (const ch of chunks(ids, 500)) for (const r of await queryAll(`SELECT id, doc_id, text, original_text, hyp_questions, hyp_model FROM content WHERE id IN (${ph(ch)})`, ch, 'hype-program:rows')) out.push(r);
  return out;
}
