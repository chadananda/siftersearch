// Library shelves (Chad 10-10: "small cards … instant loading as groups of documents"; "OceanLibrary books first and
// under each shelf expandable supplementary books"). buildShelves() is PURE: OceanLibrary docs + grouped counts → the
// index the /library page renders in one request. Built out of process (scripts/pipeline-snapshot.js →
// data/library-shelves.json), served edge-cached by GET /api/library/shelves; a shelf's "N more" opens through
// GET /api/library/shelves/items. A multi-part work (KJV, Qur'an…) is ONE card (ol-works.js).
import { olPlacement, OL_SHELVES_OF_SEPARATE_WORKS, OL_WORK_COVER } from './ol-works.js';
import { slugifyPath, generateDocSlug } from '../slug.js';

export const SHELVES_FILE = 'library-shelves.json';
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
// Shelves that lead their tradition, in this order; the rest follow by size. "More works" (books filed directly under a
// tradition) always comes last among the OceanLibrary shelves.
const LEAD = { bahai: ['thebab', 'bahaullah', 'abdulbaha', 'shoghieffendi', 'researchdepartmentcompilations'] };
const SITE_LABEL = { 'bahai-library.com': 'Bahá’í Library Online', 'oceanoflights.org': 'Ocean of Lights (originals)' };
const LIMIT_CARDS = 60;

export function docUrl(d) {
  const slug = d.slug || generateDocSlug(d);
  return slug && d.religion && d.collection ? `/library/${slugifyPath(d.religion)}/${slugifyPath(d.collection)}/${slug}` : `/library/view?doc=${d.id}`;
}
const card = (d) => ({ id: d.id, title: d.title, author: d.author, cover: d.cover_url || null, year: d.year || null,
  paras: d.paragraph_count || 0, url: docUrl(d) });

/**
 * @param olDocs           live OceanLibrary docs (id,title,author,religion,collection,cover_url,year,paragraph_count,slug,file_path)
 * @param authorCounts     groupCounts(['religion','author']) over ALL live docs
 * @param collectionCounts groupCounts(['religion','collection','source_site']) over all live docs
 */
export function buildShelves({ olDocs = [], authorCounts = [], collectionCounts = [], now = new Date() }) {
  const trads = new Map();
  const trad = (name) => {
    if (!trads.has(name)) trads.set(name, { name, slug: slugifyPath(name), shelves: new Map(), library: [], total: 0 });
    return trads.get(name);
  };
  // 1. OceanLibrary shelves
  // OceanLibrary-labelled files OUTSIDE its folder (old Core Publications copies, restored books) go to "More works",
  // unless the same title already stands on a shelf from the OceanLibrary folder.
  const inFolder = (d) => String(d.file_path || '').includes('oceanlibrary.com/');
  const shelved = new Set(olDocs.filter(inFolder).map((d) => `${d.religion}|${fold(d.title)}`));
  for (const d of olDocs) {
    if (!d.religion) continue;
    if (!inFolder(d) && shelved.has(`${d.religion}|${fold(d.title)}`)) continue;
    const { shelf, work } = inFolder(d) ? olPlacement(d.file_path, d.author) : { shelf: null, work: null };
    const t = trad(d.religion);
    const key = shelf || '';
    if (!t.shelves.has(key)) t.shelves.set(key, { name: shelf || 'More works', key, books: [], works: new Map() });
    const s = t.shelves.get(key);
    if (work) {
      if (!s.works.has(work)) s.works.set(work, { title: work, author: d.author, list: [], paras: 0 });
      const w = s.works.get(work);
      w.list.push(d); w.paras += d.paragraph_count || 0;
    } else s.books.push(card(d));
  }
  // 2. per-tradition author totals (folded), to count what the library holds beyond the OceanLibrary shelf
  const byAuthor = new Map();
  for (const r of authorCounts) {
    const k = `${r.religion}|${fold(r.author)}`;
    const e = byAuthor.get(k) || { n: 0, authors: [] };
    e.n += r.n; e.authors.push(r.author);
    byAuthor.set(k, e);
  }
  const traditions = [];
  for (const t of trads.values()) {
    const lead = LEAD[fold(t.name).replace(/s$/, '')] || LEAD[fold(t.name)] || [];
    const shelves = [...t.shelves.values()].map((s) => {
      // a work = one card with its own cover; its parts in OceanLibrary's order (weight), all listed so the card opens instantly
      const works = [...s.works.values()].map((w) => {
        const list = w.list.sort((a, b) => (a.weight ?? 1e9) - (b.weight ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric: true }));
        const lead = list[0];
        return { kind: 'work', title: w.title, author: w.author, parts: list.length, paras: w.paras, id: lead.id, url: docUrl(lead),
          cover: OL_WORK_COVER[w.title] || list.find((p) => p.cover_url)?.cover_url || null, list: list.map(card) };
      });
      const items = [...works, ...s.books.sort((a, b) => a.title.localeCompare(b.title))];
      // "N more": an author shelf opens the rest of that author's works in the library (all sites, any collection)
      // the folder decides (a compilation filed under Bahá'u'lláh is still on his shelf)
      const isAuthor = s.key && fold(s.key) !== 'unknown' && !works.length && !OL_SHELVES_OF_SEPARATE_WORKS.has(s.key);
      const more = isAuthor ? byAuthor.get(`${t.name}|${fold(s.key)}`) : null;
      const extra = more ? Math.max(0, more.n - s.books.length) : 0;
      return { name: fold(s.name) === 'unknown' ? 'Other works' : s.name, key: s.key, count: items.length,
        items: items.slice(0, LIMIT_CARDS), more: extra ? { count: extra, authors: more.authors } : null };
    }).sort((a, b) => {
      const ia = lead.indexOf(fold(a.key)), ib = lead.indexOf(fold(b.key));
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      if (!a.key !== !b.key) return a.key ? -1 : 1;            // "More works" last
      return b.count - a.count;
    });
    traditions.push({ name: t.name, slug: t.slug, shelves, library: [], ol: shelves.reduce((n, s) => n + s.count, 0) });
  }
  // 3. the rest of each tradition's library, as collapsed shelves (collection, or the site it came from)
  const tmap = new Map(traditions.map((t) => [t.name, t]));
  for (const r of collectionCounts) {
    if (!r.religion || r.source_site === 'oceanlibrary.com') continue;
    let t = tmap.get(r.religion);
    if (!t) { t = { name: r.religion, slug: slugifyPath(r.religion), shelves: [], library: [], ol: 0 }; tmap.set(r.religion, t); traditions.push(t); }
    t.library.push({ name: r.source_site ? (SITE_LABEL[r.source_site] || r.source_site) : (r.collection || 'Uncategorized'),
      collection: r.source_site ? null : (r.collection || null), site: r.source_site || null, count: r.n });
  }
  for (const t of traditions) {
    t.library.sort((a, b) => b.count - a.count);
    t.total = t.ol + t.library.reduce((n, s) => n + s.count, 0);
  }
  traditions.sort((a, b) => (fold(b.name).startsWith('bahai') - fold(a.name).startsWith('bahai')) || b.total - a.total);
  return { generated_at: now.toISOString(), traditions };
}
