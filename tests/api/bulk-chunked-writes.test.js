// Bulk paths batch (db-write-path-20261023): a whole document's rows are updated in chunks of ≤ 400 ids (never one
// statement over the book), each chunk re-checks its WHERE (a rerun is a no-op). (The coverage refresh's one-statement
// touch of unchanged documents is tested in coverage-repo.test.js.)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const writes = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { if (/^\s*UPDATE/i.test(sql)) writes.push(sql); const r = raw.prepare(sql).run(...p); return { rows: [{ changes: r.changes }] }; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  transaction: vi.fn(async () => []),
  getDb: vi.fn(async () => raw),
}));
const { updateDocRowsChunked } = await import('../../api/lib/content.js');

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec('CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, deleted_at TEXT, synced INTEGER, updated_at TEXT)');
  const ins = raw.prepare('INSERT INTO content (doc_id, synced) VALUES (?, 1)');
  raw.transaction(() => { for (let i = 0; i < 1000; i++) ins.run(7); ins.run(8); })();
  writes.length = 0;
});

describe('chunked whole-document updates', () => {
  it('soft-deletes a 1,000-row document in chunks of ≤ 400 ids, only that document, and a rerun changes nothing', async () => {
    const spec = { set: 'deleted_at = ?, synced = 0, updated_at = ?', setArgs: ['t', 't'], where: 'deleted_at IS NULL' };
    const r = await updateDocRowsChunked(7, spec, { yieldFn: async () => {} });
    expect(r.changes).toBe(1000);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const w of writes) expect((w.match(/\?/g) || []).length - 2).toBeLessThanOrEqual(400);   // ids per statement
    expect(raw.prepare('SELECT COUNT(*) n FROM content WHERE deleted_at IS NOT NULL').get().n).toBe(1000);
    expect(raw.prepare('SELECT deleted_at FROM content WHERE doc_id = 8').get().deleted_at).toBeNull();
    expect((await updateDocRowsChunked(7, spec, { yieldFn: async () => {} })).changes).toBe(0);
  });
});
