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
  const out = { docs: 0, groups: 0, calls: 0, errors: 0, missing: 0, failed: [] };
  const all = [...new Set((ids || []).map(Number).filter(Boolean))];
  for (let i = 0; i < all.length; i += 1000) {
    if (draining()) return { ...out, yielded: true, resume: { ids: all.slice(i) } };
    const chunk = all.slice(i, i + 1000);
    const rows = (await docs({ scope: 'all', ids: chunk, fields: ['id', 'author', 'religion'], limit: 1000, count: false })).docs || [];
    out.missing += chunk.length - rows.length;
    // payload → { ids, olds }: old author keys are per-doc slugs, so matching ANY of a group's old keys is still per-doc
    // (and stays one group per new payload instead of one per doc). A doc without `was` gets a group with no old-key filter.
    const groups = new Map();
    for (const d of rows) {
      const author = String(d.author || '').trim();
      if (!author) { out.missing++; continue; }
      const old = was[d.id] ?? was[String(d.id)];
      const k = JSON.stringify([{ author, author_fold: authorKey(author), ...(d.religion ? { religion: d.religion } : {}) }, !!old]);
      if (!groups.has(k)) groups.set(k, { ids: [], olds: new Set() });
      groups.get(k).ids.push(Number(d.id));
      if (old) groups.get(k).olds.add(authorKey(old));
      out.docs++;
    }
    for (const [k, g] of groups) {
      out.groups++;
      const [payload] = JSON.parse(k);
      const olds = [...g.olds];
      for (let j = 0; j < g.ids.length; j += batch) for (const c of collections) {
        const gids = g.ids.slice(j, j + batch);
        const must = [{ key: 'doc_id', match: { any: gids } }, ...(olds.length ? [{ key: 'author_fold', match: { any: olds } }] : [])];
        let err = null;
        for (let t = 0; t < 2; t++) {
          try { await qd(`/collections/${c}/points/payload?wait=false`, { payload, filter: { must } }); err = null; break; } catch (e) { err = e; }
        }
        if (err) { out.errors++; out.failed.push({ collection: c, ids: gids, error: String(err?.message || err).slice(0, 200) }); } else out.calls++;
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return out;
}
