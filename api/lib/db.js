// better-sqlite3 Database Client
// Three separate databases: content (sifter.db), user, graph (graph.db).
// Exported function signatures are async for backward compatibility.

import { isMainThread } from 'worker_threads';
import os from 'os';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { runSiteMigrations } from './migrations/site.js';
import { isWriteSql } from './write-server.js';
import { isPowerReadOnly, PowerReadOnlyError } from './power-mode.js';

// Single-writer routing. When SIFTER_WRITER_URL is set, content-db WRITES are
// POSTed to the writer process (which owns the only write connection) instead
// of opening a local write txn — this is what kills multi-process lock
// contention. Reads always stay direct (WAL allows unlimited concurrent
// readers). The writer process itself sets SIFTER_IS_WRITER=1 so it writes
// directly and never calls itself. Unset = legacy direct-write (zero change).
// ON TOWER every non-writer process routes through the writer by DEFAULT (10-11): a process started without the env
// var (deep-research, the nightly audit, an ad-hoc script) wrote directly, took SQLite's file lock, and the writer's
// own queued writes then failed "database is locked". The queue only works if nothing bypasses it.
// SIFTER_DIRECT_WRITE=1 is the explicit escape hatch (writer down / maintenance).
const IS_WRITER = process.env.SIFTER_IS_WRITER === '1';
const ON_TOWER = os.hostname() === 'tower-nas';
const WRITER_URL = process.env.SIFTER_WRITER_URL
  || (ON_TOWER && !IS_WRITER && process.env.SIFTER_DIRECT_WRITE !== '1' ? 'http://127.0.0.1:7849' : null);
const ROUTE_WRITES = !!WRITER_URL && !IS_WRITER;
/** True when this process's writes go to the shared writer (so its reads and writes may be different databases). */
export const writesRouted = () => ROUTE_WRITES;

// A sustained run of write failures means the single writer is DOWN (deadlocked/crashed), not a one-off
// blip. Tracked process-wide so we can distinguish "one flaky write" (tolerated) from "the writer is gone".
let writeFailStreak = 0;
const WRITER_DOWN_STREAK = Number(process.env.SIFTER_WRITER_DOWN_STREAK || 8);

// POST a batch of {sql,args} to the writer; returns per-statement results.
// Fails loud — never silently falls back to a direct write (that would
// reintroduce the contention this whole mechanism exists to prevent).
// A dropped CONNECTION is not a failed write — it is a write that never got a verdict, and the commonest
// cause is mundane: the single writer restarted (every deploy does this), or an idle keep-alive socket was
// reaped between batches. Undici surfaces both as `fetch failed / UND_ERR_SOCKET: other side closed`.
// Without a retry, ONE such blip killed an entire book: complete-book.mjs is top-level `await runGrounding`,
// so the rejection escaped as an uncaught module-evaluation error, the process died before its first model
// call, and the queue recorded "did not reach verify" — six books, twice, with $0.00 of model spend
// (2026-08-13). Retrying is safe by the same property the 90s abort already relies on: writer transactions
// are atomic and pipeline resume is idempotent per paragraph, so a maybe-committed batch never duplicates.
// Only CONNECTION-level failures retry; an HTTP error from the writer is a real verdict and must not.
const TRANSIENT = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT']);
const isTransientWriteError = (e) => {
  const code = e?.cause?.code || e?.code;
  return TRANSIENT.has(code) || e?.name === 'TimeoutError' || /other side closed|socket hang up/i.test(e?.cause?.message || e?.message || '');
};
// who is writing: the pm2 app name, else the script file (write stats are grouped by it — db_write_stats)
const CALLER = process.env.SIFTER_CALLER || process.env.name || path.basename(process.argv[1] || 'node');
const WRITE_ATTEMPTS = Number(process.env.SIFTER_WRITE_ATTEMPTS || 4);

