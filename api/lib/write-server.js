// :arch: single-writer core — applies batched write statements through ONE db connection in one atomic transaction.
// :why: eliminates multi-process SQLite write-lock contention. All writers POST batches here instead of opening their own write txns.
// :deps: a better-sqlite3 db handle (from db.js getDb) | consumers: unified-worker HTTP /write endpoint, write-client in db.js
// :rules: every batch = one transaction (all-or-nothing). Synchronous: better-sqlite3 serializes on the single Node thread, so concurrent HTTP writes can't interleave mid-transaction.
// :edge: a throwing statement rolls back the WHOLE batch — callers must not assume partial application.
// GROUP COMMIT (db-write-path-20261023): createGroupCommitter() coalesces the requests that arrive within a few ms into ONE
// SQLite transaction; each request runs in its own SAVEPOINT (a nested better-sqlite3 transaction), so a failing request
// rolls back alone and the others commit. Hot pages (indexes, stats rows) reach the WAL once per group, not per request.
// Statements are prepared once per connection (LRU) instead of per call.

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH|REPLACE)\b/i;

// True when sql mutates state. Mirrors the runQuery detector in db.js so the
// write-client can decide whether to route a statement to the writer.
export function isWriteSql(sql) {
  return WRITE_RE.test(sql);
}

// A Buffer (e.g. an embedding BLOB) survives JSON.stringify on the routed
// write-client as {type:'Buffer', data:[...]} and arrives here as a plain
// object. Passed to better-sqlite3 .run(), an object is interpreted as a
// NAMED-parameter binding, leaving the anonymous `?` placeholders unfilled →
// "Too few parameter values were provided". Revive such objects back to Buffers
// so blob writes (embeddings, etc.) bind correctly. Scalars pass through.
function reviveArg(a) {
  if (a && typeof a === 'object' && a.type === 'Buffer' && Array.isArray(a.data)) {
    return Buffer.from(a.data);
  }
  return a;
}

// ── prepared-statement reuse: one LRU per connection ────────────────────────────────────────────────────────────────
const STMT_CACHE_MAX = Number(process.env.SIFTER_STMT_CACHE || 512);
const stmtCaches = new WeakMap();
const cacheStats = { hits: 0, misses: 0 };
export const stmtCacheStats = () => ({ ...cacheStats });
/** db.prepare(sql), reused while the SQL text repeats. DDL is never cached (it changes the schema the others compiled on). */
export function cachedPrepare(db, sql) {
  if (/^\s*(CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE)\b/i.test(sql)) return db.prepare(sql);
  let c = stmtCaches.get(db);
  if (!c) { c = new Map(); stmtCaches.set(db, c); }
  let st = c.get(sql);
  if (st) { c.delete(sql); c.set(sql, st); cacheStats.hits++; return st; }   // move to most-recent
  st = db.prepare(sql); cacheStats.misses++;
  c.set(sql, st);
  if (c.size > STMT_CACHE_MAX) c.delete(c.keys().next().value);
  return st;
}

// ── logical bytes per request (storage-wear 10-28) ──────────────────────────────────────────────────────────────────────
// The group runs synchronously on the main thread, so the main thread's write() byte counter before/after is exactly what
// this group wrote (WAL appends, inline checkpoints); /proc/thread-self/io is per THREAD, so the checkpoint thread never
// leaks in. Split over the group's requests by payload size. Off Linux (dev) the payload size stands in.
import { readFileSync } from 'node:fs';
export function threadWchar() {
  try { const m = /^wchar:\s*(\d+)/m.exec(readFileSync('/proc/thread-self/io', 'utf8')); return m ? Number(m[1]) : null; } catch { return null; }
}
/** Payload size of a request: SQL text + bound args (strings, buffers, numbers). */
export function payloadBytes(statements = []) {
  let n = 0;
  for (const s of statements) {
    n += String(s?.sql || '').length;
    for (const a of s?.args || []) n += typeof a === 'string' ? Buffer.byteLength(a) : a && typeof a === 'object' ? (a.data?.length ?? 8) : 8;
  }
  return n;
}

// Apply [{sql, args}] as a single atomic transaction. Returns per-statement
// {lastInsertRowid, changes}. Throws (and rolls back) on any statement error.
// Inside an open transaction (group commit) better-sqlite3 makes this a SAVEPOINT: a throw rolls back this batch only.
export function applyWriteBatch(db, statements) {
  if (!statements || statements.length === 0) return [];
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }, i) => {
    try {
      const info = cachedPrepare(db, sql).run(...args.map(reviveArg));
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    } catch (err) {
      // Name the statement: "FOREIGN KEY constraint failed" alone could not say which of a batch's writes, or
      // which table, refused (Core Tablets re-ingest, 2026-09-28). The transaction still rolls back whole.
      err.message = `${err.message} [statement ${i + 1}/${stmts.length}: ${String(sql).replace(/\s+/g, ' ').slice(0, 120)}]`;
      throw err;
    }
  }));
  return txn(statements);
}

/**
 * Group commit over one connection. submit(statements, meta) → Promise<results> (rejects with that request's own error).
 * A group is flushed `windowMs` after its first request (0 = the same event-loop turn, the default), or at once when it
 * reaches maxStatements / maxRequests. A request
 * at or over maxStatements runs alone. While a flush runs (synchronously) new requests queue, so under load groups grow by
 * themselves and an idle writer adds only `windowMs`. onRequest({meta, ms, statements, changes, error}) and
 * onCommit({ms, requests, statements}) feed the write stats; ms per request includes its share of the COMMIT.
 * SIFTER_GROUP_COMMIT=0 → every request is its own transaction (the pre-10-23 behaviour, also the rollback).
 */
