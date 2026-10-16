// telemetry-repo — the library telemetry behind the home-page Observatory (migration 152): the index ledger rolled up by
// tradition × layer, a few library counts, the ops jobs running now and finished lately, the latest findability test,
// and the snapshot store itself. Every read here runs in the reports worker every 5 minutes — never per page view.
// Deps: db.js.
import { query, queryOne, queryAll } from '../db.js';

/** index_coverage by tradition × layer: paragraphs, generated, current, indexed (points/rows), and `reached` = paragraphs
 *  in documents with anything indexed (the paragraph coverage of a point layer such as phrases, whose count is units). */
export const coverageRollup = () => queryAll(`SELECT COALESCE(d.religion, 'Other') AS religion, i.layer, COUNT(*) AS docs,
    SUM(i.total) AS total, SUM(i.generated) AS generated, SUM(i.current) AS current, SUM(i.indexed) AS indexed,
    SUM(CASE WHEN i.indexed > 0 THEN i.total ELSE 0 END) AS reached, SUM(CASE WHEN i.generated > 0 THEN 1 ELSE 0 END) AS docs_with,
    SUM(i.core * i.total) AS core_total, SUM(i.core * i.generated) AS core_generated,
    SUM(CASE WHEN i.core = 1 AND i.indexed > 0 THEN i.total ELSE 0 END) AS core_reached
  FROM index_coverage i JOIN docs d ON d.id = i.doc_id WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
  GROUP BY 1, 2`, [], 'telemetry:rollup');

/** Small whole-library counts. */
export async function libraryCounts() {
  const [docs, sections, claims, measured] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL', [], 'telemetry:docs'),
    queryOne('SELECT COUNT(*) AS n FROM doc_sections', [], 'telemetry:sections'),
    queryOne('SELECT COUNT(*) AS n FROM concept_claims WHERE proof_ok = 1', [], 'telemetry:claims'),
    queryOne(`SELECT COUNT(*) AS n, MIN(updated_at) AS oldest FROM index_coverage WHERE layer = 'text'`, [], 'telemetry:measured'),
  ]);
  return { documents: docs?.n || 0, sections: sections?.n || 0, concept_claims: claims?.n || 0, measured_docs: measured?.n || 0, ledger_oldest: measured?.oldest || null };
}

/** Ops jobs running now and finished in the last day (names + params summary only — no results beyond a short tail). */
export const opsActivity = () => queryAll(`SELECT id, name, status, params, started_at, finished_at, ms, substr(result, -600) AS result_tail, error
  FROM ops_report_runs WHERE status = 'running' OR (finished_at IS NOT NULL AND finished_at > ?) ORDER BY id DESC LIMIT 40`,
[new Date(Date.now() - 86400000).toISOString()], 'telemetry:ops');

/** The latest finished findability (known-item) test. */
export const latestKnownItem = () => queryOne(`SELECT id, finished_at, result FROM ops_report_runs WHERE name = 'known-item' AND status = 'done'
  ORDER BY id DESC LIMIT 1`, [], 'telemetry:known-item');

export const saveSnapshot = (at, data, series) =>
  query('INSERT OR REPLACE INTO telemetry_snapshots (at, data, series) VALUES (?, ?, ?)', [at, JSON.stringify(data), JSON.stringify(series)], 'telemetry:save');
export const pruneSnapshots = (keepSeconds = 7 * 86400) =>
  query('DELETE FROM telemetry_snapshots WHERE at < ?', [Math.floor(Date.now() / 1000) - keepSeconds], 'telemetry:prune');
export const latestSnapshot = () => queryOne('SELECT at, data FROM telemetry_snapshots ORDER BY at DESC LIMIT 1', [], 'telemetry:latest');
export const seriesSince = (sinceEpoch) => queryAll('SELECT at, series FROM telemetry_snapshots WHERE at >= ? ORDER BY at', [sinceEpoch], 'telemetry:series');
