// The /doc pages' catalogue as a SNAPSHOT (Chad 11-14): the library's unique resources — copyrighted books (their permitted
// opening) and tablets/books with an original beside an English translation (the side-by-side view). Built out of process
// by siftersearch-reports (pipeline-snapshot-job → data/doc-pages.json, from pipeline-snapshot-repo.docPagesRows) and only
// READ by GET /api/library/doc-pages (the Anís host's /doc index + sitemap). shapeDocPages is pure.
import { readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { docPageSlug } from './doc-slug.js';
import { linkFor } from '../source-links.js';

export const DOC_PAGES_FILE = 'doc-pages.json';
const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', DOC_PAGES_FILE);
const RTL = new Set(['ar', 'fa', 'he', 'ur']);

const day = (ts) => { const t = Date.parse(String(ts || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(ts)) ? '' : 'Z')); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const meta = (m) => { try { return typeof m === 'string' ? JSON.parse(m) : (m || {}); } catch { return {}; } };
const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));

/**
 * { books, tablets } rows (pipeline-snapshot-repo.docPagesRows) → { generated_at, books, tablets }.
 * books: encumbered works (only their opening is shown). tablets: docs whose paragraphs pair an original with English —
 * an English doc with a stored original (with_original), or a Persian/Arabic doc with a recorded translation (with_translation).
 * Hidden traditions are left out; a doc whose recorded original is itself listed is left out (one page per text). Copies of one
 * tablet (same Ocean of Lights bookid or Partial Inventory pin) keep one page: the copy the collaborator order ranks first, then the lowest id.
 */
export function shapeDocPages({ books = [], tablets = [] } = {}, { hidden = new Set(), now = Date.now() } = {}) {
  const shown = (r) => r?.id && r.title && !hidden.has(r.religion);
  const outBooks = books.filter(shown).map((r) => {
    const m = meta(r.metadata);
    return { id: r.id, slug: docPageSlug(r), title: r.title, author: r.author || null, religion: r.religion || null, collection: r.collection || null,
      language: r.language || null, year: r.year || null, description: r.description || null, purchase_url: r.purchase_url || null,
      publisher: r.publisher || m.publicationName || m.publisher || null, cover_url: r.cover_url || null, updated: day(r.updated_at) };
  }).sort(byTitle);
  const pairs = tablets.filter((r) => shown(r) && (r.language === 'en' ? r.with_original > 0 : RTL.has(r.language) && r.with_translation > 0));
  const ids = new Set(pairs.map((r) => r.id));
  const outTablets = pairs.filter((r) => !(r.original_doc_id && r.original_doc_id !== r.id && ids.has(r.original_doc_id))).map((r) => {
    const m = meta(r.metadata);
    return { id: r.id, slug: docPageSlug(r), title: r.title, author: r.author || null, religion: r.religion || null, collection: r.collection || null,
      language: r.language === 'en' ? (r.original_lang || null) : r.language, paired: r.language === 'en' ? r.with_original : r.with_translation,
      bookid: m.bookid || null, pin: m.pin || null, source_url: r.source_url || null, updated: day(r.updated_at) };
  });
  const rank = (t) => linkFor({ id: t.id, source_url: t.source_url, metadata: { bookid: t.bookid, pin: t.pin } }, null).tier;
  const best = new Map();
  for (const t of outTablets) {
    const k = t.bookid ? `b:${t.bookid}` : t.pin ? `p:${t.pin}` : `i:${t.id}`, had = best.get(k);
    if (!had || rank(t) < rank(had) || (rank(t) === rank(had) && t.id < had.id)) best.set(k, t);
  }
  return { generated_at: new Date(now).toISOString(), books: outBooks, tablets: [...best.values()].sort(byTitle) };
}

let cache = { path: null, mtime: -1, data: null };
/** The latest snapshot, or null when siftersearch-reports has not written one yet (never queries). */
export function readDocPages(path = DEFAULT_PATH) {
  try {
    const m = statSync(path).mtimeMs;
    if (cache.path !== path || m !== cache.mtime) cache = { path, mtime: m, data: JSON.parse(readFileSync(path, 'utf8')) };
    return cache.data;
  } catch {
    return cache.path === path ? cache.data : null;
  }
}
