// Ops sentinel + daily digest for the whole system. Runs on tower-nas via cron:
//   */30 * * * *  --check   → email ONLY when something critical breaks (rate-limited)
//   05 7 * * *    --daily   → ALWAYS email the morning ops digest (silence is never ambiguous)
// Checks: service health (api/writer/meili/tunnel/site) · pm2 anomalies · grounding progress,
// stalls + failure storms · AI spend · embedding backlog · answer cache · disk · widget traffic.
// Email via api/services/email.js (EMAIL_PROVIDER). State in logs/system-checks-state.json.
import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

const MODE = process.argv.includes('--daily') ? 'daily' : 'check';
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
const api = await http('http://127.0.0.1:7839/health');
add('API :7839', api.status === 200, 'critical', api.status === 200 ? JSON.parse(api.body).version : `status ${api.status}`);
const writer = await http('http://127.0.0.1:7849/health');
add('Writer :7849', writer.status === 200, 'critical', writer.status === 200 ? 'ok' : `status ${writer.status}`);
const meili = await http('http://127.0.0.1:7700/health');
add('Meilisearch', meili.status === 200, 'critical', meili.status === 200 ? 'ok' : `status ${meili.status}`);
const tunnel = await http('https://api.siftersearch.com/health', { timeout: 12000 });
add('Public API (tunnel)', tunnel.status === 200, 'critical', tunnel.status === 200 ? 'ok' : `status ${tunnel.status}`);
const site = await http('https://siftersearch.com/', { timeout: 12000 });
add('Site siftersearch.com', site.status === 200, 'critical', site.status === 200 ? 'ok' : `status ${site.status}`);

// ── 2. PM2 anomalies ─────────────────────────────────────────────────────────
const REQUIRED = ['siftersearch-api', 'siftersearch-worker', 'siftersearch-embedding', 'siftersearch-deep-research', 'siftersearch-updater', 'cloudflared-tunnel'];
let procs = [];
try { procs = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', timeout: 20000 })); } catch { /* pm2 down is caught below */ }
const byName = Object.fromEntries(procs.map((p) => [p.name, p]));
for (const name of REQUIRED) {
  const p = byName[name];
  add(`pm2 ${name}`, p?.pm2_env?.status === 'online', 'critical', p ? p.pm2_env.status : 'missing');
}
// Restart storms: +10 restarts since last run = something is crash-looping.
const restarts = Object.fromEntries(procs.map((p) => [p.name, p.pm2_env?.restart_time || 0]));
for (const [name, n] of Object.entries(restarts)) {
  const prev = state.restarts?.[name];
  if (prev != null && n - prev >= 10 && REQUIRED.includes(name)) add(`pm2 ${name} restart storm`, false, 'critical', `+${n - prev} restarts since last check`);
}

// ── 3. Grounding pipeline ────────────────────────────────────────────────────
const H = { 'X-Internal-Key': KEY };
let mode = '?', queueDepth = 0, liveRuns = 0, failed24 = 0, done24 = 0;
const modeRes = await http('http://127.0.0.1:7839/api/admin/grounding/mode', { headers: H });
try { mode = JSON.parse(modeRes.body).mode; } catch { /* api down already flagged */ }

let db = null;
try {
  const Database = (await import('better-sqlite3')).default;
  db = new Database('data/sifter.db', { readonly: true });
} catch (e) { add('sqlite read', false, 'warn', e.message); }

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
  const stalled = mode === 'plan' && liveRuns === 0 && queueDepth === 0 && done24 === 0;
  add('Grounding progress', !stalled, 'critical', stalled ? 'plan mode but nothing queued/running/completed in 24h' : `${done24} done / ${failed24} failed / ${liveRuns} running / ${queueDepth} queued (24h, mode=${mode})`);
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
    add('AI spend 24h', total <= SPEND_ALERT_USD, total > SPEND_ALERT_USD ? 'critical' : 'info', `$${total.toFixed(2)} (${spendRows.map((r) => `${r.provider} $${r.usd}`).join(' · ')})`);
  } catch (e) { add('AI spend 24h', true, 'warn', `query failed: ${e.message}`); }
}

