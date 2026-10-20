// LONG WORK IS A JOB, NOT A REQUEST (docs/architecture/continuous-deploy.md; Chad 10-19: "rapidly iterate without breaking
// in-process work"). An Anís research answer takes 40–120 s: a synchronous request died at Cloudflare's ~125 s edge limit
// (524) and at every API reload. A job starts at once, runs in this process, and its state lives in a FILE (data/jobs/), so
// a poll answered by the next API instance still finds it; the API's shutdown waits for running jobs (drain()).
// Idempotent by key: starting a key that is running or done returns that job. Deps: node:fs.
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const STALE_MS = 15 * 60 * 1000;   // "running" this long = the process that ran it was killed
const KEEP_MS = 3 * 24 * 3600 * 1000;
const running = new Map();          // key → promise (this process only)

export function jobStore(dir = join(process.cwd(), 'data', 'jobs')) {
  mkdirSync(dir, { recursive: true });
  const file = (key) => join(dir, `${String(key).replace(/[^\w.-]/g, '_')}.json`);
  const read = (key) => { try { return JSON.parse(readFileSync(file(key), 'utf8')); } catch { return null; } };
  const write = (key, rec) => { const f = file(key); writeFileSync(`${f}.tmp`, JSON.stringify(rec)); renameSync(`${f}.tmp`, f); };

  /** → the job record { key, status: running|done|failed|lost, started_at, finished_at?, result?, error? }. */
  function get(key) {
    const rec = read(key);
    if (rec?.status === 'running' && !running.has(key) && Date.now() - rec.started_at > STALE_MS) return { ...rec, status: 'lost' };
    return rec;
  }

  /** Start `fn` under `key` unless that key is already running or done. → the record (status running, or the finished one). */
  function start(key, fn, meta = {}) {
    const cur = get(key);
    if (cur && (cur.status === 'running' || cur.status === 'done')) return cur;
    const rec = { key, status: 'running', started_at: Date.now(), pid: process.pid, ...meta };
    write(key, rec);
    const p = Promise.resolve().then(fn)
      .then((result) => write(key, { ...rec, status: 'done', finished_at: Date.now(), result }))
      // the STACK too: a bare "Request timed out." (10-19) did not say which call
      .catch((err) => { console.error(JSON.stringify({ job: key, failed: String(err?.message || err).slice(0, 300), stack: String(err?.stack || '').slice(0, 1500) }));
        write(key, { ...rec, status: 'failed', finished_at: Date.now(), error: String(err?.message || err).slice(0, 500), stack: String(err?.stack || '').slice(0, 1500) }); })
      .finally(() => running.delete(key));
    running.set(key, p);
    return rec;
  }

  /** Old finished records out (called opportunistically). */
  function prune(now = Date.now()) {
    for (const f of readdirSync(dir)) {
      try { if (now - statSync(join(dir, f)).mtimeMs > KEEP_MS) unlinkSync(join(dir, f)); } catch { /* raced */ }
    }
  }
  return { get, start, prune, dir };
}

/** Jobs still running in this process. */
export const inFlight = () => running.size;
/** Shutdown: wait for this process's running jobs (bounded by the caller's budget). */
export async function drain(budgetMs = 280000) {
  const until = Date.now() + budgetMs;
  while (running.size && Date.now() < until) await Promise.race([Promise.allSettled([...running.values()]), new Promise((r) => setTimeout(r, 1000))]);
  return running.size;
}
