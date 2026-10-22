// Worker thread for vector-backup-repo. mode 'backup': SQLite online backup of one vectors.db, paced (Atomics.wait between
// steps blocks only this thread), then the COPY goes to journal_mode=DELETE (one self-contained file), a completion marker
// (<dest>.copied) is written, and the copy is verified. mode 'verify': verify an existing complete copy. Nice 19.
// Checks: 'sample' (header + page count + size + random rows of every table compared with the source — minutes (5 min for
// 240 GB on the HDD), 'quick_check' / 'integrity_check' (full scans: random reads, many hours on the HDD for the phrase store).
import os from 'os';
import { createHash } from 'crypto';
import { statSync, writeFileSync } from 'fs';
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import { restarted, readHeader } from './vector-backup-repo.js';

const { mode = 'backup', src, dest, pagesPerStep, pauseMs, check, maxRestarts, abort, samples = 200 } = workerData;
const flag = new Int32Array(abort);
try { os.setPriority(19); } catch { /* not permitted */ }

const rowHash = (row) => createHash('sha1').update(JSON.stringify(row, (k, v) => (v && v.type === 'Buffer' ? createHash('sha1').update(Buffer.from(v.data)).digest('hex') : v))).digest('hex');

/** Random rows of every rowid table, looked up by rowid in source and copy: [] when all match, else the differences. */
function sampleCompare(source, copy, n) {
  const problems = [];
  const tables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const copyTables = new Set(copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  for (const t of tables) {
    if (!copyTables.has(t)) { problems.push(`table ${t} missing`); continue; }
    let lo, hi;
    try { ({ lo, hi } = source.prepare(`SELECT MIN(rowid) lo, MAX(rowid) hi FROM "${t}"`).get()); } catch { continue; }   // WITHOUT ROWID
    if (lo == null) continue;
    const a = source.prepare(`SELECT * FROM "${t}" WHERE rowid >= ? ORDER BY rowid LIMIT 1`), b = copy.prepare(`SELECT * FROM "${t}" WHERE rowid >= ? ORDER BY rowid LIMIT 1`);
    const per = Math.max(5, Math.ceil(n / tables.length));
    for (let i = 0; i < per; i++) {
      const at = lo + Math.floor(Math.random() * (hi - lo + 1));
      const x = a.get(at), y = b.get(at);
      if (rowHash(x) !== rowHash(y)) { problems.push(`${t} rowid≥${at} differs`); if (problems.length > 10) return problems; }
    }
  }
  return problems;
}

function verify(source, copiedPages, pageSize) {
  const t0 = Date.now();
  const h = readHeader(dest);
  let checkResult;
  if (check === 'sample') {
    const copy = new Database(dest, { readonly: true, fileMustExist: true });
    const problems = h.ok ? sampleCompare(source, copy, samples) : ['not an SQLite file'];
    copy.close();
    checkResult = problems.length ? problems : ['ok'];
  } else {
    const copy = new Database(dest, { readonly: true, fileMustExist: true });
    checkResult = copy.pragma(check).map((r) => Object.values(r)[0]);
    copy.close();
  }
  return { copiedPages, pageSize, pageCount: h.pages, fileBytes: statSync(dest).size, check: checkResult, checkName: check, checkMs: Date.now() - t0, header: h };
}

try {
  const source = new Database(src, { readonly: true, fileMustExist: true });
  const pageSize = source.pragma('page_size', { simple: true });
  if (mode === 'verify') {
    const r = verify(source, source.pragma('page_count', { simple: true }), pageSize);   // the copy must match the source page for page
    source.close();
    parentPort.postMessage({ type: 'done', result: { ...r, restarts: 0, ms: 0, adopted: true } });
  } else {
    const t0 = Date.now();
    let prev = null, restarts = 0, reported = 0;
    const done = await source.backup(dest, {
      progress(p) {
        if (Atomics.load(flag, 0)) throw new Error('aborted (service stopping or cancelled)');
        if (restarted(prev, p) && ++restarts > maxRestarts) throw new Error(`source changed during the backup (${restarts} restarts): a writer is running`);
        prev = { totalPages: p.totalPages, remainingPages: p.remainingPages };
        if (Date.now() - reported > 30_000) { reported = Date.now(); parentPort.postMessage({ type: 'progress', ...prev, pageSize }); }
        if (pauseMs > 0) Atomics.wait(flag, 0, 0, pauseMs);
        return pagesPerStep;
      },
    });
    const ms = Date.now() - t0;
    const copy = new Database(dest, { fileMustExist: true });
    copy.pragma('journal_mode = DELETE');
    copy.close();
    const s = statSync(src);
    // the copy is complete from here on: a killed verification leaves it adoptable (no second 240 GB copy)
    writeFileSync(`${dest}.copied`, JSON.stringify({ srcSize: s.size, srcMtimeMs: s.mtimeMs, copiedPages: done.totalPages, pageSize, at: new Date().toISOString() }));
    const r = verify(source, done.totalPages, pageSize);
    source.close();
    parentPort.postMessage({ type: 'done', result: { ...r, bytes: done.totalPages * pageSize, restarts, ms } });
  }
} catch (err) {
  parentPort.postMessage({ type: 'error', message: String(err?.message || err) });
}
