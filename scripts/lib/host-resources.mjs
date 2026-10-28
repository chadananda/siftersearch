// Host resource checks for system-checks: disk (85/92 % + 24 h fill projection), memory/swap, OOM, load, GPU, for every
// machine we use (10-23: aorus's disk filled at 16:09 and nothing alerted). Pure: input = scripts/ops/host-stat.sh output.
// Alerts are deduped by alertPlan(): a condition mails once, again only when it escalates; a cleared one re-arms.

export const DISK_WARN = 85, DISK_CRIT = 92, PROJECT_HOURS = 24, SAMPLES = 6;
export const HOST_STAT_VERSION = 2;   // = HOST_STAT_VERSION in scripts/ops/host-stat.sh
// processes allowed to hold TOWER's GPU (it drives the monitor only): display server, desktop shell, portals, stat viewers
const MONITOR_OK = /^(Xorg|Xwayland|gnome-s|gnome-shell|mutter|snapd|xdg-desk|gsd-|ibus|btop|nvtop|gdm|kwin|plasmashell)/;

const kb = (n) => Number(n) * 1024;
export const gb = (bytes) => (bytes / 1024 ** 3).toFixed(bytes >= 100 * 1024 ** 3 ? 0 : 1);

/** host-stat.sh text → structured snapshot. */
export const DOCKER_MIN_FREE_GB = 30;
export function parseHostStat(text) {
  const out = { version: 0, host: null, nproc: 0, load: [], mem: {}, df: [], zpool: [], zfs: {}, du: {}, oomCount: 0, oom: [], xid: [], nvsmi: null, nvdev: null, journalErr: null, dockerRoot: null, psi: {}, zram: [], amd: null, vramProc: [], svc: {}, ours: {} };
  let sec = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^@@(\w+)\s*(.*)$/);
    if (m) {
      const [, k, v] = m;
      sec = k;
      if (k === 'version') out.version = Number(v) || 0;
      else if (k === 'host') out.host = v;
      else if (k === 'nproc') out.nproc = Number(v) || 0;
      else if (k === 'loadavg') out.load = v.split(/\s+/).map(Number);
      else if (k === 'oomcount') out.oomCount = Number(v) || 0;
      else if (k === 'journal_err') out.journalErr = v;
      else if (k === 'dockerroot') out.dockerRoot = v.trim() || null;
      else if (k === 'amd') out.amd = {};
      else if (k === 'nvsmi') out.nvsmi = [];
      else if (k === 'nvdev') out.nvdev = [];
      continue;
    }
    if (!line.trim()) continue;
    if (sec === 'meminfo') { const [, key, val] = line.match(/^(\w+):\s+(\d+)/) || []; if (key) out.mem[key] = kb(val); }
    else if (sec === 'df') {
      const c = line.split(/\s+/);
      if (c.length >= 7) out.df.push({ source: c[0], type: c[1], size: kb(c[2]), used: kb(c[3]), avail: kb(c[4]), mount: c.slice(6).join(' ') });
    } else if (sec === 'zpool') { const [name, size, alloc, free] = line.split('\t'); out.zpool.push({ name, size: +size, used: +alloc, avail: +free }); }
    else if (sec === 'zfs') { const [name, used] = line.split('\t'); out.zfs[name] = +used; }
    else if (sec === 'du') { const [k1, p] = line.split('\t'); if (p) out.du[p] = kb(k1); }
    else if (sec === 'oom') out.oom.push(line);
    else if (sec === 'xid') out.xid.push(line);
    else if (sec === 'nvsmi') out.nvsmi.push(line);
    else if (sec === 'nvdev') out.nvdev.push(line.trim());
    else if (sec === 'psi') { const m = line.match(/^(some|full)\s+avg10=([\d.]+)\s+avg60=([\d.]+)/); if (m) out.psi[m[1]] = { avg10: +m[2], avg60: +m[3] }; }
    else if (sec === 'zram') { const [name, size, data, total] = line.trim().split(/\s+/); if (name) out.zram.push({ name, size: +size, data: +data, total: +total }); }
    else if (sec === 'amd') { const [k, v] = line.trim().split(/\s+/); if (k && out.amd) out.amd[k] = +v; }
    else if (sec === 'vramproc') { const m = line.trim().match(/^(\d+) (\d+) (\d+) (\d*) ?(.*)$/); if (m) out.vramProc.push({ pid: +m[1], vramKb: +m[2], gttKb: +m[3], rssKb: +m[4] || 0, cmd: m[5] }); }
    else if (sec === 'svc') { const m = line.trim().match(/^(\S+)\s+(\[not set\]|\S+)\s*(\S*)$/); if (m) { if (/^ours/.test(m[1])) out.ours[m[1]] = m[2]; else out.svc[m[1]] = { current: Number(m[2]) || null, peak: Number(m[3]) || null }; } }
  }
  return out;
}

