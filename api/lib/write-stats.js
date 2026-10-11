// Write observability for the single writer: every batch counted per minute × caller × batch name, flushed to
// db_write_stats (migration 145) by the writer itself. Answers "who is writing, how much, how slowly" — the question the
// 10-11 "database is locked" errors could not be answered with. Pure aggregation; the writer owns the flush.
const buckets = new Map();
const minuteOf = (t) => new Date(t).toISOString().slice(0, 16);

/** Record one batch. caller = process identity (x-sifter-caller), name = the batch's own label. */
export function recordWrite({ caller, name, statements = 0, changes = 0, ms = 0, error = false, at = Date.now() }) {
  const k = `${minuteOf(at)}\u0000${caller || 'unknown'}\u0000${name || 'unnamed'}`;
  const b = buckets.get(k) || { batches: 0, statements: 0, changes: 0, errors: 0, ms_total: 0, ms_max: 0 };
  b.batches++; b.statements += statements; b.changes += changes; b.errors += error ? 1 : 0;
  b.ms_total += ms; b.ms_max = Math.max(b.ms_max, ms);
  buckets.set(k, b);
}

/** Take everything recorded so far as upsert statements (and clear it). */
export function drainWriteStats() {
  const stmts = [...buckets].map(([k, b]) => {
    const [minute, caller, name] = k.split('\u0000');
    return {
      sql: `INSERT INTO db_write_stats (minute, caller, name, batches, statements, changes, errors, ms_total, ms_max)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (minute, caller, name) DO UPDATE SET batches = batches + excluded.batches,
              statements = statements + excluded.statements, changes = changes + excluded.changes,
              errors = errors + excluded.errors, ms_total = ms_total + excluded.ms_total,
              ms_max = MAX(ms_max, excluded.ms_max)`,
      args: [minute, caller, name, b.batches, b.statements, b.changes, b.errors, b.ms_total, b.ms_max],
    };
  });
  buckets.clear();
  return stmts;
}

/** Current (unflushed) view, for GET /stats on the writer. */
export const peekWriteStats = () => [...buckets].map(([k, b]) => { const [minute, caller, name] = k.split('\u0000'); return { minute, caller, name, ...b }; });
