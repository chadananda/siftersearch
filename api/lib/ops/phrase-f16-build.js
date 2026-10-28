// Ops job 'phrase-f16-build' (indexer service; storage plan R12): copies the `phrases` points (main + hot) into a float16
// collection on the NEW Qdrant (qdrant-main, storage on the MP44 XFS /faster). Point SET + payload come from the source
// collection (so deleted points stay deleted and every stamp is kept); the VECTOR comes from vectors.db (repo; half precision
// is lossless). Runs as a niced child of the job (event loop and writer untouched: only a state FILE is written, no SQLite).
// Resumable by scroll offset (idempotent upserts). Modes: setup | copy | reconcile | finish. params: { mode, src, srcColl,
// dst, dstColl, batch, conc, state }. Deps: phrase-vector-read-repo, Qdrant HTTP (QDRANT_KEY).
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { vectorsForPoints } from '../repos/phrase-vector-read-repo.js';

const KEY = () => process.env.QDRANT_KEY || '';
export const DEFAULTS = { src: 'http://127.0.0.1:6333', srcColl: 'phrases', hot: 'http://127.0.0.1:6335', hotColl: 'phrases_hot',
  dst: 'http://127.0.0.1:6343', dstColl: 'phrases_f16', batch: 1000, conc: 3, shards: 8, state: '/faster/qdrant/phrase-f16-state.json', health: 'http://127.0.0.1:7839/healthz' };

/** All 65,536 half-precision values as JSON number text (5 significant digits round-trips f16 exactly). Pure. */
export function f16Table() {
  const u = new Uint16Array(65536).map((_, i) => i), f = new Float16Array(u.buffer), t = new Array(65536);
  for (let i = 0; i < 65536; i++) t[i] = Number.isFinite(f[i]) ? String(Number(f[i].toPrecision(5))) : '0';
  return t;
}
const TABLE = f16Table();
/** Stored vector bytes → JSON array text, no float parsing or formatting (table lookups). Pure. */
export function vectorJson(buf) {
  const u = new Uint16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), parts = new Array(u.length);
  for (let i = 0; i < u.length; i++) parts[i] = TABLE[u[i]];
  return `[${parts.join(',')}]`;
}
export const pointJson = (id, vec, payload) => `{"id":${id},"vector":{"literal":${vec}},"payload":${JSON.stringify(payload ?? {})}}`;

/** The float16 collection: the source's payload schema, bounded segments, indexing OFF until `finish` (bulk mode). Pure. */
export const createBody = () => ({
  vectors: { literal: { size: 3072, distance: 'Cosine', on_disk: true, datatype: 'float16' } },
  hnsw_config: { m: 16, ef_construct: 100, full_scan_threshold: 10000, on_disk: false, max_indexing_threads: 8 },
  quantization_config: { binary: { always_ram: true } },
  optimizers_config: { indexing_threshold: 0, max_segment_size: 10_000_000, default_segment_number: 24, flush_interval_sec: 120, max_optimization_threads: 8, deleted_threshold: 0.2, vacuum_min_vector_number: 1000 },
  wal_config: { wal_capacity_mb: 32 }, on_disk_payload: true,
});

