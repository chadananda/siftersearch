// CONTRACT for the Anís tools API (POST /api/v1/tools/<name>, GET /api/v1/tools): every registry tool is a documented,
// validated, authenticated route; old names are input-only aliases. Runs against the SERVED OpenAPI document.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Ajv from 'ajv';
import { REGISTRY, publicNames } from '../../api/lib/assistant/tools.js';

const KEY = 'test-anis-tools-key';

describe('Anís tools API', () => {
  let server, spec, apiSchema;   // routes imported after the env is set (config reads PUBLIC_API_KEYS at import)
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.PUBLIC_API_KEYS = KEY;
    ({ apiSchema } = await import('../../api/routes/anis-tools.js'));
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
    spec = JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/docs/json' })).payload);
  }, 30000);
  afterAll(async () => { if (server) await server.close(); });

  const op = (name) => spec.paths?.[`/api/v1/tools/${name}`]?.post;
  const names = publicNames();

  it('the registry has public tools', () => { expect(names.length).toBeGreaterThan(10); });

  it.each(names)('%s: a documented route with purpose, input, output and an example', (name) => {
    const e = REGISTRY[name], o = op(name);
    expect(o, `swagger lists /api/v1/tools/${name}`).toBeDefined();
    expect(o.description).toContain(e.purpose);
    expect(o.requestBody?.content?.['application/json']?.schema?.properties).toBeDefined();
    expect(o.responses?.['200']?.content?.['application/json']?.schema).toBeDefined();
    expect(o.security).toEqual([{ apiKey: [] }]);
    expect(e.example?.input && e.example?.output).toBeTruthy();
  });

  it.each(names)('%s: its example input and output validate against its schemas', (name) => {
    const e = REGISTRY[name], ajv = new Ajv({ strict: false });
    expect(ajv.validate(apiSchema(e.input), e.example.input), JSON.stringify(ajv.errors)).toBe(true);
    expect(ajv.validate(apiSchema(e.output), e.example.output), JSON.stringify(ajv.errors)).toBe(true);
  });

  it('swagger lists GET /api/v1/tools and no alias or PROCESS routes', () => {
    expect(spec.paths['/api/v1/tools']?.get).toBeDefined();
    for (const a of ['search_library', 'about_work', 'combined_search', 'web_search', 'quotation_trace']) expect(spec.paths[`/api/v1/tools/${a}`]).toBeUndefined();
  });

  it('the legacy POST /api/v1/tools/search is still served', () => {
    expect(spec.paths['/api/v1/tools/search']?.post).toBeDefined();
  });

  it('auth is required', async () => {
    const a = await server.inject({ method: 'POST', url: '/api/v1/tools/work_notes_lookup', payload: { title: 'Kitáb-i-Íqán' } });
    expect(a.statusCode).toBe(401);
    const b = await server.inject({ method: 'GET', url: '/api/v1/tools' });
    expect(b.statusCode).toBe(401);
  });

  it('GET /api/v1/tools lists every public tool by canonical name', async () => {
    const r = await server.inject({ method: 'GET', url: '/api/v1/tools', headers: { 'x-api-key': KEY } });
    expect(r.statusCode).toBe(200);
    const tools = JSON.parse(r.payload).tools;
    expect(tools.map((t) => t.name)).toEqual(names);
    for (const t of tools) expect(t.label && t.purpose).toBeTruthy();
  });

  it('bad input → 400 {error:{code,message}}', async () => {
    const r = await server.inject({ method: 'POST', url: '/api/v1/tools/document_search', headers: { 'x-api-key': KEY }, payload: {} });
    expect(r.statusCode).toBe(400);
    const b = JSON.parse(r.payload);
    expect(b.error.code).toBe('invalid_input');
    expect(b.error.message).toMatch(/title/);
  });

  it('a retired alias is a 404 (no alias routes)', async () => {
    const r = await server.inject({ method: 'POST', url: '/api/v1/tools/about_work', headers: { 'x-api-key': KEY }, payload: { title: 'x' } });
    expect(r.statusCode).toBe(404);
  });

  it('an unknown tool → 404', async () => {
    const r = await server.inject({ method: 'POST', url: '/api/v1/tools/no_such_tool', headers: { 'x-api-key': KEY }, payload: {} });
    expect(r.statusCode).toBe(404);
  });
});
