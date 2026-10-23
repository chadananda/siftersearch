// Edge stale-while-revalidate cache (Chad 10-22: "pages should never ever wait"). Public SSR pages + public API reads are
// served from L1 caches.default (per colo) or L2 KV EDGE_CACHE (global) the moment ANY copy exists, however stale; a stale
// copy is revalidated in the background (ctx.waitUntil). Only a never-cached key waits on the tunnel — and the warmer
// (cron + /_edge/warm after deploy) keeps those rare. Never stored: non-200, Set-Cookie (except the anonymous sifter_sid
// mint, stripped), private/no-store, truncated HTML (no </html>), or HTML whose render saw a failed data fetch ("tainted").
// Origins are always fetched WITHOUT the visitor's cookies, so a personalised response can never be produced into the cache.
// SSR's own fetches to the API go through the same cache (installFetchCache). Policy is pure; tests/api/edge-cache.test.js.
import { AsyncLocalStorage } from 'node:async_hooks';

export const API_ORIGIN = 'https://api.siftersearch.com';
const DAY = 86400;
const KV_MIN_GAP_MS = 120_000;     // at most one KV write per key per 2 min (KV is the cross-colo fallback, not the hot path)
const API_NS = 'a1';               // bump to orphan every cached API entry (format change)

// Public API reads: [path pattern, fresh seconds, l2 (KV)]. Public by declaration: none of these read auth or cookies.
const API_ROUTES = [
  [/^\/api\/media\/index$/, 60, true],
  [/^\/api\/media\/progress$/, 15, true],
  [/^\/api\/media\/progress\/live$/, 10, true],
  [/^\/api\/media$/, 60, false],                        // listing / search (high-cardinality query: L1 only)
  [/^\/api\/media\/(moments|intro-clips)$/, 300, false],
  [/^\/api\/media\/moments\/[^/]+$/, 300, true],
  [/^\/api\/media\/heard$/, 300, false],
  [/^\/api\/media\/(?!admin$|shorts$|progress$|index$)[^/]+$/, 120, true],   // a talk
  [/^\/api\/speakers$/, 300, true],
  [/^\/api\/library\/landing$/, 30, true],          // the /library landing's live numbers + new arrivals
  [/^\/api\/library\/sitemap(\/[a-z0-9-]+)?$/, 3600, true],   // the library sitemap's data (reports snapshot, 3 h)
  [/^\/api\/library\/(tree|nodes|shelves|shelves\/items|documents|letters)$/, 300, false],
  [/^\/api\/library\/(nodes|documents)\/[^/]+$/, 300, false],
  [/^\/api\/library\/by-slug\/[^/]+(\/[^/]+)?$/, 300, false],
  [/^\/api\/library\/by-path\/[^/]+\/[^/]+\/[^/]+$/, 300, false],   // the reader's pages (SSR first view + load-more); auth is header-only
  [/^\/api\/documents\/\d+\/about$/, 300, false],               // the reader's "About this tablet" box
  [/^\/api\/v1\/people$/, 900, true],
  [/^\/api\/v1\/people\/[^/]+$/, 900, true],
  [/^\/api\/v1\/entities\/[^/]+$/, 900, false],
  [/^\/api\/v1\/pages(\/[^/]+)?$/, 300, true],
  [/^\/api\/search\/stats$/, 300, true],
  [/^\/api\/v1\/dialogs(\/[^/]+)?$/, 300, false],
  [/^\/api\/v1\/deep-research(\/slug\/[^/]+)?$/, 300, false],
];

// Public SSR pages (none reads cookies; only /admin's middleware does). Fresh = the page's own s-maxage, else 60 s.
const HTML_PAGES = /^\/(|media(\/.*)?|library(\/.*)?|biography(\/.*)?|docs(\/.*)?|who-was-at\/.+|dialogue(\/.*)?|research(\/.*)?|document\/.+|m\/.+|about|changelog|privacy|terms|contact|contribute|dewey|sourcehunt)\/?$/;
// The library sitemap (index + parts): SSR endpoints rendering XML, cached like pages but validated as a whole sitemap.
const XML_PAGES = /^\/sitemap-library(-[a-z0-9-]+)?\.xml$/;
const HTML_NEVER = /^\/(admin|profile|settings|referrals|print|community\/(new|post)|support\/success)(\/|$)/;
const TRACKING = /^(utm_.*|fbclid|gclid|msclkid|mc_cid|mc_eid|ref)$/;

