// Media files at the edge (planning/media-library-plan.md §5): /api/media/<slug>/file/<name>?v=<version> is served from R2
// (MEDIA_BUCKET, key "<slug>/<name>@<v>") with HTTP Range; a miss is proxied to the tower origin (which supports Range
// too) while the WHOLE file is copied into R2 in the background, so each version crosses the tunnel once. Only versioned
// (immutable) URLs are kept; clips and unversioned files are plain pass-through. Pure helpers exported for tests.

export const MEDIA_FILE = /^\/api\/media\/([a-z0-9][a-z0-9-]{0,99})\/file\/(.+)$/;

/** The R2 key for a request URL, or null when it must not be cached (no ?v, or a path we do not serve from R2). */
export function mediaKey(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const m = MEDIA_FILE.exec(u.pathname);
  const v = u.searchParams.get('v');
  if (!m || !v || !/^\d{1,6}$/.test(v) || m[2].includes('..')) return null;
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