export function createGroupCommitter(getDb, { windowMs = Number(process.env.SIFTER_GROUP_COMMIT_MS ?? 0), maxStatements = 2000, maxRequests = 64,
  enabled = process.env.SIFTER_GROUP_COMMIT !== '0', now = () => performance.now(), onRequest = () => {}, onCommit = () => {} } = {}) {
  let queue = [], queued = 0, timer = null;
  let chain = Promise.resolve();   // groups run strictly in arrival order
  const counters = { groups: 0, requests: 0, grouped: 0 };

  async function runGroup(group) {
    let db;
    try { db = await getDb(); } catch (err) { for (const r of group) r.reject(err); return; }
    const t0 = now();
    const w0 = threadWchar();
    let applyMs = 0;
    const run = () => { for (const r of group) {
      const s = now();
      try { r.results = applyWriteBatch(db, r.statements); r.error = null; } catch (err) { r.error = err; }
      r.ms = now() - s; applyMs += r.ms;
    } };
    try {
      if (enabled && group.length > 1) db.transaction(run)(); else run();
    } catch (err) { for (const r of group) if (!r.error) { r.error = err; r.results = null; } }   // COMMIT itself failed
    const w1 = threadWchar();
    const sizes = group.map((r) => payloadBytes(r.statements)), sizeSum = sizes.reduce((n, x) => n + x, 0) || 1;
    const groupBytes = w0 != null && w1 != null ? w1 - w0 : sizeSum;
    const total = now() - t0, overhead = Math.max(0, total - applyMs) / group.length;
    counters.groups++; counters.requests += group.length; if (group.length > 1) counters.grouped += group.length;
    try { onCommit({ ms: total, bytes: groupBytes, requests: group.length, statements: group.reduce((n, r) => n + r.statements.length, 0) }); } catch { /* stats only */ }
    group.forEach((r, i) => {
      const ms = r.ms + overhead, bytes = Math.round(groupBytes * sizes[i] / sizeSum);
      try { onRequest({ meta: r.meta, ms, bytes, statements: r.statements.length, changes: r.results ? r.results.reduce((n, x) => n + (x.changes || 0), 0) : 0, error: r.error }); } catch { /* stats only */ }
      if (r.error) r.reject(r.error); else r.resolve(r.results);
    });
  }
  const enqueueGroup = (group) => { chain = chain.then(() => runGroup(group)); return chain; };
  const cancel = () => { if (timer) { if (windowMs > 0) clearTimeout(timer); else clearImmediate(timer); timer = null; } };
  function flush() {
    cancel();
    const group = queue; queue = []; queued = 0;
    return group.length ? enqueueGroup(group) : chain;
  }

  function submit(statements = [], meta = {}) {
    return new Promise((resolve, reject) => {
      const req = { statements, meta, resolve, reject };
      if (!enabled || statements.length >= maxStatements) { flush(); enqueueGroup([req]); return; }   // alone, after what waits
      if (queued + statements.length > maxStatements) flush();
      queue.push(req); queued += statements.length;
      if (queue.length >= maxRequests) flush();
      // NOT unref'd: a pending group keeps the process alive until it commits. windowMs 0 (default) = setImmediate: no added
      // wait — a group is what arrived in the same event-loop turn, and it grows by itself while a long flush blocks the loop
      else if (!timer) timer = windowMs > 0 ? setTimeout(flush, windowMs) : setImmediate(flush);
    });
  }
  return { submit, flush, stats: () => ({ ...counters, pending: queue.length }) };
}

/**
 * DEFER LANE (storage-wear 10-28; Chad: UPS + ECC, accept ~2 min loss of re-derivable writes). Batches whose name is in
 * `names` are answered at once (empty results) and held in RAM; every `everyMs` they are applied in ARRIVAL order as ONE
 * group through the committer, so repeated touches/log rows share pages and one WAL append. Only for write-and-forget
 * statements nobody reads back within the window (coverage age marks, activity log). flush() is wired to POST /power/flush,
 * SIGTERM and the power-mode enter path. A crash loses at most `everyMs` of them.
 */
export function createDeferLane(committer, { names = [], everyMs = 30000, maxHeld = 20000, onError = () => {} } = {}) {
  const set = new Set(names);
  let held = [], timer = null, flushing = Promise.resolve();
  const stats = { deferred: 0, flushes: 0, statements: 0 };
  const flush = () => {
    if (!held.length) return flushing;
    const batch = held; held = [];
    const all = batch.flatMap((b) => b.statements);
    stats.flushes++; stats.statements += all.length;
    flushing = flushing.then(() => committer.submit(all, { caller: 'defer-lane', name: 'defer-lane:flush' })).catch(onError);
    return flushing;
  };
  return {
    wants: (name) => set.has(name),
    /** Hold a batch; resolves with placeholder results. */
    hold(statements, meta) {
      held.push({ statements, meta }); stats.deferred++;
      if (held.reduce((n, b) => n + b.statements.length, 0) >= maxHeld) flush();
      else if (!timer && everyMs > 0) { timer = setInterval(flush, everyMs); timer.unref?.(); }
      return statements.map(() => ({ lastInsertRowid: 0, changes: 0, deferred: true }));
    },
    flush, stop: () => { if (timer) clearInterval(timer); timer = null; },
    stats: () => ({ ...stats, held: held.length }),
  };
}
