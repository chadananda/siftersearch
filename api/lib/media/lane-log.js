// Append-only event log of the media lane (11-03, Chad: "We need to keep detailed logs... so that this behavior never repeats"): data/run/media-lane.jsonl, one
// JSON line per event (pass, feed, repair, move, move_pass, rent, rent_refused, pod, reap). The lane state file keeps only the LAST pass; this keeps the night.
// Size-rotated; laneLog never throws into the caller. Read back: GET /api/admin/ops/media/log, ops.mjs media log.
import { appendFile, mkdir, stat, rename, unlink, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import * as C from './cloud.js';

export const LOG_MAX_BYTES = 25e6, LOG_KEEP = 8;   // storage limits (≈200 MB at most), not behaviour limits
export const LOG_FILE = join(dirname(C.STATE_FILE), 'media-lane.jsonl');
// tests write nowhere unless MEDIA_LANE_LOG names a file (or the caller passes one)
const fileOf = (o) => o.file ?? process.env.MEDIA_LANE_LOG ?? (process.env.VITEST ? null : LOG_FILE);
let chain = Promise.resolve();   // one writer at a time: rotation must not interleave with appends

async function rotate(file, keep) {
  await unlink(`${file}.${keep - 1}`).catch(() => {});
  for (let i = keep - 2; i >= 1; i--) await rename(`${file}.${i}`, `${file}.${i + 1}`).catch(() => {});
  await rename(file, `${file}.1`).catch(() => {});
}
/** Append one event { at: ISO, ms, kind, ...fields }. Fire and forget (the returned promise resolves when written; it never rejects). */
export function laneLog(kind, fields = {}, o = {}) {
  const file = fileOf(o);
  if (!file) return Promise.resolve();
  const ms = (o.now || Date.now)(), maxBytes = o.maxBytes ?? LOG_MAX_BYTES, keep = Math.max(2, o.keep ?? LOG_KEEP);
  chain = chain.then(async () => {
    const line = JSON.stringify({ at: new Date(ms).toISOString(), ms, kind, ...fields }) + '\n';
    await mkdir(dirname(file), { recursive: true });
    const s = await stat(file).catch(() => null);
    if (s && s.size > 0 && s.size + line.length > maxBytes) await rotate(file, keep);
    await appendFile(file, line);
  }).catch(() => {});
  return chain;
}

/** The last `limit` events at or after `since` (ms), of `kind` (one name or a list), oldest first. Reads the newest file first and stops once it has enough. */
export async function readLaneLog({ since = 0, kind = null, limit = 200, file = process.env.MEDIA_LANE_LOG || LOG_FILE, keep = LOG_KEEP } = {}) {
  const kinds = kind ? new Set([].concat(kind).flatMap((k) => String(k).split(',')).filter(Boolean)) : null, got = [];
  for (const f of [file, ...Array.from({ length: keep - 1 }, (_, i) => `${file}.${i + 1}`)]) {
    const rows = (await readFile(f, 'utf8').catch(() => '')).split('\n').flatMap((l) => { try { const r = l && JSON.parse(l); return r && r.ms >= since && (!kinds || kinds.has(r.kind)) ? [r] : []; } catch { return []; } });
    got.unshift(...rows);
    if (got.length >= limit) break;
  }
  return got.slice(-limit);
}
