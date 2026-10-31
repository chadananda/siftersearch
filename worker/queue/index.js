// siftersearch-queue — the media job queue Worker (planning/edge-job-queue-plan.md). One Durable Object (SQLite) holds the jobs;
// every caller sends X-Queue-Key. Jobs carry a file id, never a path; files move by id (FILES below) through signed R2 urls.
// Deploy: npx wrangler deploy -c worker/queue/wrangler.jsonc. Secrets: QUEUE_KEY, ADMIN_KEY, R2_KEY_ID, R2_SECRET (wrangler secret put).
import { AwsClient } from 'aws4fetch';
import * as Q from './core.js';

const RESULTS = 'results/', STAGE = 'stage/';
const WORK_OPS = new Set(['claim', 'heartbeat', 'done', 'fail']);
const DIRECT_MAX = 90e6;   // PUT bodies up to this stream straight into R2; bigger ones (or unknown length) get a 307 to a signed url
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

async function presign(env, key, method, expires = 6 * 3600) {
  const aws = new AwsClient({ accessKeyId: env.R2_KEY_ID, secretAccessKey: env.R2_SECRET, service: 's3', region: 'auto' });
  const u = new URL(`https://${env.R2_ACCOUNT}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`);
  u.searchParams.set('X-Amz-Expires', String(expires));
  return (await aws.sign(new Request(u, { method }), { aws: { signQuery: true } })).url;
}
const safeName = (n) => /^[\w.-][\w./-]{0,200}$/.test(n) && !n.includes('..');

// fetch-style Durable Object (no cloudflare:workers import: tower's updater import-gates worker/ with its deployed copy)
export class MediaQueue {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql; ctx.blockConcurrencyWhile(async () => Q.migrate(this.sql)); }
  async fetch(req) {
    const { op, args } = await req.json();
    try { return json({ r: await this.call(op, args || {}) }); } catch (e) { return json({ error: String(e.message) }, 500); }
  }
  async alarm() { Q.expire(this.sql); await this.ctx.storage.setAlarm(Date.now() + 60_000); }
  async call(op, a) {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60_000);
    const s = this.sql, env = this.env;
    switch (op) {
      case 'enqueue': return Q.enqueue(s, a.jobs || []);
      case 'claim': return Q.claim(s, a);   // the job only (file id + invoice + stages); files are fetched by id, see FILES below
      case 'heartbeat': return Q.heartbeat(s, a);
      case 'lease-ok': return Q.heartbeat(s, a);   // a result PUT proves its lease (and keeps it alive)
      case 'done': return Q.done(s, a);
      case 'fail': return Q.fail(s, a);
      case 'list-done': {
        const jobs = Q.listDone(s, a.limit || 50, a.type, a.state);
        return Promise.all(jobs.map(async (j) => ({ ...j, result: { ...j.result, outputs: await Promise.all((j.result?.outputs || []).map(async (o) => ({ ...o, url: await presign(env, o.key, 'GET') }))) } })));
      }
      case 'ack': case 'cancel': {   // the staged inputs go too unless another job still names the same file (a reprocess queued behind it)
        const gone = op === 'ack' ? Q.ack(s, a.ids || []) : Q.cancel(s, a.ids || []);
        const keys = (await Promise.all(gone.map(async (j) => [
          ...(Q.fileInUse(s, j.file_id) ? [] : (await env.MEDIA_BUCKET.list({ prefix: `${STAGE}${j.file_id}/` })).objects.map((o) => o.key)),
          ...(await env.MEDIA_BUCKET.list({ prefix: `${RESULTS}${j.id}/` })).objects.map((o) => o.key)]))).flat();
        if (keys.length) await env.MEDIA_BUCKET.delete(keys);
        return { acked: gone.length, deleted: keys.length };
      }
      case 'capacity': return Q.capacity(s);
      case 'withdraw': return Q.withdraw(s, a.ids || []);
      case 'stats': return Q.stats(s, Date.now(), a.type);   // typed steps are pulled and counted per type
      default: throw Object.assign(new Error(`unknown op ${op}`), { status: 404 });
    }
  }
}

