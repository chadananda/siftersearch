// THE GATEWAY (siftersearch-gateway, port 7839 — where the Cloudflare tunnel and every internal caller already point).
// docs/architecture/continuous-deploy.md; Chad 10-19: "we might be updating Anís while search API and index API continue to
// feed through cloudflare" · "3,000 users per day with dozens of updates not interrupting Anís conversations".
// Routes each request by path to its service: Anís (conversations, letters, reading guide, widget), ops (service health,
// reports) or the search API (everything else). A service in the middle of a restart refuses connections for a moment:
// the request is retried for up to 10 s (safe even for a POST — a refused connection sent nothing), then a clear 503.
// Responses (SSE conversations included) stream straight through. Tiny on purpose and rarely changed: it is the one
// process every request passes. Deps: node:http, service-heartbeat.
import http from 'node:http';
import { startHeartbeat } from './lib/service-heartbeat.js';

export const SERVICES = {
  search: Number(process.env.GATEWAY_SEARCH_PORT || 7845),
  anis: Number(process.env.GATEWAY_ANIS_PORT || 7844),
  ops: Number(process.env.GATEWAY_OPS_PORT || 7843),
};
const ANIS = /^\/(api\/(chat|v1\/anis|v1\/reading|v1\/companion|v1\/widget)(\/|$|\?)|widget(\.js|\/))/;
const OPS = /^\/api\/admin\/ops(\/|$|\?)/;

/** Which service a path belongs to. Pure. */
export const routeFor = (path) => (OPS.test(path) ? 'ops' : ANIS.test(path) ? 'anis' : 'search');

const RETRY_MS = Number(process.env.GATEWAY_RETRY_MS || 10_000);
const MAX_BODY = 25 * 1024 * 1024;
const agents = Object.fromEntries(Object.keys(SERVICES).map((k) => [k, new http.Agent({ keepAlive: true, maxSockets: 512 })]));
const stats = { inflight: 0, served: { search: 0, anis: 0, ops: 0 }, retried: 0, unavailable: 0 };

function forward(service, req, res, body, started) {
  const up = http.request({ host: '127.0.0.1', port: SERVICES[service], method: req.method, path: req.url, agent: agents[service],
    headers: { ...req.headers, 'x-gateway-service': service } }, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });
  up.on('error', (err) => {
    // refused / reset before a response = the service is restarting: try again, then a clear 503
    if (!res.headersSent && ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(err.code) && Date.now() - started < RETRY_MS) {
      stats.retried++;
      setTimeout(() => forward(service, req, res, body, started), 250);
      return;
    }
    if (!res.headersSent) {
      stats.unavailable++;
      res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5' });
      res.end(JSON.stringify({ error: 'service_restarting', service, message: 'This part of SifterSearch is restarting — please retry in a few seconds.' }));
    } else res.destroy(err);
  });
  // the reader went away before the answer finished: stop the work upstream (res 'close' — a request's own 'close' fires
  // as soon as its body is read, which would cancel every request)
  res.once('close', () => { if (!res.writableFinished) up.destroy(); });
  up.end(body);
}

export function createGateway() {
  return http.createServer((req, res) => {
    if (req.url === '/gateway/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, services: SERVICES, ...stats }));
    }
    const service = routeFor(req.url);
    stats.inflight++; stats.served[service]++;
    res.on('close', () => { stats.inflight--; });
    // the body is buffered so a request can be re-sent while its service restarts (bodies here are small: queries, chat turns)
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { res.writeHead(413); res.end(); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!res.writableEnded) forward(service, req, res, Buffer.concat(chunks), Date.now()); });
  });
}

// run as the service (node api/gateway.js, or under pm2 — whose cluster mode makes argv[1] its own container script, so
// the real entry is in pm_exec_path); imported by tests, it only exports
if ([process.argv[1], process.env.pm_exec_path].some((p) => String(p || '').endsWith('gateway.js'))) {
  const port = Number(process.env.GATEWAY_PORT || 7839);
  const server = createGateway();
  server.keepAliveTimeout = 76_000; server.headersTimeout = 80_000;   // longer than Cloudflare's idle keep-alive
  // the port may still be held for a moment by the API instance it replaces (the one-time cut-over): keep trying
  const listen = () => server.listen(port, '0.0.0.0', () => { console.log(JSON.stringify({ gateway: 'listening', port, services: SERVICES })); process.send?.('ready'); });
  server.on('error', (err) => { if (err.code === 'EADDRINUSE') setTimeout(listen, 250); else throw err; });
  listen();
  startHeartbeat({ name: 'siftersearch-gateway', state: () => ({ ...stats }) });
  // a gateway reload is rare: stop accepting, let streams (Anís conversations) finish, then go
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 290_000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
