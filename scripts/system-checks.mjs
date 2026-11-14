// Ops sentinel + WEEKLY maintenance email for the whole system (Chad 11-03: "a weekly maintenance email with such suggestions
// flagged. Daily or Hourly emails only for issues that need addressed right away"). Runs on tower-nas via cron:
//   */30 * * * *  --check   → criticals alarm at once via api/lib/ops/alert.js ([PAGE] site/API/tunnel down, else [ACTION]);
//                             warnings are queued (api/lib/ops/maintenance.js); a finished UPS power event is confirmed
//   05 7 * * *    --daily   → the heavy checks, queued; on WEEKLY_DAY (default Monday) it also sends the weekly (= --weekly)
//   --weekly      → send the weekly maintenance email now (health + audit digest + every queued item/section), then drain
// Checks: service health (api/writer/meili/tunnel/site) · pm2 anomalies · grounding progress,
// stalls + failure storms · AI spend · embedding backlog · answer cache · widget traffic · HOSTS (tower/aorus/boss: disk,
// memory, OOM, load, GPU — scripts/lib/host-resources.mjs, deduped alerts).
// Email via api/services/email.js (EMAIL_PROVIDER). State in logs/system-checks-state.json.
import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

// --report: the same checks, printed as JSON — no email, no state written (Chad 10-19: "check for these errors
// periodically … seems stupid for the system to email me and then I tell you"): the agent's own watch reads this
import { settleMs } from './lib/settle.mjs';
const MODE = process.argv.includes('--weekly') ? 'weekly' : process.argv.includes('--daily') ? 'daily' : process.argv.includes('--report') ? 'report' : 'check';
const HEAVY = MODE === 'daily' || MODE === 'weekly';   // the once-a-day checks (whole-table scans, wear deltas)
const WEEKLY_DAY = Number(process.env.WEEKLY_DAY ?? 1);   // 0 = Sunday … 1 = Monday (local time on tower)
const SEND_WEEKLY = MODE === 'weekly' || (MODE === 'daily' && new Date().getDay() === WEEKLY_DAY);
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
const TO = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
const STATE_FILE = 'logs/system-checks-state.json';
const SPEND_ALERT_USD = Number(process.env.ALERT_SPEND_USD || 50);
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } })();

const checks = [];   // {name, ok, level: 'critical'|'warn'|'info', detail}
const add = (name, ok, level, detail = '') => checks.push({ name, ok, level, detail });

async function http(url, { timeout = 8000, headers = {}, retries = 1 } = {}) {
  // A single failed probe is a coin-flip (transient network/TLS blips) — never page on one sample.
  // Retry after a short pause; only a REPEATED failure surfaces.
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
      return { status: r.status, body: await r.text() };
    } catch (e) {
      if (attempt >= retries) return { status: 0, body: String(e.message || e) };
      await new Promise((res) => setTimeout(res, 4000));
    }
  }
}

// ── 1. Service health ────────────────────────────────────────────────────────
// a failed probe says WHY (timeout, DNS, TLS, refused) — 10-20 18:00 the tunnel alert read only "status 0" and could not be traced
const why = (r) => (r.status ? `status ${r.status}` : `status 0 — ${String(r.body || 'no response').replace(/\s+/g, ' ').slice(0, 120)}`);
const api = await http('http://127.0.0.1:7839/health');
add('API :7839', api.status === 200, 'critical', api.status === 200 ? JSON.parse(api.body).version : why(api));
const writer = await http('http://127.0.0.1:7849/health');
add('Writer :7849', writer.status === 200, 'critical', writer.status === 200 ? 'ok' : why(writer));
// Meilisearch is retired (storage plan R8, 10-21): no probe, so a stopped Meili never pages anyone.
const tunnel = await http('https://api.siftersearch.com/health', { timeout: 12000 });
add('Public API (tunnel)', tunnel.status === 200, 'critical', tunnel.status === 200 ? 'ok' : why(tunnel));
const site = await http('https://siftersearch.com/', { timeout: 12000 });
add('Site siftersearch.com', site.status === 200, 'critical', site.status === 200 ? 'ok' : why(site));

// ── 2. PM2 anomalies ─────────────────────────────────────────────────────────
// the macro-services (docs/architecture/continuous-deploy.md, 10-19): the gateway carries every request; Anís, ops, the
// indexer and the reports workers are services of their own and must be watched too
const REQUIRED = ['siftersearch-gateway', 'siftersearch-api', 'siftersearch-anis', 'siftersearch-ops', 'siftersearch-worker', 'siftersearch-indexer',
  'siftersearch-reports', 'siftersearch-embedding', 'siftersearch-deep-research', 'siftersearch-updater', 'cloudflared-tunnel'];
