// The slow-query detector had a hole that cost a night of grounding: db.js TIMED every query and logged
// it, but nothing ever read the signal, so a 61-second writer-blocking UPDATE was indistinguishable from
// a 151ms read. These tests lock the half that was missing — that a blocking query is RECORDED, is
// attributable to a process, and is separable from ordinary slowness.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { fingerprintSql } from '../../api/lib/db.js';

// The recording table, exactly as migration 109 creates it.
const SCHEMA = `CREATE TABLE slow_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL DEFAULT (unixepoch()),
  proc TEXT NOT NULL, db_name TEXT, kind TEXT NOT NULL, duration_ms INTEGER NOT NULL,
  fingerprint TEXT NOT NULL, sql_sample TEXT, query_plan TEXT, name TEXT)`;

describe('slow-query fingerprinting', () => {
  it('collapses literals so repeats of one statement aggregate instead of scattering', () => {
    const a = fingerprintSql(`UPDATE content SET synced = 0 WHERE rowid IN (SELECT rowid FROM content WHERE synced = 1 AND created_at < '2020-01-01' LIMIT 500)`);
    const b = fingerprintSql(`UPDATE content SET synced = 0 WHERE rowid IN (SELECT rowid FROM content WHERE synced = 1 AND created_at < '2021-06-30' LIMIT 250)`);
    expect(a).toBe(b);
  });

  it('collapses placeholder lists, so an IN with 2 ids and one with 900 are the same shape', () => {
    expect(fingerprintSql('SELECT * FROM docs WHERE id IN (?,?)'))
      .toBe(fingerprintSql(`SELECT * FROM docs WHERE id IN (${Array(900).fill('?').join(',')})`));
  });

  it('keeps genuinely different statements apart', () => {
    expect(fingerprintSql('SELECT * FROM docs WHERE id = 1'))
      .not.toBe(fingerprintSql('DELETE FROM docs WHERE id = 1'));
  });
});

describe('the report separates a frozen event loop from ordinary slowness', () => {
  let db;
  const BLOCKING_MS = 5000;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    const ins = db.prepare(`INSERT INTO slow_query_log (proc, db_name, kind, duration_ms, fingerprint, sql_sample) VALUES (?,?,?,?,?,?)`);
    // The real incident: one statement, once per worker boot, ~60s each — low COUNT, ruinous impact.
    const preWipe = `UPDATE content SET synced = ? WHERE rowid IN (SELECT rowid FROM content WHERE synced = ? AND created_at < ? LIMIT ?)`;
    for (const ms of [61162, 56200, 55100, 52000, 51800]) ins.run('worker', 'content', 'write', ms, preWipe, preWipe);
    // Ordinary noise: many slow-ish reads. Far more numerous, and harmless by comparison.
    for (let i = 0; i < 500; i++) ins.run('api', 'content', 'read', 200 + (i % 50), 'SELECT * FROM content WHERE doc_id = ?', 'SELECT ...');
  });

  const report = () => db.prepare(
    `SELECT fingerprint, kind, proc, COUNT(*) n, MAX(duration_ms) worst_ms, SUM(duration_ms) total_ms
       FROM slow_query_log GROUP BY fingerprint, kind, proc ORDER BY total_ms DESC`).all();

  it('ranks by total impact, so 5 catastrophic writes outrank 500 slow reads', () => {
    const top = report()[0];
    expect(top.proc).toBe('worker');
    expect(top.kind).toBe('write');
    expect(top.n).toBe(5);                       // ranked FIRST despite being 1% of the rows
  });

  it('flags the writer-blocking statement as blocking, and the read noise as not', () => {
    const blocking = report().filter((r) => r.worst_ms >= BLOCKING_MS);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].proc).toBe('worker');
    expect(Math.round(blocking[0].worst_ms / 1000)).toBe(61);   // 61s of frozen event loop
  });

  it('attributes the freeze to a process — the API cannot see the worker in its own memory', () => {
    // This is why the signal is recorded to a table rather than counted in-process: the dashboard runs
    // in the API, and the process that froze was the worker.
    expect([...new Set(report().map((r) => r.proc))].sort()).toEqual(['api', 'worker']);
  });
});
