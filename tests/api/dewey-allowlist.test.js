// Dewey email allowlist: verified allowlisted address gets dewey_access on signup/login/me; unverified never; remove keeps access unless revoke.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
const h = vi.hoisted(() => ({ db: null }));
vi.mock('../../api/lib/db.js', () => {
  const run = (sql, p = []) => {
    const st = h.db.prepare(sql);
    if (st.reader) return { rows: st.all(...p) };
    return { rows: [{ changes: st.run(...p).changes }] };
  };
  return { userQuery: async (sql, p) => run(sql, p), userQueryOne: async (sql, p) => run(sql, p).rows[0] || null };
});
const repo = await import('../../api/lib/repos/contributors-repo.js');
const add = (email, verified, tier = 'verified') => h.db.prepare('INSERT INTO users (email, tier, email_verified, dewey_access) VALUES (?,?,?,0)').run(email, tier, verified);
const access = (email) => h.db.prepare('SELECT dewey_access d, tier FROM users WHERE email = ?').get(email);

beforeEach(() => {
  h.db = new Database(':memory:');
  h.db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, tier TEXT, email_verified INTEGER, dewey_access INTEGER DEFAULT 0, approved_at TEXT);
    CREATE TABLE dewey_allowlist (email TEXT PRIMARY KEY, note TEXT, added_by TEXT, added_at TEXT)`);
});

describe('dewey allowlist', () => {
  it('existing verified account is granted at once on add; case-insensitive; tier untouched', async () => {
    add('Duane@AOL.com', 1);
    expect((await repo.allow('  DUANE@aol.com ', 'Duane')).granted).toBe(true);
    expect(access('Duane@AOL.com')).toEqual({ d: 1, tier: 'verified' });
    expect(await repo.isAllowed('duane@aol.com')).toBe(true);
  });
  it('grants on signup/login/me (applyAllowlist) once verified', async () => {
    await repo.allow('new@x.org');
    add('new@x.org', 1);
    const u = await repo.applyAllowlist({ id: 1, email: 'New@x.org', tier: 'verified', email_verified: 1, dewey_access: 0 });
    expect(u.dewey_access).toBe(1);
    expect(access('new@x.org').d).toBe(1);
  });
  it('never grants an unverified email, even after verification flips later only via re-check', async () => {
    await repo.allow('bad@x.org');
    add('bad@x.org', 0);
    expect((await repo.applyAllowlist({ email: 'bad@x.org', email_verified: 0, dewey_access: 0 })).dewey_access).toBe(0);
    expect(access('bad@x.org').d).toBe(0);
    h.db.prepare('UPDATE users SET email_verified = 1').run();
    expect((await repo.applyAllowlist({ email: 'bad@x.org', email_verified: 1, dewey_access: 0 })).dewey_access).toBe(1);
  });
  it('remove keeps access unless revoke; list shows status', async () => {
    add('a@x.org', 1); await repo.allow('a@x.org');
    expect((await repo.list())[0]).toMatchObject({ email: 'a@x.org', dewey_access: 1 });
    await repo.disallow('a@x.org');
    expect(access('a@x.org').d).toBe(1);
    await repo.allow('a@x.org'); await repo.disallow('a@x.org', true);
    expect(access('a@x.org').d).toBe(0);
    expect(await repo.isAllowed('a@x.org')).toBe(false);
  });
});
