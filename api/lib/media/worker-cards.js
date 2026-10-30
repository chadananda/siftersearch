// The machines doing the media work, as /media shows them (Chad 10-29: a small card per machine: role, RAM, GPU, speed).
// Pure: the lane state (cloud.js STATE_FILE) → cards. Speed = audio processed per wall-clock hour over the last hour (× real time).
// Hardware is a fixed table (home machines) or the pod's own report (RunPod). No temperatures, costs or addresses leave here.
export const MACHINES = [
  // tower = storage (Chad 10-29): read off the box 10-29 (lscpu, lsblk: 2 SAS HDD + 2 SAS SSD + 2 NVMe + 1 USB, ~32 TB raw)
  { key: 'tower', name: 'Tower', role: 'Store + conduct', specs: [['CPU', '2 × Xeon E5-2698'], ['Cores', '40 · 80 threads'], ['Drives', '7'], ['Store', '32 TB']] },
  { key: 'boss', name: 'Boss', role: 'Remaster + ASR', specs: [['GPU', 'Radeon 8060S (Strix Halo)'], ['RAM', '128 GB unified']] },
  { key: 'aorus', name: 'Aorus', role: 'Remaster + checks', specs: [['GPU', 'RTX 3070 · 8 GB'], ['RAM', '16 GB']] },
];
// A pod's card name (Chad 10-30: "a random cute name starting with Pod"): stable per pod — picked by its number, so neighbouring pods differ
export const POD_NAMES = ['Podcat', 'Podfish', 'Podgate', 'Podmunk', 'Podpuff', 'Podsnail', 'Podwhistle', 'Podnoodle', 'Podpickle', 'Podbadger',
  'Podmuffin', 'Podotter', 'Podbiscuit', 'Podwombat', 'Podsprocket', 'Podbeetle', 'Podkettle', 'Podsquid', 'Podwaffle', 'Podgoose', 'Podturnip',
  'Podnugget', 'Podmoth', 'Podcrumpet', 'Podbumble', 'Podfrog', 'Podteapot', 'Podgizmo', 'Podpanda', 'Podsock', 'Podwiggle', 'Podsparrow',
  'Podpudding', 'Podhedgehog', 'Podyak', 'Podlantern', 'Podmitten', 'Podquokka', 'Podgumdrop', 'Podnewt', 'Podpretzel'];   // 41: prime, so n·17 mod 41 never repeats in a run of 41
