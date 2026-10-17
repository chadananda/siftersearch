// keyword-repo — reads for the BM25 keyword layer (Qdrant `paragraphs_kw`): which documents the coverage ledger says are
// short of keyword points (core first), and one document's paragraphs in the shape the BM25 indexer needs. Callers: the
// keyword-fill ops job. Deps: db.js.
import { queryAll } from '../db.js';

/** Documents whose keyword points fall short of their live paragraphs, per the ledger: core first, largest gap first. */
export const keywordGapDocs = ({ scope = 'primary', limit = 100000 } = {}) =>
  queryAll(`SELECT i.doc_id AS id, i.core, i.total, i.indexed FROM index_coverage i JOIN docs d ON d.id = i.doc_id
    WHERE i.layer = 'keyword' AND i.indexed < i.total AND COALESCE(d.scope, 'primary') = ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
    ORDER BY i.core DESC, (i.total - i.indexed) DESC LIMIT ?`, [scope, limit], 'keyword:gap-docs');

/** One document's live, non-duplicate, non-empty paragraphs with the doc fields the keyword payload carries. */
export const keywordRowsForDoc = (docId) =>
  queryAll(`SELECT c.id, c.doc_id, c.text, c.authors, d.language, d.religion, d.collection, d.author, COALESCE(d.scope, 'primary') AS scope
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.doc_id = ? AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0 ORDER BY c.id`, [Number(docId)], 'keyword:doc-rows');
