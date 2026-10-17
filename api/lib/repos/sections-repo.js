// sections-repo — sub-documents (doc_sections, migration 149): a book's sections with paragraph ranges, and the finder
// over section titles beside their book's title (doc_sections_fts). Written per document by the section-index ops job;
// read by the document finder (routes/documents.js), Anís's document lookup and the auditor's holdings check. Deps: db.js.
import { queryAll, transaction } from '../db.js';
import { ftsQuery } from '../docs-repo.js';
import { titleTier } from '../title-rank.js';

// folded as docs_fts (migration 142): the tokenizer splits "Bahá’u’lláh" at apostrophes, so they are removed
const foldText = (s) => String(s || '').replace(/[’‘'ʼ`]/g, '');

/** A document's live paragraphs with their stored heading and file paragraph id (block_attrs for library files,
 *  external_para_id for OceanLibrary site documents), in order (sections.js). */
/** Live documents the section index has not read yet (new ingests first in id order) — structure right after ingestion. */
export const docsWithoutStructure = (limit = 500) =>
  queryAll(`SELECT d.id FROM docs d WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM doc_structure s WHERE s.doc_id = d.id) ORDER BY d.id LIMIT ?`, [limit], 'sections:unread').then((r) => r.map((x) => x.id));

export const headingRowsForDoc = (docId) =>
  queryAll('SELECT id, paragraph_index, heading, block_attrs, external_para_id FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index', [Number(docId)], 'sections:rows');

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
  stmts.push({ sql: 'INSERT OR REPLACE INTO doc_structure (doc_id, sections, source, indexed_at) VALUES (?, ?, ?, ?)',
    args: [id, sections.length, sections.length ? source : null, Math.floor(Date.now() / 1000)] });   // read, even with no structure
  await transaction(stmts, 'sections:replace');
  return sections.length;
}

/**
 * Find sections by name: every word must appear in the section title or its book's title ("god passes by epilogue",
 * "dispensation of bahaullah"). A BM25 window (section title weighted far above the book's) is re-ranked by how well the
 * SECTION title answers the name (title-rank.js, as the book finder), then by size — "The Dispensation of Bahá'u'lláh"
 * (130 paragraphs, a whole letter) before a one-paragraph mention in a compilation — then the library's own copies.
 * → [{ section_id, doc_id, book, title, start_index, end_index, paragraphs, first_para_id }]
 */
export async function findSections(text, { limit = 10 } = {}) {
  const match = ftsQuery(text);
  if (!match) return [];
  const rows = await queryAll(`SELECT s.id AS section_id, s.doc_id, d.title AS book, d.author, s.title, s.start_index, s.end_index, s.paragraphs, s.first_para_id,
      (CASE WHEN d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL THEN 0 ELSE 1 END) AS _site
    FROM doc_sections_fts f JOIN doc_sections s ON s.id = f.rowid JOIN docs d ON d.id = s.doc_id
    WHERE doc_sections_fts MATCH ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
    ORDER BY bm25(doc_sections_fts, 10.0, 2.0) LIMIT 200`, [match], 'sections:find');
  const want = Math.min(Number(limit) || 10, 100);
  return rows.map((r, i) => ({ r, tier: titleTier(text, r.title), i }))
    .sort((a, b) => (b.tier - a.tier) || (b.r.paragraphs - a.r.paragraphs) || (a.r._site - b.r._site) || (a.i - b.i))
    .slice(0, want).map(({ r }) => { const { _site, ...out } = r; return out; });
}

/** A book's sections in order (its table of contents). */
export const sectionsOfDoc = (docId) =>
  queryAll('SELECT id AS section_id, ord, level, title, start_index, end_index, paragraphs, first_para_id FROM doc_sections WHERE doc_id = ? ORDER BY ord', [Number(docId)], 'sections:of-doc');

/** How much structure the section index found: per tradition × scope, documents read / with sections / long (>= 200
 *  paragraphs) without any, by source; and the longest documents with none — where structure must be INFERRED. */
export async function structureSummary({ longest = 25 } = {}) {
  const [byTradition, bySource, longestWithout] = await Promise.all([
    queryAll(`SELECT COALESCE(d.religion, 'Other') AS religion, COALESCE(d.scope, 'primary') AS scope, COUNT(*) AS docs,
        SUM(s.sections > 0) AS with_sections, SUM(s.sections = 0 AND d.paragraph_count >= 200) AS long_without,
        SUM(CASE WHEN s.sections = 0 THEN d.paragraph_count ELSE 0 END) AS paragraphs_without
      FROM doc_structure s JOIN docs d ON d.id = s.doc_id WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL GROUP BY 1, 2 ORDER BY 3 DESC`, [], 'sections:summary'),
    queryAll(`SELECT COALESCE(source, 'none') AS source, COUNT(*) AS docs, SUM(sections) AS sections FROM doc_structure GROUP BY 1`, [], 'sections:by-source'),
    queryAll(`SELECT d.id, d.title, d.religion, d.scope, d.paragraph_count FROM doc_structure s JOIN docs d ON d.id = s.doc_id
      WHERE s.sections = 0 AND d.deleted_at IS NULL AND d.duplicate_of IS NULL ORDER BY d.paragraph_count DESC LIMIT ?`, [longest], 'sections:longest-without'),
  ]);
  return { byTradition, bySource, longestWithout };
}
