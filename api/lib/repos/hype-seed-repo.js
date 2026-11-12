// hype-seed-repo — question-bank HyPE seeds (pipeline/hype-bank-seed.js): which bank question × paragraph pairs were judged, and the write
// that merges a confirmed bank question into content.hyp_questions (same format/version as generated HyPE) + its provenance row in hype_bank_seeds.
// Merge = store.js mergeHype semantics: dedupe, ceiling 40, stamp kept (unstamped → 'linked:<version>', so the ¶'s own HyPE still runs).
import { queryAll, transaction } from '../db.js';

export const CEILING = 40;
const ph = (a) => a.map(() => '?').join(',');
const key = (q) => String(q?.q ?? q).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
const parse = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : v?.questions || []; } catch { return String(s || '').split('\n').filter(Boolean); } };

/** Pairs already judged at this version → Set('bankId|paraId') (seeded or rejected: neither is paid for twice). */
export async function judgedPairs(tradition, version) {
  const rows = await queryAll('SELECT bank_id, para_id FROM hype_bank_seeds WHERE tradition = ? AND version = ?', [tradition, version], 'hype-seed:judged');
  return new Set(rows.map((r) => `${r.bank_id}|${r.para_id}`));
}

/** The merge, pure: existing hyp_questions/hyp_model + new questions → { questions, stamp } or null when nothing is added. */
export function mergeQuestions(existingJson, model, add, version) {
  const have = parse(existingJson), seen = new Set(have.map(key));
  const fresh = add.filter((q) => { const k = key(q); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  if (!fresh.length || have.length >= CEILING) return null;
  return { questions: [...have, ...fresh].slice(0, CEILING), stamp: model || `linked:${version}` };
}

/** Judged pairs → one transaction: confirmed questions merged into their paragraphs + every verdict's provenance row.
 *  pairs: [{ bankId, question, paraId, docId, verdict: 'seeded'|'rejected', why? }] → { merged, recorded }. */
export async function saveBankSeeds(pairs, { tradition, version, at = new Date().toISOString() }) {
  if (!pairs.length) return { merged: 0, recorded: 0 };
  const seeded = pairs.filter((p) => p.verdict === 'seeded'), ids = [...new Set(seeded.map((p) => p.paraId))];
  const rows = ids.length ? await queryAll(`SELECT id, hyp_questions, hyp_model FROM content WHERE id IN (${ph(ids)}) AND deleted_at IS NULL`, ids, 'hype-seed:rows') : [];
  const stmts = [];
  for (const r of rows) {
    const m = mergeQuestions(r.hyp_questions, r.hyp_model, seeded.filter((p) => p.paraId === r.id).map((p) => p.question), version);
    if (m) stmts.push({ sql: 'UPDATE content SET hyp_questions = ?, hyp_model = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?', args: [JSON.stringify(m.questions), m.stamp, at, r.id] });
  }
  const merged = stmts.length;
  for (const p of pairs) stmts.push({ sql: `INSERT OR IGNORE INTO hype_bank_seeds (tradition, bank_id, question, para_id, doc_id, version, verdict, why, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [tradition, p.bankId, p.question, p.paraId, p.docId, version, p.verdict, p.why ? String(p.why).slice(0, 300) : null, at] });
  await transaction(stmts, 'hype-seed:save');
  return { merged, recorded: pairs.length };
}

/** Re-merge every seeded question of a tradition (free): a later HyPE regeneration of a ¶ replaces its questions, so the
 *  program calls this after a tier completes. → { paragraphs, merged, docIds }. */
export async function reapplySeeds(tradition, version, { at = new Date().toISOString() } = {}) {
  const seeds = await queryAll(`SELECT s.para_id, s.doc_id, s.question, c.hyp_questions, c.hyp_model FROM hype_bank_seeds s JOIN content c ON c.id = s.para_id
    WHERE s.tradition = ? AND s.verdict = 'seeded' AND c.deleted_at IS NULL`, [tradition], 'hype-seed:reapply');
  const by = new Map();
  for (const s of seeds) { const e = by.get(s.para_id) || { ...s, qs: [] }; e.qs.push(s.question); by.set(s.para_id, e); }
  const stmts = [], docIds = new Set();
  for (const e of by.values()) {
    const m = mergeQuestions(e.hyp_questions, e.hyp_model, e.qs, version);
    if (m) { stmts.push({ sql: 'UPDATE content SET hyp_questions = ?, hyp_model = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?', args: [JSON.stringify(m.questions), m.stamp, at, e.para_id] }); docIds.add(e.doc_id); }
  }
  if (stmts.length) await transaction(stmts, 'hype-seed:reapply');
  return { paragraphs: by.size, merged: stmts.length, docIds: [...docIds] };
}

/** Counts per tradition × verdict (the "countable" half of source 'bank'). */
export const seedCounts = () => queryAll('SELECT tradition, version, verdict, COUNT(*) AS n, COUNT(DISTINCT bank_id) AS questions, COUNT(DISTINCT para_id) AS paragraphs FROM hype_bank_seeds GROUP BY tradition, version, verdict', [], 'hype-seed:counts');