// ── 5. Corpus + cache + widget metrics (report-only) ─────────────────────────
const metrics = {};
if (db) {
  const g = (sql, label) => { try { return db.prepare(sql).get(); } catch { return null; } };
  metrics.embedBacklog = g(`SELECT COUNT(*) n FROM content WHERE embedding IS NULL AND deleted_at IS NULL AND length(trim(text)) > 20`)?.n;
  if (metrics.embedBacklog != null) {
    const prev = state.embedBacklog;
    const growing = prev != null && metrics.embedBacklog > prev + 5000;
    add('Embedding backlog', !growing, 'warn', `${metrics.embedBacklog.toLocaleString()} pending${prev != null ? ` (was ${prev.toLocaleString()})` : ''}`);
  }
  metrics.cache = g(`SELECT COUNT(*) n, SUM(hit_count) hits FROM answer_cache`);
  metrics.cache24 = g(`SELECT COUNT(*) n FROM answer_cache WHERE created_at > unixepoch() - 86400`)?.n
    ?? g(`SELECT COUNT(*) n FROM answer_cache WHERE created_at > datetime('now','-24 hours')`)?.n;
  metrics.widget24 = g(`SELECT COUNT(*) n, COUNT(DISTINCT session_id) sessions FROM widget_events WHERE created_at > datetime('now','-24 hours')`);
  metrics.paras = g(`SELECT COUNT(*) n FROM content WHERE deleted_at IS NULL`)?.n;
  metrics.hypedDocs = g(`SELECT COUNT(DISTINCT doc_id) n FROM content WHERE hyp_questions IS NOT NULL`)?.n;
  // Hollow-done guard (daily only — heavier query): a substantial book whose disambiguation is complete
  // but with ZERO extracted people or claims is a silent extraction failure being grandfathered as done,
  // never a "sparse book". These docs are full of historical gems; surface them instead of hiding them.
  if (MODE === 'daily') {
    metrics.hollow = g(`SELECT COUNT(*) n FROM (SELECT DISTINCT doc_id d FROM grounding_queue) p
      WHERE (SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL) >= 40
        AND (SELECT COUNT(*) FROM content WHERE doc_id=p.d AND context IS NOT NULL AND context!='') >=
            0.98*(SELECT COUNT(*) FROM content WHERE doc_id=p.d AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL)
        AND ((SELECT COUNT(*) FROM entity_mentions_v2 WHERE doc_id=p.d)=0 OR (SELECT COUNT(*) FROM entity_claims WHERE doc_id=p.d)=0)`)?.n;
    if (metrics.hollow != null) add('Hollow-done books', metrics.hollow === 0, 'warn', `${metrics.hollow} disambiguated books with zero extraction yield`);
  }
  // ── 5c. Where query time goes (DAILY) ────────────────────────────────────────
  // Chad, 2026-08-13: "I want to spend some of our resources monitoring and improving our pipeline every
  // day." This is that budget line. It reports the TOP TIME SINKS by total synchronous cost, so each day
  // starts with a ranked, actionable list instead of a vague sense that things are slow. Two shapes are
  // named explicitly because the pipeline has been hurt by BOTH: one enormous scan, and a small query on a
  // hot loop. Daily-only — it is a report, not an alarm.
  if (MODE === 'daily') {
    try {
      const since = Math.floor(Date.now() / 1000) - 86400;
      const sinks = db.prepare(
        `SELECT proc, label, MAX(name) name, SUM(n) n, SUM(total_ms) total_ms,
                MAX(max_ms) max_ms, MAX(sql_sample) sql_sample
           FROM query_stats WHERE hour >= ? GROUP BY proc, label ORDER BY total_ms DESC LIMIT 5`).all(since);
      const procs = db.prepare(
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

  // ── 5b. Blocking queries ─────────────────────────────────────────────────────
  // better-sqlite3 is SYNCHRONOUS: a multi-second statement freezes its whole process. On the worker —
  // the single writer — that means /write and /health stop answering mid-request, callers' sockets close
  // ("other side closed"), every writing pipeline stage dies, and the watchdog restarts the worker into
  // the same statement. That is exactly what a 61s boot-time scan did on 2026-08-13, undetected for
  // hours: db.js had timed and logged it all along, but nothing ever READ the signal. This is the read.
  try {
    const blockMs = Number(process.env.BLOCKING_QUERY_MS || 5000);
    const worst = g(`SELECT proc, kind, MAX(duration_ms) worst, COUNT(*) n, MAX(sql_sample) sql
                       FROM slow_query_log WHERE at > unixepoch() - 86400 AND duration_ms >= ${blockMs}
                      GROUP BY proc, kind ORDER BY worst DESC LIMIT 1`);
    const total = g(`SELECT COUNT(*) n FROM slow_query_log WHERE at > unixepoch() - 86400 AND duration_ms >= ${blockMs}`)?.n ?? 0;
    // A blocking WRITE on the writer is critical (it breaks other processes, not just itself); a blocking
    // read is a warning (slow, but it does not close anyone's socket).
    const isWriter = worst && /worker|write/i.test(String(worst.proc || ''));
    add('Blocking queries (24h)', total === 0, worst && worst.kind === 'write' && isWriter ? 'critical' : 'warn',
      total === 0 ? 'none over ' + blockMs + 'ms'
        : `${total} over ${blockMs}ms — worst ${(worst.worst / 1000).toFixed(1)}s ${worst.kind} in '${worst.proc}': ${String(worst.sql || '').slice(0, 90)}`);
  } catch { /* table predates migration 109 on an un-upgraded DB */ }
}

// ── 6. Disk ──────────────────────────────────────────────────────────────────
try {
  const df = execSync('df -h / /fast /tank 2>/dev/null | tail -n +2', { encoding: 'utf8', timeout: 10000 });
  for (const line of df.trim().split('\n')) {
    const cols = line.split(/\s+/);
    const pct = parseInt(cols[4], 10);
    add(`Disk ${cols[5]}`, pct < 90, pct >= 90 ? 'critical' : pct >= 80 ? 'warn' : 'info', `${cols[4]} used (${cols[3]} free)`);
  }
} catch { add('Disk', true, 'warn', 'df failed'); }

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
console.log(text);

// Persist state for delta checks.
fs.mkdirSync('logs', { recursive: true });
const newState = { ...state, restarts, embedBacklog: metrics.embedBacklog, lastRun: Date.now() };

// Decide whether to email. --daily always sends; --check only on criticals, and not the same
// alert-set more than once per 6h (a down service at 2am = one email, not twelve).
const alertKey = criticals.map((c) => c.name).sort().join('|');
const recentlyAlerted = state.alertKey === alertKey && Date.now() - (state.alertAt || 0) < 6 * 3600 * 1000;
let shouldSend = MODE === 'daily' || (criticals.length > 0 && !recentlyAlerted);

if (shouldSend && TO) {
  const { sendEmail } = await import('../api/services/email.js');
  const subject = criticals.length
    ? `🔴 SifterSearch ALERT: ${criticals[0].name}${criticals.length > 1 ? ` (+${criticals.length - 1} more)` : ''}`
    : `🟢 SifterSearch daily ops — all nominal · ${done24} books done 24h · $${spendRows.reduce((s, r) => s + r.usd, 0).toFixed(2)} spend`;
  const html = `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;color:#1a2233">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
  try {
    await sendEmail({ to: TO, subject, text, html });
    console.log(`\n[system-checks] emailed ${TO} (${MODE})`);
    if (criticals.length) { newState.alertKey = alertKey; newState.alertAt = Date.now(); }
  } catch (e) { console.error(`[system-checks] email failed: ${e.message}`); process.exitCode = 1; }
} else if (!TO) {
  console.error('[system-checks] no recipient (set DIGEST_EMAIL or SITE_ADMIN_EMAIL)');
}

fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
process.exit(process.exitCode || 0);
