// qdrant-hot RAM-disk room check for the phrase indexer. A Qdrant snapshot builds its copy in <storage>/tmp on the same
// disk; that copy is not data, so it must not count as "used" (11-05: every 6-h snapshot stopped ~100 phrase-index runs).
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Bytes under a directory (0 when absent). */
export function dirBytes(dir) {
  let n = 0;
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) {
    const p = join(dir, e.name);
    try { n += e.isDirectory() ? dirBytes(p) : statSync(p).size; } catch { /* file vanished mid-walk */ }
  }
  return n;
}

/** { free, used, tmp, minFree, memAvail? } in bytes → 'ok' | 'snapshot' (a snapshot is in flight: wait for it) | 'full'.
 *  Data = used − tmp; keep free ≥ max(minFree, data) so the next snapshot's copy always fits, and keep the box's
 *  MemAvailable ≥ minFree (tmpfs pages are RAM). 'full' means fold (qdrant-hot-fold), never stall. */
export function hotVerdict({ free, used, tmp = 0, minFree, memAvail = null }) {
  if (free == null) return 'ok';
  if (tmp > 0) return 'snapshot';
  if (memAvail != null && memAvail < minFree) return 'full';
  return free < Math.max(minFree, used - tmp) ? 'full' : 'ok';
}

// ── RAM write tier capacity (Chad 11-10: RAM is the permanent write tier; fold to main in bulk) ──────────────────────────
// No hard-coded size: capacity comes from what the machine has right now. tmpfs pages are shared memory, so every byte on
// the RAM disk also leaves MemAvailable — the room is the smaller of the filesystem's free space and the RAM the rest of the
// box can spare (MemAvailable − minFree). The data may fill at most half of (data + room), because a snapshot builds its copy
// on the same RAM disk, and never more than (data + room − minFree).

/** /proc/meminfo text → MemAvailable bytes (null when absent). Pure. */
export function parseMemAvailable(txt) {
  const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(String(txt || ''));
  return m ? Number(m[1]) * 1024 : null;
}

/** { free, used, tmp, minFree, memAvail } → { data, room, capacity, fill } (bytes; fill = data / capacity, 1 when no room). Pure. */
export function hotCapacity({ free, used, tmp = 0, minFree, memAvail = null }) {
  const data = Math.max(0, (used || 0) - (tmp || 0));
  const room = Math.max(0, memAvail == null ? (free ?? 0) : Math.min(free ?? Infinity, memAvail - minFree));
  const total = data + room;
  const capacity = Math.max(0, Math.min(total - minFree, total / 2));
  return { data, room, capacity, fill: capacity > 0 ? data / capacity : 1 };
}

/** Fold thresholds as fractions of the live capacity (env-tunable): over `now` → fold whenever; over `quiet` → fold in the
 *  quiet hours. Under `quiet` nothing is worth a main-side write burst. */
export const FOLD_AT = Object.freeze({ now: Number(process.env.QDRANT_HOT_FOLD_NOW ?? 2 / 3), quiet: Number(process.env.QDRANT_HOT_FOLD_QUIET ?? 1 / 3) });

/** Quiet hours spec 'H1-H2' (local hours, end exclusive, may wrap midnight) → is `date` inside? Pure over (date, spec). */
export function inQuietHours(date = new Date(), spec = process.env.QDRANT_HOT_QUIET_HOURS || '2-7') {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(spec).trim());
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])], h = date.getHours();
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** capacity reading + clock (+ full: the indexer's own stop rule) → 'fold-now' | 'fold-quiet' (fold now: it is quiet) | 'wait-quiet' (worth folding, not yet) | 'ok'. */
export function foldVerdict({ fill }, { quiet = false, at = FOLD_AT, full = false } = {}) {
  // full = hotVerdict(reading) === 'full': the indexer would stop for space right now, so waiting for quiet hours would idle it
  if (full || fill >= at.now) return 'fold-now';
  if (fill >= at.quiet) return quiet ? 'fold-quiet' : 'wait-quiet';
  return 'ok';
}
