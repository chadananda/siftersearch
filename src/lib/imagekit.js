// CDN URL helper. Images live in R2 cdn-assets/siftersearch.com/...
// Served via ImageKit (ik.imagekit.io/1260/cdn/) for URL-based transforms.
// heroUrl/cardUrl/avatarUrl append ?tr= params for proper sizing.

const CDN_BASE = 'https://ik.imagekit.io/1260/cdn';
const KEY_PREFIX = 'siftersearch.com';

function toCdnPath(local) {
  if (!local) return null;
  if (local.startsWith('http://') || local.startsWith('https://')) return null;
  return `${KEY_PREFIX}/${local.replace(/^\/+/, '').replace(/^images\//, '')}`;
}

export function ikUrl(local, tr) {
  const path = toCdnPath(local);
  if (!path) return local;
  return `${CDN_BASE}/${path}${tr ? `?tr=${tr}` : ''}`;
}

export function heroUrl(local)   { return ikUrl(local, 'w-1536,h-600,fo-auto,q-80'); }
export function cardUrl(local)   { return ikUrl(local, 'w-640,h-400,fo-auto,q-75'); }
export function avatarUrl(local) { return ikUrl(local, 'w-128,h-128,fo-auto'); }

// srcset builders — the house rule: full-size originals in R2, EXACT display sizes requested per
// breakpoint via ?tr=, so the browser (almost) never resizes. Returns null for absolute URLs the
// CDN can't transform (caller falls back to a plain src).
export function ikSrcset(local, widths, { ratio = null, q = 75, fo = 'auto' } = {}) {
  const path = toCdnPath(local);
  if (!path) return null;
  const tr = (w) => `w-${w}${ratio ? `,h-${Math.round(w / ratio)}` : ''},fo-${fo},q-${q}`;
  return {
    src: `${CDN_BASE}/${path}?tr=${tr(widths[Math.floor(widths.length / 2)])}`,
    srcset: widths.map((w) => `${CDN_BASE}/${path}?tr=${tr(w)} ${w}w`).join(', '),
  };
}
// Hero band (~2.56:1) and card (~1.6:1) presets matching heroUrl/cardUrl crops.
export const heroSet = (local) => ikSrcset(local, [640, 960, 1280, 1536, 1920], { ratio: 2.56, q: 80 });
export const cardSet = (local) => ikSrcset(local, [320, 480, 640, 960], { ratio: 1.6, q: 75 });
