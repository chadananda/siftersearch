// Single-origin edge worker: Astro SSR + static assets, with /api/*, /widget*, /health
// fronted on the same origin and proxied to the tower-nas tunnel (api.siftersearch.com).
// Browsers only see siftersearch.com — no CORS, one OAuth origin. This proxy is the
// cloud-migration seam: any backend route can be reimplemented here (KV/D1/R2)
// without changing a single client. Deps: dist/_worker.js (astro build output).
import astro from '../dist/_worker.js/index.js';

const API_ORIGIN = 'https://api.siftersearch.com';

// Path prefixes owned by the backend API; everything else is the Astro app.
const isApiPath = (p) => p.startsWith('/api/') || p.startsWith('/widget') || p === '/health';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      const target = API_ORIGIN + url.pathname + url.search;
      // Cloudflare doesn't cache /api/* JSON by default even with s-maxage — opt in here.
      // Only GETs whose response EXPLICITLY sets a public s-maxage are cached (those routes
      // are public-data by declaration; everything else stays a pure streaming pass-through).
      if (request.method === 'GET') {
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(target, request);
        const cc = res.headers.get('cache-control') || '';
        if (res.ok && cc.includes('public') && /s-maxage=[1-9]/.test(cc) && !cc.includes('no-store')) {
          ctx.waitUntil(cache.put(request, res.clone()));
        }
        return res;
      }
      // Same-zone subrequest: cannot recurse into this worker, streams SSE bodies straight through.
      return fetch(target, request);
    }
    return astro.fetch(request, env, ctx);
  },
};
