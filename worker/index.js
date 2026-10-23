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
import { workRoute } from './ops/workplan.js';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { mailRoute, mailCron } from './mail/index.js';
import { deweyEmail } from './mail/dewey.js';
import { mediaFile, MEDIA_FILE } from './media.js';
import { version as BUILD_VERSION } from '../package.json';
import { als, installFetchCache, policyFor, cacheKey, serveCached, apiProducer, API_ORIGIN } from './edge-cache.js';

// SSR's own fetches to the API share the edge cache (worker/edge-cache.js), so a render never waits on the tunnel for
// data the edge already holds.
installFetchCache();

// Pre-warm (after deploy: /_edge/warm; cron every minute fills cold keys, every 10th minute refreshes stale ones) so a
// visitor practically never meets a never-cached page. Talks: the first N of the media index.
const WARM_API = ['/api/media/index', '/api/media/progress', '/api/media/progress/live', '/api/speakers', '/api/v1/pages', '/api/library/landing', '/api/library/shelves'];
const WARM_PAGES = ['/', '/media', '/library', '/biography', '/docs', '/dialogue', '/research', '/about'];
const WARM_TALKS = 24;

// x-sifter-origin-test: down | slow=<ms> — simulate an unreachable / slow tower for THIS request (internal key only).
const originTest = (request, env) => {
  const t = request.headers.get('x-sifter-origin-test');
  return t && env.S1_KEY && request.headers.get('x-internal-key') === env.S1_KEY ? t : null;
};
// the headers the cache policy sees: the internal key is a credential, except when it only authorises the test switch
const policyHeaders = (request, test) => {
  if (!test) return request.headers;
  const h = new Headers(request.headers); h.delete('x-internal-key'); return h;
};
const withState = (res, state) => { const out = new Response(res.body, res); out.headers.set('x-sifter-cache', state); return out; };

// Path prefixes owned by the backend API; everything else is the Astro app.
const isApiPath = (p) => p.startsWith('/api/') || p.startsWith('/widget') || p === '/health';

// LIVE OPERATIONAL STATE — never served from the edge cache. These endpoints exist to say what is true
// RIGHT NOW; a cached answer is not a stale convenience, it is a wrong answer that looks authoritative.
// Admin is operational by definition; progress/status/monitor/health report live pipeline state.
const isLiveState = (p) => p.startsWith('/api/admin/')
  || /\/(progress|status|monitor|health)$/.test(p);

// System-1 at the edge (Chad 10-05: Clef / Clef-flash, Jev-API compatible, vision-capable). Server-to-server only: the
// caller must present the internal key (Worker secret S1_KEY). The body is passed to the model as is — {state, questions}
// and any image input — so vision tasks need no change here. Never cached (POST).
const S1_MODELS = new Set(['clef', 'clef-flash']);
async function systemOneRun(request, env) {
  if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const { model, ...input } = body || {};
  if (!S1_MODELS.has(model)) return Response.json({ error: `model must be one of ${[...S1_MODELS].join(', ')}` }, { status: 400 });
  const t0 = Date.now();
  try {
    const out = await env.AI.run(`@cf/cloudflare/${model}`, input);
    return Response.json({ model, ms: Date.now() - t0, answers: out?.answers ?? out, usage: out?.usage ?? null });
  } catch (err) {
    return Response.json({ error: String(err?.message || err).slice(0, 300), model, ms: Date.now() - t0 }, { status: 502 });
  }
}

