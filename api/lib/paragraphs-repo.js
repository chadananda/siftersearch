// PARAGRAPH REPOSITORY — paragraph data is read from SQLite here, never from a search engine (the docs counterpart is
// docs-repo.js; planning/architecture-data-access-20261009.md). paragraphDoc() is the ONE search-document shape: what the
// sync worker indexes AND what search hits are hydrated with — so switching engines changes nothing a caller sees.
// Deps: db, authority, authorship.
import { queryAll } from './db.js';
import { authorAuthority, getAuthority } from './authority.js';
import { paragraphAuthor } from './authorship/effective.js';

/** Paragraph row + its doc row → the search document (no vectors). `authority` = the doc's, when the caller has it. */
export function paragraphDoc(p, doc, authority = null) {
  let docAuthority = authority;
  if (docAuthority == null) { try { docAuthority = getAuthority(doc); } catch { docAuthority = 0; } }
  // `author` is the PARAGRAPH's own writer (content.authors, migration 140) — a quotation keeps its writer in any book, so
  // an author filter finds it there; no writer known → the book's author. Authority follows the paragraph's writer.
  const author = paragraphAuthor({ authors: p.authors, author: doc.author });
  const paraAuthority = author !== doc.author ? (authorAuthority(author) ?? docAuthority) : docAuthority;
  return {
    id: p.id, doc_id: p.doc_id, paragraph_index: p.paragraph_index,
    text: p.text, context: p.context || null,
    text_grounded: p.text_grounded || null,
    translation: p.translation || null, translation_segments: p.translation_segments || null,
    title: doc.title, author, filename: doc.filename,
    religion: doc.religion, collection: doc.collection, language: doc.language,
    year: doc.year ? parseInt(doc.year, 10) : null, authority: paraAuthority,
    heading: p.heading || '', blocktype: p.blocktype || 'paragraph',
    source_site: doc.source_site || null,
    source_url: doc.source_url || null,
    external_para_id: p.external_para_id || null,
    pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null,
  };
}

/** Search documents for paragraph ids, from SQLite (live rows only). Ids not found (site-only stores) are simply absent. */
export async function paragraphsByIds(ids) {
  const want = [...new Set(ids.map(Number).filter(Number.isInteger))];
  const out = [];
  for (let i = 0; i < want.length; i += 500) {
    const chunk = want.slice(i, i + 500);
    const rows = await queryAll(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype, c.translation, c.translation_segments,
             c.context, c.external_para_id, c.pdf_page, c.text_grounded, c.authors,
             d.title AS d_title, d.author AS d_author, d.religion AS d_religion, d.collection AS d_collection,
             d.language AS d_language, d.year AS d_year, d.filename AS d_filename,
             d.source_site AS d_source_site, d.source_url AS d_source_url
        FROM content c JOIN docs d ON d.id = c.doc_id
       WHERE c.id IN (${chunk.map(() => '?').join(',')}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL`,
    chunk, 'search:hydrate');
    for (const r of rows) {
      const doc = { title: r.d_title, author: r.d_author, religion: r.d_religion, collection: r.d_collection, language: r.d_language,
        year: r.d_year, filename: r.d_filename, source_site: r.d_source_site, source_url: r.d_source_url };
      out.push(paragraphDoc(r, doc));
    }
  }
  return out;
}

/** Live paragraphs of a document (all block types — headings included, as the search index holds them). */
export async function countParagraphs(docId) {
  const r = await queryAll('SELECT COUNT(*) n FROM content WHERE doc_id = ? AND deleted_at IS NULL', [Number(docId)], 'paragraphs:count');
  return r[0]?.n ?? 0;
}
