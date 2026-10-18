// coverage-repo — the index coverage ledger (index_coverage, migration 150; planning/index-coverage-plan.md): per document
// × layer, how many paragraphs exist, have the derived data, have it at the current version, and are searchable.
// measureDoc() reads ONE document (doc_id indexes) plus Qdrant counts (doc_id payload index, ~2 ms) — never a scan;
// the dashboard reads only this table. Callers: ops coverage-refresh + the reports worker's rolling refresh, admin route.
// Deps: db.js; Qdrant over HTTP (QDRANT_URL/QDRANT_KEY).
import { queryOne, queryAll, transaction } from '../db.js';
import { getAuthority } from '../authority.js';

/** Doctrinal core (Chad 10-16: "probably doctrinal core first"): scripture and authoritative interpretation, authority ≥ 8. */
export const CORE_AUTHORITY = 8;
export const isCore = (doc) => { try { return getAuthority(doc) >= CORE_AUTHORITY; } catch { return false; } };

/** A document shorter than this (paragraphs with text) is a single work — a tablet, a letter, a talk: it needs no TOC. */
export const STRUCTURE_NEEDED_FROM = 60;

export const LAYERS = ['text', 'embedding', 'keyword', 'phrase', 'sections', 'refs', 'context', 'hype', 'entities', 'concepts', 'alignment', 'translation'];
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
  const doc = await queryOne('SELECT language, title, author, religion, collection, source_site FROM docs WHERE id = ?', [id]);
  if (!doc) return [];
  const c = await queryOne(`SELECT COUNT(*) AS total, SUM(synced = 1) AS synced, SUM(embedding IS NOT NULL) AS embedded,
      SUM(LENGTH(COALESCE(context, '')) > 0) AS context, SUM(LENGTH(COALESCE(hyp_questions, '')) > 2) AS hype,
      SUM(hyp_model = ?) AS hype_current, SUM(extract_model IS NOT NULL) AS extracted,
      SUM(LENGTH(COALESCE(translation, '')) > 0) AS translated, SUM(LENGTH(COALESCE(text, '')) > 0) AS texted,
      SUM(json_extract(block_attrs, '$.pn') IS NOT NULL) AS with_pn, SUM(pdf_page IS NOT NULL) AS with_page,
      SUM(json_extract(block_attrs, '$.pn') IS NOT NULL OR pdf_page IS NOT NULL) AS with_ref
    FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0`, [hypeVersion || '', id], 'coverage:content');
  const total = c?.total || 0;
  const [mentions, concepts, aligned, sections, kw, phrase, hype, conceptPts, structure, kwSkip] = await Promise.all([
    queryOne(`SELECT COUNT(DISTINCT para_id) AS n FROM entity_mentions_v2 WHERE doc_id = ? AND status = 'active'`, [id], 'coverage:mentions'),
    queryOne('SELECT COUNT(DISTINCT para_id) AS n FROM concept_claims WHERE doc_id = ? AND proof_ok = 1', [id], 'coverage:concepts'),
    queryOne(`SELECT COUNT(DISTINCT c.id) AS n FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL AND (
        EXISTS (SELECT 1 FROM content_alignment a WHERE a.trans_id = c.id AND a.retired_at IS NULL) OR
        EXISTS (SELECT 1 FROM content_alignment a WHERE a.orig_id = c.id AND a.retired_at IS NULL))`, [id], 'coverage:alignment'),
    queryOne('SELECT COUNT(*) AS n, COALESCE(SUM(paragraphs), 0) AS paras FROM doc_sections WHERE doc_id = ?', [id], 'coverage:sections'),
    count('paragraphs_kw', id), count('phrases', id), count('hype', id), count('concepts', id),
    queryOne('SELECT sections FROM doc_structure WHERE doc_id = ?', [id], 'coverage:structure'),
    queryOne(`SELECT n FROM layer_unindexable WHERE doc_id = ? AND layer = 'keyword'`, [id], 'coverage:unindexable'),
  ]);
  // a count that failed (Qdrant busy, timeout) is UNKNOWN, not zero: keep the document's last good figure (10-16: zeros
  // from timed-out counts made phrase/keyword coverage appear to shrink by ~66K paragraphs an hour)
  const prev = Object.fromEntries((await queryAll('SELECT layer, indexed FROM index_coverage WHERE doc_id = ?', [id], 'coverage:prev')).map((r) => [r.layer, r.indexed]));
  const known = (n, layer) => (n == null ? prev[layer] ?? null : n);
  const [kwN, phraseN, hypeN, conceptN] = [known(kw, 'keyword'), known(phrase, 'phrase'), known(hype, 'hype'), known(conceptPts, 'concepts')];
  const kwTotal = Math.max(0, (c?.texted ?? total) - (kwSkip?.n || 0));
  const nonEnglish = !/^en/i.test(String(doc.language || 'en'));
  const core = isCore(doc) ? 1 : 0;
  const row = (layer, generated, current, indexed, version = null, t = total) => ({ layer, total: t, generated: generated || 0, current: current ?? generated ?? 0, indexed: indexed ?? 0, version, core });
  return [
    row('text', total, total, c?.synced),
    row('embedding', c?.embedded, c?.embedded, c?.synced),
    // Qdrant points ≈ paragraphs that HAVE WORDS: empty rows and markup-only rows ('|', '##') can never have a point
    // (10-17: 197 documents read 'short' forever and keyword-fill re-sent their 203K paragraphs every 10 minutes)
    row('keyword', kwTotal, kwTotal, kwN, null, kwTotal),
    row('phrase', total, total, phraseN),                                // points = phrase units (several per paragraph)
    // structure is per DOCUMENT: total 1; generated 1 when structure was FOUND (Chad 10-17: "often it is not" embedded as
    // headings — reading every document is not the same as having its structure) OR is NOT NEEDED: a short single work —
    // a tablet, a letter, a talk (Chad 10-17: "largely independent tablets") — once read; current 1 once read; indexed = sections
    row('sections', sections?.n || (structure && (c?.texted ?? total) < STRUCTURE_NEEDED_FROM) ? 1 : 0, structure ? 1 : 0, sections?.n || 0, null, 1),
    // traditional references (Chad 10-17): generated = a traditional number (verse, section, saying — block_attrs.pn),
    // indexed = a print page (pdf_page), current = either; total = paragraphs with text
    row('refs', c?.with_pn, c?.with_ref, c?.with_page, null, c?.texted ?? total),
    row('context', c?.context, c?.context, null),                       // feeds HyPE/extraction; not searched itself
    row('hype', c?.hype, c?.hype_current, hypeN, hypeVersion),           // points = questions
    row('entities', c?.extracted, c?.extracted, mentions?.n),
    row('concepts', concepts?.n, concepts?.n, conceptN),              // points = claims
    row('alignment', aligned?.n, aligned?.n, 0),                        // not indexed as a layer yet
    row('translation', nonEnglish ? c?.translated : 0, nonEnglish ? c?.translated : 0, 0, null, nonEnglish ? total : 0),
  ];
}

