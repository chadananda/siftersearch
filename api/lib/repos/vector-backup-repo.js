// vector-backup-repo — copies a vector store (vectors.db: paid Gemini embeddings) with SQLite's ONLINE BACKUP API, in a
// worker thread so pacing (sleep between steps) never blocks the service's event loop. Verifies the COPY (page count, file
// size, quick_check/integrity_check) before the caller promotes it. Read-only on the source. Deps: better-sqlite3 (thread).
// Plan: planning/storage-wear-ram-plan.md R1.
import { Worker } from 'worker_threads';

/** The three stores (the /tank/sifter/* paths are symlinks to wherever the store lives now) and the jobs that write them. */
export const VECTOR_STORES = {
  phrase: { src: '/tank/sifter/phrase-vectors/vectors.db', writers: ['phrase-index', 'phrase-hot-reconcile'] },
  hype: { src: '/tank/sifter/hype-vectors/vectors.db', writers: ['hype-index'] },
  concept: { src: '/tank/sifter/concept-vectors/vectors.db', writers: ['concept-index'] },
};

/** Which integrity check to run on the copy: full integrity_check below `fullBelowBytes`, quick_check above (a 240 GB
 *  integrity_check on the HDD takes hours; quick_check still reads every page and checks every b-tree). */
export const checkFor = (bytes, { check = 'auto', fullBelowBytes = 50e9 } = {}) =>
  (check === 'auto' ? (bytes < fullBelowBytes ? 'integrity_check' : 'quick_check') : check === 'integrity' ? 'integrity_check' : 'quick_check');

/** Did the backup restart? SQLite restarts a backup when ANOTHER connection writes the source: remaining pages jump back up
 *  (or the source's page count changes). Pure, for the thread and the tests. */
export const restarted = (prev, cur) => !!prev && (cur.remainingPages > prev.remainingPages || cur.totalPages !== prev.totalPages);

/** The copy is good only if the check said ok and the page count and file size match what the backup copied. Pure. */
export function verdict({ copiedPages, pageCount, pageSize, fileBytes, check }) {
  const problems = [];
  if (pageCount !== copiedPages) problems.push(`page_count ${pageCount} ≠ copied ${copiedPages}`);
  if (fileBytes !== pageCount * pageSize) problems.push(`file ${fileBytes} B ≠ ${pageCount} × ${pageSize}`);
  if (check?.length !== 1 || check[0] !== 'ok') problems.push(`check: ${(check || []).slice(0, 5).join('; ')}`);
  return { ok: !problems.length, problems };
}

/**
 * Back up `src` to `dest` (must not exist) in a worker thread. pagesPerStep × pauseMs paces it (default 8 MB per 100 ms
 * ≤ 80 MB/s). Fails when the source changes more than maxRestarts times (a writer is running) or shouldAbort() turns true.
 * → { copiedPages, pageSize, bytes, restarts, ms, check, checkResult, verdict }
 */
export function backupVectorStore({ src, dest, pagesPerStep = 2048, pauseMs = 100, check = 'quick_check', maxRestarts = 1 },
  { onProgress = () => {}, shouldAbort = () => false } = {}) {
  const abort = new SharedArrayBuffer(4);
  const flag = new Int32Array(abort);
  const worker = new Worker(new URL('./vector-backup-thread.js', import.meta.url),
    { workerData: { src, dest, pagesPerStep, pauseMs, check, maxRestarts, abort } });
  return new Promise((resolve, reject) => {
    const poll = setInterval(() => { if (shouldAbort()) { Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); } }, 2000);
    const end = (fn, v) => { clearInterval(poll); fn(v); };
    worker.on('message', (m) => {
      if (m.type === 'progress') onProgress(m);
      else if (m.type === 'done') end(resolve, { ...m.result, verdict: verdict(m.result) });
      else if (m.type === 'error') end(reject, new Error(m.message));
    });
    worker.on('error', (err) => end(reject, err));
    worker.on('exit', (code) => { if (code) end(reject, new Error(`backup thread exit ${code}`)); });
  });
}
