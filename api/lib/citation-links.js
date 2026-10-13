// Citation links point at the best PUBLISHER of the passage, whatever copy search found (Chad 10-12, universal for SourceHunt,
// Anís, search and the API): an identical copy on OceanLibrary (range link) beats Ocean of Lights (page + range) beats
// Phelps beats bahai-library beats siftersearch. linkFor ranks the found copy's own addresses; this looks across copies.
// Deps: copies-repo (injectable), source-links.
import { linkFor } from './source-links.js';

/** items: [{ id (paragraph), link: linkFor result, quote? }] → Map(id → better link) for those an identical copy beats. */
export async function betterCopyLinks(items, { copies } = {}) {
  const need = (items || []).filter((x) => x?.id && x.link && x.link.tier > 1);
  if (!need.length) return new Map();
  const find = copies || (await import('./repos/copies-repo.js')).identicalCopies;
  const byId = await find(need.map((x) => x.id));
  const out = new Map();
  for (const x of need) {
    let best = null;
    for (const c of byId.get(Number(x.id)) || []) {
      const l = linkFor({ ...c, id: c.doc_id }, c.paragraph_index, { quote: x.quote || null });
      if (l.tier < (best?.tier ?? x.link.tier) || (best && l.tier === best.tier && l.paragraph_level && !best.paragraph_level)) best = l;
    }
    if (best && best.tier < x.link.tier) out.set(Number(x.id), best);
  }
  return out;
}
