// People search over cited claims, OFF the serving thread (10-19: entitySearch scanned and folded every supported person
// claim per call — 10–13 s on the api/anis main threads, 121× in one hour; docs/architecture/blocking-queries.md). One
// long-lived worker thread (claim-search-worker.js) holds the claims folded in memory and answers each query in ms.
// Deps: worker_threads.
import { Worker } from 'worker_threads';

const TIMEOUT_MS = 30_000;   // the first query waits for the worker's one-time load (~10 s, off-thread)
let worker = null, seq = 0;
const pending = new Map();

function start() {
  worker = new Worker(new URL('./claim-search-worker.js', import.meta.url));
  worker.unref();   // never keeps a process alive
  worker.on('message', ({ id, rows, error }) => { const p = pending.get(id); if (!p) return; pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(rows); });
  const fail = (err) => { worker = null; for (const p of pending.values()) p.reject(err); pending.clear(); };
  worker.on('error', fail);
  worker.on('exit', (code) => fail(new Error(`claim-search worker exited (${code})`)));
}

/** Rows (entity-api row shape + rank) whose folded statement holds any term, best first, at most 2000. */
export function claimRows(terms, foldedQuery) {
  if (!worker) start();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error('claim search timed out')); }, TIMEOUT_MS);
    t.unref?.();
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    worker.postMessage({ id, terms, foldedQuery });
  });
}

/** Start the worker's load early (a serving process's warm-up), so the first person search does not wait. */
export const warmClaimSearch = () => { if (!worker) start(); worker.postMessage({ id: 0, warm: true }); };