export async function postWriteBatch(statements, name = '', { db } = {}) {
  // Bounded write: a slow/stuck write aborts as a catchable TimeoutError instead of an uncaught undici
  // headers-timeout crashing a long grounding run. Safe — writer transactions are atomic and the pipeline's
  // resume is idempotent per paragraph, so an aborted-but-maybe-committed write never duplicates.
  // POWER READ-ONLY (UPS on battery, power-mode.js): refused here, before any network — never a 90 s wait. fatal, so a
  // stage aborts its unit at once and resumes from its checkpoint when mains is back.
  if (isPowerReadOnly()) throw Object.assign(new PowerReadOnlyError(name || 'write'), { fatal: true });
  try {
    let res, lastErr;
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      try {
        res = await fetch(`${WRITER_URL}/write`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-sifter-caller': CALLER },
          body: JSON.stringify(db ? { statements, name, db } : { statements, name }),
          signal: AbortSignal.timeout(90000),
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (!isTransientWriteError(e) || attempt === WRITE_ATTEMPTS) throw e;
        // Backoff covers a writer restart (pm2 brings it back in a few seconds), not a permanent outage.
        const waitMs = 500 * 2 ** (attempt - 1);
        logger.warn({ attempt, of: WRITE_ATTEMPTS, waitMs, name, err: e?.cause?.code || e.message },
          'writer connection dropped — retrying (writer restart or reaped keep-alive socket)');
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    if (lastErr) throw lastErr;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 503 && /read-only \(power\)/.test(detail)) throw Object.assign(new PowerReadOnlyError(name || 'write'), { fatal: true });
      throw new Error(`writer ${res.status}: ${detail.slice(0, 200)}`);
    }
    writeFailStreak = 0;
    return (await res.json()).results;
  } catch (e) {
    if (e?.readonly) throw e;   // power read-only is a verdict, not a writer outage — no streak
    // The grounding pool()/stages tolerate a LONE write failure (a writer restart on deploy) by dropping that
    // paragraph — resume refills it. But when the writer is fully DOWN, every write fails; without a signal the
    // stage keeps calling the model + dropping each write as "per-item flake" → silent no-op churn that wastes
    // spend and freezes the queue (the 2026-07-18 incident). After a streak of failures, tag the error FATAL so
    // the stage aborts the book fast → the queue's auto-retry requeues it once the writer is back.
    if (++writeFailStreak >= WRITER_DOWN_STREAK) e.fatal = true;
    throw e;
  }
}

let contentDb = null;
let userDb = null;
let graphDb = null;
let telemetryDb = null;
const siteDbCache = new Map();

function stripFilePrefix(url) {
  if (!url) return null;
  return url.startsWith('file:') ? url.slice(5) : url;
}

/** The content DB's file (symlinks resolved — on tower data/sifter.db → /fast/siftersearch-db/sifter.db). */
export function contentDbPath() {
  const p = stripFilePrefix(process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db') || './data/sifter.db';
  try { return realpathSync(p); } catch { return p; }
}

function createContentConnection() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url) || './data/sifter.db';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  // API default: 200ms — fail fast. A 5s block freezes the event loop under concurrent
  // load (10 searches × 5s = all requests hang). Workers override this via ecosystem.config.cjs
  // SQLITE_BUSY_TIMEOUT_MS=30000 to survive write contention from graph pipeline workers.
  const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || '200', 10);
  db.pragma(`busy_timeout = ${busyTimeout}`);
  // synchronous=NORMAL is the standard, safe choice in WAL mode: it fsyncs only at
  // checkpoint (not on every commit), avoiding ~4x write overhead vs FULL. Durability:
  // a power/OS crash can lose the last transaction(s) since the prior checkpoint, but
  // NOT corrupt the DB and NOT lose committed data on a mere app crash — acceptable for
  // this content DB. Benchmarked ~4x faster writes on this pool. Override w/ SQLITE_SYNCHRONOUS.
  db.pragma(`synchronous = ${process.env.SQLITE_SYNCHRONOUS || 'NORMAL'}`);
  // Bump page cache. Default 2MB is far too small for the content table indexes.
  // SQLITE_CACHE_MB overrides the default — set to a lower value (e.g. 64) for
  // memory-constrained processes like library-watcher (512MB cache + 1GB mmap
  // caused RSS to reach 3G in <5 minutes, triggering OOM restart loops).
  const cacheMb = parseInt(process.env.SQLITE_CACHE_MB || '512', 10);
  db.pragma(`cache_size = ${-cacheMb * 1024}`);  // negative = KiB
  const mmapMb = parseInt(process.env.SQLITE_MMAP_MB || '1024', 10);
  db.pragma(`mmap_size = ${mmapMb * 1024 * 1024}`);
  applyRamPragmas(db);
  logger.info({ path, pragmas: pragmaSnapshot(db) }, 'Content DB connected (local)');
  return instrumentDb(db, 'content');
}

// RAM-leaning settings (db-write-path-20261023; Chad 10-23: ECC + UPS, literature not banking — trade a bounded window for
// throughput). Sorts/temp indexes in RAM everywhere. On the WRITER only: the WAL may grow to SQLITE_WAL_AUTOCHECKPOINT
// pages before a commit checkpoints inline (the checkpoint thread copies it every few seconds off the write path), and a
// reset WAL is truncated to SQLITE_JOURNAL_LIMIT_MB. synchronous comes from SQLITE_SYNCHRONOUS (the writer runs OFF on ZFS:
// txgs are atomic and ordered, so a crash loses ≤ one txg — zfs_txg_timeout 10 s — and never corrupts).
export function applyRamPragmas(db, { writer = IS_WRITER } = {}) {
  db.pragma(`temp_store = ${process.env.SQLITE_TEMP_STORE || 'MEMORY'}`);
  if (writer) {
    db.pragma(`wal_autocheckpoint = ${parseInt(process.env.SQLITE_WAL_AUTOCHECKPOINT || '20000', 10)}`);
    db.pragma(`journal_size_limit = ${parseInt(process.env.SQLITE_JOURNAL_LIMIT_MB || '256', 10) * 1024 * 1024}`);
  }
}
/** The settings a connection actually runs with (logged at open; tested). */
export function pragmaSnapshot(db) {
  const one = (p) => { try { return db.pragma(p, { simple: true }); } catch { return null; } };
  return { journal_mode: one('journal_mode'), synchronous: one('synchronous'), cache_size: one('cache_size'), mmap_size: one('mmap_size'),
    temp_store: one('temp_store'), wal_autocheckpoint: one('wal_autocheckpoint'), journal_size_limit: one('journal_size_limit'), busy_timeout: one('busy_timeout') };
}

