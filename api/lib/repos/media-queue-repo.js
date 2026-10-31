// Tower's LAN media queue — the LOCAL transport (planning/worker-unify-20261030.md §2). The SAME pure core as the edge /_q Durable Object
// (worker/queue/core.js) over its own SQLite file, and files by id on disk (stage/<file_id>/, results/<job_id>/) instead of R2.
// Lives beside the media root on /tank (never /fast: NVMe wear). Every op is one IMMEDIATE transaction (several ops-service processes may share it).
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat, rm, rename, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHmac } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import * as Q from '../../../worker/queue/core.js';

export const queueDir = () => process.env.MEDIA_QUEUE_DIR || join(process.env.MEDIA_SOURCE_ROOT || '/tank/media', '.queue');
const AREA = { files: 'stage', results: 'results' };
export const WORK_OPS = new Set(['claim', 'heartbeat', 'done', 'fail']);
// machines' key: MEDIA_QUEUE_KEY, else derived from the admin key (one-way, so a machine never holds the admin key). `ops.mjs media queue-key` prints it.
export const machineKey = () => process.env.MEDIA_QUEUE_KEY || (process.env.INTERNAL_API_KEY ? createHmac('sha256', process.env.INTERNAL_API_KEY).update('media-queue-machine').digest('hex').slice(0, 40) : null);
const safeId = (id) => /^[\w.-]{1,128}$/.test(id) && !id.startsWith('.');
const safeName = (n) => /^[\w.-][\w./-]{0,200}$/.test(n) && !n.includes('..');   // same rule as worker/queue/index.js

let db = null, sql = null, dbAt = null;
function open() {
  const dir = queueDir();
  if (sql && dbAt === dir) return sql;
  mkdirSync(dir, { recursive: true });
  db?.close(); db = new Database(join(dir, 'queue.db')); dbAt = dir;
  db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  // the Durable Object's ctx.storage.sql shape, so core.js runs unchanged
  sql = { exec: (q, ...b) => { const st = db.prepare(q); const r = st.reader ? st.all(...b) : (st.run(...b), []); return { toArray: () => r }; } };
  Q.migrate(sql);
  return sql;
}
const tx = (fn) => { const s = open(); return db.transaction(() => fn(s)).immediate(); };
const bad = (msg, status) => Object.assign(new Error(msg), { status });

/** The ops the edge Durable Object answers, by the same names and with the same results (list-done carries keys, no signed urls). */
export async function queueCall(op, a = {}) {
  switch (op) {
    case 'enqueue': return tx((s) => Q.enqueue(s, a.jobs || []));
    case 'claim': return tx((s) => Q.claim(s, a));
    case 'heartbeat': case 'lease-ok': return tx((s) => Q.heartbeat(s, a));
    case 'done': return tx((s) => Q.done(s, a));
    case 'fail': return tx((s) => Q.fail(s, a));
    case 'list-done': return tx((s) => Q.listDone(s, a.limit || 50));
    case 'capacity': return tx((s) => Q.capacity(s));
    case 'withdraw': return tx((s) => Q.withdraw(s, a.ids || []));
    case 'stats': return tx((s) => Q.stats(s));
    case 'ack': case 'cancel': {   // the staged inputs go too unless another job still names the same file
      const { gone, dirs } = tx((s) => {
        const gone = op === 'ack' ? Q.ack(s, a.ids || []) : Q.cancel(s, a.ids || []);
        return { gone, dirs: gone.flatMap((j) => [...(Q.fileInUse(s, j.file_id) ? [] : [areaDir('files', j.file_id)]), areaDir('results', j.id)]) };
      });
      for (const d of dirs) await rm(d, { recursive: true, force: true });
      return { acked: gone.length, deleted: dirs.length };
    }
    default: throw bad(`unknown op ${op}`, 404);
  }
}

function areaDir(kind, id) {
  if (!AREA[kind]) throw bad('not found', 404);
  if (!safeId(String(id))) throw bad('bad id', 400);
  return join(queueDir(), AREA[kind], String(id));
}
/** files/<file_id>/<name> | results/<job_id>/<name> → absolute path (validated). */
export function filePath(kind, id, name) {
  if (!name || !safeName(name)) throw bad('bad name', 400);
  return join(areaDir(kind, id), name);
}
/** → [{ name, bytes }] under the id, nested names included (the edge lists R2 prefixes the same way). */
export async function fileList(kind, id) {
  const root = areaDir(kind, id), out = [];
  const walk = async (d, pre) => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) await walk(join(d, e.name), pre + e.name + '/'); else out.push({ name: pre + e.name, bytes: (await stat(join(d, e.name))).size });
  } };
  await walk(root, '');
  return out;
}
/** A machine places a result (its lease must be live) or tower stages an input: written to a temp name, renamed when complete. */
export async function fileWrite(kind, id, name, source, { lease } = {}) {
  if (kind === 'results') await queueCall('lease-ok', { id, lease });
  const dest = filePath(kind, id, name), part = `${dest}.part-${process.pid}-${Date.now()}`;
  await mkdir(dirname(dest), { recursive: true });
  try {
    if (typeof source === 'string') await copyFile(source, part); else await pipeline(source, createWriteStream(part));
    await rename(part, dest);
  } catch (e) { await rm(part, { force: true }); throw e; }
  return { key: `${AREA[kind]}/${id}/${name}`, bytes: (await stat(dest)).size };
}
export function fileRead(kind, id, name) {
  const p = filePath(kind, id, name);
  if (!existsSync(p)) throw bad('not found', 404);
  return createReadStream(p);
}
/** Tower's in-process client: the SAME methods as queueClient() (api/lib/media/queue-client.mjs), so queue-feed.js runs on either transport. */
export function localQueue() {
  const call = async (op, body = {}) => queueCall(op, body);
  return {
    base: 'local', call, list: fileList,
    put: (kind, id, name, file, opts) => fileWrite(kind, id, name, file, opts),
    get: async (kind, id, name, dest) => { const src = filePath(kind, id, name); if (!existsSync(src)) throw bad(`get ${kind}/${id}/${name} 404`, 404); await mkdir(dirname(dest), { recursive: true }); await copyFile(src, dest); return dest; },
    claim: (a) => call('claim', a), heartbeat: (a) => call('heartbeat', a), done: (a) => call('done', a), fail: (a) => call('fail', a),
    enqueue: (jobs) => call('enqueue', { jobs }), capacity: () => call('capacity'), stats: () => call('stats'),
    listDone: (limit = 50) => call('list-done', { limit }), ack: (ids) => call('ack', { ids }), cancel: (ids) => call('cancel', { ids }), withdraw: (ids) => call('withdraw', { ids }),
  };
}
export const _closeForTests = () => { db?.close(); db = sql = dbAt = null; };