// FILES — addressed by id, the same paths tower serves on the LAN (only the base url differs, Chad 10-30):
//   GET {base}/files/<file_id>/          → [{ name, bytes }]
//   GET {base}/files/<file_id>/<name>    → 302 to a signed R2 url
//   PUT {base}/files/<file_id>/<name>    → tower stages an input (admin key only)
//   GET {base}/results/<job_id>/[<name>]  → the same, for a job's outputs (tower pulls this way)
//   PUT {base}/results/<job_id>/<name>?lease=<token>  → stored (≤ 90 MB) or 307 to a signed PUT; the lease must be live
// one round trip to the queue object; its error message comes back as a thrown Error
async function rpc(env, op, args) {
  const r = await env.QUEUE.get(env.QUEUE.idFromName('media')).fetch('https://q/', { method: 'POST', body: JSON.stringify({ op, args }) });
  const b = await r.json();
  if (b.error) throw new Error(b.error);
  return b.r ?? null;
}
async function files(req, env, parts, admin) {
  const [kind, id, ...rest] = parts, name = rest.join('/');
  if (!id || !/^[\w.-]{1,128}$/.test(id) || id.startsWith('.')) return json({ error: 'bad id' }, 400);
  const prefix = `${kind === 'files' ? STAGE : RESULTS}${id}/`;
  if (req.method === 'GET') {   // staged inputs by file id, results by job id — same shape
    if (!name) return json((await env.MEDIA_BUCKET.list({ prefix })).objects.map((o) => ({ name: o.key.slice(prefix.length), bytes: o.size })));
    if (!safeName(name)) return json({ error: 'bad name' }, 400);
    return Response.redirect(await presign(env, prefix + name, 'GET'), 302);
  }
  if (req.method === 'PUT') {   // tower stages inputs (admin only); a machine places results under a live lease
    if (!name || !safeName(name)) return json({ error: 'bad name' }, 400);
    if (kind === 'files' && !admin) return json({ error: 'forbidden: staging needs the admin key' }, 403);   // not 401: Node's fetch hides a 401 on a streamed body as "fetch failed"
    if (kind === 'results') await rpc(env, 'lease-ok', { id, lease: new URL(req.url).searchParams.get('lease') });
    const key = prefix + name, len = Number(req.headers.get('content-length'));
    if (len > 0 && len <= DIRECT_MAX) { const o = await env.MEDIA_BUCKET.put(key, req.body); return json({ key, bytes: o.size }, 201); }
    return new Response(null, { status: 307, headers: { location: await presign(env, key, 'PUT') } });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    const op = new URL(req.url).pathname.replace(/^\/_q\/?/, '');
    const parts = op.split('/').filter(Boolean);
    // machines hold QUEUE_KEY (work ops only); tower's ops need ADMIN_KEY (= its INTERNAL_API_KEY), which no machine ever holds
    const key = req.headers.get('x-queue-key');
    const admin = !!env.ADMIN_KEY && key === env.ADMIN_KEY;
    const isFile = parts[0] === 'files' || parts[0] === 'results';
    if (!admin && !(env.QUEUE_KEY && key === env.QUEUE_KEY && (WORK_OPS.has(op) || isFile))) return json({ error: 'unauthorized' }, 401);
    if (isFile) return files(req, env, parts, admin).catch((e) => json({ error: String(e.message) }, /lease lost/.test(e.message) ? 409 : /no such job/.test(e.message) ? 404 : 500));
    const args = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    try {
      const r = await rpc(env, op, args);
      return r === null ? new Response(null, { status: 204 }) : json(r);
    } catch (e) {
      const m = String(e.message);
      return json({ error: m }, /lease lost/.test(m) ? 409 : /no such job|unknown op/.test(m) ? 404 : /required|without id/.test(m) ? 400 : 500);
    }
  },
};
