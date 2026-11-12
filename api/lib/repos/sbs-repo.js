// sbs-repo — reads for the side-by-side document (doc row, paragraph window, section starts) and the LLM sentence-alignment
// cache (sbs_alignments, migration 200; writes go through the single writer). Deps: db.js.
import { queryAll, queryOne, query } from '../db.js';

/** Live, non-duplicate doc row for the SBS view (null if absent). */
export const sbsDoc = (docId) => queryOne(`SELECT id, title, author, language, cover_url, source_url, translators, encumbered, paragraph_count
  FROM docs WHERE id = ? AND deleted_at IS NULL`, [Number(docId)], 'sbs:doc');
/** Live paragraph count of a document. */
export const sbsTotal = async (docId) => (await queryOne('SELECT COUNT(*) AS n FROM content WHERE doc_id = ? AND deleted_at IS NULL', [Number(docId)], 'sbs:total'))?.n || 0;
/** A window of live paragraphs in order, with every column the aligner reads. */
export const sbsParagraphs = (docId, offset, limit) => queryAll(`SELECT id, paragraph_index, text, translation, translation_segments, blocktype, heading,
  original_text, original_lang, translation_text, translation_by FROM content WHERE doc_id = ? AND deleted_at IS NULL
  ORDER BY paragraph_index LIMIT ? OFFSET ?`, [Number(docId), limit, offset], 'sbs:paragraphs');
/** Sections with `start` = the 1-based number of their first live paragraph. */
export const sbsSections = (docId) => queryAll(`SELECT s.title, 1 + (SELECT COUNT(*) FROM content c WHERE c.doc_id = s.doc_id
  AND c.deleted_at IS NULL AND c.paragraph_index < s.start_index) AS start FROM doc_sections s WHERE s.doc_id = ? ORDER BY s.ord`, [Number(docId)], 'sbs:sections');
/** Cached alignments for these keys → Map(key → [{o, t}]). */
export async function getAlignments(keys) {
  const out = new Map();
  for (let i = 0; i < keys.length; i += 200) {
    const part = keys.slice(i, i + 200);
    if (!part.length) continue;
    for (const r of await queryAll(`SELECT key, rows_json FROM sbs_alignments WHERE key IN (${part.map(() => '?').join(',')})`, part, 'sbs:cache-get')) {
      try { out.set(r.key, JSON.parse(r.rows_json)); } catch { /* corrupt row: re-align */ }
    }
  }
  return out;
}
export const putAlignment = (key, rows, model) => query('INSERT OR REPLACE INTO sbs_alignments (key, rows_json, model) VALUES (?, ?, ?)',
  [key, JSON.stringify(rows), model || null], 'sbs:cache-put');