// One document's ledger rows as totals contributions (live, non-duplicate documents only — the same on both sides).
const DOC_ROWS = `SELECT COALESCE(d.religion, 'Other') AS religion, i.layer, i.core, i.total, i.generated, i.current, i.indexed
  FROM index_coverage i JOIN docs d ON d.id = i.doc_id WHERE i.doc_id = ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL`;
const REACHED = 'CASE WHEN o.indexed > 0 THEN o.total ELSE 0 END', WITH_DATA = 'CASE WHEN o.generated > 0 THEN 1 ELSE 0 END';

/** Write one document's rows (replace) AND move coverage_totals by the difference, in one transaction: its old rows
 *  are subtracted, the new ones added — the totals never need the whole ledger re-summed (Chad 10-16). */
export async function saveCoverage(docId, rows, at = Math.floor(Date.now() / 1000)) {
  if (!rows.length) return 0;
  const id = Number(docId);
  await transaction([
    { sql: `UPDATE coverage_totals SET docs = coverage_totals.docs - 1, total = coverage_totals.total - o.total, generated = coverage_totals.generated - o.generated,
        current = coverage_totals.current - o.current, indexed = coverage_totals.indexed - o.indexed, reached = coverage_totals.reached - (${REACHED}),
        docs_with = coverage_totals.docs_with - (${WITH_DATA})
      FROM (${DOC_ROWS}) AS o WHERE coverage_totals.religion = o.religion AND coverage_totals.layer = o.layer AND coverage_totals.core = o.core`, args: [id] },
    ...rows.map((r) => ({ sql: `INSERT INTO index_coverage (doc_id, layer, total, generated, current, indexed, version, core, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(doc_id, layer) DO UPDATE SET total = excluded.total, generated = excluded.generated,
      current = excluded.current, indexed = excluded.indexed, version = excluded.version, core = excluded.core, updated_at = excluded.updated_at`,
    args: [id, r.layer, r.total, r.generated, r.current, r.indexed, r.version, r.core ? 1 : 0, at] })),
    { sql: `INSERT INTO coverage_totals (religion, layer, core, docs, total, generated, current, indexed, reached, docs_with)
      SELECT o.religion, o.layer, o.core, 1, o.total, o.generated, o.current, o.indexed, ${REACHED}, ${WITH_DATA} FROM (${DOC_ROWS}) AS o WHERE true
      ON CONFLICT(religion, layer, core) DO UPDATE SET docs = docs + excluded.docs, total = total + excluded.total, generated = generated + excluded.generated,
        current = current + excluded.current, indexed = indexed + excluded.indexed, reached = reached + excluded.reached, docs_with = docs_with + excluded.docs_with`, args: [id] },
  ], 'coverage:save');
  return rows.length;
}

