// Carry enrichment across a re-ingest (Chad 10-11: "Re-ingest the 1,810 books but try to carry the enrichment across").
// A re-ingest replaces rows whose text drifted from the file (merged, split, markup); this maps each REPLACED old row to
// the new row(s) holding its words, so derived work moves with the text instead of being lost. Pure.
const words = (t) => String(t || '').replace(/⁅\/?(?:s|ph)\d+⁆/g, ' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/** containment of a in b: share of a's words found in b (multiset-free, set based). */
function containment(aSet, bSet) {
  if (!aSet.size) return 0;
  let n = 0; for (const w of aSet) if (bSet.has(w)) n++;
  return n / aSet.size;
}

/**
 * oldRows / newRows: [{ id, text }]. → Map(oldId → [{ id, score }]) best first. A new row qualifies when either side is
 * contained in the other at ≥ minScore (a merged old row ⊇ its new pieces; an old piece ⊆ its new merged row).
 */
export function mapRows(oldRows, newRows, { minScore = 0.9, minWords = 3 } = {}) {
  const nw = newRows.map((r) => ({ id: r.id, set: new Set(words(r.text)) }));
  const out = new Map();
  for (const o of oldRows) {
    const os = new Set(words(o.text));
    if (os.size < minWords) { out.set(o.id, []); continue; }
    const cands = [];
    for (const n of nw) {
      if (!n.set.size) continue;
      const s = Math.max(containment(os, n.set) * Math.min(1, n.set.size / os.size) ** 0.25, containment(n.set, os) * Math.min(1, os.size / n.set.size) ** 0.25);
      if (s >= minScore) cands.push({ id: n.id, score: +s.toFixed(3) });
    }
    out.set(o.id, cands.sort((a, b) => b.score - a.score));
  }
  return out;
}

export const CARRY_COLUMNS = ['hyp_questions', 'hyp_thesis', 'hyp_model', 'context', 'context_model', 'para_meta', 'authors', 'authors_model',
  'extract_model', 'text_grounded', 'grounding_confidence', 'original_text', 'original_lang', 'translation_text'];

/** Column values to copy from an old row onto a new one: only where old has a value and new has none. */
export function columnsToCarry(oldRow, newRow) {
  const set = {};
  for (const c of CARRY_COLUMNS) {
    const v = oldRow[c];
    if (v == null || v === '') continue;
    if (newRow[c] != null && newRow[c] !== '') continue;
    set[c] = v;
  }
  return set;
}