async function qd(base, method, path, body, raw = false) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': KEY() }, body, signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw Object.assign(new Error(`${method} ${base}${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return raw ? r : r.json();
    } catch (e) { if ((e.http && !/→ 5\d\d/.test(e.message)) || attempt >= 5) throw e; await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); }
  }
}
const j = (o) => JSON.stringify(o);
const log = (o) => console.log(j({ at: new Date().toISOString(), phase: 'f16', ...o }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(p) {
  const exists = (await qd(p.dst, 'GET', `/collections/${p.dstColl}/exists`)).result.exists;
  if (!exists) await qd(p.dst, 'PUT', `/collections/${p.dstColl}`, j(createBody()));
  const info = (await qd(p.src, 'GET', `/collections/${p.srcColl}`)).result.payload_schema;
  for (const [field_name, s] of Object.entries(info)) await qd(p.dst, 'PUT', `/collections/${p.dstColl}/index?wait=true`, j({ field_name, field_schema: s.data_type }));
  log({ step: 'setup', created: !exists, indexes: Object.keys(info) });
}

/** Back off while search is slow (the build must never be felt): /api/health over 400 ms or Qdrant's update queue deep. */
async function guard(p, st) {
  for (;;) {
    const t = Date.now();
    const ok = await fetch(p.health, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
    const ms = Date.now() - t;
    const q = (await qd(p.dst, 'GET', `/collections/${p.dstColl}`).catch(() => null))?.result?.update_queue?.length ?? 0;
    st.health_ms = ms; st.queue = q;
    if (ms < 400 && ok && q < 300) return;
    st.throttled = (st.throttled || 0) + 1;
    await sleep(15000);
  }
}

async function copy(p, from, fromColl, st, stateKey, range = null) {
  let offset = st[stateKey]?.next ?? null;
  const done = st[stateKey]?.done;
  if (done) { log({ step: 'copy', from: fromColl, skipped: 'already complete' }); return; }
  const pending = new Set(), history = [];
  const t0 = Date.now(); let n0 = st[stateKey]?.copied || 0;
  for (let i = 0; ; i++) {
    if (i % 25 === 0) await guard(p, st);
    const sc = (await qd(from, 'POST', `/collections/${fromColl}/points/scroll`, j({ offset, limit: p.batch, with_payload: true, with_vector: false, ...(range ? { filter: { must: [{ key: 'paragraph_id', range }] } } : {}) }))).result;
    const pts = sc.points;
    if (!pts.length) break;
    const vecs = vectorsForPoints(pts.map((x) => Number(x.id)));
    const miss = pts.filter((x) => !vecs.has(Number(x.id)));
    const fallback = new Map();
    if (miss.length) for (const x of (await qd(from, 'POST', `/collections/${fromColl}/points`, j({ ids: miss.map((m) => m.id), with_vector: ['literal'], with_payload: false }))).result) fallback.set(Number(x.id), x.vector?.literal ?? x.vector);
    const items = [];
    for (const x of pts) {
      const id = Number(x.id), b = vecs.get(id);
      if (b) items.push(pointJson(id, vectorJson(b), x.payload));
      else if (fallback.get(id)) items.push(pointJson(id, j(fallback.get(id)), x.payload));
      else st.no_vector = (st.no_vector || 0) + 1;
    }
    const body = `{"points":[${items.join(',')}]}`;
    const up = qd(p.dst, 'PUT', `/collections/${p.dstColl}/points?wait=false`, body).then(() => { st[stateKey].copied += items.length; });
    st[stateKey] ??= { copied: 0 };
    pending.add(up); up.finally(() => pending.delete(up));
    history.push(offset);
    offset = sc.next_page_offset ?? null;
    while (pending.size >= p.conc) await Promise.race([...pending]);
    if (i % 50 === 0) {   // checkpoint a few batches BEHIND the front (uploads in flight are idempotent on resume)
      const safe = history[Math.max(0, history.length - p.conc - 2)] ?? null;
      st[stateKey].next = safe; st.rate_per_h = Math.round(((st[stateKey].copied - n0) / ((Date.now() - t0) / 3.6e6)) || 0); save(p, st);
      log({ from: fromColl, copied: st[stateKey].copied, next: offset, rate_per_h: st.rate_per_h, health_ms: st.health_ms, queue: st.queue, no_vector: st.no_vector || 0 });
    }
    if (offset == null) break;
  }
  await Promise.all(pending);
  st[stateKey] = { copied: st[stateKey]?.copied || 0, next: null, done: true }; save(p, st);
  log({ step: 'copy-done', from: fromColl, copied: st[stateKey].copied, no_vector: st.no_vector || 0 });
}

/** All point ids of a collection, paged. */
async function* idPages(base, coll, limit = 10000) {
  for (let off = null; ;) {
    const r = (await qd(base, 'POST', `/collections/${coll}/points/scroll`, j({ offset: off, limit, with_payload: false, with_vector: false }))).result;
    if (r.points.length) yield r.points.map((x) => Number(x.id));
    off = r.next_page_offset; if (off == null) return;
  }
}

/** After the copy: ids the sources no longer have are deleted from the new collection; ids it lacks are re-copied (the
 *  `copy` pass runs again over the hot collection and the missing main ids). Reports counts. */
async function reconcile(p, st) {
  const have = new Set();
  for await (const ids of idPages(p.dst, p.dstColl)) ids.forEach((i) => have.add(i));
  const want = new Set();
  for (const [b, c] of [[p.src, p.srcColl], [p.hot, p.hotColl]]) for await (const ids of idPages(b, c)) ids.forEach((i) => want.add(i));
  const extra = [...have].filter((i) => !want.has(i)), missing = [...want].filter((i) => !have.has(i));
  for (let i = 0; i < extra.length; i += 1000) await qd(p.dst, 'POST', `/collections/${p.dstColl}/points/delete?wait=true`, j({ points: extra.slice(i, i + 1000) }));
  log({ step: 'reconcile', new_points: have.size, wanted: want.size, deleted_extra: extra.length, missing: missing.length });
  // missing points: copy them by id from whichever source holds them
  for (const [b, c] of [[p.src, p.srcColl], [p.hot, p.hotColl]]) {
    const ids = missing.filter((x) => x != null);
    for (let i = 0; i < ids.length; i += p.batch) {
      const got = (await qd(b, 'POST', `/collections/${c}/points`, j({ ids: ids.slice(i, i + p.batch), with_payload: true, with_vector: false }))).result;
      if (!got.length) continue;
      const vecs = vectorsForPoints(got.map((x) => Number(x.id)));
      const items = got.filter((x) => vecs.has(Number(x.id))).map((x) => pointJson(Number(x.id), vectorJson(vecs.get(Number(x.id))), x.payload));
      if (items.length) await qd(p.dst, 'PUT', `/collections/${p.dstColl}/points?wait=true`, `{"points":[${items.join(',')}]}`);
    }
  }
  return { deleted_extra: extra.length, missing: missing.length };
}

/** paragraph_id boundaries that split the main collection into n ranges of about equal point count (bisect on counts). */
async function shardRanges(p, n) {
  const edge = async (dir) => (await qd(p.src, 'POST', `/collections/${p.srcColl}/points/scroll`, j({ limit: 1, order_by: { key: 'paragraph_id', direction: dir }, with_payload: ['paragraph_id'], with_vector: false }))).result.points[0].payload.paragraph_id;
  const lo = await edge('asc'), hi = (await edge('desc')) + 1;
  const count = async (gte, lt) => (await qd(p.src, 'POST', `/collections/${p.srcColl}/points/count`, j({ exact: false, filter: { must: [{ key: 'paragraph_id', range: { gte, lt } }] } }))).result.count;
  const total = await count(lo, hi), cuts = [lo];
  for (let i = 1; i < n; i++) {
    let a = cuts[i - 1], b = hi;
    while (b - a > 1000) { const m = Math.floor((a + b) / 2); if ((await count(lo, m)) < (total * i) / n) a = m; else b = m; }
    cuts.push(b);
  }
  cuts.push(hi);
  return cuts.slice(0, -1).map((c, i) => ({ gte: c, lt: cuts[i + 1] }));
}

async function copyMain(p, st) {
  if (!(p.shards > 1) || p.range) return copy(p, p.src, p.srcColl, st, 'main', p.range || null);
  const ranges = (st.ranges ??= await shardRanges(p, p.shards)); save(p, st);
  log({ step: 'shards', ranges });
  await Promise.all(ranges.map((range, i) => new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '15', process.execPath, '--max-old-space-size=4096', fileURLToPath(import.meta.url), j({ ...p, shards: 1, range, state: `${p.state}.s${i}` })], { env: process.env });
    child.stdout.on('data', (b) => process.stdout.write(b)); child.stderr.on('data', (b) => process.stderr.write(b));
    child.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`shard ${i} exit ${c}`))));
  })));
}

