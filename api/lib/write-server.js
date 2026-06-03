// :arch: single-writer core — applies batched write statements through ONE db connection in one atomic transaction.
// :why: eliminates multi-process SQLite write-lock contention. All writers POST batches here instead of opening their own write txns.
// :deps: a better-sqlite3 db handle (from db.js getDb) | consumers: unified-worker HTTP /write endpoint, write-client in db.js
// :rules: every batch = one transaction (all-or-nothing). Synchronous: better-sqlite3 serializes on the single Node thread, so concurrent HTTP writes can't interleave mid-transaction.
// :edge: a throwing statement rolls back the WHOLE batch — callers must not assume partial application.

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH|REPLACE)\b/i;

// True when sql mutates state. Mirrors the runQuery detector in db.js so the
// write-client can decide whether to route a statement to the writer.
export function isWriteSql(sql) {
  return WRITE_RE.test(sql);
}

// Apply [{sql, args}] as a single atomic transaction. Returns per-statement
// {lastInsertRowid, changes}. Throws (and rolls back) on any statement error.
export function applyWriteBatch(db, statements) {
  if (!statements || statements.length === 0) return [];
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => {
    const info = db.prepare(sql).run(...args);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  }));
  return txn(statements);
}