/** Request headers that mean "this is a specific caller": never served from, or stored into, the shared cache. */
export const isCredentialed = (headers) => !!(headers.get('authorization') || headers.get('x-api-key') || headers.get('x-internal-key'));

/**
 * The cache policy for a request: { mode: 'bypass' } or { mode: 'cache', kind: 'html'|'api', fresh, stale, l2 }.
 * Cookies are deliberately NOT consulted: cached routes are public, and their origin fetches never carry cookies.
 */
export function policyFor(url, method, headers) {
  const p = url.pathname;
  if (method !== 'GET') return { mode: 'bypass', why: 'method' };
  if (isCredentialed(headers)) return { mode: 'bypass', why: 'credentials' };
  if (url.searchParams.has('nocache')) return { mode: 'bypass', why: 'nocache' };
  if (p.startsWith('/api/')) {
    if (p.startsWith('/api/auth/') || p.startsWith('/api/admin/') || p.includes('/admin/') || /^\/api\/(v1\/)?chat/.test(p)) return { mode: 'bypass', why: 'private-route' };
    const r = API_ROUTES.find(([re]) => re.test(p));
    return r ? { mode: 'cache', kind: 'api', fresh: r[1], stale: 2 * DAY, l2: r[2] } : { mode: 'bypass', why: 'not-listed' };
  }
  if (p.startsWith('/_') || p.startsWith('/widget') || p === '/health') return { mode: 'bypass', why: 'internal' };
  if (XML_PAGES.test(p)) return { mode: 'cache', kind: 'xml', fresh: 3600, stale: 7 * DAY, l2: true };
  if (HTML_NEVER.test(p) || !HTML_PAGES.test(p)) return { mode: 'bypass', why: 'not-listed' };
  return { mode: 'cache', kind: 'html', fresh: 60, stale: 7 * DAY, l2: true };
}

