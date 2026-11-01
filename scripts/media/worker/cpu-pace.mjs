// Adaptive CPU slots for the queue agent (Chad 10-31: "tower, boss and aorus are still under 20% CPU. Is it not possible for them to do more?").
// Each docker job's own cgroup is read while it runs (memory.current/peak, cpu.stat): its peak RSS and mean cores feed a per-type profile kept in
// ROOT/cpu-profile.json. Another cpu-prep/cpu-finish job is admitted while the projected CPU stays under CPU_TARGET of the allowed cores (the
// slice's quota on tower, nproc on a home host) and the projected RAM headroom holds that type's measured peak plus the --min-avail-gb margin.
// Memory pressure (PSI "full" stalls) holds every claim. Until a type is measured the agent keeps its --slots (the starting value). Pure + I/O helpers.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

export const CPU_TARGET = 0.85;   // Chad 10-31: "while measured CPU is under ~85 % of its allowed cores"
export const PROFILE_RUNS = 5;    // a type's profile = its last 5 measured runs: peak = the max of them, cores = their mean
const GB = 1073741824;

/** A process's cgroup v2 directory (from /proc/<pid>/cgroup "0::/path"), or null (v1 / gone). */
export function cgroupOf(pid, read = (f) => readFileSync(f, 'utf8')) {
  try { const m = /^0::(\/.*)$/m.exec(read(`/proc/${pid}/cgroup`)); return m ? `/sys/fs/cgroup${m[1] === '/' ? '' : m[1]}` : null; } catch { return null; }
}
/** One reading of a cgroup v2 directory: { memGb, peakGb (null if the kernel has no memory.peak), usec } or null when unreadable. */
export function readCgroup(dir, read = (f) => readFileSync(f, 'utf8')) {
  if (!dir) return null;
  try {
    const usec = Number(/^usage_usec (\d+)/m.exec(read(`${dir}/cpu.stat`))?.[1]);
    const memGb = Number(read(`${dir}/memory.current`).trim()) / GB;
    let peakGb = null;
    try { peakGb = Number(read(`${dir}/memory.peak`).trim()) / GB; } catch {}
    return Number.isFinite(usec) && Number.isFinite(memGb) ? { usec, memGb, peakGb } : null;
  } catch { return null; }
}
/** Fold a reading into a job's running measurement m = { t0, usec0, t, usec, peakGb, memGb, cores } (cores = over the last ≥30 s). Pure. */
export function track(m, r, now) {
  if (!r) return m;
  if (!m) return { t0: now, usec0: r.usec, t: now, usec: r.usec, peakGb: Math.max(r.memGb, r.peakGb ?? 0), memGb: r.memGb, cores: null, win: [{ t: now, usec: r.usec }] };
  const win = [...m.win, { t: now, usec: r.usec }];
  while (win.length > 2 && now - win[1].t >= 30_000) win.shift();
  const w0 = win[0], cores = now - w0.t >= 5_000 ? (r.usec - w0.usec) / ((now - w0.t) * 1000) : m.cores;
  return { ...m, t: now, usec: r.usec, memGb: r.memGb, peakGb: Math.max(m.peakGb, r.memGb, r.peakGb ?? 0), cores, win };
}
/** A finished job's measurement → { peakGb, cores, run_s } (cores = CPU time ÷ wall time), or null when under 2 readings. Pure. */
export function summary(m) {
  if (!m || m.t <= m.t0) return null;
  return { peakGb: m.peakGb, cores: (m.usec - m.usec0) / ((m.t - m.t0) * 1000), run_s: Math.round((m.t - m.t0) / 1000) };
}

