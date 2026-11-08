// DOC TWINS (Chad 11-08: "don't index second copies. if they are truly duplicated, mark them duplicates so they do not clutter the
// index"). A scraped doc is a second copy when another live doc holds ≥ 90% of its distinct texts word for word AND it holds ≥ 90%
// of the other's (mutual — a tablet that also sits inside a compilation is NOT a copy). The better copy keeps: main library /
// OceanLibrary → Ocean of Lights → Phelps → bahai-library → other; then more texts, a real author, the older id. Dry by default;
// write marks duplicate_of (no file moves) and the indexers skip it (INDEXABLE_DOC_SQL). params { sites?, write, limit, afterId, share, sample }
import { listDocs, getDoc, markDuplicate } from '../docs-repo.js';
import { docTwins } from '../paragraphs-repo.js';

export const TWIN_SITES = ['bahai-library.com', 'oceanoflights.org'];
const TIER = { '': 0, 'oceanlibrary.com': 1, 'oceanoflights.org': 2, 'portlandiator.github.io': 3, 'bahai-library.com': 4 };
export const siteTier = (s) => TIER[s || ''] ?? 5;
const realAuthor = (a) => !!a && !/^\d+$/.test(String(a).trim());

/** Pure: is `b` the better copy to keep than `a`? Each { id, source_site, author, texts }. */
export function betterCopy(a, b) {
  const t = siteTier(a.source_site) - siteTier(b.source_site);
  if (t) return t > 0;
  if (a.texts !== b.texts) return b.texts > a.texts;
  if (realAuthor(a.author) !== realAuthor(b.author)) return realAuthor(b.author);
  return b.id < a.id;
}
/** Pure: the twin that makes `doc` a second copy, or null. twins from docTwins; info(id) → doc row. */
export function secondCopyOf(doc, mine, twins, info, share = 0.9) {
  for (const t of twins) {
    if (!mine || !t.theirs || t.shared / mine < share || t.shared / t.theirs < share) continue;
    const other = info(t.other);
    if (other && betterCopy({ ...doc, texts: mine }, { ...other, texts: t.theirs })) return { ...t, keep: other };
  }
  return null;
}

export async function docTwinsJob({ sites = TWIN_SITES, write = false, limit = Infinity, afterId: start = 0, share = 0.9, sample = 20 } = {}, deps = {}) {
  const { docs = listDocs, twins = docTwins, doc = getDoc, mark = markDuplicate } = deps;
  const out = { write, scanned: 0, noText: 0, copies: 0, marked: 0, refused: [], bySite: {}, keptBy: {}, samples: [], next_after_id: null };
  const marked = new Set();
  for (const site of sites) {
    for (let afterId = start; out.scanned < limit;) {
      const page = (await docs({ scope: 'live', sourceSite: site, afterId, fields: ['id', 'title', 'author', 'source_site'], limit: 500, count: false })).docs || [];
      if (!page.length) break;
      for (const d of page) {
        if (out.scanned >= limit) { out.next_after_id = { site, afterId: d.id - 1 }; break; }
        out.scanned++;
        if (marked.has(d.id)) continue;
        const { mine, twins: tw } = await twins(d.id);
        if (!mine) { out.noText++; continue; }
        const rows = new Map();
        for (const t of tw) if (!marked.has(t.other)) rows.set(t.other, await doc(t.other, { follow: false, fields: ['id', 'title', 'author', 'source_site'] }));
        const hit = secondCopyOf(d, mine, tw.filter((t) => rows.get(t.other)), (id) => rows.get(id), share);
        if (!hit) continue;
        out.copies++;
        out.bySite[site] = (out.bySite[site] || 0) + 1;
        const k = hit.keep.source_site || 'library';
        out.keptBy[k] = (out.keptBy[k] || 0) + 1;
        if (out.samples.length < sample) out.samples.push({ dup: d.id, dup_title: d.title, keep: hit.keep.id, keep_title: hit.keep.title, keep_site: k, texts: mine, shared: hit.shared, theirs: hit.theirs });
        if (!write) continue;
        try { await mark(d.id, hit.keep.id, { reason: `twin: ${hit.shared}/${mine} texts shared with ${hit.keep.id} (${hit.theirs})` }); marked.add(d.id); out.marked++; }
        catch (e) { if (out.refused.length < 50) out.refused.push({ dup: d.id, keep: hit.keep.id, error: e.message }); }
      }
      if (out.next_after_id) break;
      afterId = page[page.length - 1].id;
    }
    if (out.next_after_id) break;
  }
  return out;
}
