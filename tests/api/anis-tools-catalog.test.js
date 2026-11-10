// The Anís tool catalog in the DB (anis-tools-repo): CRUD, the idempotent code-tool sync, HTTP tools defined by a row (executor: auth,
// mapping, timeout, error envelope), encrypted credentials that no list/GET/log ever shows, runtime registration live without a restart,
// disabled tools refusing, and code tools running with the store down.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import Fastify from 'fastify';

const KEY = vi.hoisted(() => (process.env.PUBLIC_API_KEYS = 'test-tools-catalog-key'));
const R = await import('../../api/lib/repos/anis-tools-repo.js');
const T = await import('../../api/lib/assistant/tools.js');
const { runHttpTool, fillBody, pickPath, mapOutput } = await import('../../api/lib/assistant/http-tool.js');

const SECRET = 's3cr3t-VALUE-never-shown';
const TOOL = {
  name: 'acme_lookup', label: 'Acme Lookup', purpose: 'Look one word up in the Acme glossary.',
  input: { type: 'object', additionalProperties: false, required: ['word'], properties: { word: { type: 'string', minLength: 1 } } },
  output: { type: 'object', properties: { meaning: { type: 'string' } } }, outputName: 'Gloss', timeoutMs: 800,
  http: { method: 'POST', url: 'https://acme.example/v1/gloss/{word}?lang=en', body: { term: '{word}', n: 1 }, auth: 'bearer', credential: 'acme', pick: { meaning: 'data.items[0].text' }, cost_usd: 0.002 },
};
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const freshDb = (planSeed = []) => R.openToolsDb(':memory:', { planSeed });

