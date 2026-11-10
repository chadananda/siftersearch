// Ops jobs 'phrase-hot-fold' / 'hype-hot-fold' (indexer service): fold the RAM write tier (qdrant-hot, /srv/qram) into main
// (Chad 11-10: RAM is the permanent write tier — speed + NVMe longevity). The MP44 then takes one large sequential copy with
// main's optimizer PAUSED (max_optimization_threads 0), then ONE optimize, instead of a merge after every 256-point upsert
// (14.7 TB written 10-25 → 11-10). Every id is verified in main before it is deleted from hot — never a blind drop.
// Modes: 'fold' (routine) — hot is newest: copy each live point (payload from hot, vector from the vector store, lossless
//          f16), skip the copy when main already holds the same payload, then delete from hot.
//        'clean' (once, for the 11-07 leftovers — hot was off and unmirrored since, so MAIN is newer there) — a point in main
//          is deleted from hot, nothing is copied; points only in hot are reported and kept.
// Both: a hot point with no unit in the vector store (re-segmented away, withheld) or of an excluded doc is a zombie (e.g. a
// crash restore brought it back) — deleted from hot, never copied. State (pause marker, last runs): data/run/qdrant-hot-fold.json.
// Deps: Qdrant HTTP (QDRANT_URL, QDRANT_HOT_URL, QDRANT_KEY), phrase-vector-read-repo (read-only), excluded-docs.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { pointJson, vectorJson } from './phrase-f16-build.js';

/** main collection → [vector store file, hot collection env, default hot name]. */
export const FOLD_TARGETS = Object.freeze({
  phrases: { store: () => process.env.PHRASE_STORE || '/tank/sifter/phrase-vectors/vectors.db', hot: () => process.env.QDRANT_HOT_PHRASES || 'phrases_hot' },
  hype: { store: () => process.env.HYPE_STORE || '/tank/sifter/hype-vectors/vectors.db', hot: () => process.env.QDRANT_HOT_HYPE || '' },
});
export const STATE_FILE = () => join(process.cwd(), 'data', 'run', 'qdrant-hot-fold.json');

