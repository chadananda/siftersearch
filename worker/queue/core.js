// Media job queue core (planning/edge-job-queue-plan.md): pure logic over a SQL handle shaped like a Durable Object's
// ctx.storage.sql (exec(q, ...b) → { toArray() }). Tower enqueues a padded window of staged jobs; any machine claims one that fits
// (lease + token), heartbeats, finishes; tower lists done jobs, pulls results, acks. No per-machine code anywhere.
// A job names the STAGES it wants (Chad 10-30) — never a mode: a host takes it only if it can run every one, and returns only what those
// stages produce (transcribe alone → a json). Reprocessing = enqueue the same item with the stages to redo. The queue knows no stage semantics.
// A job is a FILE ID + a WORK INVOICE (Chad 10-30): { file_id, stages, invoice: { audio_s, bytes }, need }. No paths: a remote machine gets
// signed R2 urls for stage/<file_id>/* from the Worker, a local one asks tower's file API for the same id. Hosts record their measured
// ability (audio-s per wall-s) so tower can keep 2-3 h of work queued for the machines actually engaged.
// TYPED media jobs (planning/stage-queue-20261031.md, contract scripts/media/worker/job-types.json): cpu-prep -> gpu -> cpu-finish. A host
// claims by TYPE in its preference order (the type is the capability; no stage list), may SPILL into other types only while their backlog
// is long, and learns one measured rate per type. Priority is ORDER (bands new > remaster > rerun; 1 claim in 5 to the oldest lower band).
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
export const TYPED = new Set(['cpu-prep', 'gpu', 'cpu-finish']);
const MEDIA_HOST_TYPES = new Set(['media', ...TYPED]);   // claimers of these are capacity hosts (an intake sampler is not)
export const BANDS = { new: 0, remaster: 1, rerun: 2 };
export const LOWER_BAND_EVERY = 5;   // every 5th claim of a type goes to the oldest job of a lower band: no band starves
export const AVOID_MS = 30 * 60_000; // a host that failed a job steps aside this long, then may take it again (never strands a talk)
export const SPILL_H = 1;            // a host spills into a type only while that type's queue is longer than this (hours of work)
export const LOG_KEEP_MS = 6 * 3600_000, RATE_WINDOW_MS = 2 * 3600_000;   // finished jobs kept 6 h; throughput = the last 2 h
export const isPod = (host) => /^pod-/.test(String(host));

export function migrate(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, item_id INTEGER, type TEXT DEFAULT 'media', stages TEXT NOT NULL DEFAULT '[]', priority INTEGER DEFAULT 0, need_vram INTEGER DEFAULT 0, need_ram REAL DEFAULT 0,
    audio_s REAL DEFAULT 0, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', host TEXT, lease TEXT, lease_until INTEGER,
    attempts INTEGER DEFAULT 0, error TEXT, result TEXT, created INTEGER, updated INTEGER)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS jobs_pick ON jobs(state, priority DESC, created)`);
  const cols = new Set(rows(sql, `PRAGMA table_info(jobs)`).map((c) => c.name));
  for (const [c, t] of [['file_id', 'TEXT'], ['claimed', 'INTEGER'], ['band', 'INTEGER DEFAULT 0'], ['contract', 'TEXT'], ['avoid', 'TEXT']])
    if (!cols.has(c)) sql.exec(`ALTER TABLE jobs ADD COLUMN ${c} ${t}`);
  sql.exec(`CREATE INDEX IF NOT EXISTS jobs_type_pick ON jobs(state, type, band, priority DESC, created)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS hosts (host TEXT PRIMARY KEY, can TEXT, vram_mb INTEGER, ram_gb REAL, rate REAL, jobs INTEGER DEFAULT 0, last_seen INTEGER)`);
  const hcols = new Set(rows(sql, `PRAGMA table_info(hosts)`).map((c) => c.name));
  if (!hcols.has('types')) sql.exec(`ALTER TABLE hosts ADD COLUMN types TEXT`);
  sql.exec(`CREATE TABLE IF NOT EXISTS rates (host TEXT NOT NULL, type TEXT NOT NULL, rate REAL, jobs INTEGER DEFAULT 0, updated INTEGER, PRIMARY KEY (host, type))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
  // every finished job (host, type, audio, claimed → done): rolling THROUGHPUT per type and per pod (audio-h per wall-h), not one job's speed
  sql.exec(`CREATE TABLE IF NOT EXISTS done_log (host TEXT, type TEXT, audio_s REAL, claimed INTEGER, at INTEGER)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS done_log_at ON done_log(type, at)`);
}
const bandOf = (b) => (typeof b === 'number' ? b : BANDS[b] ?? 0);
const hostTypes = (h) => (h.types ? JSON.parse(h.types) : ['media']);   // a host registered before typed jobs is a legacy media host
export const HOST_FRESH_MS = 20 * 60_000;   // a host that has not asked for work in 20 min is not engaged

