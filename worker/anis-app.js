// Anís as an installable app on anis.oceanlibrary.com (Chad 11-13): the host root is the full-page widget
// (src/pages/anis-app.astro), plus a web manifest, a root-scoped service worker and the Android TWA asset link.
// They are served here rather than from public/ because the site's own /manifest.webmanifest and /sw.js are static
// assets that would answer first on every host. Icons are static: public/anis-app/.
export const APP_PAGE = '/anis-app';
const COLOR = '#0a162a';

export const MANIFEST = {
  id: '/',
  name: 'Anís — Ocean AI Research Assistant',
  short_name: 'Anís',
  description: "Ask Anís about the world's sacred and scholarly texts — answers quoted and cited from the Ocean library.",
  lang: 'en',
  dir: 'ltr',
  start_url: '/?source=app',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  launch_handler: { client_mode: ['focus-existing', 'auto'] },   // one chat window, not a new one per launch
  prefer_related_applications: false,   // true would stop browsers offering the install
  orientation: 'any',
  background_color: COLOR,
  theme_color: COLOR,
  categories: ['books', 'education', 'reference'],
  icons: [
    { src: '/anis-app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/anis-app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/anis-app/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/anis-app/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/anis-app/monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },   // Android themed icons, notifications
  ],
};

// The app shell works offline (last copy of the page and its static files); chat, /api and /widget stay network-only so
// a reader never sees a stale answer or an old widget build.
export const SW = `const C = 'anis-app-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(['/', '/anis-app/icon-192.png']))); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== C) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\\/(api|widget|d)\\//.test(u.pathname) || u.pathname === '/widget.js') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(C).then((x) => x.put('/', c)); } return r; })
      .catch(() => caches.match('/')));
    return;
  }
  if (u.pathname.startsWith('/_astro/') || u.pathname.startsWith('/anis-app/') || u.pathname.startsWith('/fonts/'))
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(C).then((x) => x.put(e.request, c)); } return r; })));
});
`;

/** Android Trusted Web Activity: once the Play package exists, set ANIS_TWA_PACKAGE and ANIS_TWA_SHA256 (comma-separated
 *  signing-cert fingerprints) as Worker vars; until then the file is an empty list. */
export function assetLinks(env = {}) {
  const pkg = env.ANIS_TWA_PACKAGE, fps = String(env.ANIS_TWA_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean);
  return pkg && fps.length ? [{ relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fps } }] : [];
}

const ORIGIN = 'https://anis.oceanlibrary.com';
// the host's own robots and sitemap (not the main site's): the app page is the one page to index; /api and the widget are not pages
export const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /widget\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
export const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc><changefreq>weekly</changefreq></url></urlset>\n`;
// browsers and search engines ask for these at the root; the files live with the app's icons
const ROOT_ICONS = { '/favicon.ico': '/anis-app/favicon.ico', '/apple-touch-icon.png': '/anis-app/apple-touch-icon.png', '/apple-touch-icon-precomposed.png': '/anis-app/apple-touch-icon.png' };

/** On the app host: the app's own files → a Response (a Promise for a root icon, read from the static assets); the root →
 *  the page path to render; anything else → null. */
export function anisAppRoute(url, env) {
  const p = url.pathname;
  if (p === '/anis.webmanifest') return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } });
  if (p === '/anis-sw.js') return new Response(SW, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
  if (p === '/.well-known/assetlinks.json') return Response.json(assetLinks(env), { headers: { 'cache-control': 'public, max-age=3600' } });
  if (p === '/robots.txt') return new Response(ROBOTS, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  if (p === '/sitemap.xml') return new Response(SITEMAP, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  if (ROOT_ICONS[p] && env?.ASSETS) return env.ASSETS.fetch(new URL(ROOT_ICONS[p], url));
  if (p === '/' || p === APP_PAGE) return APP_PAGE;
  return null;
}
