// keyword-repo — reads for the BM25 keyword layer (Qdrant `paragraphs_kw`): which documents the coverage ledger says are
// short of keyword points (core first), and one document's paragraphs in the shape the BM25 indexer needs. Callers: the
// keyword-fill ops job. Deps: db.js.
import { queryAll } from '../db.js';
import { MIN_DOCS } from '../site-boilerplate.js';

/** Documents whose keyword points fall short of their live paragraphs, per the ledger: core first, largest gap first.
 *  `significant`: only a real gap — nothing indexed, or more than max(20, 2%) short — not the few paragraphs of pure
 *  punctuation every document has, which tokenise to nothing and never get a point. */
export const keywordGapDocs = ({ scope = 'primary', limit = 100000, significant = false } = {}) =>
  queryAll(`SELECT i.doc_id AS id, i.core, i.total, i.indexed FROM index_coverage i JOIN docs d ON d.id = i.doc_id
    WHERE i.layer = 'keyword' AND i.indexed < i.total AND COALESCE(d.scope, 'primary') = ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
      AND EXISTS (SELECT 1 FROM doc_structure s WHERE s.doc_id = i.doc_id)   -- structure first (Chad 10-17): BM25 carries the section path
      ${significant ? 'AND (i.indexed = 0 OR i.total - i.indexed > MAX(20, i.total / 50))' : ''}
    ORDER BY i.core DESC, (i.total - i.indexed) DESC LIMIT ?`, [scope, limit], 'keyword:gap-docs');

/** One document's live, non-duplicate, non-empty paragraphs with the doc fields the keyword payload carries, each with
 *  its section path from the book's structure (doc_sections: every section whose range holds it, outermost first). */
export async function keywordRowsForDoc(docId) {
  const [rows, sections] = await Promise.all([keywordRowsRaw(docId), queryAll('SELECT level, title, start_index, end_index FROM doc_sections WHERE doc_id = ? ORDER BY ord', [Number(docId)], 'keyword:doc-sections')]);
  if (!sections.length) return rows;
  return rows.map((r) => ({ ...r, section: sections.filter((s) => r.paragraph_index >= s.start_index && r.paragraph_index <= s.end_index)
    .sort((a, b) => (a.level ?? 9) - (b.level ?? 9)).map((s) => s.title).join(' › ') || null }));
}

/** Documents whose structure was found (sections > 0) — re-indexed when BM25 starts carrying section paths. */
export const structuredDocs = async () => (await queryAll('SELECT doc_id AS id FROM doc_structure WHERE sections > 0 ORDER BY doc_id', [], 'keyword:structured')).map((r) => r.id);

const keywordRowsRaw = (docId) =>
  queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.authors, d.language, d.religion, d.collection, d.author, COALESCE(d.scope, 'primary') AS scope
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.doc_id = ? AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0 ORDER BY c.id`, [Number(docId)], 'keyword:doc-rows');

/** Scraped-site page chrome: paragraph texts repeated across >= minDocs site documents (menus, footers). One GROUP BY
 *  over the supplemental paragraphs — run only from the heavy lane (keyword-fill-sites). */
export const siteBoilerplateTexts = async (minDocs = MIN_DOCS) => new Set((await queryAll(`SELECT c.text FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE d.scope = 'supplemental' AND d.deleted_at IS NULL AND c.deleted_at IS NULL
    GROUP BY c.text HAVING COUNT(DISTINCT c.doc_id) >= ?`, [minDocs], 'keyword:site-boilerplate')).map((r) => r.text));
