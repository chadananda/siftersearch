// The image service (Chad 10-10: "imgkit style parameter request caching"): GET /img/<bucket>/<id|key>?v=<hash>&tr=<ImageKit>
// Lookup order: edge cache → durable R2 variant (generated once) → R2 original → tower (the ONE origin fetch per
// original version, then kept in R2 so tower never serves it again) → Photon render. Adapted from blogworks.ai
// packages/blogworks-image/src/cdn.ts; the origin is tower's /api/<bucket>/<id>/original instead of an R2 source bucket.
import { PhotonImage } from '@cf-wasm/photon';
import { AwsClient } from 'aws4fetch';
import { parseTransforms, resolveFormat, defaultSpec } from './transform.js';
import { resolveFocalPoint } from './focal.js';
import { renderImage, CONTENT_TYPE } from './render.js';

const VERSION = 2;                                  // bump to invalidate every cached derivative (2: lossy webp)
// Image families. `covers` = originals on tower (api/lib/covers.js), addressed by doc id. `a` and `cdn` = originals already
// in R2 (10-10: "all images on a site should always load through a caching request resize service"), addressed by
// object key: /img/a/<key> → bucket `siftersearch` (pub-e57…r2.dev: research heroes, uploads), /img/cdn/<key> →
// bucket `cdn-assets` (pub-4445…r2.dev and the old ImageKit path ik.imagekit.io/1260/cdn/<key>).
const R2_SOURCES = { a: 'SITE_R2', cdn: 'CDN_R2' };
const PATH = /^\/img\/(?:(covers)\/(\d+)|(a|cdn)\/([A-Za-z0-9._\-/%]+))$/;

