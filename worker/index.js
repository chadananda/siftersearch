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

// LIVE OPERATIONAL STATE — never served from the edge cache. These endpoints exist to say what is true
// RIGHT NOW; a cached answer is not a stale convenience, it is a wrong answer that looks authoritative.
// Admin is operational by definition; progress/status/monitor/health report live pipeline state.
const isLiveState = (p) => p.startsWith('/api/admin/')
  || /\/(progress|status|monitor|health)$/.test(p);

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
          // LIVE STATE: force no-store on the way OUT. The origin says max-age=30, but a zone-level
          // Browser Cache TTL rewrites it to max-age=14400 — so the BROWSER held /api/v1/people/progress
          // for four hours and the request never left the tab. Three identical responses 400ms apart with a
          // frozen `age: 29` is what that looks like. Skipping the edge cache is not enough when the client
          // is the thing caching; the response has to say, explicitly, do not keep this (2026-08-14).
          if (request.method === 'GET' && isLiveState(url.pathname)) {
            const res = await fetch(target, request);
            const out = new Response(res.body, res);
            out.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
            out.headers.delete('expires');
            out.headers.set('pragma', 'no-cache');
            return out;
          }
          if (request.method === 'GET' && !isLiveState(url.pathname)) {
            const cache = caches.default;
            const hit = await cache.match(request);
            if (hit) return hit;
            const res = await fetch(target, request);
            const cc = res.headers.get('cache-control') || '';
            if (res.ok && cc.includes('public') && /s-maxage=[1-9]/.test(cc) && !cc.includes('no-store')) {
              // Store with the ORIGIN's s-maxage as the ceiling. A zone-level cache rule was rewriting
              // browser TTL to max-age=14400, so a route the origin declared fresh for 60s was served from
              // this cache for FOUR HOURS — /biography showed 645/893 long after the API returned 881/893,
              // and every fix looked like it had failed (2026-08-14). Pinning it here means no dashboard
              // setting can silently outlive the origin's own declaration.
              const ttl = Number((cc.match(/s-maxage=(\d+)/) || [])[1] || 60);
              const stored = new Response(res.clone().body, res);
              stored.headers.set('cache-control', `public, max-age=${ttl}, s-maxage=${ttl}`);
              ctx.waitUntil(cache.put(request, stored));
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
