// Dewey uploads, tower side (the bytes go browser → edge Worker → R2, see worker/dewey-upload.js; tower only authorises and records).
//   POST /api/dewey/upload/start  { name, size } (Dewey access) → { token, key, kind, partSize, parts }  — validates type/size/quota/rate
//   POST /api/dewey/upload/finish (internal key, from the Worker once R2 has assembled the file) → { item } 'received', then hand-off
// Heavy work never runs here: documents ≤ 100 MB are handed to the existing ingest folder (check → appraise → offer); everything else
// waits as 'received' for the media job processor / OCR worker.
import { randomBytes } from 'crypto';
import { requireDewey } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { checkStart, signToken, safeName, partSizeFor, partCount, PREFIX } from '../../worker/dewey-upload.js';
import { createItem, updateItem, receivedBytesBy, findByUploadKey } from '../lib/repos/dewey-repo.js';
import { enqueue } from '../lib/repos/ops-report-repo.js';
import { trackItem } from '../lib/dewey/jobs/track.js';

export const QUOTA_BYTES = 500 * 1024 ** 3;       // held, not yet processed, per member
export const START_LIMIT = { max: 300, windowMs: 3600_000 };   // upload starts per member per hour
export const HANDOFF_MAX = 100 * 1024 ** 2;       // documents up to this size are handed to the ingest folder; larger wait
const starts = new Map();

/** Sliding-window rate limit per member. Pure over (map, now). */
export function rateOk(userId, now = Date.now(), map = starts, { max, windowMs } = START_LIMIT) {
  const recent = (map.get(userId) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { map.set(userId, recent); return false; }
  recent.push(now); map.set(userId, recent); return true;
}

export default async function deweyUploadRoutes(fastify) {
  const secret = () => process.env.INTERNAL_API_KEY;
  fastify.post('/start', { preHandler: requireDewey }, async (request) => {
    const { name, size } = request.body || {};
    const c = checkStart({ name, size: Number(size) });
    if (!c.ok) throw ApiError.badRequest(c.error);
    const email = request.user.email, uid = request.user.sub;
    if (!rateOk(uid)) throw Object.assign(new Error('too many uploads this hour — wait a little, then continue'), { statusCode: 429 });
    if (await receivedBytesBy(email) + Number(size) > QUOTA_BYTES) throw Object.assign(new Error('you have a lot waiting for processing already — Chad will clear it, then you can send more'), { statusCode: 413 });
    const d = new Date(), key = `${PREFIX}${uid}/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(5).toString('hex')}-${safeName(name)}`;
    const token = await signToken({ k: key, u: uid, e: email, s: Number(size), n: safeName(name), t: c.kind }, secret());
    return { token, key, kind: c.kind, partSize: partSizeFor(Number(size)), parts: partCount(Number(size)) };
  });

  fastify.post('/finish', async (request, reply) => {
    if (!secret() || request.headers['x-internal-key'] !== secret()) return reply.code(401).send({ error: 'unauthorized' });
    const { key, size, name, kind, userId, email } = request.body || {};
    if (!String(key || '').startsWith(PREFIX) || !email) return reply.code(400).send({ error: 'bad request' });
    const have = await findByUploadKey(key);
    if (have) return { item: have, duplicate: true };
    if (kind === 'archive') {   // a ZIP: a registry job a worker unpacks (api/lib/dewey/jobs); no item of its own
      const { startArchive } = await import('../lib/dewey/jobs/tools.js');
      const r = await startArchive({ key, name, size, by: email });
      if (r.refused) return reply.code(429).send({ error: r.reason });
      return { job: r.job, duplicate: !r.created };
    }
    const upload = { key, size, name, kind, userId };
    const doc = kind === 'document' && size <= HANDOFF_MAX;
    const item = await createItem({ title: name, kind, identified: { file_name: name, upload }, by: email, state: 'received',
      why: doc ? 'received; Dewey will check the library and appraise it' : kind === 'document' ? 'received (large document); awaiting the conversion worker' : `received (${kind}); awaiting processing by the media worker — fingerprint and a first transcript to catch duplicates` });
    trackItem(item, { by: email, channel: 'upload' });
    if (doc) await enqueue('dewey-received', { id: item.id }, email);
    return { item };
  });
}