/** Bulk mode off: turn indexing on (HNSW + quantisation built once per segment), wait for green. */
async function finish(p) {
  await qd(p.dst, 'PATCH', `/collections/${p.dstColl}`, j({ optimizers_config: { indexing_threshold: 20000 } }));
  for (;;) {
    const r = (await qd(p.dst, 'GET', `/collections/${p.dstColl}`)).result;
    log({ step: 'finish', status: r.status, optimizer: r.optimizer_status, points: r.points_count, indexed: r.indexed_vectors_count, segments: r.segments_count });
    if (r.status === 'green' && r.indexed_vectors_count >= r.points_count * 0.99) return r;
    await sleep(60000);
  }
}

const save = (p, st) => { try { mkdirSync(dirname(p.state), { recursive: true }); writeFileSync(`${p.state}.tmp`, j(st)); renameSync(`${p.state}.tmp`, p.state); } catch { /* next checkpoint */ } };

export async function runBuild(params = {}) {
  const p = { ...DEFAULTS, ...params, mode: params.mode || 'copy' };
  if (!['setup', 'copy', 'reconcile', 'finish'].includes(p.mode)) throw new Error(`phrase-f16-build: unknown mode '${p.mode}'`);
  let st = {}; try { st = JSON.parse(readFileSync(p.state, 'utf8')); } catch { /* fresh */ }
  st.started ??= new Date().toISOString();
  if (p.mode === 'setup') return setup(p);
  if (p.mode === 'finish') return finish(p);
  if (p.mode === 'reconcile') { const r = await reconcile(p, st); st.reconciled = { at: new Date().toISOString(), ...r }; save(p, st); return r; }
  await copyMain(p, st);
  if (!p.range) await copy(p, p.hot, p.hotColl, st, 'hot');
  st.copied_at = new Date().toISOString(); save(p, st);
  return { main: st.main, hot: st.hot, no_vector: st.no_vector || 0, rate_per_h: st.rate_per_h };
}

/** The job: runs the build as a niced child so the service's event loop and the writer are never involved. */
export function phraseF16BuildJob(params = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '15', process.execPath, '--max-old-space-size=8192', fileURLToPath(import.meta.url), j(params)], { cwd: process.cwd(), env: process.env });
    let last = null, tail = '';
    const take = (buf) => { for (const l of String(buf).split('\n')) if (l.includes('"phase":"f16"')) { try { last = JSON.parse(l); } catch { /* partial line */ } } tail = (tail + buf).slice(-1500); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('exit', (code) => (code === 0 ? resolve({ code, last }) : reject(new Error(`phrase-f16-build exit ${code}: ${tail.slice(-400)}`))));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dotenv = (await import('dotenv')).default;
  dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
  runBuild(JSON.parse(process.argv[2] || '{}')).then((r) => { log({ step: 'exit', result: r }); process.exit(0); }, (e) => { console.error(e.stack); process.exit(1); });
}
