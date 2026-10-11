// integrity-repo — where did live paragraphs go? Soft deletions per day × source, for the content-drop tripwire
// (scripts/pipeline-snapshot.js). Full scan of deleted rows (~1 min on tower): call ONLY out of process, never from the API.
// Callers: scripts/ops/deletions-report.mjs. Deps: db.js.
import { queryAll } from '../db.js';

/** Paragraphs soft-deleted per day (UTC) × doc source over the last `days` days, with how many docs were affected. */
export async function deletionsByDay(days = 14) {
  return queryAll(`SELECT substr(c.deleted_at, 1, 10) AS day, COALESCE(d.source_site, 'library') AS source,
      COUNT(*) AS paragraphs, COUNT(DISTINCT c.doc_id) AS docs, SUM(d.deleted_at IS NOT NULL) AS doc_deleted_rows
    FROM content c LEFT JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NOT NULL AND c.deleted_at >= datetime('now', ?)
    GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC`, [`-${Number(days)} days`]);
}
