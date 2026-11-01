// The media lane's liveness + progress (Chad 10-31: "It's like all work stops if I don't keep asking"). Pure, injected clocks.
// Each loop section beats {at, ok, err, n} into st.loop_beats; a section is judged by ITS OWN measured cadence (missed passes), never a
// fixed minute count. Progress checks watch the work itself: steps adopted, GPUs busy, pods rented. Read by media-jobs.js (writes
// st.health every tick), /ops/media/health, ops.mjs media health and system-checks.

/** SCALE mode (Chad 10-31 23:50Z, 11-01 "instead of having Boss do CPU work, it is pegged with unneeded GPU work"): pods typed and the plan says
 *  scale (or its buffer turned the home GPUs off). The home hosts then take no GPU and no whole work on the legacy lane — only 'post' (a CPU
 *  tail) — so their slots go to the typed cpu-prep/cpu-finish queue. Small mode is unchanged. 11-01 03:06Z: Boss ran a second UniPASE of #2459
 *  (restore order) through gateRestoreChain while the plan read mode 'scale', home_gpu false. Pure. */
export const homeScaleMode = (st, env = process.env) => env.MEDIA_POD_TYPED === '1' && (st.pod_plan?.mode === 'scale' || st.pod_plan?.buffer?.home_gpu === false);
/** The legacy order would use a home GPU (or run the whole talk), not a CPU-only tail ('post': the UniPASE copy is on tower; 'cleanup': deterministic). */
export const homeGpuOrder = (st, id) => st.items?.[id]?.kind === 'whole' || !['post', 'cleanup'].includes(st.items?.[id]?.mode || 'restore');

export const K_MISSED = 4;     // own passes missed before a section is stale / hung
export const K_STEPS = 3;      // median step durations without a pulled step (while work is in flight) before progress is "stopped"
export const STREAK = 3;       // loop ticks a progress condition must hold before it counts
export const MIN_SAMPLES = 3;  // measured intervals before a cadence is trusted
import { CLASSES } from './stages.js';   // which home hosts take gpu work (worker profiles)
const KEEP = 20;
const CPU_TYPES = ['cpu-prep', 'cpu-finish'];

