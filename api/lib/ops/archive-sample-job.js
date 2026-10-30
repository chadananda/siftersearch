// archive-sample ops report: the first minute of each candidate talk on a donor drive → R2 intake/<drive>/<id>.<ext>, so Chad can listen in
// /admin/imports before deciding. Tower only stream-copies (ffmpeg -t 60 -c:a copy = 'light' in tools.js run); transcription is a worker's job.
// Best-scored undecided talks first; idempotent (an item with a sample is skipped). Lane 'archive'. Plan: planning/donor-intake-plan-20261030.md (B).
import { join, normalize } from 'path';
import { rm } from 'fs/promises';
import { getDrive, itemsToSample, setSample } from '../repos/archives-repo.js';

export const SAMPLE_SECS = 60;
export const clipKey = (drive, id, ext) => `intake/${drive}/${id}.${ext}`;

/** Path of an item's main file under the drive root, or null if the stored path would leave it. Pure. */
export function itemPath(root, rel) {
  const p = normalize(join(root, String(rel || '')));
  return rel && p.startsWith(normalize(root) + '/') ? p : null;
}

export async function archiveSampleJob({ drive, limit = 100 } = {}, deps = {}) {
  if (!drive) throw new Error('archive-sample needs drive');
  const d = await (deps.getDrive || getDrive)(drive);
  if (!d?.root) throw new Error(`no drive ${drive}`);
  const store = deps.store !== undefined ? deps.store : await (await import('../media/r2-stage.js')).r2StageStore();
  if (!store) throw new Error('no R2 store (CLOUDFLARE_API_TOKEN/ACCOUNT_ID)');
  const demux = deps.demux || (await import('../media/r2-stage.js')).audioDemuxer((await import('../media/tools.js')).run, undefined, { seconds: SAMPLE_SECS });
  const items = await (deps.itemsToSample || itemsToSample)(drive, { limit });
  const save = deps.setSample || setSample, out = { drive, tried: items.length, clipped: 0, failed: 0, bytes: 0, errors: {} };
  for (const it of items) {
    const src = itemPath(d.root, it.primary_rel);
    let a = null;
    try {
      if (!src) throw new Error('path outside the drive');
      a = await demux(src);
      if (!a) throw new Error('no audio track with a copyable codec');
      const key = clipKey(drive, it.id, a.ext);
      const bytes = await store.put(key, a.file);
      await save(it.id, { clip: { key, ext: a.ext, secs: SAMPLE_SECS, bytes, at: new Date().toISOString() } });
      out.clipped++; out.bytes += bytes;
    } catch (e) {
      const why = String(e.message || e).slice(0, 160);
      await save(it.id, { clip: { error: why, at: new Date().toISOString() } }).catch(() => {});   // recorded, so the next run moves on
      out.failed++; out.errors[why] = (out.errors[why] || 0) + 1;
    } finally { if (a?.file) await rm(a.file, { force: true }).catch(() => {}); }
  }
  return out;
}
