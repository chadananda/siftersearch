// block-attrs-repo — paragraph block attributes (content.block_attrs: id, pn, ilm_id, path, pb…). Used by the
// block-attrs ops job (copies stable ids + display numbers from library files onto their rows). Deps: db.js.
import { queryAll, transaction } from '../db.js';

/** A doc's live rows with what is needed to match them to file blocks. */
export const rowsForDoc = (docId) =>
  queryAll('SELECT id, text, blocktype, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index', [docId]);

/** Write merged block_attrs JSON per row, in batches (single writer). changes: [{ id, attrs }] — attrs = full object. */
export async function setBlockAttrs(changes, size = 500) {
  for (let i = 0; i < changes.length; i += size) {
    await transaction(changes.slice(i, i + size).map((c) => ({ sql: 'UPDATE content SET block_attrs = ? WHERE id = ?', args: [JSON.stringify(c.attrs), c.id] })), 'ops:block-attrs');
  }
}
