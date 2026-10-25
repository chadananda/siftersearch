// GPU spend ∝ work done (Chad 10-24): the rent rule (work first, rent second), the per-pod ledger (rented vs busy minutes, $ rented vs
// $ productive) and the reaper's verdicts. Pure — the cloud lane (media-jobs.js) ticks it, pod-reaper.js and system-checks read it.
export const POD_PREFIX = 'sifter-unipase-';
export const LEDGER = {
  busyUtil: 15,                     // GPU utilisation % at or above which a sampled tick counts as busy
  windowMs: 30 * 60_000,            // the efficiency window
  idleMs: 10 * 60_000,              // a rented pod with no work this long is terminated
  unreachableMs: 25 * 60_000,       // no successful contact with the lane this long (transfers refresh it, so a busy lane keeps it fresh)
  quietMs: 60 * 60_000,             // work assigned but the GPU quiet this long = stuck (the GPU is busy ~1 min of each ~7 per talk: transfers dominate, so this is a last resort)
  maxLifeMs: 8 * 3600_000,          // no pod lives longer than this
  bootMs: 15 * 60_000,              // no SSH-reachable pod after this → terminate and replace (cold pull of the 23 GB image: 5-12 min)
  warmMs: 20 * 60_000,              // bootstrap (pip + weights) must finish in this
  laneStaleMs: 10 * 60_000,         // the lane's state not refreshed this long = the lane is not running
  minEfficiency: 0.7,
  minHoursPerPod: () => Number(process.env.MEDIA_CLOUD_MIN_HOURS ?? 2),
};

/** Pods worth renting for this much waiting audio: at least minHours per pod (work first, rent second). 0 → nothing queued, nothing rented. */
export function podsWanted({ queueHours, maxPods, minHours = LEDGER.minHoursPerPod() }) {
  if (!(queueHours > 0)) return 0;
  if (!(minHours > 0)) return maxPods;
  return Math.min(maxPods, Math.floor(queueHours / minHours));
}

/** Time of a RunPod REST timestamp ("2026-10-24 07:33:53.393 +0000 UTC") → ms. */
export function runpodTime(s) {
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?) \+0000/.exec(String(s || ''));
  return m ? Date.parse(`${m[1]}T${m[2]}Z`) : NaN;
}

/** One lane tick: `live` pods, `util[podId]` = sampled GPU % (or undefined). Adds rented/busy ms to each pod and to the 1-minute
 *  buckets of the window; sets/clears `idle_since` (a ready pod with no job assigned and a quiet GPU). Mutates st. */
export function ledgerTick(st, live, util, now) {
  const dt = Math.min(Math.max(0, now - (st.ledger_at || now)), 120_000);
  st.ledger_at = now;
  st.buckets = st.buckets || [];
  const minute = Math.floor(now / 60_000) * 60_000;
  let b = st.buckets.at(-1);
  if (!b || b.t !== minute) { b = { t: minute, rented_ms: 0, busy_ms: 0, usd: 0, usd_busy: 0 }; st.buckets.push(b); }
  for (const p of live) {
    const u = util?.[p.id];
    const assigned = Object.values(st.jobs || {}).some((j) => j.pod === p.id);
    const busy = u != null ? u >= LEDGER.busyUtil : false;
    p.rented_ms = (p.rented_ms || 0) + dt;
    if (busy) p.busy_ms = (p.busy_ms || 0) + dt;
    if (u != null) p.util = u;
    const usd = (p.costPerHr || 0) * dt / 3600_000;
    b.rented_ms += dt; b.usd += usd;
    if (busy) { b.busy_ms += dt; b.usd_busy += usd; }
    if (u != null) { if (busy) delete p.quiet_since; else p.quiet_since = p.quiet_since || now; }
    if (p.status === 'ready' && !assigned && !busy) p.idle_since = p.idle_since || now; else delete p.idle_since;
  }
  st.buckets = st.buckets.filter((x) => x.t > now - LEDGER.windowMs - 60_000);
}

/** Busy share of rented time over the window (null until 5 rented minutes exist). */
export function efficiency(st, now = Date.now()) {
  const rows = (st.buckets || []).filter((x) => x.t > now - LEDGER.windowMs);
  const rented = rows.reduce((a, x) => a + x.rented_ms, 0), busy = rows.reduce((a, x) => a + x.busy_ms, 0);
  return rented >= 5 * 60_000 ? Math.round((busy / rented) * 100) / 100 : null;
}

