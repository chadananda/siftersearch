// sections-repo — sub-documents (doc_sections, migration 149): a book's sections with paragraph ranges, and the finder
// over section titles beside their book's title (doc_sections_fts). Written per document by the section-index ops job;
// read by the document finder (routes/documents.js), Anís's document lookup and the auditor's holdings check. Deps: db.js.
import { queryAll, transaction } from '../db.js';
import { ftsQuery } from '../docs-repo.js';

// folded as docs_fts (migration 142): the tokenizer splits "Bahá’u’lláh" at apostrophes, so they are removed
const foldText = (s) => String(s || '').replace(/[’‘'ʼ`]/g, '');

/** A document's live paragraphs with their stored heading, in order (input to sections.js sectionsFromRows). */
export const headingRowsForDoc = (docId) =>
  queryAll('SELECT id, paragraph_index, heading FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index', [Number(docId)], 'sections:rows');

/** Replace a document's sections (and their FTS rows) in one transaction. sections from sections.js. */
export async function replaceSections(docId, bookTitle, sections, source = 'heading-run') {
  const id = Number(docId);
  const stmts = [
    { sql: 'DELETE FROM doc_sections_fts WHERE rowid IN (SELECT id FROM doc_sections WHERE doc_id = ?)', args: [id] },
    { sql: 'DELETE FROM doc_sections WHERE doc_id = ?', args: [id] },
  ];
  for (const s of sections) {
    stmts.push({ sql: `INSERT INTO doc_sections (doc_id, ord, level, title, start_index, end_index, paragraphs, first_para_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [id, s.ord, s.level ?? null, s.title, s.start_index, s.end_index, s.paragraphs, s.first_para_id ?? null, source] });
    stmts.push({ sql: 'INSERT INTO doc_sections_fts (rowid, title, book) SELECT id, ?, ? FROM doc_sections WHERE doc_id = ? AND ord = ?',
      args: [foldText(s.title), foldText(bookTitle), id, s.ord] });
  }
  await transaction(stmts, 'sections:replace');
  return sections.length;
}

/**
 * Find sections by name: every word must appear in the section title or its book's title ("god passes by epilogue",
 * "dispensation of bahaullah"). Ranked by BM25 with the SECTION title weighted far above the book's, then the library's
 * own and OceanLibrary copies first. → [{ section_id, doc_id, book, title, start_index, end_index, paragraphs, first_para_id }]
 */
export async function findSections(text, { limit = 10 } = {}) {
  const match = ftsQuery(text);
  if (!match) return [];
  return queryAll(`SELECT s.id AS section_id, s.doc_id, d.title AS book, d.author, s.title, s.start_index, s.end_index, s.paragraphs, s.first_para_id
    FROM doc_sections_fts f JOIN doc_sections s ON s.id = f.rowid JOIN docs d ON d.id = s.doc_id
    WHERE doc_sections_fts MATCH ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
    ORDER BY (CASE WHEN d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL THEN 0 ELSE 1 END), bm25(doc_sections_fts, 10.0, 2.0)
    LIMIT ?`, [match, Math.min(Number(limit) || 10, 100)], 'sections:find');
}

/** A book's sections in order (its table of contents). */
export const sectionsOfDoc = (docId) =>
  queryAll('SELECT id AS section_id, ord, level, title, start_index, end_index, paragraphs, first_para_id FROM doc_sections WHERE doc_id = ? ORDER BY ord', [Number(docId)], 'sections:of-doc');