const pm2List = () => { try { return JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', timeout: 20000 })); } catch { return []; } };
let procs = pm2List();
// every instance online (cluster apps have several); a reload in progress shows 'launching' / 'stopping' for seconds — a
// graceful deploy, not an outage (10-19: "pm2 siftersearch-api: launching" would have paged Chad at every deploy). Look
// again before calling it down — for as long as that process's own drain may take (its kill_timeout) plus a minute to
// start: the writer finishes its batch first, and 10-19 a fixed 60 s window paged Chad for "siftersearch-worker stopping"
// during an ordinary deploy.
const statusOf = (list, name) => { const ps = list.filter((p) => p.name === name); return !ps.length ? 'missing' : ps.every((p) => p.pm2_env?.status === 'online') ? 'online' : ps.map((p) => p.pm2_env?.status).join('/'); };
// pm2 status 'stopped' only comes from an explicit `pm2 stop` (a crash is 'errored' or a restart): a pause someone ASKED for
// (Chad 11-08: "if I ask for something, it is wrong to send me an alert message as a critical error"). Its silence, its stale
// loop sections and its idle pipeline are intended — info, never critical. Money still spent while paused (a billing pod) stays critical.
const STOPPED_ON_PURPOSE = new Set(procs.filter((p) => p.pm2_env?.status === 'stopped').map((p) => p.name));
const transitioning = () => REQUIRED.filter((n) => !['online', 'missing'].includes(statusOf(procs, n)));
for (const until = Date.now() + settleMs(procs, transitioning()); transitioning().length && Date.now() < until;) {
  await new Promise((r) => setTimeout(r, 5000));
  procs = pm2List();
}
const byName = Object.fromEntries(procs.map((p) => [p.name, p]));
// POWER (UPS on battery — api/lib/power-mode.js): read-only mode is a STATE to show, not a fault; the writers it stopped
// on purpose are expected to be stopped, and drains it caused are not stuck
const { powerState, powerLine } = await import('../api/lib/power-mode.js');
const power = powerState();
if (power) add('POWER', false, 'critical', `${powerLine()} — writes refused, reads serving; stopped: ${(power.stopped || []).join(', ') || 'none'}${power.flushed_at ? `; flushed ${power.flushed_at}` : '; FLUSH NOT DONE YET'}`);
for (const name of REQUIRED) {
  const st = statusOf(procs, name);
  if (power?.stopped?.includes(name) && st !== 'online') { add(`pm2 ${name}`, true, 'info', `${st} (stopped by POWER read-only mode)`); continue; }
  add(`pm2 ${name}`, st === 'online', 'critical', st);
}
// BOOT FAILURES: a process whose error log since its last start holds a module-load error (a SyntaxError, a missing
// module or export) cannot run — CRITICAL with the error line, whatever pm2 reports (10-23: 'draining 13 min' WARN)
{
  const { bootFailures } = await import('./lib/boot-failures.mjs');
  const tail = (f) => { try { const st = fs.statSync(f); const fd = fs.openSync(f, 'r'); const n = Math.min(st.size, 16384); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); return { text: b.toString('utf8'), mtime: st.mtimeMs }; } catch { return null; } };
  const seen = new Set();
  const rows = procs.filter((p) => !seen.has(p.name) && seen.add(p.name)).map((p) => { const t = tail(p.pm2_env?.pm_err_log_path || ''); return { name: p.name, startedAt: p.pm2_env?.pm_uptime || 0, errTail: t?.text || '', errMtime: t?.mtime || 0 }; });
  for (const f of bootFailures(rows)) add(`${f.name} BOOT FAILURE`, false, 'critical', f.line);
}
// Restart storms: +10 restarts since last run = something is crash-looping.
const restarts = Object.fromEntries(procs.map((p) => [p.name, p.pm2_env?.restart_time || 0]));
for (const [name, n] of Object.entries(restarts)) {
  const prev = state.restarts?.[name];
  if (prev != null && n - prev >= 10 && REQUIRED.includes(name)) add(`pm2 ${name} restart storm`, false, 'critical', `+${n - prev} restarts since last check`);
}

// ── 2b. Stuck drains (10-22: dewey-scout #2819 held siftersearch-reports 'draining' 30+ min — nothing claimed) ─────
const H = { 'X-Internal-Key': KEY };
let drainSeen = state.drainSeen || {};
{
  const { stuckDrains } = await import('./lib/stuck-drains.mjs');
  const r = await http('http://127.0.0.1:7839/api/admin/ops/services', { headers: H, timeout: 15000 });
  let services = null; try { services = r.status === 200 ? JSON.parse(r.body).services : null; } catch { /* not JSON */ }
  if (!services) add('Service drains', true, 'info', `services unavailable (${why(r)})`);
  else {
    // a SILENT service (no heartbeat for 5 min) is not draining — it is not running (10-23: a module that would not load
    // showed as 'draining 13 min'): CRITICAL, with its commit and last beat
    const silent = services.filter((x) => x.kind !== 'job-state' && (x.health === 'silent' || Number(x.age_s) > 300) && !power?.stopped?.includes(x.name) && !STOPPED_ON_PURPOSE.has(x.name));
    if (STOPPED_ON_PURPOSE.size) add('Services paused', true, 'info', `stopped on purpose (pm2 stop): ${[...STOPPED_ON_PURPOSE].join(', ')}`);
    add('Services alive', !silent.length, 'critical', silent.length ? silent.map((x) => `${x.name} silent ${Math.round(Number(x.age_s) / 60)} min (last beat ${x.beat_at}, commit ${String(x.commit || '').slice(0, 8)})`).join(' · ') : 'ok');
    // heavy media processing running ON TOWER (Chad 10-24): counted in cores, named by process kind
    try {
      const { towerHeavy, towerHeavyVerdict } = await import('./lib/tower-heavy.mjs');
      const v = towerHeavyVerdict(towerHeavy(execSync('ps -eo pcpu=,cgroup:300=,args= --sort=-pcpu | head -80', { encoding: 'utf8', timeout: 10000 }), { cgroup: true }), { warn: Number(process.env.TOWER_HEAVY_WARN_CORES || 6), crit: Number(process.env.TOWER_HEAVY_CRIT_CORES || 20) });
      add('Heavy media work on tower', v.ok, v.level, v.detail);
    } catch { /* ps unavailable */ }
    // paid GPU pods: rented-but-idle, billing with no lane, low efficiency, spend near the cap are CRITICAL (Chad 10-24)
    try {
      const { podChecks } = await import('./lib/pod-checks.mjs');
      const g = JSON.parse(r.body).cloud_gpu;
      // pods come from RunPod's live list inside the ops report (live-pods.js), the same answer /media and `ops.mjs media pods` show
      for (const c of podChecks(g)) add(c.name, c.ok, c.level || 'critical', c.detail);
      const rq = JSON.parse(r.body).remaster_quality;
      if (rq) add('Remaster verdicts', !(rq.published_without_verdict > 0), 'warn', rq.published_without_verdict > 0 ? `${rq.published_without_verdict} published remaster(s) have no quality verdict` : `ok · ${JSON.stringify(rq.by_verdict)}`);
      if (rq) { const poor = rq.insufficient_restoration ?? ((rq.by_grade?.D?.light || 0) + (rq.by_grade?.E?.light || 0)); add('Restoration completeness', poor === 0, 'warn', poor ? `${poor} D/E recordings have only basic cleanup and need full restoration` : 'no D/E recording accepted as a light-only restoration'); }
    } catch { /* no cloud_gpu in the response */ }
    const d = power ? { stuck: [], seen: {} } : stuckDrains(services, { seen: drainSeen, limitMs: Number(process.env.DRAIN_WARN_MIN || 10) * 60_000 });   // a power drain is not stuck
    drainSeen = d.seen;
    add('Service drains', !d.stuck.length, 'warn', d.stuck.length
      ? d.stuck.map((x) => `${x.name} draining ${x.minutes} min, held by ${x.doing.join(', ') || 'nothing named'}`).join(' · ') : 'ok');
  }
}

// ── 2b. Dewey job registry (Chad 10-28): jobs by state, stuck jobs, pause flag, spend — from the `dewey-jobs` ops REPORT (never a direct query)
try {
  const r = await http('http://127.0.0.1:7839/api/admin/ops/reports/dewey-jobs/latest', { headers: H, timeout: 15000 });
  const rep = r.status === 200 ? JSON.parse(r.body) : null;
  fetch('http://127.0.0.1:7839/api/admin/ops/reports/dewey-jobs', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) }).catch(() => {});   // refresh for next time (the queue dedupes)
  if (!rep?.result) add('Dewey jobs', true, 'info', 'no report yet');
  else {
    const j = rep.result, open = (j.by_state || []).filter((x) => !['published', 'failed', 'cancelled', 'skipped', 'handed-off'].includes(x.state)).reduce((a, x) => a + x.n, 0);
    add('Dewey jobs stuck', !(j.stuck || []).length, 'warn', (j.stuck || []).length ? j.stuck.slice(0, 5).map((x) => `#${x.id} ${x.kind}/${x.state}${x.step ? `:${x.step}` : ''} since ${String(x.updated_at).slice(11, 16)}Z`).join(' · ') : `ok · ${open} open`);
    add('Dewey jobs paused', !j.paused && j.valve_env !== 'off', 'warn', j.paused ? `paused: ${String(j.paused).slice(0, 100)}` : j.valve_env === 'off' ? 'DEWEY_V2=0' : 'running');
    add('Dewey spend today', j.spend_today_usd < j.ceiling_usd * 0.8, 'warn', `$${Number(j.spend_today_usd).toFixed(2)} of $${j.ceiling_usd}`);
  }
} catch (e) { add('Dewey jobs', true, 'info', `unavailable (${e.message})`); }

