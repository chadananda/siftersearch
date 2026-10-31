// GPU pacing for the queue agent (Chad 10-31: "the CPU work can progress while the GPU is working on the next talk"). Rather than starting every
// slot at once, so all the talks reach their CPU stages together, take the next talk only once the GPU has gone quiet. Slots become a cap.
// Utilisation comes from the card (nvidia-smi | amdgpu sysfs); if it can't be read, the agent claims up to the cap as before.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export const BUSY_PCT = 40;          // below this the GPU counts as quiet
export const QUIET_MS = 60_000;      // ...for this long before another talk starts
export const WARM_MS = 4 * 60_000;   // a talk just claimed is still downloading and preparing; don't count its quiet GPU yet

/** Current GPU utilisation %, or null when it can't be read. */
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

/** Tracks how long the GPU has been quiet; sample() every few seconds. */
export function pace() {
  let quietSince = null;
  return {
    sample(util, now = Date.now()) { if (util == null || util < BUSY_PCT) quietSince ??= now; else quietSince = null; },
    quietMs: (now = Date.now()) => (quietSince == null ? 0 : now - quietSince),
  };
}

/** Take another talk now? Pure. */
export function wantAnother({ running, cap, quietMs, sinceClaimMs, memGb, minGb }) {
  if (running >= cap || memGb < minGb) return false;
  if (!running) return true;
  return quietMs >= QUIET_MS && sinceClaimMs >= WARM_MS;
}
