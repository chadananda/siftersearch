// Single-origin edge worker: Astro SSR + static assets, with /api/*, /widget*, /health fronted on the same
// origin and proxied to the tower-nas tunnel (api.siftersearch.com). Browsers only see siftersearch.com — no
// CORS, one OAuth origin. This proxy is the cloud-migration seam: any backend route can be reimplemented
// here (KV/D1/R2) without changing a single client.
//
// This is the adapter's OFFICIAL custom entry point (astro.config → cloudflare({ workerEntryPoint })), which
// hands us the manifest and lets us delegate to its own handler. The previous shape — a standalone worker
// importing `../dist/_worker.js/index.js` — imported the build's own OUTPUT, so @astrojs/cloudflare v14
// (which, unlike v12, bundles wrangler's `main` during `astro build`) could not resolve it and the Astro 7
// upgrade dead-ended there. A lazy import does NOT fix that: it only appears to when a stale dist is on disk.
// Delegating through createExports keeps asset serving, env/session bindings and clientAddress exactly as the
// adapter intends, on both v12 and v14.
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';

const API_ORIGIN = 'https://api.siftersearch.com';

// Path prefixes owned by the backend API; everything else is the Astro app.
const isApiPath = (p) => p.startsWith('/api/') || p.startsWith('/widget') || p === '/health';

export function createExports(manifest) {
  const app = new App(manifest);
  return {
    default: {
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
        return handle(manifest, app, request, env, ctx);
      },
    },
  };
}
