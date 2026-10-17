// refs-repo — traditional references on paragraphs (block_attrs.pn; api/lib/refs/schemes.js). Reads one document's
// paragraphs in reading order; writes pn in batches through the single writer, touching only rows whose pn changes.
import { queryAll, transaction } from '../db.js';

/** A document's live paragraphs in reading order, with heading, text and current pn. */
export const refParagraphs = (docId) =>
  queryAll(`SELECT id, paragraph_index, heading, text, json_extract(block_attrs, '$.pn') AS pn FROM content
    WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0 ORDER BY paragraph_index`, [Number(docId)], 'refs:paragraphs');

/** Set pn on [{ id, pn }] (null removes it), 500 rows per transaction. */
export async function setPn(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    await transaction(rows.slice(i, i + 500).map((r) => (r.pn == null
      ? { sql: `UPDATE content SET block_attrs = json_remove(COALESCE(block_attrs, '{}'), '$.pn') WHERE id = ?`, args: [r.id] }
      : { sql: `UPDATE content SET block_attrs = json_set(COALESCE(block_attrs, '{}'), '$.pn', ?) WHERE id = ?`, args: [r.pn, r.id] })), 'refs:set-pn');
  }
  return rows.length;
}