export function podName(name) {
  const s = String(name || ''), m = s.match(/(\d+)$/);
  const n = m ? Number(m[1]) : [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return POD_NAMES[(n * 17) % POD_NAMES.length];
}
export const SPEED_WINDOW_MS = 3600_000;   // one hour: a current snapshot (Chad 10-30)
const base = (h) => String(h || '').replace(/-\d+$/, '');
const r1 = (x) => Math.round(x * 10) / 10;

/** audio seconds finished per host key in the window → × real time. A pod younger than the window is divided by its own age
 *  (10-30: a 55-minute-old pod at 9.7× showed 3.2× — its hour of work spread over 3 h). since: { key → ms it started } */
export function speeds(done, now, since = {}) {
  const out = {};
  for (const d of done || []) if (d.at > now - SPEED_WINDOW_MS && d.at <= now && d.audio_s > 0) { const k = /^sifter-unipase-/.test(d.pod || '') ? d.pod : base(d.gpu || d.pod); out[k] = (out[k] || 0) + d.audio_s; }
  for (const k of Object.keys(out)) out[k] = r1(out[k] / (Math.min(SPEED_WINDOW_MS, Math.max(now - (since[k] || 0), 600_000)) / 1000));
  return out;
}

const pct = (x) => (Number.isFinite(x) && x >= 0 ? Math.min(100, Math.round(x)) : null);
export const GAUGE_FRESH_MS = 5 * 60_000;
/** The pod poll's GAUGE line (media-jobs.js) → { usage_us, at, cpu, gpu } busy %. CPU = the container's cgroup CPU time since the previous poll ÷ its CPU
 *  quota (the host's 128 cores are not the pod's ~14). GPU = power draw ÷ power limit: nvidia-smi's utilization reads 98-100 % on an underfed card
 *  (10-30: 100 % "util" at 290 of 450 W) — any kernel in the sample window counts. prev = the pod's last sample. */
export function readGauges(stdout, prev = {}, now = Date.now()) {
  const m = /^GAUGE (\S+) (\S+) (\S+) (\S+)(?: (\S+))?/m.exec(stdout || '');
  if (!m) return null;
  const [, u, quota, period, nproc, power] = m;
  const cpus = quota !== 'max' && Number(quota) > 0 && Number(period) > 0 ? Math.min(Number(nproc) || Infinity, quota / period) : Number(nproc) || null;
  const usage = /^\d+$/.test(u) ? Number(u) : null;
  const out = { usage_us: usage, at: now, cpu: null, gpu: null };
  if (usage != null && prev?.usage_us != null && now > prev.at && cpus) out.cpu = pct((usage - prev.usage_us) / 1e3 / ((now - prev.at) * cpus) * 100);
  const [draw, limit] = String(power || '').split(',').map(Number);
  if (draw >= 0 && limit > 0) out.gpu = pct((draw / limit) * 100);
  return out;
}

/** Tower's two sockets (Chad 10-30: "Tower has two CPUs"): busy % per physical package from /proc/stat cpuN lines between two samples.
 *  pkg: cpu index → package id. Returns { ticks, cpus: [busy % per package, in package order] } (cpus null on the first sample). Pure. */
export function socketBusy(stat, pkg, prev = null) {
  const ticks = {};
  for (const m of String(stat || '').matchAll(/^cpu(\d+) (.+)$/gm)) {
    const v = m[2].trim().split(/\s+/).map(Number), p = pkg[m[1]] ?? 0;
    const t = ticks[p] ||= [0, 0];
    t[0] += v.slice(0, 8).reduce((a, b) => a + b, 0); t[1] += v[3] + v[4];
  }
  const keys = Object.keys(ticks).sort((a, b) => a - b);
  const cpus = prev ? keys.map((k) => { const dt = ticks[k][0] - (prev[k]?.[0] ?? 0), di = ticks[k][1] - (prev[k]?.[1] ?? 0); return dt > 0 ? pct(100 - (di * 100) / dt) : null; }) : null;
  return { ticks, cpus };
}

export function workerCards(st = {}, now = Date.now()) {
  const sp = speeds(st.done, now, Object.fromEntries(Object.values(st.pods || {}).filter((p) => p.created).map((p) => [p.name, p.created])));
  const homeJobs = {};
  for (const h of Object.keys(st.home || {})) homeJobs[base(h)] = (homeJobs[base(h)] || 0) + 1;
  const cards = MACHINES.map((m) => {
    const g = st.host_gauge?.[m.key], fresh = g && now - g.at < GAUGE_FRESH_MS;   // home hosts: the gate's 'df' (tools.js hostGauge); tower: its own sockets
    if (m.key === 'tower') return { ...m, status: 'conducting', jobs: Object.keys(st.jobs || {}).length + Object.keys(st.home || {}).length, speed: null, gauges: fresh && g.cpus ? { cpus: g.cpus } : null };
    const down = (st.host_down?.[m.key] || 0) > now;
    const jobs = homeJobs[m.key] || 0;
    return { ...m, status: jobs ? 'working' : down ? 'resting' : 'idle', jobs, speed: sp[m.key] ?? null, gauges: fresh ? { cpu: g.cpu ?? null, gpu: g.gpu ?? null } : null };
  });
  for (const p of Object.values(st.pods || {})) {
    if (p.terminated) continue;
    const w = p.worker || {};
    const jobs = Object.values(st.jobs || {}).filter((j) => j.pod === p.id).length;
    const vram = w.vram_total_gb ? ` · ${Math.round(w.vram_total_gb)} GB` : '';
    cards.push({ key: p.name, name: podName(p.name), role: 'Cloud remaster',
      specs: [['GPU', p.gpu ? `${String(p.gpu).replace(/^NVIDIA (GeForce )?/, '')}${vram}` : vram ? `NVIDIA${vram}` : 'assigning…'], ['RAM', w.ram_avail_gb ? `${Math.round(w.ram_avail_gb)} GB free` : '—']],
      status: p.status === 'ready' ? (jobs ? 'working' : 'idle') : 'starting', jobs, speed: sp[p.name] ?? null,
      gauges: p.gauge && now - p.gauge.at < GAUGE_FRESH_MS ? { cpu: p.gauge.cpu, gpu: p.gauge.gpu } : null });
  }
  return cards;
}
