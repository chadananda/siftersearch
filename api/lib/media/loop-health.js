// The media lane's liveness + progress (Chad 10-31: "It's like all work stops if I don't keep asking"). Pure, injected clocks.
// Each loop section beats {at, ok, err, n} into st.loop_beats; a section is judged by ITS OWN measured cadence (missed passes), never a
// fixed minute count. Progress checks watch the work itself: steps adopted, GPUs busy, pods rented. Read by media-jobs.js (writes
// st.health every tick), /ops/media/health, ops.mjs media health and system-checks.

export const K_MISSED = 4;     // own passes missed before a section is stale / hung
export const K_STEPS = 3;      // median step durations without a pulled step (while work is in flight) before progress is "stopped"
export const STREAK = 3;       // loop ticks a progress condition must hold before it counts
export const MIN_SAMPLES = 3;  // measured intervals before a cadence is trusted
const KEEP = 20;

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
export function shouldHeal(b, now, { k = K_MISSED, minSamples = MIN_SAMPLES } = {}) {
  if (b?.running_since == null) return false;
  const norm = Math.max(median(b.durs) ?? 0, median(b.gaps) ?? 0);
  if ((b.gaps?.length || 0) < minSamples || !(norm > 0)) return false;
  return now - b.running_since > 2 * k * norm * 2 ** (b.heals_in_row || 0);
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
export function workFacts(st, now, { freshMs = null } = {}) {
  const fresh = freshMs ?? 4 * (median(st.loop_beats?.tick?.gaps) || 60_000);
  const leases = sumVals(st.q_lan?.leased) + sumVals(st.q_last?.leased);
  const gpus = [];
  for (const [h, g] of Object.entries(st.host_gauge || {})) if (g && g.gpu != null && now - (g.at || 0) < fresh) gpus.push({ name: h, gpu: g.gpu });
  for (const p of Object.values(st.pods || {})) if (!p.terminated && p.status === 'ready' && p.gauge?.gpu != null && now - (p.gauge.at || 0) < fresh) gpus.push({ name: p.name, gpu: p.gauge.gpu });
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

const min = (ms) => (ms == null ? '?' : `${Math.round(ms / 60_000)} min`);
/** Conditions held across loop ticks: st.health_cond[name] = the tick run it began on; counted in ticks, so other callers never advance it. */
function streak(st, name, on, tickRuns, update) {
  st.health_cond ||= {};
  if (update) { if (!on) delete st.health_cond[name]; else if (st.health_cond[name] == null) st.health_cond[name] = { run: tickRuns, refusals: (st.rental_refusals || []).length }; }
  const c = st.health_cond[name];
  return on && c ? { ticks: tickRuns - c.run + 1, refusals_since: (st.rental_refusals || []).length - (c.refusals || 0) } : { ticks: 0, refusals_since: 0 };
}

/** The whole verdict: sections + progress checks → { sections, checks: [{ name, ok, level, detail }] }. update=true only from the loop tick. */
export function evaluate(st, now, { update = false, k = K_MISSED, kSteps = K_STEPS, streakN = STREAK } = {}) {
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
  return { at: now, sections, checks, facts: { ...f, gpus: undefined, gpu_list: f.gpus }, heals: (st.loop_heals || []).slice(-5) };
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
