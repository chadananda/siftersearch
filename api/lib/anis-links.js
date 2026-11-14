// Anís link policy (Chad 11-14): collaborator sites first (config/link-sites.json order), else the Anís host; NEVER siftersearch.com in
// Anís output. anisUrl maps one of our addresses to its Anís page (null = no public page: the caller unlinks); anisText every address in
// a reply/HTML; anisDeep every string in an event or tool result. Pure, edge-safe. Deps: config/link-sites.json, library/doc-slug.js.
import CFG from '../../config/link-sites.json' with { type: 'json' };
import { docPageSlug, docIdFromSlug } from './library/doc-slug.js';

export const LINK_SITES = CFG.sites;
export const ANIS_ORIGIN = CFG.anis.origin;
const ANIS_HOST = new URL(ANIS_ORIGIN).hostname;
const OWN = CFG.own;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const isOwnHost = (h) => !!h && OWN.some((d) => h === d || h.endsWith(`.${d}`));
/** Our own address (siftersearch.com or the Anís host): never a source, only a fallback. */
export const isOurs = (u) => { const h = hostOf(u); return isOwnHost(h) || h === ANIS_HOST; };

/**
 * The reader's site → the hosts linkFor ranks first (`prefer`, Chad 11-14: one fixed order, the site the reader is on first when it
 * holds the text). The deployment's own home hosts win; else the embedding page's host, when it is a configured collaborator (the
 * Anís app itself is none: the plain order). → [host] | null.
 */
export function preferFor({ home = null, site = null } = {}) {
  const own = (Array.isArray(home) ? home : home?.hosts || []).map((h) => String(h).toLowerCase().replace(/^www\./, '')).filter(Boolean);
  if (own.length) return own;
  const h = String(site || '').toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (h === ANIS_HOST) return null; // Anís's own app: no site of the reader's, the plain config order
  const s = h && LINK_SITES.find((x) => x.hosts.some((d) => h === d || h.endsWith(`.${d}`)));
  return s ? [...s.hosts] : null;
}

const idOf = (doc) => Number(doc?.document_id ?? doc?.doc_id ?? doc?.id) || null;
/** The Anís page of a library document (title + author + id; the id alone 301s to it). */
export function docPage(doc, paragraphIndex = null) {
  const id = idOf(doc);
  if (!id) return null;
  // the WORK's author names the page: a passage's own `author` is its paragraph's writer (doc 430 ¶594: a quoted Ḥájí, not Taherzadeh)
  const author = doc.book_author ?? doc.doc_author ?? doc.document_author ?? doc.document?.author ?? doc.author ?? doc.source_author ?? null;
  const slug = docPageSlug({ id, title: doc.title ?? doc.source_title ?? '', author }) || String(id);
  return `${ANIS_ORIGIN}/doc/${slug}${paragraphIndex != null ? `#p${paragraphIndex}` : ''}`;
}

/**
 * One of our addresses → its Anís page; anything else unchanged. → url | null (null: no public Anís page — unlink, never ours).
 * doc: the passage/work the URL belongs to ({document_id|doc_id|id, title, author}), so a /library/<slug> reader link finds its /doc page.
 */
