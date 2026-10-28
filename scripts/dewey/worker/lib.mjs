// Dewey worker core: runs a work order from tower (fetch a URL | unpack an uploaded archive) on a WORKER host, never on tower.
// Talks to tower only through the internal API (client injected). Deps: api/lib/dewey/{net-guard,archive-safe}.js (pure Node).
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, stat, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { guardedRequest, parseTarget, robotsAllowed, isMediaPage, GuardError } from '../../../api/lib/dewey/net-guard.js';
import { listZip, planEntries, extractEntry, classifyEntry, flatName, sniff, extOf, ArchiveError, LIMITS as ZIP } from '../../../api/lib/dewey/archive-safe.js';

export class OrderError extends Error { constructor(msg, retryable = false) { super(msg); this.retryable = retryable; } }

/** ClamAV when installed (clamscan/clamdscan on PATH); otherwise null and the file-type checks stand alone (recorded in the result). */
export async function makeScanner({ bin = process.env.DEWEY_CLAMSCAN || 'clamscan', run = spawnOut } = {}) {
  try { const v = await run(bin, ['--version']); if (v.code !== 0) return null; } catch { return null; }
  return async (path) => { const r = await run(bin, ['--no-summary', path]); return r.code === 1 ? { infected: true, sig: /: (.+) FOUND/.exec(r.out)?.[1] || 'malware' } : { infected: false }; };
}
function spawnOut(cmd, args) {
  return new Promise((resolve, reject) => { const p = spawn(cmd, args); let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('error', reject); p.on('close', (code) => resolve({ code, out })); });
}

const sha256File = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const headOf = async (path, n = 512) => { const fh = await open(path, 'r'); try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, 0); return b.slice(0, bytesRead); } finally { await fh.close(); } };

/** Name for a downloaded file: Content-Disposition, else the URL's last segment; extension repaired from the bytes when missing. */
export function nameFromResponse(url, headers = {}, head = null) {
  const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(headers['content-disposition'] || '')?.[1];
  let n = cd ? decodeURIComponent(cd) : decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname);
  n = flatName(n);
  if (!extOf(n) && head) { const s = sniff(head); const ext = { pdf: 'pdf', zip: 'zip', mp3: 'mp3', html: 'html', rtf: 'rtf', flac: 'flac', ogg: 'ogg', mp4: 'mp4' }[s]; if (ext) n += `.${ext}`; else if ((headers['content-type'] || '').includes('html')) n += '.html'; }
  return n;
}

/** Decide, scan and upload each file of a download. Entries come from a single file or an unpacked archive (nested to `depth`). */
export async function processFiles(files, ctx) {
  const { order, api, scratch, scan = null, log = () => {} } = ctx;
  const out = [];
  for (const f of files) {
    const head = await headOf(f.path);
    const c = classifyEntry(f.name, head);
    if (c.kind === 'skip') { out.push({ name: f.name, from: f.from, status: 'skipped', reason: c.reason, bytes: f.bytes ?? 0 }); continue; }
    if (scan) { const r = await scan(f.path).catch(() => ({ infected: false })); if (r.infected) { out.push({ name: f.name, from: f.from, status: 'skipped', reason: `the virus scanner flagged it (${r.sig})`, bytes: f.bytes ?? 0 }); continue; } }
    const sha256 = f.sha256 || await sha256File(f.path);
    const up = await api.upload(order.id, f.path, { name: f.name, kind: c.kind, sha256 });
    out.push({ name: up.name || f.name, from: f.from, status: 'ok', kind: c.kind, ext: c.ext, bytes: up.bytes, sha256: up.sha256 || sha256 });
    await rm(f.path, { force: true });
    await api.event(order.id, { type: 'progress', step: 'upload', detail: `${out.filter((x) => x.status === 'ok').length} files sent to the library`, entries: out.length });
  }
  return out;
}

/** Unpack a ZIP (and ZIPs inside it, to order.limits.depth) into scratch files. → { files:[{path,name,from,bytes,sha256}], skipped:[{name,reason}] } */
export async function unpackZip(zipPath, ctx, depth = 1, prefix = '', budget = { entries: 0, bytes: 0 }) {
  const { order, scratch } = ctx, L = { ...ZIP, ...(order.limits?.zip || {}) };
  const fileSize = (await stat(zipPath)).size;
  const entries = await listZip(zipPath, L);
  const { take, skip } = planEntries(entries, L, { maxTake: Math.max(0, (order.limits?.maxEntries ?? L.entries) - budget.entries), fileSize });
  const files = [], skipped = skip.map((s) => ({ ...s, name: prefix + s.name }));
  await mkdir(join(scratch, 'x'), { recursive: true });
  let i = 0;
  for (const e of take) {
    const dest = join(scratch, 'x', `${depth}-${++i}-${e.flat}`.slice(0, 200));
    let r;
    try { r = await extractEntry(zipPath, e, createWriteStream(dest), { maxBytes: Math.min(L.entryMax, L.expanded - budget.bytes) }); }
    catch (err) { await rm(dest, { force: true }); if (err.code === 'BOMB') throw err; skipped.push({ name: prefix + e.name, reason: `could not be unpacked (${err.message})` }); continue; }
    budget.bytes += r.bytes; budget.entries++;
    if (budget.bytes > L.expanded) throw new ArchiveError('the archive expands past the size limit — refused', 'BOMB');
    const c = classifyEntry(e.flat, r.head);
    if (c.kind === 'archive') {
      if (depth >= (order.limits?.depth ?? L.depth)) { skipped.push({ name: prefix + e.name, reason: `archives nested more than ${L.depth} deep are not opened` }); await rm(dest, { force: true }); continue; }
      const inner = await unpackZip(dest, ctx, depth + 1, `${prefix}${e.name} › `, budget);
      files.push(...inner.files); skipped.push(...inner.skipped); await rm(dest, { force: true });
    } else files.push({ path: dest, name: e.flat, from: prefix + e.name, bytes: r.bytes, sha256: r.sha256 });
  }
  return { files, skipped };
}

