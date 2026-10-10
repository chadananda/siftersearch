// Public: GET /api/covers/:docId/original — the stored cover original (api/lib/covers.js). Fetched by the image Worker
// (worker/img/) once per version and kept in R2; renderings are never made here.
import { readOriginal, CONTENT_TYPES } from '../lib/covers.js';

export default async function coverRoutes(fastify) {
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
}