const SKIP_TYPES = new Set(['squashfs', 'overlay', 'devtmpfs', 'efivarfs', 'proc', 'sysfs', 'cgroup2', 'zfs']);
/** The filesystems worth watching: zfs as POOLS (datasets share the pool's space), one row per device (btrfs subvolume
 *  mounts collapse), tmpfs only where work lands on it (/tmp, /srv/* — tower's /srv/qram RAM disk). */
export function filesystems(s) {
  const rows = [];
  for (const p of s.zpool) rows.push({ id: `pool:${p.name}`, label: `${p.name} (zfs pool)`, size: p.size, used: p.used, avail: p.avail, pool: p.name });
  const seen = new Map();
  for (const d of s.df) {
    if (SKIP_TYPES.has(d.type)) continue;
    if (d.type === 'tmpfs' && !(d.mount === '/tmp' || d.mount.startsWith('/srv/'))) continue;
    if (!d.size) continue;
    const key = d.type === 'tmpfs' ? d.mount : d.source;
    const prev = seen.get(key);
    if (!prev || d.mount.length < prev.mount.length) seen.set(key, d);
  }
  for (const d of seen.values()) rows.push({ id: d.mount, label: d.mount, size: d.size, used: d.used, avail: d.avail, mount: d.mount });
  return rows;
}

export const usedPct = (f) => (f.used + f.avail > 0 ? Math.round((f.used / (f.used + f.avail)) * 1000) / 10 : 0);
export function diskLevel(pct, { warn = DISK_WARN, critical = DISK_CRIT } = {}) {
  return pct >= critical ? 'critical' : pct >= warn ? 'warn' : 'ok';
}

/** Append a sample, keep the last n. */
export const pushSample = (samples = [], t, used, n = SAMPLES) => [...samples, { t, used }].slice(-n);
/** Hours until full at the fill rate over the stored samples (oldest → newest, ≥ 50 min apart), or null when not filling. */
export function hoursToFull(samples, avail, { minSpanMs = 50 * 60_000 } = {}) {
  if (!samples?.length || samples.length < 2) return null;
  const a = samples[0], b = samples[samples.length - 1];
  const span = b.t - a.t;
  if (span < minSpanMs) return null;
  const perHour = (b.used - a.used) / (span / 3_600_000);
  if (perHour <= 0) return null;
  return avail / perHour;
}

/** The directory (or zfs dataset) on this filesystem that grew most since the last check → 'path +X GB (now Y GB)'. */
export function growingDir(fs, s, prevDu = {}) {
  const sizes = fs.pool
    ? Object.fromEntries(Object.entries(s.zfs).filter(([n]) => n.startsWith(`${fs.pool}/`)))
    : Object.fromEntries(Object.entries(s.du).filter(([p]) => mountOf(p, s) === fs.mount));
  let best = null;
  for (const [p, now] of Object.entries(sizes)) {
    const d = now - (prevDu[p] ?? now);
    if (d > 0 && (!best || d > best.d)) best = { p, d, now };
  }
  if (!best) {   // nothing measured growing: name the biggest known dir instead, when it is big
    const [p, now] = Object.entries(sizes).sort((x, y) => y[1] - x[1])[0] || [];
    return p && now > 1024 ** 3 ? `largest known: ${p} ${gb(now)} GB` : '';
  }
  return `growing: ${best.p} +${gb(best.d)} GB since last check (now ${gb(best.now)} GB)`;
}
function mountOf(path, s) {
  let best = null;
  for (const d of s.df) if ((path === d.mount || path.startsWith(d.mount === '/' ? '/' : `${d.mount}/`)) && (!best || d.mount.length > best.length)) best = d.mount;
  return best;
}