/** The cache key: namespace (HTML carries the build version, so new code never serves old HTML) + path + sorted query. */
export function cacheKey(url, kind, version) {
  const q = [...url.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const qs = q.length ? '?' + new URLSearchParams(q).toString() : '';
  const ns = kind === 'api' ? API_NS : `${kind === 'html' ? 'h' : kind}-${version}`;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
  return `/__edge/${ns}${path}${qs}`;
}

/** A complete HTML document: the last thing in it is </html>. A truncated stream never is. */
export const isCompleteHtml = (text) => /<\/html>\s*$/i.test(text || '');

/** s-maxage of a Cache-Control header, or null. */
export const sMaxAge = (cc) => { const m = /s-maxage=(\d+)/.exec(cc || ''); return m ? Number(m[1]) : null; };

/**
 * May this origin/SSR response be stored? Returns { ok, why, stripCookie }. `text` is the full body; `tainted` = the
 * render saw a failed (5xx / network / timeout) data fetch.
 */
export function storable({ status, headers, text, kind, tainted = false }) {
  if (status !== 200) return { ok: false, why: `status ${status}` };
  const cc = (headers.get('cache-control') || '').toLowerCase();
  if (/\bprivate\b/.test(cc) || (kind === 'html' && /no-store/.test(cc))) return { ok: false, why: 'cache-control' };
  const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  const onlySession = cookies.every((c) => /^\s*sifter_sid=/.test(c));
  if (cookies.length && (kind === 'html' || !onlySession)) return { ok: false, why: 'set-cookie' };
  const ct = headers.get('content-type') || '';
  if (kind === 'html') {
    if (!ct.includes('text/html')) return { ok: false, why: 'content-type' };
    if (tainted) return { ok: false, why: 'tainted render' };
    if (!isCompleteHtml(text)) return { ok: false, why: 'truncated' };
  } else if (kind === 'xml') {
    if (!ct.includes('xml')) return { ok: false, why: 'content-type' };
    if (tainted) return { ok: false, why: 'tainted render' };
    // a whole sitemap with at least one entry: an empty <urlset> is exactly the failure that must never be pinned here
    if (!/<\/(urlset|sitemapindex)>\s*$/.test(text || '')) return { ok: false, why: 'truncated' };
    if (!/<loc>/.test(text || '')) return { ok: false, why: 'empty sitemap' };
  } else {
    if (!ct.includes('json')) return { ok: false, why: 'content-type' };
    try { JSON.parse(text); } catch { return { ok: false, why: 'truncated json' }; }
  }
  return { ok: true, stripCookie: cookies.length > 0 };
}

/** HIT (fresh) / STALE (serve now, revalidate) for an entry stored at `stored` ms with `fresh` seconds. */
export const freshness = (stored, fresh, now = Date.now()) => ((now - stored) / 1000 < fresh ? 'HIT' : 'STALE');

// ── runtime ────────────────────────────────────────────────────────────────────────────────────────────────────────
export const als = new AsyncLocalStorage();      // per request: { env, ctx, tainted, test }
export const originFetch = globalThis.fetch.bind(globalThis);
const inflight = new Map();

/** Origin fetch honouring the internal test switch (x-sifter-origin-test: down | slow=<ms>, only with the internal key). */
export async function viaOrigin(input, init) {
  const t = als.getStore()?.test;
  if (t === 'down') throw new Error('origin unreachable (x-sifter-origin-test)');
  const slow = /^slow=(\d+)$/.exec(t || '');
  if (slow) await new Promise((r) => setTimeout(r, Math.min(Number(slow[1]), 25_000)));
  return originFetch(input, init);
}

const l1Url = (key) => `https://siftersearch.com${key}`;

async function lookup(key, env, ctx) {
  const cache = caches.default;
  const hit = await cache.match(l1Url(key));
  if (hit) return { body: await hit.arrayBuffer(), ct: hit.headers.get('content-type'), stored: Number(hit.headers.get('x-sifter-stored')) || 0,
    fresh: Number(hit.headers.get('x-sifter-fresh')) || 0, kvAt: Number(hit.headers.get('x-sifter-kv')) || 0, from: 'l1' };
  if (!env?.EDGE_CACHE) return null;
  const kv = await env.EDGE_CACHE.getWithMetadata(key, 'arrayBuffer').catch(() => null);
  if (!kv?.value) return null;
  const m = kv.metadata || {};
  const e = { body: kv.value, ct: m.ct, stored: m.stored || 0, fresh: m.fresh || 0, kvAt: m.stored || 0, from: 'kv' };
  ctx?.waitUntil?.(putL1(key, e, 7 * DAY).catch(() => {}));
  return e;
}

function putL1(key, e, stale) {
  return caches.default.put(l1Url(key), new Response(e.body, { headers: {
    'content-type': e.ct || 'application/octet-stream', 'cache-control': `public, max-age=${stale}`,
    'x-sifter-stored': String(e.stored), 'x-sifter-fresh': String(e.fresh || 0), 'x-sifter-kv': String(e.kvAt || 0),
  } }));
}

/** Drop a key from both layers (L1 caches.default, L2 KV). */
export async function evict(key, env) {
  await caches.default.delete(l1Url(key)).catch(() => {});
  if (env?.EDGE_CACHE) await env.EDGE_CACHE.delete(key).catch(() => {});
}

async function store(key, policy, e, prev, env) {
  const kvDue = policy.l2 && env?.EDGE_CACHE && (!prev || Date.now() - (prev.kvAt || 0) > KV_MIN_GAP_MS);
  if (kvDue) {
    await env.EDGE_CACHE.put(key, e.body, { expirationTtl: policy.stale, metadata: { ct: e.ct, stored: e.stored, fresh: e.fresh } }).catch(() => {});
    e.kvAt = e.stored;
  } else e.kvAt = prev?.kvAt || 0;
  await putL1(key, e, policy.stale);
}

// produce() reports taint as a boolean or, for a streamed SSR render, a function read once the whole body is in
const isTainted = (t) => (typeof t === 'function' ? !!t() : !!t);
// the stored entry; an HTML page's own s-maxage (docs 300 s, biographies 900 s) sets its fresh window
const entryOf = (res, text, policy) => ({ body: new TextEncoder().encode(text), ct: res.headers.get('content-type'), stored: Date.now(),
  fresh: (policy.kind === 'html' && sMaxAge(res.headers.get('cache-control'))) || policy.fresh });

/** Produce fresh, validate, store. Resolves to { stored, why, res?, text? }. */
async function refresh(key, policy, produce, prev, env) {
  const { res, tainted } = await produce();
  const text = await res.text();
  const verdict = storable({ status: res.status, headers: res.headers, text, kind: policy.kind, tainted: isTainted(tainted) });
  if (verdict.ok) await store(key, policy, entryOf(res, text, policy), prev, env);
  // GONE at the origin (a talk taken out of the library, 10-23): the stale copy must not answer for ever
  else if (res.status === 404 || res.status === 410) await evict(key, env);
  return { stored: verdict.ok, why: verdict.why, res, text };
}

function revalidateOnce(key, policy, produce, prev, env) {
  if (inflight.has(key)) return inflight.get(key);
  const p = refresh(key, policy, produce, prev, env).catch((err) => ({ stored: false, why: String(err?.message || err) })).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function respond(body, { ct, status = 200, state, age, kind, extra }) {
  const h = new Headers(extra || {});
  if (ct) h.set('content-type', ct);
  h.set('x-sifter-cache', state);
  if (age != null) h.set('age', String(Math.max(0, Math.round(age))));
  // the BROWSER keeps nothing (zone Browser Cache TTL rewrites max-age; edge hits are ms anyway — see index.js)
  h.set('cache-control', 'no-store, max-age=0');
  for (const k of ['expires', 'set-cookie', 'content-length', 'content-encoding', 'etag', 'last-modified']) h.delete(k);
  if (kind === 'html') h.set('x-sifter-render', 'edge');
  return new Response(body, { status, headers: h });
}

/**
 * Serve `request` under `policy` with stale-while-revalidate. `produce()` → { res, tainted } fetches/renders FRESH
 * (cookie-less). Any cached copy answers at once; a cold key waits for produce() and stores it in the background.
 */
export async function serveCached({ key, policy, produce, env, ctx, warm = false, fillOnly = false }) {
  const prev = await lookup(key, env, ctx).catch(() => null);
  if (prev && warm && fillOnly) return { state: 'PRESENT' };
  if (prev) {
    const state = freshness(prev.stored, prev.fresh || policy.fresh);
    if (state === 'STALE') {
      const job = revalidateOnce(key, policy, produce, prev, env);
      if (warm) return { state: 'REFRESHED', ...(await job) };
      ctx.waitUntil(job);
    } else if (warm) return { state: 'FRESH' };
    return respond(prev.body, { ct: prev.ct, state, age: (Date.now() - prev.stored) / 1000, kind: policy.kind });
  }
  if (warm) return { state: 'FILLED', ...(await revalidateOnce(key, policy, produce, null, env)) };
  const { res, tainted } = await produce();
  if (res.status !== 200 || !res.body) return respond(res.body, { ct: res.headers.get('content-type'), status: res.status, state: 'MISS', kind: policy.kind, extra: res.headers });
  const [toClient, toStore] = res.body.tee();
  ctx.waitUntil((async () => {
    const text = await new Response(toStore).text();
    const verdict = storable({ status: res.status, headers: res.headers, text, kind: policy.kind, tainted: isTainted(tainted) });
    if (verdict.ok) await store(key, policy, entryOf(res, text, policy), null, env);
  })().catch(() => {}));
  return respond(toClient, { ct: res.headers.get('content-type'), state: 'MISS', kind: policy.kind, extra: res.headers });
}

/** Fresh API data for a cached route: cookie-less GET to the origin (the anonymous session mint is stripped on store). */
export function apiProducer(path) {
  return async () => {
    try {
      const res = await viaOrigin(API_ORIGIN + path, { headers: { accept: 'application/json' } });
      return { res, tainted: res.status >= 500 };
    } catch (err) {
      return { res: Response.json({ error: 'origin unreachable', detail: String(err?.message || err).slice(0, 200) }, { status: 504 }), tainted: true };
    }
  };
}

/**
 * Route SSR's own fetches to the API through the same edge cache: inside a request (als store present), a GET to the
 * API origin on a cached route without credentials is answered by serveCached; any other API fetch passes through but
 * marks the render TAINTED when it fails (5xx / network), so that render is never stored. Install once per isolate.
 */
export function installFetchCache() {
  if (globalThis.__sifterFetchCache) return;
  globalThis.__sifterFetchCache = true;
  globalThis.fetch = async function edgeFetch(input, init) {
    const st = als.getStore();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!st || !url || !url.startsWith(API_ORIGIN + '/')) return originFetch(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const u = new URL(url);
    const policy = headers.get('cookie') ? { mode: 'bypass' } : policyFor(u, method, headers);
    if (policy.mode === 'cache') {
      const key = cacheKey(u, 'api');
      const res = await serveCached({ key, policy, produce: apiProducer(u.pathname + u.search), env: st.env, ctx: st.ctx });
      if (res.status >= 500) st.tainted = true;
      return res;
    }
    try {
      const res = await viaOrigin(input, init);
      if (res.status >= 500) st.tainted = true;
      return res;
    } catch (err) { st.tainted = true; throw err; }
  };
}
