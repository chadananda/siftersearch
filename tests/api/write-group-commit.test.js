// Group commit in the single writer (db-write-path-20261023): many requests → one transaction, each request isolated in its
// own savepoint, order of arrival kept, big requests alone, statements prepared once. In-memory better-sqlite3.
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createGroupCommitter, cachedPrepare, stmtCacheStats } from '../../api/lib/write-server.js';

let db, commits, requests;
const make = (o = {}) => createGroupCommitter(async () => db, { windowMs: 2, onCommit: (c) => commits.push(c), onRequest: (r) => requests.push(r), ...o });
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT UNIQUE)');
  commits = []; requests = [];
});

describe('group commit', () => {
  it('coalesces concurrent requests into one transaction with per-request results', async () => {
    const g = make();
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: [`v${i}`] }], { caller: 'c' })));
    expect(rs.map((r) => r[0].lastInsertRowid)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ requests: 20, statements: 20 });
    expect(requests).toHaveLength(20);
    expect(db.prepare('SELECT COUNT(*) n FROM t').get().n).toBe(20);
  });

  it('a failing request rolls back ALONE (savepoint); the rest of its group commits', async () => {
    const g = make();
    const ok1 = g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['a'] }]);
    const bad = g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['b'] }, { sql: 'INSERT INTO t (v) VALUES (?)', args: ['a'] }]);   // UNIQUE fails
    const ok2 = g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['c'] }]);
    await expect(bad).rejects.toThrow(/UNIQUE.*statement 2\/2/);
    await ok1; await ok2;
    expect(db.prepare('SELECT v FROM t ORDER BY v').all().map((r) => r.v)).toEqual(['a', 'c']);   // 'b' rolled back with its request
    expect(commits).toHaveLength(1);
    expect(requests.filter((r) => r.error)).toHaveLength(1);
  });

  it('keeps arrival order across requests (an UPDATE after its INSERT sees it)', async () => {
    const g = make();
    const a = g.submit([{ sql: 'INSERT INTO t (id, v) VALUES (1, ?)', args: ['x'] }]);
    const b = g.submit([{ sql: 'UPDATE t SET v = ? WHERE id = 1', args: ['y'] }]);
    expect((await b)[0].changes).toBe(1);
    await a;
    expect(db.prepare('SELECT v FROM t WHERE id = 1').get().v).toBe('y');
  });

  it('a request at maxStatements runs alone and drops nothing that arrives meanwhile', async () => {
    const g = make({ maxStatements: 10 });
    const small1 = g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['s1'] }]);
    const big = g.submit(Array.from({ length: 10 }, (_, i) => ({ sql: 'INSERT INTO t (v) VALUES (?)', args: [`b${i}`] })));
    const small2 = g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['s2'] }]);
    await Promise.all([small1, big, small2]);
    expect(db.prepare('SELECT COUNT(*) n FROM t').get().n).toBe(12);
    expect(commits.map((c) => c.requests)).toEqual([1, 1, 1]);
    expect(db.prepare('SELECT v FROM t ORDER BY id').all().map((r) => r.v)).toEqual(['s1', ...Array.from({ length: 10 }, (_, i) => `b${i}`), 's2']);
  });

  it('disabled (SIFTER_GROUP_COMMIT=0 rollback) = one transaction per request', async () => {
    const g = make({ enabled: false });
    await Promise.all([1, 2, 3].map((i) => g.submit([{ sql: 'INSERT INTO t (v) VALUES (?)', args: [`v${i}`] }])));
    expect(commits.map((c) => c.requests)).toEqual([1, 1, 1]);
  });

  it('prepares a repeated statement once (LRU per connection); DDL is never cached', () => {
    const before = stmtCacheStats();
    const a = cachedPrepare(db, 'INSERT INTO t (v) VALUES (?)');
    const b = cachedPrepare(db, 'INSERT INTO t (v) VALUES (?)');
    expect(a).toBe(b);
    expect(cachedPrepare(db, 'CREATE TABLE IF NOT EXISTS u (a)')).not.toBe(cachedPrepare(db, 'CREATE TABLE IF NOT EXISTS u (a)'));
    const after = stmtCacheStats();
    expect(after.hits - before.hits).toBe(1);
  });
});
