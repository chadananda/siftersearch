// Biography URLs on the Anís host (Chad 11-14): anis.oceanlibrary.com/bio[/<slug>] is canonical; the pages themselves are
// siftersearch's designed Astro pages rendered there (src/pages/biography*, src/lib/anis-host.js). Here: the path patterns,
// the URL/slug helpers the link policy imports, the tower JSON read, and the /anis-sitemap.xml entries.
import { ORIGIN } from './share.js';

export const BIO_PATH = /^\/bio(?:\/([^/]{1,160}))?\/?$/;
// siftersearch.com/biography[/<key>] — the old home; 301s to /bio[/<key>] (the key is resolved there)
export const BIOGRAPHY_PATH = /^\/biography(?:\/([^/]{1,160}))?\/?$/;
export const bioUrl = (slug) => `${ORIGIN}/bio${slug ? `/${slug}` : ''}`;
// slug of a biography link (/bio/<slug>, /biography/<slug>, absolute or not): '' for the index, null when not a biography
export function bioSlug(href) {
  let p; try { p = new URL(href, 'https://x.invalid').pathname; } catch { return null; }
  const m = BIO_PATH.exec(p) || BIOGRAPHY_PATH.exec(p);
  return m ? (m[1] || '') : null;
}

export const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });
  if (r.status === 404 || r.status === 400) return { missing: true };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};

/** The host's sitemap entries for the biographies (index + each page); [] when tower cannot be read. */
export async function bioSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const { data } = await read(fetchFn, `${api}/api/v1/people/sitemap`);
    return [{ loc: bioUrl(''), changefreq: 'weekly' }, ...(data?.people || []).filter((x) => x?.slug).map((x) => ({ loc: bioUrl(x.slug), changefreq: 'monthly' }))];
  } catch { return []; }
}