function createUserConnection() {
  const url = process.env.USER_DATABASE_URL;
  if (!url) {
    logger.info('User DB: No USER_DATABASE_URL configured, using content DB');
    return null;
  }
  const path = stripFilePrefix(url);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  logger.info({ path }, 'User DB connected');
  return instrumentDb(db, 'user');
}

function createGraphConnection() {
  const dbPath = './data/graph.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  db.pragma('cache_size = -131072');  // 128MB in KiB
  db.pragma('mmap_size = 268435456'); // 256MB
  logger.info({ path: dbPath }, 'Graph DB connected');
  return instrumentDb(db, 'graph');
}

export async function getDb() {
  if (!contentDb) contentDb = createContentConnection();
  return contentDb;
}

export async function getUserDb() {
  if (userDb === null) userDb = createUserConnection();
  return userDb || await getDb();
}

export async function getGraphDb() {
  if (!graphDb) graphDb = createGraphConnection();
  return graphDb;
}

// Site-only DBs: one SQLite file per site at data/sites/<safe-id>.db.
// Walled off from primary — default Jafar never opens these connections, so
// site-only content cannot leak into RAG. Connections are lazy and cached;
// migrations run once on first connect.
//
// `siteId` is the sites.yaml key (e.g., 'bahaiteachings.org'). The filename
// uses `meili_index_prefix` from the site config (e.g., 'bt') if available,
// otherwise the sanitized siteId.
export async function getSiteDb(siteId, indexPrefix) {
  if (!siteId) throw new Error('getSiteDb requires siteId');
  const key = indexPrefix || siteId;
  let db = siteDbCache.get(key);
  if (db) return db;

  const safe = (indexPrefix || siteId).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  const dir = path.resolve('./data/sites');
  mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, `${safe}.db`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  // Smaller cache than primary — site-only DBs are <500MB each; 64MB cache
  // leaves room for many concurrent sites without consuming primary's headroom.
  db.pragma('cache_size = -65536');
  db.pragma('mmap_size = 268435456');

  instrumentDb(db, `site-${safe}`);
  runSiteMigrations(db, siteId);

  siteDbCache.set(key, db);
  logger.info({ siteId, path: dbPath }, 'Site DB connected');
  return db;
}

// Telemetry DB: separate connection with a 50ms busy timeout.
// Used exclusively for fire-and-forget writes (ai_usage, search_log) that must
// never block the event loop. If contended (e.g., sync worker holding WAL lock),
// the write fails quickly and is silently dropped — telemetry is best-effort.
function getTelemetryDb() {
  if (!telemetryDb) {
    const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
    const dbPath = stripFilePrefix(url) || './data/sifter.db';
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 50');  // 50ms: fail fast if contended — never stall event loop, but tolerate brief WAL lock windows
    db.pragma('cache_size = -4096'); // 4MB — minimal cache, telemetry is write-only
    telemetryDb = db;  // not instrumented — avoids recursive slow-write logging
  }
  return telemetryDb;
}

export const getBatchDb = getDb;

// 150ms threshold surfaces actually-slow queries. Set SLOW_QUERY_THRESHOLD_MS
// to tune. All SELECT reads are also logged at debug level so LOG_LEVEL=debug
// exposes every read with its duration for index analysis.
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '150', 10);
// A CTE is a READ. This matched only /^SELECT/, so every `WITH ... SELECT` was filed as a write — which
// mislabelled the alert email ("worst 55.0s write" for a SELECT) and, far worse, suppressed the query plan:
// plan capture is gated on isSelect, so the one query we most needed to understand never recorded one. Two
// rounds of guessing about that query followed, both wrong, and EXPLAIN answered it in a minute once it was
// available. SQLite does allow data-modifying CTEs (WITH ... INSERT/UPDATE/DELETE), so those stay writes.
const WITH_WRITE = /^\s*WITH\b[\s\S]*?\b(INSERT|UPDATE|DELETE)\b/i;
const IS_SELECT = /^\s*(SELECT|WITH)\b/i;
const IS_WRITE = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH)\b/i;


