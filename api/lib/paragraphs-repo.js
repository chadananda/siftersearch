// PARAGRAPH REPOSITORY — paragraph data is read from SQLite here, never from a search engine (the docs counterpart is
// docs-repo.js; planning/architecture-data-access-20261009.md). paragraphDoc() is the ONE search-document shape: what the
// sync worker indexes AND what search hits are hydrated with — so switching engines changes nothing a caller sees.
// Deps: db, authority, authorship.
import { queryAll, transaction } from './db.js';
import { authorAuthority, getAuthority } from './authority.js';
import { paragraphAuthor } from './authorship/effective.js';
import { olCiteTitle } from './library/ol-works.js';

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
    // a part of a multi-part OceanLibrary work (KJV, Qur'an…) is titled — and so cited — "<work>, <part>" (ol-works.js)
    // slug = the DOC's stored slug (docs.slug): links are built from it, never from the paragraph's author + title
    title: olCiteTitle(doc), author, filename: doc.filename, slug: doc.slug || null,
    religion: doc.religion, collection: doc.collection, language: doc.language,
    year: doc.year ? parseInt(doc.year, 10) : null, authority: paraAuthority, book_authority: docAuthority,
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
             d.language AS d_language, d.year AS d_year, d.filename AS d_filename, d.slug AS d_slug,
             d.source_site AS d_source_site, d.source_url AS d_source_url
        FROM content c JOIN docs d ON d.id = c.doc_id
       WHERE c.id IN (${chunk.map(() => '?').join(',')}) AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0
         AND d.deleted_at IS NULL AND d.duplicate_of IS NULL`,
    chunk, 'search:hydrate');
    for (const r of rows) {
      const doc = { title: r.d_title, author: r.d_author, religion: r.d_religion, collection: r.d_collection, language: r.d_language,
        year: r.d_year, filename: r.d_filename, slug: r.d_slug, source_site: r.d_source_site, source_url: r.d_source_url };
      out.push(paragraphDoc(r, doc));
    }
  }
  return out;
}

/** The aligned ORIGINAL of each paragraph (original_text — Shoghi Effendi's source text beside his English), for answers
 *  about original-language wording. → Map(id → { original, lang }) for the ids that carry one. */
export async function originalsByIds(ids) {
  const want = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  const out = new Map();
  for (let i = 0; i < want.length; i += 500) {
    const chunk = want.slice(i, i + 500);
    const rows = await queryAll(`SELECT id, original_text, original_lang FROM content WHERE id IN (${chunk.map(() => '?').join(',')})
       AND deleted_at IS NULL AND original_text IS NOT NULL AND original_text <> ''`, chunk, 'search:originals');
    for (const r of rows) out.set(r.id, { original: r.original_text, lang: r.original_lang || null });
  }
  return out;
}

/** Live paragraphs of a document (all block types — headings included, as the search index holds them). */
export async function countParagraphs(docId) {
  const r = await queryAll('SELECT COUNT(*) n FROM content WHERE doc_id = ? AND deleted_at IS NULL', [Number(docId)], 'paragraphs:count');
  return r[0]?.n ?? 0;
}

/** UNSEGMENTED documents (Chad 10-19: "Never should we search an unsegmented book"): live paragraphs longer than `minChars`
 *  in one id window (afterId, afterId + span] — a bounded primary-key range read, so a whole-table survey is many short
 *  reads, never one long one. → [{ doc_id, n, max_chars }] */
export async function oversizedParagraphDocs({ afterId = 0, span = 100000, minChars = 8000 } = {}) {
  return queryAll(`SELECT doc_id, COUNT(*) AS n, MAX(LENGTH(text)) AS max_chars FROM content
    WHERE id > ? AND id <= ? AND deleted_at IS NULL AND LENGTH(text) > ? GROUP BY doc_id`,
  [Number(afterId), Number(afterId) + Number(span), Number(minChars)], 'paragraphs-repo:oversized');
}
/** The highest content id (the survey's end). */
export async function maxContentId() {
  return (await queryAll('SELECT MAX(id) AS m FROM content', [], 'paragraphs-repo:max-id'))[0]?.m || 0;
}

/** A book's rows for paragraph attribution — the shape authorship/window-core.js loadRows gives (heading = section path). */
export async function authorshipRows(docId) {
  const rows = await queryAll(`SELECT id, paragraph_index pidx, text, heading, blocktype, block_attrs, authors, authors_model
    FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`, [Number(docId)], 'paragraphs-repo:authorship-rows');
  return rows.map((r) => {
    let path = null;
    try { path = r.block_attrs ? JSON.parse(r.block_attrs).path : null; } catch { /* malformed attrs */ }
    return { ...r, heading: path?.length ? path.join(' › ') : r.heading };
  });
}

/** Paragraph authors (the window classifier) through the single writer, 500 statements a batch.
 *  updates: [{ id, authors: [...], model? }] — model set only where the author changed (authors_model). */
export async function writeParagraphAuthors(updates, name = 'authorship:window') {
  for (let i = 0; i < updates.length; i += 500) {
    await transaction(updates.slice(i, i + 500).map((u) => (u.model
      ? { sql: 'UPDATE content SET authors = ?, authors_model = ? WHERE id = ?', args: [JSON.stringify(u.authors), u.model, u.id] }
      : { sql: 'UPDATE content SET authors = ? WHERE id = ?', args: [JSON.stringify(u.authors), u.id] })), name);
  }
  return updates.length;
}

/** Paragraphs whose authors quote someone, in one id WINDOW (a short read — a whole-table LIKE scan blocks; feedback
 *  10-17). → [{ id, doc_id, authors }]. stamp-voices walks the windows. */
export async function quotedVoiceRows({ afterId = 0, span = 100000 } = {}) {
  return queryAll(`SELECT c.id, c.doc_id, c.authors, d.author FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.id > ? AND c.id <= ? AND c.deleted_at IS NULL AND c.authors LIKE '%"quoted"%'`, [Number(afterId), Number(afterId) + Number(span)], 'paragraphs-repo:quoted-voices');
}

/** Paragraphs by (doc, paragraph_index) — what a link needs (OceanLibrary para id, block attrs, text). pairs [{ doc_id, index }]. */
export async function paragraphsAt(pairs) {
  const ps = (pairs || []).filter((p) => p && p.doc_id != null && p.index != null);
  if (!ps.length) return [];
  const where = ps.map(() => '(doc_id = ? AND paragraph_index = ?)').join(' OR ');
  return queryAll(`SELECT id, doc_id, paragraph_index, external_para_id, block_attrs, text FROM content WHERE deleted_at IS NULL AND (${where})`,
    ps.flatMap((p) => [Number(p.doc_id), Number(p.index)]), 'paragraphs-repo:at');
}

/** For each live paragraph of a document: another live, canonical document holding the same words (normalized_hash), or
 *  null — the doc-overlap report (is a compilation of compilations already held piece by piece?). → [{ id, pidx, other }] */
export async function paragraphsHeldElsewhere(docId) {
  return queryAll(`SELECT c.id, c.paragraph_index pidx, (SELECT o.doc_id FROM content o JOIN docs d ON d.id = o.doc_id
      WHERE o.normalized_hash = c.normalized_hash AND o.doc_id != c.doc_id AND o.deleted_at IS NULL AND d.deleted_at IS NULL
        AND d.duplicate_of IS NULL LIMIT 1) AS other
    FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL ORDER BY c.paragraph_index`, [Number(docId)], 'paragraphs-repo:held-elsewhere');
}
