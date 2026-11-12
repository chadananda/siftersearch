// Read pool: synchronous SQLite reads OFF the serving thread (11-04). better-sqlite3 blocks the event loop for a read's whole
// duration, so every sibling request's in-flight I/O (Qdrant fetches, embeds) waits with it. A few worker threads, each with
// its own read connection (tagged '<proc>/thread'), run NAMED read tasks (TASKS) and post back plain rows. Measured on tower
// (standalone repro, conc 3): hydrate ~20 ms per engine call, search-target's entity surface counts 1.0 s in ONE statement,
// entity:lookup 20-107 ms, docs:find 15-118 ms, bio:persons ~340 ms — all main-thread blocks before this pool.
// Tests / SIFTER_READ_THREADS=0 → in-process (same code). A thread error falls back in-process (never a lost result).
// Deps: the task modules (repos + hydrate-thread.js), loaded lazily inside whichever thread runs the task.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const ROLE = 'read-pool';
const TIMEOUT_MS = 15_000;

/** Named read tasks: (args, timing) → structured-cloneable value. Only READS — a thread never writes. */
export const TASKS = {
  hydrate: async ([ids, query], timing) => (await import('./hydrate-thread.js')).hydrateInProcess(ids, query, timing),
  'entity:names': async ([ids]) => (await import('../repos/entity-names-repo.js')).entityNameRows(ids),
  'entity:lookup': async ([q]) => (await import('../repos/entity-names-repo.js')).entityLookupKeyRows(q),
  'docs:find': async ([text, opts]) => (await import('../docs-repo.js')).findDocuments(text, opts),
  'bio:persons': async ([books]) => (await import('../repos/bio-persons-repo.js')).bioPersonRows(books),
  'paragraphs:in-range': async ([docId, from, to, opts]) => (await import('../paragraphs-repo.js')).paragraphRangeRows(docId, from, to, opts),
  'paragraphs:heading-starts': async ([docId]) => (await import('../paragraphs-repo.js')).headingStartRows(docId),
};

async function runTask(task, args, timing) {
  const fn = TASKS[task];
  if (!fn) throw new Error(`unknown read task ${task}`);
  return fn(args, timing);
}

if (!isMainThread && workerData?.role === ROLE) {
  parentPort.on('message', async ({ id, task, args, sent }) => {
    const timing = {};
    const t0 = performance.now();
    // ms between the post and this thread taking the task = time queued behind the thread's earlier tasks (epoch clocks agree across threads)
    if (typeof sent === 'number') timing.queued = Math.max(0, performance.timeOrigin + t0 - sent);
    try { const value = await runTask(task, args, timing); timing.total = performance.now() - t0; parentPort.postMessage({ id, value, timing }); }
    catch (err) { parentPort.postMessage({ id, error: String(err?.message || err) }); }
  });
}

/** Threads per process. SIFTER_HYDRATE_THREADS is the pre-11-04 name of the same knob. */
const threadCount = () => {
  const n = process.env.SIFTER_READ_THREADS ?? process.env.SIFTER_HYDRATE_THREADS;
  if (n != null && n !== '') return Math.max(0, Number(n) || 0);
  return process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 3;
};

const pool = [];   // { worker, pending: Map(id → {resolve, reject}) }
let seq = 0, failures = 0;
const stats = {};   // task → { thread, inProcess, fallback, <timing key>_ms, max_ms } — time spent INSIDE the threads
const statFor = (task) => (stats[task] ||= { thread: 0, inProcess: 0, fallback: 0, max_ms: 0 });

function spawn() {
  // the thread's own page cache is smaller than the serving connection's (the OS page cache / mmap is shared anyway)
  const env = { ...process.env, SQLITE_CACHE_MB: process.env.SIFTER_READ_CACHE_MB || process.env.SIFTER_HYDRATE_CACHE_MB || '128' };
  const slot = { worker: new Worker(fileURLToPath(import.meta.url), { workerData: { role: ROLE }, env }), pending: new Map() };
  slot.worker.unref();   // never keeps a process alive
  slot.worker.on('message', ({ id, value, error, timing }) => {
    const p = slot.pending.get(id); if (!p) return;
    slot.pending.delete(id);
    if (timing && p.task) {
      const s = statFor(p.task);
      for (const [k, v] of Object.entries(timing)) s[`${k}_ms`] = (s[`${k}_ms`] || 0) + v;
      s.max_ms = Math.max(s.max_ms, timing.total || 0);
    }
    error ? p.reject(new Error(error)) : p.resolve({ value, timing });
  });
  const fail = (err) => {
    failures++;
    const i = pool.indexOf(slot); if (i >= 0) pool.splice(i, 1);
    for (const p of slot.pending.values()) p.reject(err);
    slot.pending.clear();
  };
  slot.worker.on('error', fail);
  slot.worker.on('exit', (code) => fail(new Error(`read thread exited (${code})`)));
  pool.push(slot);
  return slot;
}

function pick() {
  const want = threadCount();
  if (!want || failures > 20) return null;   // a thread that keeps dying → in-process rather than a respawn loop
  if (pool.length < want) return spawn();
  return pool.reduce((a, b) => (b.pending.size < a.pending.size ? b : a));
}

/** Run read task `task` with `args` on a pool thread (in-process when the pool is off). A thread error or timeout falls back
 *  to the in-process read: slower for the loop, never a lost result. */
export async function runRead(task, ...args) { return (await runReadTimed(task, ...args)).value; }

/** runRead plus the thread's own timing ({read, highlight, total} ms inside the thread; in-process: measured here), so a
 *  caller can tell the read from the wait for a thread. */
export async function runReadTimed(task, ...args) {
  if (!TASKS[task]) throw new Error(`unknown read task ${task}`);
  const local = async () => { const timing = {}, t0 = performance.now(); const value = await runTask(task, args, timing); timing.total = performance.now() - t0; return { value, timing }; };
  const slot = pick();
  if (!slot) { statFor(task).inProcess++; return local(); }
  const id = ++seq;
  try {
    const value = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { slot.pending.delete(id); reject(new Error('read thread timed out')); }, TIMEOUT_MS);
      t.unref?.();
      slot.pending.set(id, { task, resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      slot.worker.postMessage({ id, task, args, sent: performance.timeOrigin + performance.now() });
    });
    statFor(task).thread++;
    return value;
  } catch {
    statFor(task).fallback++;
    return local();
  }
}

/** Start the pool early (a serving process's warm-up): the first search pays no thread start + module load. */
export function warmReadPool() {
  for (let i = pool.length; i < threadCount(); i++) spawn().worker.postMessage({ id: 0, task: 'hydrate', args: [[], ''] });
}

export const readPoolStats = () => ({
  threads: pool.length, failures,
  tasks: Object.fromEntries(Object.entries(stats).map(([t, s]) => [t, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)]))])),
});
