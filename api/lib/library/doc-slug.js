// The /doc/<slug> URL of a unique library resource on the Anís host (Chad 11-14): `<title>[-<author>]-<id>`, ASCII, the
// trailing id authoritative (titles change; a stale or bare-id slug 301s to the current one). Pure; the site Worker,
// the snapshot shaper and the link policy share it.
import { generateSlug } from '../slug.js';

export const DOC_ORIGIN = 'https://anis.oceanlibrary.com';
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/-[^-]*$/, '') || s.slice(0, n));

/** doc {id, title, author} → 'gate-of-the-heart-understanding-the-writings-of-the-bab-nader-saiedi-8632'. */
export function docPageSlug(doc) {
  const id = Number(doc?.id ?? doc?.doc_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const t = cut(generateSlug(String(doc.title || '')), 64);
  const au = doc.author && !/^(unknown|anonymous)$/i.test(doc.author) ? cut(generateSlug(String(doc.author)), 24) : '';
  const a = au && !t.includes(au) ? au : '';
  return [t, a, String(id)].filter(Boolean).join('-');
}

/** '…-8632' | '8632' → 8632; anything else → null. */
export function docIdFromSlug(slug) {
  const m = /(?:^|-)(\d{1,9})$/.exec(String(slug || ''));
  return m ? Number(m[1]) : null;
}

export const docPagePath = (doc) => { const s = docPageSlug(doc); return s ? `/doc/${s}` : null; };
export const docPageUrl = (doc) => { const p = docPagePath(doc); return p ? DOC_ORIGIN + p : null; };
