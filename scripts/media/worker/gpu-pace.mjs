// GPU pacing for the queue agent (Chad 10-31: "always queue up the next job so we are never waiting on CPU to finish or waiting on streaming/copying
// over the network. GPU should be kept saturated."). Rule: keep ONE talk on deck — queued at gpu_lease.py's admission or on its way there. The next
// is claimed the moment the deck is empty, so its download + prep overlap the GPU's current work — unless the CPU is full (≥90 % of the cgroup's cores
// over the last minute): then another talk only slows the CPU stages that feed the GPU. Slots = the machine's capacity; RAM (cgroup) bounds it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';

export const WAITER_FRESH_S = 10;       // gpu_lease.py re-stamps a waiter every second; one silent for 10 s is gone
export const STALL_MS = 45 * 60_000;    // a talk that never reaches the GPU stops holding the deck (logged)

// Stages that lease only for RAM admission and run on the CPU: a talk in one has not reached the GPU (10-31 pod 371: grade leases first,
// then decodes for minutes with the GPU at 1 MiB — 5 talks claimed in 50 s because each "reached the GPU" at once).
export const CPU_STAGES = new Set(['grade', 'guard']);

/** The GPU admission ledger right now: keys ('<pid ns>:<pid>') holding a lease, and those queued for one (fresh only); CPU-only stages left out. */
export function gpuLedger(leaseDir, now = Date.now()) {
  const read = (f) => { try { return JSON.parse(readFileSync(join(leaseDir, f), 'utf8')); } catch { return {}; } };
  const gpu = ([, v]) => !CPU_STAGES.has(v?.stage);
  const waiting = Object.entries(read('leases.json.wait')).filter(([, v]) => now / 1000 - (v.at || 0) < WAITER_FRESH_S).filter(gpu).map(([k]) => k);
  return { waiting, holding: Object.entries(read('leases.json')).filter(gpu).map(([k]) => k) };
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

/** The memory THIS process may use, in GB: the cgroup limit (v2 memory.max, v1 memory.limit_in_bytes) and what is in use less reclaimable file
 * cache — or null when unlimited. A RunPod pod's /proc/meminfo shows the host's RAM (10-31: pods 367+368 took 12 talks and died ~40 min in). */
export function cgroupMemGb(read = (f) => readFileSync(f, 'utf8')) {
  const gb = (b) => b / 1073741824;
  const stat = (f, key) => { try { return Number(new RegExp(`^${key} (\\d+)`, 'm').exec(read(f))?.[1] || 0); } catch { return 0; } };
  for (const [max, cur, st, inactive] of [['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.stat', 'inactive_file'],
    ['/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/memory/memory.stat', 'total_inactive_file']]) {
    let limit;
    try { limit = Number(read(max).trim()); } catch { continue; }
    if (!Number.isFinite(limit) || limit >= 2 ** 60) return null;   // 'max' (v2) or the v1 "no limit" sentinel
    let used = 0;
    try { used = Number(read(cur).trim()) - stat(st, inactive); } catch {}
    return { limitGb: gb(limit), availGb: gb(Math.max(0, limit - used)) };
  }
  return null;
}

/** CPU time used so far (µs) and the cores this process may use: the cgroup (v2 cpu.stat + cpu.max, v1 cpuacct + cfs quota), else /proc/stat.
 * A talk's CPU stages feed the GPU; once the CPU is full another talk only slows them (10-31 pod 370: load 78 on 31 CPUs, GPU 0 %). */
export function cpuSample(read = (f) => readFileSync(f, 'utf8'), hostCores = cpus().length) {
  const num = (f) => { try { return Number(read(f).trim().split(/\s+/)[0]); } catch { return NaN; } };
  let usec = NaN, quota = NaN, period = NaN;
  try { usec = Number(/^usage_usec (\d+)/m.exec(read('/sys/fs/cgroup/cpu.stat'))?.[1]); } catch {}
  try { [quota, period] = read('/sys/fs/cgroup/cpu.max').trim().split(/\s+/).map(Number); } catch {}
  if (!Number.isFinite(usec)) usec = num('/sys/fs/cgroup/cpuacct/cpuacct.usage') / 1000;
  if (!Number.isFinite(quota)) { quota = num('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'); period = num('/sys/fs/cgroup/cpu/cpu.cfs_period_us'); }
  if (!Number.isFinite(usec)) {   // a host: every non-idle jiffy (USER_HZ 100 → 10 000 µs)
    try { const f = read('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number); usec = (f.reduce((a, b) => a + b, 0) - f[3] - (f[4] || 0)) * 10_000; } catch { return null; }
  }
  const cores = quota > 0 && period > 0 ? Math.min(hostCores, quota / period) : hostCores;
  return { usec, cores };
}

/** Share of the CPU busy between the oldest sample at least windowMs old and now (samples: [{t, usec, cores}] oldest first), or null. */
export function cpuBusy(samples, windowMs = 60_000) {
  const last = samples.at(-1), first = [...samples].reverse().find((s) => last.t - s.t >= windowMs) || samples[0];
  if (!last || last === first || !last.cores) return null;
  return (last.usec - first.usec) / ((last.t - first.t) * 1000 * last.cores);
}
export const CPU_FULL = 0.9;

/** Take another talk now? Pure. onDeck = stages queued at the GPU + talks still on their way to it (download, probe, prep); cpu = busy share (null = unknown). */
export function wantAnother({ running, cap, onDeck, memGb, minGb, cpu = null }) {
  return running < cap && memGb >= minGb && onDeck === 0 && !(cpu >= CPU_FULL);
}
