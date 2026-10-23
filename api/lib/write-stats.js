// Write observability for the single writer: every batch counted per minute × caller × batch name, flushed to
// db_write_stats (migration 145) by the writer itself. Answers "who is writing, how much, how slowly" — the question the
// 10-11 "database is locked" errors could not be answered with. Pure aggregation; the writer owns the flush.
// Also: an exact latency ring (last N batches, GET /latency on the writer) and summarizeWriteStats() for the
// 'write-stats' ops report (busy %, per-contender p95 and schedule) — db-write-path-20261023.
const buckets = new Map();
const minuteOf = (t) => new Date(t).toISOString().slice(0, 16);

/** Record one batch. caller = process identity (x-sifter-caller), name = the batch's own label. */
export function recordWrite({ caller, name, statements = 0, changes = 0, ms = 0, error = false, at = Date.now() }) {
  const k = `${minuteOf(at)}\u0000${caller || 'unknown'}\u0000${name || 'unnamed'}`;
  const b = buckets.get(k) || { batches: 0, statements: 0, changes: 0, errors: 0, ms_total: 0, ms_max: 0 };
  b.batches++; b.statements += statements; b.changes += changes; b.errors += error ? 1 : 0;
  b.ms_total += ms; b.ms_max = Math.max(b.ms_max, ms);
  buckets.set(k, b);
  recordLatency(ms, at);
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

// ── exact batch latency (the per-minute table keeps only total + max, so its p95 is an estimate) ──────────────────────
const RING = 20000;
const lat = new Float64Array(RING), latAt = new Float64Array(RING);
let latN = 0, latSince = Date.now();
let commits = { n: 0, ms: 0, since: Date.now() };   // group commits (one SQLite transaction each) vs requests
export function recordLatency(ms, at = Date.now()) { const i = latN++ % RING; lat[i] = ms; latAt[i] = at; }
export function recordCommit(ms) { commits.n++; commits.ms += ms; }
const pct = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : 0);
/** Batch latency over the last `minutes` (from the ring): n, p50/p95/p99/max, busy % of wall time, commits. */
export function latencySummary({ minutes = 15, now = Date.now() } = {}) {
  const since = now - minutes * 60000, xs = [];
  for (let i = 0; i < Math.min(latN, RING); i++) if (latAt[i] >= since) xs.push(lat[i]);
  xs.sort((a, b) => a - b);
  const total = xs.reduce((n, x) => n + x, 0);
  const windowMs = Math.min(minutes * 60000, now - latSince);   // a young process measures over its own lifetime
  return { minutes, batches: xs.length, p50: pct(xs, 0.5), p95: pct(xs, 0.95), p99: pct(xs, 0.99), max: xs.at(-1) || 0,
    busy_pct: windowMs > 0 ? +(100 * total / windowMs).toFixed(2) : 0,
    commits: { ...commits, per_request: latN ? +(commits.n / Math.max(1, latN)).toFixed(3) : null } };
}
export function resetLatency(now = Date.now()) { latN = 0; latSince = now; commits = { n: 0, ms: 0, since: Date.now() }; }

/** The 'write-stats' report over db_write_stats rows {minute, caller, name, batches, statements, changes, errors, ms_total,
 *  ms_max}: writer busy % (overall, per hour, worst minute), and per caller × name the batches/hour, rows, ms totals, the
 *  p95 of its per-minute WORST batch (an upper bound on the batch p95 — the table keeps no per-batch times) and its
 *  schedule (UTC hours active, median gap between active minutes). Pure. */
export function summarizeWriteStats(rows, { hours = 24, top = 25 } = {}) {
  const wallMs = hours * 3600000;
  const perMinute = new Map(), perHour = new Map(), by = new Map();
  for (const r of rows) {
    perMinute.set(r.minute, (perMinute.get(r.minute) || 0) + r.ms_total);
    const h = r.minute.slice(0, 13);
    const ph = perHour.get(h) || { ms: 0, batches: 0 };
    ph.ms += r.ms_total; ph.batches += r.batches; perHour.set(h, ph);
    const k = `${r.caller}\u0000${r.name}`;
    const e = by.get(k) || { caller: r.caller, name: r.name, batches: 0, statements: 0, changes: 0, errors: 0, ms_total: 0, ms_max: 0, minutes: [], maxes: [], hours: {} };
    e.batches += r.batches; e.statements += r.statements; e.changes += r.changes; e.errors += r.errors;
    e.ms_total += r.ms_total; e.ms_max = Math.max(e.ms_max, r.ms_max);
    e.minutes.push(r.minute); e.maxes.push(r.ms_max);
    const hod = r.minute.slice(11, 13); e.hours[hod] = (e.hours[hod] || 0) + r.batches;
    by.set(k, e);
  }
  const allMs = [...by.values()].reduce((n, e) => n + e.ms_total, 0);
  const minuteMs = [...perMinute.values()].sort((a, b) => a - b);
  const contenders = [...by.values()].sort((a, b) => b.ms_total - a.ms_total).slice(0, top).map((e) => {
    const ts = e.minutes.map((m) => Date.parse(`${m}:00Z`)).sort((a, b) => a - b);
    const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / 60000).sort((a, b) => a - b);
    return { caller: e.caller, name: e.name, batches: e.batches, batches_per_hour: +(e.batches / hours).toFixed(1),
      statements: e.statements, changes: e.changes, errors: e.errors, ms_total: e.ms_total, ms_max: e.ms_max,
      avg_ms: +(e.ms_total / Math.max(1, e.batches)).toFixed(1), p95_minute_worst_ms: pct([...e.maxes].sort((a, b) => a - b), 0.95),
      share_pct: allMs ? +(100 * e.ms_total / allMs).toFixed(1) : 0, active_minutes: ts.length,
      median_gap_min: gaps.length ? pct(gaps, 0.5) : null,
      hours_utc: Object.fromEntries(Object.entries(e.hours).sort()) };
  });
  return {
    hours, rows: rows.length, writer_ms: allMs, busy_pct: +(100 * allMs / wallMs).toFixed(2),
    busiest_minute_pct: +(100 * (minuteMs.at(-1) || 0) / 60000).toFixed(1),
    p95_minute_busy_pct: +(100 * pct(minuteMs, 0.95) / 60000).toFixed(1),
    by_hour: [...perHour].sort().map(([h, v]) => ({ hour: h, batches: v.batches, busy_pct: +(100 * v.ms / 3600000).toFixed(2) })),
    contenders,
  };
}