export const median = (xs) => {
  const v = (xs || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const push = (arr, x, n = KEEP) => [...(arr || []), x].slice(-n);

/** A section starts: its running time is measured from here (a section stuck mid-run is visible as 'hung'). */
export function beatStart(st, name, now) {
  const b = ((st.loop_beats ||= {})[name] ||= { runs: 0, fails: 0 });
  b.running_since = now;
  return b;
}

/** A section finished (ok or not): cadence (gap between completions) and duration samples, consecutive failures. */
export function beat(st, name, { ok = true, err = null, n = null } = {}, now) {
  const b = ((st.loop_beats ||= {})[name] ||= { runs: 0, fails: 0 });
  if (b.at != null) b.gaps = push(b.gaps, now - b.at);
  if (b.running_since != null) b.durs = push(b.durs, now - b.running_since);
  b.at = now; b.ok = !!ok; b.err = ok ? null : String(err ?? 'failed').slice(0, 300); b.n = n;
  b.runs = (b.runs || 0) + 1; b.fails = ok ? 0 : (b.fails || 0) + 1;
  if (ok) { b.last_ok = now; b.heals_in_row = 0; }
  delete b.running_since;
  return b;
}

/** One section's verdict: ok | learning | stale | hung | failing | ended | never. Thresholds are multiples of its own measured cadence. */
export function sectionState(b, now, { k = K_MISSED, minSamples = MIN_SAMPLES, ended = null } = {}) {
  if (!b) return { state: 'never' };
  const cadence = median(b.gaps), dur = median(b.durs), samples = (b.gaps?.length || 0);
  const base = { at: b.at ?? null, ago_ms: b.at != null ? now - b.at : null, cadence_ms: cadence, usual_ms: dur, n: b.n ?? null, fails: b.fails || 0, err: b.err || null };
  if (ended && (b.at == null || ended >= b.at) && b.running_since == null) return { ...base, state: 'ended' };
  if (b.running_since != null) {
    const runFor = now - b.running_since, norm = Math.max(dur ?? 0, cadence ?? 0);
    if (samples >= minSamples && norm > 0 && runFor > k * norm) return { ...base, state: 'hung', running_ms: runFor, missed: Math.floor(runFor / norm) };
  }
  if (b.fails >= k) return { ...base, state: 'failing' };
  if (!cadence || samples < minSamples) return { ...base, state: 'learning' };
  const since = now - (b.at || 0);
  if (since > k * cadence && b.running_since == null) return { ...base, state: 'stale', missed: Math.floor(since / cadence) };
  return { ...base, state: 'ok' };
}

/** May the loop abandon a hung section and start it again? Twice the hung bar, doubled per heal that did not bring a good pass. */
// progressAt: the pass's last sign of work (a step taken): a pass that keeps stepping is never abandoned, only one silent for the bar.
export function shouldHeal(b, now, { k = K_MISSED, minSamples = MIN_SAMPLES, progressAt = 0 } = {}) {
  if (b?.running_since == null) return false;
  const norm = Math.max(median(b.durs) ?? 0, median(b.gaps) ?? 0);
  if ((b.gaps?.length || 0) < minSamples || !(norm > 0)) return false;
  return now - Math.max(b.running_since, progressAt || 0) > 2 * k * norm * 2 ** (b.heals_in_row || 0);
}
export function noteHeal(st, name, now, why) {
  const b = st.loop_beats?.[name];
  if (b) { b.heals = (b.heals || 0) + 1; b.heals_in_row = (b.heals_in_row || 0) + 1; delete b.running_since; }
  st.loop_heals = push(st.loop_heals, { at: now, section: name, why: String(why).slice(0, 300) }, 30);
}

/** Each chain's last adoption mark (itemId → ms) before a pull: the next step adopted is measured from it. */
export function chainMarks(st) {
  const out = {};
  for (const [id, ch] of Object.entries(st.chains || {})) {
    let t = ch.at || 0;
    for (const v of Object.values(ch)) if (v && typeof v === 'object' && v.adopted > t) t = v.adopted;
    if (t) out[id] = t;
  }
  return out;
}
/** Steps adopted since `since` (chain steps + typed talks finished through the queue): their durations into st.step_durs; progress_at. */
export function recordSteps(st, marks, since, now) {
  const durs = [];
  for (const [id, ch] of Object.entries(st.chains || {})) for (const v of Object.values(ch)) {
    if (v && typeof v === 'object' && v.adopted >= since && marks[id] && v.adopted > marks[id]) durs.push(v.adopted - marks[id]);
  }
  for (const d of st.done || []) if (d.at >= since && d.via === 'queue' && marks[d.id] && d.at > marks[d.id]) durs.push(d.at - marks[d.id]);
  for (const x of durs) st.step_durs = push(st.step_durs, x, 50);
  if (durs.length) st.progress_at = now;
  return durs.length;
}

const sumVals = (o) => Object.values(o || {}).reduce((a, x) => a + (Number(x) || 0), 0);
const lastDone = (st) => (st.done || []).reduce((a, d) => Math.max(a, d.at || 0), 0);

/** The evidence the progress checks read, from the state file. Pure. */
/** A pod's agent works under its own host name: `pod-<name>` (step_log, queue leases); older records use the name or the RunPod id. */
const podHosts = (p) => [`pod-${p.name}`, p.name, p.id].filter(Boolean);
const podLeases = (st, p) => podHosts(p).reduce((a, h) => a + (Number(st.q_last?.leased?.[h]) || 0) + (Number(st.q_lan?.leased?.[h]) || 0), 0);
const podBeat = (st, p) => Math.max(0, ...podHosts(p).map((h) => Math.max(st.q_last?.beat?.[h] || 0, st.q_lan?.beat?.[h] || 0)));

export function workFacts(st, now, { freshMs = null, gpuHosts = CLASSES.gpu.hosts } = {}) {
  const fresh = freshMs ?? 4 * (median(st.loop_beats?.tick?.gaps) || 60_000);
  const leases = sumVals(st.q_lan?.leased) + sumVals(st.q_last?.leased);
  const gpus = [];
  // a home host counts only if its profile takes gpu work (Boss is CPU+LLM by policy: its 0 % GPU is expected, not idle)
  for (const [h, g] of Object.entries(st.host_gauge || {})) if (gpuHosts.includes(h) && g && g.gpu != null && now - (g.at || 0) < fresh) gpus.push({ name: h, gpu: g.gpu });
  for (const p of Object.values(st.pods || {})) if (!p.terminated && p.status === 'ready' && p.gauge?.gpu != null && now - (p.gauge.at || 0) < fresh) gpus.push({ name: p.name, gpu: p.gauge.gpu, pod: p });
  const busyGpus = gpus.filter((g) => g.gpu >= 5);
  const plan = st.pod_plan || {};
  const livePods = Object.values(st.pods || {}).filter((p) => !p.terminated).length;
  return {
    leases, gpus, busy_gpus: busyGpus.length,
    home_tasks: Object.keys(st.home || {}).length, pod_jobs: Object.keys(st.jobs || {}).length,
    in_flight: leases > 0 || busyGpus.length > 0 || Object.keys(st.home || {}).length > 0 || Object.keys(st.jobs || {}).length > 0,
    gpu_queued: (plan.gpu_queued_h || 0) + (plan.staged_h || 0) > 0 || (plan.staged_n || 0) > 0,
    gpu_queued_h: Math.round(((plan.gpu_queued_h || 0) + (plan.staged_h || 0)) * 10) / 10,
    staged_n: plan.staged_n || 0,
    pods_wanted: st.pods_wanted ?? plan.target ?? 0, live_pods: livePods,
    last_progress: Math.max(st.progress_at || 0, lastDone(st)) || null,
    step_median_ms: median(st.step_durs), step_samples: (st.step_durs || []).length,
  };
}

/** Since the last adopted talk (st.done): gpu steps done (step_log), finishes still waiting (qjobs), finish results refused or failed
 *  (pull_errors on cpu-finish jobs), and gpu results that are in neither (dropped). Pure. */
export function endFacts(st) {
  const last_end = lastDone(st);
  const gpu_since = (st.step_log || []).filter((x) => x.type === 'gpu' && x.at > last_end).length;
  const finish_waiting = Object.values(st.qjobs || {}).filter((q) => q.type === 'cpu-finish' && !q.adopted).length;
  const fails = (st.pull_errors || []).filter((x) => x.at > last_end && /^cpu-finish-/.test(x.job || ''));
  return { last_end: last_end || null, gpu_since, finish_waiting, finish_fails: fails.length, gpu_dropped: Math.max(0, gpu_since - finish_waiting),
    last_fail: fails.length ? String(fails[fails.length - 1].error).slice(0, 160) : null };
}

/** May the typed pod pool grow past ONE pod? Only on evidence that pods turn into talks (Chad 10-31: 5 pods rented while 0 talks came out):
 *  a pure remaster (status done, swapped 0) adopted from a pod's gpu step, and the pipeline end not dead. → { ok, why }. Pure. */
export function podsProven(st) {
  const e = endFacts(st);
  if (e.finish_fails >= 2 || (e.finish_fails >= 1 && e.gpu_dropped > 0)) return { ok: false, why: `pipeline end dead: ${e.finish_fails} finish results refused since the last adopted talk` };
  const pure = (st.done || []).filter((d) => d.mode === 'typed' && d.remaster === 'done' && !d.swapped && /^pod-/.test(String(d.gpu || '')));
  return pure.length ? { ok: true, why: `${pure.length} pure remasters adopted from pod gpu steps` } : { ok: false, why: 'no pure remaster adopted from a pod yet: one pod until one is' };
}

/** The pods' OUTPUT against their rate (coordinator 10-31: ramp only on the published rate; r_pod read 7.7 and the plan 7 pods while 3 talks
 *  finished in 32 min). Over the last horizon_h: out_h = audio of talks adopted from pod gpu steps (pure_h: of those, published as pure
 *  remasters) + wait_h = pod gpu output waiting for its finish now, against expect_h = r_pod × pod-hours (each pod from ready_at to its end).
 *  ok when output has kept up with the rate the plan assumes; the finish backlog gate bounds wait_h separately. Pure. */
// A pod's hours count from its FIRST output (its first gpu step adopted, or its first talk), not from ready_at: before then it is filling — every
// lease it holds is mid-step and nothing can come out (10-31: a 4090 at 100 % GPU and 6.6 audio-h/h busy ran its first step ~50 min; counted from
// ready_at, the 2-h window always read about half the rate, pods_output.ok stayed false and the pool sat at ONE pod with 158 h staged on R2).
// A pod that never produced adds no hours; podEarned keeps it from growing the pool.
const firstOut = (st, p) => {
  const hosts = new Set(podHosts(p));
  let t = Infinity;
  for (const x of st.step_log || []) if (x.type === 'gpu' && hosts.has(x.host) && x.at < t) t = x.at;
  for (const d of st.done || []) if (d.mode === 'typed' && hosts.has(d.gpu) && d.at < t) t = d.at;
  return t;
};
export function podOutput(st, { now = Date.now(), horizonH = 2, rPod = 0 } = {}) {
  const w0 = now - horizonH * 3600e3, isPod = (h) => /^pod-/.test(String(h || ''));
  const pod_h = Object.values(st.pods || {}).reduce((a, p) => { const s = Math.max(w0, p.ready_at || Infinity, firstOut(st, p)), e = Math.min(now, p.terminated || now); return a + (e > s ? (e - s) / 3600e3 : 0); }, 0);
  const won = (st.done || []).filter((d) => d.mode === 'typed' && d.at > w0 && isPod(d.gpu));
  const h = (xs) => xs.reduce((a, x) => a + (x.audio_s || 0), 0) / 3600;
  const out_h = h(won), pure_h = h(won.filter((d) => d.remaster === 'done' && !d.swapped));
  const wait_h = h(Object.values(st.qjobs || {}).filter((q) => q.type === 'cpu-finish' && !q.adopted && isPod(st.chains?.[q.itemId]?.gpu?.host)));
  const expect_h = (rPod || 0) * pod_h, r = (x) => +x.toFixed(2);
  return { ok: expect_h > 0 && out_h + wait_h >= expect_h, horizon_h: horizonH, pod_h: r(pod_h), expect_h: r(expect_h), out_h: r(out_h), pure_h: r(pure_h), wait_h: r(wait_h),
    talks: won.length, published: won.filter((d) => d.remaster === 'done' && !d.swapped).length, published_rate_h: r(pure_h / horizonH) };
}

/** Pure remasters adopted per hour over the last horizon, every GPU (home + pods): the outcome the pool is ramped on. Pure. */
export function talksPerHour(st, { now = Date.now(), horizonH = 2 } = {}) {
  const w0 = now - horizonH * 3600e3;
  return +((st.done || []).filter((d) => d.mode === 'typed' && d.at > w0 && d.remaster === 'done' && !d.swapped).length / horizonH).toFixed(2);
}
/** Did the last pod added raise talks published per hour (coordinator 10-31: add pods one at a time, only while talks/h rise with each)?
 *  st.ramp_log = [{ at, pods, talks_h }] — one entry per typed rental, talks_h measured when it was rented. Compared with the entry that
 *  FIRST brought the pool to its current size since it was last smaller. A replacement at the same size is not a baseline: its talks_h already
 *  holds the lost pod's output (10-31: 390 replaced 387/388 at 22 talks/h, pool held at 2 although it rose 6.5 → 20 since pod 2 first came).
 *  No entry for this size = nothing to compare = ok. Pure. */
export function rampGrowth(st, { now = Date.now(), horizonH = 2, pods = 0 } = {}) {
  const talks_h = talksPerHour(st, { now, horizonH });
  const log = st.ramp_log || [], smaller = log.findLastIndex((x) => x.pods < pods);
  const ref = log.slice(smaller + 1).find((x) => x.pods === pods);
  if (!ref) return { ok: true, talks_h, ref_talks_h: null, why: 'no rental at this size recorded' };
  const ok = talks_h > ref.talks_h;
  return { ok, talks_h, ref_talks_h: ref.talks_h, why: ok ? `talks/h rose ${ref.talks_h} → ${talks_h} since pod ${pods} came` : `talks/h ${talks_h} not above ${ref.talks_h} when pod ${pods} came: hold at ${pods}` };
}
/** How many pods the typed pool may hold now. Not proven: one (the canary). Proven: the earned pods + one on trial, grown past the live count
 *  only when rampOk. Never 0 while proven: with every pod gone (10-31: 382/386 reaped) the live count is 0 and min(earned+1, live) would
 *  rent nothing ever again. Pure. */
// provenSize (provenPoolSize): a pool size already proven within the horizon is refilled at once; replacing a pod tower lost (10-31: 387 and
// 388 closed on a refused ssh while working) is not growth, and must not send the pool back to a one-pod canary.
export function podRampCap({ proven = false, earned = 0, live = 0, rampOk = false, provenSize = 0 } = {}) {
  if (!proven) return 1;
  return Math.max(1, provenSize, Math.min(earned + 1, rampOk ? live + 1 : live));
}
/** The largest number of EARNED pods (podEarned) that were live at the same time within the horizon: a size the pool has proven. Pure. */
export function provenPoolSize(st, { now = Date.now(), horizonH = 2 } = {}) {
  const from = now - horizonH * 3600e3;
  const iv = Object.values(st.pods || {}).filter((p) => p.kind !== 'cpu' && podEarned(st, p) && (p.terminated || now) > from)
    .map((p) => [Math.max(from, p.ready_at || p.created || 0), p.terminated || now]).filter(([a, b]) => b > a);
  let best = 0;
  for (const [a] of iv) best = Math.max(best, iv.filter(([x, y]) => x <= a && y > a).length);
  return best;
}

/** Has THIS pod earned its place: a pure remaster adopted from a gpu step it ran (done.gpu = 'pod-<name>')? The pool grows by one only when
 *  every live pod has (coordinator 10-31: add pods one at a time, each measured on published outcome; 383 was rented 30 s after 382 was ready). Pure. */
export function podEarned(st, pod) {
  const host = `pod-${pod.name}`;
  return (st.done || []).some((d) => d.mode === 'typed' && d.remaster === 'done' && !d.swapped && d.gpu === host);
}

const min = (ms) => (ms == null ? '?' : `${Math.round(ms / 60_000)} min`);
/** Conditions held across loop ticks: st.health_cond[name] = the tick run it began on; counted in ticks, so other callers never advance it. */
function streak(st, name, on, tickRuns, update) {
  st.health_cond ||= {};
  if (update) { if (!on) delete st.health_cond[name]; else if (st.health_cond[name] == null) st.health_cond[name] = { run: tickRuns, refusals: (st.rental_refusals || []).length }; }
  const c = st.health_cond[name];
  return on && c ? { ticks: tickRuns - c.run + 1, refusals_since: (st.rental_refusals || []).length - (c.refusals || 0) } : { ticks: 0, refusals_since: 0 };
}

/** The whole verdict: sections + progress checks → { sections, checks: [{ name, ok, level, detail }] }. update=true only from the loop tick. */
export function evaluate(st, now, { update = false, k = K_MISSED, kSteps = K_STEPS, streakN = STREAK, env = process.env } = {}) {
  const ended = st.finished || null;
  const sections = Object.fromEntries(Object.entries(st.loop_beats || {}).map(([name, b]) => [name, sectionState(b, now, { k, ended })]));
  const checks = [];
  const tickRuns = st.loop_beats?.tick?.runs || 0;
  const workSections = new Set(['tick', 'q_pass', 'q_lan', 'pull']);
  for (const [name, s] of Object.entries(sections)) {
    if (!['stale', 'hung', 'failing'].includes(s.state)) continue;
    const ev = s.state === 'hung' ? `running ${min(s.running_ms)}, usually ${min(Math.max(s.usual_ms || 0, s.cadence_ms || 0))} (${s.missed} of its passes)`
      : s.state === 'stale' ? `last ran ${min(s.ago_ms)} ago, normally every ${min(s.cadence_ms)} (${s.missed} passes missed)`
      : `${s.fails} failures in a row: ${s.err}`;
    checks.push({ name: `Media loop: ${name}`, ok: false, level: workSections.has(name) && s.state !== 'failing' ? 'critical' : 'warn', detail: `${s.state} — ${ev}${s.err && s.state !== 'failing' ? ` · last error: ${s.err}` : ''}` });
  }
  const f = workFacts(st, now);
  // (a) work in flight, nothing coming back over several measured step durations
  const window = f.step_median_ms ? kSteps * f.step_median_ms : null;
  const since = f.last_progress ? now - f.last_progress : null;
  const stopped = !ended && f.in_flight && window != null && since != null && since > window;
  const sa = streak(st, 'no_progress', stopped, tickRuns, update);
  checks.push({ name: 'Media progress', ok: !(stopped && sa.ticks >= streakN), level: 'critical',
    detail: window == null ? `learning (${f.step_samples} step durations measured)`
      : `${stopped ? 'STOPPED — ' : ''}last step/talk adopted ${min(since)} ago; window ${min(window)} (${kSteps}× median step ${min(f.step_median_ms)}) · in flight: ${f.leases} leases, ${f.busy_gpus} busy GPUs, ${f.home_tasks} home, ${f.pod_jobs} pod jobs` });
  // (b) GPU work waiting while every GPU we can see is idle
  const idle = !ended && f.gpu_queued && f.gpus.length > 0 && f.busy_gpus === 0;
  const sb = streak(st, 'gpu_idle', idle, tickRuns, update);
  checks.push({ name: 'Media GPUs idle with work queued', ok: !(idle && sb.ticks >= streakN), level: 'critical',
    detail: `${f.gpu_queued_h} h of GPU work queued (${f.staged_n} on R2) · GPUs ${f.gpus.map((g) => `${g.name} ${g.gpu}%`).join(', ') || 'none reporting'}${idle ? ` — ALL IDLE for ${sb.ticks} ticks` : ''}` });
  // (c) pods wanted, staged work, none rented, and no refusal recorded since the condition began
  const blocked = st.cloud_stopped || st.rental_pause || (st.breaker_until && now < st.breaker_until);
  const noPods = !ended && !blocked && f.pods_wanted > 0 && f.live_pods === 0 && f.gpu_queued;
  const sc = streak(st, 'no_pods', noPods, tickRuns, update);
  checks.push({ name: 'Media pods wanted, none rented', ok: !(noPods && sc.ticks >= streakN && sc.refusals_since === 0), level: 'warn',
    detail: blocked ? `rentals held: ${st.cloud_stopped || st.rental_pause || `breaker until ${new Date(st.breaker_until).toISOString().slice(11, 16)}Z`}`
      : `wanted ${f.pods_wanted}, live ${f.live_pods}, ${f.staged_n} gpu steps on R2${noPods ? ` — none rented for ${sc.ticks} ticks${sc.refusals_since ? ` (${sc.refusals_since} refusals recorded: ${st.last_error || ''})` : ', no refusal recorded'}` : ''}` });
  // (d) a rented pod (ready, billing) sitting idle while GPU work waits — the most expensive failure: we pay for an idle card.
  // One streak per pod (a new idle pod starts its own count); the cause is read from the queue: nothing staged / not claiming / stuck.
  const idlePods = [];
  const seen = new Set();
  for (const g of f.gpus) {
    if (!g.pod) continue;
    const p = g.pod, key = `pod_idle:${p.id || p.name}`; seen.add(key);
    const on = !ended && f.gpu_queued && g.gpu < 5;
    const s = streak(st, key, on, tickRuns, update);
    if (!(on && s.ticks >= streakN)) continue;
    const held = podLeases(st, p), beatAt = podBeat(st, p);
    const cause = held > 0 ? `claiming but stuck — holds ${held} lease${held > 1 ? 's' : ''}, agent beat ${beatAt ? `${min(now - beatAt)} ago` : 'never'}`
      : f.staged_n === 0 ? 'nothing staged — 0 gpu steps on R2 for it to claim (the mover is not feeding the edge)'
      : `agent not claiming — ${f.staged_n} staged on R2, it holds none (agent beat ${beatAt ? `${min(now - beatAt)} ago` : 'never'})`;
    idlePods.push(`${p.name} $${p.costPerHr ?? '?'}/h at ${g.gpu}% GPU for ${s.ticks} ticks · ${cause}`);
  }
  if (update) for (const k of Object.keys(st.health_cond || {})) if (k.startsWith('pod_idle:') && !seen.has(k)) delete st.health_cond[k];
  const rented = f.gpus.filter((g) => g.pod);
  checks.push({ name: 'Media rented pod idle', ok: idlePods.length === 0, level: 'critical',
    detail: idlePods.length ? `PAYING FOR IDLE: ${idlePods.join(' | ')} · ${f.gpu_queued_h} h GPU work queued, ${f.staged_n} on R2`
      : `${rented.length} ready pod${rented.length === 1 ? '' : 's'} reporting${rented.length ? `: ${rented.map((g) => `${g.name} ${g.gpu}%`).join(', ')}` : ''} · ${f.staged_n} gpu steps on R2` });
  // (e) the END of the pipeline: talks adopted. Upstream steps (prep, gpu) set progress_at, so a dead finish hid behind them (10-31: 39 gpu
  // steps done, every cpu-finish refused, 0 adopted, for over an hour). Evidence, not a timer: since the last adopted talk, finish results
  // refused/failed, and gpu steps done that are neither adopted nor waiting as a finish (their work was dropped).
  const e = endFacts(st);
  const endDead = !ended && (e.finish_fails >= 2 || (e.finish_fails >= 1 && e.gpu_dropped > 0));
  checks.push({ name: 'Media pipeline end (talks adopted)', ok: !endDead, level: endDead ? 'critical' : 'warn',
    detail: `last talk adopted ${e.last_end ? `${min(now - e.last_end)} ago` : 'never'} · since then: ${e.gpu_since} gpu steps done, ${e.finish_waiting} finishes waiting, `
      + `${e.finish_fails} finish results refused/failed${e.gpu_dropped ? `, ${e.gpu_dropped} gpu results dropped` : ''}${e.last_fail ? ` · last: ${e.last_fail}` : ''}` });
  // (f) SCALE mode: a home host holding a legacy GPU/whole order (Chad 11-01: "instead of having Boss do CPU work, it is pegged with unneeded
  // GPU work"). The gate (media-jobs homeCanTake) refuses new ones; this names any that slipped through or predate it — host, item, order.
  const scale = homeScaleMode(st, env);
  const gpuHome = scale ? Object.entries(st.home || {}).filter(([, c]) => c?.itemId != null && homeGpuOrder(st, c.itemId))
    .map(([host, c]) => `${host} #${c.itemId} ${st.items?.[c.itemId]?.kind === 'whole' ? 'whole' : st.items?.[c.itemId]?.mode || 'restore'}`) : [];
  checks.push({ name: 'Media home host on GPU work in scale mode', ok: gpuHome.length === 0, level: 'critical',
    detail: !scale ? 'small mode — home GPUs may take GPU work' : gpuHome.length ? `${gpuHome.join(' | ')} — scale mode: home hosts take cpu-prep/cpu-finish only` : 'scale mode — no home host on GPU/whole work' });
  // (g) home CPU slots idle while typed CPU work waits on the LAN queue (from the feed's capacity snapshot, st.lan_cap; stale → no verdict).
  const lc = st.lan_cap, fresh = lc?.at && now - lc.at < 15 * 60_000;
  const cpuQ = fresh ? CPU_TYPES.map((t) => ({ t, n: lc.queued?.[t]?.n || 0, h: lc.queued?.[t]?.audio_h || 0 })).filter((q) => q.n > 0) : [];
  const idleHosts = cpuQ.length ? (lc.hosts || []).filter((h) => !/^pod/i.test(h.host) && cpuQ.some((q) => (h.types || []).includes(q.t))
    && cpuQ.every((q) => !(h.leased?.[q.t] > 0))).map((h) => h.host) : [];
  const sg = streak(st, 'home_cpu_idle', idleHosts.length > 0 && !ended, tickRuns, update);
  checks.push({ name: 'Media home CPU idle with CPU work queued', ok: !(idleHosts.length && sg.ticks >= streakN), level: 'warn',
    detail: !fresh ? 'no fresh LAN capacity snapshot' : `${cpuQ.map((q) => `${q.t} ${q.n} queued (${q.h} audio-h)`).join(', ') || 'no CPU work queued'}`
      + `${idleHosts.length ? ` · idle home CPU: ${idleHosts.join(', ')} for ${sg.ticks} ticks` : ''}` });
  return { at: now, sections, checks, facts: { ...f, gpus: undefined, gpu_list: f.gpus.map(({ name, gpu }) => ({ name, gpu })) }, heals: (st.loop_heals || []).slice(-5) };
}

/** A queue client / repo whose calls throw once its pass was abandoned (a hung pass that wakes later can neither enqueue, ack nor adopt). */
export function guarded(obj, alive) {
  const dead = () => Object.assign(new Error('queue pass abandoned (self-heal)'), { code: 'ABANDONED' });
  return new Proxy(obj, {
    get(t, key) {
      const v = t[key];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (!alive()) throw dead();
        const out = v.apply(t, a);
        return out && typeof out.then === 'function' ? out.then((x) => { if (!alive()) throw dead(); return x; }) : out;
      };
    },
  });
}
