// ImageKit URL helper. Images live in R2 cdn-assets/siftersearch.com/...
// and are served via the ImageKit CDN endpoint shared with sister projects.
// Frontmatter / source code keeps relative paths like "/images/dialog/foo.jpg";
// this helper rewrites them to the CDN URL with transforms.

const IMAGEKIT_BASE = 'https://ik.imagekit.io/1260';
const IK_PREFIX = 'siftersearch.com';

// Map a local /images/... path to the CDN path. /images/dialog/foo-hero.jpg
// → siftersearch.com/dialog/foo-hero.jpg (which lives in R2 cdn-assets/).
function toCdnPath(local) {
  if (!local) return null;
  if (local.startsWith('http://') || local.startsWith('https://')) return null;
  // Strip leading slash and the "images/" segment
  return `${IK_PREFIX}/${local.replace(/^\/+/, '').replace(/^images\//, '')}`;
}

export function ikUrl(local, { width, height, format, quality } = {}) {
  const path = toCdnPath(local);
  if (!path) return local;  // pass through external URLs / nullish
  const tr = ['f-auto'];
  if (width) tr.push(`w-${width}`);
  if (height) tr.push(`h-${height}`);
  if (format) tr[0] = `f-${format}`;  // override f-auto
  if (quality) tr.push(`q-${quality}`);
  return `${IMAGEKIT_BASE}/tr:${tr.join(',')}/${path}`;
}

// Hero image — wide, optimized for top-of-article display
export function heroUrl(local) {
  return ikUrl(local, { width: 1600 });
}

// Card image — small, for listing thumbnails
export function cardUrl(local) {
  return ikUrl(local, { width: 640 });
}

// Avatar — tiny, for round-by-round Jafar bubble
export function avatarUrl(local) {
  return ikUrl(local, { width: 96 });
}