const r2 = (n) => Math.round(n * 100) / 100;
/** The ledger as /ops/services and the state file show it. */
export function ledgerSummary(st, now = Date.now(), spendOf = () => st.spent_usd || 0, cap = 60) {
  const pods = Object.values(st.pods || {});
  const usd = (p, ms) => (p.costPerHr || 0) * ms / 3600_000;
  return {
    lane_updated_s: st.updated ? Math.round((now - st.updated) / 1000) : null,
    money_stopped: st.cloud_stopped || null, wasted_usd: st.wasted_usd || 0, breaker_until: st.breaker_until && st.breaker_until > now ? st.breaker_until : null, breaker_reason: st.breaker_until > now ? st.breaker_reason : null, proven: !!st.proven, waste_log: (st.waste_log || []).slice(-8), hosts: st.pods ? hostStatsLite(st) : null,
    running: !!st.started && !st.finished,
    spent_usd: spendOf(st, now), cap_usd: cap,
    rented_usd: r2(pods.reduce((a, p) => a + usd(p, p.rented_ms || 0), 0)),
    productive_usd: r2(pods.reduce((a, p) => a + usd(p, p.busy_ms || 0), 0)),
    efficiency_30m: efficiency(st, now),
    queue: (st.queue || []).length, in_flight: Object.keys(st.jobs || {}).length,
    pods: pods.map((p) => ({ id: p.id, name: p.name, gpu: p.gpu || null, cost_per_hr: p.costPerHr ?? null, live: !p.terminated, status: p.terminated ? `terminated (${p.why})` : p.status,
      rented_min: Math.round((p.rented_ms || 0) / 60_000), busy_min: Math.round((p.busy_ms || 0) / 60_000), util: p.util ?? null, worker: p.worker || null, baked: !!p.baked,
      idle_min: p.idle_since ? Math.round((now - p.idle_since) / 60_000) : 0 })),
  };
}

/** The reaper's verdict on one RunPod pod → a reason or null. `entry` = the lane's record of it, `st` = the lane's state (or null).
 *  Only pods named sifter-unipase-* are ever judged. Independent of the lane: it reads only what the lane last wrote. */
export function reapReason(pod, entry, st, now, cfg = LEDGER) {
  if (!String(pod?.name || '').startsWith(POD_PREFIX)) return null;
  const since = runpodTime(pod.lastStartedAt || pod.createdAt);
  const age = Number.isNaN(since) ? 0 : now - since;
  const min = (ms) => Math.round(ms / 60_000);
  if (age > cfg.maxLifeMs) return `past its ${min(cfg.maxLifeMs)} min lifetime`;
  if (!entry) return age > cfg.idleMs ? `not tracked by the lane (orphan, ${min(age)} min old)` : null;
  if (entry.terminated) return 'the lane already terminated it';
  const laneAge = st?.updated ? now - st.updated : Infinity;
  if (laneAge > cfg.laneStaleMs) return `the lane is not running (state ${laneAge === Infinity ? 'never written' : `${min(laneAge)} min old`}) but the pod is billing`;
  if (entry.status === 'booting' && age > cfg.bootMs) return `no SSH after ${min(age)} min (boot deadline ${min(cfg.bootMs)})`;
  if (entry.status === 'warming' && age > cfg.warmMs) return `worker not ready after ${min(age)} min`;
  if (entry.idle_since && now - entry.idle_since > cfg.idleMs) return `idle ${min(now - entry.idle_since)} min`;
  if (entry.quiet_since && now - entry.quiet_since > cfg.quietMs) return `GPU quiet ${min(now - entry.quiet_since)} min (stuck)`;
  if (entry.status === 'ready' && entry.lastOk && now - entry.lastOk > (cfg.unreachableMs || cfg.idleMs)) return `unreachable ${min(now - entry.lastOk)} min`;
  return null;
}

function hostStatsLite(st) {
  const out = {};
  for (const p of Object.values(st.pods || {})) {
    const dc = p.dc || p.host_key || 'unknown';
    const e = (out[dc] ||= { pods: 0, booted: 0, boot_s: 0, never_worked: 0 });
    e.pods++; if (p.ready_at) { e.booted++; e.boot_s += (p.ready_at - p.created) / 1000; }
    if (p.terminated && !(p.jobs_assigned > 0)) e.never_worked++;
  }
  for (const e of Object.values(out)) { e.avg_boot_s = e.booted ? Math.round(e.boot_s / e.booted) : null; delete e.boot_s; }
  return out;
}
