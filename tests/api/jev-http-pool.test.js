// jevHttpFetch: Jev calls share one kept-alive pool (no fresh TCP+TLS per turn); a stubbed fetch is always honoured.
import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'http';

process.env.JEV_KEEP_WARM = '0';
const { jevHttpFetch, jevFetch } = await import('../../api/lib/systemone.js');

describe('jev http pool', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no new socket after an idle gap longer than the 4 s default idle limit would have closed it', async () => {
    let sockets = 0;
    const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end('{"answers":{}}'); });
    srv.keepAliveTimeout = 60_000;
    srv.on('connection', () => { sockets++; });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}/v1/systemone`;
    try {
      const call = async () => { const r = await jevHttpFetch(url, { method: 'POST', body: '{}' }); await r.json(); return r.ok; };
      for (let i = 0; i < 3; i++) expect(await call()).toBe(true);
      const before = sockets;   // back-to-back calls may open a second socket before the first is handed back
      await new Promise((r) => setTimeout(r, 4500));
      expect(await call()).toBe(true);
      expect(sockets).toBe(before);   // the idle socket survived the gap: no new handshake
    } finally { srv.closeAllConnections(); srv.close(); }
  }, 10_000);

  it('a stubbed global fetch is used instead of the pool (tests never reach the network)', async () => {
    const stub = vi.fn(async () => new Response('{"answers":{"x":{"a":1}}}', { status: 200 }));
    vi.stubGlobal('fetch', stub);
    const r = await jevFetch('test-task')('https://api.typesafe.ai/v1/systemone', { method: 'POST', body: '{"state":"s","questions":[]}' });
    expect(stub).toHaveBeenCalledTimes(1);
    expect((await r.json()).answers.x.a).toBe(1);
  });
});