const KEY = () => process.env.QDRANT_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpQd(base, method, path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'api-key': KEY() },
        body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw Object.assign(new Error(`${method} ${base}${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return r.json();
    } catch (e) { if ((e.http && !/→ 5\d\d/.test(e.message)) || attempt >= 5) throw e; await sleep(2000 * (attempt + 1)); }
  }
}

/** Payloads as order-independent text (Qdrant may return keys in any order after a stamp). Pure. */
export const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));

/** One scrolled page of hot points → what to do with each. Pure.
 *  points: [{id, payload}]; main: Map(id → payload) of those ids present in main; live: Set of ids with a stored vector;
 *  excluded: Set of excluded doc ids. → { copy: [point], drop: [id] (delete from hot only), keep: [id] (clean: only in hot) } */
export function classify(points, { main, live, excluded = new Set(), mode = 'fold' }) {
  const out = { copy: [], drop: [], keep: [], zombies: 0, same: 0 };
  for (const p of points) {
    const id = Number(p.id);
    if (!live.has(id) || excluded.has(Number(p.payload?.doc_id))) { out.drop.push(id); out.zombies++; continue; }
    if (main.has(id)) {
      if (mode === 'clean' || canon(main.get(id)) === canon(p.payload)) { out.drop.push(id); out.same++; continue; }
      out.copy.push(p); continue;
    }
    if (mode === 'clean') out.keep.push(id); else out.copy.push(p);
  }
  return out;
}

export function loadState(file = STATE_FILE()) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
export function saveState(st, file = STATE_FILE()) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(st, null, 1)); renameSync(`${file}.tmp`, file);
}

/** The real collection behind an alias (main `phrases` may be an alias of phrases_f16) — the PATCH must name it. */
async function realName(qd, base, name) {
  const r = await qd(base, 'GET', '/aliases').catch(() => null);
  return r?.result?.aliases?.find((a) => a.alias_name === name)?.collection_name || name;
}
const threadsOf = (info) => info?.config?.optimizer_config?.max_optimization_threads ?? null;

/** Pause main's optimizer for one bulk chunk (recorded first, so a crash mid-chunk is undone by the next run). */
async function pause(qd, base, coll, st, file) {
  const info = (await qd(base, 'GET', `/collections/${coll}`)).result;
  const prev = threadsOf(info);
  if (prev === 0 && st.paused?.[coll]) return;   // already ours
  st.paused = { ...(st.paused || {}), [coll]: { prev, at: new Date().toISOString() } }; saveState(st, file);
  await qd(base, 'PATCH', `/collections/${coll}`, { optimizers_config: { max_optimization_threads: 0 } });
}
/** Restore what pause() recorded (null = Qdrant's auto). Idempotent; also run at job start for a crashed run's pause. */
export async function resume(qd, base, coll, st, file) {
  const rec = st.paused?.[coll];
  if (!rec) return false;
  await qd(base, 'PATCH', `/collections/${coll}`, { optimizers_config: { max_optimization_threads: rec.prev === 0 ? null : rec.prev } });
  delete st.paused[coll]; saveState(st, file);
  return true;
}
/** After a chunk: let the one optimize run, until green or `maxMs` (yellow past that is fine — it keeps optimizing). */
async function settle(qd, base, coll, maxMs, pollMs) {
  const t0 = Date.now();
  for (;;) {
    const s = (await qd(base, 'GET', `/collections/${coll}`).catch(() => null))?.result?.status;
    if (s === 'green' || Date.now() - t0 >= maxMs) return s;
    await sleep(pollMs);
  }
}

/** collection: 'phrases' | 'hype'. params: { mode: 'fold'|'clean', batch, chunkPoints, settleMin, limit }. */
export async function qdrantHotFoldJob(collection, params = {}, deps = {}) {
  const target = FOLD_TARGETS[collection];
  if (!target) throw new Error(`hot-fold: unknown collection '${collection}' (phrases | hype)`);
  const env = deps.env || process.env;
  const main = env.QDRANT_URL || 'http://127.0.0.1:6333', hot = env.QDRANT_HOT_URL;
  const hotColl = deps.hotColl ?? target.hot();
  if (!hot || !hotColl) throw new Error(`hot-fold: the hot tier is off for ${collection} (QDRANT_HOT_URL${collection === 'hype' ? ' / QDRANT_HOT_HYPE' : ''} unset)`);
  const qd = deps.qd || httpQd, file = deps.stateFile || STATE_FILE();
  const st = loadState(file);
  // a 11-07-era phrases_hot must be cleaned before the first fold (main is newer there): with no mode given, an uncleaned
  // phrases_hot gets the clean pass, so a RAM-full fold never stalls on the gate; hype_hot was born under the new rule
  const needsClean = collection === 'phrases' && !st.cleaned?.[hotColl] && !params.skipCleanGate;
  const mode = params.mode || (needsClean ? 'clean' : 'fold');
  if (!['fold', 'clean'].includes(mode)) throw new Error(`hot-fold: mode must be fold | clean, got '${mode}'`);
  const vectors = deps.vectors || (async (ids) => (await import('../repos/phrase-vector-read-repo.js')).vectorsForPoints(ids, target.store()));
  const excludedIds = deps.excluded || (async () => (await import('../search/excluded-docs.js')).excludedDocIds());
  const excluded = new Set((await excludedIds()).map(Number));   // a failure here fails the job: never fold without the exclusion list
  const draining = deps.draining || (async () => (await import('../drain.js')).isDraining());
  const batch = Math.max(1, Math.min(1000, Number(params.batch) || 500)), chunkPoints = Math.max(batch, Number(params.chunkPoints) || 500_000);
  const settleMs = (params.settleMin ?? 60) * 60_000, pollMs = deps.pollMs ?? 15_000, limit = Number(params.limit) || 0;

  if (mode === 'fold' && needsClean)
    throw new Error(`hot-fold: run 'phrase-hot-fold' with { mode: 'clean' } first (${hotColl} holds points from before 11-07 that main has since updated)`);
  const mainColl = await realName(qd, main, collection);
  if (await resume(qd, main, mainColl, st, file)) st.resumedCrashedPause = true;   // a crashed run left main paused

  const hotExists = (await qd(hot, 'GET', `/collections/${hotColl}/exists`).catch(() => null))?.result?.exists;
  const out = { collection, mode, hot: hotColl, main: mainColl, scanned: 0, copied: 0, dropped: 0, same: 0, zombies: 0, keptOnlyInHot: 0, chunks: 0, unverified: 0 };
  if (!hotExists) { out.note = 'hot collection absent — nothing to fold'; return out; }
  const t0 = Date.now();
  let offset = null, inChunk = 0, paused = false;
  try {
    for (;;) {
      if (await draining()) { out.stoppedFor = 'drain'; break; }
      const sc = (await qd(hot, 'POST', `/collections/${hotColl}/points/scroll`, { offset, limit: batch, with_payload: true, with_vector: false })).result;
      const pts = sc.points || [];
      if (!pts.length) break;
      const ids = pts.map((p) => Number(p.id));
      const inMain = new Map(((await qd(main, 'POST', `/collections/${collection}/points`, { ids, with_payload: true, with_vector: false })).result || []).map((p) => [Number(p.id), p.payload]));
      const vecs = await vectors(ids);
      const c = classify(pts, { main: inMain, live: new Set(vecs.keys()), excluded, mode });
      out.scanned += pts.length; out.same += c.same; out.zombies += c.zombies; out.keptOnlyInHot += c.keep.length;
      const verified = [...c.drop];
      if (c.copy.length) {
        if (!paused) { await pause(qd, main, mainColl, st, file); paused = true; }
        const body = `{"points":[${c.copy.map((p) => pointJson(Number(p.id), vectorJson(vecs.get(Number(p.id))), p.payload)).join(',')}]}`;
        await qd(main, 'PUT', `/collections/${collection}/points?wait=true`, body);
        const back = new Set(((await qd(main, 'POST', `/collections/${collection}/points`, { ids: c.copy.map((p) => Number(p.id)), with_payload: false, with_vector: false })).result || []).map((p) => Number(p.id)));
        for (const p of c.copy) { if (back.has(Number(p.id))) verified.push(Number(p.id)); else out.unverified++; }
        out.copied += back.size; inChunk += back.size;
      }
      if (verified.length) { await qd(hot, 'POST', `/collections/${hotColl}/points/delete?wait=true`, { points: verified }); out.dropped += verified.length; }
      offset = sc.next_page_offset ?? null;
      if (paused && inChunk >= chunkPoints) {   // one optimize per chunk: resume, let it index what landed, pause again next batch
        await resume(qd, main, mainColl, st, file); paused = false; out.chunks++; inChunk = 0;
        out.lastStatus = await settle(qd, main, mainColl, settleMs, pollMs);
      }
      if (offset == null || (limit && out.scanned >= limit)) break;
    }
  } finally {
    if (paused || st.paused?.[mainColl]) { await resume(qd, main, mainColl, st, file); out.chunks++; }
  }
  if (inChunk) out.lastStatus = await settle(qd, main, mainColl, settleMs, pollMs);
  out.minutes = +((Date.now() - t0) / 6e4).toFixed(1);
  const done = offset == null && !out.stoppedFor && !limit;
  if (mode === 'clean' && done) st.cleaned = { ...(st.cleaned || {}), [hotColl]: new Date().toISOString() };
  st.last = { ...(st.last || {}), [`${hotColl}:${mode}`]: { at: new Date().toISOString(), ...out, complete: done } };
  saveState(st, file);
  return out;
}

/** Which hot collections a fold pass may queue (the enabled ones). → [[main, job]]. Pure over env. */
export function foldable(env = process.env) {
  if (!env.QDRANT_HOT_URL) return [];
  const out = [];
  out.push(['phrases', 'phrase-hot-fold']);   // uncleaned → the job runs the clean pass first (see qdrantHotFoldJob)
  if (env.QDRANT_HOT_HYPE) out.push(['hype', 'hype-hot-fold']);
  return out;
}

/** One pass of the indexer's fold loop: measure the RAM tier against the capacity the machine has NOW (hot-space.mjs) and
 *  queue folds — over FOLD_AT.now at once, over FOLD_AT.quiet in the quiet hours, and in the quiet hours after a big run
 *  asked for one (data/run/hot-fold-wanted.json). The queue dedupes; a fold already queued or running is not doubled. */
export async function hotFoldPass({ env = process.env, now = new Date(), deps = {} } = {}) {
  if (!env.QDRANT_HOT_URL) return { off: true };
  const hs = await import('../../../scripts/phrase-index/hot-space.mjs');
  const { statfsSync, readFileSync, writeFileSync } = await import('fs');
  const path = env.QDRANT_HOT_PATH || '/srv/qram', minFree = Number(env.QDRANT_HOT_MIN_FREE_GB || 6) * 1e9;
  const read = deps.read || (() => {
    const f = statfsSync(path);
    return { free: f.bavail * f.bsize, used: (f.blocks - f.bfree) * f.bsize, tmp: hs.dirBytes(join(path, 'storage', 'tmp')),
      memAvail: hs.parseMemAvailable(readFileSync('/proc/meminfo', 'utf8')) };
  });
  let r; try { r = read(); } catch (err) { return { error: `cannot read ${path}: ${err.message}` }; }
  const cap = hs.hotCapacity({ ...r, minFree });
  const quiet = hs.inQuietHours(now, env.QDRANT_HOT_QUIET_HOURS || '2-7');
  let verdict = hs.foldVerdict(cap, { quiet });
  const wantedFile = deps.wantedFile || join(process.cwd(), 'data', 'run', 'hot-fold-wanted.json');
  let wanted = {}; try { wanted = JSON.parse(readFileSync(wantedFile, 'utf8')); } catch { /* none */ }
  if (verdict !== 'fold-now' && verdict !== 'fold-quiet' && quiet && Object.keys(wanted).length && cap.data > 0) verdict = 'fold-after-run';
  const res = { verdict, quiet, data_gb: +(cap.data / 1e9).toFixed(1), capacity_gb: +(cap.capacity / 1e9).toFixed(1), fill: +cap.fill.toFixed(2), queued: [] };
  if (verdict === 'ok' || verdict === 'wait-quiet') return res;
  const enqueue = deps.enqueue || (await import('../repos/ops-report-repo.js')).enqueue;
  const jobs = foldable(env);
  for (const [, job] of jobs) { await enqueue(job, {}, `hot-fold-loop:${verdict}`); res.queued.push(job); }
  if (verdict === 'fold-after-run' || res.queued.length) { try { writeFileSync(wantedFile, '{}'); } catch { /* next pass retries */ } }
  return res;
}
