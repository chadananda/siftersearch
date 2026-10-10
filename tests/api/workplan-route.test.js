// WorkPlan edge store: internal key required; validation before any write.
import { describe, it, expect } from 'vitest';
import { workRoute } from '../../worker/ops/workplan.js';

const env = { S1_KEY: 'k', OPS_DB: { prepare: () => { throw new Error('no db in this test'); } } };
const req = (path, { method = 'GET', key = 'k', body } = {}) => new Request(`https://x${path}`,
  { method, headers: key ? { 'x-internal-key': key } : {}, body: body ? JSON.stringify(body) : undefined });

describe('workRoute', () => {
  it('refuses without the internal key', async () => {
    expect((await workRoute(req('/_work/items', { key: 'nope' }), env)).status).toBe(401);
    expect((await workRoute(req('/_work/items', { key: null }), env)).status).toBe(401);
  });
  it('validates before writing', async () => {
    expect((await workRoute(req('/_work/items', { method: 'POST', body: { detail: 'x' } }), env)).status).toBe(400);   // no title
    expect((await workRoute(req('/_work/items/3', { method: 'POST', body: { status: 'nonsense' } }), env)).status).toBe(400);
    expect((await workRoute(req('/_work/items/3', { method: 'POST', body: {} }), env)).status).toBe(400);
  });
});
