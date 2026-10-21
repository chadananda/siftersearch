// letters-repo — an author's letters (work_letters, migration 162): written by the letters-index ops job, read by the letter
// lookup (routes/library.js GET /letters). Deps: db.js.
import { queryAll, transaction } from '../db.js';

/** Replace one author's letters (the job rebuilds them whole). */
export async function replaceLetters(author, rows) {
  const at = new Date().toISOString();
  await transaction([
    { sql: 'DELETE FROM work_letters WHERE author = ?', args: [author] },
    ...rows.map((r) => ({ sql: `INSERT INTO work_letters (author, doc_id, title, y, m, d, start_index, end_index, kind, basis, built_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [author, r.doc_id, r.title, r.y ?? null, r.m ?? null, r.d ?? null, r.start, r.end, r.kind, r.basis, at] })),
  ], 'letters:replace');
  return { written: rows.length };
}

/** All of an author's letters, with their book's title — the lookup ranks them in memory (a few thousand rows). */
export const lettersOf = async (author) => (await queryAll(
  `SELECT l.doc_id, l.title, l.y, l.m, l.d, l.start_index AS start, l.end_index AS end, l.kind, l.basis, d.title AS book_title
     FROM work_letters l JOIN docs d ON d.id = l.doc_id WHERE l.author = ? AND d.deleted_at IS NULL`, [author], 'letters:of-author'));
