// Media files at the edge (planning/media-library-plan.md §5): /api/media/<slug>/file/<name>?v=<version> is served from R2
// (MEDIA_BUCKET, key "<slug>/<name>@<v>") with HTTP Range; a miss is proxied to the tower origin (which supports Range
// too) while the WHOLE file is copied into R2 in the background, so each version crosses the tunnel once. Only versioned
// (immutable) URLs and shorts' content-keyed files are kept; clips and unversioned files are plain pass-through. Pure helpers exported for tests.

export const MEDIA_FILE = /^\/api\/media\/([a-z0-9][a-z0-9-]{0,99})\/file\/(.+)$/;

export const isWebAudio = (path) => /^\/api\/media\/[a-z0-9][a-z0-9-]*\/file\/web\/[^/]+\.(ogg|m4a)$/.test(path);

/** The R2 key for a request URL, or null when it must not be cached (no ?v, or a path we do not serve from R2). */
export function mediaKey(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const m = MEDIA_FILE.exec(u.pathname);
  if (!m || m[2].includes('..')) return null;
  // a SHORT's files are named by a content key (talk version × range × format × template × render version): immutable
  // without ?v (10-22: the first byte of a short took ~4 s through the tunnel)
  if (/^shorts\/[0-9a-f]{12}\.(mp4|srt|vtt|json)$/.test(m[2])) return `${m[1]}/${m[2]}@s`;
  const v = u.searchParams.get('v');
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  return `${m[1]}/${decodeURIComponent(m[2])}@${v}`;
}

/** Response headers for an R2 object (+ Content-Range for a ranged read). Pure. */
export function r2Headers(obj, ranged) {
  const h = new Headers();
  if (obj.httpMetadata?.contentType) h.set('content-type', obj.httpMetadata.contentType);
  // the standalone page runs its own inline player; nothing else (same CSP as the origin sends)
  if (/text\/html/.test(obj.httpMetadata?.contentType || '')) h.set('content-security-policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self'");
  h.set('cache-control', 'public, max-age=31536000, immutable');
  h.set('accept-ranges', 'bytes');
  if (obj.httpEtag) h.set('etag', obj.httpEtag);
  if (ranged && obj.range) {
    const off = obj.range.offset ?? (obj.range.suffix != null ? obj.size - obj.range.suffix : 0);
    const len = obj.range.length ?? (obj.size - off);
    h.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`);
    h.set('content-length', String(len));
  } else h.set('content-length', String(obj.size));
  return h;
}

/** → a Response, or null when the edge has nothing to add (no bucket, not cacheable) and the plain proxy should run. */
export async function mediaFile(request, env, ctx, origin) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const key = env.MEDIA_BUCKET ? mediaKey(url) : null;
  if (!key) return null;
  const range = request.headers.get('range');
  const obj = await env.MEDIA_BUCKET.get(key, range ? { range: request.headers } : undefined).catch(() => null);
  if (obj) return new Response(request.method === 'HEAD' ? null : obj.body, { status: range && obj.range ? 206 : 200, headers: r2Headers(obj, !!range) });
  // WEB AUDIO is never streamed from the tower (Chad 10-24: cloudflare is the listener-facing layer): a miss answers 202 +
  // Retry-After; the page's warm call (POST /_media/warm) makes the one-time copy into R2
  if (isWebAudio(url.pathname)) return new Response(JSON.stringify({ preparing: true }), { status: 202, headers: { 'content-type': 'application/json', 'retry-after': '4', 'cache-control': 'no-store', 'x-sifter-audio': 'preparing' } });
  // miss: answer from the origin (Range passed through), and fill R2 with the whole file in the background
  const target = origin + url.pathname + url.search;
  const res = await fetch(target, { headers: range ? { range } : {} });
  if (res.ok) {
    const copy = range ? null : res.clone();   // taken before the body is handed to the reader
    ctx.waitUntil((async () => {
      const src = copy || await fetch(target);
      if (!src.ok || !src.headers.get('content-length')) return;
      await env.MEDIA_BUCKET.put(key, src.body, { httpMetadata: { contentType: src.headers.get('content-type') || 'application/octet-stream' } });
    })().catch(() => {}));
  }
  const out = new Response(res.body, res);
  out.headers.set('cache-control', res.ok ? 'public, max-age=31536000, immutable' : 'no-store');
  return out;
}

const WEB_NAME = (slug) => new RegExp(`^web/${slug}\\.(original\\.)?(ogg|m4a)$`);

/**
 * POST /_media/warm?slug=&v=&fmt=ogg|m4a&copy=main|original|both — idempotent one-time copy of a talk's web audio from the
 * tower into R2 (the only time the tower serves these bytes). Missing objects only; a KV lock per object (10 min) keeps
 * concurrent page loads to ONE fill; files are copied one after another. → { files: { name: 'present'|'filled'|'busy'|'failed' } }
 */
export async function warmMedia(url, env, origin) {
  const slug = url.searchParams.get('slug') || '', v = url.searchParams.get('v') || '', fmt = url.searchParams.get('fmt') === 'm4a' ? 'm4a' : 'ogg', copy = url.searchParams.get('copy') || 'both';
  if (!env.MEDIA_BUCKET || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug) || !/^\d{1,6}$/.test(v)) return Response.json({ error: 'bad request' }, { status: 400 });
  const names = [copy !== 'original' && `web/${slug}.${fmt}`, copy !== 'main' && `web/${slug}.original.${fmt}`].filter(Boolean);
  const files = {};
  for (const name of names) {
    const key = mediaKey(new URL(`https://x/api/media/${slug}/file/${name}?v=${v}`));
    if (!key || !WEB_NAME(slug).test(name)) { files[name] = 'failed'; continue; }
    if (await env.MEDIA_BUCKET.head(key)) { files[name] = 'present'; continue; }
    const lock = `fill:${key}`;
    if (env.EDGE_CACHE && await env.EDGE_CACHE.get(lock)) { files[name] = 'busy'; continue; }
    if (env.EDGE_CACHE) await env.EDGE_CACHE.put(lock, String(Date.now()), { expirationTtl: 600 });
    try {
      const res = await fetch(`${origin}/api/media/${slug}/file/${name}?v=${v}`, { headers: env.S1_KEY ? { 'x-internal-key': env.S1_KEY } : {} });
      const len = Number(res.headers.get('content-length'));
      if (!res.ok || !len) { files[name] = 'failed'; continue; }
      const fl = new FixedLengthStream(len);
      const piping = res.body.pipeTo(fl.writable);
      await env.MEDIA_BUCKET.put(key, fl.readable, { httpMetadata: { contentType: res.headers.get('content-type') || 'application/octet-stream' } });
      await piping;
      files[name] = 'filled';
    } catch { files[name] = 'failed'; } finally { if (env.EDGE_CACHE) await env.EDGE_CACHE.delete(lock).catch(() => {}); }
  }
  return Response.json({ files }, { headers: { 'cache-control': 'no-store' } });
}
