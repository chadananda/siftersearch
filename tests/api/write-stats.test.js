import { describe, it, expect } from 'vitest';
import { recordWrite, drainWriteStats, peekWriteStats } from '../../api/lib/write-stats.js';

describe('write stats (single-writer observability)', () => {
  it('aggregates per minute × caller × name, then drains as upserts', () => {
    const at = Date.parse('2026-10-11T19:00:10Z');
    recordWrite({ caller: 'deep-research', name: 'heartbeat', statements: 1, changes: 1, ms: 3, at });
    recordWrite({ caller: 'deep-research', name: 'heartbeat', statements: 1, changes: 1, ms: 9, at });
    recordWrite({ caller: 'reingest-document.js', name: 'replace', statements: 500, changes: 500, ms: 40, error: true, at });
    const view = peekWriteStats();
    expect(view.find((r) => r.caller === 'deep-research')).toMatchObject({ minute: '2026-10-11T19:00', batches: 2, ms_total: 12, ms_max: 9 });
    const stmts = drainWriteStats();
    expect(stmts).toHaveLength(2);
    expect(stmts[0].sql).toMatch(/ON CONFLICT \(minute, caller, name\)/);
    expect(peekWriteStats()).toEqual([]);
  });
});

describe('write-stats report summary + exact latency (db-write-path-20261023)', () => {
  it('busy %, contenders ranked by writer time, p95 of per-minute worst, schedule', async () => {
    const { summarizeWriteStats } = await import('../../api/lib/write-stats.js');
    const rows = [
      { minute: '2026-10-23T10:00', caller: 'media', name: 'ingest', batches: 2, statements: 200, changes: 200, errors: 0, ms_total: 30000, ms_max: 20000 },
      { minute: '2026-10-23T10:00', caller: 'api', name: 'telemetry', batches: 10, statements: 50, changes: 50, errors: 0, ms_total: 100, ms_max: 30 },
      { minute: '2026-10-23T10:05', caller: 'api', name: 'telemetry', batches: 10, statements: 50, changes: 50, errors: 1, ms_total: 50, ms_max: 10 },
      { minute: '2026-10-23T11:10', caller: 'api', name: 'telemetry', batches: 10, statements: 50, changes: 50, errors: 0, ms_total: 50, ms_max: 10 },
    ];
    const s = summarizeWriteStats(rows, { hours: 2 });
    expect(s.writer_ms).toBe(30200);
    expect(s.busy_pct).toBeCloseTo(100 * 30200 / 7200000, 2);
    expect(s.busiest_minute_pct).toBeCloseTo(50.2, 1);                 // 30,100 ms in 10:00
    expect(s.contenders.map((c) => c.caller)).toEqual(['media', 'api']);
    const api = s.contenders[1];
    expect(api).toMatchObject({ batches: 30, batches_per_hour: 15, errors: 1, active_minutes: 3, median_gap_min: 5, hours_utc: { 10: 20, 11: 10 } });
    expect(s.by_hour.map((h) => h.hour)).toEqual(['2026-10-23T10', '2026-10-23T11']);
  });
  it('latency ring: exact p95 and busy % over a window', async () => {
    const { recordLatency, latencySummary, resetLatency, recordCommit } = await import('../../api/lib/write-stats.js');
    const t0 = 1_000_000_000_000;
    resetLatency(t0);
    for (let i = 1; i <= 100; i++) recordLatency(i, t0 + i * 100);       // 1..100 ms within 10 s
    recordCommit(5);
    const s = latencySummary({ minutes: 1, now: t0 + 60_000 });
    expect(s).toMatchObject({ batches: 100, p50: 50, p95: 95, max: 100 });
    expect(s.busy_pct).toBeCloseTo(100 * 5050 / 60000, 2);
    expect(s.commits.n).toBe(1);
  });
});
