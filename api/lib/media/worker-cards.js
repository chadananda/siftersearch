// The machines doing the media work, as /media shows them (Chad 10-29: a small card per machine: role, RAM, GPU, speed).
// Pure: the lane state (cloud.js STATE_FILE) → cards. Speed = audio processed per wall-clock hour over the last 3 h (× real time).
// Hardware is a fixed table (home machines) or the pod's own report (RunPod). No temperatures, costs or addresses leave here.
export const MACHINES = [
  { key: 'tower', name: 'Tower', role: 'Conductor', gpu: 'none, serves only', ram: '188 GB' },
  { key: 'boss', name: 'Boss', role: 'Remaster + transcribe', gpu: 'Radeon 8060S (Strix Halo)', ram: '128 GB unified' },
  { key: 'aorus', name: 'Aorus', role: 'Remaster + checks', gpu: 'RTX 3070 · 8 GB', ram: '16 GB' },
];
export const SPEED_WINDOW_MS = 3 * 3600_000;
const base = (h) => String(h || '').replace(/-\d+$/, '');
const r1 = (x) => Math.round(x * 10) / 10;

/** audio seconds finished per host key in the window → × real time */
function speeds(done, now) {
  const out = {};
  for (const d of done || []) if (d.at > now - SPEED_WINDOW_MS && d.at <= now && d.audio_s > 0) { const k = /^sifter-unipase-/.test(d.pod || '') ? d.pod : base(d.gpu || d.pod); out[k] = (out[k] || 0) + d.audio_s; }
  for (const k of Object.keys(out)) out[k] = r1(out[k] / (SPEED_WINDOW_MS / 1000));
  return out;
}

export function workerCards(st = {}, now = Date.now()) {
  const sp = speeds(st.done, now);
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
      gpu: p.gpu ? `${String(p.gpu).replace(/^NVIDIA (GeForce )?/, '')}${vram}` : 'assigning…', ram: w.ram_avail_gb ? `${Math.round(w.ram_avail_gb)} GB free` : '—',
      status: p.status === 'ready' ? (jobs ? 'working' : 'idle') : 'starting', jobs, speed: sp[p.name] ?? null });
  }
  return cards;
}