// ── 3. Grounding pipeline ────────────────────────────────────────────────────
let mode = '?', queueDepth = 0, liveRuns = 0, failed24 = 0, done24 = 0;
const modeRes = await http('http://127.0.0.1:7839/api/admin/grounding/mode', { headers: H });
try { mode = JSON.parse(modeRes.body).mode; } catch { /* api down already flagged */ }

let db = null;
try {
  const Database = (await import('better-sqlite3')).default;
  db = new Database('data/sifter.db', { readonly: true });
} catch (e) { add('sqlite read', false, 'warn', e.message); }
// query_stats + slow_query_log live in the telemetry store next to sifter.db since db-write-path-20261023
let tdb = db;
try {
  const { realpathSync, existsSync } = await import('node:fs');
  const tp = (await import('node:path')).join((await import('node:path')).dirname(realpathSync('data/sifter.db')), 'telemetry.db');
  if (existsSync(tp)) tdb = new (await import('better-sqlite3')).default(tp, { readonly: true });
} catch { /* fall back to the content DB's (frozen) copies */ }

if (db) {
  const day = Math.floor(Date.now() / 1000) - 86400;
  const q = db.prepare(`SELECT status, COUNT(*) n FROM grounding_queue WHERE COALESCE(finished_at, enqueued_at) > ? GROUP BY status`).all(day);
  failed24 = q.find((r) => r.status === 'failed')?.n || 0;
  done24 = q.find((r) => r.status === 'done')?.n || 0;
  const now2 = db.prepare(`SELECT SUM(status='queued') queued, SUM(status='running') running FROM grounding_queue WHERE status IN ('queued','running')`).get();
  queueDepth = now2?.queued || 0; liveRuns = now2?.running || 0;
  // Storm = CURRENT state (last 3h), not history: a fixed storm earlier today must stop alerting
  // once failures stop — the 24h figure stays as context in the progress line below.
  const failed3h = db.prepare(`SELECT COUNT(*) n FROM grounding_queue WHERE status='failed' AND finished_at > ?`).get(Math.floor(Date.now() / 1000) - 3 * 3600)?.n || 0;
  add('Grounding failure storm', failed3h <= 10, 'critical', `${failed3h} failed runs in last 3h (${failed24} in 24h)`);
  // Stalled: plan mode should ALWAYS keep work flowing until the plan is done. If the plan ever
  // completes for real, switch mode to 'general' — this alert says progress stopped, look why.
  // An idle queue is only a FAULT if there is work the follower could have started. Ask the follower itself
  // (same predicates it enqueues by) rather than inferring from queue depth — on 2026-08-23 all 11 remaining
  // plan books were unenqueueable (9 husks with zero prose, 2 non-English parked), so the queue was correctly
  // empty and this alarm fired CRITICAL on every status update with nothing wrong and nothing to do.
  let exh = null;
  // 30 s: the endpoint checks every plan book (5–6 s, more under load) — the default 8 s turned an exhausted plan into a
  // CRITICAL 'nothing queued' alarm (10-20)
  try { exh = JSON.parse((await http('http://127.0.0.1:7839/api/admin/grounding/exhaustion', { headers: H, timeout: 30000 })).body); }
  catch { /* endpoint unreachable → fall back to the old queue-depth-only reading (fail loud, not silent) */ }
  const idle = mode === 'plan' && liveRuns === 0 && queueDepth === 0 && done24 === 0;
  // a PENDING snapshot (first probe after a deploy — the walk is computing) is unknown, never a stall alarm
  const stalled = idle && !exh?.exhausted && !exh?.pending;
  // Exhausted is a PASS carrying the reason, not an alarm: nothing is broken and there is nothing to fix, but
  // grounding will do nothing until an operator switches to 'general' — a spend decision. Reporting it in the
  // detail line keeps that fact in front of the operator every run without crying wolf on every run.
  const detail = stalled
    ? `${mode} mode but nothing queued/running/completed in 24h${exh ? '' : ' (exhaustion endpoint unreachable — cause unverified)'}`
    : idle && exh?.exhausted
      ? `plan exhausted — no enqueueable work left (${exh.husks} husks, ${exh.parked} language-parked, ${exh.quarantined} quarantined); switch mode to 'general' when ready to spend`
      : idle && exh?.pending ? 'plan exhaustion is being computed (first check after a restart) — next run will know'
      : `${done24} done / ${failed24} failed / ${liveRuns} running / ${queueDepth} queued (24h, mode=${mode})`;
  add('Grounding progress', !stalled, 'critical', detail);
  // Queue-not-draining (the 2026-08-12 gap): a NON-empty queue with nothing running and nothing
  // completed in 24h means work is stuck — even if failures aren't logged (the off-peak-gate hold,
  // or a wedged supervisor). WARN not critical (an off-peak hold during peak hours is legitimate),
  // but it surfaces the state the empty-queue stall check misses.
  const notDraining = mode === 'plan' && queueDepth > 0 && liveRuns === 0 && done24 === 0;
  add('Grounding queue draining', !notDraining, 'warn', notDraining ? `${queueDepth} queued but 0 running + 0 done in 24h (off-peak gate? wedged supervisor?)` : 'ok');
}

// ── 4. AI spend ──────────────────────────────────────────────────────────────
let spendRows = [];
if (db) {
  try {
    spendRows = db.prepare(`SELECT provider, ROUND(SUM(estimated_cost_usd),2) usd, COUNT(*) calls FROM ai_usage WHERE timestamp > datetime('now','-24 hours') GROUP BY provider ORDER BY usd DESC`).all();
    const total = spendRows.reduce((s, r) => s + r.usd, 0);
    // spending Chad APPROVED is not an alarm (10-20) — the threshold rises by the active approved allowances
    const { loadApproved, activeAllowance, spendAlarming } = await import('./lib/approved-spend.mjs');
    const allowance = activeAllowance(loadApproved('data/approved-spend.json'));
    const alarming = spendAlarming(total, SPEND_ALERT_USD, allowance);
    add('AI spend 24h', !alarming, alarming ? 'critical' : 'info', `$${total.toFixed(2)}${allowance ? ` (approved allowance $${allowance}/day)` : ''} (${spendRows.map((r) => `${r.provider} $${r.usd}`).join(' · ')})`);
  } catch (e) { add('AI spend 24h', true, 'warn', `query failed: ${e.message}`); }
}

