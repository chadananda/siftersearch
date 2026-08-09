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
      // Same-zone subrequest: cannot recurse into this worker, hits the API
      // zone's edge cache per origin Cache-Control, and streams SSE bodies.
      return fetch(API_ORIGIN + url.pathname + url.search, request);
    }
    return astro.fetch(request, env, ctx);
  },
};