// ── Slow-query recording ───────────────────────────────────────────────────────────────────────────
// Timing every query is only half a detector; the other half is somewhere for the signal to GO. It used
// to go to a log line and nowhere else, so a 61-second writer-blocking UPDATE looked exactly like a 151ms
// read and sat unread in a 629MB file while it stalled the single writer on every boot (2026-08-13).
//
// Recorded via the telemetry connection: uninstrumented (no recursive slow-write logging), 50ms busy
// timeout, best-effort. Recording a slow query must never itself become a slow query, and must never
// break the query that triggered it — so every failure here is swallowed.
//
// Two thresholds, because they answer different questions:
//   SLOW_QUERY_THRESHOLD_MS (150ms)  — "worth a log line"; too chatty to store.
//   SLOW_QUERY_RECORD_MS   (1000ms)  — "worth remembering"; these are the ones that hurt.
//   BLOCKING_QUERY_MS      (5000ms)  — better-sqlite3 is SYNCHRONOUS, so a write this slow has frozen
//                                      this process's event loop for that long. On the worker that means
//                                      /write and /health stopped answering and callers' sockets closed.
//                                      Logged at ERROR so it is greppable and alertable, not a warning
//                                      among thousands.
const SLOW_QUERY_RECORD_MS = parseInt(process.env.SLOW_QUERY_RECORD_MS || '1000', 10);
const BLOCKING_QUERY_MS = parseInt(process.env.BLOCKING_QUERY_MS || '5000', 10);

// Which process is blocking. pm2 sets name; scripts fall back to their filename.
// A WORKER THREAD's queries are tagged '<proc>/thread': they are slow but cannot freeze the process's event loop (the
// roadmap's 6 s reads ran off-thread yet read as "blocking in api" — 10-17). Only main-thread rows are freezes.
const PROC_NAME = (process.env.pm_id !== undefined && process.env.name
  ? String(process.env.name).replace(/^siftersearch-/, '')
  : (process.env.SIFTER_PROC || (process.argv[1] || 'node').split('/').pop())) + (isMainThread ? '' : '/thread');

/** Statement SHAPE — literals, IN-lists and whitespace stripped so repeats of one query aggregate. */
export function fingerprintSql(sql) {
  return String(sql || '')
    .replace(/\s+/g, ' ')
    .replace(/'[^']*'/g, '?')            // string literals
    .replace(/\b\d+\b/g, '?')            // numeric literals
    .replace(/\?(\s*,\s*\?)+/g, '?')     // collapsed placeholder lists
    .trim()
    .slice(0, 300);
}


// ── Total query-time accounting ────────────────────────────────────────────────────────────────────
// slow_query_log answers "what froze the process". It cannot answer "where does the time GO", because it
// only stores outliers: a 200ms query run 10,000×/day costs 33 minutes and never appears. Both shapes have
// hurt this system — a 152s snapshot scan AND a 1.3s budget check on a 20s tick — so every query is counted.
//
// Counters live in memory (O(1) per query, no I/O) and flush on a timer as one upsert per distinct shape,
// so the instrument cannot become the thing it measures. Bucketed by hour so the table stays small and the
// history is trendable — "which stage got slower this week" is answerable, not just "what is slow now".
const QSTATS_FLUSH_MS = Number(process.env.QUERY_STATS_FLUSH_MS || 60000);
const QSTATS_MAX_SHAPES = 2000;        // runaway guard: distinct shapes are bounded in practice
const qstats = new Map();
let qstatsOverflow = 0;