// ── 4-watch. Paid work burning money without working (Chad 11-14) — the `spend-watch` ops REPORT (never a direct query).
// failing/loop/spike → CRITICAL (the critical path mails [ACTION] once, with the stop lever); cap-pace → warn (weekly). A missing or >90 min old
// report is "unknown since <as_of>", never re-quoted numbers.
try {
  const url = 'http://127.0.0.1:7839/api/admin/ops/reports/spend-watch';
  const r = await http(`${url}/latest`, { headers: H, timeout: 15000 });
  const rep = r.status === 200 ? JSON.parse(r.body) : null;
  fetch(url, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) }).catch(() => {});   // refresh for next time (the queue dedupes)
  const sw = rep?.result, asOf = sw?.as_of, ageMin = asOf ? (Date.now() - Date.parse(asOf)) / 60000 : Infinity;
  if (!sw || !(ageMin <= 90)) add('Spend watch', false, 'warn', `spend-watch unknown since ${asOf || 'never'}`);
  else {
    const bad = (sw.findings || []).filter((f) => f.kind !== 'cap-pace'), pace = (sw.findings || []).filter((f) => f.kind === 'cap-pace');
    add('Spend watch', !bad.length, 'critical', bad.length ? bad.map((f) => `${f.caller || '(no caller)'} ${f.kind} $${f.rate_usd_h}/h: ${f.evidence} — do: ${f.action}`).join(' · ') + ` (as of ${asOf})` : `ok · $${sw.totals?.usd_1h}/1h $${sw.totals?.usd_today} today (as of ${asOf})`);
    if (pace.length) add('Spend pace vs cap', false, 'warn', pace.map((f) => `${f.caller || '(no caller)'}: ${f.evidence}`).join(' · ') + ` (as of ${asOf})`);
  }
} catch (e) { add('Spend watch', false, 'warn', `spend-watch unknown (${e.message})`); }

// ── 4a. Media lane liveness + progress (Chad 10-31: the queue pass stopped ~50 min, nothing noticed) — api/lib/media/loop-health.js:
// each loop section judged by its own measured cadence, plus work-progress checks; CRITICAL only when talks stop being completed
{
  const r = await http('http://127.0.0.1:7839/api/admin/ops/media/health', { headers: H, timeout: 15000 });
  let h = null; try { h = r.status === 200 ? JSON.parse(r.body) : null; } catch { /* not JSON */ }
  if (!h?.checks) add('Media loop health', true, 'info', `unavailable (${why(r)})`);
  else {
    const mediaPaused = STOPPED_ON_PURPOSE.has('siftersearch-media');
    for (const c of h.checks) {
      if (mediaPaused && !c.ok && /^Media (loop|pipeline)/.test(c.name)) add(c.name, true, 'info', `paused (siftersearch-media pm2-stopped) · ${c.detail}`);
      else add(c.name, c.ok, c.level, c.detail);
    }
    const okSections = Object.entries(h.sections || {}).filter(([, s]) => s.state === 'ok').length;
    if (!h.checks.some((c) => c.name.startsWith('Media loop:'))) add('Media loop sections', true, 'info', `${okSections} beating on cadence · ${Object.entries(h.sections || {}).filter(([, s]) => s.state !== 'ok').map(([n, s]) => `${n} ${s.state}`).join(', ') || 'all ok'}`);
    if (h.heals?.length) add('Media loop self-heals', true, 'info', h.heals.map((x) => `${new Date(x.at).toISOString().slice(11, 16)}Z ${x.section}: ${x.why}`).join(' · '));
  }
}

// ── 4b. Search latency vs its contract (api/lib/search/latency-budget.js; Chad 11-03 "it keeps being slow again"): the last
// hour of search traces, p95 per stage. CRITICAL only for a total breach on two checks running; stage overruns → weekly.
let searchSlow = state.searchSlow || [];
{
  const r = await http('http://127.0.0.1:7839/api/admin/ops/search-latency?minutes=60', { headers: H, timeout: 15000 });
  let s = null; try { s = r.status === 200 ? JSON.parse(r.body) : null; } catch { /* not JSON */ }
  if (!s?.engine) add('Search latency', true, 'info', `unavailable (${why(r)})`);
  else {
    const { latencyChecks } = await import('../api/lib/search/latency-budget.js');
    const v = latencyChecks(s, state.searchSlow || []);
    for (const c of v.checks) add(c.name, c.ok, c.level, c.detail);
    searchSlow = v.slow;
  }
}

let newGpuIdleAt = state.gpuIdleAt || 0;
// ── 4b. Media pipeline (10-22: every compute run failed for hours and nothing said so) ──────────────────────
// through the API (/api/media/progress/live → health), never the DB. WARN: failures in the last hour above the limit, or a lane
// with a backlog and nothing running (idle compute while work waits).
{
  const MEDIA_FAIL_WARN = Number(process.env.MEDIA_FAIL_WARN || 3);
  const r = await http('http://127.0.0.1:7839/api/media/progress/live', { timeout: 15000 });
  let h = null; try { h = r.status === 200 ? JSON.parse(r.body).health : null; } catch { /* not JSON */ }
  if (!h) add('Media pipeline', true, 'info', `health unavailable (${why(r)})`);
  else {
    const stages = Object.entries(h.failed_by_stage || {}).map(([k, v]) => `${k} ${v}`).join(', ');
    add('Media failures 1h', h.failed <= MEDIA_FAIL_WARN, 'warn', `${h.failed} failed in the last hour${stages ? ` (${stages})` : ''} · ${h.failed_total} failed in all · ${h.published} published`);
    // backpressure is not idleness: prep pauses once enough talks wait for ASR (scripts/lib/lane-idle.mjs)
    const { idleLanes } = await import('./lib/lane-idle.mjs');
    const { compute: idleCompute, llm: idleLlm } = idleLanes(h);
    // the GPU host (aorus): no media_tool running and no job started in 10 min while compute work waits = IDLE (10-22)
    const gpu = (await import('./lib/media-hosts.mjs')).shellGpuHost();
    if (gpu && h.compute_backlog > 0) {
      let g = null;
      // TRANSCRIPTIONS running on the GPU host (grades/probes/dfn are not GPU transcription work) and the newest one's age
      // the GPU itself: utilisation % and memory in use (a transcription holds ~2 GB of model; 10-23: aorus sat at 0 % with one
      // 'transcribe' process on its CPU and the old process-count check never fired) — two samples 5 s apart
      try { g = execSync(`ssh -o BatchMode=yes -o ConnectTimeout=8 ${gpu} 'nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits; sleep 5; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits'`, { encoding: 'utf8', timeout: 30000 }).trim().split('\n').map((l) => l.split(',').map(Number)); } catch { /* unreachable */ }
      const waiting = (h.asr_backlog || 0) + (h.compute_backlog || 0);
      if (!g) add(`Media GPU ${gpu}`, true, 'info', 'unreachable from here');
      else {
        const util = Math.max(...g.map((x) => x[0])), mem = Math.max(...g.map((x) => x[1]));
        const idle = util < 5 && mem < 1500 && (h.asr_backlog || 0) > 0;
        // idle twice in a row (the check runs every 30 min) is CRITICAL; once is a WARN
        const was = state.gpuIdleAt || 0;
        newGpuIdleAt = idle ? (was || Date.now()) : 0;
        const long = idle && was && Date.now() - was >= 10 * 60_000;
        add(`Media GPU ${gpu}`, !idle, long ? 'critical' : 'warn', `GPU ${util}% · ${mem} MiB in use · ${h.asr_backlog || 0} prepped talks waiting for ASR${idle ? ` — GPU IDLE${long ? ` for ${Math.round((Date.now() - was) / 60000)} min` : ''} while prepped talks wait` : ''}`);
        void waiting;
      }
    }
    add('Media lanes busy', !(idleCompute || idleLlm), 'warn', `compute ${h.compute_running} running / ${h.compute_backlog} waiting · llm ${h.llm_running} running / ${h.llm_backlog} waiting${idleCompute ? ' — COMPUTE IDLE with a backlog' : ''}${idleLlm ? ' — LLM IDLE with a backlog' : ''}`);
  }
}

