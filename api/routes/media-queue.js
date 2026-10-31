// Tower's LAN media queue over HTTP — the same paths and keys as the edge /_q Worker (worker/queue/index.js), so a queue agent switches
// transport by MEDIA_QUEUE_URL alone (http://tower-nas:7843/api/admin/ops/queue: the ops port directly, the gateway buffers bodies).
// Machines send x-queue-key = MEDIA_QUEUE_KEY (work ops + files); INTERNAL_API_KEY is the admin key. Files are streamed, never buffered.
import { queueCall, fileList, fileRead, fileWrite, WORK_OPS, machineKey } from '../lib/repos/media-queue-repo.js';

const who = (req) => {
  const k = req.headers['x-queue-key'];
  if (k && k === process.env.INTERNAL_API_KEY) return 'admin';
  return k && k === machineKey() ? 'machine' : null;
};
// a refusal drains the unread body first: answering mid-upload resets the connection and the client sees "fetch failed", not the status
const drain = (s) => new Promise((ok) => { if (!s || s.readableEnded) return ok(); s.on('end', ok).on('error', ok).on('close', ok).resume(); });
const fail = (reply, e) => {
  const m = String(e.message);
  return reply.code(e.status || (/lease lost/.test(m) ? 409 : /no such job|unknown op/.test(m) ? 404 : /required|without id/.test(m) ? 400 : 500)).send({ error: m });
};

export default async function mediaQueueRoutes(fastify) {
  fastify.addContentTypeParser('*', (req, payload, done) => done(null, payload));   // encapsulated: PUT bodies arrive as the raw stream
  fastify.addHook('onRequest', async (req, reply) => {
    const role = who(req), file = req.params?.kind !== undefined;
    if (!role || (role === 'machine' && !file && !WORK_OPS.has(req.params?.op))) { await drain(req.raw); return reply.code(401).send({ error: 'unauthorized' }); }
    req.queueRole = role;
  });

  fastify.post('/ops/queue/:op', async (req, reply) => {
    try {
      const r = await queueCall(req.params.op, req.body && typeof req.body === 'object' && !req.body.pipe ? req.body : {});
      return r === null ? reply.code(204).send() : r;
    } catch (e) { return fail(reply, e); }
  });
  const kinds = { files: 1, results: 1 };
  fastify.get('/ops/queue/:kind/:id/*', async (req, reply) => {
    if (!kinds[req.params.kind]) return reply.code(404).send({ error: 'not found' });
    const name = req.params['*'];
    try {
      if (!name) return await fileList(req.params.kind, req.params.id);
      const s = fileRead(req.params.kind, req.params.id, name);
      return reply.type('application/octet-stream').send(s);
    } catch (e) { return fail(reply, e); }
  });
  fastify.put('/ops/queue/:kind/:id/*', { bodyLimit: 64 * 2 ** 30 }, async (req, reply) => {
    const { kind, id } = req.params, name = req.params['*'], body = req.body?.pipe ? req.body : req.raw;
    const refuse = async (code, error) => { await drain(body); return reply.code(code).send({ error }); };
    if (!kinds[kind]) return refuse(404, 'not found');
    if (kind === 'files' && req.queueRole !== 'admin') return refuse(403, 'forbidden: staging needs the admin key');   // not 401: Node's fetch hides a 401 on a streamed body as "fetch failed"
    // queue-client's big-file probe (an empty PUT naming the real size): no size limit here, so send the body to this same url
    if (Number(req.headers['x-queue-size']) > 0 && !Number(req.headers['content-length'])) { await drain(body); return reply.code(307).header('location', req.url).send(); }
    try {
      return reply.code(201).send(await fileWrite(kind, id, name, body, { lease: req.query?.lease }));
    } catch (e) { await drain(body); return fail(reply, e); }
  });
}
