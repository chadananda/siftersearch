// telemetry-repo — the library telemetry behind the home-page Observatory (migration 152): the index ledger rolled up by
// tradition × layer, a few library counts, the ops jobs running now and finished lately, the latest findability test,
// and the snapshot store itself. Every read here runs in the reports worker every 5 minutes — never per page view.
// Deps: db.js.
import { query, queryOne, queryAll } from '../db.js';

/** Tradition × layer totals — read from coverage_totals (kept incrementally by coverage-repo saveCoverage), ~260 rows. */
export const coverageRollup = () => queryAll(`SELECT religion, layer, SUM(docs) AS docs, SUM(total) AS total, SUM(generated) AS generated,
    SUM(current) AS current, SUM(indexed) AS indexed, SUM(reached) AS reached, SUM(docs_with) AS docs_with,
    SUM(core * total) AS core_total, SUM(core * generated) AS core_generated, SUM(core * reached) AS core_reached, SUM(core * indexed) AS core_indexed
  FROM coverage_totals GROUP BY 1, 2`, [], 'telemetry:rollup');

/** Whole-library counts — from the incremental totals (sections, concept claims in the index, documents measured); only
 *  the live-document count reads docs, which is small and indexed. No full scans. */
export async function libraryCounts() {
  const [docs, t] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL', [], 'telemetry:docs'),
    queryOne(`SELECT SUM(CASE WHEN layer = 'sections' THEN generated ELSE 0 END) AS sections, SUM(CASE WHEN layer = 'concepts' THEN indexed ELSE 0 END) AS claims,
      SUM(CASE WHEN layer = 'text' THEN docs ELSE 0 END) AS measured FROM coverage_totals`, [], 'telemetry:totals'),
  ]);
  return { documents: docs?.n || 0, sections: t?.sections || 0, concept_claims: t?.claims || 0, measured_docs: t?.measured || 0 };
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
/** The newest snapshot taken at or before `at` (cell rates over a day). */
export const snapshotAtOrBefore = (at) => queryOne('SELECT at, data FROM telemetry_snapshots WHERE at <= ? ORDER BY at DESC LIMIT 1', [at], 'telemetry:at-or-before');
export const seriesSince = (sinceEpoch) => queryAll('SELECT at, series FROM telemetry_snapshots WHERE at >= ? ORDER BY at', [sinceEpoch], 'telemetry:series');

/** The 15-second pulse (migration 154): one row, replaced each time. */
export const savePulse = (at, data) =>
  query('INSERT INTO telemetry_pulse (id, at, data) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, data = excluded.data', [at, JSON.stringify(data)], 'telemetry:pulse-save');
export const latestPulse = () => queryOne('SELECT at, data FROM telemetry_pulse WHERE id = 1', [], 'telemetry:pulse');

/** Ops jobs running or queued right now (the 15-second pulse: the status line must never say "idle" while work waits). */
export const liveJobs = () => queryAll(`SELECT id, name, status, params, started_at FROM ops_report_runs WHERE status IN ('running', 'queued') ORDER BY id`, [], 'telemetry:live-jobs');
