// LONG WORK IS A JOB, NOT A REQUEST (docs/architecture/continuous-deploy.md; Chad 10-19: "rapidly iterate without breaking
// in-process work"). An Anís research answer takes 40–120 s: a synchronous request died at Cloudflare's ~125 s edge limit
// (524) and at every API reload. A job starts at once, runs in this process, and its state lives in a FILE (data/jobs/), so
// a poll answered by the next API instance still finds it; the API's shutdown waits for running jobs (drain()).
// Idempotent by key: starting a key that is running or done returns that job. A "running" record whose process is gone
// (pid dead on this host — a restart/kill) or older than MAX_RUNNING_MS is REAPED: rewritten as 'lost' with abandoned_at
// and logged (10-23: a killed 'bidi-test3' draft showed as running 8 h). Under vitest the default dir is a temp dir, so
// tests never write the production tracker. Deps: node:fs.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, hostname } from 'node:os';

export const MAX_RUNNING_MS = 30 * 60 * 1000;   // no job legitimately runs this long (research answers: 40–120 s)
const KEEP_MS = 3 * 24 * 3600 * 1000;
const running = new Map();          // key → promise (this process only)
const HOST = hostname();

const isTest = () => !!(process.env.VITEST || process.env.NODE_ENV === 'test');
let testDir = null;
const defaultDir = () => (isTest() ? (testDir ||= mkdtempSync(join(tmpdir(), 'sifter-jobs-test-'))) : join(process.cwd(), 'data', 'jobs'));

const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/** Why a "running" record is no longer running (null = it may be). Exported for tests. */
export function abandonReason(rec, now = Date.now()) {
  if (rec?.status !== 'running' || running.has(rec.key)) return null;
  if (now - rec.started_at > MAX_RUNNING_MS) return 'timeout';
  if (rec.pid === process.pid) return 'process-restarted';            // this pid, but not in this process's map
  if ((!rec.host || rec.host === HOST) && !pidAlive(rec.pid)) return 'process-gone';
  return null;
}

export function jobStore(dir = defaultDir()) {
  mkdirSync(dir, { recursive: true });
  const file = (key) => join(dir, `${String(key).replace(/[^\w.-]/g, '_')}.json`);
  const read = (key) => { try { return JSON.parse(readFileSync(file(key), 'utf8')); } catch { return null; } };
  const write = (key, rec) => { const f = file(key); writeFileSync(`${f}.tmp`, JSON.stringify(rec)); renameSync(`${f}.tmp`, f); };

  // a dead "running" record → 'lost', persisted and logged once (so every reader — get, active, the services list — agrees)
  const reap = (rec, now = Date.now()) => {
    const reason = abandonReason(rec, now);
    if (!reason) return rec;
    const lost = { ...rec, status: 'lost', abandoned_at: now, abandoned_reason: reason, error: rec.error || `abandoned (${reason})` };
    try { write(rec.key, lost); } catch { /* raced */ }
    console.warn(JSON.stringify({ job: rec.key, kind: rec.kind, abandoned: reason, running_s: Math.round((now - rec.started_at) / 1000) }));
    return lost;
  };

  /** → the job record { key, status: running|done|failed|lost, started_at, finished_at?, result?, error? }. */
  function get(key) {
    const rec = read(key);
    return rec?.status === 'running' ? reap(rec) : rec;
  }

  /** Every record still genuinely running (dead ones reaped on the way). */
  function active(now = Date.now()) {
    const out = [];
    let names = [];
    try { names = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return out; }
    for (const f of names) {
      let rec; try { rec = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
      if (rec?.status === 'running' && reap(rec, now).status === 'running') out.push(rec);
    }
    return out;
  }

  /** Start `fn` under `key` unless that key is already running or done. → the record (status running, or the finished one). */
  function start(key, fn, meta = {}) {
    const cur = get(key);
    if (cur && (cur.status === 'running' || cur.status === 'done')) return cur;
    const rec = { key, status: 'running', started_at: Date.now(), pid: process.pid, host: HOST, ...meta };
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
  return { get, start, prune, active, dir };
}

/** Jobs still running in this process. */
export const inFlight = () => running.size;
/** Shutdown: wait for this process's running jobs (bounded by the caller's budget). */
export async function drain(budgetMs = 280000) {
  const until = Date.now() + budgetMs;
  while (running.size && Date.now() < until) await Promise.race([Promise.allSettled([...running.values()]), new Promise((r) => setTimeout(r, 1000))]);
  return running.size;
}