const rows = (sql, q, ...b) => sql.exec(q, ...b).toArray();
const one = (sql, q, ...b) => rows(sql, q, ...b)[0] ?? null;
const out = (r) => r && { ...r, stages: JSON.parse(r.stages || '[]'), body: JSON.parse(r.body), result: r.result ? JSON.parse(r.result) : null };

/** Tower adds jobs (upsert by id; a job already leased/done is left alone).
 *  job: { id, file_id, type: 'media', stages: ['transcribe', …], invoice: { audio_s, bytes }, need: { vram_mb, ram_gb }, priority, params } */
export function enqueue(sql, jobs, now = Date.now()) {
  let added = 0;
  for (const j of jobs) {
    if (!j?.id) throw new Error('job without id');
    if (!Array.isArray(j.stages) || !j.stages.length) throw new Error(`job ${j.id} without stages`);
    if (!j.file_id) throw new Error(`job ${j.id} without file_id`);
    const prev = one(sql, `SELECT state FROM jobs WHERE id = ?`, String(j.id));
    if (prev && prev.state !== 'queued') continue;
    sql.exec(`INSERT OR REPLACE INTO jobs (id, file_id, item_id, type, stages, priority, band, contract, need_vram, need_ram, audio_s, body, state, attempts, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`, String(j.id), String(j.file_id), j.item_id ?? null, j.type ?? 'media', JSON.stringify(j.stages), j.priority ?? 0,
      bandOf(j.band), j.contract == null ? null : String(j.contract), j.need?.vram_mb ?? 0, j.need?.ram_gb ?? 0, j.invoice?.audio_s ?? 0, JSON.stringify(j), now, now);
    if (!prev) added++;
  }
  return { added };
}

/** Expired leases go back to the queue (or fail after MAX_ATTEMPTS). */
export function expire(sql, now = Date.now()) {
  const gone = rows(sql, `SELECT id, attempts, host, avoid FROM jobs WHERE state = 'leased' AND lease_until < ?`, now);
  for (const g of gone) release(sql, g, g.attempts + 1, 'lease expired', now);
  return gone.length;
}
// which host/exit (head) + the actual reason (tail): a Python traceback ends a long stderr tail (10-31: whole-2185's reason was cut off twice)
export const clip = (e, n = 2400) => { const s = String(e); return s.length > n ? `${s.slice(0, 300)} … ${s.slice(-(n - 300))}` : s; };
// the failing host is AVOIDED for AVOID_MS (stage-queue §6): another host gets the retry first, but the job is never stranded on it
function release(sql, j, attempts, error, now) {
  const avoid = { ...(j.avoid ? JSON.parse(j.avoid) : {}), ...(j.host ? { [j.host]: now } : {}) };
  sql.exec(`UPDATE jobs SET state = ?, attempts = ?, error = ?, avoid = ?, host = NULL, lease = NULL, lease_until = NULL, updated = ? WHERE id = ?`,
    attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, clip(error), JSON.stringify(avoid), now, j.id);
}

/** A machine asks for work → the job it should run next, with a lease token; or null.
 *  { host, types: preference order (default ['media']), can: stages (legacy 'media' jobs only), vram_mb, ram_gb,
 *    spill: types taken only when no preferred job exists AND that type's queue is longer than SPILL_H at its own hosts' rate,
 *    spill_only: skip the preferred types (a GPU host whose deck is full offers its spare cores),
 *    contract: number | { type: number } — a job carrying a contract goes only to a host claiming the same one } */
