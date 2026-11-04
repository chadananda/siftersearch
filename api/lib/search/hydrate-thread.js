// Search hydration OFF the serving thread (11-04). better-sqlite3 is synchronous: the hydrate read (search:hydrate, ~20 ms,
// ~150 paragraphs) + highlighting ran on the API's event loop WHILE sibling engine calls' Qdrant fetches were in flight, so
// those fetches' wall time (qdrant_by) read 200-300 ms p95 against Qdrant's own 10-20 ms. A small pool of worker threads,
// each with its own read connection (tagged '<proc>/thread'), now runs paragraphsByIds + highlightText; the main thread only
// receives the documents. Tests / SIFTER_HYDRATE_THREADS=0 → in-process (same code). Deps: paragraphs-repo, highlighting.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { highlightText } from './highlighting.js';

const ROLE = 'search-hydrate';
const TIMEOUT_MS = 15_000;

/** The work itself, wherever it runs: live paragraphs for `ids` (paragraphs-repo shape) with the query terms marked. */
export async function hydrateInProcess(ids, query, timing = null) {
  const { paragraphsByIds } = await import('../paragraphs-repo.js');
  const t0 = performance.now();
  const docs = await paragraphsByIds(ids);
  const t1 = performance.now();
  const out = query ? docs.map((doc) => ({ ...doc, _formatted: { text: highlightText(doc.text, query) } })) : docs;   // no query → bodies only
  if (timing) { timing.read = t1 - t0; timing.highlight = performance.now() - t1; }
  return out;
}

if (!isMainThread && workerData?.role === ROLE) {
  parentPort.on('message', async ({ id, ids, query }) => {
    const timing = {};
    try { const docs = await hydrateInProcess(ids, query, timing); parentPort.postMessage({ id, docs, timing }); }
    catch (err) { parentPort.postMessage({ id, error: String(err?.message || err) }); }
  });
}

const threadCount = () => {
  const n = process.env.SIFTER_HYDRATE_THREADS;
  if (n != null && n !== '') return Math.max(0, Number(n) || 0);
  return process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 2;
};

const pool = [];   // { worker, pending: Map(id → {resolve, reject}) }
let seq = 0, failures = 0;
const stats = { thread: 0, inProcess: 0, fallback: 0, read_ms: 0, read_max_ms: 0, highlight_ms: 0 };   // time spent inside the threads

function spawn() {
  // the thread's own page cache is smaller than the serving connection's (the OS page cache / mmap is shared anyway)
  const env = { ...process.env, SQLITE_CACHE_MB: process.env.SIFTER_HYDRATE_CACHE_MB || '128' };
  const slot = { worker: new Worker(fileURLToPath(import.meta.url), { workerData: { role: ROLE }, env }), pending: new Map() };
  slot.worker.unref();   // never keeps a process alive
  slot.worker.on('message', ({ id, docs, error, timing }) => {
    const p = slot.pending.get(id); if (!p) return;
    if (timing?.read != null) {
      stats.read_ms += timing.read; stats.highlight_ms += timing.highlight;
      stats.read_max_ms = Math.max(stats.read_max_ms, timing.read);
    }
    slot.pending.delete(id);
    error ? p.reject(new Error(error)) : p.resolve(docs);
  });
  const fail = (err) => {
    failures++;
    const i = pool.indexOf(slot); if (i >= 0) pool.splice(i, 1);
    for (const p of slot.pending.values()) p.reject(err);
    slot.pending.clear();
  };
  slot.worker.on('error', fail);
  slot.worker.on('exit', (code) => fail(new Error(`hydrate thread exited (${code})`)));
  pool.push(slot);
  return slot;
}

function pick() {
  const want = threadCount();
  if (!want || failures > 20) return null;   // a thread that keeps dying → in-process rather than a respawn loop
  if (pool.length < want) return spawn();
  return pool.reduce((a, b) => (b.pending.size < a.pending.size ? b : a));
}

/** Hydrated, highlighted paragraphs for `ids` — on a worker thread when the pool is on, else in-process. A thread error
 *  falls back to the in-process read (slower for the loop, never a lost result). */
export async function hydrateParagraphs(ids, query) {
  const slot = pick();
  if (!slot) { stats.inProcess++; return hydrateInProcess(ids, query); }
  const id = ++seq;
  try {
    const docs = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { slot.pending.delete(id); reject(new Error('hydrate thread timed out')); }, TIMEOUT_MS);
      t.unref?.();
      slot.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      slot.worker.postMessage({ id, ids, query });
    });
    stats.thread++;
    return docs;
  } catch {
    stats.fallback++;
    return hydrateInProcess(ids, query);
  }
}

/** Start the pool early (a serving process's warm-up): the first search does not pay thread start + module load. */
export function warmHydrateThreads() {
  for (let i = pool.length; i < threadCount(); i++) spawn().worker.postMessage({ id: 0, ids: [], query: '' });
}

export const hydrateThreadStats = () => ({ ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Math.round(v)])), threads: pool.length, failures });
