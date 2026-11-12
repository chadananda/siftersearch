// premise-repo — premise_claims (migration 201): what a paragraph IMPLIES (premise-pilot → premise-reconcile → premise-ingest) and the
// implied questions made searchable by the indexer's `premises` field. Writes via db.js transaction (single writer); reads are bounded by id.
import { queryAll, transaction } from '../db.js';
import { flattenQuestions } from '../premise-questions.js';

const ph = (a) => a.map(() => '?').join(',');
export const INGEST_VERDICTS = ['keep', 'rescope', 'move'];

/** reconcile entries → rows to store (drop / skipped / unjudged excluded). rescope uses newPremise; move files it under movedTo. Pure. */
export const premiseRows = (entries = []) => entries.filter((e) => INGEST_VERDICTS.includes(e?.verdict) && e.paraId > 0 && e.docId > 0 && String(e.newPremise || e.premise || '').trim())
  .map((e) => ({ docId: Number(e.docId), paraId: Number(e.paraId), premise: String(e.newPremise || e.premise).trim(), implies: String(e.implies || '').trim(),
    questions: flattenQuestions([e.questions || []]).slice(0, 3), proof: e.proof ? String(e.proof) : null,
    concept: (e.verdict === 'move' && e.movedTo) || e.concept || null, basis: e.basis ? String(e.basis) : null, verdict: e.verdict }));

/** Rows for the paragraphs in `scope` (every paragraph the file judged) replace what those paragraphs had. → { paragraphs, rows }. */
export async function replacePremises(rows, paraIds, runFile = null) {
  const ids = [...new Set(paraIds.map(Number))];
  if (!ids.length) return { paragraphs: 0, rows: 0 };
  const stmts = [];
  for (let i = 0; i < ids.length; i += 500) { const ch = ids.slice(i, i + 500); stmts.push({ sql: `DELETE FROM premise_claims WHERE para_id IN (${ph(ch)})`, args: ch }); }
  for (const r of rows) stmts.push({ sql: `INSERT INTO premise_claims (doc_id, para_id, external_para_id, premise, implies, questions_json, proof, concept, basis, verdict, run_file)
    VALUES (?, ?, (SELECT COALESCE(external_para_id, 'p' || id) FROM content WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [r.docId, r.paraId, r.paraId, r.premise, r.implies, JSON.stringify(r.questions), r.proof, r.concept, r.basis, r.verdict, runFile] });
  await transaction(stmts, 'premise:replace');
  return { paragraphs: ids.length, rows: rows.length };
}

/** For search hits [{ paragraph_id, k }] → Map(paragraph_id → { question, premise, implies, proof }). The question is the hit's k-th of the
 *  paragraph's flattened questions (the indexer's numbering); premise/implies/proof from the row that carries that question. */
export async function impliedFor(hits) {
  const ids = [...new Set(hits.map((h) => Number(h.paragraph_id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await queryAll(`SELECT para_id, premise, implies, proof, questions_json FROM premise_claims WHERE para_id IN (${ph(ids)}) ORDER BY id`, ids, 'premise:implied');
  const by = new Map();
  for (const r of rows) (by.get(r.para_id) || by.set(r.para_id, []).get(r.para_id)).push(r);
  const out = new Map();
  for (const h of hits) {
    const pid = Number(h.paragraph_id), list = by.get(pid); if (!list || out.has(pid)) continue;
    const question = flattenQuestions(list.map((r) => r.questions_json))[Number(h.k) || 0];
    const row = list.find((r) => flattenQuestions([r.questions_json]).some((q) => q === question)) || list[0];
    out.set(pid, { question: question || null, premise: row.premise, implies: row.implies || null, proof: row.proof || null });
  }
  return out;
}

export const premiseCounts = () => queryAll('SELECT verdict, COUNT(*) AS n, COUNT(DISTINCT para_id) AS paragraphs, COUNT(DISTINCT doc_id) AS docs FROM premise_claims GROUP BY verdict', [], 'premise:counts');
