// Covers (api/lib/covers.js). Public: GET /api/covers/:docId/original — the stored original, fetched by the image Worker
// (worker/img/) once per version and kept in R2; renderings are never made here. Internal: POST /api/covers/:docId —
// store a new original (copied, never hot-linked) and point the doc at it; the content-hash URL busts every cache.
import { readOriginal, storeCover, CONTENT_TYPES } from '../lib/covers.js';
import { requireInternal } from '../lib/auth.js';

// The only hosts the server fetches a cover from (no SSRF): Chad's Bindery cover sets. Anything else is sent as `image`.
export const COVER_FETCH_HOSTS = new Set(['bindery.lnker.com']);

export default async function coverRoutes(fastify, opts = {}) {
  const setDocCover = opts.setDocCover || (async (id, url) => (await import('../lib/docs-repo.js')).setDocCover(id, url));
  const fetchImage = opts.fetchImage || (async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw Object.assign(new Error(`fetch ${url} → HTTP ${res.status}`), { statusCode: 502 });
    return Buffer.from(await res.arrayBuffer());
  });

  fastify.get('/:docId/original', async (req, reply) => {
    const id = Number(req.params.docId);
    const orig = Number.isInteger(id) && id > 0 ? await readOriginal(id) : null;
    if (!orig?.format) {
      reply.header('Cache-Control', 'public, max-age=300, s-maxage=300');   // a cover may be added later
      return reply.code(404).send({ error: 'NotFound' });
    }
    reply.header('Content-Type', CONTENT_TYPES[orig.format]);
    reply.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return reply.send(orig.bytes);
  });

  /** POST /api/covers/:docId { url | image (base64), source, rights } → { docId, url, version, format, changed }. */
  fastify.post('/:docId', { preHandler: requireInternal, bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const id = Number(req.params.docId);
    const { url, image, source, rights } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'bad docId' });
    if (!source) return reply.code(400).send({ error: 'source is required (provenance is stored with every cover)' });
    if (!url === !image) return reply.code(400).send({ error: 'give exactly one of url or image' });
    let bytes;
    if (image) bytes = Buffer.from(String(image), 'base64');
    else {
      let host = null;
      try { const u = new URL(url); host = u.protocol === 'https:' ? u.hostname : null; } catch { /* bad URL */ }
      if (!host || !COVER_FETCH_HOSTS.has(host)) return reply.code(400).send({ error: `not an allowed cover host: ${host || url}` });
      bytes = await fetchImage(url);
    }
    let stored;
    try { stored = await storeCover(id, bytes, { source, rights: rights || null, url: url || null }); } catch (e) { return reply.code(400).send({ error: e.message }); }
    const r = await setDocCover(id, stored.url);
    if (!r?.changed) return reply.code(404).send({ error: `doc ${id} not found or deleted`, ...stored });
    return { docId: id, ...stored, changed: r.changed };
  });
}
