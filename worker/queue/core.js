// Media job queue core (planning/edge-job-queue-plan.md): pure logic over a SQL handle shaped like a Durable Object's
// ctx.storage.sql (exec(q, ...b) → { toArray() }). Tower enqueues a padded window of staged jobs; any machine claims one that fits
// (lease + token), heartbeats, finishes; tower lists done jobs, pulls results, acks. No per-machine code anywhere.
// A job names the STAGES it wants (Chad 10-30) — never a mode: a host takes it only if it can run every one, and returns only what those
// stages produce (transcribe alone → a json). Reprocessing = enqueue the same item with the stages to redo. The queue knows no stage semantics.
// A job is a FILE ID + a WORK INVOICE (Chad 10-30): { file_id, stages, invoice: { audio_s, bytes }, need }. No paths: a remote machine gets
// signed R2 urls for stage/<file_id>/* from the Worker, a local one asks tower's file API for the same id. Hosts record their measured
// ability (audio-s per wall-s) so tower can keep 2-3 h of work queued for the machines actually engaged.
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;

export function migrate(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, item_id INTEGER, type TEXT DEFAULT 'media', stages TEXT NOT NULL DEFAULT '[]', priority INTEGER DEFAULT 0, need_vram INTEGER DEFAULT 0, need_ram REAL DEFAULT 0,
    audio_s REAL DEFAULT 0, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', host TEXT, lease TEXT, lease_until INTEGER,
    attempts INTEGER DEFAULT 0, error TEXT, result TEXT, created INTEGER, updated INTEGER)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS jobs_pick ON jobs(state, priority DESC, created)`);
  const cols = new Set(rows(sql, `PRAGMA table_info(jobs)`).map((c) => c.name));
  for (const [c, t] of [['file_id', 'TEXT'], ['claimed', 'INTEGER']]) if (!cols.has(c)) sql.exec(`ALTER TABLE jobs ADD COLUMN ${c} ${t}`);
  sql.exec(`CREATE TABLE IF NOT EXISTS hosts (host TEXT PRIMARY KEY, can TEXT, vram_mb INTEGER, ram_gb REAL, rate REAL, jobs INTEGER DEFAULT 0, last_seen INTEGER)`);
}
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
    sql.exec(`INSERT OR REPLACE INTO jobs (id, file_id, item_id, type, stages, priority, need_vram, need_ram, audio_s, body, state, attempts, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`, String(j.id), String(j.file_id), j.item_id ?? null, j.type ?? 'media', JSON.stringify(j.stages), j.priority ?? 0,
      j.need?.vram_mb ?? 0, j.need?.ram_gb ?? 0, j.invoice?.audio_s ?? 0, JSON.stringify(j), now, now);
    if (!prev) added++;
  }
  return { added };
}

/** Expired leases go back to the queue (or fail after MAX_ATTEMPTS). */
export function expire(sql, now = Date.now()) {
  const gone = rows(sql, `SELECT id, attempts FROM jobs WHERE state = 'leased' AND lease_until < ?`, now);
  for (const g of gone) release(sql, g.id, g.attempts + 1, 'lease expired', now);
  return gone.length;
}
function release(sql, id, attempts, error, now) {
  sql.exec(`UPDATE jobs SET state = ?, attempts = ?, error = ?, host = NULL, lease = NULL, lease_until = NULL, updated = ? WHERE id = ?`,
    attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, String(error).slice(0, 1000), now, id);
}

/** A machine asks for work: { host, can: [stages its image runs], vram_mb, ram_gb, types? } → the highest-priority, oldest job whose every
 *  stage it can run and whose needs fit what it has free, with a lease token; or null. */
export function claim(sql, { host, can = [], vram_mb = 0, ram_gb = 0, types = ['media'] }, now = Date.now(), token = crypto.randomUUID()) {
  if (!host) throw new Error('host required');
  sql.exec(`INSERT INTO hosts (host, can, vram_mb, ram_gb, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(host) DO UPDATE SET can = excluded.can, vram_mb = excluded.vram_mb, ram_gb = excluded.ram_gb, last_seen = excluded.last_seen`,
    host, JSON.stringify(can), vram_mb, ram_gb, now);
  expire(sql, now);
  const able = new Set(can);
  const j = rows(sql, `SELECT * FROM jobs WHERE state = 'queued' AND need_vram <= ? AND need_ram <= ? AND type IN (${types.map(() => '?').join(',')})
    ORDER BY priority DESC, created LIMIT 500`, vram_mb, ram_gb, ...types).find((r) => JSON.parse(r.stages).every((x) => able.has(x)));
  if (!j) return null;
  sql.exec(`UPDATE jobs SET state = 'leased', host = ?, lease = ?, lease_until = ?, claimed = ?, updated = ? WHERE id = ?`, host, token, now + LEASE_MS, now, now, j.id);
  return { ...out(j), state: 'leased', host, lease: token, lease_until: now + LEASE_MS };
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
  learn(sql, j.host, j.audio_s, (now - j.claimed) / 1000);
  sql.exec(`UPDATE jobs SET state = 'done', result = ?, lease = NULL, lease_until = NULL, updated = ? WHERE id = ?`, JSON.stringify(result ?? {}), now, String(id));
  return { ok: true };
}
/** EWMA of audio-seconds processed per wall-second (vendor-blind; jobs under a minute say nothing about rate). */
function learn(sql, host, audioS, wallS) {
  if (!(audioS > 0) || !(wallS >= 60)) return;
  const h = one(sql, `SELECT rate FROM hosts WHERE host = ?`, host), r = audioS / wallS;
  sql.exec(`UPDATE hosts SET rate = ?, jobs = jobs + 1 WHERE host = ?`, h?.rate ? h.rate * 0.7 + r * 0.3 : r, host);
}
const DEFAULT_RATE = 1;   // an engaged host not yet measured counts as real time
/** Engaged hosts (asked for work in the last 20 min) and their summed ability; queuedH = hours of work waiting at that pace.
 *  Tower's feeder keeps queuedH at 2-3 h. */
export function capacity(sql, now = Date.now()) {
  const hosts = rows(sql, `SELECT host, can, vram_mb, rate, jobs, last_seen FROM hosts WHERE last_seen > ? ORDER BY host`, now - HOST_FRESH_MS)
    .map((h) => ({ ...h, can: JSON.parse(h.can || '[]') }));
  const rate = hosts.reduce((a, h) => a + (h.rate || DEFAULT_RATE), 0);
  const queuedS = one(sql, `SELECT COALESCE(SUM(audio_s), 0) AS s FROM jobs WHERE state = 'queued'`).s;
  return { hosts, rate, queued_audio_h: queuedS / 3600, queued_h: rate ? queuedS / rate / 3600 : null };
}
export function fail(sql, { id, lease, error }, now = Date.now()) {
  const j = held(sql, id, lease, now);
  release(sql, j.id, j.attempts + 1, error || 'failed', now);
  return { ok: true };
}
/** Tower: finished jobs to pull, oldest first. */
export const listDone = (sql, limit = 50) => rows(sql, `SELECT * FROM jobs WHERE state = 'done' ORDER BY updated LIMIT ?`, limit).map(out);
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
export function stats(sql, now = Date.now()) {
  expire(sql, now);
  const by = rows(sql, `SELECT state, COUNT(*) AS n, COALESCE(SUM(audio_s), 0) AS audio_s FROM jobs GROUP BY state`);
  const leased = rows(sql, `SELECT id, item_id, stages, host, audio_s, lease_until, updated FROM jobs WHERE state = 'leased' ORDER BY host`);
  const failed = rows(sql, `SELECT id, item_id, stages, attempts, error FROM jobs WHERE state = 'failed' ORDER BY updated DESC LIMIT 20`);
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
