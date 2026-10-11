// language-repo — language labels on docs and paragraphs (normalisation backfill, 10-11). Reads that scan content run
// OUT OF PROCESS only. Writes are per-doc (indexed) so no statement scans the table inside the single writer.
// Callers: scripts/library/normalize-languages.mjs. Deps: db.js.
import { queryAll, transaction } from '../db.js';

/** Distinct doc language labels with counts. */
export const docLanguageCounts = () => queryAll('SELECT language, COUNT(*) AS docs FROM docs WHERE deleted_at IS NULL GROUP BY language');

/** (doc_id, language) pairs on live paragraphs whose label is in `labels` — full scan, ~1 min on tower. */
export async function contentPairs(labels) {
  if (!labels.length) return [];
  return queryAll(`SELECT doc_id, language, COUNT(*) AS n FROM content WHERE deleted_at IS NULL AND language IN (${labels.map(() => '?').join(',')})
    GROUP BY doc_id, language`, labels);
}

/** Docs carrying a label → relabel (and their live paragraphs with the same label, marked for index re-sync). */
export async function docsWithLanguage(label) {
  return queryAll('SELECT id FROM docs WHERE language = ?', [label]);
}

/** Apply relabels in batches of `size` statements: [{ table:'docs'|'content', docId, from, to }]. */
export async function relabel(changes, size = 200) {
  for (let i = 0; i < changes.length; i += size) {
    await transaction(changes.slice(i, i + size).map((c) => (c.table === 'docs'
      ? { sql: 'UPDATE docs SET language = ? WHERE id = ? AND language = ?', args: [c.to, c.docId, c.from] }
      : { sql: 'UPDATE content SET language = ?, synced = 0 WHERE doc_id = ? AND language = ? AND deleted_at IS NULL', args: [c.to, c.docId, c.from] })),
    'language:normalise');
  }
}
