// integrity-repo — content-integrity reports: where live paragraphs went (soft deletions per day × source) and which
// live books are HOLLOW (no paragraph with text) or carry empty rows. Full scans (~1 min on tower): call ONLY out of
// process, never from the API. Callers: scripts/ops/deletions-report.mjs, scripts/ops/hollow-report.mjs. Deps: db.js.
import { queryAll } from '../db.js';
import { INDEXABLE_DOC_SQL } from '../search/excluded-docs.js';

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

/** Live paragraphs with text per doc scope (primary | supplemental) × religion — the denominator for index coverage. */
export async function liveParagraphsByScope() {
  return queryAll(`SELECT COALESCE(d.scope, 'primary') AS scope, d.religion, COUNT(*) AS paragraphs
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND d.duplicate_of IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0
    GROUP BY 1, 2`);
}

/** Live paragraphs with text per doc × raw `authors` value (the tier is per paragraph author) with the doc fields the tier rule reads
 *  and the doc's CURRENT scope. Full scan like the rest of this file: call out of process (the ops reports worker) only. */
/** One doc's live paragraphs as the phrase indexer selects them (same filters), with a short preview. */
export async function liveParagraphsOfDoc(docId) {
  return queryAll(`SELECT c.id, LENGTH(c.text) AS len, substr(c.text, 1, 80) AS preview, c.authors
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.doc_id = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0
    ORDER BY c.id`, [Number(docId)]);
}

export async function liveParagraphsByDocAuthors() {
  return queryAll(`SELECT c.doc_id, d.religion, d.collection, d.title, d.author AS doc_author, COALESCE(d.scope, 'primary') AS scope,
      c.authors, COUNT(*) AS paragraphs
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND ${INDEXABLE_DOC_SQL} AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0
    GROUP BY c.doc_id, c.authors`);   // INDEXABLE: retired duplicates and tag index pages are withheld from search by design, not missing
}
