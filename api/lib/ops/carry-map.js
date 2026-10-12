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
      const inOld = containment(n.set, os);   // the new row is (part of) the old one — a genuine split piece when ≥ 0.95
      const s = Math.max(containment(os, n.set) * Math.min(1, n.set.size / os.size) ** 0.25, inOld * Math.min(1, os.size / n.set.size) ** 0.25);
      if (s >= minScore) cands.push({ id: n.id, score: +s.toFixed(3), piece: inOld >= 0.95 && n.set.size < os.size });
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

const parseQs = (raw) => {
  if (!raw) return [];
  if (String(raw).startsWith('[')) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map((q) => String(q).trim()).filter(Boolean); } catch { /* text */ } }
  return String(raw).split('\n').map((q) => q.trim()).filter(Boolean);
};

/**
 * Plan the column carry for a doc: every replaced old row → its best new row. Several old rows landing on ONE new row
 * (a merge) pool their HyPE questions (union, order kept) instead of keeping only the first; other columns take the
 * first non-empty value, and never overwrite what the new row already has. → [{ id, set }]
 */
export function planColumns(replaced, map, newById) {
  const byTarget = new Map();
  for (const o of replaced) { const b = map.get(o.id)?.[0]; if (b) (byTarget.get(b.id) || byTarget.set(b.id, []).get(b.id)).push(o); }
  const out = [];
  for (const [tid, olds] of byTarget) {
    const cur = newById.get(tid) || {};
    const set = {};
    const qs = [...parseQs(cur.hyp_questions)];
    for (const o of olds) for (const q of parseQs(o.hyp_questions)) if (!qs.includes(q)) qs.push(q);
    if (qs.length && qs.length !== parseQs(cur.hyp_questions).length) set.hyp_questions = JSON.stringify(qs);
    for (const c of CARRY_COLUMNS) {
      if (c === 'hyp_questions' || set[c] != null) continue;
      if (cur[c] != null && cur[c] !== '') continue;
      const v = olds.map((o) => o[c]).find((x) => x != null && x !== '');
      if (v != null) set[c] = v;
    }
    if (Object.keys(set).length) out.push({ id: tid, set });
  }
  return out;
}

/** The new rows an old row's LINKS move to: every genuine split piece, else the single best match. */
export const linkTargets = (cands = []) => { const pieces = cands.filter((c) => c.piece); return pieces.length > 1 ? pieces : cands.slice(0, 1); };

export const countQuestions = (rows) => rows.reduce((n, r) => n + parseQs(r.hyp_questions).length, 0);