export function anisUrl(u, { doc = null } = {}) {
  if (typeof u !== 'string' || !u) return u;
  let url;
  try { url = new URL(u); } catch { return u; }
  if (!isOwnHost(url.hostname.replace(/^www\./, ''))) return u;
  const p = url.pathname, hash = url.hash, q = url.search;
  const at = (path, keep = '') => `${ANIS_ORIGIN}${path}${keep}`;
  if (/^\/(img|api)\//.test(p)) return at(p, q);   // images and public reads: the Anís host serves the same paths
  let m;
  if ((m = /^\/dialogue(?:\/([a-z0-9][a-z0-9-]*))?\/?$/.exec(p))) return at(`/discuss${m[1] ? `/${m[1]}` : ''}`);
  if ((m = /^\/biography(?:\/([^/]+))?\/?$/.exec(p))) return at(`/bio${m[1] ? `/${m[1]}` : ''}`);
  if ((m = /^\/media(?:\/([^/]+))?\/?$/.exec(p))) return at(`/media${m[1] ? `/${m[1]}` : ''}`, hash);
  if ((m = /^\/document\/(\d+)\/?$/.exec(p))) return docPage(doc && idOf(doc) === +m[1] ? doc : { id: +m[1] }) + hash;
  if (p === '/library/view' && url.searchParams.get('doc')) { const id = +url.searchParams.get('doc'); return docPage(doc && idOf(doc) === id ? doc : { id }) + hash; }
  if (/^\/library\/.+/.test(p)) { const d = docPage(doc); return d ? d + hash : null; }   // a reader path names no id: only the passage it came with knows it
  if (p === '/' || p === '' || p === '/search' || p === '/anis') return at('/');   // search → the Anís app
  return null;   // admin, research articles, anything without an Anís page: unlinked
}

const MD_LINK = /\[([^\[\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g;
const ATTR = /(href|src)=(["'])(https?:\/\/[^"']+)\2/g;
const BARE = /\(?<?https?:\/\/(?:[a-z0-9-]+\.)*siftersearch\.com(?:[/?#][^\s)>"'<\]]*)?>?\)?/gi;
/** Every address of ours in a reply (markdown or HTML) → its Anís page; one with no page → its label (markdown) / the app (HTML). */
export function anisText(text, { docOf = () => null } = {}) {
  const s = String(text ?? '');
  if (!/siftersearch\.com/i.test(s)) return s;
  return s
    .replace(MD_LINK, (all, label, u) => { if (!isOwnHost(hostOf(u))) return all; const a = anisUrl(u, { doc: docOf(u) }); return a ? `[${label}](${a})` : label; })
    .replace(ATTR, (all, k, qt, u) => { if (!isOwnHost(hostOf(u))) return all; const a = anisUrl(u, { doc: docOf(u) }) || `${ANIS_ORIGIN}/`; return `${k}=${qt}${a}${qt}`; })
    .replace(BARE, (all) => {   // sentence punctuation after a bare address is prose, not path ("…/document/430." keeps its link)
      const u = all.replace(/^\(?<?|>?\)?$/g, '').replace(/[.,;:!?]+$/, ''); const tail = all.slice(all.indexOf(u) + u.length);
      const a = anisUrl(u, { doc: docOf(u) }); return a ? all.replace(u, a) : tail.replace(/^>?\)?/, ''); });
}

/** Every string in an event / tool result made Anís-safe; an object's own document (document_id + title + author) resolves its reader links. */
export function anisDeep(v, doc = null) {
  if (typeof v === 'string') {
    if (!/siftersearch\.com/i.test(v)) return v;
    if (/^https?:\/\/\S+$/.test(v)) return anisUrl(v, { doc });
    return anisText(v, { docOf: () => doc });
  }
  if (Array.isArray(v)) return v.map((x) => anisDeep(x, doc));
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, anisDeep(x, doc)]));
  if (v instanceof Set) return new Set([...v].map((x) => anisDeep(x, doc)));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const own = idOf(v) && (v.title || v.source_title) ? v : doc;
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = anisDeep(x, own);
    return o;
  }
  return v;
}

// A citation's "#n" is the library FILE's paragraph number (para_N, paragraphs-repo para_no); the /doc page anchors by the row's
// paragraph_index. They drift wherever the file has blocks the rows lack (doc 431: 3,276 blocks, 3,254 rows → #1739 is #p1716).
/** A held passage's citation number: its para_no, else the "#n" its place ends with when no locator names the paragraph. */
const paraNoOf = (p) => {
  if (Number.isInteger(p?.para_no)) return p.para_no;
  const m = !p?.locator && /(?:^|,\s)#(\d+)$/.exec(String(p?.place || ''));
  return m ? Number(m[1]) : null;
};
/** Held passages → Map docId → { idx: Set(paragraph_index), no: Map(para_no → paragraph_index) }. Pure. */
export function anchorMap(passages) {
  const m = new Map();
  for (const p of passages || []) {
    const id = idOf(p), idx = Number.isInteger(p?.paragraph_index) ? p.paragraph_index : null;
    if (!id || idx == null) continue;
    if (!m.has(id)) m.set(id, { idx: new Set(), no: new Map() });
    const e = m.get(id), n = paraNoOf(p);
    e.idx.add(idx);
    if (n != null) e.no.set(n, idx);
  }
  return m;
}
/** "#p1739" | "#1739" on doc id → the anchor of the held row it names ("#p1716"); a real paragraph_index, or a number no held
 *  passage maps, stays as it is (never an assumed offset). Pure. */
export function fixAnchor(hash, id, anchors) {
  const m = /^#p?(\d+)$/.exec(String(hash || '')), e = m && anchors?.get(Number(id));
  if (!e) return hash;
  const n = Number(m[1]);
  if (hash.startsWith('#p') && e.idx.has(n)) return hash;
  return e.no.has(n) ? `#p${e.no.get(n)}` : hash;
}
const ANIS_DOC = new RegExp(`${ANIS_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/doc/([a-z0-9-]+)(#p?\\d+)`, 'g');
/** Every Anís /doc link in a reply anchored at the row its citation number names (anchorMap of the turn's held passages). Pure. */
export const anchorLinks = (text, passages) => {
  const anchors = anchorMap(passages);
  if (!anchors.size) return String(text ?? '');
  return String(text ?? '').replace(ANIS_DOC, (all, slug, hash) => `${ANIS_ORIGIN}/doc/${slug}${fixAnchor(hash, docIdFromSlug(slug), anchors)}`);
};
