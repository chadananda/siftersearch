#!/usr/bin/env node
// Dewey worker (run on aorus / boss / a pod — NEVER on tower): claims fetch / unpack orders from tower's internal API, does the download,
// the unzip and the scan locally, streams the surviving files back, reports. Env: DEWEY_TOWER (default http://tower-nas:7839),
// INTERNAL_API_KEY (tower's X-Internal-Key = its DEPLOY_SECRET; either name), DEWEY_OPS (fetch,unpack), DEWEY_WORKER (name), DEWEY_SCRATCH (default /tmp/dewey-worker). Until the one-image worker (planning/worker-image-
// design-20261028.md) carries it, run `node scripts/dewey/worker/dewey-worker.mjs` under systemd/pm2 on a worker box.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { Readable } from 'node:stream';
import { runOrder, makeScanner, errorKind } from './lib.mjs';

try { (await import('dotenv')).default.config({ path: '.env-secrets', quiet: true }); } catch { /* a bare worker box has no dotenv: env comes from the shell */ }
const TOWER = process.env.DEWEY_TOWER || 'http://tower-nas:7839', KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY, WORKER = process.env.DEWEY_WORKER || hostname();
const H = { 'x-internal-key': KEY, 'x-dewey-worker': WORKER };
const base = `${TOWER}/api/admin/ops/dewey-jobs`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (path, body, method = 'POST') => {
  const r = await fetch(`${base}${path}`, { method, headers: { ...H, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`tower ${path} ${r.status}`);
  return r.json();
};
export const api = {
  claim: () => json('/claim', { worker: WORKER, ops: (process.env.DEWEY_OPS || 'fetch,unpack').split(',') }),   // tower's own fetcher runs DEWEY_OPS=fetch under in-slice.sh
  event: (id, ev) => json(`/${id}/event`, ev).catch(() => ({})),
  complete: (id, result) => json(`/${id}/complete`, { result }),
  fail: (id, error, retryable) => json(`/${id}/fail`, { error, retryable }),
  input: (id) => fetch(`${base}/${id}/input`, { headers: H }),
  async upload(id, path, { name, kind, sha256 }) {
    const size = (await stat(path)).size;
    const r = await fetch(`${base}/${id}/blob?name=${encodeURIComponent(name)}&kind=${kind}`, { method: 'PUT', duplex: 'half', body: Readable.toWeb(createReadStream(path)),
      headers: { ...H, 'content-type': 'application/octet-stream', 'content-length': String(size), 'x-sha256': sha256 } });
    if (!r.ok) throw new Error(`upload ${name}: tower ${r.status} ${(await r.text()).slice(0, 120)}`);
    return r.json();
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!KEY) { console.error('INTERNAL_API_KEY is required'); process.exit(1); }
  const scan = await makeScanner();
  console.log(`dewey-worker ${WORKER} → ${TOWER}; virus scanner: ${scan ? 'clamav' : 'none (file-type checks only)'}`);
  for (;;) {
    let order = null;
    try { order = (await api.claim()).order; } catch (e) { console.error('claim failed:', e.message); }
    if (!order) { await sleep(5000); continue; }
    console.log(`order ${order.id} ${order.op} ${order.url || order.source?.key}`);
    try {
      const result = await runOrder(order, { api, scratchRoot: process.env.DEWEY_SCRATCH || '/tmp/dewey-worker', scan });
      await api.complete(order.id, result);
      if (order.op === 'unpack' && order.source?.key) await fetch(`${order.edge.origin}/_dewey/blob?key=${encodeURIComponent(order.source.key)}`, { method: 'DELETE', headers: { 'x-internal-key': order.edge.key } }).catch(() => {});   // the stored upload is done with
      console.log(`order ${order.id} done: ${result.entries.filter((e) => e.status === 'ok').length} files`);
    } catch (e) {
      console.error(`order ${order.id} failed:`, e.message);
      await api.fail(order.id, e.message, errorKind(e).retryable).catch(() => {});
    }
  }
}