/** Download a URL (resumable, size-capped, every hop SSRF-checked). → { path, name, bytes, contentType, finalUrl } */
export async function download(order, ctx, { request = guardedRequest } = {}) {
  const { api, scratch } = ctx, L = order.limits || {};
  parseTarget(order.url);
  if (isMediaPage(order.url)) throw new OrderError('this is a video or audio page — it goes to the media library, not to a file download');
  const part = join(scratch, 'download.part');
  await mkdir(scratch, { recursive: true });
  const have = await stat(part).then((s) => s.size).catch(() => 0);
  const { res, url: finalUrl } = await request(order.url, { headers: have ? { range: `bytes=${have}-` } : {}, polite: true });
  if (res.statusCode >= 400) { res.resume(); throw new OrderError(`the site answered ${res.statusCode}`, res.statusCode >= 500 || res.statusCode === 429); }
  const ctype = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (ctype.includes('html')) {   // a page, not a file: only when the site's robots.txt allows
    const ok = await (ctx.robots || robotsAllowed)(finalUrl);
    if (!ok.allowed) { res.resume(); throw new OrderError(ok.why || 'robots.txt does not allow fetching this page'); }
  }
  const resumed = res.statusCode === 206;
  const total = resumed ? Number(/\/(\d+)$/.exec(res.headers['content-range'] || '')?.[1]) || null : Number(res.headers['content-length']) || null;
  const cap = Math.min(L.maxBytes ?? 2 * 1024 ** 3, L.remainingBytes ?? Infinity);
  if (total && total > cap) { res.resume(); throw new OrderError(`the file is ${(total / 1024 ** 2).toFixed(0)} MB; the limit for this request is ${(cap / 1024 ** 2).toFixed(0)} MB`); }
  let bytes = resumed ? have : 0, lastEv = 0, abort = null;
  const sink = createWriteStream(part, { flags: resumed ? 'a' : 'w' });
  const guard = async function* (src) {
    for await (const chunk of src) {
      bytes += chunk.length;
      if (bytes > cap) throw new OrderError(`the download passed its ${(cap / 1024 ** 2).toFixed(0)} MB limit — stopped`);
      if (Date.now() - lastEv > 4000) { lastEv = Date.now(); const r = await api.event(order.id, { type: 'progress', step: 'download', bytes, total, detail: 'downloading' }); if (r?.abort) { abort = r.reason || 'stopped by the limit on your account'; throw new OrderError(abort); } }
      yield chunk;
    }
  };
  await pipeline(res, guard, sink);
  const head = await headOf(part);
  const name = nameFromResponse(finalUrl, res.headers, head);
  const path = join(scratch, name);
  await rename(part, path);
  return { path, name, bytes, contentType: ctype, finalUrl };
}

/** Run one order end to end. → the result tower records (entries, skipped, scanner). Throws OrderError(retryable) / GuardError / ArchiveError. */
export async function runOrder(order, { api, scratchRoot, scan = null, request, edgeFetch = fetch, robots } = {}) {
  const scratch = join(scratchRoot, String(order.id));
  await mkdir(scratch, { recursive: true });
  const ctx = { order, api, scratch, scan, robots };
  let src;
  if (order.op === 'fetch') {
    await api.event(order.id, { type: 'progress', step: 'download', detail: 'connecting' });
    src = await download(order, ctx, { request });
  } else if (order.op === 'unpack') {
    await api.event(order.id, { type: 'progress', step: 'download', detail: 'copying the upload from storage' });
    const r = order.source.input ? await api.input(order.id) : await edgeFetch(`${order.edge.origin}/_dewey/blob?key=${encodeURIComponent(order.source.key)}`, { headers: { 'x-internal-key': order.edge.key } });
    if (!r.ok) throw new OrderError(`the stored upload could not be read (${r.status})`, true);
    const path = join(scratch, 'upload.zip');
    await pipeline(Readable.fromWeb(r.body), createWriteStream(path));
    src = { path, name: order.params?.name || 'upload.zip', bytes: (await stat(path)).size };
  } else throw new OrderError(`unknown order ${order.op}`);
  await api.event(order.id, { type: 'progress', step: 'inspect', detail: 'looking inside', bytes: src.bytes, total: src.bytes });
  const head = await headOf(src.path);
  let files, skipped = [];
  if (sniff(head) === 'zip' && /\.zip$/i.test(src.name)) {
    const u = await unpackZip(src.path, ctx);
    files = u.files; skipped = u.skipped;
    await api.event(order.id, { type: 'progress', step: 'inspect', detail: `${files.length} files found in the archive`, found: files.length + skipped.length });
  } else files = [{ path: src.path, name: src.name, from: null, bytes: src.bytes }];
  const entries = await processFiles(files, ctx);
  for (const s of skipped) entries.push({ name: s.name, status: 'skipped', reason: s.reason, bytes: 0 });
  await rm(scratch, { recursive: true, force: true });
  return { entries, scanner: scan ? 'clamav' : 'none', source: { name: src.name, bytes: src.bytes, url: src.finalUrl || null, content_type: src.contentType || null }, bytes_fetched: src.bytes };
}

export const errorKind = (e) => (e instanceof OrderError ? { retryable: e.retryable } : e instanceof GuardError ? { retryable: ['DNS', 'TIMEOUT'].includes(e.code) } : e instanceof ArchiveError ? { retryable: false } : { retryable: true });
