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
import { deweyUploadRoute } from './dewey-upload.js';
import { mediaFile, warmMedia, ensureMedia, MEDIA_FILE } from './media.js';
import { shortLink, shortHost, SHORT_PATH, SHORT_HOST } from './short-links.js';
import { anisAppRoute, sitemapXml } from './anis-app.js';
import { DISCUSSION_PATH } from './anis/share.js';
import { DISCUSS_PATH, DISCUSS_API, DIALOGUE_PATH, discussUrl, discussResponse, discussTurns, discussSitemapUrls } from './anis/discuss.js';
import { DOC_PATH, docResponse, docSitemapUrls } from './anis/doc-pages.js';
import { BIO_PATH, BIOGRAPHY_PATH, bioResponse, bioSitemapUrls } from './anis/people.js';
import { MEDIA_PATH, mediaSitemapUrls } from './anis/talks.js';
import { astroPath, anisResponse, ANIS_ORIGIN } from '../src/lib/anis-host.js';
import { d1Dump, d1Edit } from './d1-dump.js';
import { version as BUILD_VERSION } from '../package.json';
import { als, evict, installFetchCache, policyFor, cacheKey, anisCacheKey, serveCached, apiProducer, edgeStoredCc, API_ORIGIN } from './edge-cache.js';

// SSR's own fetches to the API share the edge cache (worker/edge-cache.js), so a render never waits on the tunnel for
// data the edge already holds.
installFetchCache();

