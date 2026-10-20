// STAMP SITE (planning/site-databases-plan.md step 1; Chad 10-20: one database per scraped site): every Qdrant point of a
// scraped site's paragraphs carries `site` (e.g. 'bahai-library.com'), so search can filter a site-only scope in Qdrant and
// hydrate each hit from its own store once the sites move out of the primary DB. Payload only, by batches of document ids;
// scope 'all' docs (retired ones' stale points too). Runs in the INDEXER service. params { sites, batch = 500, collections, afterId }.
// Yields between batches when the service drains, returning `resume: { sites: <remaining>, afterId }`.
import { listDocs } from '../docs-repo.js';
import { qdrantRequest } from '../search/qdrant-layers.js';
import { isDraining } from '../drain.js';

const COLLECTIONS = ['phrases', 'paragraphs_kw', 'hype'];
export const SCRAPED_SITES = ['bahai-library.com', 'oceanoflights.org', 'bahaiteachings.org'];

export async function stampSiteJob({ sites = SCRAPED_SITES, batch = 500, collections = COLLECTIONS, afterId: from = 0 } = {}, deps = {}) {
  const { docs = listDocs, qd = qdrantRequest, index = ensureSiteIndex, draining = isDraining } = deps;
  for (const c of collections) await index(c).catch(() => {});
  const out = { sites: {}, calls: 0, errors: 0 };
  for (const [si, site] of sites.entries()) {
    let afterId = si === 0 ? Number(from) || 0 : 0, n = 0;
    for (;;) {
      if (draining()) return { ...out, yielded: true, resume: { sites: sites.slice(si), afterId } };
      const page = await docs({ scope: 'all', sourceSite: site, fields: ['id'], limit: batch, afterId, count: false });
      const ids = (page.docs || []).map((d) => Number(d.id));
      if (!ids.length) break;
      for (const c of collections) {
        try {
          await qd(`/collections/${c}/points/payload?wait=false`, { payload: { site }, filter: { must: [{ key: 'doc_id', match: { any: ids } }] } });
          out.calls++;
        } catch { out.errors++; }
      }
      n += ids.length;
      afterId = ids[ids.length - 1];
      await new Promise((r) => setTimeout(r, 25));
    }
    out.sites[site] = n;
  }
  return out;
}

/** A keyword payload index on `site` (idempotent). */
async function ensureSiteIndex(collection) {
  await fetch(`${process.env.QDRANT_URL || 'http://127.0.0.1:6333'}/collections/${collection}/index?wait=false`, { method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' }, body: JSON.stringify({ field_name: 'site', field_schema: 'keyword' }) });
}
