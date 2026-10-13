// authors-repo — per-paragraph writer records (content.authors, migration 140) for section-level corrections, e.g. a
// book's introduction written by someone other than its author. Bounded to one doc's index range. Deps: db.js.
import { queryAll, transaction } from '../db.js';

/** One doc's live rows in [from, to] (paragraph_index) with their writer records. */
export const authorsInRange = (docId, from, to) => queryAll(
  `SELECT id, paragraph_index, blocktype, substr(text, 1, 160) AS text, authors FROM content
    WHERE doc_id = ? AND paragraph_index BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY paragraph_index`,
  [Number(docId), Number(from), Number(to)], 'authors-repo:range');

/** Write writer records; synced = 0 so the indexes pick up the new author. changes: [{ id, authors }] */
export async function setAuthors(changes) {
  if (!changes.length) return 0;
  await transaction(changes.map((c) => ({ sql: 'UPDATE content SET authors = ?, synced = 0 WHERE id = ?', args: [JSON.stringify(c.authors), c.id] })), 'ops:section-author');
  return changes.length;
}
