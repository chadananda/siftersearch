// Dewey's API for agents: a key is accepted only with the 'dewey' permission, within its rate limit, owned by a member
// with Dewey access; legacy env keys (no owner) are refused.
import { describe, it, expect, vi } from 'vitest';

const KEYS = {
  sk_good: { id: 7, user_id: 1, permissions: '["dewey"]' },
  sk_search: { id: 8, user_id: 1, permissions: '["search"]' },
  sk_noaccess: { id: 9, user_id: 2, permissions: '["dewey"]' },
  sk_legacy: { id: 0, userId: 0, legacy: true },
  sk_limited: { id: 10, user_id: 1, permissions: '["dewey"]', rateLimited: true },
};
const USERS = { 1: { id: 1, email: 'chad@x', tier: 'admin', dewey_access: 0 }, 2: { id: 2, email: 'v@x', tier: 'approved', dewey_access: 0 } };
vi.mock('../../api/lib/api-keys.js', () => ({ validateApiKey: async (k) => KEYS[k] || null }));
vi.mock('../../api/lib/db.js', () => ({ queryOne: async (sql, [id]) => USERS[id] || null, userQueryOne: async (sql, [id]) => USERS[id] || null, query: async () => ({}), queryAll: async () => [], userQuery: async () => ({}), userQueryAll: async () => [] }));
const { requireDewey } = await import('../../api/lib/auth.js');

const call = async (headers) => { const req = { headers }; await requireDewey(req, {}); return req.user; };

describe('Dewey API keys', () => {
  it('a dewey key of a member with access works (X-Api-Key or Bearer sk_)', async () => {
    expect(await call({ 'x-api-key': 'sk_good' })).toMatchObject({ sub: 1, viaKey: 7 });
    expect(await call({ authorization: 'Bearer sk_good' })).toMatchObject({ sub: 1 });
  });
  it('refused: no dewey permission · owner without access · legacy key · rate limited · unknown', async () => {
    await expect(call({ 'x-api-key': 'sk_search' })).rejects.toThrow(/no Dewey permission/);
    await expect(call({ 'x-api-key': 'sk_noaccess' })).rejects.toThrow(/invited members/);
    await expect(call({ 'x-api-key': 'sk_legacy' })).rejects.toThrow(/Invalid API key/);
    await expect(call({ 'x-api-key': 'sk_limited' })).rejects.toThrow(/Rate limit/);
    await expect(call({ 'x-api-key': 'sk_nope' })).rejects.toThrow(/Invalid API key/);
  });
});
