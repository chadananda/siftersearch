// book-hunt-repo — the book metadata hunt's reads and writes (migration 177: book_hunt + docs.publisher/pub_year/edition/
// author_image/book_meta). One book_hunt row per book is the hunt's resume checkpoint. Applying fills only EMPTY doc fields
// (never overwrites a value someone set). Deps: db.js.
import { query, queryAll, queryOne } from '../db.js';

/** The book hunt pages docs with rights-repo's keyset scan (one place that orders docs out of process). */
export { rightsScanPage as huntScanPage } from './rights-repo.js';

export async function huntRowsByIds(ids) {
  if (!ids?.length) return [];
  return queryAll(`SELECT * FROM book_hunt WHERE doc_id IN (${ids.map(() => '?').join(',')})`, ids.map(Number), 'book-hunt:rows');
}
export async function allHuntRows() {
  return queryAll('SELECT * FROM book_hunt ORDER BY doc_id', [], 'book-hunt:all');
}
export async function saveHunt(docId, { state, version, found = null, review = 0, error = null, usd = null }) {
  await query(`INSERT INTO book_hunt (doc_id, state, version, found, review, error, usd, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(doc_id) DO UPDATE SET state = excluded.state, version = excluded.version, found = excluded.found, review = excluded.review,
      error = excluded.error, usd = excluded.usd, updated_at = excluded.updated_at`,
  [Number(docId), state, version, found ? JSON.stringify(found) : null, review ? 1 : 0, error, usd], 'book-hunt:save');
}

/** Fill a book's EMPTY metadata fields; book_meta merges the evidence. Live docs only. */
export async function applyBookMeta(docId, { isbn, publisher, pub_year, edition, purchase_url, author_image, meta }) {
  const r = await query(`UPDATE docs SET
      isbn = COALESCE(isbn, ?), publisher = COALESCE(publisher, ?), pub_year = COALESCE(pub_year, ?), edition = COALESCE(edition, ?),
      purchase_url = COALESCE(NULLIF(purchase_url, ''), ?), author_image = COALESCE(author_image, ?),
      book_meta = json_patch(COALESCE(CASE WHEN json_valid(book_meta) THEN book_meta END, '{}'), ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL`,
  [isbn ?? null, publisher ?? null, pub_year ?? null, edition ?? null, purchase_url ?? null, author_image ?? null, JSON.stringify(meta || {}), Number(docId)],
  'book-hunt:apply');
  await query('UPDATE book_hunt SET applied_at = CURRENT_TIMESTAMP WHERE doc_id = ?', [Number(docId)], 'book-hunt:applied');
  return { changed: r?.rows?.[0]?.changes ?? r?.changes ?? 0 };
}

/** Encumber a book for its publisher (Chad 10-23). Never un-encumbers; keeps an existing reason. */
export async function encumberForPublisher(docId, reason) {
  const r = await query(`UPDATE docs SET rights_reason = CASE WHEN COALESCE(encumbered, 0) = 0 THEN ? ELSE rights_reason END,
      encumbered = 1, rights_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
  [reason, Number(docId)], 'book-hunt:encumber');
  return { changed: r?.rows?.[0]?.changes ?? r?.changes ?? 0 };
}

export const huntCount = async () => (await queryOne('SELECT COUNT(*) n FROM book_hunt', [], 'book-hunt:count'))?.n ?? 0;

/** A book page's publication facts (one primary-key read): publisher, year, edition, ISBN, author photo + dates. */
export async function bookFacts(docId) {
  const r = await queryOne('SELECT isbn, publisher, pub_year, edition, author_image, book_meta FROM docs WHERE id = ?', [Number(docId)], 'book-hunt:facts');
  if (!r) return null;
  let m = {};
  try { m = r.book_meta ? JSON.parse(r.book_meta) : {}; } catch { /* unreadable evidence: facts only */ }
  const out = { isbn: r.isbn || null, publisher: r.publisher || null, year: r.pub_year || null, edition: r.edition || null,
    author_image: r.author_image || null,
    author_image_credit: m.author_image?.credit || m.author_image?.licence ? [m.author_image.credit, m.author_image.licence].filter(Boolean).join(' · ')
      : typeof m.author_image?.evidence === 'string' ? m.author_image.evidence : null,
    author_born: m.author_born?.value || null, author_died: m.author_died?.value || null };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** Books showing an author photo, with the photo's evidence (book_meta.author_image) — for the photo audit. */
export async function authorPhotoRows() {
  return queryAll(`SELECT id, title, author, author_image, CASE WHEN json_valid(book_meta) THEN json_extract(book_meta, '$.author_image') END AS meta
    FROM docs WHERE author_image IS NOT NULL AND deleted_at IS NULL`, [], 'book-hunt:author-photos');
}
/** Replace (or, with url null, remove) a book's author photo and record why. Live docs only. */
export async function setAuthorImage(docId, url, evidence) {
  const r = await query(`UPDATE docs SET author_image = ?, book_meta = json_patch(COALESCE(CASE WHEN json_valid(book_meta) THEN book_meta END, '{}'), ?),
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
  [url ?? null, JSON.stringify({ author_image: url ? evidence : null, author_image_removed: url ? null : evidence }), Number(docId)], 'book-hunt:set-author-image');
  return { changed: r?.rows?.[0]?.changes ?? r?.changes ?? 0 };
}
