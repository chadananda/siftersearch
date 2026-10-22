// vector-backup-repo — copies a vector store (vectors.db: paid Gemini embeddings) with SQLite's ONLINE BACKUP API, in a
// worker thread so pacing (sleep between steps) never blocks the service's event loop. Verifies the COPY (page count, file
// size, quick_check/integrity_check) before the caller promotes it. Read-only on the source. Deps: better-sqlite3 (thread).
// Plan: planning/storage-wear-ram-plan.md R1.
import { Worker } from 'worker_threads';
import { openSync, readSync, closeSync, existsSync, readFileSync, statSync } from 'fs';

/** The three stores (the /tank/sifter/* paths are symlinks to wherever the store lives now) and the jobs that write them. */
export const VECTOR_STORES = {
  phrase: { src: '/tank/sifter/phrase-vectors/vectors.db', writers: ['phrase-index', 'phrase-hot-reconcile'] },
  hype: { src: '/tank/sifter/hype-vectors/vectors.db', writers: ['hype-index'] },
  concept: { src: '/tank/sifter/concept-vectors/vectors.db', writers: ['concept-index'] },
};

/** Which check verifies the copy. Full scans on the HDD copy are random reads: hype's 20 GB integrity_check took 38 min and
 *  the 240 GB phrase quick_check fell to ~1 MB/s after 4 h (10-21). So: integrity_check < 2 GB, quick_check < 50 GB, and
 *  above that 'sample' (header + page count + size + random rows of every table compared with the source, seconds). A
 *  full check of the big store is an explicit, separate run (params.check 'quick' | 'integrity'), weekly at most. */
export const checkFor = (bytes, { check = 'auto', fullBelowBytes = 2e9, quickBelowBytes = 50e9 } = {}) =>
  (check === 'integrity' ? 'integrity_check' : check === 'quick' ? 'quick_check' : check === 'sample' ? 'sample'
    : bytes < fullBelowBytes ? 'integrity_check' : bytes < quickBelowBytes ? 'quick_check' : 'sample');

/** The SQLite header of a file: magic, page size, page count (bytes 28–31), WAL mode (write version 2). */
export function readHeader(file) {
  const fd = openSync(file, 'r');
  try {
    const h = Buffer.alloc(100);
    readSync(fd, h, 0, 100, 0);
    const ps = h.readUInt16BE(16);
    return { ok: h.toString('latin1', 0, 16) === 'SQLite format 3\0', pageSize: ps === 1 ? 65536 : ps, pages: h.readUInt32BE(28), wal: h[18] === 2 };
  } finally { closeSync(fd); }
}

/** Is a leftover <dest> (a .partial) a COMPLETE copy of src that only needs verifying? Yes when its completion marker
 *  matches the source's size and mtime; or (copies made before the marker existed) when it is out of WAL mode, its header
 *  page count × page size equals both its size and the source's, and neither the source nor its WAL changed since the copy
 *  began (birthtime). Pure apart from the stats it is given. */
export function adoptable({ srcStat, walStat = null, destStat, header, marker = null }) {
  if (!destStat || !header?.ok || header.wal) return false;
  if (header.pages * header.pageSize !== destStat.size || destStat.size !== srcStat.size) return false;
  if (marker) return marker.srcSize === srcStat.size && marker.srcMtimeMs === srcStat.mtimeMs;
  const began = destStat.birthtimeMs || 0;
  return began > 0 && srcStat.mtimeMs < began && (!walStat || walStat.size === 0 || walStat.mtimeMs <= began);
}

/** Read the stats adoptable() needs for src → dest. */
export function adoptionFacts(src, dest) {
  if (!existsSync(dest)) return null;
  const marker = existsSync(`${dest}.copied`) ? (() => { try { return JSON.parse(readFileSync(`${dest}.copied`, 'utf8')); } catch { return null; } })() : null;
  return { srcStat: statSync(src), walStat: existsSync(`${src}-wal`) ? statSync(`${src}-wal`) : null, destStat: statSync(dest), header: readHeader(dest), marker };
}

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
export function backupVectorStore({ src, dest, pagesPerStep = 2048, pauseMs = 100, check = 'quick_check', maxRestarts = 1, mode = 'backup', samples = 200 },
  { onProgress = () => {}, shouldAbort = () => false } = {}) {
  const abort = new SharedArrayBuffer(4);
  const flag = new Int32Array(abort);
  const worker = new Worker(new URL('./vector-backup-thread.js', import.meta.url),
    { workerData: { mode, src, dest, pagesPerStep, pauseMs, check, maxRestarts, abort, samples } });
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
