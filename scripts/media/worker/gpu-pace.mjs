// GPU pacing for the queue agent (Chad 10-31: "always queue up the next job so we are never waiting on CPU to finish or waiting on streaming/copying
// over the network. GPU should be kept saturated."). Rule: keep ONE talk on deck — queued at gpu_lease.py's admission or on its way there. The next
// is claimed the moment the deck is empty, so its download + prep overlap the GPU's current work. Slots = the machine's capacity; RAM bounds it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const WAITER_FRESH_S = 10;       // gpu_lease.py re-stamps a waiter every second; one silent for 10 s is gone
export const STALL_MS = 45 * 60_000;    // a talk that never reaches the GPU stops holding the deck (logged)

/** The GPU admission ledger right now: keys ('<pid ns>:<pid>') holding a lease, and those queued for one (fresh only). */
export function gpuLedger(leaseDir, now = Date.now()) {
  const read = (f) => { try { return JSON.parse(readFileSync(join(leaseDir, f), 'utf8')); } catch { return {}; } };
  const waiting = Object.entries(read('leases.json.wait')).filter(([, v]) => now / 1000 - (v.at || 0) < WAITER_FRESH_S).map(([k]) => k);
  return { waiting, holding: Object.keys(read('leases.json')) };
}

/** Has this talk reached the GPU? owns(key) says whether a ledger key belongs to the talk (its container's pid namespace, or a pid under its process). */
export const reachedGpu = ({ waiting, holding }, owns) => [...waiting, ...holding].some(owns);

/** Is pid a descendant of root (same pid namespace — local runs on a pod)? */
export function descends(pid, root, ppid = (p) => Number(readFileSync(`/proc/${p}/stat`, 'utf8').replace(/^.*\) /s, '').split(' ')[1])) {
  try { for (let p = Number(pid), n = 0; p > 1 && n < 64; p = ppid(p), n++) if (p === root) return true; } catch {}
  return false;
}

/** Current GPU utilisation % (logged with each claim), or null when it can't be read. */
export function gpuUtil(device) {
  try {
    if (device === 'rocm') {
      const card = readdirSync('/sys/class/drm').map((c) => `/sys/class/drm/${c}/device/gpu_busy_percent`).find(existsSync);
      return card ? Number(readFileSync(card, 'utf8')) : null;
    }
    const r = spawnSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 });
    const v = Math.max(...String(r.stdout).split('\n').filter(Boolean).map(Number));
    return r.status === 0 && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/** Take another talk now? Pure. onDeck = stages queued at the GPU + talks still on their way to it (download, probe, prep). */
export function wantAnother({ running, cap, onDeck, memGb, minGb }) {
  return running < cap && memGb >= minGb && onDeck === 0;
}
