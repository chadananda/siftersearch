// GPU pacing for the queue agent (Chad 10-31: "the CPU work can progress while the GPU is working on the next talk"; pods and home hosts must keep
// the GPU saturated). Rule: always keep ONE talk on deck for the GPU. Claim the next talk whenever no stage is queued at gpu_lease.py's admission
// (leases.json.wait) and the last claim has had ON_DECK_MS to reach its first GPU stage. A backlog at the GPU holds new claims; slots + RAM cap it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ON_DECK_MS = 2 * 60_000;   // download + probe before a new talk asks for the GPU
export const WAITER_FRESH_S = 10;       // gpu_lease.py re-stamps a waiter every second; one silent for 10 s is gone

/** Stages waiting at GPU admission right now (shared leases dir of this host). */
export function gpuWaiting(leaseDir, now = Date.now()) {
  try {
    const w = JSON.parse(readFileSync(join(leaseDir, 'leases.json.wait'), 'utf8'));
    return Object.values(w).filter((v) => now / 1000 - (v.at || 0) < WAITER_FRESH_S).length;
  } catch { return 0; }
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

/** Take another talk now? Pure. */
export function wantAnother({ running, cap, waiting, sinceClaimMs, memGb, minGb }) {
  if (running >= cap || memGb < minGb) return false;
  if (!running) return true;
  return waiting === 0 && sinceClaimMs >= ON_DECK_MS;
}
