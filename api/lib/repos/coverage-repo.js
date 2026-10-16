// coverage-repo — the index coverage ledger (index_coverage, migration 150; planning/index-coverage-plan.md): per document
// × layer, how many paragraphs exist, have the derived data, have it at the current version, and are searchable.
// measureDoc() reads ONE document (doc_id indexes) plus Qdrant counts (doc_id payload index, ~2 ms) — never a scan;
// the dashboard reads only this table. Callers: ops coverage-refresh + the reports worker's rolling refresh, admin route.
// Deps: db.js; Qdrant over HTTP (QDRANT_URL/QDRANT_KEY).
import { queryOne, queryAll, transaction } from '../db.js';

export const LAYERS = ['text', 'embedding', 'keyword', 'phrase', 'sections', 'context', 'hype', 'entities', 'concepts', 'alignment', 'translation'];
const QD = () => process.env.QDRANT_URL || 'http://127.0.0.1:6333';

/** Points in a Qdrant collection for one document (exact count on the doc_id payload index). null when unreachable. */
export async function qdrantCount(collection, docId, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(`${QD()}/collections/${collection}/points/count`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' },
      body: JSON.stringify({ filter: { must: [{ key: 'doc_id', match: { value: Number(docId) } }] }, exact: true }), signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return (await r.json())?.result?.count ?? null;
  } catch { return null; }
}

/** Every layer's numbers for one document → [{ layer, total, generated, current, indexed, version }]. */
export async function measureDoc(docId, { hypeVersion, count = qdrantCount } = {}) {
  const id = Number(docId);
  const doc = await queryOne('SELECT language FROM docs WHERE id = ?', [id]);
  if (!doc) return [];
  const c = await queryOne(`SELECT COUNT(*) AS total, SUM(synced = 1) AS synced, SUM(embedding IS NOT NULL) AS embedded,
      SUM(LENGTH(COALESCE(context, '')) > 0) AS context, SUM(LENGTH(COALESCE(hyp_questions, '')) > 2) AS hype,
      SUM(hyp_model = ?) AS hype_current, SUM(extract_model IS NOT NULL) AS extracted,
      SUM(LENGTH(COALESCE(translation, '')) > 0) AS translated
    FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0`, [hypeVersion || '', id], 'coverage:content');
  const total = c?.total || 0;
  const [mentions, concepts, aligned, sections, kw, phrase, hype, conceptPts] = await Promise.all([
    queryOne(`SELECT COUNT(DISTINCT para_id) AS n FROM entity_mentions_v2 WHERE doc_id = ? AND status = 'active'`, [id], 'coverage:mentions'),
    queryOne('SELECT COUNT(DISTINCT para_id) AS n FROM concept_claims WHERE doc_id = ? AND proof_ok = 1', [id], 'coverage:concepts'),
    queryOne(`SELECT COUNT(DISTINCT c.id) AS n FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL AND (
        EXISTS (SELECT 1 FROM content_alignment a WHERE a.trans_id = c.id AND a.retired_at IS NULL) OR
        EXISTS (SELECT 1 FROM content_alignment a WHERE a.orig_id = c.id AND a.retired_at IS NULL))`, [id], 'coverage:alignment'),
    queryOne('SELECT COUNT(*) AS n, COALESCE(SUM(paragraphs), 0) AS paras FROM doc_sections WHERE doc_id = ?', [id], 'coverage:sections'),
    count('paragraphs_kw', id), count('phrases', id), count('hype', id), count('concepts', id),
  ]);
  const nonEnglish = !/^en/i.test(String(doc.language || 'en'));
  const row = (layer, generated, current, indexed, version = null, t = total) => ({ layer, total: t, generated: generated || 0, current: current ?? generated ?? 0, indexed: indexed ?? 0, version });
  return [
    row('text', total, total, c?.synced),
    row('embedding', c?.embedded, c?.embedded, c?.synced),
    row('keyword', total, total, kw),                                   // Qdrant points ≈ paragraphs
    row('phrase', total, total, phrase),                                // points = phrase units (several per paragraph)
    row('sections', sections?.n, sections?.n, sections?.n, null, sections?.n || 0),
    row('context', c?.context, c?.context, null),                       // feeds HyPE/extraction; not searched itself
    row('hype', c?.hype, c?.hype_current, hype, hypeVersion),           // points = questions
    row('entities', c?.extracted, c?.extracted, mentions?.n),
    row('concepts', concepts?.n, concepts?.n, conceptPts),              // points = claims
    row('alignment', aligned?.n, aligned?.n, 0),                        // not indexed as a layer yet
    row('translation', nonEnglish ? c?.translated : 0, nonEnglish ? c?.translated : 0, 0, null, nonEnglish ? total : 0),
  ];
}

/** Write one document's rows (replace). */
export async function saveCoverage(docId, rows, at = Math.floor(Date.now() / 1000)) {
  if (!rows.length) return 0;
  await transaction(rows.map((r) => ({ sql: `INSERT INTO index_coverage (doc_id, layer, total, generated, current, indexed, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(doc_id, layer) DO UPDATE SET total = excluded.total, generated = excluded.generated,
      current = excluded.current, indexed = excluded.indexed, version = excluded.version, updated_at = excluded.updated_at`,
  args: [Number(docId), r.layer, r.total, r.generated, r.current, r.indexed, r.version, at] })), 'coverage:save');
  return rows.length;
}

/** Live documents never measured, then the stalest measured — the rolling refresh's next batch. */
export async function stalestDocs(limit = 300) {
  const fresh = await queryAll(`SELECT d.id FROM docs d WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM index_coverage i WHERE i.doc_id = d.id AND i.layer = 'text') ORDER BY d.id LIMIT ?`, [limit], 'coverage:unmeasured');
  if (fresh.length >= limit) return fresh.map((r) => r.id);
  const old = await queryAll(`SELECT i.doc_id AS id FROM index_coverage i JOIN docs d ON d.id = i.doc_id
    WHERE i.layer = 'text' AND d.deleted_at IS NULL AND d.duplicate_of IS NULL ORDER BY i.updated_at LIMIT ?`, [limit - fresh.length], 'coverage:stalest');
  return [...fresh, ...old].map((r) => r.id);
}

/** The dashboard: per tradition × scope × layer sums, plus how fresh the measurements are. Reads only the ledger. */
export async function coverageSummary() {
  const rows = await queryAll(`SELECT d.religion, COALESCE(d.scope, 'primary') AS scope, i.layer, COUNT(*) AS docs,
      SUM(i.total) AS total, SUM(i.generated) AS generated, SUM(i.current) AS current, SUM(i.indexed) AS indexed,
      MIN(i.updated_at) AS oldest, MAX(i.updated_at) AS newest
    FROM index_coverage i JOIN docs d ON d.id = i.doc_id WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
    GROUP BY 1, 2, 3`, [], 'coverage:summary');
  const live = await queryOne('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL', [], 'coverage:live');
  const measured = await queryOne(`SELECT COUNT(*) AS n FROM index_coverage WHERE layer = 'text'`, [], 'coverage:measured');
  return { live_docs: live?.n || 0, measured_docs: measured?.n || 0, rows };
}

/** One document's ledger rows. */
export const docCoverage = (docId) =>
  queryAll('SELECT layer, total, generated, current, indexed, version, updated_at FROM index_coverage WHERE doc_id = ? ORDER BY layer', [Number(docId)], 'coverage:doc');
