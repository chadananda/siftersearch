// Permanent short links for Anís PDFs (Chad 11-13): GET /d/<code> → 302 to the file stored now. The map is a small JSON in R2
// (`anis/s/<code>.json` = { url }, written by api/lib/assistant/pdf/documents.js), read through the bucket's public URL and
// edge-cached 5 min, so a re-rendered PDF keeps its link. Only targets inside that bucket are followed (no open redirect).
export const SHORT_PATH = /^\/d\/([A-Za-z0-9]{6,16})$/;
export const DOCS_PUBLIC = 'https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev';

export const SHORT_HOST = 'anis.oceanlibrary.com';   // Cloudflare for SaaS custom hostname on the siftersearch.com zone

/** The short-link host serves only /d/<code>; every other path goes home to oceanlibrary.com. null = not that host. */
export function shortHost(request, opts) {
  const url = new URL(request.url);
  if (url.hostname !== SHORT_HOST) return null;
  const m = request.method === 'GET' && SHORT_PATH.exec(url.pathname);
  return m ? shortLink(m[1], opts) : Response.redirect('https://oceanlibrary.com/', 301);
}

export async function shortLink(code, { base = DOCS_PUBLIC, fetchFn = fetch } = {}) {
  const r = await fetchFn(`${base}/anis/s/${code}.json`, { cf: { cacheTtl: 300, cacheEverything: true } }).catch(() => null);
  const url = r?.ok ? (await r.json().catch(() => null))?.url : null;
  if (typeof url !== 'string' || !url.startsWith(`${base}/`)) return new Response('This link is not known.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'public, max-age=300' } });
}
