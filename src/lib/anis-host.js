// siftersearch's designed pages on anis.oceanlibrary.com (Chad 11-14): the Worker renders the same Astro pages there, and
// the host itself is the flag (Astro.url). Path map Anís URL ⇄ Astro route (/bio ⇄ /biography, /discuss ⇄ /dialogue), the
// canonical rule, and the link/URL pass over a rendered page (anisHtml) so nothing on the Anís host points at siftersearch.com.
import { anisUrl } from '../../api/lib/anis-links.js';

export const ANIS_HOST = 'anis.oceanlibrary.com';
export const ANIS_ORIGIN = `https://${ANIS_HOST}`;
const SITE = /^https?:\/\/(www\.)?siftersearch\.com(?=[/?#]|$)/;

export const isAnisHost = (url) => {
  try { return new URL(url).hostname === ANIS_HOST; } catch { return false; }
};

// the sections whose designed Astro pages render on the Anís host (the rest still use worker/anis/*)
export const ASTRO_SECTIONS = ['media', 'bio'];
const ASTRO_ROUTE = { media: [/^\/media(\/.*)?$/, (p) => p], bio: [/^\/bio(\/[^/]+)?\/?$/, (p) => p.replace(/^\/bio/, '/biography')],
  discuss: [/^\/discuss(\/[a-z0-9][a-z0-9-]{0,160})?\/?$/, (p) => p.replace(/^\/discuss/, '/dialogue')] };

/** An Anís-host path → the Astro route that renders it there, or null. */
export function astroPath(p, sections = ASTRO_SECTIONS) {
  for (const s of sections) { const [re, to] = ASTRO_ROUTE[s]; if (re.test(p)) return to(p); }
  return null;
}

/** An Astro route → its path on the Anís host (/biography → /bio, /dialogue → /discuss); other paths unchanged. */
export const anisPath = (p) => p.replace(/^\/biography(?=\/|$)/, '/bio').replace(/^\/dialogue(?=\/|$)/, '/discuss');

// paths the Anís host answers (anything else there goes home to oceanlibrary.com)
const ON_ANIS = /^\/($|media(\/|$)|bio(\/|$)|discuss(\/|$)|doc(\/|$)|d\/|api\/|img\/|_astro\/|fonts\/|anis-app\/|widget|favicon|anis-sitemap\.xml$)/;

/**
 * A link on a page rendered on the Anís host → where it points there: a page the host serves keeps its path; anything else
 * goes through the Anís link policy (anisUrl: /document/<id> → /doc or a collaborator, search → the app); null = no Anís page.
 */
export function anisHref(href) {
  const h = String(href ?? '');
  if (!h || /^(#|\?|mailto:|tel:|javascript:|data:)/i.test(h) || h.startsWith('//')) return h;
  const abs = SITE.test(h);
  if (!abs && !h.startsWith('/')) return h;   // another site, or relative to this page
  const u = new URL(h, 'https://siftersearch.com');
  const p = anisPath(u.pathname);
  if (ON_ANIS.test(p)) { const rel = `${p}${u.search}${u.hash}`; return abs ? `${ANIS_ORIGIN}${rel}` : rel; }
  return anisUrl(u.href) || null;
}

/** A name that opens a title, heading or list entry: first letter capitalised ("the Báb" → "The Báb"); mid-sentence uses keep the stored form. */
export const capName = (s) => String(s || '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());

/** A title or description on the Anís host: the Anís brand, never SifterSearch ("… — SifterSearch Media" → "… — Anís"). */
export const anisTitle = (s) => String(s ?? '').replace(/\s+—\s+SifterSearch(\s+Media)?\s*$/, ' — Anís').replace(/SifterSearch Media|SifterSearch/g, 'Anís');

const attr = (s) => s.replace(/&amp;/g, '&');
const unattr = (s) => s.replace(/&/g, '&amp;');
/**
 * A page rendered on the Anís host → its links and absolute URLs re-pointed: <a href> through anisHref (a siftersearch-only
 * link loses its href and keeps its text), other src/href/action attributes the same way, and absolute siftersearch.com URLs
 * in text (JSON-LD, og:image, island props) to the Anís origin. → { html, dropped } (the dropped links, for tests and logs).
 */
export function anisHtml(html) {
  const dropped = [];
  let out = String(html).replace(/(<a\b[^>]*?)\shref="([^"]*)"/g, (m, pre, v) => {
    const to = anisHref(attr(v));
    if (to === null) { dropped.push(attr(v)); return pre; }
    return `${pre} href="${unattr(to)}"`;
  });
  out = out.replace(/(<(?!a\b)[a-z][\w-]*\b[^>]*?)\s(href|src|action)="([^"]*)"/g, (m, pre, a, v) => {
    const to = anisHref(attr(v));
    return to === null ? m : `${pre} ${a}="${unattr(to)}"`;
  });
  // absolute URLs anywhere else (JSON-LD, meta content, island props), plain or URL-encoded (share links); one with no Anís
  // page → the Anís app, as the link policy does for HTML (anisText)
  out = out.replace(/https?:\/\/(?:www\.)?siftersearch\.com(\/[^\s"'<>&\\]*)?/g, (m, p = '/') => anisHref(`https://siftersearch.com${p}`) ?? `${ANIS_ORIGIN}/`);
  out = out.replace(/https?%3A%2F%2F(?:www\.)?siftersearch\.com((?:%2F|%3F|%23)[^\s"'<>&]*)?/gi, (m, p = '') => {
    let path; try { path = decodeURIComponent(p) || '/'; } catch { return m; }
    return encodeURIComponent(anisHref(`https://siftersearch.com${path}`) ?? `${ANIS_ORIGIN}/`);
  });
  out = out.replace(/SifterSearch Media/g, 'Anís');   // the brand in JSON-LD and island props
  return { html: out, dropped };
}

/** An Astro response rendered for the Anís host → the same, re-pointed: a redirect's Location through anisHref, a page through anisHtml. */
export async function anisResponse(res) {
  const headers = new Headers(res.headers);
  const loc = headers.get('location');
  if (loc && res.status >= 300 && res.status < 400) {
    headers.set('location', anisHref(loc) ?? loc);
    return new Response(null, { status: res.status, headers });
  }
  if (!/text\/html/.test(headers.get('content-type') || '')) return res;
  const { html } = anisHtml(await res.text());
  headers.delete('content-length');
  return new Response(html, { status: res.status, headers });
}
