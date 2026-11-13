// anis-tools route: auth, single + batch calls, error shape, 404 (injected fake impl).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import anisToolsRoutes from '../../api/routes/anis-impl-tools.js';

const KEY = 'test-secret';
let app;
const impl = {
  echo: async (a, b) => ({ a, b }),
  slow: async (ms) => { await new Promise((r) => setTimeout(r, ms)); return { ms }; },
  boom: async () => { throw new Error('kaput'); },
  notFn: 5,
};
const H = { 'x-internal-key': KEY };
beforeAll(async () => {
  process.env.DEPLOY_SECRET = KEY;
  app = Fastify();
  await app.register(anisToolsRoutes, { prefix: '/api/v1/anis', impl });
  await app.ready();
});
afterAll(() => app.close());

describe('anis-tools route', () => {
  it('requires the internal key', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/anis/tool/echo', payload: { args: [1] } });
    expect(r.statusCode).toBeGreaterThanOrEqual(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/anis/tool-names' })).statusCode).toBeGreaterThanOrEqual(401);
  });
  it('runs one tool', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/anis/tool/echo', headers: H, payload: { args: [1, 'x'] } });
    const j = r.json();
    expect(r.statusCode).toBe(200);
    expect(j.out).toEqual({ a: 1, b: 'x' });
    expect(j.cache).toBe('miss');
    expect(typeof j.ms).toBe('number');
    const again = (await app.inject({ method: 'POST', url: '/api/v1/anis/tool/echo', headers: H, payload: { args: [1, 'x'] } })).json();
    expect(again.cache).toBe('hit');
  });
  it('404 on unknown or non-function', async () => {
    for (const fn of ['nope', 'notFn']) expect((await app.inject({ method: 'POST', url: `/api/v1/anis/tool/${fn}`, headers: H, payload: { args: [] } })).statusCode).toBe(404);
  });
  it('a throw is 200 { error }', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/anis/tool/boom', headers: H, payload: { args: [] } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ error: 'kaput' });
  });
  it('batch keeps order and isolates errors', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/anis/tools', headers: H, payload: { calls: [{ fn: 'slow', args: [30] }, { fn: 'boom', args: [] }, { fn: 'echo', args: [7] }, { fn: 'nope', args: [] }], turn: {} } });
    const { results } = r.json();
    expect(results.map((x) => x.out?.ms ?? x.out?.a ?? x.error)).toEqual([30, 'kaput', 7, 'unknown tool: nope']);
  });
  it('lists tool names', async () => {
    const j = (await app.inject({ method: 'GET', url: '/api/v1/anis/tool-names', headers: H })).json();
    expect(j.functions).toEqual(['echo', 'slow', 'boom']);
    expect(j.names).toContain('notFn');
  });
});
