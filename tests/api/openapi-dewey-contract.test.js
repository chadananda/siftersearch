// OPENAPI CONTRACT for Dewey (/api/dewey/*) — Chad 10-17: "is there a good openapi api?". Until then the spec's transform
// hid every non-/api/v1/ route, so Dewey was absent from /api/v1/docs and agents had only the markdown guide. These run
// against the SERVED document, because that is what a client reads.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('OpenAPI contract — Dewey', () => {
  let server, spec;
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
    spec = JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/docs/json' })).payload);
  }, 30000);
  afterAll(async () => { if (server) await server.close(); });

  const op = (path, verb) => spec.paths?.[path]?.[verb];
  const ROUTES = [['/api/dewey/holdings', 'post'], ['/api/dewey/activity', 'get'], ['/api/dewey/missing', 'get'],
    ['/api/dewey/items', 'post'], ['/api/dewey/items', 'get'], ['/api/dewey/items/{id}/source', 'post'],
    ['/api/dewey/chat', 'post'], ['/api/dewey/thread', 'get'], ['/api/dewey/keys', 'post']];

  it.each(ROUTES)('%s %s is in the spec, tagged Dewey, with a summary and a 200 schema', (path, verb) => {
    const o = op(path, verb);
    expect(o, `${verb} ${path}`).toBeDefined();
    expect(o.tags).toContain('Dewey');
    expect(o.summary?.length).toBeGreaterThan(3);
    expect(o.responses?.['200']?.content?.['application/json']?.schema).toBeDefined();
  });

  it('every call but key creation names the API-key security', () => {
    for (const [path, verb] of ROUTES.filter(([p]) => !p.endsWith('/keys'))) expect(op(path, verb).security).toEqual(expect.arrayContaining([{ apiKey: [] }]));
    expect(spec.components.securitySchemes.bearer?.scheme).toBe('bearer');
  });

  it('holdings documents its inputs and the verdict values', () => {
    const body = op('/api/dewey/holdings', 'post').requestBody.content['application/json'].schema;
    expect(Object.keys(body.properties)).toEqual(expect.arrayContaining(['text', 'url', 'images', 'file']));
    const res = op('/api/dewey/holdings', 'post').responses['200'].content['application/json'].schema;
    expect(res.properties.verdict.enum).toEqual(['held', 'partly-held', 'possible', 'not-found-by-title', 'not-held']);
  });

  it('chat documents the SSE event types and stream:false', () => {
    const o = op('/api/dewey/chat', 'post');
    for (const t of ['status', 'holdings', 'appraisal', 'item', 'delta', 'done']) expect(o.description).toContain(`\`${t}\``);
    expect(o.requestBody.content['application/json'].schema.properties.stream).toBeDefined();
  });

  it('response schemas stay open, so serialization never drops a field', async () => {
    const S = await import('../../api/routes/dewey-schemas.js');
    const walk = (s) => { if (s?.type === 'object' || (Array.isArray(s?.type) && s.type.includes('object'))) expect(s.additionalProperties).toBe(true);
      for (const v of Object.values(s?.properties || {})) walk(v); if (s?.items) walk(s.items); };
    for (const sch of Object.values(S)) for (const r of Object.values(sch.response || {})) walk(r);
  });
});
