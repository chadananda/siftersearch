// Citation links point at the best PUBLISHER of the passage, whatever copy search found (Chad 10-12, universal for SourceHunt,
// Anís, search and the API): an identical copy on OceanLibrary (range link) beats Ocean of Lights (page + range) beats
// Phelps beats bahai-library beats siftersearch. linkFor ranks the found copy's own addresses; this looks across copies.
// Deps: copies-repo (injectable), source-links.
import { linkFor } from './source-links.js';

// The SAME WORK only: the bahai-library copy of Gleanings → OceanLibrary's Gleanings; "Bahá'í World Faith" quoting those words
// stays Bahá'í World Faith (10-12: a row naming one publication must not link another).
const workKey = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(the|a|an)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
const sameWork = (a, b) => { const x = workKey(a), y = workKey(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/** items: [{ id (paragraph), title (its work), link: linkFor result, quote? }] → Map(id → better link) where an identical copy
 *  of the same work is published higher. Without a title, any identical copy counts. */
export async function betterCopyLinks(items, { copies } = {}) {
  const need = (items || []).filter((x) => x?.id && x.link && x.link.tier > 1);
  if (!need.length) return new Map();
  const find = copies || (await import('./repos/copies-repo.js')).identicalCopies;
  const byId = await find(need.map((x) => x.id));
  const out = new Map();
  for (const x of need) {
    let best = null;
    for (const c of byId.get(Number(x.id)) || []) {
      if (x.title && !sameWork(x.title, c.title)) continue;
      const l = linkFor({ ...c, id: c.doc_id }, c.paragraph_index, { quote: x.quote || null });
      if (l.tier < (best?.tier ?? x.link.tier) || (best && l.tier === best.tier && l.paragraph_level && !best.paragraph_level)) best = l;
    }
    if (best && best.tier < x.link.tier) out.set(Number(x.id), best);
  }
  return out;
}
