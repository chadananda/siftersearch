// rights-repo — the rights-isbn report's reads and its one write (Chad 10-23 ISBN rule). Scans run ONLY in siftersearch-reports
// (keyset pages + per-doc indexed reads, never a whole-table join); the write NEVER un-encumbers. Deps: db.js.
import { query, queryAll, queryOne } from '../db.js';

/** One keyset page of live docs (not deleted, not duplicates) with what the classifier needs. */
export async function rightsScanPage({ afterId = 0, limit = 500 } = {}) {
  return queryAll(`SELECT d.id, d.title, d.author, d.religion, d.collection, d.source_site, d.source_url, d.file_path, d.doc_role,
      d.paragraph_count, d.encumbered, d.metadata, d.frontmatter, d.isbn, d.rights_reason
    FROM docs d WHERE d.id > ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL ORDER BY d.id LIMIT ?`,
  [Number(afterId), Math.min(1000, Number(limit))], 'rights-repo:scan-page');
}

/** A document's first n live paragraphs, in order (idx_content_doc_para). */
export async function frontParagraphs(docId, n = 40) {
  return queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ?`,
    [Number(docId), Number(n)], 'rights-repo:front-paragraphs');
}

/**
 * Record a document's own ISBN; with encumber, also restrict it (encumbered = 1, rights_reason). Never sets encumbered = 0
 * and never replaces an existing rights_reason (a document restricted for another reason keeps it).
 */
export async function recordIsbnRights(docId, { isbn, encumber = false, reason = 'isbn-noncanonical' }) {
  const id = Number(docId);
  const r = await query(`UPDATE docs SET isbn = ?, rights_checked_at = CURRENT_TIMESTAMP,
      encumbered = CASE WHEN ? THEN 1 ELSE encumbered END,
      rights_reason = CASE WHEN ? AND COALESCE(encumbered, 0) = 0 THEN ? ELSE rights_reason END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL`, [isbn || null, encumber ? 1 : 0, encumber ? 1 : 0, reason, id], 'rights-repo:record-isbn');
  return { changed: r?.rows?.[0]?.changes ?? r?.changes ?? 0 };
}

/** Which of these documents are encumbered (copyrighted)? → Set of ids. One primary-key probe per ≤500 ids. */
export async function encumberedAmong(docIds) {
  const ids = [...new Set((docIds || []).map(Number).filter(Number.isFinite))];
  const out = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await queryAll(`SELECT id FROM docs WHERE id IN (${chunk.map(() => '?').join(',')}) AND encumbered = 1`, chunk, 'rights-repo:encumbered-among');
    for (const r of rows) out.add(Number(r.id));
  }
  return out;
}

/** A paragraph's document + position + encumbered flag (by content id) — for single-paragraph endpoints. */
export async function paragraphRights(paragraphId) {
  return queryOne(`SELECT c.doc_id, c.paragraph_index, COALESCE(d.encumbered, 0) AS encumbered FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.id = ?`, [Number(paragraphId)], 'rights-repo:paragraph-rights');
}
