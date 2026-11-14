// section-author job: credit a range of one book's paragraphs to the person who actually wrote them (Chad 10-12: the
// Dawn-Breakers introduction is George Townshend's, not Nabíl's). Someone else's words inside the range (a quoted
// author already named) are left alone unless force (one paragraph misattributed); `quoted` adds verified quoted voices, `role`
// marks structural lines (a stray heading). Dry run by default. Restamp the index after: the stamp-docs indexer job. Deps: repos/authors-repo.js.
import { authorsInRange, setAuthors } from '../repos/authors-repo.js';

const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') || []; } catch { return []; } };

/** Pure: the new writer list for one row, or null when the row is someone else's words (left as is). */
// a reader's placeholder for "someone not named" is not a writer to protect
const PLACEHOLDER = /^(the )?(editor|reporter|compiler|narrator|author|translator|writer)\b|editor or reporter/i;
export function sectionAuthorChange(authors, name, { force = false, quoted = [], role = null } = {}) {
  const list = parse(authors);
  // role 'heading' | 'meta' | 'reference': a structural line (a stray heading) with no writer — never content, never ranked
  if (role) {
    const want = [{ name: null, role, basis: 'section' }];
    return JSON.stringify(list) === JSON.stringify(want) ? null : want;
  }
  const own = list.find((e) => e.role === 'author');
  if (!force && own && own.basis !== 'book' && own.name && own.name !== name && !PLACEHOLDER.test(own.name)) return null;
  const others = list.filter((e) => e.role !== 'author');
  // quoted: verified quotations inside the writer's prose (a compiler quoting Bahá'u'lláh) — a voice, not the writer
  for (const q of quoted) if (q && q !== name && !others.some((e) => e.role === 'quoted' && e.name === q)) others.push({ name: q, role: 'quoted', basis: 'section' });
  if (own?.name === name && own.basis === 'section' && others.length === list.length - 1) return null;   // already right
  return [{ name, role: 'author', basis: 'section' }, ...others];
}

export async function sectionAuthorJob({ docId, from, to, name, apply = false, force = false, quoted = [], role = null } = {}) {
  if (!docId || from == null || to == null || !(name || role)) throw new Error('section-author: docId, from, to, name (or role) required');
  if (role && !['heading', 'meta', 'reference'].includes(role)) throw new Error('section-author: role must be heading, meta or reference');
  const rows = await authorsInRange(docId, from, to);
  const changes = [], kept = [];
  for (const r of rows) {
    const next = sectionAuthorChange(r.authors, name, { force, quoted, role });
    (next ? changes : kept).push({ id: r.id, i: r.paragraph_index, text: r.text.slice(0, 70), before: parse(r.authors), ...(next ? { authors: next } : {}) });
  }
  const written = apply ? await setAuthors(changes) : 0;
  return { apply, docId, from, to, name, role, quoted, rows: rows.length, change: changes.length, written, changes, kept };
}
