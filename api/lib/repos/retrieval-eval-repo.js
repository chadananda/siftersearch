// retrieval-eval-repo — samples for the KNOWN-ITEM test (ops report known-item; Chad 10-16: "basic vector and keyword
// indexing … so we can actually find something we already know exists"): random real paragraphs of a tradition, and the
// normalized hashes of hit ids (a hit on an identical copy counts as found). Read-only. Deps: db.js.
import { queryAll } from '../db.js';

/** A tradition's live documents with prose, for weighted sampling. */
export const docsOfReligion = (religion) =>
  queryAll(`SELECT id, title, author, religion, collection, source_site, paragraph_count FROM docs
    WHERE religion = ? AND deleted_at IS NULL AND duplicate_of IS NULL AND paragraph_count > 0`, [religion], 'eval:docs');

/** The first live paragraph at or after a position in a document — a seek on (doc_id, paragraph_index), never an OFFSET
 *  (OFFSET read and discarded every earlier row: 8.4 s measured on a large book, 10-16). */
export const paragraphAt = async (docId, position) => (await queryAll(`SELECT id, doc_id, text, normalized_hash, blocktype FROM content
    WHERE doc_id = ? AND paragraph_index >= ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0 ORDER BY paragraph_index LIMIT 1`,
  [Number(docId), Math.max(0, Number(position) || 0)], 'eval:paragraph'))[0] || null;

/** id → normalized_hash for hit ids. */
export async function hashesByIds(ids) {
  const want = [...new Set(ids.map(Number).filter(Number.isInteger))];
  const out = new Map();
  for (let i = 0; i < want.length; i += 500) {
    const ch = want.slice(i, i + 500);
    for (const r of await queryAll(`SELECT id, normalized_hash FROM content WHERE id IN (${ch.map(() => '?').join(',')})`, ch, 'eval:hashes')) out.set(r.id, r.normalized_hash);
  }
  return out;
}
