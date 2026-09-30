// Flexible document metadata: ONE sourced record per document of any kind, for disambiguation, HyPE, the chat's
// "about this book" answers, search narrowing (its own Meili index) and the reader. Pure; deps: tablet-meta.js.
// :rules: every field keeps its source; derived fields are marked as derived; tablets use the Phelps+oceanoflights merge.
// :edge: kind 'tablet' = has a Partial Inventory PIN or an oceanoflights bookid; everything else is 'book'.
import { mergeTabletMeta } from './tablet-meta.js';

const s = (v) => String(v ?? '').trim();
const arr = (v) => (Array.isArray(v) ? v.map(s).filter(Boolean) : s(v) ? s(v).split(/\s*[,;]\s*/).filter(Boolean) : []);

/**
 * @param {object} p
 * @param {object} p.doc     docs row: { id, title, author, religion, collection, language, year, description, metadata }
 * @param {object} [p.fm]    the file's frontmatter (arrays intact)
 * @param {object} [p.pi]    Phelps' row when the document is a catalogued tablet
 * @param {object} [p.bib]   Phelps' source codes
 * @param {Array}  [p.notes] linked notes documents
 */
export function buildDocMeta({ doc, fm = {}, pi = null, bib = {}, notes = [] }) {
  const tablet = Boolean(pi?.PIN || fm.pin || fm.catalog_ref || fm.bookid);
  const base = tablet ? mergeTabletMeta({ fm, pi: pi || {}, bib, notes }) : { sources: {} };
  const m = { doc_id: doc.id, kind: tablet ? 'tablet' : 'book', ...base };
  const put = (k, v, src) => { if (m[k] == null && v != null && v !== '' && !(Array.isArray(v) && !v.length)) { m[k] = v; m.sources[k] = src; } };
  let extra = {};
  try { extra = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata || '{}') : doc.metadata || {}; } catch { /* malformed */ }
  put('title', tablet ? null : s(doc.title) || null, 'library');
  put('author', s(doc.author) || null, 'library');
  put('translator', s(fm.translator || extra.translator) || null, 'library');
  put('publisher', s(fm.publisher || extra.publisher) || null, 'library');
  put('year', Number(doc.year) || null, 'library');
  put('description', s(doc.description) || null, 'library');
  put('subjects', arr(fm.subjects || fm.tags || fm.keywords), 'library');
  put('religion', s(doc.religion) || null, 'library');
  put('collection', s(doc.collection) || null, 'library');
  put('language', s(doc.language) || null, 'library');
  return m;
}

/** A short context block for disambiguation and HyPE prompts: what a reader of this document would already know. */
export function contextLine(m) {
  if (!m) return '';
  const parts = [];
  const name = m.title || m.title_generated;
  if (name) parts.push(`${m.kind === 'tablet' ? 'Tablet' : 'Work'}: «${name}»${m.author ? ` by ${m.author}` : ''}`);
  if (m.recipient) parts.push(`addressed to ${m.recipient}`);
  else if (m.addressee?.length) parts.push(`addressed to ${m.addressee.join(', ')}`);
  if (m.place) parts.push(`revealed in ${m.place}`);
  const d = m.date;
  if (d?.gregorian || d?.from) parts.push(`dated ${d.gregorian || d.from}${d.approx ? ' (approx.)' : ''}`);
  else if (m.year) parts.push(`year ${m.year}`);
  if (m.translator) parts.push(`translated by ${m.translator}`);
  if (m.subjects?.length) parts.push(`on ${m.subjects.slice(0, 6).join(', ')}`);
  return parts.join('; ');
}

/** The record as a document for the doc_meta search index (flat, filterable fields). */
export function indexDoc(m) {
  return {
    id: m.doc_id, doc_id: m.doc_id, kind: m.kind,
    title: m.title || m.title_generated || null,
    names: [m.title_native, ...(m.title_alternates || []), ...(m.known_names || [])].filter(Boolean),
    author: m.author || null, recipient: m.recipient || (m.addressee || []).join(', ') || null,
    place: m.place || null, period: m.period || null,
    year_from: m.date?.from ?? m.year ?? null, year_to: m.date?.to ?? m.year ?? null,
    genre: m.genre || null, subjects: m.subjects || [], description: m.description || null,
    first_line_en: m.first_line_en || null, pin: m.pin || null, ool_id: m.ool_id || null,
    religion: m.religion || null, collection: m.collection || null, language: m.language || null,
    translator: m.translator || null,
  };
}

/** The FTS5 row (doc_meta_fts, same column order as the table) for a record. */
export function ftsRow(m) {
  const x = indexDoc(m);
  return [x.title, x.names.join(' · '), x.recipient, x.place, x.subjects.join(' · '), x.first_line_en, x.description, x.author, x.translator]
    .map((v) => v ?? '');
}

/** User text → a safe FTS5 query: each word quoted (no operator injection); op 'AND' = all words, 'OR' = any. */
export function ftsQuery(q, op = 'OR') {
  const words = String(q || '').normalize('NFKC').split(/[^\p{L}\p{N}'’-]+/u).map((w) => w.replace(/["'’]/g, '')).filter((w) => w.length > 1);
  return words.length ? words.map((w) => `"${w}"`).join(` ${op} `) : null;
}
