// integrity-repo — content-integrity reports: where live paragraphs went (soft deletions per day × source) and which
// live books are HOLLOW (no paragraph with text) or carry empty rows. Full scans (~1 min on tower): call ONLY out of
// process, never from the API. Callers: scripts/ops/deletions-report.mjs, scripts/ops/hollow-report.mjs. Deps: db.js.
import { queryAll } from '../db.js';

/** Paragraphs soft-deleted per day (UTC) × doc source over the last `days` days, with how many docs were affected. */
export async function deletionsByDay(days = 14) {
  return queryAll(`SELECT substr(c.deleted_at, 1, 10) AS day, COALESCE(d.source_site, 'library') AS source,
      COUNT(*) AS paragraphs, COUNT(DISTINCT c.doc_id) AS docs, SUM(d.deleted_at IS NOT NULL) AS doc_deleted_rows
    FROM content c LEFT JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NOT NULL AND c.deleted_at >= datetime('now', ?)
    GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC`, [`-${Number(days)} days`]);
}

/** Per live doc (not deleted, not a duplicate): live rows, rows with text, empty rows — only docs with a problem. */
export async function hollowDocs() {
  return queryAll(`SELECT d.id, d.title, COALESCE(d.source_site, 'library') AS source, d.language, d.file_path,
      COUNT(c.id) AS rows, SUM(length(trim(c.text)) > 0) AS with_text, SUM(c.id IS NOT NULL AND length(trim(COALESCE(c.text, ''))) = 0) AS empty_rows
    FROM docs d LEFT JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
    WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
    GROUP BY d.id
    HAVING with_text IS NULL OR with_text = 0 OR empty_rows > 0`);
}