/** A layer met paragraphs it cannot index in a document (keyword: no words) — the ledger leaves them out of its total. */
export const saveUnindexable = (docId, layer, n) => transaction([{ sql: `INSERT INTO layer_unindexable (doc_id, layer, n, at) VALUES (?, ?, ?, ?)
  ON CONFLICT(doc_id, layer) DO UPDATE SET n = excluded.n, at = excluded.at`, args: [Number(docId), layer, n, Math.floor(Date.now() / 1000)] }], 'coverage:unindexable-save');

/** The section index just read a document: move its ledger 'sections' row (1 of 1, indexed = sections) without
 *  re-measuring every layer, keeping the document's core flag. */
export async function saveStructureCoverage(docId, sections) {
  const id = Number(docId);
  const core = (await queryOne(`SELECT core FROM index_coverage WHERE doc_id = ? AND layer = 'text'`, [id], 'coverage:core-of'))?.core ?? 0;
  const short = (await queryOne(`SELECT total FROM index_coverage WHERE doc_id = ? AND layer = 'text'`, [id], 'coverage:size-of'))?.total < STRUCTURE_NEEDED_FROM;
  return saveCoverage(id, [{ layer: 'sections', total: 1, generated: sections || short ? 1 : 0, current: 1, indexed: sections, version: null, core }]);
}

/** Rebuild coverage_totals from the whole ledger (daily, and when empty) — corrects drift the deltas cannot see. */
export async function rebuildCoverageTotals() {
  await transaction([
    { sql: 'DELETE FROM coverage_totals', args: [] },
    { sql: `INSERT INTO coverage_totals (religion, layer, core, docs, total, generated, current, indexed, reached, docs_with)
      SELECT COALESCE(d.religion, 'Other'), i.layer, i.core, COUNT(*), SUM(i.total), SUM(i.generated), SUM(i.current), SUM(i.indexed),
        SUM(CASE WHEN i.indexed > 0 THEN i.total ELSE 0 END), SUM(CASE WHEN i.generated > 0 THEN 1 ELSE 0 END)
      FROM index_coverage i JOIN docs d ON d.id = i.doc_id WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL GROUP BY 1, 2, 3`, args: [] },
  ], 'coverage:rebuild-totals');
}
export const coverageTotalsEmpty = async () => !(await queryOne('SELECT 1 AS x FROM coverage_totals LIMIT 1', [], 'coverage:totals-empty'));

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
  const rows = await queryAll(`SELECT d.religion, COALESCE(d.scope, 'primary') AS scope, i.core, i.layer, COUNT(*) AS docs,
      SUM(i.total) AS total, SUM(i.generated) AS generated, SUM(i.current) AS current, SUM(i.indexed) AS indexed,
      MIN(i.updated_at) AS oldest, MAX(i.updated_at) AS newest
    FROM index_coverage i JOIN docs d ON d.id = i.doc_id WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
    GROUP BY 1, 2, 3, 4`, [], 'coverage:summary');
  const live = await queryOne('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL', [], 'coverage:live');
  const measured = await queryOne(`SELECT COUNT(*) AS n FROM index_coverage WHERE layer = 'text'`, [], 'coverage:measured');
  return { live_docs: live?.n || 0, measured_docs: measured?.n || 0, rows };
}

/** One document's ledger rows. */
export const docCoverage = (docId) =>
  queryAll('SELECT layer, total, generated, current, indexed, version, updated_at FROM index_coverage WHERE doc_id = ? ORDER BY layer', [Number(docId)], 'coverage:doc');
