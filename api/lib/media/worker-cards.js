// The machines doing the media work, as /media shows them (Chad 10-29: a small card per machine: role, RAM, GPU, speed).
// Pure: the lane state (cloud.js STATE_FILE) → cards. Speed = audio processed per wall-clock hour over the last 3 h (× real time).
// Hardware is a fixed table (home machines) or the pod's own report (RunPod). No temperatures, costs or addresses leave here.
export const MACHINES = [
  // tower = storage (Chad 10-29): read off the box 10-29 (lscpu, lsblk: 2 SAS HDD + 2 SAS SSD + 2 NVMe + 1 USB, ~32 TB raw)
  { key: 'tower', name: 'Tower', role: 'Storage + conductor', specs: [['CPU', '2 × Xeon E5-2698'], ['Cores', '40 · 80 threads'], ['Drives', '7'], ['Store', '32 TB']] },
  { key: 'boss', name: 'Boss', role: 'Remaster + transcribe', specs: [['GPU', 'Radeon 8060S (Strix Halo)'], ['RAM', '128 GB unified']] },
  { key: 'aorus', name: 'Aorus', role: 'Remaster + checks', specs: [['GPU', 'RTX 3070 · 8 GB'], ['RAM', '16 GB']] },
];
export const SPEED_WINDOW_MS = 3 * 3600_000;
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

export function workerCards(st = {}, now = Date.now()) {
  const sp = speeds(st.done, now, Object.fromEntries(Object.values(st.pods || {}).filter((p) => p.created).map((p) => [p.name, p.created])));
  const homeJobs = {};
  for (const h of Object.keys(st.home || {})) homeJobs[base(h)] = (homeJobs[base(h)] || 0) + 1;
  const cards = MACHINES.map((m) => {
    if (m.key === 'tower') return { ...m, status: 'conducting', jobs: Object.keys(st.jobs || {}).length + Object.keys(st.home || {}).length, speed: null };
    const down = (st.host_down?.[m.key] || 0) > now;
    const jobs = homeJobs[m.key] || 0;
    return { ...m, status: jobs ? 'working' : down ? 'resting' : 'idle', jobs, speed: sp[m.key] ?? null };
  });
  for (const p of Object.values(st.pods || {})) {
    if (p.terminated) continue;
    const w = p.worker || {};
    const jobs = Object.values(st.jobs || {}).filter((j) => j.pod === p.id).length;
    const vram = w.vram_total_gb ? ` · ${Math.round(w.vram_total_gb)} GB` : '';
    cards.push({ key: p.name, name: `RunPod ${String(p.name).replace(/^sifter-unipase-/, '#')}`, role: 'Cloud remaster',
      specs: [['GPU', p.gpu ? `${String(p.gpu).replace(/^NVIDIA (GeForce )?/, '')}${vram}` : vram ? `NVIDIA${vram}` : 'assigning…'], ['RAM', w.ram_avail_gb ? `${Math.round(w.ram_avail_gb)} GB free` : '—']],
      status: p.status === 'ready' ? (jobs ? 'working' : 'idle') : 'starting', jobs, speed: sp[p.name] ?? null });
  }
  return cards;
}