export function claim(sql, { host, can = [], vram_mb = 0, ram_gb = 0, types = ['media'], spill = [], spill_only = false, contract = null }, now = Date.now(), token = crypto.randomUUID()) {
  if (!host) throw new Error('host required');
  // only a MEDIA claimer is a host in the capacity sense: an intake sampler (type 'intake') must not inflate the media feed's pace
  if (types.some((t) => MEDIA_HOST_TYPES.has(t))) sql.exec(`INSERT INTO hosts (host, can, vram_mb, ram_gb, types, last_seen) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(host) DO UPDATE SET can = excluded.can, vram_mb = excluded.vram_mb, ram_gb = excluded.ram_gb, types = excluded.types, last_seen = excluded.last_seen`,
    host, JSON.stringify(can), vram_mb, ram_gb, JSON.stringify(types), now);
  expire(sql, now);
  const fits = fitter({ host, can, contract, now, others: (type) => engaged(sql, now).some((h) => h.host !== host && h.types.includes(type)) });
  const ruled = claimOrder(types, spill, policyOf(sql, now));   // the role policy (tower sets it from the pods' R2 buffer) orders a multi-role host
  const order = ruled ? (spill_only ? ruled.filter((t) => spill.includes(t)) : ruled) : [...(spill_only ? [] : types), ...spill.filter((t) => !types.includes(t) || spill_only)];
  let j = null;
  for (const type of order) {
    const spilled = !ruled && (spill_only || !types.includes(type));
    if (spilled && typeBacklogH(sql, type, now) <= SPILL_H) continue;
    j = pickOfType(sql, type, { vram_mb, ram_gb, fits });
    if (j) break;
  }
  if (!j) return null;
  sql.exec(`UPDATE jobs SET state = 'leased', host = ?, lease = ?, lease_until = ?, claimed = ?, updated = ? WHERE id = ?`, host, token, now + LEASE_MS, now, now, j.id);
  return { ...out(j), state: 'leased', host, lease: token, lease_until: now + LEASE_MS };
}
/** Role policy (Chad 10-31): a host that can run more than one typed role claims, while the GPU buffer (gpu work staged for the pods) is
 *  under target, cpu-prep → cpu-finish → gpu (fill the buffer); once it is at target, cpu-finish → gpu → cpu-prep (finish what the GPUs
 *  made; a GPU job only when nothing else waits). So Boss (prep + finish) preps while the buffer is short and shares finish once the pods are
 *  fed; a single-role host (tower: cpu-finish) is unaffected; no policy = the host's own order. Pure. */
