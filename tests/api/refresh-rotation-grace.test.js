// api/lib/auth.js refresh-token rotation. Every page load rotates the cookie; if the response that
// carries the new cookie is lost (tunnel reconnect, 502/524 after the origin committed — 10-22 storm),
// the browser still holds the OLD one. With a 30 s grace that browser was logged out for good on its
// next visit. Rotated tokens (revoked = 2) now stay valid for 24 h; logout (revoked = 1) keeps 30 s.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
db.exec(`CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL,
  revoked INTEGER DEFAULT 0, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
const run = async (sql, params = []) => { const st = db.prepare(sql); return st.reader ? { rows: st.all(...params) } : st.run(...params); };
vi.mock('../../api/lib/db.js', () => ({
  userQuery: run,
  userQueryOne: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
  query: run, queryOne: async () => null, queryAll: async () => [], userQueryAll: async () => []
}));
const { createRefreshToken, verifyRefreshToken, rotateRefreshToken, revokeRefreshToken } = await import('../../api/lib/auth.js');

const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const setRevokedAt = (id, s) => db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(ago(s), id);

beforeEach(() => db.exec('DELETE FROM refresh_tokens'));

describe('refresh rotation grace', () => {
  it('a rotated token whose replacement never arrived still works 10 minutes later', async () => {
    const old = await createRefreshToken(1);
    await createRefreshToken(1);           // the new cookie, lost in transit
    await rotateRefreshToken(old.id);
    setRevokedAt(old.id, 600);
    expect(await verifyRefreshToken(old.id)).toMatchObject({ user_id: 1 });
  });

  it('a rotated token expires after the rotation window', async () => {
    const old = await createRefreshToken(1);
    await rotateRefreshToken(old.id);
    setRevokedAt(old.id, 25 * 3600);
    expect(await verifyRefreshToken(old.id)).toBeNull();
  });

  it('a logged-out token keeps only the 30 s navigation grace', async () => {
    const t = await createRefreshToken(1);
    await revokeRefreshToken(t.id);
    expect(await verifyRefreshToken(t.id)).toBeTruthy();
    setRevokedAt(t.id, 60);
    expect(await verifyRefreshToken(t.id)).toBeNull();
  });

  it('replaying a rotated token does not extend its window', async () => {
    const old = await createRefreshToken(1);
    await rotateRefreshToken(old.id);
    setRevokedAt(old.id, 3600);
    await rotateRefreshToken(old.id);       // second rotation of the same old cookie
    const row = db.prepare('SELECT revoked_at FROM refresh_tokens WHERE id = ?').get(old.id);
    expect(Date.parse(row.revoked_at)).toBeLessThan(Date.now() - 3500 * 1000);
  });

  it('logout after rotation still revokes (revoked = 1 wins)', async () => {
    const old = await createRefreshToken(1);
    await rotateRefreshToken(old.id);
    await revokeRefreshToken(old.id);
    setRevokedAt(old.id, 60);
    expect(await verifyRefreshToken(old.id)).toBeNull();
  });
});
