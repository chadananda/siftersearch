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

/** { free, used, tmp, minFree } in bytes → 'ok' | 'snapshot' (a snapshot is in flight: wait for it) | 'full'.
 *  Data = used − tmp; keep free ≥ max(minFree, data) so the next snapshot's copy always fits. */
export function hotVerdict({ free, used, tmp = 0, minFree }) {
  if (free == null) return 'ok';
  if (tmp > 0) return 'snapshot';
  return free < Math.max(minFree, used - tmp) ? 'full' : 'ok';
}