export function claimOrder(types = [], spill = [], policy = null) {
  const all = [...types, ...spill.filter((t) => !types.includes(t))], typed = all.filter((t) => TYPED.has(t));
  if (!policy || typed.length < 2) return null;
  const rank = policy.buffer_low ? ['cpu-prep', 'cpu-finish', 'gpu'] : ['cpu-finish', 'gpu', 'cpu-prep'];
  return [...rank.filter((t) => typed.includes(t)), ...all.filter((t) => !TYPED.has(t))];
}
export const POLICY_STALE_MS = 10 * 60_000;   // tower re-sets it every pass; an old one (tower gone) no longer steers
function policyOf(sql, now) {
  try { const p = JSON.parse(one(sql, `SELECT v FROM meta WHERE k = 'policy'`)?.v || 'null'); return p && now - (p.at || 0) < POLICY_STALE_MS ? p : null; } catch { return null; }
}
/** Tower: set the role policy ({ buffer_low }) for the next claims. */
export function setPolicy(sql, policy, now = Date.now()) {
  sql.exec(`INSERT INTO meta (k, v) VALUES ('policy', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, JSON.stringify({ ...policy, at: now }));
  return { ok: true };
}
function fitter({ host, can, contract, now, others }) {
  const able = new Set(can), alt = {};
  const want = (type) => (contract && typeof contract === 'object' ? contract[type] : contract);
  return (r) => {
    if (!TYPED.has(r.type) && !JSON.parse(r.stages).every((x) => able.has(x))) return false;   // legacy/other types: the host runs every stage
    if (r.contract != null && String(want(r.type) ?? '') !== r.contract) return false;           // a stale image never takes a job
    // avoid binds typed jobs only, and only while another engaged host lists the type (a sole host retries at once, as before)
    const avoidAt = TYPED.has(r.type) && r.avoid ? JSON.parse(r.avoid)[host] : null;
    return !(avoidAt != null && now - avoidAt < AVOID_MS && (alt[r.type] ??= others(r.type)));
  };
}
// band ASC (new > remaster > rerun), priority DESC, oldest first; every LOWER_BAND_EVERY-th claim of a type takes the oldest lower-band job
function pickOfType(sql, type, { vram_mb, ram_gb, fits }) {
  const base = `SELECT * FROM jobs WHERE state = 'queued' AND type = ? AND need_vram <= ? AND need_ram <= ?`;
  const top = rows(sql, `${base} ORDER BY band, priority DESC, created LIMIT 500`, type, vram_mb, ram_gb).find(fits);
  if (!top) return null;
  const k = `claims:${type}`, n = Number(one(sql, `SELECT v FROM meta WHERE k = ?`, k)?.v ?? 0) + 1;
  sql.exec(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, k, String(n));
  if (n % LOWER_BAND_EVERY) return top;
  return rows(sql, `${base} AND band > ? ORDER BY created LIMIT 500`, type, vram_mb, ram_gb, top.band ?? 0).find(fits) ?? top;
}
/** Hours of work queued for a type at the summed rate of the engaged hosts that list it (real time when none is engaged). */
export function typeBacklogH(sql, type, now = Date.now()) {
  const s = one(sql, `SELECT COALESCE(SUM(audio_s), 0) AS s FROM jobs WHERE state = 'queued' AND type = ?`, type).s;
  return s / 3600 / (typeRate(sql, type, now).rate || DEFAULT_RATE);
}
function engaged(sql, now) {
  return rows(sql, `SELECT host, can, vram_mb, rate, jobs, types, last_seen FROM hosts WHERE last_seen > ? ORDER BY host`, now - HOST_FRESH_MS)
    .map((h) => ({ ...h, can: JSON.parse(h.can || '[]'), types: hostTypes(h) }));
}
const ratesOf = (sql, host) => Object.fromEntries(rows(sql, `SELECT type, rate FROM rates WHERE host = ?`, host).map((r) => [r.type, r.rate]));
function typeRate(sql, type, now, hosts = engaged(sql, now)) {
  const on = hosts.filter((h) => h.types.includes(type));
  const r = (h) => (type === 'media' ? h.rate : one(sql, `SELECT rate FROM rates WHERE host = ? AND type = ?`, h.host, type)?.rate) || DEFAULT_RATE;
  return { hosts: on.map((h) => h.host), rate: on.reduce((a, h) => a + r(h), 0), each: Object.fromEntries(on.map((h) => [h.host, r(h)])) };
}

const touch = (sql, host, now) => sql.exec(`UPDATE hosts SET last_seen = ? WHERE host = ?`, now, host);   // a working host is engaged
const held = (sql, id, lease, now) => {
  const j = one(sql, `SELECT * FROM jobs WHERE id = ?`, String(id));
  if (!j) throw Object.assign(new Error('no such job'), { status: 404 });
  if (j.state !== 'leased' || j.lease !== lease) throw Object.assign(new Error('lease lost'), { status: 409 });
  if (now) touch(sql, j.host, now);
  return j;
};
export function heartbeat(sql, { id, lease }, now = Date.now()) {
  held(sql, id, lease, now);
  sql.exec(`UPDATE jobs SET lease_until = ?, updated = ? WHERE id = ?`, now + LEASE_MS, now, String(id));
  return { lease_until: now + LEASE_MS };
}
/** result: { stages: { <stage>: { ok, … } }, outputs: [{ name, key, sha256, bytes }] } — only what the requested stages produced */
export function done(sql, { id, lease, result }, now = Date.now()) {
  const j = held(sql, id, lease, now);
  learn(sql, j.host, j.audio_s, (now - j.claimed) / 1000, j.type ?? 'media', now);
  sql.exec(`INSERT INTO done_log (host, type, audio_s, claimed, at) VALUES (?, ?, ?, ?, ?)`, j.host, j.type ?? 'media', j.audio_s || 0, j.claimed || now, now);
  sql.exec(`DELETE FROM done_log WHERE at < ?`, now - LOG_KEEP_MS);
  sql.exec(`UPDATE jobs SET state = 'done', result = ?, lease = NULL, lease_until = NULL, updated = ? WHERE id = ?`, JSON.stringify(result ?? {}), now, String(id));
  return { ok: true };
}
/** EWMA of audio-seconds processed per wall-second (vendor-blind; jobs under a minute say nothing about rate). */
// Per (host, type): a host's gpu-only rate and its cpu-prep rate are different numbers. hosts.rate stays the legacy 'media' (whole) rate.
function learn(sql, host, audioS, wallS, type = 'media', now = Date.now()) {
  if (!(audioS > 0) || !(wallS >= 60)) return;
  const r = audioS / wallS;
  const p = one(sql, `SELECT rate FROM rates WHERE host = ? AND type = ?`, host, type)?.rate;
  sql.exec(`INSERT INTO rates (host, type, rate, jobs, updated) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(host, type) DO UPDATE SET rate = excluded.rate, jobs = jobs + 1, updated = excluded.updated`, host, type, p ? p * 0.7 + r * 0.3 : r, now);
  if (type !== 'media') { sql.exec(`UPDATE hosts SET jobs = jobs + 1 WHERE host = ?`, host); return; }
  const h = one(sql, `SELECT rate FROM hosts WHERE host = ?`, host);
  sql.exec(`UPDATE hosts SET rate = ?, jobs = jobs + 1 WHERE host = ?`, h?.rate ? h.rate * 0.7 + r * 0.3 : r, host);
}
const DEFAULT_RATE = 1;   // an engaged host not yet measured counts as real time
/** Engaged hosts (asked for work in the last 20 min) and their summed ability; queuedH = hours of work waiting at that pace.
 *  Tower's feeder keeps queuedH at 2-3 h. */
// The legacy totals (rate, queued_*) count only 'media' hosts and jobs, so a CPU-only Boss never inflates the whole-job window.
// by_type: per typed job type, its queue and the engaged hosts' summed measured rate; gpu also carries the PODS' measured rate
// (all pods ever measured: pods leave by idle-exit, the rate they showed stays the best estimate of R_pod).
export function capacity(sql, now = Date.now()) {
  const hosts = engaged(sql, now).map((h) => ({ ...h, rates: ratesOf(sql, h.host) }));
  const media = typeRate(sql, 'media', now, hosts);
  const queuedS = one(sql, `SELECT COALESCE(SUM(audio_s), 0) AS s FROM jobs WHERE state = 'queued' AND type = 'media'`).s;
  const by_type = {};
  for (const type of TYPED) {
    const t = typeRate(sql, type, now, hosts);
    const q = one(sql, `SELECT COALESCE(SUM(audio_s), 0) AS s, COUNT(*) AS n FROM jobs WHERE state = 'queued' AND type = ?`, type);
    const tp = throughput(sql, type, now);
    by_type[type] = { hosts: t.hosts, rate: t.rate, each: t.each, queued: q.n, queued_audio_h: q.s / 3600, queued_h: q.s / 3600 / (t.rate || DEFAULT_RATE), throughput: tp.total, throughput_each: tp.each || {}, done_2h: tp.jobs };
    if (type === 'gpu') by_type.gpu.pod_throughput = tp.pods;
  }
  const pods = rows(sql, `SELECT host, rate FROM rates WHERE type = 'gpu' AND host LIKE 'pod-%' AND rate > 0`);
  by_type.gpu.pod_rate = pods.length ? pods.reduce((a, p) => a + p.rate, 0) / pods.length : null;
  by_type.gpu.home_rate = hosts.filter((h) => h.types.includes('gpu') && !isPod(h.host)).reduce((a, h) => a + by_type.gpu.each[h.host], 0);
  return { hosts, rate: media.rate, queued_audio_h: queuedS / 3600, queued_h: media.rate ? queuedS / media.rate / 3600 : null, by_type };
}
/** Rolling throughput of a type over the last RATE_WINDOW_MS, as CAPACITY: each host's audio finished per wall-hour while it held at least one
 *  job of the type (the union of its jobs' claim→done spans, so an idle or starved hour does not count against it); total = the hosts' sum,
 *  pods = the mean pod. null = nothing finished in the window. */
export function throughput(sql, type, now = Date.now(), windowMs = RATE_WINDOW_MS) {
  const r = rows(sql, `SELECT host, audio_s, claimed, at FROM done_log WHERE type = ? AND at > ? ORDER BY claimed`, type, now - windowMs);
  if (!r.length) return { total: null, pods: null, jobs: 0 };
  const by = {};
  for (const x of r) (by[x.host] ||= []).push(x);
  const rate = (js) => {
    let busy = 0, s = 0, e = -Infinity;
    for (const j of js) { if (j.claimed > e) { if (e > s) busy += e - s; s = j.claimed; } e = Math.max(e, j.at); }
    busy += e - s;
    return js.reduce((a, j) => a + j.audio_s, 0) / Math.max(60, busy / 1000);
  };
  const each = Object.entries(by).map(([h, js]) => [h, rate(js)]), pods = each.filter(([h]) => isPod(h)).map(([, v]) => v);
  return { total: each.reduce((a, [, v]) => a + v, 0), pods: pods.length ? pods.reduce((a, b) => a + b, 0) / pods.length : null, jobs: r.length, each: Object.fromEntries(each) };
}
/** Conservative priors until a rate is measured (said so in the plan's `priors`): a pod ≈ 4 audio-h/h; a CPU role = its hosts' single-job speed. */
export const PRIOR_POD = 4;
/** The pod target (Chad 10-31): as many pods as the CPU side can keep fed, limited only by the work left. supportable = floor(min(R_prep,
 *  R_finish) / R_pod); work = ceil(gpu work (staged + prepped + still to prep) / (R_pod · horizon)). While a rate is still a prior, one pod
 *  (it measures). No money or pod-count cap: spend is governed by efficiency (busy pods; idle ones leave). Pure. */
export function podTarget({ rPrep, rFinish, rPod, workH = 0, horizonH = 2, measured = true }) {
  const supportable = rPod > 0 ? Math.floor(Math.min(rPrep || 0, rFinish || 0) / rPod) : 0;
  const work = rPod > 0 ? Math.ceil(workH / (rPod * horizonH)) : workH > 0 ? 1 : 0;
  if (!measured) { const target = Math.min(1, work); return { supportable, work, target, binding: target < 1 ? 'backlog' : 'measuring' }; }
  const target = Math.min(supportable, work);
  const binding = work <= supportable ? 'backlog' : (rPrep || 0) <= (rFinish || 0) ? 'prep' : 'finish';
  return { supportable, work, target, binding };
}
/** capacity (or [LAN, edge] capacities: tower runs both transports) → the rates, the pod target and its binding limit. */
export function podPlan(caps, { horizonH = 2 } = {}) {
  const edgeCap = Array.isArray(caps) && caps.length > 1 ? caps[1] : null;
  const all = (Array.isArray(caps) ? caps : [caps]).filter((c) => c?.by_type);
  const sum = (f) => all.reduce((a, c) => a + (f(c) || 0), 0);
  const meas = (type) => { const v = all.map((c) => c.by_type[type]?.throughput).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const podMeas = all.map((c) => c.by_type.gpu?.pod_throughput).filter((r) => r > 0);
  const rPrepM = meas('cpu-prep'), rFinishM = meas('cpu-finish'), rPodM = podMeas.length ? podMeas.reduce((a, b) => a + b, 0) / podMeas.length : null;
  const r_prep = rPrepM ?? sum((c) => c.by_type['cpu-prep']?.rate), r_finish = rFinishM ?? sum((c) => c.by_type['cpu-finish']?.rate), r_pod = rPodM ?? PRIOR_POD;
  const priors = [...(rPrepM == null ? ['prep'] : []), ...(rFinishM == null ? ['finish'] : []), ...(rPodM == null ? ['pod'] : [])];
  const plan = { gpu_queued_h: sum((c) => c.by_type.gpu?.queued_audio_h), prep_queued_h: sum((c) => c.by_type['cpu-prep']?.queued_audio_h),
    staged_h: edgeCap?.by_type?.gpu?.queued_audio_h || 0, staged_n: edgeCap?.by_type?.gpu?.queued || 0, r_home_gpu: sum((c) => c.by_type.gpu?.home_rate),
    r_prep, r_finish, r_pod, priors, horizon_h: horizonH };
  const t = podTarget({ rPrep: r_prep, rFinish: r_finish, rPod: r_pod, workH: plan.gpu_queued_h + plan.prep_queued_h, horizonH, measured: !priors.length });
  return { ...plan, ...t, pods: t.target };
}
/** The GPU buffer (Chad 10-31): gpu work waiting for the pods on R2 should hold ~targetH hours of pod work (R_pod × pods). Below it, multi-role
 *  hosts prep first (claimOrder). Without pods (target 0) the buffer is the LAN gpu queue against the home GPUs. Pure. */
export const BUFFER_H = 2;
export function bufferPolicy(plan, { pods = 0, targetH = BUFFER_H } = {}) {
  const n = Math.max(pods, plan?.target || 0);
  if (n > 0) { const want = targetH * plan.r_pod * n; return { where: 'edge', buffer_low: (plan.staged_h || 0) < want, buffer_h: plan.staged_h || 0, want_h: want }; }
  const want = targetH * (plan?.r_home_gpu || 0);
  return { where: 'lan', buffer_low: (plan?.gpu_queued_h || 0) < want, buffer_h: plan?.gpu_queued_h || 0, want_h: want };
}
export function fail(sql, { id, lease, error }, now = Date.now()) {
  const j = held(sql, id, lease, now);
  release(sql, j, j.attempts + 1, error || 'failed', now);
  return { ok: true };
}
/** Tower: finished jobs of one TYPE to pull, oldest first ('failed' = the ones the queue gave up on). Each feeder pulls only its own type. */
export const listDone = (sql, limit = 50, type = 'media', state = 'done') =>
  rows(sql, `SELECT * FROM jobs WHERE state = ? AND type = ? ORDER BY updated LIMIT ?`, state === 'failed' ? 'failed' : 'done', type, limit).map(out);
/** Tower took the results (or gave up on a failed job): the row goes. → the removed jobs, so their R2 objects can be deleted. */
export function ack(sql, ids) {
  const gone = [];
  for (const id of ids) {
    const j = one(sql, `SELECT * FROM jobs WHERE id = ? AND state IN ('done', 'failed')`, String(id));
    if (j) { sql.exec(`DELETE FROM jobs WHERE id = ?`, j.id); gone.push(out(j)); }
  }
  return gone;
}
/** Withdraw queued jobs (tower changed its mind); a leased job is left to finish. */
export function withdraw(sql, ids) {
  let n = 0;
  for (const id of ids) n += rows(sql, `DELETE FROM jobs WHERE id = ? AND state = 'queued' RETURNING id`, String(id)).length;
  return { withdrawn: n };
}
/** Window size for tower's staging decision + the dashboard. */
export function stats(sql, now = Date.now(), type = 'media') {
  expire(sql, now);
  const by = rows(sql, `SELECT state, COUNT(*) AS n, COALESCE(SUM(audio_s), 0) AS audio_s FROM jobs WHERE type = ? GROUP BY state`, type);
  const leased = rows(sql, `SELECT id, item_id, stages, host, audio_s, lease_until, updated FROM jobs WHERE state = 'leased' AND type = ? ORDER BY host`, type);
  const failed = rows(sql, `SELECT id, item_id, stages, attempts, error FROM jobs WHERE state = 'failed' AND type = ? ORDER BY updated DESC LIMIT 20`, type);
  // queued jobs per first stage: a feeder keeps each kind of machine's window full on its own (GPU talks waiting must not idle CPU books)
  const byStage = rows(sql, `SELECT stages, COUNT(*) AS n FROM jobs WHERE state = 'queued' AND type = ? GROUP BY stages`, type);
  const queuedByStage = {};
  for (const r of byStage) { const s = (() => { try { return JSON.parse(r.stages)[0]; } catch { return null; } })() || '?'; queuedByStage[s] = (queuedByStage[s] || 0) + r.n; }
  return { states: Object.fromEntries(by.map((r) => [r.state, { n: r.n, audio_h: Math.round(r.audio_s / 36) / 100 }])), queued_by_stage: queuedByStage, leased, failed, capacity: capacity(sql, now) };
}
/** Does any remaining job still need this file's staged inputs? */
export const fileInUse = (sql, fileId) => !!one(sql, `SELECT 1 AS x FROM jobs WHERE file_id = ? LIMIT 1`, String(fileId));
/** Tower cancels jobs in any state (a leased holder's next heartbeat/done gets 'no such job'). → the removed jobs, like ack. */
export function cancel(sql, ids) {
  const gone = [];
  for (const id of ids) { const j = one(sql, `SELECT * FROM jobs WHERE id = ?`, String(id)); if (j) { sql.exec(`DELETE FROM jobs WHERE id = ?`, j.id); gone.push(out(j)); } }
  return gone;
}
