// After the night maintenance dropped query_stats / slow_query_log / db_write_stats from sifter.db (10-24), a NEW
// telemetry.db must still get its tables: ensureTelemetrySchema falls back to its own copy of their DDL.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureTelemetrySchema, TELEMETRY_TABLES } from '../../api/lib/db.js';

describe('ensureTelemetrySchema without the tables in sifter.db', () => {
  it('creates all three tables and their indexes from the built-in DDL', () => {
    const content = new Database(':memory:'), tel = new Database(':memory:');
    const created = ensureTelemetrySchema(tel, content);
    expect(created.sort()).toEqual([...TELEMETRY_TABLES].sort());
    const names = tel.prepare(`SELECT name FROM sqlite_master`).all().map((r) => r.name);
    for (const n of ['idx_slowq_at', 'idx_slowq_fp', 'idx_qstats_hour']) expect(names).toContain(n);
    tel.prepare(`INSERT INTO db_write_stats (minute, caller, name, batches) VALUES ('2026-10-24T09:00', 'x', 'y', 1)
      ON CONFLICT(minute, caller, name) DO UPDATE SET batches = batches + excluded.batches`).run();
    expect(ensureTelemetrySchema(tel, content)).toEqual([]);   // idempotent
  });
});