export function loadProfiles(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
export function saveProfiles(file, p) { try { writeFileSync(`${file}.tmp`, JSON.stringify(p)); renameSync(`${file}.tmp`, file); } catch {} }
/** Add a measured run to the type's history (last PROFILE_RUNS kept). Pure: returns the new profiles. */
export function record(profiles, type, s, now = Date.now()) {
  if (!s || !(s.peakGb > 0) || !(s.cores >= 0)) return profiles;
  const runs = [...(profiles[type]?.runs || []), { peak_gb: +s.peakGb.toFixed(2), cores: +s.cores.toFixed(2), run_s: s.run_s, at: now }].slice(-PROFILE_RUNS);
  return { ...profiles, [type]: { runs } };
}
/** The type's profile: { peakGb, cores, n, measured } — measured runs, else the agent's starting values (dflt). Pure. */
export function profileOf(profiles, type, dflt) {
  const runs = profiles?.[type]?.runs || [];
  if (!runs.length) return { peakGb: dflt.peakGb, cores: dflt.cores, n: 0, measured: false };
  return { peakGb: Math.max(...runs.map((r) => r.peak_gb)), cores: runs.reduce((a, r) => a + r.cores, 0) / runs.length, n: runs.length, measured: true };
}

/** Memory pressure: PSI "full avg10" (% of the last 10 s when every task stalled on memory), from the slice or the host. null = unreadable. */
export function memPressure(read = (f) => readFileSync(f, 'utf8'), file = '/proc/pressure/memory') {
  try { const v = Number(/^full avg10=([\d.]+)/m.exec(read(file))?.[1]); return Number.isFinite(v) ? v : null; } catch { return null; }
}

/**
 * Admit one more CPU job of `type`? Pure.
 *  prof(type) → profile; running: [{ type, memGb, cores }] the CPU jobs in hand (cores null until measured);
 *  busy = measured busy share of the allowed cores (null = unknown); allowed = the cores this host may use; availGb = RAM free now;
 *  marginGb = the --min-avail-gb floor; slots = the --slots starting value; pressure = memPressure().
 * Projection: a running job not yet at its type's mean will still rise to it, and one not yet at its peak RAM will still take the rest.
 */
export function admitCpu({ type, prof, running = [], busy, allowed, availGb, marginGb, slots, pressure = null, target = CPU_TARGET }) {
  const p = prof(type);
  if (pressure > 0) return { ok: false, why: `memory pressure ${pressure}` };
  const unmeasured = running.some((j) => !prof(j.type).measured) || !p.measured;
  if (unmeasured && running.length >= slots) return { ok: false, why: `unmeasured: --slots ${slots}` };
  if (busy == null && running.length) return { ok: false, why: 'cpu unknown' };
  const rise = running.reduce((a, j) => a + Math.max(0, prof(j.type).cores - (j.cores ?? 0)), 0);
  const cpu = (busy ?? 0) * allowed + rise + p.cores;
  if (running.length && cpu > target * allowed) return { ok: false, why: `cpu ${cpu.toFixed(1)}/${allowed} cores`, cpu };
  const ram = availGb - running.reduce((a, j) => a + Math.max(0, prof(j.type).peakGb - (j.memGb ?? 0)), 0);
  if (ram < p.peakGb + marginGb) return { ok: false, why: `ram ${ram.toFixed(1)} GB < ${p.peakGb.toFixed(1)} + ${marginGb}`, cpu, ram };
  return { ok: true, cpu, ram };
}

/** How many more jobs of each type would fit now (for /health "allowed"): admitCpu applied repeatedly on a copy. Pure. */
export function cpuAllowed(types, a) {
  const out = {};
  for (const t of types) {
    const p = a.prof(t);
    let n = 0, s = { ...a, running: [...a.running] };
    // an admitted job is counted as already at its profile: its cores in busy, its peak out of the free RAM
    while (n < 64 && admitCpu({ ...s, type: t }).ok) { s = { ...s, running: [...s.running, { type: t, memGb: p.peakGb, cores: p.cores }], availGb: s.availGb - p.peakGb, busy: (s.busy ?? 0) + p.cores / s.allowed }; n++; }
    out[t] = a.running.filter((j) => j.type === t).length + n;
  }
  return out;
}
