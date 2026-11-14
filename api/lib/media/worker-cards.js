// The machines doing the media work, as /media shows them (Chad 10-29: a small card per machine: role, RAM, GPU, speed).
// Pure: the lane state (cloud.js STATE_FILE) → cards. Speed = audio processed per wall-clock hour over the last hour (× real time).
// Hardware is a fixed table (home machines) or the pod's own report (RunPod). Dials + health: each machine's GET /health (st.machine_health,
// health-poll.js). No temperatures, costs or addresses leave here.
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
const keyOf = (h) => { const x = String(h || '').replace(/^pod-/, ''); return /^sifter-unipase-/.test(x) ? x : base(x); };
/** Audio-seconds per second over the last hour, per host/pod: whole jobs (st.done) + typed gpu steps (st.step_log; a typed chain's st.done entry is
 *  not counted again). A host with no gpu/whole work shows its cpu steps. byType: the same rate per typed step type. */
export function speeds(done, now, since = {}, steps = []) {
  const out = {}, cpu = {}, byType = {};
  const rate = (k, s) => r1(s / (Math.min(SPEED_WINDOW_MS, Math.max(now - (since[k] || 0), 600_000)) / 1000));
  const live = (d) => d.at > now - SPEED_WINDOW_MS && d.at <= now && d.audio_s > 0;
  for (const d of done || []) if (live(d) && d.mode !== 'typed') { const k = /^sifter-unipase-/.test(d.pod || '') ? d.pod : base(d.gpu || d.pod); out[k] = (out[k] || 0) + d.audio_s; }
  for (const d of steps || []) if (live(d) && d.host) {
    const k = keyOf(d.host);
    (byType[k] ||= {})[d.type] = (byType[k][d.type] || 0) + d.audio_s;
    if (d.type === 'gpu') out[k] = (out[k] || 0) + d.audio_s; else cpu[k] = (cpu[k] || 0) + d.audio_s;
  }
  for (const k of Object.keys(cpu)) if (!out[k]) out[k] = cpu[k];
  for (const k of Object.keys(out)) out[k] = rate(k, out[k]);
  for (const k of Object.keys(byType)) for (const t of Object.keys(byType[k])) byType[k][t] = rate(k, byType[k][t]);
  Object.defineProperty(out, 'byType', { value: byType, enumerable: false });
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

/** A machine's latest GET /health poll (st.machine_health, health-poll.js) → what its card shows: the dials (CPU % of its allowed cores; GPU = power
 *  draw ÷ limit when the card reports power, else busy %), and health = reachable or not (with since when), the poll's age, the image and agent
 *  version, RAM / VRAM / disk, slots per type, jobs with stage + % and the last CARD_POLLS polls [at, ok, ms, cpu]. Pure. */
export function healthView(h, now = Date.now()) {
  if (!h) return null;
  const d = h.data || {}, g = d.gpu;
  const gpu = g ? (g.power_w > 0 && g.power_limit_w > 0 ? pct((g.power_w / g.power_limit_w) * 100) : pct(g.util)) : null;
  const fresh = h.ok && now - h.at < GAUGE_FRESH_MS;
  return {
    gauges: fresh ? { cpu: pct(d.cpu?.pct), gpu } : null,
    health: { ok: !!h.ok, age_s: Math.round((now - (h.ok_at || h.at)) / 1000), down_s: h.ok ? null : Math.round((now - (h.down_since || h.at)) / 1000), error: h.ok ? null : h.error || null,
      latency_ms: h.latency_ms ?? null, image: /sha256:([0-9a-f]{12})/.exec(String(d.image || ''))?.[1] || null, version: d.agent?.version || null, uptime_s: d.agent?.uptime_s ?? null,
      ram: d.ram ? [d.ram.used_gb, d.ram.total_gb] : null, vram: g?.vram_total_mb ? [Math.round(g.vram_used_mb / 102.4) / 10, Math.round(g.vram_total_mb / 102.4) / 10] : null,
      disk_free_gb: d.disk?.free_gb ?? null, slots: d.slots || null, jobs: (d.jobs || []).map((j) => ({ type: j.type, stage: j.stage || j.phase || null, pct: j.pct ?? null, ...(j.stalled_s != null ? { stalled_s: j.stalled_s } : {}) })),
      polls: h.polls || [] },   // the agent's last_error stays in ops (ops.mjs media health): /media is public
  };
}

/** paused: the operator's media pause (cloud.js rentalPauseReason). The lane state is then frozen at its last tick (11-09: the page still
 *  showed pod 525 "Podpanda" hours after RunPod deleted it, and Aorus "2 at work" with nothing running), so every machine shows paused and
 *  no pod card is drawn from the frozen ledger (a pod billing while paused is system-checks' job: it asks RunPod). */
export function workerCards(st = {}, now = Date.now(), { paused = null, view = null } = {}) {
  // view = livePodsView() (live-pods.js): RunPod's list is the only source of pod cards (11-14: the frozen ledger listed pod 525 for 6 days);
  // machines may show paused while a pod still bills. No view → no pod cards when paused, else the ledger (legacy callers).
  const podCards = (cards, pods) => {
    if (view?.source === 'unknown') cards.push({ key: 'pods', name: 'Cloud pods', role: 'Cloud remaster', specs: [], status: `pod state unknown since ${new Date(view.unknown_since || view.as_of).toISOString().slice(11, 16)}Z`, jobs: 0, speed: null, speed_by_type: null, gauges: null, health: null });
    return cards;
  };
  if (paused) return podCards(MACHINES.map((m) => ({ ...m, status: 'paused', jobs: 0, speed: null, speed_by_type: null, gauges: null, health: null })), null).concat(view ? livePodCards(view, st, now) : []);
  const sp = speeds(st.done, now, Object.fromEntries(Object.values(st.pods || {}).filter((p) => p.created).map((p) => [p.name, p.created])), st.step_log);
  const homeJobs = {};
  for (const h of Object.keys(st.home || {})) homeJobs[base(h)] = (homeJobs[base(h)] || 0) + 1;
  const held = { ...st.q_last?.leased };   // queue agents (LAN + edge): jobs each host holds, as of tower's last queue tick
  for (const [h, n] of Object.entries(st.q_lan?.leased || {})) held[h] = (held[h] || 0) + n;
  for (const [h, n] of Object.entries(held)) homeJobs[base(h)] = (homeJobs[base(h)] || 0) + n;
  const cards = MACHINES.map((m) => {
    const hv = healthView(st.machine_health?.[m.key], now);   // the machine's own GET /health (tower: tower-finish's slice)
    const g = st.host_gauge?.[m.key], fresh = g && now - g.at < GAUGE_FRESH_MS;   // tower: its own two sockets
    if (m.key === 'tower') return { ...m, status: 'conducting', jobs: Object.keys(st.jobs || {}).length + Object.keys(st.home || {}).length, speed: null, gauges: fresh && g.cpus ? { cpus: g.cpus } : null, health: hv?.health || null };
    const down = (st.host_down?.[m.key] || 0) > now;
    const jobs = homeJobs[m.key] || 0;
    const status = hv && !hv.health.ok ? 'unreachable' : jobs ? 'working' : down ? 'resting' : 'idle';
    return { ...m, status, jobs, speed: sp[m.key] ?? null, speed_by_type: sp.byType[m.key] || null, gauges: hv?.gauges || null, health: hv?.health || null };
  });
  if (view) { podCards(cards); return cards.concat(livePodCards(view, st, now)); }
  for (const p of Object.values(st.pods || {})) {
    if (p.terminated) continue;
    const w = p.worker || {}, hv = healthView(st.machine_health?.[p.name], now);
    const jobs = Object.values(st.jobs || {}).filter((j) => j.pod === p.id).length + (held[`pod-${p.name}`] || 0);   // agent pods claim as pod-<name>
    const vram = w.vram_total_gb ? ` · ${Math.round(w.vram_total_gb)} GB` : '';
    cards.push({ key: p.name, name: podName(p.name), role: 'Cloud remaster',
      specs: [['GPU', p.gpu ? `${String(p.gpu).replace(/^NVIDIA (GeForce )?/, '')}${vram}` : vram ? `NVIDIA${vram}` : 'assigning…'], ['RAM', w.ram_avail_gb ? `${Math.round(w.ram_avail_gb)} GB free` : '—']],
      status: p.status !== 'ready' ? 'starting' : hv && !hv.health.ok ? 'unreachable' : jobs ? 'working' : 'idle', jobs, speed: sp[p.name] ?? null, speed_by_type: sp.byType[p.name] || null,
      // the agent pod's own GET /health; a legacy whole-recording pod (no agent) still has the ssh GAUGE reading
      gauges: hv ? hv.gauges : p.gauge && now - p.gauge.at < GAUGE_FRESH_MS ? { cpu: p.gauge.cpu, gpu: p.gauge.gpu } : null, health: hv?.health || null });
  }
  return cards;
}

// a pod RunPod reports: lane fields (lease, worker, speed) only when the lane is fresh; otherwise it is shown as billing with an unknown lease
function livePodCards(view, st, now) {
  const sp = speeds(st.done, now, Object.fromEntries(view.pods.filter((p) => p.created).map((p) => [p.name, p.created])), st.step_log);
  return view.pods.map((p) => {
    const w = p.worker || {}, hv = view.lane_fresh ? healthView(st.machine_health?.[p.name], now) : null, jobs = p.lease ?? 0, vram = w.vram_total_gb ? ` · ${Math.round(w.vram_total_gb)} GB` : '';
    return { key: p.name, name: podName(p.name), role: 'Cloud remaster',
      specs: [['GPU', p.gpu ? `${String(p.gpu).replace(/^NVIDIA (GeForce )?/, '')}${vram}` : vram ? `NVIDIA${vram}` : 'assigning…'], ['RAM', w.ram_avail_gb ? `${Math.round(w.ram_avail_gb)} GB free` : '—']],
      status: p.lease == null ? 'unknown' : p.status !== 'ready' ? 'starting' : hv && !hv.health.ok ? 'unreachable' : jobs ? 'working' : 'idle', jobs, speed: view.lane_fresh ? sp[p.name] ?? null : null, speed_by_type: view.lane_fresh ? sp.byType[p.name] || null : null,
      gauges: hv ? hv.gauges : p.gauge && now - p.gauge.at < GAUGE_FRESH_MS ? { cpu: p.gauge.cpu, gpu: p.gauge.gpu } : null, health: hv?.health || null, as_of: view.as_of };
  });
}
