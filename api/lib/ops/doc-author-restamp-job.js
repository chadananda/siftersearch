// DOC AUTHOR RESTAMP. Docs corrected in the DB (doc-corrections, oceanoflights-slug-authors) keep their old author/religion on
// every Qdrant point; this stamps the CURRENT row's {author, author_fold, religion} on the points of those docs. Payload only
// (no re-embedding). Docs grouped by identical payload so one call stamps many. INDEXER service. params { ids, batch = 500, collections }.
// Yields when the service drains, returning `resume: { ids: <remaining> }`.
import { listDocs } from '../docs-repo.js';
import { authorKey, qdrantRequest } from '../search/qdrant-layers.js';
import { isDraining } from '../drain.js';

export const COLLECTIONS = ['phrases', 'paragraphs_kw', 'hype', 'concepts'];

// was { [docId]: old author }: only points still stamped with the OLD author key change — a paragraph with its own writer
// (a compilation quoting Bahá'u'lláh, content.authors) keeps it. Without `was`, every point of the doc is stamped.
export async function docAuthorRestampJob({ ids = [], was = {}, batch = 500, collections = COLLECTIONS } = {}, deps = {}) {
  const { docs = listDocs, qd = qdrantRequest, draining = isDraining } = deps;
  const out = { docs: 0, groups: 0, calls: 0, errors: 0, missing: 0 };
  const all = [...new Set((ids || []).map(Number).filter(Boolean))];
  for (let i = 0; i < all.length; i += 1000) {
    if (draining()) return { ...out, yielded: true, resume: { ids: all.slice(i) } };
    const chunk = all.slice(i, i + 1000);
    const rows = (await docs({ scope: 'all', ids: chunk, fields: ['id', 'author', 'religion'], limit: 1000, count: false })).docs || [];
    out.missing += chunk.length - rows.length;
    const groups = new Map();   // payload → [doc ids]
    for (const d of rows) {
      const author = String(d.author || '').trim();
      if (!author) { out.missing++; continue; }
      const old = was[d.id] ?? was[String(d.id)];
      const k = JSON.stringify([{ author, author_fold: authorKey(author), ...(d.religion ? { religion: d.religion } : {}) }, old ? authorKey(old) : null]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(Number(d.id));
      out.docs++;
    }
    for (const [k, gids] of groups) {
      out.groups++;
      const [payload, oldFold] = JSON.parse(k);
      for (let j = 0; j < gids.length; j += batch) for (const c of collections) {
        const must = [{ key: 'doc_id', match: { any: gids.slice(j, j + batch) } }, ...(oldFold ? [{ key: 'author_fold', match: { value: oldFold } }] : [])];
        try {
          await qd(`/collections/${c}/points/payload?wait=false`, { payload, filter: { must } });
          out.calls++;
        } catch { out.errors++; }
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return out;
}
