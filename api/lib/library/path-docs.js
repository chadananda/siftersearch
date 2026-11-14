// A reader path (/library/<religion>/<collection>/<slug>) → its document { id, title, author }, so the Anís link policy can route
// siftersearch reader links (bio sources, talk quotes) to a collaborator or /doc (Chad 11-14). The by-path page's matching over
// docs-repo candidates, else the recorded redirect (slug/language renames); a duplicate copy → its canonical. Deps: docs-repo.js,
// redirects-repo.js, slug.js.
import { docsForPathSlugs, getDoc } from '../docs-repo.js';
import { redirectTarget } from '../repos/redirects-repo.js';
import { slugifyPath, generateDocSlug, parseDocSlug, resolveByTitlePart, resolveBySlugTail } from '../slug.js';

const seg = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
/** '/library/<religion>/<collection>/<slug>' (a full URL, query and #p anchor allowed) → { religion, collection, slug, path (decoded, as a redirect records it) } | null. */
export function parseLibraryPath(u) {
  let p = String(u || '');
  try { if (/^https?:/i.test(p)) p = new URL(p).pathname; } catch { return null; }
  const m = /^\/library\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/?(?:[?#].*)?$/.exec(p);
  if (!m || m[1] === 'view') return null;
  const [r, c, slug] = [seg(m[1]), seg(m[2]), seg(m[3])];
  return { religion: slugifyPath(r), collection: slugifyPath(c), slug, path: `/library/${r}/${c}/${slug}` };
}

/** The candidate a reader slug names, as the by-path page matches it: stored slug, generated slug (author prefix or dedup suffix
 *  missing), then a missing / wrong author prefix. Live copies first; null when none or ambiguous. Pure. */
export function matchPathDoc(slug, candidates = []) {
  const live = (d) => !d.deleted_at;
  const stored = candidates.filter((d) => d.slug === slug);
  if (stored.length) return stored.find((d) => live(d) && !d.duplicate_of) || stored.find(live) || null;
  const { baseSlug } = parseDocSlug(slug);
  const gen = candidates.filter(live).find((d) => {
    const g = generateDocSlug(d);
    if (g === slug || g.endsWith(`_${slug}`) || g.replace(/-\d+$/, '').endsWith(`_${slug}`)) return true;
    const { baseSlug: b } = parseDocSlug(g);
    return (b.includes('_') ? b.split('_').slice(1).join('_') : b) === baseSlug;
  });
  return gen || resolveBySlugTail(slug, candidates.filter(live)) || resolveByTitlePart(slug, candidates);
}

const brief = (d) => (d ? { id: d.id, title: d.title || null, author: d.author || null } : null);
/** One reader path → { id, title, author } | null (unknown path, or a deleted book). */
export async function resolveLibraryPath(u, { candidatesFor = docsForPathSlugs, get = getDoc, redirect = redirectTarget, hops = 3 } = {}) {
  const p = parseLibraryPath(u);
  if (!p) return null;
  const d = matchPathDoc(p.slug, await candidatesFor(p.religion, p.collection, slugifyPath));
  if (!d) {   // a renamed slug (an '_ar' copy filed as '_fa', 11-14): the redirect the reader page would follow
    const to = hops > 0 ? await redirect(p.path) : null;
    return to && to !== p.path ? resolveLibraryPath(to, { candidatesFor, get, redirect, hops: hops - 1 }) : null;
  }
  return brief(d.duplicate_of ? await get(d.id, { follow: true, fields: ['id', 'title', 'author'] }) : d);
}

/** Several reader paths → { [path as given]: doc | null } (each religion/collection's candidates are memoised by docs-repo). */
export async function resolveLibraryPaths(paths, opts) {
  const out = {};
  for (const u of [...new Set((paths || []).map(String))]) out[u] = await resolveLibraryPath(u, opts).catch(() => null);
  return out;
}
