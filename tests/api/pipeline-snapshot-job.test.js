// The pipeline snapshot (10-22): the old 5-minute cron re-ran whole-table reads every hour — COUNT(graph_enriched=0) over
// 9.3M content rows, month-wide ai_usage GROUP BYs scanning the whole ledger — ~70 s and ~30 GB of reads that tripled
// search latency. These fail on that behaviour: ai_usage is read by rowid range, costly sections keep a TTL, and a
// steady-state run touches only the cheap probes.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { USAGE_DELTA_SQL } from '../../api/lib/repos/pipeline-snapshot-repo.js';
import { buildPipelineSnapshot, foldUsage, usageSection, advanceUsage, TTL } from '../../api/lib/ops/pipeline-snapshot-job.js';

const HOUR = 3600_000;
const plan = (db, sql, args) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((r) => r.detail).join(' | ');

describe('ai_usage delta read', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ai_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
      service_type TEXT, total_tokens INTEGER DEFAULT 0, estimated_cost_usd REAL DEFAULT 0, caller TEXT, success INTEGER DEFAULT 1);
    CREATE INDEX idx_ai_usage_timestamp ON ai_usage(timestamp DESC);
    CREATE INDEX idx_ai_usage_caller ON ai_usage(caller, timestamp DESC);
    CREATE INDEX idx_ai_usage_model ON ai_usage(model, timestamp DESC);
    CREATE INDEX idx_ai_usage_provider_ts ON ai_usage(provider, timestamp);`);
  it('is a rowid range search, never a table or index scan', () => {
    const p = plan(db, USAGE_DELTA_SQL, [100, 200]);
    expect(p).toMatch(/SEARCH ai_usage USING INTEGER PRIMARY KEY \(rowid>\? AND rowid<\?\)/);
    expect(p).not.toMatch(/SCAN ai_usage/);
  });
  it('(the month-wide query it replaces scanned the whole ledger)', () => {
    const old = `SELECT model, COUNT(*) as calls FROM ai_usage WHERE timestamp >= ? GROUP BY model ORDER BY calls DESC`;
    expect(plan(db, old, ['2026-09-22 00:00:00'])).toMatch(/SCAN ai_usage/);
  });
  it('groups by hour × model × provider × caller', () => {
    const ins = db.prepare('INSERT INTO ai_usage (timestamp, provider, model, caller, total_tokens, estimated_cost_usd, success) VALUES (?,?,?,?,?,?,?)');
    ins.run('2026-10-22 08:10:00', 'anthropic', 'haiku', 'anis', 10, 0.5, 1);
    ins.run('2026-10-22T08:40:00Z', 'anthropic', 'haiku', 'anis', 5, 0.25, 0);
    ins.run('2026-10-22 09:01:00', 'deepseek', 'v4', null, 1, 0.1, 1);
    const rows = db.prepare(USAGE_DELTA_SQL).all(0, 3);
    expect(rows).toContainEqual({ hour: '2026-10-22 08', model: 'haiku', provider: 'anthropic', caller: 'anis', n: 2, tokens: 15, cost: 0.75, failed: 1 });
    expect(rows).toHaveLength(2);
  });
});

describe('usage rollup', () => {
  const now = Date.parse('2026-10-22T15:30:00Z');
  const dayStart = Date.parse('2026-10-22T07:00:00Z');   // Phoenix midnight
  const r = (hour, model, caller, n, cost, failed = 0) => ({ hour, model, provider: 'p', caller, n, tokens: n * 10, cost, failed });
  it('today / week / month windows to the hour, unknown caller, old hours pruned', () => {
    const st = foldUsage({}, [r('2026-10-22 08', 'a', 'x', 2, 1), r('2026-10-22 06', 'a', null, 1, 2, 1),
      r('2026-10-18 10', 'b', 'x', 3, 4), r('2026-10-01 10', 'b', 'y', 5, 8), r('2026-09-01 10', 'b', 'y', 9, 9)], now);
    expect(Object.keys(st.buckets)).toHaveLength(4);   // 09-01 is > 31 days old
    const s = usageSection(st, now, dayStart);
    expect(s.combined).toMatchObject({ today_calls: 2, today_cost: 1, week_calls: 6, week_cost: 7, failed_week: 1, month_calls: 11, month_cost: 15 });
    expect(s.byCaller.find((c) => c.caller === 'unknown')).toMatchObject({ calls: 1 });
    expect(s.byCallerToday).toEqual([{ caller: 'x', calls: 2, tokens: 20, cost: 1 }]);
    expect(s.byModel[0]).toMatchObject({ model: 'b', calls: 8 });
    expect(s.filters.callers).toEqual(['x', 'y']);
  });
  it('back-fill is spread over runs and seeds names once', async () => {
    const calls = [];
    const repo = { usageTop: async () => 1_000_000, usageFirstSince: async () => 1, usageNames: async () => { calls.push('names'); return { models: ['m'], callers: [] }; },
      usageDelta: async (lo, hi) => { calls.push([lo, hi]); return []; } };
    const st = {};
    expect((await advanceUsage(st, repo, now, { maxRows: 400_000, pause: async () => {} })).done).toBe(false);
    expect(st.lastId).toBe(400_000);
    expect(calls.filter((c) => Array.isArray(c)).every(([lo, hi]) => hi - lo <= 50_000)).toBe(true);
    await advanceUsage(st, repo, now, { maxRows: 400_000, pause: async () => {} });
    expect((await advanceUsage(st, repo, now, { maxRows: 400_000, pause: async () => {} })).done).toBe(true);
    expect(calls.filter((c) => c === 'names')).toHaveLength(1);
  });
});

describe('snapshot sections run on their own clocks', () => {
  function fakeRepo() {
    const calls = {};
    const f = (name, v) => async (...a) => { calls[name] = (calls[name] || 0) + 1; return typeof v === 'function' ? v(...a) : v; };
    let top = 1000;
    return { calls, bump: (n) => { top += n; }, repo: {
      priorityBooks: f('priorityBooks', []), syncBacklog: f('syncBacklog', 0), embeddingMissing: f('embeddingMissing', 7), mentionsUnsynced: f('mentionsUnsynced', 0),
      liveParagraphs: f('liveParagraphs', 9_300_000), byLanguage: f('byLanguage', []), pendingEmbeddingByDoc: f('pendingEmbeddingByDoc', []),
      pendingSyncByDoc: f('pendingSyncByDoc', []), usageTop: async () => top, usageFirstSince: f('usageFirstSince', 1),
      usageNames: f('usageNames', { models: [], callers: [] }), usageDelta: f('usageDelta', (lo, hi) => [{ hour: '2026-10-22 15', model: 'm', provider: 'p', caller: 'c', n: hi - lo, tokens: 0, cost: 0, failed: 0 }]),
      usageByServiceSince: f('usageByServiceSince', []), searchActivity: f('searchActivity', { totals: {}, series: [], topQueries: [], strategies: [] }),
      corpusSummary: f('corpusSummary', { docs: 1, paras: 2, byReligion: [] }), stubDocs: f('stubDocs', []), huskDocs: f('huskDocs', []),
      heldDocs: f('heldDocs', []), stubLinkText: f('stubLinkText', ''),
    } };
  }
  it('a steady-state run touches only the cheap probes and the new ai_usage rows', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'snap-'));
    let t = Date.parse('2026-10-22T15:30:00Z');
    const { repo, calls, bump } = fakeRepo();
    const deps = { repo, now: () => t, dataDir, cloudflare: false, pm2List: async () => [], meili: async () => ({}), answerCache: async () => ({}),
      entityReview: async () => [], shelves: async () => ({}), missingHelpers: async () => ({ cleanTitle: (x) => x, buildHeldIndex: () => ({ heldMatch: () => null }) }) };
    await buildPipelineSnapshot({}, deps);
    const first = { ...calls };
    expect(first.liveParagraphs).toBe(1);
    expect(first.stubDocs).toBe(1);
    for (const k of Object.keys(calls)) delete calls[k];

    t += 10 * 60_000; bump(40);
    const r = await buildPipelineSnapshot({}, deps);
    for (const heavy of ['liveParagraphs', 'byLanguage', 'pendingEmbeddingByDoc', 'stubDocs', 'huskDocs', 'heldDocs', 'corpusSummary', 'searchActivity', 'usageNames', 'usageFirstSince']) {
      expect(calls[heavy], heavy).toBeUndefined();
    }
    expect(calls.usageDelta).toBe(1);
    expect(r.probe_errors).toEqual([]);
    const snap = JSON.parse(readFileSync(join(dataDir, 'pipeline-status.json'), 'utf8'));
    expect(snap.aiUsage.combined.today_calls).toBe(1040);   // 1000 back-filled + 40 new
    expect(snap.integrity.live_paras).toBe(9_300_000);
    expect(snap.entity_pipeline.extraction_remaining).toBeNull();

    t += TTL.integrity;
    await buildPipelineSnapshot({}, deps);
    expect(calls.liveParagraphs).toBe(1);
  });
  it('rebaseIntegrity re-measures and restarts the baseline', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'snap-'));
    const { repo, calls } = fakeRepo();
    const deps = { repo, now: () => Date.parse('2026-10-22T15:30:00Z'), dataDir, cloudflare: false, pm2List: async () => [], meili: async () => ({}), answerCache: async () => ({}),
      entityReview: async () => [], shelves: async () => ({}), missingHelpers: async () => ({ cleanTitle: (x) => x, buildHeldIndex: () => ({ heldMatch: () => null }) }) };
    await buildPipelineSnapshot({}, deps);
    await buildPipelineSnapshot({ rebaseIntegrity: true }, deps);
    expect(calls.liveParagraphs).toBe(2);
    expect(JSON.parse(readFileSync(join(dataDir, 'pipeline-status.json'), 'utf8')).integrity.rebased_at).toBeTruthy();
  });
});

describe('no whole-table reads left in the snapshot path', () => {
  const repoSrc = readFileSync(join(import.meta.dirname, '../../api/lib/repos/pipeline-snapshot-repo.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  it('no graph_enriched count, no month-wide ai_usage GROUP BY', () => {
    expect(repoSrc).not.toMatch(/graph_enriched/);
    expect(repoSrc).not.toMatch(/FROM ai_usage WHERE timestamp >= \? GROUP BY (model|provider|caller)/);
  });
});
