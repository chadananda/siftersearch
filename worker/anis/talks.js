// Talk URLs on the Anís host (Chad 11-14): anis.oceanlibrary.com/media[/<slug>] is rendered by the designed Astro media
// pages (src/pages/media/, routed in worker/index.js via src/lib/anis-host.js). This keeps the URL helpers the link
// policy imports and the host's sitemap entries. Only published remasters are on air (tower's /api/media gate).
import { ORIGIN } from './share.js';
import { read } from './people.js';

export const MEDIA_PATH = /^\/media(?:\/([a-z0-9][a-z0-9_-]{0,160}))?\/?$/i;
export const mediaUrl = (slug) => `${ORIGIN}/media${slug ? `/${slug}` : ''}`;
// slug of a talk link (/media/<slug>, absolute or not): '' for the index, null when not a talk page
export function mediaSlug(href) {
  let p; try { p = new URL(href, 'https://x.invalid').pathname; } catch { return null; }
  const m = MEDIA_PATH.exec(p);
  return m ? (m[1] || '') : null;
}

/** The host's sitemap entries for the talks (index + each page); [] when tower cannot be read. */
export async function mediaSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const { data } = await read(fetchFn, `${api}/api/media/index`);
    return [{ loc: mediaUrl(''), changefreq: 'daily' }, ...(data?.items || []).filter((x) => x?.s && x.pb !== 'none').map((x) => ({ loc: mediaUrl(x.s), ...(x.at ? { lastmod: String(x.at).slice(0, 10) } : {}) }))];
  } catch { return []; }
}
