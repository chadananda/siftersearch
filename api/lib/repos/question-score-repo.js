// question-score-repo — 1-5 ratings of questions (stated or implied) from the Implication browser (Chad 11-12). Key = (para_id, folded question, rater).
// Stated questions have no row of their own, so the folded text identifies them. Callers: routes/implied-admin.js, implied/service.js. 1 = "stupid", 5 = "excellent".
import { query, queryAll, queryOne } from '../db.js';

export const fold = (q) => String(q ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
const now = () => new Date().toISOString();
const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });
const out = (r) => ({ id: r.id, paraId: r.para_id, question: r.question, kind: r.kind, impliedId: r.implied_id, score: r.score, tags: r.tags ? JSON.parse(r.tags) : [], note: r.note || null, rater: r.rater, updatedAt: r.updated_at });

/** Upsert one rater's score. → the stored score */
export async function setScore({ paraId, question, kind = 'stated', impliedId = null, score, tags = null, note = null }, rater = '') {
  const s = Number(score), q = String(question ?? '').trim();
  if (!Number.isInteger(s) || s < 1 || s > 5) throw bad('score must be 1-5');
  if (!paraId || !q) throw bad('paraId and question are required');
  if (!['stated', 'implied'].includes(kind)) throw bad('kind must be stated or implied');
  const t = Array.isArray(tags) && tags.length ? JSON.stringify(tags.map(String)) : null, at = now();
  await query(`INSERT INTO question_scores (para_id, question, q_fold, kind, implied_id, score, tags, note, rater, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(para_id, q_fold, rater) DO UPDATE SET score = excluded.score, tags = excluded.tags, note = excluded.note, question = excluded.question, kind = excluded.kind, implied_id = excluded.implied_id, updated_at = excluded.updated_at`,
  [Number(paraId), q, fold(q), kind, impliedId == null ? null : Number(impliedId), s, t, note ? String(note) : null, rater || '', at, at], 'qscore:set');
  return out(await queryOne('SELECT * FROM question_scores WHERE para_id = ? AND q_fold = ? AND rater = ?', [Number(paraId), fold(q), rater || ''], 'qscore:get'));
}

/** Remove one rater's score. → { removed } */
export async function clearScore({ paraId, question }, rater = '') {
  const r = await query('DELETE FROM question_scores WHERE para_id = ? AND q_fold = ? AND rater = ?', [Number(paraId), fold(question), rater || ''], 'qscore:clear');
  return { removed: r?.rows?.[0]?.changes ?? r?.changes ?? 0 };
}

/** One query for many questions [{ paraId, question }] → Map('paraId|folded' → { score, tags, note }) for this rater. */
export async function scoresFor(pairs, rater = '') {
  const m = new Map(), ids = [...new Set((pairs || []).map((p) => Number(p.paraId)).filter(Boolean))];
  if (!ids.length) return m;
  const rows = await queryAll(`SELECT para_id, q_fold, score, tags, note FROM question_scores WHERE rater = ? AND para_id IN (${ids.map(() => '?').join(',')})`, [rater || '', ...ids], 'qscore:for');
  for (const r of rows) m.set(`${r.para_id}|${r.q_fold}`, { score: r.score, tags: r.tags ? JSON.parse(r.tags) : [], note: r.note || null });
  return m;
}
export const keyOf = (paraId, question) => `${Number(paraId)}|${fold(question)}`;

/** Newest first, optionally only scores ≤ max / of one kind, with the doc. cursor = offset. → { rows, next } */
export async function listScores({ max, kind, limit = 50, cursor = 0 } = {}) {
  const where = ['1=1'], args = [];
  if (max) { where.push('s.score <= ?'); args.push(Number(max)); }
  if (kind) { where.push('s.kind = ?'); args.push(kind); }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200), off = Math.max(Number(cursor) || 0, 0);
  const rows = await queryAll(`SELECT s.*, d.id AS d_id, d.title AS d_title, d.author AS d_author, d.religion AS d_religion, d.collection AS d_collection, d.slug AS d_slug, c.paragraph_index
    FROM question_scores s LEFT JOIN content c ON c.id = s.para_id LEFT JOIN docs d ON d.id = c.doc_id WHERE ${where.join(' AND ')} ORDER BY s.updated_at DESC, s.id DESC LIMIT ? OFFSET ?`, [...args, lim + 1, off], 'qscore:list');
  return { rows: rows.slice(0, lim).map((r) => ({ ...out(r), docId: r.d_id, paragraphIndex: r.paragraph_index, doc: { title: r.d_title, author: r.d_author, religion: r.d_religion, collection: r.d_collection, slug: r.d_slug } })), next: rows.length > lim ? String(off + lim) : null };
}

/** Counts per score and kind, top tags, worst recent. */
export async function scoreStats() {
  const byScore = await queryAll('SELECT score, COUNT(*) n FROM question_scores GROUP BY score', [], 'qscore:stats-score');
  const byKind = await queryAll('SELECT kind, COUNT(*) n, ROUND(AVG(score), 2) avg FROM question_scores GROUP BY kind', [], 'qscore:stats-kind');
  const tagRows = await queryAll('SELECT tags FROM question_scores WHERE tags IS NOT NULL', [], 'qscore:stats-tags');
  const tags = new Map();
  for (const r of tagRows) for (const t of JSON.parse(r.tags)) tags.set(t, (tags.get(t) || 0) + 1);
  const { rows: worst } = await listScores({ max: 2, limit: 10 });
  return { total: byScore.reduce((n, r) => n + r.n, 0), byScore: Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, byScore.find((r) => r.score === s)?.n || 0])),
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, { n: r.n, avg: r.avg }])), topTags: [...tags].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 12), worst };
}
