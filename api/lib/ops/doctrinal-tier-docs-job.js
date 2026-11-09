// DOCTRINAL TIER BY TRADITION (read-only): per stored religion value × doctrinalTier (core | gray | supplemental), the document count and a
// sample of titles per tier — shows which scriptures a tradition's canon table misses (a scripture listed under supplemental). params { religion?, sample? }.
// Deps: docs-repo listDocs (keyset pages), authority doctrinalTier.
import { listDocs } from '../docs-repo.js';
import { doctrinalTier } from '../authority.js';

export async function doctrinalTierDocsJob({ religion, sample = 15 } = {}, deps = {}) {
  const { docs = listDocs } = deps;
  const by = {};
  let scanned = 0;
  for (let afterId = 0; ;) {
    const page = (await docs({ scope: 'live', ...(religion ? { religion } : {}), afterId, fields: ['id', 'title', 'author', 'religion', 'collection'], limit: 1000, count: false })).docs || [];
    if (!page.length) break;
    afterId = page[page.length - 1].id;
    for (const d of page) {
      scanned++;
      const rel = String(d.religion || '').trim() || '(none)';
      if (!religion && /^bah/i.test(rel)) continue;   // Bahá'í tiers are decided per paragraph author (the phrase-coverage report counts them)
      const row = (by[rel] ||= { core: { docs: 0, sample: [] }, gray: { docs: 0, sample: [] }, supplemental: { docs: 0, sample: [] } });
      const t = row[doctrinalTier(d)];
      t.docs++;
      if (t.sample.length < sample) t.sample.push(`${d.id}: ${d.title}${d.author ? ` — ${d.author}` : ''}`);
    }
  }
  return { scanned, religions: by };
}