let db;
beforeEach(() => { process.env.TOOL_SECRETS_KEY = 'test-master-key'; db = freshDb(); R.resetToolsCache({ db }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => { delete process.env.TOOL_SECRETS_KEY; R.resetToolsCache(); });

describe('the repo', () => {
  it('seeds the plan rows once as planned/built, executor none', () => {
    const d = freshDb([{ id: 'guidance_x', name: 'Guidance', does: 'g', status: 'to build' }, { id: 'find_work', name: 'Find work', does: 'f', status: 'exists' }]);
    expect(R.getTool(d, 'guidance_x')).toMatchObject({ status: 'planned', executor: 'none', source: 'plan', plan: { status: 'to build' } });
    expect(R.getTool(d, 'find_work').status).toBe('built');
    expect(R.seedPlanTools(d, [{ id: 'later', name: 'L', status: 'to build' }])).toBe(0);   // seeded once: rows are data after that
    expect(R.getTool(d, 'later')).toBeNull();
  });

  it('register / update / status / list an HTTP tool; refuses bad rows and taken names', () => {
    const r = R.registerHttpTool(db, TOOL);
    expect(r).toMatchObject({ name: 'acme_lookup', executor: 'http', status: 'built', source: 'admin', timeoutMs: 800, http: { auth: 'bearer', credential: 'acme' } });
    const rev = R.revOf(db);
    R.registerHttpTool(db, { ...TOOL, label: 'Acme Gloss' });
    expect(R.getTool(db, 'acme_lookup').label).toBe('Acme Gloss');
    expect(R.revOf(db)).toBeGreaterThan(rev);
    expect(R.setToolStatus(db, 'acme_lookup', 'disabled')).toEqual({ name: 'acme_lookup', was: 'built', status: 'disabled' });
    expect(R.setToolStatus(db, 'nope_lookup', 'disabled')).toBeNull();
    expect(R.listTools(db).map((t) => t.name)).toContain('acme_lookup');
    expect(() => R.registerHttpTool(db, { ...TOOL, name: 'AcmeTool' })).toThrow(/snake_case/);
    expect(() => R.registerHttpTool(db, { ...TOOL, http: { ...TOOL.http, url: 'ftp://x' } })).toThrow(/http\(s\)/);
    expect(() => R.registerHttpTool(db, { ...TOOL, http: { ...TOOL.http, credential: null } })).toThrow(/credential/);
    R.syncCodeTools(db, [{ name: 'held_search', label: 'Held', purpose: 'p' }]);
    expect(() => R.registerHttpTool(db, { ...TOOL, name: 'held_search' })).toThrow(/code tool/);
  });

  it('credentials: AES-256-GCM at rest, rotate, delete; no key → refused', () => {
    R.setCredential(db, 'acme', SECRET);
    const raw = db.prepare('SELECT * FROM tool_credentials').get();
    expect(JSON.stringify(raw)).not.toContain(SECRET);
    expect(R.secretFor('acme')).toBe(SECRET);
    R.setCredential(db, 'acme', 'rotated');
    expect(R.secretFor('acme')).toBe('rotated');
    expect(R.secretFor('acme', R.secretsKey('another-key'))).toBeNull();   // wrong key → auth tag fails → nothing
    expect(R.deleteCredential(db, 'acme')).toBe(true);
    expect(R.secretFor('acme')).toBeNull();
    expect(() => R.setCredential(db, 'acme', SECRET, null)).toThrow(/TOOL_SECRETS_KEY/);
  });
});

describe('the code-tool sync', () => {
  const entries = () => T.codeToolMeta();
  it('is idempotent: the second run changes nothing and leaves the rev alone', () => {
    const first = R.syncCodeTools(db, entries());
    expect(first.added).toBe(Object.keys(T.REGISTRY).length);
    const rev = R.revOf(db);
    expect(R.syncCodeTools(db, entries())).toMatchObject({ unchanged: true });
    expect(R.revOf(db)).toBe(rev);
  });
  it('updates only a changed row, keeps an admin disable, removes a tool that left the code', () => {
    R.syncCodeTools(db, entries());
    R.setToolStatus(db, 'badi_calendar', 'disabled');
    const changed = entries().map((e) => (e.name === 'fused_search' ? { ...e, purpose: 'changed' } : e)).filter((e) => e.name !== 'author_lookup');
    expect(R.syncCodeTools(db, changed)).toMatchObject({ added: 0, updated: 1, removed: 1 });
    expect(R.getTool(db, 'fused_search').purpose).toBe('changed');
    expect(R.getTool(db, 'badi_calendar').status).toBe('disabled');
    expect(R.getTool(db, 'author_lookup')).toBeNull();
  });
});

describe('the HTTP executor', () => {
  const row = () => R.normalizeHttpTool(TOOL) && R.registerHttpTool(db, TOOL);
  const deps = (fetch, extra = {}) => ({ deps: { fetch, secretFor: async () => SECRET, secretsKey: Buffer.alloc(32), ...extra } });

  it('builds the URL, body and auth header, and maps the reply by the pick', async () => {
    const fetch = vi.fn(async () => jsonRes({ data: { items: [{ text: 'a gloss' }] } }));
    expect(await runHttpTool(row(), { word: 'a b' }, deps(fetch))).toEqual({ meaning: 'a gloss' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://acme.example/v1/gloss/a%20b?lang=en');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ term: 'a b', n: 1 });
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
  });
  it('basic and header:<Name> auth', async () => {
    const fetch = vi.fn(async () => jsonRes({ ok: 1 }));
    await runHttpTool({ ...row(), http: { ...row().http, auth: 'basic' } }, { word: 'x' }, deps(fetch));
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from(SECRET).toString('base64')}`);
    await runHttpTool({ ...row(), http: { ...row().http, auth: 'header:X-Api-Key' } }, { word: 'x' }, deps(fetch));
    expect(fetch.mock.calls[1][1].headers['X-Api-Key']).toBe(SECRET);
  });
  it('pure helpers: typed body fields, paths, picks', () => {
    expect(fillBody({ n: '{n}', s: 'q={q}', a: ['{q}'] }, { n: 3, q: 'w' })).toEqual({ n: 3, s: 'q=w', a: ['w'] });
    expect(pickPath({ a: [{ b: 2 }] }, '$.a[0].b')).toBe(2);
    expect(mapOutput({ x: 1 }, null)).toEqual({ x: 1 });
    expect(mapOutput([1, 2], null)).toEqual({ result: [1, 2] });
  });
  it('timeout → timeout (retryable), never an empty result', async () => {
    const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(runHttpTool({ ...row(), timeoutMs: 30 }, { word: 'x' }, deps(hang))).rejects.toMatchObject({ code: 'timeout', retryable: true });
  });
  it('error envelope: 5xx/429 unavailable (retryable), 4xx and non-JSON tool_failed, no key → unavailable; never the secret or URL', async () => {
    const errs = [];
    for (const [f, extra] of [[async () => jsonRes({}, 503)], [async () => jsonRes({}, 429)], [async () => jsonRes({}, 404)],
      [async () => ({ ok: true, status: 200, text: async () => '<html>' })], [async () => { throw new Error(`connect ${SECRET}`); }], [async () => jsonRes({}), { secretsKey: null }]]) {
      errs.push(await runHttpTool(row(), { word: 'x' }, deps(f, extra)).catch((e) => e));
    }
    expect(errs.map((e) => [e.code, e.retryable])).toEqual([['unavailable', true], ['unavailable', true], ['tool_failed', false], ['tool_failed', false], ['unavailable', true], ['unavailable', false]]);
    expect(errs[5].message).toMatch(/TOOL_SECRETS_KEY is not set/);
    for (const e of errs) { expect(e.message).not.toContain(SECRET); expect(e.message).not.toContain('acme.example'); }
  });
});

describe('live without a restart', () => {
  it('a tool registered at runtime is listed and callable through run(); its stats are counted', async () => {
    expect(T.publicNames()).not.toContain('acme_lookup');
    R.registerHttpTool(db, TOOL); R.setCredential(db, 'acme', SECRET); R.invalidateCatalog();
    expect(T.publicNames()).toContain('acme_lookup');
    expect(T.llmTools(['acme_lookup'])[0].function).toMatchObject({ name: 'acme_lookup', parameters: { required: ['word'] } });
    const stats = await import('../../api/lib/repos/strategy-stats-repo.js');
    const logged = vi.spyOn(stats, 'logToolRun').mockImplementation(() => {});
    const fetch = vi.fn(async () => jsonRes({ data: { items: [{ text: 'live' }] } }));
    expect(await T.run('acme_lookup', { word: 'x' }, { deps: { fetch } })).toEqual({ meaning: 'live' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SECRET}`);   // the stored, decrypted credential
    await expect(T.run('acme_lookup', { word: 5 }, { deps: { fetch } })).rejects.toMatchObject({ code: 'invalid_input' });
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.objectContaining({ tool: 'acme_lookup', ok: true })));
  });

  it('a disabled tool refuses (HTTP and code) and leaves the lists', async () => {
    R.registerHttpTool(db, TOOL); R.syncCodeTools(db, T.codeToolMeta());
    R.setToolStatus(db, 'acme_lookup', 'disabled'); R.setToolStatus(db, 'badi_calendar', 'disabled'); R.invalidateCatalog();
    await expect(T.run('acme_lookup', { word: 'x' }, { deps: { fetch: async () => jsonRes({}) } })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(T.run('badi_calendar', { date: '2025-03-20' })).rejects.toMatchObject({ code: 'unavailable', message: expect.stringMatching(/disabled/) });
    expect(T.publicNames()).not.toContain('acme_lookup');
    expect(T.publicNames()).not.toContain('badi_calendar');
    R.setToolStatus(db, 'badi_calendar', 'built'); R.invalidateCatalog();
    expect(await T.run('badi_calendar', { date: '2025-03-20' })).toMatchObject({ year: 182, naw_ruz: true });
  });

  it('the store down → code tools still run and list; HTTP tools are simply absent', async () => {
    const prev = process.env.ANIS_TOOLS_DB;
    process.env.ANIS_TOOLS_DB = '/dev/null/no/such/dir/tools.db';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    R.resetToolsCache();
    try {
      expect(R.catalog().source).toBe('none');
      expect(await T.run('badi_calendar', { date: '2025-03-20' })).toMatchObject({ year: 182 });
      expect(T.publicNames()).toEqual(Object.keys(T.REGISTRY));
    } finally { process.env.ANIS_TOOLS_DB = prev ?? ''; if (prev == null) delete process.env.ANIS_TOOLS_DB; R.resetToolsCache({ db }); }
  });
});

describe('over HTTP: the contract API and the admin API', () => {
  const app = async () => {
    const f = Fastify();
    f.register((await import('../../api/routes/anis-tools.js')).default, { prefix: '/api/v1' });
    f.register((await import('../../api/routes/anis-tools-admin.js')).default, { prefix: '/api/admin', deps: { db } });
    await f.ready();
    return f;
  };
  const admin = { 'x-internal-key': 'test-internal' };
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'test-internal'; process.env.DEPLOY_SECRET = 'test-internal'; });

  it('GET /api/v1/tools lists and POST /api/v1/tools/{name} runs a tool registered after boot', async () => {
    const f = await app();
    expect((await f.inject({ method: 'POST', url: '/api/v1/tools/acme_lookup', headers: { 'x-api-key': KEY }, payload: { word: 'x' } })).statusCode).toBe(404);
    expect((await f.inject({ method: 'POST', url: '/api/admin/ops/tools', headers: admin, payload: TOOL })).statusCode).toBe(200);
    expect((await f.inject({ method: 'PUT', url: '/api/admin/ops/tools/credentials/acme', headers: admin, payload: { secret: SECRET } })).statusCode).toBe(200);
    const listed = JSON.parse((await f.inject({ method: 'GET', url: '/api/v1/tools', headers: { 'x-api-key': KEY } })).payload).tools;
    expect(listed.find((t) => t.name === 'acme_lookup')).toMatchObject({ label: 'Acme Lookup', input: { required: ['word'] } });
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ data: { items: [{ text: 'over http' }] } })));
    const r = await f.inject({ method: 'POST', url: '/api/v1/tools/acme_lookup', headers: { 'x-api-key': KEY }, payload: { word: 'x' } });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.payload)).toEqual({ meaning: 'over http' });
    await f.close();
  });

  it('the secret never appears in list, GET, test-call or log output', async () => {
    const logs = [];
    for (const m of ['log', 'warn', 'error', 'info']) vi.spyOn(console, m).mockImplementation((...a) => logs.push(a.join(' ')));
    const f = await app();
    await f.inject({ method: 'POST', url: '/api/admin/ops/tools', headers: admin, payload: TOOL });
    const put = await f.inject({ method: 'PUT', url: '/api/admin/ops/tools/credentials/acme', headers: admin, payload: { secret: SECRET } });
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ error: SECRET }, 500)));
    const test = await f.inject({ method: 'POST', url: '/api/admin/ops/tools/acme_lookup/test', headers: admin, payload: { input: { word: 'x' } } });
    const list = await f.inject({ method: 'GET', url: '/api/admin/ops/tools', headers: admin });
    expect(JSON.parse(list.payload)).toMatchObject({ key_set: true, credentials: [{ name: 'acme', used_by: ['acme_lookup'] }] });
    expect(JSON.parse(test.payload)).toMatchObject({ name: 'acme_lookup', ok: false, error: { code: 'unavailable' } });
    for (const out of [put.payload, test.payload, list.payload, ...logs]) expect(out).not.toContain(SECRET);
    expect((await f.inject({ method: 'GET', url: '/api/admin/ops/tools' })).statusCode).toBe(401);   // X-Internal-Key required
    await f.close();
  });

  it('test-call returns output + ms; status on/off; no key → credential refused with 503', async () => {
    const f = await app();
    await f.inject({ method: 'POST', url: '/api/admin/ops/tools', headers: admin, payload: { ...TOOL, http: { ...TOOL.http, auth: 'none', credential: null } } });
    await f.inject({ method: 'POST', url: '/api/admin/ops/tools/acme_lookup/status', headers: admin, payload: { status: 'disabled' } });
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ data: { items: [{ text: 'dry' }] } })));
    const t = JSON.parse((await f.inject({ method: 'POST', url: '/api/admin/ops/tools/acme_lookup/test', headers: admin, payload: { input: { word: 'x' } } })).payload);
    expect(t).toMatchObject({ name: 'acme_lookup', ok: true, output: { meaning: 'dry' } });
    expect(typeof t.ms).toBe('number');
    delete process.env.TOOL_SECRETS_KEY;
    const put = await f.inject({ method: 'PUT', url: '/api/admin/ops/tools/credentials/acme', headers: admin, payload: { secret: SECRET } });
    expect(put.statusCode).toBe(503);
    expect(put.payload).not.toContain(SECRET);
    await f.close();
  });
});