// ── HOSTS: disk, memory/swap, OOM, load, GPU on EVERY machine we use — tower, aorus, boss (10-23 16:09: aorus's disk filled
// with media job folders and nothing alerted until jobs failed; Chad: "I have to trust you to keep an eye on the computers").
// One read-only snapshot per host (scripts/ops/host-stat.sh): tower locally, aorus over ssh (Tailscale SSH → a shell), boss
// through its gate's 'hoststat' verb (tower's key there is a forced command). Thresholds + dedupe: scripts/lib/host-resources.mjs.
const hostRes = { ...(state.hostRes || {}) };
const hostChecks = [];
{
  const { parseHostStat, evaluateHost, unreachableCheck } = await import('./lib/host-resources.mjs');
  const { mediaHosts } = await import('./lib/media-hosts.mjs');
  const since = Math.floor((hostRes.lastCheckAt || Date.now() - 30 * 60_000) / 1000);
  const script = fs.readFileSync(new URL('./ops/host-stat.sh', import.meta.url), 'utf8');
  const ssh = (host, cmd, input) => execSync(`ssh -o BatchMode=yes -o ConnectTimeout=8 ${input == null ? '-n ' : ''}${host} ${JSON.stringify(cmd)}`, { encoding: 'utf8', timeout: 60_000, input, stdio: ['pipe', 'pipe', 'pipe'] });
  const HOSTS = [
    { host: 'tower', role: 'monitor', run: () => execSync(`bash -s -- ${since}`, { encoding: 'utf8', timeout: 60_000, input: script, stdio: ['pipe', 'pipe', 'pipe'] }) },
    ...mediaHosts().map((h) => (h.transport || 'ssh-docker') === 'gate'
      ? { host: h.name, role: 'none', run: (n) => ssh(n, `hoststat ${since}`) }
      : { host: h.name, role: 'compute', run: (n) => ssh(n, `bash -s -- ${since}`, script) }),
  ];
  hostRes.hosts = { ...(hostRes.hosts || {}) };
  for (const { host, role, run } of HOSTS) {
    const prev = hostRes.hosts[host] || {};
    let out = null, err = '';
    try { out = run(host); } catch (e) { err = String(e.stderr || e.message || e).split('\n').filter(Boolean).pop()?.slice(0, 120) || ''; }
    if (!out || !out.includes('@@end')) {
      const u = unreachableCheck(host, prev.misses || 0, out && /verb not allowed|no host-stat/.test(out) ? `its gate has no 'hoststat' yet: ${out.trim().slice(0, 80)}` : err);
      hostRes.hosts[host] = { ...prev, misses: u.misses };
      hostChecks.push(u.check);
      continue;
    }
    const { checks: hc, state: st } = evaluateHost(host, parseHostStat(out), { role, prev });
    hostRes.hosts[host] = { ...st, misses: 0 };
    hostChecks.push(...hc);
  }
  for (const c of hostChecks) checks.push(c);
}

