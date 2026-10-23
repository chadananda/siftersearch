// WAL checkpointer OFF the write path (db-write-path-20261023). A worker thread with its own connection copies the WAL into
// the DB file with PASSIVE checkpoints every few seconds — it never waits on readers or blocks the writer — so the single
// writer's commits stop paying inline checkpoints (wal_autocheckpoint is raised to a safety net, db.js applyRamPragmas).
// TRUNCATE only on request (WAL file still large, or the power flush) with a bounded busy wait: while a TRUNCATE is pending
// SQLite holds off new writers, so the writer's main thread can wait at most `truncateBusyMs`. Main side:
// startCheckpointThread(); the same file is the thread's entry. Deps: better-sqlite3, node:worker_threads.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const ROLE = 'wal-checkpoint';

if (!isMainThread && workerData?.role === ROLE) {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(workerData.path);
  db.pragma(`synchronous = ${workerData.synchronous || 'NORMAL'}`);
  db.pragma('busy_timeout = 1000');
  const run = (mode, busyMs) => {
    if (busyMs != null) db.pragma(`busy_timeout = ${busyMs}`);
    const t0 = performance.now();
    try { const [r] = db.pragma(`wal_checkpoint(${mode})`); return { mode, ms: Math.round(performance.now() - t0), ...r }; }
    catch (err) { return { mode, ms: Math.round(performance.now() - t0), error: err.message }; }
    finally { if (busyMs != null) db.pragma('busy_timeout = 1000'); }
  };
  const tick = setInterval(() => parentPort.postMessage({ type: 'passive', ...run('PASSIVE') }), workerData.everyMs);
  parentPort.on('message', (m) => {
    if (m?.cmd === 'truncate') parentPort.postMessage({ type: 'reply', id: m.id, ...run('TRUNCATE', m.busyMs ?? 3000) });
    if (m?.cmd === 'stop') { clearInterval(tick); db.close(); parentPort.close(); }
  });
}

/** Start the checkpointer for the DB at `path`. onPassive(result) after each PASSIVE ({ms, busy, log, checkpointed}).
 *  → { truncate(busyMs) → Promise<result>, stop(), stats() }. A thread that dies is restarted after 10 s. */
export function startCheckpointThread({ path, everyMs = Number(process.env.SIFTER_CHECKPOINT_MS || 5000), synchronous = process.env.SQLITE_SYNCHRONOUS || 'NORMAL', onPassive = () => {}, onError = () => {} } = {}) {
  let worker, nextId = 1, stopped = false;
  const waiting = new Map();
  const stats = { passive: 0, passive_ms: 0, passive_max_ms: 0, last: null, restarts: 0 };
  const spawn = () => {
    worker = new Worker(fileURLToPath(import.meta.url), { workerData: { role: ROLE, path, everyMs, synchronous } });
    worker.unref();
    worker.on('message', (m) => {
      if (m.type === 'passive') { stats.passive++; stats.passive_ms += m.ms; stats.passive_max_ms = Math.max(stats.passive_max_ms, m.ms); stats.last = m; onPassive(m); }
      else if (m.type === 'reply') { waiting.get(m.id)?.(m); waiting.delete(m.id); }
    });
    worker.on('error', (err) => onError(err));
    worker.on('exit', () => {
      for (const done of waiting.values()) done({ error: 'checkpoint thread exited' });
      waiting.clear();
      if (!stopped) { stats.restarts++; setTimeout(() => { if (!stopped) spawn(); }, 10_000).unref?.(); }
    });
  };
  spawn();
  return {
    truncate: (busyMs = 3000) => new Promise((resolve) => { const id = nextId++; waiting.set(id, resolve); worker.postMessage({ cmd: 'truncate', id, busyMs }); }),
    stop: () => { stopped = true; worker.postMessage({ cmd: 'stop' }); },
    stats: () => ({ ...stats }),
  };
}
