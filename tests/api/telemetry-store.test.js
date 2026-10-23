// The telemetry store (db-write-path-20261023): query_stats / slow_query_log / db_write_stats in their own SQLite file.
// Schema copied from the content DB's own DDL, recent history imported once (buckets ADDED, not replaced), writes for it
// routed with {db:'telemetry'} while ai_usage stays with content, readers see it, a missing store reads empty.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'tel-'));
process.env.SIFTER_TELEMETRY_DB = join(dir, 'telemetry.db');
const db = await import('../../api/lib/db.js');

const content = () => {
  const c = new Database(':memory:');
  c.exec(`CREATE TABLE query_stats (hour INTEGER NOT NULL, proc TEXT NOT NULL, db_name TEXT, kind TEXT NOT NULL, label TEXT NOT NULL, name TEXT,
      fingerprint TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0, max_ms INTEGER NOT NULL DEFAULT 0, sql_sample TEXT,
      PRIMARY KEY (hour, proc, kind, label));
    CREATE INDEX idx_qstats_hour ON query_stats(hour);
    CREATE TABLE slow_query_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL DEFAULT (unixepoch()), proc TEXT NOT NULL, db_name TEXT,
      kind TEXT NOT NULL, duration_ms INTEGER NOT NULL, fingerprint TEXT NOT NULL, sql_sample TEXT, query_plan TEXT, name TEXT);
    CREATE INDEX idx_slow_at ON slow_query_log(at);
    CREATE TABLE db_write_stats (minute TEXT NOT NULL, caller TEXT NOT NULL, name TEXT NOT NULL, batches INTEGER NOT NULL DEFAULT 0,
      statements INTEGER NOT NULL DEFAULT 0, changes INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, ms_total INTEGER NOT NULL DEFAULT 0,
      ms_max INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (minute, caller, name));
    CREATE TABLE ai_usage (id INTEGER PRIMARY KEY, cost REAL);`);
  return c;
};

describe('telemetry store', () => {
  it('routes by TARGET table: query_stats/slow_query_log/db_write_stats → store; ai_usage (spend ledger) → content', () => {
    expect(db.isTelemetryStoreSql('INSERT INTO query_stats (hour) VALUES (?) ON CONFLICT(hour, proc, kind, label) DO UPDATE SET n = n + 1')).toBe(true);
    expect(db.isTelemetryStoreSql('INSERT INTO slow_query_log (proc) VALUES (?)')).toBe(true);
    expect(db.isTelemetryStoreSql("INSERT INTO ai_usage (model) VALUES ('slow_query_log')")).toBe(false);
    expect(db.isTelemetryStoreSql('SELECT * FROM query_stats')).toBe(false);
  });

  it('the queue sends store rows and content rows as two posts', async () => {
    const posts = [];
    const q = db.createTelemetryQueue(async (rows, name, opts) => { posts.push([rows.length, opts?.db || 'content']); }, { max: 100, delayMs: 60000, readOnly: () => false });
    q.push('INSERT INTO ai_usage (cost) VALUES (?)', [1]);
    q.push('INSERT INTO query_stats (hour) VALUES (?)', [1]);
    q.push('INSERT INTO slow_query_log (proc) VALUES (?)', ['x']);
    expect(await q.flush()).toBe(3);
    expect(posts.sort()).toEqual([[1, 'content'], [2, 'telemetry']]);
  });

  it("copies the content DB's DDL (tables + indexes), imports recent history once, and ADDS overlapping buckets", async () => {
    const c = content();
    const now = Date.parse('2026-10-23T22:00:00Z'), hour = Math.floor(now / 1000 / 3600) * 3600;
    c.prepare(`INSERT INTO query_stats VALUES (?, 'api', 'content', 'read', 'q', 'q', 'fp', 10, 100, 20, 's')`).run(hour);
    c.prepare(`INSERT INTO query_stats VALUES (?, 'api', 'content', 'read', 'old', 'old', 'fp', 1, 1, 1, 's')`).run(hour - 30 * 86400);   // too old
    c.prepare(`INSERT INTO slow_query_log (at, proc, kind, duration_ms, fingerprint) VALUES (?, 'api', 'read', 5000, 'fp')`).run(Math.floor(now / 1000));
    c.prepare(`INSERT INTO db_write_stats VALUES ('2026-10-23T21:59', 'media', 'x', 1, 1, 1, 0, 50, 50)`).run();
    const tel = db.getTelemetryStore({ create: true });
    expect(db.ensureTelemetrySchema(tel, c).sort()).toEqual(['db_write_stats', 'query_stats', 'slow_query_log']);
    expect(tel.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_qstats_hour', 'idx_slow_at')`).all()).toHaveLength(2);
    // a row written to the store after the switch, in the same hour bucket
    tel.prepare(`INSERT INTO query_stats VALUES (?, 'api', 'content', 'read', 'q', 'q', 'fp', 5, 50, 30, 's')`).run(hour);
    const done = await db.importTelemetryHistory(tel, c, { now, pause: async () => {} });
    expect(done).toEqual({ query_stats: 1, slow_query_log: 1, db_write_stats: 1 });
    expect(tel.prepare(`SELECT n, total_ms, max_ms FROM query_stats WHERE label = 'q'`).get()).toEqual({ n: 15, total_ms: 150, max_ms: 30 });
    expect(await db.importTelemetryHistory(tel, c, { now, pause: async () => {} })).toEqual({});   // once
    expect(await db.telemetryAll('SELECT COUNT(*) AS n FROM slow_query_log', [], 'test')).toEqual([{ n: 1 }]);
    expect(db.ensureTelemetrySchema(tel, c)).toEqual([]);   // idempotent
  });
});
