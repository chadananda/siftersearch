// CDN URL helper. Images live in R2 cdn-assets/siftersearch.com/...
// Today they are served from the bucket's public dev URL (works, no transforms).
// Once the ImageKit endpoint is rebound to cdn-assets, flip CDN_BASE to the
// imagekit URL and pass the `tr:...` segment — heroUrl/cardUrl/avatarUrl already
// pre-size by passing width hints (no-ops on the R2 URL, real on imagekit).

const R2_PUBLIC = 'https://pub-4445d977d3954d72bea3bad656a3fd43.r2.dev';
const KEY_PREFIX = 'siftersearch.com';

function toCdnPath(local) {
  if (!local) return null;
  if (local.startsWith('http://') || local.startsWith('https://')) return null;
  // /images/* paths are static files deployed to CF Pages — serve them directly
  if (local.startsWith('/images/')) return null;
  return `${KEY_PREFIX}/${local.replace(/^\/+/, '').replace(/^images\//, '')}`;
}

export function ikUrl(local /*, opts */) {
  const path = toCdnPath(local);
  if (!path) return local;
  return `${R2_PUBLIC}/${path}`;
}

export function heroUrl(local) { return ikUrl(local); }
export function cardUrl(local) { return ikUrl(local); }
export function avatarUrl(local) { return ikUrl(local); }