/**
 * One host's snapshot → checks + its next state.
 * role: 'compute' (aorus: GPU alerts) · 'monitor' (tower: GPU drives the display only) · 'none' (boss: GPU noted, never alerted)
 * prev: { samples: {fsId: [...]}, du: {...}, vramHigh: bool }
 */
export function evaluateHost(host, s, { role = 'none', prev = {}, now = Date.now(), expectVersion = HOST_STAT_VERSION } = {}) {
  const checks = [];
  const add = (cond, ok, level, detail) => checks.push({ name: `${host} ${cond}`, key: `${host}:${cond}`, ok, level, detail, host: true });
  const state = { samples: {}, du: { ...s.du, ...s.zfs }, vramHigh: false };

  // ── MEMORY POOLS (Chad 10-28): system RAM + pressure + (AMD unified-memory hosts) VRAM / GTT, labelled so nobody reads `free` as the whole machine ──
  const pools = memoryPools(s);
  if (pools) add('unified pools', pools.ok, pools.level, pools.label);
  // ── docker data (10-25: a 64 GB image pulled onto aorus's 234 GB root filled it) ──
  if (s.dockerRoot) {
    const mnt = mountOf(s.dockerRoot, s), fs = s.df.find((d) => d.mount === mnt);
    if (fs) { const free = fs.avail / 1024 ** 3; add('docker data', free >= DOCKER_MIN_FREE_GB, free < 10 ? 'critical' : 'warn', `${s.dockerRoot} on ${mnt}: ${Math.round(free)} GB free${free < DOCKER_MIN_FREE_GB ? ` (< ${DOCKER_MIN_FREE_GB} GB: a 25 GB image needs room; move Docker's data-root to the big disk)` : ''}`); }
  }
  // ── disk ──
  for (const f of filesystems(s)) {
    const pct = usedPct(f);
    const samples = pushSample(prev.samples?.[f.id], now, f.used);
    state.samples[f.id] = samples;
    const lvl = diskLevel(pct);
    const h = hoursToFull(samples, f.avail);
    const filling = h != null && h < PROJECT_HOURS;
    const level = lvl === 'critical' ? 'critical' : 'warn';
    const ok = lvl === 'ok' && !filling;
    const where = ok ? '' : growingDir(f, s, prev.du || {});
    add(`disk ${f.label}`, ok, level, `${pct}% used · ${gb(f.avail)} GB free of ${gb(f.size)} GB`
      + (filling ? ` — FILLING: full in ~${h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`} at the current rate` : '')
      + (lvl !== 'ok' ? ` — ${lvl.toUpperCase()} (warn ${DISK_WARN} %, critical ${DISK_CRIT} %)` : '')
      + (where ? ` · ${where}` : ''));
  }

  // ── memory + swap ──
  const { MemTotal: mt = 0, MemAvailable: ma = 0, SwapTotal: st = 0, SwapFree: sf = 0 } = s.mem;
  if (mt) {
    const availPct = Math.round((ma / mt) * 1000) / 10;
    const swapPct = st ? Math.round(((st - sf) / st) * 1000) / 10 : 0;
    const low = availPct < 10; // Occupied swap can remain idle after pressure ends (including compressed zram).
    add('memory', !low, 'warn', `${availPct}% RAM available (${gb(ma)} of ${gb(mt)} GB) · swap ${swapPct}% used (${gb(st - sf)} of ${gb(st)} GB)`
      + (low ? ' — LOW MEMORY (<10 % available)' : '') + (swapPct > 50 && !low ? ' — occupancy alone does not indicate active swapping' : ''));
  }
  if (s.journalErr) add('OOM events', true, 'info', `kernel log unreadable (${s.journalErr})`);
  else add('OOM events', !s.oomCount, 'warn', s.oomCount ? `${s.oomCount} process(es) killed by the OOM killer since the last check — last: ${shortOom(s.oom[s.oom.length - 1])}` : 'none since the last check');

  // ── load ──
  if (s.nproc && s.load.length === 3) {
    const l15 = s.load[2], lim = 1.5 * s.nproc;
    add('load', l15 <= lim, 'warn', `15-min load ${l15} on ${s.nproc} cores (limit ${lim})${l15 > lim ? ' — OVERLOADED' : ''} · 1/5-min ${s.load[0]}/${s.load[1]}`);
  }

  // ── GPU ──
  const nv = s.nvsmi || [];
  const mismatch = nv.some((l) => /version mismatch/i.test(l));
  const gpus = nv.map((l) => l.split(',').map((x) => x.trim())).filter((c) => c.length >= 6 && /^\d+$/.test(c[1]))
    .map(([name, used, total, temp, util, ecc]) => ({ name, used: +used, total: +total, temp: +temp, util: +util, ecc: /^\d+$/.test(ecc) ? +ecc : null }));
  if (role === 'compute') {
    if (!gpus.length) add('GPU', true, 'info', nv.length ? `nvidia-smi: ${nv[0]}` : 'no nvidia-smi answer');
    for (const g of gpus) {
      const vram = g.total ? (g.used / g.total) * 100 : 0;
      const high = vram > 95;
      state.vramHigh = high;
      const sustained = high && prev.vramHigh;
      const hot = g.temp > 85, ecc = (g.ecc || 0) > 0, xid = s.xid.length > 0;
      add('GPU', !(sustained || hot || ecc || xid), 'warn', `${g.name}: ${g.util}% busy · VRAM ${g.used}/${g.total} MiB (${vram.toFixed(0)}%) · ${g.temp}°C · ECC ${g.ecc ?? 'n/a'}`
        + (sustained ? ' — VRAM >95 % on two checks running' : high ? ' (VRAM >95 % now — alerts if it holds)' : '')
        + (hot ? ' — HOT (>85°C)' : '') + (ecc ? ' — ECC ERRORS' : '') + (xid ? ` — Xid: ${s.xid[s.xid.length - 1].slice(-140)}` : ''));
    }
  } else if (role === 'monitor') {
    // tower's GPU is for the monitor ONLY: any other process holding /dev/nvidia* is compute on the wrong machine
    if (s.nvdev) {
      const rogue = s.nvdev.filter((n) => n && !MONITOR_OK.test(n));
      add('GPU compute', !rogue.length, 'critical', rogue.length
        ? `compute on tower's GPU (monitor only): ${rogue.join(', ')} — move it to aorus`
        : `display only (${s.nvdev.join(', ') || 'nothing'})`);
    }
    if (mismatch) add('GPU driver', false, 'warn', 'NVML driver/library version mismatch: the nvidia driver was updated without a reboot. Informational: reboot tower at a quiet time');
  } else if (gpus.length || nv.length) add('GPU', true, 'info', 'not used for media; not alerted');

  if (s.version && expectVersion && s.version < expectVersion) add('host-stat', true, 'info', `host-stat.sh v${s.version} on ${host}, repo has v${expectVersion}: redeploy it beside the gate`);
  return { checks, state };
}
const shortOom = (l = '') => { const m = l.match(/^(\w+ +\d+ [\d:]+).*Killed process \d+ \(([^)]+)\).*?anon-rss:(\d+)kB/); return m ? `${m[2]} at ${m[1]} (${gb(kb(m[3]))} GB resident)` : l.slice(-100); };

/** Unreachable twice running = WARN (one failed ssh is a blip; never "down": tower simply could not reach it). */
export function unreachableCheck(host, prevMisses = 0, why = '') {
  const misses = prevMisses + 1;
  return { misses, check: { name: `${host} reachable`, key: `${host}:reachable`, host: true, ok: misses < 2, level: misses < 2 ? 'info' : 'warn',
    detail: `unreachable from tower${misses > 1 ? ` (${misses} checks running)` : ' (once; warns if it repeats)'}${why ? ` — ${why}` : ''}` } };
}

const RANK = { info: 0, warn: 1, critical: 2 };
/** Dedupe: failing conditions → the ones to mail now (new, or escalated) + the new 'seen' map. A condition that clears is
 *  forgotten, so its next occurrence mails again; while it holds, its highest level is kept (no re-mail on flapping). */
export function alertPlan(checks, seen = {}) {
  const next = {}, send = [];
  for (const c of checks) {
    if (c.ok || !(c.level in RANK) || c.level === 'info') continue;
    const was = seen[c.key];
    next[c.key] = was && RANK[was] > RANK[c.level] ? was : c.level;   // flapping 92 → 91 → 92 % mails once
    if (!was || RANK[c.level] > RANK[was]) send.push(c);
  }
  return { send, seen: next };
}

const GiB = 1024 ** 3;
const g1 = (b) => (Math.round((b / GiB) * 10) / 10).toString().replace(/\.0$/, '');
/** One host's memory picture → { label, ok, level, ... } or null. The label names every pool: "system RAM 17 of 31 GB free, pressure 0.0 %, GPU VRAM 13 of 96 GB used, GTT 0.1 of 15.5 GB". Pure. */
export function memoryPools(s) {
  if (!s?.mem?.MemTotal) return null;
  const total = s.mem.MemTotal, avail = s.mem.MemAvailable ?? 0;
  const some = s.psi?.some?.avg10 ?? null, full = s.psi?.full?.avg10 ?? null;
  const swapUsed = (s.mem.SwapTotal ?? 0) - (s.mem.SwapFree ?? 0), zramUsed = (s.zram || []).reduce((a, z) => a + (z.total || 0), 0);
  const parts = [`system RAM ${g1(total - avail)} of ${g1(total)} GB used (${g1(avail)} GB available)`, `memory pressure some ${some ?? '?'} % / full ${full ?? '?'} % (10 s)`, `swap ${g1(swapUsed)} GB used${zramUsed ? ` (zram holds ${g1(zramUsed)} GB compressed)` : ''}`];
  let vramPct = 0;
  if (s.amd?.mem_info_vram_total) {
    const vt = s.amd.mem_info_vram_total, vu = s.amd.mem_info_vram_used ?? 0, gt = s.amd.mem_info_gtt_total ?? 0, gu = s.amd.mem_info_gtt_used ?? 0;
    vramPct = vu / vt * 100;
    parts.push(`GPU VRAM ${g1(vu)} of ${g1(vt)} GB used`, `GTT ${g1(gu)} of ${g1(gt)} GB used`, `GPU busy ${s.amd.gpu_busy_percent ?? '?'} %`);
    if (s.amd.edge_temp_mc) parts.push(`GPU edge ${Math.round(s.amd.edge_temp_mc / 1000)} °C`);
    const top = (s.vramProc || []).slice(0, 3).map((p) => `${(p.cmd || '').split(/\s+/).slice(0, 2).join(' ').slice(-40)} ${g1(p.vramKb * 1024)} GB`).join(' · ');
    if (top) parts.push(`top VRAM: ${top}`);
  }
  const svc = Object.entries(s.svc || {}).map(([n, v]) => `${n} ${v.current != null ? g1(v.current) : 'idle'} GB now / peak ${v.peak != null ? g1(v.peak) : '?'} GB`).join(', ');
  if (svc) parts.push(`services: ${svc}`);
  const ours = Number(s.ours?.['ours-capped-scopes'] || 0);
  if (ours) parts.push(`our capped jobs ${g1(ours)} GB`);
  const availGb = avail / GiB;
  const critical = (some ?? 0) >= 20 || availGb < 3 || vramPct >= 97;
  const warn = (some ?? 0) >= 5 || availGb < 8 || vramPct >= 92 || (full ?? 0) >= 1;
  return { label: `${s.host || 'host'} ${parts.join(' · ')}`, ok: !critical && !warn, level: critical ? 'critical' : 'warn', avail_gb: availGb, psi_some10: some, psi_full10: full, vram_pct: vramPct };
}