// ── 5. Corpus + cache + widget metrics (report-only) ─────────────────────────
// Drive wear (Chad 10-28): per-device TB/day from /proc/diskstats deltas between DAILY runs, projected life, top writer
let wearNow = null;
if (HEAVY) {
  try {
    const { parseDiskBytes, wearRates, dominantWriter, wearVerdict } = await import('./lib/storage-wear.mjs');
    const procs = {};
    for (const pid of execSync('pgrep -u $(id -u) -f "node|qdrant"', { encoding: 'utf8', shell: '/bin/bash' }).split('\n').filter(Boolean)) {
      try {
        const w = /write_bytes: (\d+)/.exec(fs.readFileSync(`/proc/${pid}/io`, 'utf8'))?.[1];
        const c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim().split(' ').slice(0, 3).join(' ').slice(0, 60);
        if (w) procs[`${pid} ${c}`] = Number(w);
      } catch { /* process ended */ }
    }
    wearNow = { t: Date.now(), bytes: parseDiskBytes(fs.readFileSync('/proc/diskstats', 'utf8')), procs };
    const smart = {};
    try { for (const d of JSON.parse((await http('https://api.siftersearch.com/api/observatory/telemetry')).body).snapshot?.health || []) smart[d.dev] = d; } catch { /* SMART panel unavailable: rated TBW is used */ }
    const v = wearVerdict(wearRates(state.wear, wearNow), { writer: dominantWriter(state.wear?.procs, procs), smart });
    add('Drive wear', v.ok, v.level, v.detail);
  } catch { /* not Linux */ }
}
const metrics = {};
if (db) {
  const g = (sql, label) => { try { return (/\bslow_query_log\b/.test(sql) ? tdb : db).prepare(sql).get(); } catch { return null; } };
  const a = (sql) => { try { return db.prepare(sql).all(); } catch { return null; } };
  // WHOLE-TABLE scans of content (9M rows) only in the DAILY run: every 30 min they evicted the cache search hydrates from
  // (10-19: primary-key lookups at 200–1000 ms, searches at 5–15 s). The half-hourly check stays on small tables.
  const heavy = HEAVY;
  metrics.embedBacklog = heavy ? g(`SELECT COUNT(*) n FROM content WHERE embedding IS NULL AND deleted_at IS NULL AND length(trim(text)) > 20`)?.n : undefined;
  if (metrics.embedBacklog != null) {
    const prev = state.embedBacklog;
    const growing = prev != null && metrics.embedBacklog > prev + 5000;
    add('Embedding backlog', !growing, 'warn', `${metrics.embedBacklog.toLocaleString()} pending${prev != null ? ` (was ${prev.toLocaleString()})` : ''}`);
  }
  metrics.cache = g(`SELECT COUNT(*) n, SUM(hit_count) hits FROM answer_cache`);
  metrics.cache24 = g(`SELECT COUNT(*) n FROM answer_cache WHERE created_at > unixepoch() - 86400`)?.n
    ?? g(`SELECT COUNT(*) n FROM answer_cache WHERE created_at > datetime('now','-24 hours')`)?.n;
  metrics.widget24 = g(`SELECT COUNT(*) n, COUNT(DISTINCT session_id) sessions FROM widget_events WHERE created_at > datetime('now','-24 hours')`);
  if (heavy) {
    metrics.paras = g(`SELECT COUNT(*) n FROM content WHERE deleted_at IS NULL`)?.n;
    metrics.hypedDocs = g(`SELECT COUNT(DISTINCT doc_id) n FROM content WHERE hyp_questions IS NOT NULL`)?.n;
  }
  // Hollow-done guard (daily only — heavier query): a substantial book whose disambiguation is complete
  // but with ZERO extracted people or claims is a silent extraction failure being grandfathered as done,
  // never a "sparse book". These docs are full of historical gems; surface them instead of hiding them.
  if (HEAVY) {
    // The disambiguation predicate MUST be the one in api/lib/pipeline/processed.js: `context IS NOT NULL`.
    // This used to add `AND context != ''`, making it a FOURTH definition of "disambiguated" — and the wrong
    // one, because an empty note means "examined, nothing to resolve", a complete result. Five separate
    // definitions of that word are what stalled books for a night in August; the file exists so there is
    // exactly one. Counting empty notes as un-disambiguated made this detector under-report (2026-08-15).
    const hollowRows = a(`SELECT p.d AS doc_id,
        (SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL) AS prose,
        (SELECT COUNT(*) FROM entity_mentions_v2 WHERE doc_id=p.d) AS mentions,
        (SELECT COUNT(*) FROM entity_claims WHERE doc_id=p.d) AS claims
      FROM (SELECT DISTINCT doc_id d FROM grounding_queue) p
      WHERE (SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL) >= 40
        AND (SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND context IS NOT NULL) >=
            0.98*(SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL)
        AND ((SELECT COUNT(*) FROM entity_mentions_v2 WHERE doc_id=p.d)=0 OR (SELECT COUNT(*) FROM entity_claims WHERE doc_id=p.d)=0)
      ORDER BY prose DESC LIMIT 25`);
    metrics.hollow = hollowRows ? hollowRows.length : null;
    if (metrics.hollow != null) {
      // NAME them. "5 books somewhere" is a number to feel bad about; doc ids with their shape are a work
      // list — and the mentions/claims split says WHICH stage came up empty, which is the actual question.
      const detail = (hollowRows || []).slice(0, 6)
        .map((r) => `${r.doc_id}(${r.prose}¶ m=${r.mentions} c=${r.claims})`).join(' ');
      add('Hollow-done books', metrics.hollow === 0, 'warn',
        `${metrics.hollow} disambiguated books with zero extraction yield${detail ? ` — ${detail}` : ''}`);
    }
  }
  // ── 5c. Where query time goes (DAILY) ────────────────────────────────────────
  // Chad, 2026-08-13: "I want to spend some of our resources monitoring and improving our pipeline every
  // day." This is that budget line. It reports the TOP TIME SINKS by total synchronous cost, so each day
  // starts with a ranked, actionable list instead of a vague sense that things are slow. Two shapes are
  // named explicitly because the pipeline has been hurt by BOTH: one enormous scan, and a small query on a
  // hot loop. Daily-only — it is a report, not an alarm.
  if (HEAVY) {
    try {
      const since = Math.floor(Date.now() / 1000) - 86400;
      const sinks = tdb.prepare(
        `SELECT proc, label, MAX(name) name, SUM(n) n, SUM(total_ms) total_ms,
                MAX(max_ms) max_ms, MAX(sql_sample) sql_sample
           FROM query_stats WHERE hour >= ? GROUP BY proc, label ORDER BY total_ms DESC LIMIT 5`).all(since);
      const procs = tdb.prepare(
        `SELECT proc, SUM(total_ms) total_ms FROM query_stats WHERE hour >= ? GROUP BY proc ORDER BY total_ms DESC LIMIT 3`).all(since);
      if (procs.length) {
        metrics.queryTime = procs.map((p) => `${p.proc} ${(p.total_ms / 60000).toFixed(0)}min`).join(' · ');
        add('Query time by process (24h)', true, 'info', metrics.queryTime);
      }
      for (const q of sinks) {
        const min = q.total_ms / 60000;
        const shape = q.max_ms >= 5000 ? 'BLOCKING scan' : (q.n >= 200 ? 'hot-loop' : '');
        // >30 min/day inside SQLite for a single statement is a design problem, not a slow disk.
        // Lead with the NAME: "budget-check 15 min/day" is a decision; a SELECT blob is homework.
        add(`Time sink: ${q.name || '(unnamed)'} [${q.proc}]`, min < 30, min >= 30 ? 'warn' : 'info',
          `${min.toFixed(0)} min/day · ${q.n} calls · worst ${(q.max_ms / 1000).toFixed(0)}s ${shape}` +
          (q.name ? '' : ` — UNNAMED: ${String(q.sql_sample || '').slice(0, 60)}`));
      }
    } catch { /* query_stats predates migration 111 on an un-upgraded DB */ }
  }

  // "3h ago" beats a bare count: the 24h window keeps reporting a statement long after its cause is fixed,
// and without an age there is no way to tell a live problem from history.
const agoOf = (at) => {
  if (!at) return '';
  const mins = Math.max(0, Math.round((Date.now() / 1000 - at) / 60));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs >= 20 ? `${hrs}h ago (ageing out of the 24h window)` : `${hrs}h ago`;
};

// ── 5b. Blocking queries ─────────────────────────────────────────────────────
  // better-sqlite3 is SYNCHRONOUS: a multi-second statement freezes its whole process. On the worker —
  // the single writer — that means /write and /health stop answering mid-request, callers' sockets close
  // ("other side closed"), every writing pipeline stage dies, and the watchdog restarts the worker into
  // the same statement. That is exactly what a 61s boot-time scan did on 2026-08-13, undetected for
  // hours: db.js had timed and logged it all along, but nothing ever READ the signal. This is the read.
  try {
    const blockMs = Number(process.env.BLOCKING_QUERY_MS || 5000);
    // Take the whole ROW of the worst statement, not independent aggregates. The previous form paired
    // MAX(duration_ms) with MAX(sql_sample) — two unrelated aggregates, so the reported SQL was whichever
    // sample sorted highest ALPHABETICALLY, not the statement that actually took that long. It sent the
    // wrong query to be investigated twice on 2026-08-20/21: a 48.6s language-rollup join was reported
    // under the text of an unrelated 8.5s docs query. Also report WHEN, so a fix can be told from a stale
    // entry still inside the rolling 24h window — that alarm fired for 14h after the cause was gone.
    // Long READS in the ops worker (siftersearch-reports: night-window health scans) freeze only that process — batch work by
    // design, reported as info. Writes anywhere, and reads in the API/worker/ingest, still count as blocking.
    // Also not freezes: reads on a WORKER THREAD ('<proc>/thread', db.js) and in the pipeline-snapshot cron (its own process,
    // serves nobody) — slow, but no request waits on them (10-17: the roadmap's off-thread reads headlined "blocking in api").
    // 10-19: the indexer, reports-carry, embedding and audit loops are batch too (own processes, no request waits on them) —
    // their reads were headlined as "blocking" next to the real freezes in api/anis.
    const BATCH = `NOT (kind = 'read' AND (proc IN ('reports', 'reports-worker.js', 'reports-carry', 'indexer', 'embedding', 'audit', 'pipeline-snapshot', 'dewey-holdings', 'hype-many', 'complete-concepts.mjs', 'complete-book.mjs') OR proc LIKE '%/thread'))`;   // + detached batch runs (10-20)
    const worst = g(`SELECT proc, kind, duration_ms worst, sql_sample sql, at
                       FROM slow_query_log WHERE at > unixepoch() - 86400 AND duration_ms >= ${blockMs} AND ${BATCH}
                      ORDER BY duration_ms DESC LIMIT 1`);
    const total = g(`SELECT COUNT(*) n FROM slow_query_log WHERE at > unixepoch() - 86400 AND duration_ms >= ${blockMs} AND ${BATCH}`)?.n ?? 0;
    const batch = g(`SELECT COUNT(*) n FROM slow_query_log WHERE at > unixepoch() - 86400 AND duration_ms >= ${blockMs} AND NOT (${BATCH})`)?.n ?? 0;
    if (batch) add('Batch scans (24h, off the serving path)', true, 'info', `${batch} long reads in the ops worker, the snapshot cron or worker threads — slow, but nothing waits on them`);
    // A blocking WRITE on the writer is critical (it breaks other processes, not just itself); a blocking
    // read is a warning (slow, but it does not close anyone's socket).
    // what is slow NOW: the 24h worst can be one stale outlier (10-12: a 292 s scan from the day before headlined the
    // alert while 80–130 slow reads/hour came from elsewhere)
    const recent = g(`SELECT COUNT(*) n FROM slow_query_log WHERE at > unixepoch() - 10800 AND duration_ms >= ${blockMs} AND ${BATCH}`) ?? { n: 0 };
    const top = g(`SELECT proc, kind, name, COUNT(*) n FROM slow_query_log WHERE at > unixepoch() - 10800 AND duration_ms >= ${blockMs} AND ${BATCH}
                    GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 1`);
    const isWriter = worst && /worker|write/i.test(String(worst.proc || ''));
    // a frozen WRITER is critical while it is CURRENT (last 3 h); a resolved one stays a warning while it ages out of the 24 h
    // window (10-20 21:30: a 6-hour-old 46.7 s write from the Meili I/O storm — fixed — re-paged as CRITICAL)
    const writerFrozeRecently = worst && worst.kind === 'write' && isWriter && worst.at > Date.now() / 1000 - 10800;
    add('Blocking queries (24h)', total === 0, writerFrozeRecently ? 'critical' : 'warn',
      total === 0 ? 'none over ' + blockMs + 'ms'
        : `${total} over ${blockMs}ms — last 3h: ${recent.n}${top ? ` (most: ${top.n}× ${top.kind} in '${top.proc}'${top.name ? ' ' + top.name : ''})` : ''}`
          + ` · worst ${(worst.worst / 1000).toFixed(1)}s ${worst.kind} in '${worst.proc}' ${agoOf(worst.at)}: ${String(worst.sql || '').slice(0, 90)}`);
  } catch { /* table predates migration 109 on an un-upgraded DB */ }
}

