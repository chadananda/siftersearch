// content.restoreRetiredDocs: undoes ONE retirement run exactly — rows deleted earlier for other reasons stay deleted.
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params = []) => db.prepare(sql).run(...params)),
  queryAll: vi.fn(async (sql, params = []) => db.prepare(sql).all(...params)),
  queryOne: vi.fn(async (sql, params = []) => db.prepare(sql).get(...params)),
  transaction: vi.fn(),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../api/lib/audit.js', () => ({ audit: vi.fn() }));

describe('restoreRetiredDocs', () => {
  it('restores the run’s stamp only; older deletions and older-retired docs stay', async () => {
    db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, deleted_at TEXT, updated_at TEXT);
      CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, deleted_at TEXT, synced INTEGER, updated_at TEXT);
      INSERT INTO docs VALUES (1, '2026-10-10T04:00:00Z', NULL), (2, '2026-08-01T00:00:00Z', NULL);
      INSERT INTO content VALUES (10, 1, '2026-10-10T04:00:00Z', 1, NULL), (11, 1, '2026-05-01T00:00:00Z', 1, NULL),
        (20, 2, '2026-08-01T00:00:00Z', 1, NULL);`);
    const { content } = await import('../../api/lib/content.js');
    expect(await content.restoreRetiredDocs([1, 2], { since: '2026-10-10', reason: 't', runId: 'r' })).toEqual({ restored: 1 });
    expect(db.prepare('SELECT id, deleted_at, synced FROM content ORDER BY id').all()).toEqual([
      { id: 10, deleted_at: null, synced: 0 }, { id: 11, deleted_at: '2026-05-01T00:00:00Z', synced: 1 },
      { id: 20, deleted_at: '2026-08-01T00:00:00Z', synced: 1 }]);
    expect(db.prepare('SELECT id, deleted_at FROM docs ORDER BY id').all().map((d) => d.deleted_at)).toEqual([null, '2026-08-01T00:00:00Z']);
    await expect(content.restoreRetiredDocs([1], {})).rejects.toThrow('since is required');
  });
});