// Pre-warm (after deploy: /_edge/warm; cron every minute fills cold keys, every 10th minute refreshes stale ones) so a
// visitor practically never meets a never-cached page. Talks: the first N of the media index.
const WARM_API = ['/api/media/index', '/api/media/progress', '/api/media/progress/live', '/api/speakers', '/api/v1/pages', '/api/library/landing', '/api/library/shelves'];
const WARM_PAGES = ['/', '/library', '/docs', '/research', '/about', '/sitemap-library.xml'];
const WARM_TALKS = 24;
const WARM_ANIS = ['/media'];   // siftersearch's designed pages on the Anís host (its own cache keys)

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
  // The same designed page rendered for the Anís host (src/lib/anis-host.js): the Astro route at anis.oceanlibrary.com (the
  // pages read the host as their flag), then its links and URLs re-pointed there.
  const anisProducer = (url, route, env, ctx) => async () => {
    const st = { env, ctx, tainted: false, test: als.getStore()?.test || null };
    const req = new Request(new URL(route + url.search, ANIS_ORIGIN).href, { headers: { accept: 'text/html', 'user-agent': 'siftersearch-edge-render' } });
    const res = await als.run(st, () => handle(manifest, app, req, env, ctx));
    return { res: await anisResponse(res), tainted: () => st.tainted };
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
            produce: policy.kind === 'api' ? apiProducer(u.pathname + u.search) : htmlProducer(u, env, ctx) });
          out.push({ path, state: r.state, ...(r.why ? { why: r.why } : {}), ms: Date.now() - t0 });
        } catch (err) { out.push({ path, state: 'ERROR', why: String(err?.message || err).slice(0, 120) }); }
      };
      for (const p of WARM_API) await one(p);
      for (const p of WARM_ANIS) {   // the Anís host's designed pages
        const u = new URL(ANIS_ORIGIN + p), policy = policyFor(u, 'GET', new Headers()), t0 = Date.now();
        try {
          const r = await serveCached({ key: anisCacheKey(u, policy.kind, BUILD_VERSION), policy, env, ctx, warm: true, fillOnly: !refreshStale, produce: anisProducer(u, astroPath(p), env, ctx) });
          out.push({ path: ANIS_ORIGIN + p, state: r.state, ...(r.why ? { why: r.why } : {}), ms: Date.now() - t0 });
        } catch (err) { out.push({ path: ANIS_ORIGIN + p, state: 'ERROR', why: String(err?.message || err).slice(0, 120) }); }
      }
      let talks = [];
      try { const d = await (await fetch(API_ORIGIN + '/api/media/index')).json(); talks = (d.items || []).map((i) => i?.s).filter(Boolean).slice(0, WARM_TALKS); } catch { /* pages only */ }
      const queue = [...WARM_PAGES, ...talks.map((s) => `/api/media/${s}`)];
      await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
      return out;
    });
  }

  return {
    default: {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.hostname === SHORT_HOST) {   // anis.oceanlibrary.com: Anís as an installable app at the root (worker/anis-app.js)
          // siftersearch's designed pages, rendered for this host (src/lib/anis-host.js ASTRO_SECTIONS: /media/**); keys in the Anís namespace
          const ap = ['GET', 'HEAD'].includes(request.method) && astroPath(url.pathname);
          if (ap) {
            const test = originTest(request, env), st = { env, ctx, tainted: false, test };
            const policy = policyFor(url, request.method, policyHeaders(request, test));
            const produce = anisProducer(url, ap, env, ctx);
            return als.run(st, () => (policy.mode === 'cache' ? serveCached({ key: anisCacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx, produce }) : produce().then((r) => r.res)));
          }
          // published discussions (worker/anis/discuss.js): /discuss + /discuss/<slug>, edge-cached like the site's pages
          const dm = ['GET', 'HEAD'].includes(request.method) && DISCUSS_PATH.exec(url.pathname);
          if (dm) {
            const test = originTest(request, env), st = { env, ctx, tainted: false, test };
            const policy = policyFor(url, request.method, policyHeaders(request, test));
            const produce = () => discussResponse(dm[1], { api: API_ORIGIN });
            return als.run(st, () => (policy.mode === 'cache' ? serveCached({ key: cacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx, produce }) : produce().then((r) => r.res)));
          }
          // unique library texts (worker/anis/doc-pages.js): /doc, /doc/books|tablets[/<n>], /doc/<slug>, edge-cached the same way
          const xm = ['GET', 'HEAD'].includes(request.method) && DOC_PATH.exec(url.pathname);
          if (xm) {
            const test = originTest(request, env), st = { env, ctx, tainted: false, test };
            const policy = policyFor(url, request.method, policyHeaders(request, test));
            const produce = () => docResponse(xm, { api: API_ORIGIN });
            return als.run(st, () => (policy.mode === 'cache' ? serveCached({ key: cacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx, produce }) : produce().then((r) => r.res)));
          }
          // biographies (worker/anis/people.js): /bio[/<slug>]; keys in the Anís namespace
          const bm = ['GET', 'HEAD'].includes(request.method) && BIO_PATH.exec(url.pathname);
          if (bm) {
            const test = originTest(request, env), st = { env, ctx, tainted: false, test };
            const policy = policyFor(url, request.method, policyHeaders(request, test));
            const produce = () => bioResponse(bm[1] || '', { api: API_ORIGIN });
            return als.run(st, () => (policy.mode === 'cache' ? serveCached({ key: anisCacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx, produce }) : produce().then((r) => r.res)));
          }
          if (url.pathname === '/anis-sitemap.xml' && request.method === 'GET') {   // the app root + every published discussion, /doc text, biography and talk
            const urls = await als.run({ env, ctx, tainted: false, test: null }, async () => (await Promise.all([discussSitemapUrls, docSitemapUrls, bioSitemapUrls, mediaSitemapUrls].map((f) => f({ api: API_ORIGIN })))).flat());
            return new Response(sitemapXml(urls), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
          }
          const a = await anisAppRoute(url, env);
          if (a instanceof Response) return a;
          if (url.pathname.startsWith('/img/') && env.IMG) return env.IMG.fetch(request);   // covers/portraits: the image Worker (service binding), same as siftersearch.com/img/*
          if (a && request.method === 'GET') return handle(manifest, app, new Request(new URL(a, url), request), env, ctx);
          // a shared discussion's public page, rendered by the Anís Worker (worker/anis/share.js); hyphenated slugs, never a short-link code
          if (env.ANIS && ['GET', 'HEAD'].includes(request.method) && DISCUSSION_PATH.test(url.pathname)) return env.ANIS.fetch(request);
        }
        { const s = shortHost(request, { base: env.DOCS_PUBLIC_URL || undefined, pass: isApiPath }); if (s) return s; }   // anis.oceanlibrary.com: short links, the widget + API
        // the discussions and /doc texts live on the Anís host (canonical there); this site's /discuss and /doc are only doors to them
        if (DISCUSS_PATH.test(url.pathname) || DOC_PATH.test(url.pathname)) return Response.redirect(`https://${SHORT_HOST}${url.pathname}${url.search}`, 301);
        // biographies and talks too (Chad 11-14: the Anís URLs are canonical); /media's speakers, sets, clips and admin pages stay here
        { const m = BIOGRAPHY_PATH.exec(url.pathname); if (m) return Response.redirect(`https://${SHORT_HOST}/bio${m[1] ? `/${m[1]}` : ''}${url.search}`, 301); }
        { const m = MEDIA_PATH.exec(url.pathname); if (m && !/^(remaster|speakers|sets)$/.test(m[1] || '')) return Response.redirect(`https://${SHORT_HOST}${url.pathname}${url.search}`, 301); }
        { const m = DIALOGUE_PATH.exec(url.pathname); if (m) return Response.redirect(`${discussUrl(m[1])}${url.search}`, 301); }   // the old /dialogue pages (kept in the repo, never served)
        // the chat's "Continue this conversation" from a published discussion (?discuss=<slug>): its turns
        { const m = request.method === 'GET' && DISCUSS_API.exec(url.pathname); if (m) return als.run({ env, ctx, tainted: false, test: null }, () => discussTurns(m[1], { api: API_ORIGIN })); }
        if (url.pathname === '/_edge/warm') {
          if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const t0 = Date.now();
          const report = await warm(env, ctx, { refreshStale: url.searchParams.has('stale') });
          return Response.json({ version: BUILD_VERSION, ms: Date.now() - t0, report });
        }
        if (url.pathname === '/_edge/purge' && request.method === 'POST') {   // a talk's page + API entry (tower: api/lib/media/edge-purge.js)
          if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
          // ?slug= a talk; ?doc= a /docs page (scripts/anis/publish-docs.mjs) — its page, its API row and the docs nav list
          const doc = url.searchParams.get('doc'), slug = doc || url.searchParams.get('slug') || '';
          if (!/^[a-z0-9][a-z0-9-]{0,160}$/.test(slug)) return Response.json({ error: 'bad slug' }, { status: 400 });
          const at = (p, kind) => cacheKey(new URL(`https://siftersearch.com${p}`), kind, BUILD_VERSION);
          const keys = doc ? [at(`/docs/${slug}`, 'html'), at(`/api/v1/pages/${slug}`, 'api'), at('/api/v1/pages', 'api')]
            : [at(`/media/${slug}`, 'html'), at(`/api/media/${slug}`, 'api'), anisCacheKey(new URL(`https://${SHORT_HOST}/media/${slug}`), 'html', BUILD_VERSION)];
          await Promise.all(keys.map((k) => evict(k, env)));
          return Response.json({ purged: keys });
        }
        if (url.pathname === '/_media/warm' && request.method === 'POST') return warmMedia(url, env, API_ORIGIN);   // idempotent one-time tower → R2 copy (worker/media.js)
        if (url.pathname === '/_media/ensure' && request.method === 'POST') {   // internal: fill this file now (parallel multipart) and say if present
          if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
          return ensureMedia(url, env, API_ORIGIN);
        }
        if (url.pathname === '/_s1/run' && request.method === 'POST') return systemOneRun(request, env);
        if (url.pathname === '/_d1/dump' && request.method === 'POST') return d1Dump(request, env);   // tower's copy of D1 (worker/d1-dump.js)
        if (url.pathname === '/_d1/edit' && request.method === 'POST') return d1Edit(request, env);   // admin edits, edge first
        { const up = await deweyUploadRoute(request, env); if (up) return up; }   // Dewey's browser-direct R2 multipart uploads (worker/dewey-upload.js)
        if (url.pathname.startsWith('/_mail/')) return (await mailRoute(request, env)) ?? new Response('not found', { status: 404 });
        // a contributor's item page from Dewey's receipts (signed link, rendered on tower; never cached)
        if (/^\/dewey\/job\/\d+(\/decide)?$/.test(url.pathname) && ['GET', 'POST'].includes(request.method)) {   // Dewey's job page + its decide buttons (signed links, Chad 10-28)
          const path = url.pathname.replace('/dewey/job/', '/api/v1/dewey-mail/job/');
          return fetch(`${API_ORIGIN}${path}${url.search}`, request.method === 'POST' ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: await request.text() } : { headers: { accept: 'text/html' } });
        }
        if (request.method === 'GET' && /^\/dewey\/item\/\d+$/.test(url.pathname)) return fetch(`${API_ORIGIN}/api/v1/dewey-mail/item/${url.pathname.split('/').pop()}${url.search}`, { headers: { accept: 'text/html' } });
        if (url.pathname.startsWith('/_work/')) return workRoute(request, env);
        { const m = request.method === 'GET' && SHORT_PATH.exec(url.pathname); if (m) return shortLink(m[1], { base: env.DOCS_PUBLIC_URL || undefined }); }   // a PDF's permanent short link (worker/short-links.js)
        // Anís at the edge (worker/anis, service binding ANIS): chat turns go there only while the ANIS_EDGE secret is '1' —
        // flip with `wrangler secret put ANIS_EDGE` (no build); delete it → tower again
        if (env.ANIS_EDGE === '1' && env.ANIS && url.pathname === '/api/chat/stream' && request.method === 'POST') return env.ANIS.fetch(request);
        // a reader's thumbs on a reply are stored at the edge (anis_feedback) whichever engine answered
        if (env.ANIS && url.pathname === '/api/chat/feedback' && request.method === 'POST') return env.ANIS.fetch(request);
        // the reader's own indications bio (worker/anis/bio.js): see or erase it
        if (env.ANIS && url.pathname === '/api/chat/bio' && ['GET', 'DELETE', 'OPTIONS'].includes(request.method)) return env.ANIS.fetch(request);
        // shared discussions live at the edge (anis_shared): preview, publish, read, unpublish — every method, preflight included
        if (env.ANIS && (url.pathname === '/api/chat/share' || url.pathname.startsWith('/api/chat/share/'))) return env.ANIS.fetch(request);
        // voice (worker/anis/voice.js): dictation/conversation transcripts and read-aloud audio come from the edge whichever engine answers
        if (env.ANIS && (url.pathname === '/api/chat/transcribe' || url.pathname === '/api/chat/speak') && ['POST', 'OPTIONS'].includes(request.method)) return env.ANIS.fetch(request);
        // media files: R2 at the edge (worker/media.js); falls through to the plain proxy when not cacheable
        if (MEDIA_FILE.test(url.pathname)) { const r = await mediaFile(request, env, ctx, API_ORIGIN); if (r) return r; }
        // public pages + public API reads: edge stale-while-revalidate (worker/edge-cache.js) — any cached copy answers at once
        const test = originTest(request, env);
        const policy = policyFor(url, request.method, policyHeaders(request, test));
        const st = { env, ctx, tainted: false, test };
        if (policy.mode === 'cache') {
          return als.run(st, () => serveCached({ key: cacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx,
            produce: policy.kind === 'api' ? apiProducer(url.pathname + url.search) : htmlProducer(url, env, ctx) }));   // html + xml render in Astro
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
            // A content-addressed asset (origin says immutable, e.g. /widget/sifter-chat.js?v=<hash>) keeps its header: the
            // browser holds it across visits (Chad 10-23, repeat loads re-fetched it every time). Everything else: no-store.
            const toBrowser = (r, state = 'BYPASS') => {
              const out = withState(r, state);
              if (!/\bimmutable\b/.test(r.headers.get('cache-control') || '')) { out.headers.set('cache-control', 'no-store, max-age=0'); out.headers.delete('expires'); }
              return out;
            };
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
              const stored = new Response(res.clone().body, res);
              stored.headers.set('cache-control', edgeStoredCc(cc));   // immutable assets keep theirs (edge HIT → browser keeps it)
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