function accrueQueryTime(sql, duration, dbName, kind, name) {
  const hour = Math.floor(Date.now() / 3600000) * 3600;
  const fp = fingerprintSql(sql);
  // Key on the NAME when the call site gave one: that is the unit a human reasons about ("budget-check"),
  // and it keeps one logical query together even if its SQL is built in variants.
  const key = `${hour}|${kind}|${name || fp}`;
  let e = qstats.get(key);
  if (!e) {
    // Never let the accounting grow without bound; overflow is COUNTED, not silently dropped, so the
    // report can say it is incomplete rather than quietly under-reporting.
    if (qstats.size >= QSTATS_MAX_SHAPES) { qstatsOverflow++; return; }
    e = { hour, kind, fp, name: name || null, dbName, n: 0, total: 0, max: 0, sample: String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
    qstats.set(key, e);
  }
  e.n++; e.total += duration; if (duration > e.max) e.max = duration;
}

export function flushQueryStats() {
  if (!qstats.size) return 0;
  const rows = [...qstats.values()];
  qstats.clear();
  let written = 0;
  for (const e of rows) {
    try {
      // Conflict on LABEL — the same key the in-memory counters use. Keying the table on `fingerprint`
      // while keying memory on `name` merged distinct query types into one row (migration 113).
      telemetryQuery(
        `INSERT INTO query_stats (hour, proc, db_name, kind, label, name, fingerprint, n, total_ms, max_ms, sql_sample)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(hour, proc, kind, label) DO UPDATE SET
           n = n + excluded.n, total_ms = total_ms + excluded.total_ms,
           max_ms = MAX(max_ms, excluded.max_ms)`,
        [e.hour, PROC_NAME, e.dbName || null, e.kind, e.name || e.fp, e.name, e.fp,
          e.n, Math.round(e.total), Math.round(e.max), e.sample]);
      written++;
    } catch { /* best-effort: table may predate migration 111, or the DB is briefly contended */ }
  }
  if (qstatsOverflow) { logger.warn({ dropped: qstatsOverflow, cap: QSTATS_MAX_SHAPES }, 'query-stats: shape cap hit — accounting incomplete this window'); qstatsOverflow = 0; }
  return written;
}

// unref'd so this timer never holds a short-lived script open; scripts also flush on exit below.
const qstatsTimer = setInterval(flushQueryStats, QSTATS_FLUSH_MS);
if (typeof qstatsTimer.unref === 'function') qstatsTimer.unref();
process.on('exit', () => { try { flushQueryStats(); } catch { /* shutting down */ } });

function recordSlowQuery({ sql, duration, dbName, kind, name, queryPlan }) {
  if (duration < SLOW_QUERY_RECORD_MS) return;
  try {
    telemetryQuery(
      `INSERT INTO slow_query_log (proc, db_name, kind, duration_ms, fingerprint, sql_sample, query_plan, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [PROC_NAME, dbName || null, kind, duration, fingerprintSql(sql),
        String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 400), queryPlan || null, name || null]
    );
  } catch { /* table may predate the migration, or the DB is contended — telemetry is best-effort */ }
}

// Name of the query currently being executed via query()/userQuery()/graphQuery(), consumed by the
// statement wrapper so a query is recorded exactly once, with its name. Empty for direct db.prepare use.
let pendingName = '';
const withName = (name, fn) => { pendingName = name || ''; try { return fn(); } finally { pendingName = ''; } };

// origPrepare is the unwrapped db.prepare — used for EXPLAIN so we don't recurse.
function logQueryTiming(sql, params, startTime, dbName, name = '', origPrepare = null) {
  const duration = Date.now() - startTime;
  const isSelect = IS_SELECT.test(sql) && !WITH_WRITE.test(sql);
  const shortSql = (sql || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const logParams = params?.length > 5 ? `[${params.length} params]` : params;

  // EVERY query is accounted for, regardless of duration — that is the point (see accrueQueryTime).
  accrueQueryTime(sql, duration, dbName, isSelect ? 'read' : 'write', name);

  // All reads visible at debug level — filter with LOG_LEVEL=debug to see index usage
  if (isSelect) {
    logger.debug({ name, duration, sql: shortSql, db: dbName }, `read ${duration}ms`);
  }

  if (duration >= SLOW_QUERY_THRESHOLD_MS) {
    let queryPlan = null;
    if (isSelect && origPrepare) {
      try {
        const plan = origPrepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params || []));
        queryPlan = plan.map(r => r.detail).join(' | ');
      } catch { /* non-fatal — EXPLAIN may fail on complex CTEs */ }
    }
    const kind = isSelect ? 'read' : 'write';
    const blocking = duration >= BLOCKING_QUERY_MS;
    const fields = { name, duration, sql: shortSql, params: logParams, db: dbName, queryPlan, proc: PROC_NAME };
    if (blocking) {
      // better-sqlite3 is synchronous: this process served NOTHING for `duration` ms. Say so plainly.
      logger.error(fields,
        `BLOCKING ${kind} (${duration}ms) — ${PROC_NAME} event loop frozen${name ? ` [${name}]` : ''}`);
    } else {
      logger.warn(fields, `Slow ${kind} (${duration}ms)${name ? ` [${name}]` : ''}`);
    }
    recordSlowQuery({ sql, duration, dbName, kind, name, queryPlan });
  }
}

// Instrument a better-sqlite3 Database instance so every prepare/transaction/exec
// is timed against SLOW_QUERY_THRESHOLD_MS. This is the single source of truth
// for slow-query visibility across the codebase: any module that calls getDb()
// (or wraps a sidecar connection via instrumentDb) gets free coverage.
//
// Statements are mutated in place — pluck()/raw()/expand() return `this`, so
// chained calls keep the instrumented methods. Transactions are timed at the
// batch level (individual statements inside a txn are also timed via prepare).
export function instrumentDb(db, dbName) {
  if (db.__instrumented) return db;

  const origPrepare = db.prepare.bind(db);
  // The statement wrapper is the ONE place a query is recorded. query()/userQuery()/graphQuery() used to log
  // as well, so every named query was counted TWICE — once with its name and once without — inflating every
  // total by 2x and splitting each query across two report lines (caught 2026-08-13: 'budget-check' x304 and
  // an identical '(unnamed)' x304). The caller's name is handed over in `pendingName` instead. Safe because
  // better-sqlite3 is synchronous: prepare+run complete with no await between set and consume.
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    for (const method of ['get', 'all', 'run']) {
      const orig = stmt[method].bind(stmt);
      stmt[method] = (...args) => {
        const start = Date.now();
        const result = orig(...args);
        logQueryTiming(sql, args, start, dbName, pendingName, origPrepare);
        return result;
      };
    }
    return stmt;
  };

  const origTransaction = db.transaction.bind(db);
  db.transaction = (fn) => {
    const txn = origTransaction(fn);
    const wrap = (mode) => (...args) => {
      const start = Date.now();
      const result = (mode ? txn[mode] : txn)(...args);
      logQueryTiming(`TRANSACTION${mode ? ` (${mode})` : ''}`, null, start, dbName);
      return result;
    };
    const wrapped = wrap();
    wrapped.deferred = wrap('deferred');
    wrapped.immediate = wrap('immediate');
    wrapped.exclusive = wrap('exclusive');
    return wrapped;
  };

  const origExec = db.exec.bind(db);
  db.exec = (sql) => {
    const start = Date.now();
    const result = origExec(sql);
    logQueryTiming(sql, null, start, dbName);
    return result;
  };

  Object.defineProperty(db, '__instrumented', { value: true, enumerable: false });
  Object.defineProperty(db, '__origPrepare', { value: origPrepare, enumerable: false });
  return db;
}

function runQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(sql);
  if (isWrite) {
    const info = stmt.run(...params);
    return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }], lastInsertRowid: info.lastInsertRowid };
  }
  return { rows: stmt.all(...params) };
}

export async function query(sql, params = [], name = '') {
  // Route content writes through the single writer when configured.
  if (ROUTE_WRITES && isWriteSql(sql)) {
    const [r] = await postWriteBatch([{ sql, args: params }], name);
    return { rows: [{ lastInsertRowid: r.lastInsertRowid, changes: r.changes }], lastInsertRowid: r.lastInsertRowid };
  }
  const db = await getDb();
  const start = Date.now();
  const result = withName(name, () => runQuery(db, sql, params));
  return result;
}

export async function queryOne(sql, params = [], name = '') {
  const result = await query(sql, params, name);
  return result.rows[0] || null;
}

export async function queryAll(sql, params = [], name = '') {
  const result = await query(sql, params, name);
  return result.rows;
}

export async function transaction(statements, name = '') {
  // Route the whole batch through the single writer when configured — it
  // applies them as one atomic transaction on the sole write connection.
  if (ROUTE_WRITES) return postWriteBatch(statements, name);
  const db = await getDb();
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'content', name);
  return result;
}

// With no USER_DATABASE_URL the "user DB" IS the content DB, so a user-table write must take the same road as any content
// write — through the single writer. It wrote directly instead: `INSERT INTO search_log` from siftersearch-api waited
// 5.5 s on the file lock with the event loop frozen (10-23).
const userIsContent = (db) => ROUTE_WRITES && db === contentDb;

export async function userQuery(sql, params = [], name = '') {
  const db = await getUserDb();
  if (userIsContent(db)) return query(sql, params, name);
  const start = Date.now();
  const result = withName(name, () => runQuery(db, sql, params));
  return result;
}

export async function userQueryOne(sql, params = [], name = '') {
  const result = await userQuery(sql, params, name);
  return result.rows[0] || null;
}

export async function userQueryAll(sql, params = [], name = '') {
  const result = await userQuery(sql, params, name);
  return result.rows;
}

export async function userTransaction(statements, name = '') {
  const db = await getUserDb();
  if (userIsContent(db)) return transaction(statements, name);
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'user', name);
  return result;
}

export async function graphQuery(sql, params = [], name = '') {
  const db = await getGraphDb();
  const start = Date.now();
  const result = withName(name, () => runQuery(db, sql, params));
  return result;
}

export async function graphQueryOne(sql, params = [], name = '') {
  const result = await graphQuery(sql, params, name);
  return result.rows[0] || null;
}

export async function graphQueryAll(sql, params = [], name = '') {
  const result = await graphQuery(sql, params, name);
  return result.rows;
}

export async function graphTransaction(statements, name = '') {
  const db = await getGraphDb();
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'graph', name);
  return result;
}

export const batchQuery = query;
export const batchTransaction = transaction;
export const batchQueryOne = queryOne;
export const batchQueryAll = queryAll;

// ── TELEMETRY STORE (db-write-path-20261023) ─────────────────────────────────────────────────────────────────────────────
// query_stats, slow_query_log and db_write_stats are high-volume, low-value, append/upsert-only: they live in their OWN
// SQLite file (telemetry.db, next to sifter.db — same ZFS dataset, so db-ship snapshots it too). Content writes never
// share a B-tree page, a WAL frame or a checkpoint with them. Writes still go through the single writer ({db:'telemetry'}
// in the /write body), which owns this file's only write connection; any process READS it (telemetryAll / telemetryOne).
// The writer creates the tables from sifter.db's own DDL and imports recent history once (ensureTelemetryStore).
export const TELEMETRY_TABLES = ['query_stats', 'slow_query_log', 'db_write_stats'];
const TELEMETRY_WRITE_RE = new RegExp(`^\\s*(?:INSERT(?:\\s+OR\\s+\\w+)?\\s+INTO|REPLACE\\s+INTO|UPDATE(?:\\s+OR\\s+\\w+)?|DELETE\\s+FROM)\\s+["\`]?(${TELEMETRY_TABLES.join('|')})\\b`, 'i');
/** This write belongs to the telemetry store. */
export const isTelemetryStoreSql = (sql) => TELEMETRY_WRITE_RE.test(String(sql || ''));
export function telemetryStorePath() {
  if (process.env.SIFTER_TELEMETRY_DB) return process.env.SIFTER_TELEMETRY_DB;
  const content = stripFilePrefix(process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db') || './data/sifter.db';
  let real = content;
  try { real = realpathSync(content); } catch { /* not created yet */ }
  return path.join(path.dirname(real), 'telemetry.db');
}
let telStore = null;
/** The telemetry store connection (null when it does not exist yet and create is false). Uninstrumented: a slow
 *  telemetry write must never record itself as telemetry. */
export function getTelemetryStore({ create = false } = {}) {
  if (telStore) return telStore;
  const p = telemetryStorePath();
  if (!create && !existsSync(p)) return null;
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');
  db.pragma(`synchronous = ${process.env.SIFTER_TELEMETRY_SYNCHRONOUS || 'OFF'}`);   // low value; ZFS txg bounds the loss
  db.pragma('cache_size = -65536');
  db.pragma('temp_store = MEMORY');
  telStore = db;
  return db;
}
/** Create the telemetry tables + indexes from the content DB's own DDL (exactly production's shape). Idempotent. */
export function ensureTelemetrySchema(tel, content) {
  tel.exec('CREATE TABLE IF NOT EXISTS telemetry_meta (k TEXT PRIMARY KEY, v TEXT)');
  const have = new Set(tel.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name));
  const ddl = content.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name IN (${TELEMETRY_TABLES.map(() => '?').join(',')})
    AND sql IS NOT NULL ORDER BY type = 'table' DESC`).all(...TELEMETRY_TABLES);
  for (const o of ddl) {
    if (o.type === 'table' && have.has(o.name)) continue;
    if (o.type === 'trigger') continue;   // none today; a trigger would need its own review before moving
    tel.exec(String(o.sql).replace(/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+(?!IF NOT EXISTS)/i, (m, u, k) => `CREATE ${u || ''}${k} IF NOT EXISTS `));
  }
  return TELEMETRY_TABLES.filter((t) => !have.has(t) && ddl.some((o) => o.name === t));
}
// recent history only: these tables answer "the last day or two"; older rows stay readable in sifter.db until dropped
const IMPORT_SINCE = { query_stats: (now) => ['hour >= ?', Math.floor(now / 1000) - 7 * 86400],
  slow_query_log: (now) => ['at >= ?', Math.floor(now / 1000) - 14 * 86400],
  db_write_stats: (now) => ['minute >= ?', new Date(now - 7 * 86400000).toISOString().slice(0, 16)] };
/** Copy recent rows of each table from sifter.db once (marker in telemetry_meta), in chunks with a yield between them so
 *  the writer keeps serving. Buckets that exist on both sides (the hour/minute of the switch) are ADDED, not replaced. */
export async function importTelemetryHistory(tel, content, { now = Date.now(), chunk = 5000, pause = () => new Promise((r) => setImmediate(r)) } = {}) {
  const done = {};
  for (const t of TELEMETRY_TABLES) {
    if (tel.prepare('SELECT v FROM telemetry_meta WHERE k = ?').get(`imported:${t}`)) continue;
    let exists = true;
    try { content.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get(); } catch { exists = false; }
    if (!exists) { tel.prepare('INSERT OR REPLACE INTO telemetry_meta VALUES (?, ?)').run(`imported:${t}`, 'absent'); continue; }
    const cols = content.prepare(`SELECT name FROM pragma_table_info(?)`).all(t).map((c) => c.name).filter((c) => !(t === 'slow_query_log' && c === 'id'));
    const telCols = new Set(tel.prepare(`SELECT name FROM pragma_table_info(?)`).all(t).map((c) => c.name));
    const use = cols.filter((c) => telCols.has(c));
    const q = use.map((c) => `"${c}"`).join(', ');
    const upsert = t === 'query_stats' ? ' ON CONFLICT(hour, proc, kind, label) DO UPDATE SET n = n + excluded.n, total_ms = total_ms + excluded.total_ms, max_ms = MAX(max_ms, excluded.max_ms)'
      : t === 'db_write_stats' ? ' ON CONFLICT(minute, caller, name) DO UPDATE SET batches = batches + excluded.batches, statements = statements + excluded.statements, changes = changes + excluded.changes, errors = errors + excluded.errors, ms_total = ms_total + excluded.ms_total, ms_max = MAX(ms_max, excluded.ms_max)' : '';
    const ins = tel.prepare(`INSERT INTO ${t} (${q}) VALUES (${use.map(() => '?').join(', ')})${upsert}`);
    const [where, since] = IMPORT_SINCE[t](now);
    let n = 0;
    try {
      // start at the window's first rowid (found through the time index), so no page walks years of old rows
      let last = (content.prepare(`SELECT MIN(rowid) AS r FROM ${t} WHERE ${where}`).get(since)?.r ?? 1) - 1;
      const page = content.prepare(`SELECT rowid AS _r, ${q} FROM ${t} WHERE rowid > ? AND ${where} ORDER BY rowid LIMIT ?`);
      for (;;) {
        const rows = page.all(last, since, chunk);
        if (!rows.length) break;
        tel.transaction(() => { for (const r of rows) ins.run(...use.map((c) => r[c])); })();
        last = rows.at(-1)._r; n += rows.length;
        await pause();
      }
    } catch (err) { logger.warn({ table: t, err: err.message, imported: n }, 'telemetry store: history import of a table stopped'); }
    tel.prepare('INSERT OR REPLACE INTO telemetry_meta VALUES (?, ?)').run(`imported:${t}`, String(n));
    done[t] = n;
  }
  return done;
}
/** Writer start: open (create) the store, create the tables, import recent history in the background. */
export async function ensureTelemetryStore() {
  const tel = getTelemetryStore({ create: true });
  const content = await getDb();
  const created = ensureTelemetrySchema(tel, content);
  importTelemetryHistory(tel, content).then((done) => logger.info({ created, imported: done, path: telemetryStorePath() }, 'telemetry store ready'))
    .catch((err) => logger.warn({ err: err.message }, 'telemetry store: history import failed (new rows still land)'));
  return tel;
}
/** Read the telemetry store (any process). A store not yet created, or a table not yet there, reads as empty. */
export async function telemetryAll(sql, params = [], name = '') {
  const db = getTelemetryStore();
  if (!db) return [];
  const t0 = Date.now();
  try { return db.prepare(sql).all(...params); } catch (e) { if (/no such table/i.test(e.message)) return []; throw e; } finally { accrueQueryTime(sql, Date.now() - t0, 'telemetry', 'read', name); }
}
export async function telemetryOne(sql, params = [], name = '') { return (await telemetryAll(sql, params, name))[0] || null; }

/** Telemetry rows batched to the writer: push() queues, a batch goes when `max` rows wait or `delayMs` after the first.
 *  Fire-and-forget — a failed batch is logged, never thrown into the caller. Rows for the telemetry store and rows for
 *  the content DB (ai_usage: the spend ledger stays with content) go as two posts. While power is READ-ONLY rows are
 *  dropped (counted), never queued behind a refused writer. Pure over `post`, so it is testable. */
export function createTelemetryQueue(post, { max = 200, delayMs = 2000, readOnly = () => isPowerReadOnly() } = {}) {
  const buf = [];
  let timer = null, dropped = 0;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const batch = buf.splice(0, buf.length);
    if (!batch.length) return Promise.resolve(0);
    if (readOnly()) { dropped += batch.length; return Promise.resolve(0); }
    const store = batch.filter((s) => isTelemetryStoreSql(s.sql)), content = batch.filter((s) => !isTelemetryStoreSql(s.sql));
    const send = (rows, opts) => (rows.length ? Promise.resolve().then(() => post(rows, 'telemetry', opts))
      .then(() => rows.length, (e) => { logger.warn({ err: e.message, rows: rows.length }, 'telemetry batch dropped'); return 0; }) : 0);
    return Promise.all([send(content), send(store, { db: 'telemetry' })]).then(([a, b]) => a + b);
  };
  const push = (sql, args) => {
    buf.push({ sql, args });
    if (buf.length >= max) flush();
    else if (!timer) { timer = setTimeout(flush, delayMs); timer.unref?.(); }
  };
  return { push, flush, pending: () => buf.length, dropped: () => dropped };
}
const telemetryQueue = createTelemetryQueue((statements, name, opts) => postWriteBatch(statements, name, opts));
process.once('beforeExit', () => { telemetryQueue.flush(); });

// ai_usage rows. In a process whose writes are ROUTED they go to the writer in batches: the direct 50 ms-busy connection
// below lost them whenever the writer held the lock — 87,495 usage rows from background runs on 10-13 alone, so the
// spend ledger (and the budget gate reading it) undercounted grounding and concept spend.
// Unrouted (the writer itself, dev): the telemetry store's tables go to its own connection, the rest as before.
export function telemetryQuery(sql, params = []) {
  if (ROUTE_WRITES) return telemetryQueue.push(sql, params);
  if (isPowerReadOnly()) return;
  if (isTelemetryStoreSql(sql)) {
    const tel = getTelemetryStore({ create: true });
    try { tel.prepare(sql).run(...params); } catch (e) {
      if (!/no such table/i.test(e.message) || !contentDb) throw e;
      ensureTelemetrySchema(tel, contentDb); tel.prepare(sql).run(...params);
    }
    return;
  }
  const db = getTelemetryDb();
  db.prepare(sql).run(...params);
}

export default {
  getDb, getUserDb, getBatchDb, getGraphDb,
  query, queryOne, queryAll,
  batchQuery, batchQueryOne, batchQueryAll,
  transaction, batchTransaction,
  userQuery, userQueryOne, userQueryAll, userTransaction,
  graphQuery, graphQueryOne, graphQueryAll, graphTransaction,
  telemetryQuery
};