export async function handleImage(req, env, ctx) {
  const url = new URL(req.url);
  const m = PATH.exec(url.pathname);
  if (!m) return new Response('not found', { status: 404 });
  const bucket = m[1] || m[3];
  const id = m[2] || decodeURIComponent(m[4]);
  if (id.includes('..')) return new Response('not found', { status: 404 });
  const r2src = m[3] ? env[R2_SOURCES[bucket]] : null;
  if (m[3] && !r2src) return new Response('not found', { status: 404 });
  let v = (url.searchParams.get('v') || '').replace(/[^0-9a-f]/g, '').slice(0, 32);   // content hash of the original
  const tr = url.searchParams.get('tr') ?? '';
  const specs = parseTransforms(tr);
  const spec = specs[specs.length - 1] ?? defaultSpec();
  const format = resolveFormat(spec, req.headers.get('accept'));
  const recipe = `${tr}|${format}`;
  const maxAge = url.searchParams.get('v') ? 31536000 : 86400;   // a URL without ?v= may change; a versioned one never does

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/img/${bucket}/${encodeURIComponent(id)}?v=${url.searchParams.get('v') || ''}&r=${encodeURIComponent(recipe)}&cv=${VERSION}`, { method: 'GET' });
  const edge = await cache.match(cacheKey);
  if (edge) return tag(edge, 'edge');
  if (r2src && !v) {                                  // an R2 original versions itself by its etag (one HEAD per edge miss)
    const head = await r2src.head(id);
    if (!head) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
    v = String(head.etag || '').replace(/[^0-9a-f]/g, '').slice(0, 32);
  }

  const r2Key = `fx/v${VERSION}/${bucket}/${r2src ? hash(id) : id}/${v || 'latest'}/${hash(recipe)}.${format}`;
  const r2hit = v ? await env.IMG_R2?.get(r2Key) : null;
  if (r2hit) {
    const res = image(await r2hit.arrayBuffer(), format, maxAge);
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return tag(res, 'r2');
  }

  const src = r2src ? await r2Original(r2src, id) : await original(env, ctx, bucket, id, v);
  if (!src) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

  let focal = { fx: 0.5, fy: 0.5 };
  if (spec.focus === 'auto' || spec.focus === 'face') focal = await focalFor(env, ctx, spec.focus, src, `${bucket}/${r2src ? hash(id) : id}/${v || 'latest'}`);
  let out;
  try {
    out = await render(env, src, { spec, format, focal });
  } catch (e) {
    const res = image(src, format, 300);             // never serve broken: the untransformed original, briefly cached
    res.headers.set('x-img-error', String(e?.message || e).slice(0, 200));
    return res;
  }
  if (v && env.IMG_R2) ctx.waitUntil(env.IMG_R2.put(r2Key, out, { httpMetadata: { contentType: CONTENT_TYPE[format] } }));
  const res = image(out, format, maxAge);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return tag(res, 'miss');
}

/**
 * Render one variant. Cloudflare's Images binding does the pixel work OUTSIDE this Worker's 128 MB (10-10: decoding
 * full-size originals in WASM here ran out of memory whenever a page asked for many cold sizes at once — 31/84 → 503).
 * Same URL syntax, caching and R2 variants; our focal point becomes the crop gravity. Photon stays only for what the
 * binding is not given (an explicit extract rectangle) and as the fallback if the binding is missing.
 */
const FIT = { cover: 'cover', contain: 'pad', inside: 'scale-down', fill: 'squeeze' };
async function render(env, src, { spec, format, focal }) {
  if (!env.IMAGES || spec.extract) return renderImage(src, { spec, format, focal });
  const dpr = spec.dpr || 1;
  const t = {};
  if (spec.width) t.width = Math.min(4000, Math.round(spec.width * dpr));
  if (spec.height) t.height = Math.min(4000, Math.round(spec.height * dpr));
  t.fit = t.width && t.height ? (FIT[spec.fit] || 'cover') : 'scale-down';
  if (t.fit === 'cover') t.gravity = { x: focal.fx, y: focal.fy };
  if (spec.sharpen) t.sharpen = 1;
  const result = await env.IMAGES.input(new Blob([src]).stream()).transform(t)
    .output({ format: CONTENT_TYPE[format], quality: spec.quality || 82 });
  const res = result.response();
  return new Uint8Array(await res.arrayBuffer());
}

/** The focal point for one original + mode, detected ONCE (Workers AI DETR, ~1-2 s) and kept in R2 beside the variants —
 *  without this every new size of an image re-ran detection, which made first loads slow (Chad 10-10). */
async function focalFor(env, ctx, mode, src, key) {
  const k = `focal/v1/${key}/${mode}.json`;
  const hit = await env.IMG_R2?.get(k);
  if (hit) { try { return await hit.json(); } catch { /* recompute */ } }
  let w, h;
  if (env.IMAGES) { try { const i = await env.IMAGES.info(new Blob([src]).stream()); w = i.width; h = i.height; } catch { /* below */ } }
  if (!w) ({ w, h } = probeSize(src));
  const f = await resolveFocalPoint(mode, src, env.AI, w, h);
  if (env.IMG_R2) ctx.waitUntil(env.IMG_R2.put(k, JSON.stringify(f), { httpMetadata: { contentType: 'application/json' } }));
  return f;
}

/** An original that already lives in one of our R2 buckets (no copy: read in place). */
async function r2Original(bucket, key) {
  const obj = await bucket.get(key);
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
}

/** Original bytes: R2 first; else tower once (then stored in R2 under its version). Tower is read through its S3 gateway
 *  (versitygw at s3.siftersearch.com, SigV4 — the same way the R2 families are read, Chad 10-10) when the Worker has its
 *  keys; the API route /api/<bucket>/<id>/original stays as the fallback. */
async function original(env, ctx, bucket, id, v) {
  const key = `orig/${bucket}/${id}/${v || 'latest'}`;
  const hit = v ? await env.IMG_R2?.get(key) : null;
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const bytes = (await towerS3(env, bucket, id)) ?? (await towerApi(env, bucket, id));
  if (!bytes) return null;
  if (v && env.IMG_R2) ctx.waitUntil(env.IMG_R2.put(key, bytes));
  return bytes;
}

async function towerS3(env, bucket, id) {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  try {
    const aws = new AwsClient({ accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY, service: 's3', region: 'us-east-1' });
    // the original's extension varies (original.webp / .png / .jpg) — list the one key under <id>/original
    const list = await aws.fetch(`${env.S3_ENDPOINT}/${bucket}?list-type=2&max-keys=5&prefix=${encodeURIComponent(`${id}/original.`)}`);
    if (!list.ok) return null;
    const objKey = /<Key>([^<]+)<\/Key>/.exec(await list.text())?.[1];
    if (!objKey) return null;
    const res = await aws.fetch(`${env.S3_ENDPOINT}/${bucket}/${objKey.split('/').map(encodeURIComponent).join('/')}`);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch { return null; }
}
async function towerApi(env, bucket, id) {
  const res = await fetch(`${env.API_ORIGIN}/api/${bucket}/${id}/original`);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
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
