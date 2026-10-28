// Tower's side of the Dewey worker contract (scripts/dewey/worker): hand out fetch / unpack orders, take progress and the finished
// result, receive each surviving file as a streamed blob (disk only — no processing on tower), then turn entries into child jobs.
// Tower never fetches or unpacks: with no worker the job waits (state received, "waiting for a worker").
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { makeRegistry } from './registry.js';
import { LIMITS, limitsFor, checkCap, whoOf, trustLevel, valve } from './policy.js';
import { isTerminal } from './states.js';
import { isPowerHold } from '../../power-mode.js';

const GB = 1024 ** 3;
export const inboxDir = () => process.env.DEWEY_INGEST_DIR || '/tank/dewey-ingest/new';
export const mediaDir = () => process.env.DEWEY_MEDIA_DIR || join(dirname(inboxDir()), 'media');
export const safeBlobName = (n) => String(n).split(/[\\/]/).pop().normalize('NFC').replace(/[\u0000-\u001f]/g, '').replace(/[^\p{L}\p{N}._ ()&,'’-]+/gu, '_').replace(/^\.+/, '').slice(0, 150) || 'file';
export const blobPath = (jobId, kind, name) => join(kind === 'media' ? mediaDir() : join(inboxDir(), 'jobs'), String(Number(jobId)), safeBlobName(name));

/** Provenance beside a dropped media file (<file>.source.json), like the Archive.org imports write. */
const writeSidecar = (file, data) => writeFile(`${file}.source.json`, JSON.stringify(data, null, 1));

export function makeWorkerApi({ repo = realRepo, reg = makeRegistry(repo), countAccepted = async (e) => (await import('../../repos/dewey-repo.js')).acceptedCountBy(e), trust = null, power = isPowerHold } = {}) {
  const trustOf = (by) => (trust ? trust(by) : trustLevel(by, countAccepted));

  async function buildOrder(job) {
    const by = job.created_by, lim = limitsFor(by), used = await repo.usageOf(whoOf(by));
    const remaining = Math.max(0, lim.bytes - Number(used.bytes || 0));
    const t = await trustOf(by);
    const limits = { maxBytes: Math.min(LIMITS.fetchBytes.archive, remaining), remainingBytes: remaining, maxEntries: t >= 1 ? LIMITS.zipEntries : LIMITS.newContributorEntries, depth: LIMITS.zipDepth,
      zip: { entries: LIMITS.zipEntries, expanded: LIMITS.zipBytes, depth: LIMITS.zipDepth, ratio: LIMITS.ratio } };
    if (job.kind === 'fetch') return { id: job.id, op: 'fetch', url: job.params.url, by, params: job.params, limits };
    return { id: job.id, op: 'unpack', by, params: job.params, source: job.params.spool ? { input: true } : { key: job.params.key }, edge: { origin: process.env.DEWEY_EDGE_ORIGIN || 'https://siftersearch.com', key: process.env.INTERNAL_API_KEY }, limits };
  }

  /** A worker asks for work. Nothing while the operator valve is off or the UPS has the box draining. → { order } | { order: null } */
  async function claim(worker, ops = null) {
    if (power() || !(await valve(repo)).on) return { order: null };
    const want = Array.isArray(ops) && ops.length ? ['fetch', 'archive'].filter((k) => ops.includes(k === 'archive' ? 'unpack' : k)) : ['fetch', 'archive'];   // ops: what this worker can do ('fetch' | 'unpack')
    const job = want.length ? await repo.claimOrder(String(worker).slice(0, 60), want) : null;
    if (!job) return { order: null };
    await repo.addEvent(job.id, 'claimed', { worker, attempt: job.attempts });
    return { order: await buildOrder(job) };
  }

  async function holder(id, worker) {
    const job = await repo.getJob(id);
    if (!job || isTerminal(job.state)) return { gone: true, job };
    if (worker && job.worker && job.worker !== worker) return { lost: true, job };
    return { job };
  }

  /** Progress from the worker: renews the lease, keeps the byte count, enforces the caps. → { ok } | { abort, reason } */
  async function event(id, worker, ev = {}) {
    const h = await holder(id, worker);
    if (h.gone) return { abort: true, reason: 'the job is finished or cancelled' };
    if (h.lost) return { abort: true, reason: 'another worker holds this job' };
    const job = h.job;
    await repo.renewLease(id);
    const counts = {};
    if (Number.isFinite(ev.bytes)) {
      const delta = Math.max(0, ev.bytes - Number(job.counts?.fetched_bytes || 0));
      counts.fetched_bytes = ev.bytes;
      if (delta) await reg.addCost(id, job.created_by, 0, { bytes: delta });
      if (!(await checkCap(repo, job.created_by, { bytes: 1 })).ok && delta) return { abort: true, reason: "that passes today's download limit for your account" };
    }
    if (Number.isFinite(ev.total)) counts.total_bytes = ev.total;
    if (Number.isFinite(ev.found)) counts.found = ev.found;
    const to = ev.step === 'inspect' ? 'inspecting' : ev.step === 'upload' ? 'inspecting' : job.state === 'received' ? 'fetching' : job.state;
    await reg.advance(id, to, { step: ev.step === 'download' ? 'download' : ev.step || job.step, detail: ev.detail || null, counts });
    return { ok: true };
  }

  /** The worker is done: create a child job per entry (skipped ones recorded with their reason), then let the parent roll up. */
  async function complete(id, worker, result = {}) {
    const h = await holder(id, worker);
    if (h.gone) return { ok: true, ignored: true };
    if (h.lost) return { ok: false, error: 'lease lost' };
    const job = h.job, entries = Array.isArray(result.entries) ? result.entries.slice(0, 700) : [];
    await reg.advance(id, 'inspecting', { step: 'inspect', detail: `${entries.length} entries` });
    if (Number.isFinite(result.bytes_fetched)) { const d = Math.max(0, result.bytes_fetched - Number(job.counts?.fetched_bytes || 0)); if (d) await reg.addCost(id, job.created_by, 0, { bytes: d }); }
    let n = 0;
    for (const e of entries) {
      const key = `child:${id}:${e.sha256 || e.name}:${n++}`;
      const params = { name: e.name, from: e.from || null, bytes: e.bytes || 0, sha256: e.sha256 || null, rights: !!job.params?.rights };
      if (e.status === 'ok' && e.kind === 'media') await writeSidecar(blobPath(id, 'media', e.name), { provider: new URL(job.params?.url || 'https://unknown.invalid').hostname, name: e.name, url: job.params?.url || null, file_url: result.source?.url || null, title: job.params?.title || null, speaker: job.params?.speaker || null, year: job.params?.year || null, sha256: e.sha256 || null, bytes: e.bytes || null }).catch(() => {});
      if (e.status === 'ok' && e.kind === 'media') await reg.startJob({ kind: 'media', by: job.created_by, channel: job.channel, parentId: id, key, params: { ...params, path: blobPath(id, 'media', e.name) }, free: true });
      else if (e.status === 'ok') await reg.startJob({ kind: 'file', by: job.created_by, channel: job.channel, parentId: id, key, params: { ...params, path: blobPath(id, 'doc', e.name) }, free: true });
      else {
        const r = await reg.startJob({ kind: 'file', by: job.created_by, channel: job.channel, parentId: id, key, params, free: true });
        if (r.job && r.created) await reg.advance(r.job.id, 'skipped', { result: { outcome: 'skipped', reason: 'type', why: e.reason || 'not taken', title: e.name } });
      }
    }
    await repo.updateJob(id, { result: { source: result.source || null, scanner: result.scanner || 'none', entries: entries.length }, counts: { ...(job.counts || {}), found: entries.length, scanner: result.scanner || 'none' } });
    if (!entries.length) return { ok: true, job: await reg.advance(id, 'skipped', { result: { reason: 'empty', why: 'nothing usable was found' } }) };
    await reg.advance(id, 'processing', { step: 'children', detail: `${entries.length} files` });
    return { ok: true, job: await reg.rollup(id) };
  }

  async function fail(id, worker, error, retryable = true) {
    const h = await holder(id, worker);
    if (h.gone || h.lost) return { ok: false };
    return { ok: true, job: await reg.fail(id, new Error(error || 'the worker failed'), { retryable }) };
  }

  /** Stream a body into the job's folder with a hard cap; verify the sha when given. → { path, name, bytes, sha256 } */
  async function receiveBlob(id, worker, { name, kind = 'doc', sha256 = null, stream, maxBytes = LIMITS.zipBytes }) {
    const h = await holder(id, worker);
    if (h.gone || h.lost) throw Object.assign(new Error('this job is not accepting files'), { statusCode: 409 });
    const dest = blobPath(id, kind, name), tmp = `${dest}.part`;
    await mkdir(dirname(dest), { recursive: true });
    const hash = createHash('sha256'); let bytes = 0;
    const meter = new Transform({ transform(c, _e, cb) { bytes += c.length; if (bytes > maxBytes) return cb(Object.assign(new Error('file over the size limit'), { statusCode: 413 })); hash.update(c); cb(null, c); } });
    try {
      await pipeline(stream, meter, createWriteStream(tmp));
      const got = hash.digest('hex');
      if (sha256 && sha256 !== got) throw Object.assign(new Error('the file arrived damaged (checksum mismatch)'), { statusCode: 422 });
      await rename(tmp, dest);
      return { path: dest, name: dest.split('/').pop(), bytes, sha256: got };
    } catch (e) { await rm(tmp, { force: true }); throw e; }
  }

  return { claim, event, complete, fail, receiveBlob, buildOrder };
}
