// The gateway (docs/architecture/continuous-deploy.md): each request to its service; a restarting service is retried, not
// failed; conversations stream through.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

const ports = { search: 47845, anis: 47844, ops: 47843 };
process.env.GATEWAY_SEARCH_PORT = ports.search; process.env.GATEWAY_ANIS_PORT = ports.anis; process.env.GATEWAY_OPS_PORT = ports.ops;
process.env.GATEWAY_RETRY_MS = '1500';
const { routeFor, createGateway } = await import('../../api/gateway.js');

const upstream = (name, port, handler) => new Promise((r) => { const s = http.createServer(handler || ((req, res) => { res.end(`${name} ${req.method} ${req.url}`); })); s.listen(port, () => r(s)); });
const get = (port, path, opts = {}) => new Promise((r, j) => {
  const req = http.request({ port, path, method: opts.method || 'GET', headers: opts.headers }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => r({ status: res.statusCode, body: b })); });
  req.on('error', j); req.end(opts.body);
});

describe('gateway routing', () => {
  it('Anís, ops and search paths', () => {
    expect(routeFor('/api/chat/stream')).toBe('anis');
    expect(routeFor('/api/v1/anis/draft')).toBe('anis');
    expect(routeFor('/api/v1/widget/config/abc')).toBe('anis');
    expect(routeFor('/widget.js')).toBe('anis');
    expect(routeFor('/api/admin/ops/services')).toBe('ops');
    expect(routeFor('/api/admin/docs/5')).toBe('search');
    expect(routeFor('/api/search?q=x')).toBe('search');
    expect(routeFor('/api/v1/anisette')).toBe('search');
  });
});

describe('gateway proxying', () => {
  let gw; const ups = [];
  beforeAll(async () => { gw = createGateway(); await new Promise((r) => gw.listen(47839, r)); ups.push(await upstream('search', ports.search), await upstream('ops', ports.ops)); });
  afterAll(() => { gw.close(); for (const u of ups) u.close(); });
  it('sends each request to its service, body included', async () => {
    expect((await get(47839, '/api/search?q=love')).body).toBe('search GET /api/search?q=love');
    expect((await get(47839, '/api/admin/ops/services')).body).toBe('ops GET /api/admin/ops/services');
  });
  it('a service that is restarting is retried — the request succeeds once it is back', async () => {
    setTimeout(() => upstream('anis', ports.anis, (req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => res.end(`anis got ${b}`)); }).then((s) => ups.push(s)), 400);
    const r = await get(47839, '/api/chat/stream', { method: 'POST', body: '{"q":"chamber"}' });
    expect(r).toEqual({ status: 200, body: 'anis got {"q":"chamber"}' });
  });
  it('a service down past the retry window gets a clear 503', async () => {
    const down = await new Promise((r) => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
    process.env.GATEWAY_OPS_PORT = String(down);
    const { createGateway: fresh } = await import('../../api/gateway.js?down');
    const g2 = fresh(); await new Promise((r) => g2.listen(47838, r));
    const r = await get(47838, '/api/admin/ops/services');
    g2.close();
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body).error).toBe('service_restarting');
  });
  it('streams a conversation through as it is written', async () => {
    const s = await upstream('sse', 47846, (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: one\n\n'); setTimeout(() => { res.write('data: two\n\n'); res.end(); }, 100); });
    process.env.GATEWAY_SEARCH_PORT = '47846';
    const { createGateway: g3f } = await import('../../api/gateway.js?sse');
    const g3 = g3f(); await new Promise((r) => g3.listen(47837, r));
    const first = await new Promise((r) => http.get({ port: 47837, path: '/api/search/stream' }, (res) => res.once('data', (c) => { r(String(c)); res.destroy(); })));
    g3.close(); s.close();
    expect(first).toBe('data: one\n\n');   // the first event arrived before the stream ended
  });
});
