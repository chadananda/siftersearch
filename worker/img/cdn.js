// The image service (Chad 10-10: "imgkit style parameter request caching"): GET /img/<bucket>/<id>?v=<hash>&tr=<ImageKit>
// Lookup order: edge cache → durable R2 variant (generated once) → R2 original → tower (the ONE origin fetch per
// original version, then kept in R2 so tower never serves it again) → Photon render. Adapted from blogworks.ai
// packages/blogworks-image/src/cdn.ts; the origin is tower's /api/<bucket>/<id>/original instead of an R2 source bucket.
import { PhotonImage } from '@cf-wasm/photon';
import { parseTransforms, resolveFormat, defaultSpec } from './transform.js';
import { resolveFocalPoint } from './focal.js';
import { renderImage, CONTENT_TYPE } from './render.js';

const VERSION = 2;                                  // bump to invalidate every cached derivative (2: lossy webp)
const BUCKETS = new Set(['covers']);                // image families served (originals on tower: api/lib/covers.js)
const PATH = /^\/img\/([a-z]+)\/(\d+)$/;

export async function handleImage(req, env, ctx) {
  const url = new URL(req.url);
  const m = PATH.exec(url.pathname);
  if (!m || !BUCKETS.has(m[1])) return new Response('not found', { status: 404 });
  const [, bucket, id] = m;
  const v = (url.searchParams.get('v') || '').replace(/[^0-9a-f]/g, '').slice(0, 32);   // content hash of the original
  const tr = url.searchParams.get('tr') ?? '';
  const specs = parseTransforms(tr);
  const spec = specs[specs.length - 1] ?? defaultSpec();
  const format = resolveFormat(spec, req.headers.get('accept'));
  const recipe = `${tr}|${format}`;
  const maxAge = v ? 31536000 : 86400;               // unversioned URLs may change; versioned ones never do

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/img/${bucket}/${id}?v=${v}&r=${encodeURIComponent(recipe)}&cv=${VERSION}`, { method: 'GET' });
  const edge = await cache.match(cacheKey);
  if (edge) return tag(edge, 'edge');

  const r2Key = `fx/v${VERSION}/${bucket}/${id}/${v || 'latest'}/${hash(recipe)}.${format}`;
  const r2hit = v ? await env.IMG_R2?.get(r2Key) : null;
  if (r2hit) {
    const res = image(await r2hit.arrayBuffer(), format, maxAge);
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return tag(res, 'r2');
  }

  const src = await original(env, ctx, bucket, id, v);
  if (!src) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

  let focal = { fx: 0.5, fy: 0.5 };
  if (spec.focus === 'auto' || spec.focus === 'face') {
    const { w, h } = probeSize(src);
    focal = await resolveFocalPoint(spec.focus, src, env.AI, w, h);
  }
  let out;
  try {
    out = await renderImage(src, { spec, format, focal });
  } catch {
    return image(src, format, 300);                  // never serve broken: the untransformed original, briefly cached
  }
  if (v && env.IMG_R2) ctx.waitUntil(env.IMG_R2.put(r2Key, out, { httpMetadata: { contentType: CONTENT_TYPE[format] } }));
  const res = image(out, format, maxAge);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return tag(res, 'miss');
}

/** Original bytes: R2 first; else tower once (then stored in R2 under its version). */
async function original(env, ctx, bucket, id, v) {
  const key = `orig/${bucket}/${id}/${v || 'latest'}`;
  const hit = v ? await env.IMG_R2?.get(key) : null;
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(`${env.API_ORIGIN}/api/${bucket}/${id}/original`);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (v && env.IMG_R2) ctx.waitUntil(env.IMG_R2.put(key, bytes));
  return bytes;
}

function probeSize(bytes) {
  try {
    const img = PhotonImage.new_from_byteslice(bytes);
    const w = img.get_width(), h = img.get_height();
    img.free();
    return { w, h };
  } catch {
    return { w: 1, h: 1 };
  }
}

const image = (body, format, maxAge) => new Response(body, {
  headers: { 'Content-Type': CONTENT_TYPE[format], 'Cache-Control': `public, max-age=${maxAge}${maxAge > 86400 ? ', immutable' : ''}`, Vary: 'Accept' },
});

function tag(res, src) {
  const r = new Response(res.body, res);
  r.headers.set('x-img-cache', src);
  return r;
}

// FNV-1a: small stable hash of the recipe for the R2 key.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
