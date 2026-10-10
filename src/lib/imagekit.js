// Image URLs for every page (Chad 10-10: "all images on a site should always load through a caching request resize
// service … properly scaled and sharpened webp … srcset so mobile sizes are loaded correctly the first time").
// The service is OURS: worker/img/ at siftersearch.com/img/… — ImageKit `tr=` syntax, rendered once, cached at the edge
// + R2, WebP by default. Never put a raw R2 / CDN URL in an <img>: pass it through imgSet / svcFixed / ikUrl.

const SVC = 'https://siftersearch.com/img';
// Public R2 hosts and the old ImageKit path → the service path that reads the same object in place.
const R2_HOSTS = [
  [/^https:\/\/pub-e57ab96621a24ba18bcce728b4c51de2\.r2\.dev\//, `${SVC}/a/`],   // bucket `siftersearch`
  [/^https:\/\/pub-4445d977d3954d72bea3bad656a3fd43\.r2\.dev\//, `${SVC}/cdn/`], // bucket `cdn-assets`
  [/^https:\/\/ik\.imagekit\.io\/1260\/cdn\//, `${SVC}/cdn/`],                    // ImageKit's origin was cdn-assets
];
const KEY_PREFIX = 'siftersearch.com';   // site images in cdn-assets live under this prefix

/** Any of our image URLs (public R2, old ImageKit, a cdn-assets-relative path, or an /img/ URL) → the service URL
 *  without a transform. Unknown hosts come back unchanged (null when not transformable). */
export function toSvc(url) {
  if (!url) return null;
  if (url.startsWith('/img/')) return `https://siftersearch.com${url}`;
  if (url.startsWith(`${SVC}/`)) return url;
  for (const [re, base] of R2_HOSTS) if (re.test(url)) return url.replace(re, base);
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return null;
  return `${SVC}/cdn/${KEY_PREFIX}/${url.replace(/^\/+/, '').replace(/^images\//, '')}`;   // site-relative asset key
}

export const svcUrl = (url, tr) => (url ? `${url}${url.includes('?') ? '&' : '?'}tr=${tr}` : null);
const trOf = (w, { ratio = null, h = null, q = 78, fo = 'auto', sharpen = true, dpr = null } = {}) =>
  [`w-${w}`, h ? `h-${h}` : ratio ? `h-${Math.round(w / ratio)}` : null, fo ? `fo-${fo}` : null, `q-${q}`,
    dpr ? `dpr-${dpr}` : null, sharpen ? 'e-sharpen' : null].filter(Boolean).join(',');

/**
 * Responsive image: { src, srcset } for an image that scales with the layout. `widths` are the rendered pixel widths to
 * offer (include 2× of the largest CSS width); pair with a `sizes` attribute. Falls back to { src: url, srcset: null }
 * for a URL the service cannot read (a third party), so callers can always spread the result.
 */
export function imgSet(url, widths, opts = {}) {
  const base = toSvc(url);
  if (!base) return { src: url, srcset: null };
  const mid = widths[Math.min(widths.length - 1, Math.floor(widths.length / 2))];
  return { src: svcUrl(base, trOf(mid, opts)), srcset: widths.map((w) => `${svcUrl(base, trOf(w, opts))} ${w}w`).join(', ') };
}

/** src + 1x/2x srcset for a fixed box, e.g. a cover shown at 120×180 CSS px. */
export function svcFixed(url, w, h, { q = 78, extra = 'e-sharpen' } = {}) {
  const base = toSvc(url);
  if (!base) return url ? { src: url, srcset: null } : null;
  const tr = (d) => `w-${w},h-${h},dpr-${d},q-${q}${extra ? `,${extra}` : ''}`;
  return { src: svcUrl(base, tr(1)), srcset: `${svcUrl(base, tr(1))} 1x, ${svcUrl(base, tr(2))} 2x` };
}

// Legacy names (were ImageKit) — same signatures, now our service.
export function ikUrl(local, tr) {
  const base = toSvc(local);
  return base ? svcUrl(base, tr ? `${tr},e-sharpen` : 'e-sharpen') : local;
}
export const heroUrl = (local) => ikUrl(local, 'w-1536,h-600,fo-auto,q-80');
export const cardUrl = (local) => ikUrl(local, 'w-640,h-400,fo-auto,q-75');
export const avatarUrl = (local) => ikUrl(local, 'w-128,h-128,fo-auto');
export function ikSrcset(local, widths, { ratio = null, q = 75, fo = 'auto' } = {}) {
  const r = imgSet(local, widths, { ratio, q, fo });
  return r.srcset ? r : null;
}
// Hero band (~2.56:1) and card (~1.6:1) presets.
export const heroSet = (local) => ikSrcset(local, [640, 960, 1280, 1536, 1920], { ratio: 2.56, q: 80 });
export const cardSet = (local) => ikSrcset(local, [320, 480, 640, 960], { ratio: 1.6, q: 75 });
