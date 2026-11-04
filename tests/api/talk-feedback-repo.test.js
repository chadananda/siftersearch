// talk-feedback-repo against the REAL user migration 12 schema: in-memory better-sqlite3 behind a mocked db.js (user* names).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const run = async (sql, p = []) => { const r = raw.prepare(sql).run(...p); return { rows: [], lastInsertRowid: r.lastInsertRowid, changes: r.changes }; };
vi.mock('../../api/lib/db.js', () => ({
  userQuery: vi.fn((sql, p) => run(sql, p)),
  userQueryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  userQueryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
}));

const { userMigrations, USER_DB_CURRENT_VERSION } = await import('../../api/lib/migrations/user.js');
const repo = await import('../../api/lib/repos/talk-feedback-repo.js');

beforeEach(async () => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, tier TEXT);
    INSERT INTO users VALUES (1,'a@x','Amina','verified'),(2,'b@x','  ','verified'),(3,'c@x','Cyrus','banned'),(4,'d@x','Dara','verified');`);
  await userMigrations[12]();
});

describe('migration 12', () => {
  it('is the current user-DB version and is idempotent', async () => {
    expect(USER_DB_CURRENT_VERSION).toBe(12);
    await userMigrations[12]();
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name='talk_feedback'").get()).toBeTruthy();
  });
  it('rejects an out-of-range score at the table', () => {
    expect(() => raw.prepare('INSERT INTO talk_feedback (media_id, user_id, score) VALUES (1, 1, 6)').run()).toThrow();
  });
});

describe('saveFeedback + feedbackFor', () => {
  it('upserts one row per user per talk', async () => {
    await repo.saveFeedback({ mediaId: 10, userId: 1, score: 3, comment: 'ok' });
    await repo.saveFeedback({ mediaId: 10, userId: 1, score: 5, comment: 'better on a second listen', startS: 42.5 });
    const f = await repo.feedbackFor(10, { userId: 1 });
    expect(f.count).toBe(1);
    expect(f.mine).toMatchObject({ name: 'Amina', score: 5, comment: 'better on a second listen', suggested_start_s: 42.5 });
    expect(f.entries[0].mine).toBe(true);
  });

  it('averages scores (nulls excluded), takes the median start, hides banned users and emails', async () => {
    await repo.saveFeedback({ mediaId: 10, userId: 1, score: 4, startS: 30 });
    await repo.saveFeedback({ mediaId: 10, userId: 2, score: null, comment: 'starts late', startS: 50 });
    await repo.saveFeedback({ mediaId: 10, userId: 3, score: 1, comment: 'spam' });
    await repo.saveFeedback({ mediaId: 10, userId: 4, score: 5, startS: 40 });
    await repo.saveFeedback({ mediaId: 11, userId: 1, score: 1 });
    const f = await repo.feedbackFor(10, { userId: 4 });
    expect(f.count).toBe(3);
    expect(f.scored).toBe(2);
    expect(f.average).toBe(4.5);
    expect(f.starts).toEqual({ count: 3, median: 40 });
    expect(f.entries.map((e) => e.name).sort()).toEqual(['A listener', 'Amina', 'Dara']);
    expect(JSON.stringify(f)).not.toContain('@x');
    expect(f.mine.score).toBe(5);
  });

  it('empty talk → zeros and no mine', async () => {
    const f = await repo.feedbackFor(99);
    expect(f).toMatchObject({ count: 0, scored: 0, average: null, starts: { count: 0, median: null }, entries: [], mine: null });
  });
});
