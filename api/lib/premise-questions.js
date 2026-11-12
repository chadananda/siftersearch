// Implied-question list of one paragraph: premise_claims rows' questions_json → ordered, deduped strings. Pure; shared by the
// indexer (unit k = position) and premise-repo (hit k → question), so both always number the questions the same way.
export const MAX_QUESTIONS = 998;
const fold = (q) => String(q).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
/** rows in id order, each a JSON array string (or already an array) → ['Do the unborn have rights?', …] */
export function flattenQuestions(rows = []) {
  const seen = new Set(), out = [];
  for (const r of rows) {
    let list = r; if (typeof r === 'string') { try { list = JSON.parse(r); } catch { list = []; } }
    for (const q of Array.isArray(list) ? list : []) {
      const t = typeof q === 'string' ? q.trim() : '', k = fold(t);
      if (t && !seen.has(k)) { seen.add(k); out.push(t); }
    }
  }
  return out.slice(0, MAX_QUESTIONS);
}
