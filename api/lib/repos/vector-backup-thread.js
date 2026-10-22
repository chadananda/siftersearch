// Worker thread for vector-backup-repo: SQLite online backup of one vectors.db, paced (Atomics.wait between steps blocks
// only this thread), then switches the COPY to journal_mode=DELETE (one self-contained file) and checks it. Nice 19.
import os from 'os';
import { statSync } from 'fs';
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import { restarted } from './vector-backup-repo.js';

const { src, dest, pagesPerStep, pauseMs, check, maxRestarts, abort } = workerData;
const flag = new Int32Array(abort);
try { os.setPriority(19); } catch { /* not permitted */ }

try {
  const t0 = Date.now();
  const source = new Database(src, { readonly: true, fileMustExist: true });
  const pageSize = source.pragma('page_size', { simple: true });
  let prev = null, restarts = 0, reported = 0;
  const done = await source.backup(dest, {
    progress(p) {
      if (Atomics.load(flag, 0)) throw new Error('aborted (service draining or cancelled)');
      if (restarted(prev, p) && ++restarts > maxRestarts) throw new Error(`source changed during the backup (${restarts} restarts): a writer is running — drain the indexer first`);
      prev = { totalPages: p.totalPages, remainingPages: p.remainingPages };
      if (Date.now() - reported > 30_000) { reported = Date.now(); parentPort.postMessage({ type: 'progress', ...prev, pageSize }); }
      if (pauseMs > 0) Atomics.wait(flag, 0, 0, pauseMs);
      return pagesPerStep;
    },
  });
  source.close();
  const ms = Date.now() - t0;
  const copy = new Database(dest, { fileMustExist: true });
  copy.pragma('journal_mode = DELETE');
  const pageCount = copy.pragma('page_count', { simple: true });
  const checkResult = copy.pragma(check).map((r) => Object.values(r)[0]);
  copy.close();
  parentPort.postMessage({ type: 'done', result: { copiedPages: done.totalPages, pageSize, pageCount, fileBytes: statSync(dest).size,
    bytes: done.totalPages * pageSize, restarts, ms, checkMs: Date.now() - t0 - ms, check: checkResult, checkName: check } });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: String(err?.message || err) });
}
