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
