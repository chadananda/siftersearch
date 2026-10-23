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
    let applyMs = 0;
    const run = () => { for (const r of group) {
      const s = now();
      try { r.results = applyWriteBatch(db, r.statements); r.error = null; } catch (err) { r.error = err; }
      r.ms = now() - s; applyMs += r.ms;
    } };
    try {
      if (enabled && group.length > 1) db.transaction(run)(); else run();
    } catch (err) { for (const r of group) if (!r.error) { r.error = err; r.results = null; } }   // COMMIT itself failed
    const total = now() - t0, overhead = Math.max(0, total - applyMs) / group.length;
    counters.groups++; counters.requests += group.length; if (group.length > 1) counters.grouped += group.length;
    try { onCommit({ ms: total, requests: group.length, statements: group.reduce((n, r) => n + r.statements.length, 0) }); } catch { /* stats only */ }
    for (const r of group) {
      const ms = r.ms + overhead;
      try { onRequest({ meta: r.meta, ms, statements: r.statements.length, changes: r.results ? r.results.reduce((n, x) => n + (x.changes || 0), 0) : 0, error: r.error }); } catch { /* stats only */ }
      if (r.error) r.reject(r.error); else r.resolve(r.results);
    }
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
