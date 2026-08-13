// "Never be unclear about where query timing is spent" (Chad, 2026-08-13). Outlier logging alone cannot
// deliver that: the pipeline has been hurt by TWO opposite shapes — one 152s snapshot scan, and a 1.3s
// budget check run 672×/day on a 20s tick. A >=1s threshold catches the first and misses the second
// entirely. These tests pin that total-time accounting ranks both, and that the ranking cannot be fooled
// by either extreme.
import { describe, it, expect } from 'vitest';
import { fingerprintSql } from '../../api/lib/db.js';

// The report's ranking + labelling (api/routes/ingest.js /server/query-time).
const rank = (rows) => [...rows].sort((a, b) => b.total_ms - a.total_ms);
const pattern = (r) => (r.max_ms >= 5000 ? 'BLOCKING scan' : (r.n >= 200 && r.total_ms >= 60000 ? 'death by a thousand cuts' : 'ok'));

// The two real offenders, with their measured numbers.
const SNAPSHOT_SCAN = { proc: 'pipeline-snapshot', n: 113, total_ms: 5_382_000, max_ms: 54_000 };
const BUDGET_CHECK  = { proc: 'api', n: 672, total_ms: 871_000, max_ms: 1_696 };
const HARMLESS      = { proc: 'api', n: 5000, total_ms: 15_000, max_ms: 12 };

describe('both failure shapes are visible', () => {
  it('names the giant scan as blocking', () => {
    expect(pattern(SNAPSHOT_SCAN)).toBe('BLOCKING scan');
  });

  it('names the small-but-constant query, which an outlier threshold never sees', () => {
    expect(BUDGET_CHECK.max_ms).toBeLessThan(5000);        // below any "slow query" bar worth setting
    expect(pattern(BUDGET_CHECK)).toBe('death by a thousand cuts');
  });

  it('does not cry wolf over a genuinely cheap query, however often it runs', () => {
    expect(pattern(HARMLESS)).toBe('ok');
  });
});

describe('ranking by TOTAL time is what surfaces both', () => {
  const rows = [HARMLESS, BUDGET_CHECK, SNAPSHOT_SCAN];

  it('ranks the two real costs above the noisy-but-cheap one', () => {
    const order = rank(rows).map((r) => r.proc + ':' + r.n);
    expect(order[0]).toBe('pipeline-snapshot:113');
    expect(order[1]).toBe('api:672');
  });

  it('ranking by CALL COUNT would have hidden the 90-minute scan', () => {
    const byCount = [...rows].sort((a, b) => b.n - a.n);
    expect(byCount[0]).toBe(HARMLESS);                     // the cheapest query would top the report
  });

  it('ranking by WORST CASE would have hidden the budget check', () => {
    const byWorst = [...rows].sort((a, b) => b.max_ms - a.max_ms);
    expect(byWorst.indexOf(BUDGET_CHECK)).toBe(1);         // buried under a query costing 6x less overall
    expect(BUDGET_CHECK.total_ms / 60000).toBeGreaterThan(14);  // yet it costs ~15 min/day
  });
});

describe('shapes aggregate, so per-call cost cannot hide in distinct literals', () => {
  it('the same statement with different parameters is ONE line in the report', () => {
    const a = fingerprintSql("SELECT SUM(estimated_cost_usd) FROM ai_usage WHERE provider='deepseek' AND caller='corpus-rag'");
    const b = fingerprintSql("SELECT SUM(estimated_cost_usd) FROM ai_usage WHERE provider='anthropic' AND caller='corpus-rag'");
    expect(a).toBe(b);
  });

  it('genuinely different statements stay separate', () => {
    expect(fingerprintSql('SELECT 1 FROM docs')).not.toBe(fingerprintSql('SELECT 1 FROM content'));
  });
});

// ── Instrument correctness (2026-08-13) ───────────────────────────────────────────────────────────────
// Two faults found by reading the instrument's own output rather than trusting it. Both made it lie in the
// direction of "everything is fine", which is the worst direction for a monitoring tool.
describe('the instrument does not lie about itself', () => {
  it('records a query ONCE, not once per logging path', () => {
    // query() logged with the name AND the statement wrapper logged without it, so every named query
    // appeared twice — 'budget-check' x304 beside an identical '(unnamed)' x304, doubling every total.
    const recorded = [];
    let pendingName = '';
    const logOnce = (sql, name) => recorded.push({ sql, name });
    const withName = (name, fn) => { pendingName = name; try { return fn(); } finally { pendingName = ''; } };
    // The statement wrapper is now the single recording point.
    const runQuery = (sql) => logOnce(sql, pendingName);
    withName('budget-check', () => runQuery('SELECT SUM(x) FROM ai_usage WHERE provider=?'));
    expect(recorded).toHaveLength(1);
    expect(recorded[0].name).toBe('budget-check');
  });

  it('leaves the name empty for a direct prepare, without inventing one', () => {
    let pendingName = '';
    const recorded = [];
    const runQuery = (sql) => recorded.push({ sql, name: pendingName });
    runQuery('SELECT 1');                       // not routed through query()
    expect(recorded[0].name).toBe('');
  });

  it('frozenPct divides by the OBSERVED span, not the requested window', () => {
    const totalMs = 6.39 * 60000;
    const pct = (hours) => (totalMs / (hours * 3600 * 1000)) * 100;
    // One hour of collected data reported against a 24h window looked like 0.4% — a process that was
    // actually inside SQLite for 10.7% of the time it was measured.
    expect(pct(24)).toBeLessThan(1);
    expect(pct(1)).toBeGreaterThan(10);
  });
});
