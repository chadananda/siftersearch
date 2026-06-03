// Tests for the single-writer core (api/lib/write-server.js).
// Contract: applyWriteBatch(db, statements) applies [{sql,args}] as ONE atomic
// transaction through a single connection, returning per-statement
// {lastInsertRowid, changes}. Rolls back the whole batch on any failure.
// Pattern: in-memory better-sqlite3, no network.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applyWriteBatch, isWriteSql } from '../../api/lib/write-server.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
});

describe('applyWriteBatch', () => {
  it('applies a batch and returns lastInsertRowid + changes per statement', () => {
    const results = applyWriteBatch(db, [
      { sql: 'INSERT INTO t (v) VALUES (?)', args: ['a'] },
      { sql: 'INSERT INTO t (v) VALUES (?)', args: ['b'] },
      { sql: 'UPDATE t SET v = ? WHERE id = ?', args: ['A', 1] },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ lastInsertRowid: 1, changes: 1 });
    expect(results[1]).toEqual({ lastInsertRowid: 2, changes: 1 });
    expect(results[2].changes).toBe(1);
    expect(db.prepare('SELECT v FROM t WHERE id=1').get().v).toBe('A');
    expect(db.prepare('SELECT COUNT(*) c FROM t').get().c).toBe(2);
  });

  it('is atomic — a failing statement rolls back the entire batch', () => {
    expect(() => applyWriteBatch(db, [
      { sql: 'INSERT INTO t (v) VALUES (?)', args: ['ok'] },
      { sql: 'INSERT INTO t (id, v) VALUES (?, ?)', args: ['not-an-int-pk-conflict', 'x'] },
      { sql: 'INSERT INTO t (id, v) VALUES (1, ?)', args: ['dup'] }, // PK conflict — throws
    ])).toThrow();
    // nothing committed
    expect(db.prepare('SELECT COUNT(*) c FROM t').get().c).toBe(0);
  });

  it('defaults args to empty array', () => {
    const results = applyWriteBatch(db, [{ sql: "INSERT INTO t (v) VALUES ('noargs')" }]);
    expect(results[0].changes).toBe(1);
  });

  it('handles an empty batch', () => {
    expect(applyWriteBatch(db, [])).toEqual([]);
  });
});

describe('isWriteSql', () => {
  it('detects mutating statements', () => {
    for (const sql of ['INSERT INTO t VALUES (1)', '  update t set v=1', 'DELETE FROM t', 'CREATE TABLE x(a)', 'DROP TABLE t', 'ALTER TABLE t ADD c', 'pragma foreign_keys=on']) {
      expect(isWriteSql(sql)).toBe(true);
    }
  });
  it('treats SELECT and CTE reads as non-writes', () => {
    for (const sql of ['SELECT * FROM t', '  select 1', 'WITH x AS (SELECT 1) SELECT * FROM x']) {
      expect(isWriteSql(sql)).toBe(false);
    }
  });
});
