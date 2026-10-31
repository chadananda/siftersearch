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
  const order = [...(spill_only ? [] : types), ...spill.filter((t) => !types.includes(t) || spill_only)];
  let j = null;
  for (const type of order) {
    const spilled = spill_only || !types.includes(type);
    if (spilled && typeBacklogH(sql, type, now) <= SPILL_H) continue;
    j = pickOfType(sql, type, { vram_mb, ram_gb, fits });
    if (j) break;
  }
  if (!j) return null;
  sql.exec(`UPDATE jobs SET state = 'leased', host = ?, lease = ?, lease_until = ?, claimed = ?, updated = ? WHERE id = ?`, host, token, now + LEASE_MS, now, now, j.id);
  return { ...out(j), state: 'leased', host, lease: token, lease_until: now + LEASE_MS };
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
    by_type[type] = { hosts: t.hosts, rate: t.rate, each: t.each, queued: q.n, queued_audio_h: q.s / 3600, queued_h: q.s / 3600 / (t.rate || DEFAULT_RATE) };
  }
  const pods = rows(sql, `SELECT host, rate FROM rates WHERE type = 'gpu' AND host LIKE 'pod-%' AND rate > 0`);
  by_type.gpu.pod_rate = pods.length ? pods.reduce((a, p) => a + p.rate, 0) / pods.length : null;
  by_type.gpu.home_rate = hosts.filter((h) => h.types.includes('gpu') && !isPod(h.host)).reduce((a, h) => a + by_type.gpu.each[h.host], 0);
  return { hosts, rate: media.rate, queued_audio_h: queuedS / 3600, queued_h: media.rate ? queuedS / media.rate / 3600 : null, by_type };
}
/** Pods to run (stage-queue §4): clamp(ceil(((G + P') / H − R_aorus) / R_pod), 0, maxPods), where G = gpu audio-h queued and P' = the
 *  prep backlog Boss can actually prepare within the horizon (min(P, H·R_prep)), so pods never outrun prep. Unmeasured R_pod → at most
 *  one pod (it measures R_pod). Pods leave by idle-exit only; this number only adds. */
export function podsWanted({ gpuQueuedH = 0, prepQueuedH = 0, rAorus = 0, rPrep = 0, rPod = null, maxPods = 0, horizonH = 2 }) {
  const need = (gpuQueuedH + Math.min(prepQueuedH, horizonH * (rPrep || 0))) / horizonH - (rAorus || 0);
  if (!(need > 0) || !(maxPods > 0)) return 0;
  if (!(rPod > 0)) return 1;
  return Math.max(0, Math.min(maxPods, Math.ceil(need / rPod)));
}
export function podPlan(cap, { maxPods = 0, horizonH = 2 } = {}) {
  const g = cap?.by_type?.gpu ?? {}, p = cap?.by_type?.['cpu-prep'] ?? {};
  const plan = { gpu_queued_h: g.queued_audio_h ?? 0, prep_queued_h: p.queued_audio_h ?? 0, r_aorus: g.home_rate ?? 0, r_prep: p.rate ?? 0,
    r_pod: g.pod_rate ?? null, max_pods: maxPods, horizon_h: horizonH };
  return { ...plan, pods: podsWanted({ gpuQueuedH: plan.gpu_queued_h, prepQueuedH: plan.prep_queued_h, rAorus: plan.r_aorus, rPrep: plan.r_prep, rPod: plan.r_pod, maxPods, horizonH }) };
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
  return { states: Object.fromEntries(by.map((r) => [r.state, { n: r.n, audio_h: Math.round(r.audio_s / 36) / 100 }])), leased, failed, capacity: capacity(sql, now) };
}
/** Does any remaining job still need this file's staged inputs? */
export const fileInUse = (sql, fileId) => !!one(sql, `SELECT 1 AS x FROM jobs WHERE file_id = ? LIMIT 1`, String(fileId));
/** Tower cancels jobs in any state (a leased holder's next heartbeat/done gets 'no such job'). → the removed jobs, like ack. */
export function cancel(sql, ids) {
  const gone = [];
  for (const id of ids) { const j = one(sql, `SELECT * FROM jobs WHERE id = ?`, String(id)); if (j) { sql.exec(`DELETE FROM jobs WHERE id = ?`, j.id); gone.push(out(j)); } }
  return gone;
}