// ── 7. DB ship (scripts/ops/db-ship.sh): the newest /tank copy of the live DB is under 2 h old ─
try {
  const last = execSync('sudo -n zfs list -t snapshot -H -o name -s creation tank/backups/siftersearch-db 2>/dev/null | grep @ship- | tail -1', { encoding: 'utf8', timeout: 10000 }).trim();
  const m = last.match(/@ship-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  const ageH = m ? (Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) / 3600000 : Infinity;
  add('DB ship to /tank', ageH < 2, ageH < 6 ? 'warn' : 'critical', m ? `newest ${last.split('@')[1]} (${ageH.toFixed(1)} h ago)` : 'no ship snapshot on tank/backups/siftersearch-db — see logs/db-ship.log');
} catch { add('DB ship to /tank', true, 'warn', 'zfs list failed'); }

db?.close();

// ── Report ───────────────────────────────────────────────────────────────────
const criticals = checks.filter((c) => !c.ok && c.level === 'critical');
const warns = checks.filter((c) => !c.ok && c.level === 'warn');
const mark = (c) => (c.ok ? '✓' : c.level === 'critical' ? '✗' : '⚠');
const lines = [
  `SifterSearch system checks — ${new Date().toISOString()}`,
  criticals.length ? `\n${criticals.length} CRITICAL:` : '\nAll critical checks passing.',
  ...criticals.map((c) => `  ✗ ${c.name}: ${c.detail}`),
  warns.length ? `\nWarnings:` : '',
  ...warns.map((c) => `  ⚠ ${c.name}: ${c.detail}`),
  '\nAll checks:',
  ...checks.map((c) => `  ${mark(c)} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`),
  '\nMetrics:',
  `  paragraphs: ${metrics.paras?.toLocaleString() ?? '?'} · docs with HyPE: ${metrics.hypedDocs ?? '?'}`,
  `  answer cache: ${metrics.cache?.n ?? '?'} entries (${metrics.cache24 ?? '?'} new 24h, ${metrics.cache?.hits ?? '?'} lifetime hits)`,
  `  widget 24h: ${metrics.widget24?.n ?? 0} events / ${metrics.widget24?.sessions ?? 0} sessions`,
  `  spend 24h: ${spendRows.map((r) => `${r.provider} $${r.usd} (${r.calls} calls)`).join(' · ') || 'none'}`,
].filter(Boolean);
const text = lines.join('\n');
if (MODE === 'report') {
  console.log(JSON.stringify({ at: new Date().toISOString(), criticals, warns, checks }));
  process.exit(0);
}
console.log(text);

// Persist state for delta checks.
fs.mkdirSync('logs', { recursive: true });
const newState = { ...state, gpuIdleAt: newGpuIdleAt, searchSlow, restarts, drainSeen, embedBacklog: metrics.embedBacklog ?? state.embedBacklog, wear: wearNow ?? state.wear, lastRun: Date.now() };

// HOST alerts (disk / memory / OOM / load / GPU / unreachable): their own deduped path — a condition is reported ONCE, again
// only when it escalates (warn → critical), re-arms when it clears. CRITICAL alarms at once (a CRITICAL disk is a [PAGE]);
// a WARN goes to the weekly maintenance queue (Chad 11-03), keyed per condition so it is listed once with its count.
{
  const { alertPlan } = await import('./lib/host-resources.mjs');
  const plan = alertPlan(hostChecks, hostRes.seen || {});
  // a host tower could not read keeps its known conditions (no re-mail of the same full disk when it answers again)
  const dark = Object.entries(hostRes.hosts || {}).filter(([, v]) => v.misses > 0).map(([h]) => `${h}:`);
  for (const [k, v] of Object.entries(hostRes.seen || {})) if (dark.some((h) => k.startsWith(h)) && !(k in plan.seen)) plan.seen[k] = v;
  let delivered = true;
  const crit = plan.send.filter((c) => c.level === 'critical');
  const warnOnly = plan.send.filter((c) => c.level !== 'critical');
  if (warnOnly.length) {
    const { queueMaintenance } = await import('../api/lib/ops/maintenance.js');
    for (const c of warnOnly) queueMaintenance({ source: 'host', key: `host:${c.key || c.name}`, severity: 'warn', title: c.name, text: c.detail || '' });
    console.log(`[system-checks] host warnings queued for the weekly email: ${warnOnly.map((c) => c.name).join(' · ')}`);
  }
  if (crit.length) {
    const { actionRequired } = await import('../api/lib/ops/alert.js');
    const page = crit.some((c) => /:disk /.test(c.key));
    delivered = await actionRequired({
      key: 'host-resources', quietMs: 0, severity: page ? 'page' : 'action',
      subject: `CRITICAL ${crit[0].name}${crit.length > 1 ? ` (+${crit.length - 1} more)` : ''}`,
      text: [`New or escalated host conditions (${new Date().toISOString()}):`, '',
        ...plan.send.map((c) => `- **${c.level.toUpperCase()}** ${c.name}: ${c.detail}`), '', 'All host checks:', '',
        ...hostChecks.map((c) => `- ${mark(c)} ${c.name}: ${c.detail}`)].join('\n'),
    });
    console.log(`[system-checks] host alert ${delivered ? 'sent' : 'NOT sent'}: ${crit.map((c) => `${c.level} ${c.name}`).join(' · ')}`);
  }
  newState.hostRes = { ...hostRes, seen: delivered ? plan.seen : (hostRes.seen || {}), lastCheckAt: Date.now() };
}

// Non-host warnings and criticals → the weekly queue (one item per check name; `seen` counts the runs it failed).
{
  const { queueMaintenance } = await import('../api/lib/ops/maintenance.js');
  for (const c of [...criticals, ...warns].filter((x) => !x.host)) {
    queueMaintenance({ source: 'system-checks', key: `health:${c.name}`, severity: 'warn', title: `${c.level === 'critical' ? 'CRITICAL' : 'Warning'}: ${c.name}`, text: c.detail || '' });
  }
}

// Alarm on criticals: ONE path (api/lib/ops/alert.js). Site, API or tunnel down = [PAGE]; any other critical = [ACTION].
// Not the same alert-set more than once per 6 h (a down service at 2am = one email, not twelve). Host criticals went out above.
const PAGE_CHECKS = new Set(['API :7839', 'Public API (tunnel)', 'Site siftersearch.com']);
const hard = criticals.filter((c) => !c.host);
const alertKey = hard.map((c) => c.name).sort().join('|');
const recentlyAlerted = state.alertKey === alertKey && Date.now() - (state.alertAt || 0) < 6 * 3600 * 1000;
if (hard.length && !recentlyAlerted) {
  const { actionRequired } = await import('../api/lib/ops/alert.js');
  const sent = await actionRequired({
    // the alarm carries ONLY what to act on (Chad 11-08: an [ACTION] mail that goes on to list passing checks, warnings and
    // metrics is wrong). Warnings go to the weekly email; the full report stays in the log.
    key: 'system-checks-alert', quietMs: 0, pre: true,
    text: [`${hard.length} to act on (${new Date().toISOString()}):`, ...hard.map((c) => `  ✗ ${c.name}: ${c.detail}`)].join('\n'),
    severity: hard.some((c) => PAGE_CHECKS.has(c.name)) ? 'page' : 'action',
    subject: `SifterSearch ALERT: ${hard[0].name}${hard.length > 1 ? ` (+${hard.length - 1} more)` : ''}`,
  });
  console.log(`\n[system-checks] alarm ${sent ? 'sent' : 'NOT sent'} (${alertKey})`);
  if (sent) { newState.alertKey = alertKey; newState.alertAt = Date.now(); }
  else process.exitCode = 1;
}

// A UPS power event that has finished (mains back, or booted after a UPS shutdown) → its one confirmation report.
if (MODE === 'check') {
  try {
    const { spawnSync } = await import('child_process');
    const r = spawnSync(process.execPath, ['scripts/ops/ups-ledger.mjs', 'confirm'], { encoding: 'utf8', timeout: 120000 });
    if ((r.stdout || '').trim()) console.log(`[system-checks] ups: ${r.stdout.trim()}`);
  } catch (e) { console.error(`[system-checks] ups confirm failed: ${e.message}`); }
}

// The WEEKLY maintenance email: health now + the audit digest + every queued item and section, then drained. An empty
// week still sends one short "all nominal" mail — the only all-green mail there is.
if (SEND_WEEKLY) {
  if (!TO) console.error('[system-checks] no recipient (set DIGEST_EMAIL or SITE_ADMIN_EMAIL)');
  else {
    const { spawnSync } = await import('child_process');
    spawnSync(process.execPath, ['scripts/audit/audit-digest.mjs', '--hours=168'], { stdio: 'inherit', timeout: 300000 });   // refresh its section
    const { pendingMaintenance, drainMaintenance, buildWeekly } = await import('../api/lib/ops/maintenance.js');
    const { queued, sections } = pendingMaintenance();
    const metricLines = [
      `${done24} books grounded in the last 24 h · spend 24 h $${spendRows.reduce((a, r) => a + r.usd, 0).toFixed(2)}`,
      `paragraphs ${metrics.paras?.toLocaleString() ?? '?'} · docs with HyPE ${metrics.hypedDocs ?? '?'}`,
      `answer cache ${metrics.cache?.n ?? '?'} entries (${metrics.cache?.hits ?? '?'} lifetime hits) · widget 24 h ${metrics.widget24?.sessions ?? 0} sessions`,
    ];
    const mail = buildWeekly({ health: { criticals, warns, metrics: metricLines }, sections, queued });
    try {
      const { sendEmail } = await import('../api/services/email.js');
      await sendEmail({ to: TO, subject: mail.subject, text: mail.text, html: mail.html });
      const d = drainMaintenance();
      console.log(`[system-checks] weekly maintenance email sent to ${TO} (${queued.length} items, ${sections.length} sections → ${d.to})`);
      newState.weeklyAt = Date.now();
    } catch (e) { console.error(`[system-checks] weekly email failed (queue kept): ${e.message}`); process.exitCode = 1; }
  }
}

fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
process.exit(process.exitCode || 0);
