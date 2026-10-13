// section-author job: credit a range of one book's paragraphs to the person who actually wrote them (Chad 10-12: the
// Dawn-Breakers introduction is George Townshend's, not Nabíl's). Someone else's words inside the range (a quoted
// author already named) are left alone. Dry run by default. Deps: repos/authors-repo.js.
import { authorsInRange, setAuthors } from '../repos/authors-repo.js';

const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') || []; } catch { return []; } };

/** Pure: the new writer list for one row, or null when the row is someone else's words (left as is). */
export function sectionAuthorChange(authors, name) {
  const list = parse(authors);
  const own = list.find((e) => e.role === 'author');
  if (own && own.basis !== 'book' && own.name && own.name !== name) return null;
  if (own?.name === name && own.basis === 'section') return null;   // already right
  return [{ name, role: 'author', basis: 'section' }, ...list.filter((e) => e.role !== 'author')];
}

export async function sectionAuthorJob({ docId, from, to, name, apply = false } = {}) {
  if (!docId || from == null || to == null || !name) throw new Error('section-author: docId, from, to, name required');
  const rows = await authorsInRange(docId, from, to);
  const changes = [], kept = [];
  for (const r of rows) {
    const next = sectionAuthorChange(r.authors, name);
    (next ? changes : kept).push({ id: r.id, i: r.paragraph_index, text: r.text.slice(0, 70), before: parse(r.authors), ...(next ? { authors: next } : {}) });
  }
  const written = apply ? await setAuthors(changes) : 0;
  return { apply, docId, from, to, name, rows: rows.length, change: changes.length, written, changes, kept };
}