export function createExports(manifest) {
  const app = new App(manifest);

  // A fresh, cookie-less SSR render of a public page; taint is read once its whole body has streamed.
  const htmlProducer = (url, env, ctx) => async () => {
    const st = { env, ctx, tainted: false, test: als.getStore()?.test || null };
    const req = new Request(url.href, { headers: { accept: 'text/html', 'user-agent': 'siftersearch-edge-render' } });
    const res = await als.run(st, () => handle(manifest, app, req, env, ctx));
    return { res, tainted: () => st.tainted };
  };

  async function warm(env, ctx, { refreshStale = false } = {}) {
    return als.run({ env, ctx, tainted: false, test: null }, async () => {
      const out = [];
      const one = async (path) => {
        const u = new URL('https://siftersearch.com' + path);
        const policy = policyFor(u, 'GET', new Headers());
        if (policy.mode !== 'cache') return;
        const t0 = Date.now();
        try {
          const r = await serveCached({ key: cacheKey(u, policy.kind, BUILD_VERSION), policy, env, ctx, warm: true, fillOnly: !refreshStale,
            produce: policy.kind === 'html' ? htmlProducer(u, env, ctx) : apiProducer(u.pathname + u.search) });
          out.push({ path, state: r.state, ...(r.why ? { why: r.why } : {}), ms: Date.now() - t0 });
        } catch (err) { out.push({ path, state: 'ERROR', why: String(err?.message || err).slice(0, 120) }); }
      };
      for (const p of WARM_API) await one(p);
      let talks = [];
      try { const d = await (await fetch(API_ORIGIN + '/api/media/index')).json(); talks = (d.items || []).map((i) => i?.s).filter(Boolean).slice(0, WARM_TALKS); } catch { /* pages only */ }
      const queue = [...WARM_PAGES, ...talks.map((s) => `/media/${s}`), ...talks.map((s) => `/api/media/${s}`)];
      await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
      return out;
    });
  }

  return {
    default: {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/_edge/warm') {
          if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const t0 = Date.now();
          const report = await warm(env, ctx, { refreshStale: url.searchParams.has('stale') });
          return Response.json({ version: BUILD_VERSION, ms: Date.now() - t0, report });
        }
        if (url.pathname === '/_s1/run' && request.method === 'POST') return systemOneRun(request, env);
        if (url.pathname.startsWith('/_mail/')) return (await mailRoute(request, env)) ?? new Response('not found', { status: 404 });
        // a contributor's item page from Dewey's receipts (signed link, rendered on tower; never cached)
        if (request.method === 'GET' && /^\/dewey\/item\/\d+$/.test(url.pathname)) return fetch(`${API_ORIGIN}/api/v1/dewey-mail/item/${url.pathname.split('/').pop()}${url.search}`, { headers: { accept: 'text/html' } });
        if (url.pathname.startsWith('/_work/')) return workRoute(request, env);
        // media files: R2 at the edge (worker/media.js); falls through to the plain proxy when not cacheable
        if (MEDIA_FILE.test(url.pathname)) { const r = await mediaFile(request, env, ctx, API_ORIGIN); if (r) return r; }
        // public pages + public API reads: edge stale-while-revalidate (worker/edge-cache.js) — any cached copy answers at once
        const test = originTest(request, env);
        const policy = policyFor(url, request.method, policyHeaders(request, test));
        const st = { env, ctx, tainted: false, test };
        if (policy.mode === 'cache') {
          return als.run(st, () => serveCached({ key: cacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx,
            produce: policy.kind === 'html' ? htmlProducer(url, env, ctx) : apiProducer(url.pathname + url.search) }));
        }
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
            const out = withState(res, 'BYPASS');
            out.headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
            out.headers.delete('expires');
            out.headers.set('pragma', 'no-cache');
            return out;
          }
          if (request.method === 'GET' && !isLiveState(url.pathname)) {
            // The EDGE keeps public API responses for their s-maxage; the BROWSER keeps none. The zone's Browser Cache TTL
            // rewrites max-age to 14400 on whatever leaves here, so the home-page Observatory read a 2.6-hour-old
            // telemetry snapshot for every refresh (2026-10-17) while the API served a fresh one. Edge hits are ~ms anyway.
            const toBrowser = (r, state = 'BYPASS') => { const out = withState(r, state); out.headers.set('cache-control', 'no-store, max-age=0'); out.headers.delete('expires'); return out; };
            const cache = caches.default;
            const hit = await cache.match(request);
            if (hit) return toBrowser(hit, 'HIT');
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
            return toBrowser(res);
          }
          // Same-zone subrequest: cannot recurse into this worker, streams SSE bodies straight through.
          return fetch(target, request);
        }
        const res = await als.run(st, () => handle(manifest, app, request, env, ctx));
        return request.method === 'GET' && (res.headers.get('content-type') || '').includes('text/html') ? withState(res, 'BYPASS') : res;
      },
      // Cloudflare Email Routing (siftersearch.com → this Worker): dewey@ is Dewey's mailbox; any other address is refused.
      async email(message, env, ctx) {
        await deweyEmail(message, env, ctx);
      },
      // Cron triggers (wrangler.jsonc): Anís's mail — drafting, outreach, daily digest; the edge-cache warmer every minute.
      async scheduled(event, env, ctx) {
        ctx.waitUntil(mailCron(event.cron, env));
        if (event.cron === '* * * * *') {
          const minute = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
          ctx.waitUntil(warm(env, ctx, { refreshStale: minute % 10 === 0 }).catch(() => {}));
        }
      },
    },
  };
}
