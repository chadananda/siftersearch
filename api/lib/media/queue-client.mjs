// Media job queue client (worker/queue): the same calls for tower (ADMIN key) and machines (QUEUE key). Node builtins only — tower ships this
// file to hosts beside scripts/media/worker/queue-agent.mjs. Files move BY ID: list/get/put under files/<file_id>/ (staged inputs) and
// results/<job_id>/ (outputs); a LAN base serving the same paths swaps in by changing `base` alone (Chad 10-30).
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_BASE = 'https://siftersearch.com/_q';
export const DIRECT_MAX = 90e6;   // matches worker/queue/index.js
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export function queueClient({ base = process.env.MEDIA_QUEUE_URL || DEFAULT_BASE, key, fetch: f = globalThis.fetch, timeoutMs = 120_000 } = {}) {
  if (!key) throw new Error('queue key required');
  const hdr = { 'x-queue-key': key };
  const fail = async (what, r) => { const b = await r.text().catch(() => ''); const e = new Error(`${what} ${r.status}: ${b.slice(0, 300)}`); e.status = r.status; return e; };
  async function call(op, body = {}) {
    const r = await f(`${base}/${op}`, { method: 'POST', headers: { ...hdr, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (r.status === 204) return null;
    if (!r.ok) throw await fail(op, r);
    return r.json();
  }
  // a signed R2 url never gets our key: redirects are followed by hand
  async function get(kind, id, name, dest) {
    const r = await f(`${base}/${kind}/${enc(id)}/${enc(name)}`, { headers: hdr, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
    const body = loc ? await f(loc, { signal: AbortSignal.timeout(30 * 60_000) }) : r;
    if (!body.ok) throw await fail(`get ${kind}/${id}/${name}`, body);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(body.body), createWriteStream(dest));
    return dest;
  }
  async function put(kind, id, name, file, { lease } = {}) {
    const bytes = (await stat(file)).size;
    const send = (url, headers) => f(url, { method: 'PUT', headers: { ...headers, 'content-length': String(bytes) }, body: Readable.toWeb(createReadStream(file)), duplex: 'half', redirect: 'manual', signal: AbortSignal.timeout(30 * 60_000) });
    const url = `${base}/${kind}/${enc(id)}/${enc(name)}${lease ? `?lease=${encodeURIComponent(lease)}` : ''}`;
    // > 90 MB: Cloudflare's edge 413s bodies over 100 MB before the Worker runs, so ask with an EMPTY put (the Worker answers 307 to a signed url)
    // (x-queue-size marks it a probe: tower's LAN queue answers 307 to the same url, the edge ignores it)
    let r = bytes > DIRECT_MAX ? await f(url, { method: 'PUT', headers: { ...hdr, 'content-length': '0', 'x-queue-size': String(bytes) }, body: '', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }) : await send(url, hdr);
    if (r.status === 307) {   // straight to R2 on the signed url; our key only ever goes back to our own origin
      const loc = new URL(r.headers.get('location'), url);
      r = await send(loc.href, loc.origin === new URL(url).origin ? hdr : {});
    }
    if (!r.ok) throw await fail(`put ${kind}/${id}/${name}`, r);
    return { key: `${kind === 'files' ? 'stage' : 'results'}/${id}/${name}`, bytes };
  }
  async function list(kind, id) {
    const r = await f(`${base}/${kind}/${enc(id)}/`, { headers: hdr, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw await fail(`list ${kind}/${id}`, r);
    return r.json();
  }
  return {
    base, call, get, put, list,
    claim: (a) => call('claim', a), heartbeat: (a) => call('heartbeat', a), done: (a) => call('done', a), fail: (a) => call('fail', a),
    enqueue: (jobs) => call('enqueue', { jobs }), capacity: () => call('capacity'), stats: () => call('stats'),
    listDone: (limit = 50) => call('list-done', { limit }), ack: (ids) => call('ack', { ids }), cancel: (ids) => call('cancel', { ids }), withdraw: (ids) => call('withdraw', { ids }),
  };
}
