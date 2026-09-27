// The footer pause link: opaque (no address in the URL), unforgeable, GET never mutates (mail scanners prefetch), POST
// pauses exactly that address.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { pauseToken, verifyPauseToken, pauseUrl, emailHash } from '../../api/lib/anis/pause-link.js';

const rows = [{ id: 1, email: 'Seeker@Example.com', unsubscribed_at: null }, { id: 2, email: 'other@example.com', unsubscribed_at: null }];
vi.mock('../../api/lib/db.js', () => ({
  queryAll: async () => rows.filter((r) => !r.unsubscribed_at),
  query: async (sql, [id]) => { const r = rows.find((x) => x.id === id); if (r) r.unsubscribed_at = 'now'; },
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info() {}, warn() {} } }));

describe('pause token', () => {
  it('carries no address, verifies, and cannot be forged or altered', () => {
    const t = pauseToken('seeker@example.com');
    expect(t).not.toMatch(/seeker|example/);
    expect(verifyPauseToken(t)).toBe(emailHash('SEEKER@example.com '));
    expect(verifyPauseToken(t.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
    expect(verifyPauseToken(`${emailHash('other@example.com')}.${t.split('.')[1]}`)).toBeNull();
    expect(pauseUrl('x@y.z')).toMatch(/\/api\/v1\/anis\/pause\?t=[a-f0-9]{32}\.[a-f0-9]{32}$/);
  });
});

describe('pause routes', () => {
  let app;
  beforeAll(async () => {
    const { default: anisRoutes } = await import('../../api/routes/anis.js');
    app = Fastify(); await app.register(anisRoutes, { prefix: '/api/v1/anis' }); await app.ready();
  });
  it('GET shows a confirm page and changes nothing', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/v1/anis/pause?t=${pauseToken('seeker@example.com')}` });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatch(/Pause letters/);
    expect(rows.every((x) => !x.unsubscribed_at)).toBe(true);
  });
  it('a bad token is refused', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/anis/pause?t=nope' })).statusCode).toBe(400);
  });
  it('POST (the form) pauses exactly that address', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/anis/pause', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `t=${pauseToken('seeker@example.com')}` });
    expect(r.statusCode).toBe(200);
    expect(rows.find((x) => x.id === 1).unsubscribed_at).toBeTruthy();
    expect(rows.find((x) => x.id === 2).unsubscribed_at).toBeNull();
  });
});
