#!/usr/bin/env node
/**
 * Health Check Harness — single-pass probe of the SifterSearch stack.
 *
 * Designed to run periodically from a watchdog (or on demand via SSH).
 * Returns exit code 0 if all checks pass, 1 if any are degraded/down.
 * Emits JSON to stdout so a watchdog can parse + alert specifically.
 *
 * Usage:
 *   node scripts/health-check.mjs                # full probe
 *   node scripts/health-check.mjs --json         # JSON only (no commentary)
 *   node scripts/health-check.mjs --quick        # skip slow checks (chat smoke)
 *   node scripts/health-check.mjs --verbose      # full per-check timing
 *
 * Components checked:
 *   - API responsiveness (/api/v1/health)
 *   - Meilisearch paragraphs index (size + embeddings)
 *   - Meilisearch hype_questions sidecar (size + embeddings)
 *   - boss vLLM endpoint
 *   - PM2 processes (api, worker, library-watcher, enrichment, updater)
 *   - SQLite recent worker write activity (proves worker is alive)
 *   - SQLite recent enrichment write activity (proves boss is producing)
 *   - Chat endpoint smoke test (skipped with --quick)
 */

import { exec as execCb, spawnSync } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const exec = promisify(execCb);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const QUICK = args.includes('--quick');
const VERBOSE = args.includes('--verbose');

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const MEILI_URL = process.env.MEILI_HOST || process.env.MEILI_URL || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY;
const VLLM_URL = process.env.LOCAL_LLM || 'http://boss:49804/v1';
const SIFTER_API_KEY = process.env.PUBLIC_SIFTER_API_KEY;

const checks = {};
const startTime = Date.now();

// Probe if a localhost URL is actually reachable (fast, 800ms max).
// Used to distinguish "not on server" from "service down".
async function isLocalhostReachable(url) {
  // Try /health endpoint for definitive check; fall back to base URL
  const healthUrl = url.replace(/\/$/, '') + '/health';
  for (const u of [healthUrl, url]) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return true;  // port is open, service responding
    } catch (err) {
      // AbortError = timeout but port listening (slow); anything else = connection error
      if (err.name === 'AbortError') return true;
      // ECONNREFUSED = port closed; fall through to false
    }
  }
  return false;
}

let _meiliLocal = null; // cached: true=reachable, false=not on server
async function meiliReachable() {
  if (_meiliLocal === null) {
    _meiliLocal = MEILI_URL.includes('localhost') ? await isLocalhostReachable(MEILI_URL) : true;
  }
  return _meiliLocal;
}

function ok(component, latencyMs, details = {}) {
  checks[component] = { ok: true, latency_ms: Math.round(latencyMs), ...details };
}
function warn(component, message, details = {}) {
  checks[component] = { ok: false, severity: 'warn', message, ...details };
}
function fail(component, message, details = {}) {
  checks[component] = { ok: false, severity: 'fail', message, ...details };
}

async function timed(fn) {
  const t = Date.now();
  return [await fn(), Date.now() - t];
}

// ─── API health ───────────────────────────────────────────────────────────
async function checkApi() {
  // Try localhost first — avoids tunnel latency and works when event loop is briefly
  // slow due to library-watcher write contention. Falls back to public URL if needed.
  const localUrl = 'http://localhost:7839/api/v1/health';
  const publicUrl = `${API_BASE}/api/v1/health`;
  try {
    const [res, ms] = await timed(() =>
      fetch(localUrl, { signal: AbortSignal.timeout(5000) })
    );
    if (res.ok) return ok('api', ms, { via: 'localhost' });
  } catch { /* localhost not reachable, try public URL */ }
  // Fallback: try public URL via Cloudflare tunnel
  try {
    const [res, ms] = await timed(() =>
      fetch(publicUrl, { signal: AbortSignal.timeout(12000) })
    );
    if (!res.ok) return fail('api', `HTTP ${res.status}`, { latency_ms: ms });
    if (ms > 10000) return warn('api', `slow (${ms}ms) via tunnel`, { latency_ms: ms });
    return ok('api', ms, { via: 'tunnel' });
  } catch {
    try {
      const t = Date.now();
      const { stdout } = await exec(`curl -s --max-time 10 -o /dev/null -w "%{http_code}" "${publicUrl}"`, { timeout: 12000 });
      const ms = Date.now() - t;
      const code = parseInt(stdout.trim(), 10);
      if (code === 200) return ok('api', ms, { via: 'curl' });
      return fail('api', `HTTP ${code} (curl)`, { latency_ms: ms });
    } catch (curlErr) {
      fail('api', `down (curl also failed): ${curlErr.message}`);
    }
  }
}

// ─── Meilisearch indexes ──────────────────────────────────────────────────
async function meiliIndex(uid) {
  const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
  const [res, ms] = await timed(() =>
    fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers, signal: AbortSignal.timeout(30000) })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stats = await res.json();
  return { stats, latency_ms: ms };
}

async function meiliStatsBusy(err) {
  // Returns true if timeout during active indexing (not a real failure)
  const isTimeout = err.message.includes('timeout') || err.message.includes('abort') || err.name === 'TimeoutError';
  if (!isTimeout) return false;
  return meiliReachable();
}

async function checkMeiliBatchStall() {
  if (!await meiliReachable()) return; // only meaningful on tower-nas
  const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
  try {
    const res = await fetch(`${MEILI_URL}/tasks?statuses=processing&limit=20`,
      { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) { warn('meili_batch_stall', `tasks endpoint HTTP ${res.status}`); return; }
    const { results } = await res.json();
    if (!results || results.length === 0) { ok('meili_batch_stall', 0, { processing: 0 }); return; }
    const now = Date.now();
    const stalled = results.filter(t => {
      if (!t.startedAt) return false;
      const runMs = now - new Date(t.startedAt).getTime();
      // paragraphs index HNSW rebuild for 4M+ vectors takes ~30min/batch — allow 45min before alerting
      return runMs > 45 * 60 * 1000;
    });
    if (stalled.length > 0) {
      const oldest = stalled.reduce((a, b) =>
        new Date(a.startedAt) < new Date(b.startedAt) ? a : b);
      const runMin = Math.round((now - new Date(oldest.startedAt).getTime()) / 60000);
      fail('meili_batch_stall',
        `batch ${oldest.batchUid} stuck ${runMin}min (task ${oldest.uid}, ${oldest.indexUid}) — restore Meilisearch from backup`,
        { stalled_count: stalled.length, oldest_task: oldest.uid, run_minutes: runMin });
    } else {
      const maxMin = results.length > 0
        ? Math.max(...results.filter(t => t.startedAt).map(t => Math.round((now - new Date(t.startedAt).getTime()) / 60000)))
        : 0;
      ok('meili_batch_stall', 0, { processing: results.length, max_run_min: maxMin });
    }
  } catch (err) {
    warn('meili_batch_stall', `tasks check failed: ${err.message}`);
  }
}

async function checkMeili() {
  if (!await meiliReachable()) {
    for (const c of ['meili_paragraphs', 'meili_hype', 'meili_batch_stall'])
      warn(c, 'remote_only (run on tower-nas to check Meili)');
    return;
  }
  checkMeiliBatchStall(); // fire-and-forget alongside index checks
  // Run both index checks in parallel — previously sequential 15s×2 = 30s worst case
  await Promise.all([
    // paragraphs (main)
    meiliIndex('paragraphs').then(({ stats, latency_ms }) => {
      if (!stats.numberOfDocuments) return warn('meili_paragraphs', 'empty');
      const embedRatio = stats.numberOfEmbeddedDocuments / stats.numberOfDocuments;
      const embedPct = Math.round(embedRatio * 100);
      // Low embed ratio is expected during initial sync or after mass reset recovery
      // Only warn below 50% — ratio grows as sync-processor re-uploads with vectors
      if (embedRatio < 0.5) {
        return warn('meili_paragraphs', `${embedPct}% embedded (growing as sync re-uploads with vectors)`,
          { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments, latency_ms });
      }
      ok('meili_paragraphs', latency_ms,
        { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments, embed_pct: embedPct });
    }).catch(async err => {
      if (await meiliStatsBusy(err)) warn('meili_paragraphs', 'stats timeout (Meili busy indexing — not a failure)');
      else fail('meili_paragraphs', err.message);
    }),

    // hype_questions (sidecar)
    meiliIndex('hype_questions').then(({ stats, latency_ms }) => {
      if (!stats.numberOfDocuments) {
        return warn('meili_hype', 'empty (sidecar not yet populated)', { docs: 0, latency_ms });
      }
      const embedRatio = stats.numberOfEmbeddedDocuments / stats.numberOfDocuments;
      if (embedRatio < 0.95) {
        return warn('meili_hype', `${Math.round(embedRatio * 100)}% embedded`,
          { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments, latency_ms });
      }
      ok('meili_hype', latency_ms,
        { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments });
    }).catch(async err => {
      if (await meiliStatsBusy(err)) warn('meili_hype', 'stats timeout (Meili busy indexing — not a failure)');
      else fail('meili_hype', err.message);
    }),
  ]);
}

// ─── boss vLLM endpoint ───────────────────────────────────────────────────
async function checkVllm() {
  const isLocalhostVllm = VLLM_URL.includes('localhost') || VLLM_URL.includes('127.0.0.1');
  const isBossHostname = VLLM_URL.includes('boss');
  if (isBossHostname || isLocalhostVllm) {
    // Only meaningful on tower-nas (where Meili is also local).
    // On a dev machine, boss is not on Tailscale — treat as remote_only.
    const onServer = await meiliReachable();
    if (!onServer) { warn('boss_vllm', 'remote_only (run on tower-nas to check vLLM)'); return; }
    const reachable = await isLocalhostReachable(VLLM_URL.replace(/\/v1.*/, ''));
    if (!reachable) { warn('boss_vllm', 'boss unreachable — llama-server down? (check port 8080 on boss)'); return; }
  }
  try {
    const [res, ms] = await timed(() =>
      fetch(`${VLLM_URL}/models`, { signal: AbortSignal.timeout(8000) })
    );
    if (!res.ok) return fail('boss_vllm', `HTTP ${res.status}`, { latency_ms: ms });
    const data = await res.json();
    const model = data?.data?.[0]?.id || 'unknown';
    // Verify context window matches LOCAL_LLM_CONTEXT — mismatch caused 27K-token overflow errors
    const configuredContext = parseInt(process.env.LOCAL_LLM_CONTEXT || '8192', 10);
    const serverContext = data?.data?.[0]?.context_window;
    if (serverContext && serverContext < configuredContext) {
      warn('boss_vllm', `context window mismatch: server=${serverContext} < configured=${configuredContext} (update LOCAL_LLM_CONTEXT)`, { model, latency_ms: ms });
      return;
    }
    ok('boss_vllm', ms, { model, context_window: serverContext || 'unknown' });
  } catch (err) {
    fail('boss_vllm', err.message);
  }
}

// ─── PM2 process state ────────────────────────────────────────────────────
async function checkPm2() {
  // Only meaningful when running on tower-nas. If pm2 isn't local, skip.
  try {
    // Use full path; capture stderr too so we can see pm2 errors
    const pm2bin = [process.env.PM2_BIN, '/usr/bin/pm2', '/usr/local/bin/pm2', 'pm2'].find(Boolean);
    // spawnSync avoids async event-loop issues that cause exec to return empty stdout
    const pm2result = spawnSync(pm2bin, ['jlist'], { timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
    const raw = pm2result.stdout || pm2result.stderr || '';
    const jsonStart = raw.indexOf('[');
    if (jsonStart === -1) {
      return warn('pm2', 'pm2 not available locally (run on tower-nas to verify)');
    }
    const procs = JSON.parse(raw.slice(jsonStart));
    // Empty list = pm2 running locally but no siftersearch processes — dev machine
    if (procs.length === 0) {
      return warn('pm2', 'pm2 not available locally (run on tower-nas to verify)');
    }
    const expected = ['siftersearch-api', 'siftersearch-worker',
      'siftersearch-library-watcher', 'siftersearch-enrichment-api',
      'siftersearch-deep-research', 'siftersearch-updater'];
    // warn (not fail) when stopped — all require external services or are tier-gated
    const warnIfStopped = [
      'siftersearch-enrichment',        // requires vLLM on boss
      'siftersearch-graph-extractor',   // tier-gated; may idle between tiers
      'siftersearch-graph-validator',
      'siftersearch-graph-resolver',
      'siftersearch-graph-promoter',
    ];
    const optional = [];
    const summary = {};
    const problems = [];
    const warnProblems = [];
    for (const name of expected) {
      const p = procs.find(x => x.name === name);
      if (!p) { summary[name] = 'missing'; problems.push(`${name}: missing`); continue; }
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      const uptime = p.pm2_env?.pm_uptime
        ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0;
      summary[name] = `${status} (restarts=${restarts}, uptime=${uptime}s)`;
      if (status !== 'online') problems.push(`${name}: ${status}`);
      // Flag crash loops: >1000 total restarts (processes accumulate restarts over months; 50 was too low)
      if (restarts > 1000) problems.push(`${name}: crash loop (${restarts} restarts)`);
    }
    for (const name of warnIfStopped) {
      const p = procs.find(x => x.name === name);
      if (!p) { summary[name] = 'missing'; continue; }
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      summary[name] = `${status} (restarts=${restarts})`;
      // enrichment is vLLM-dependent — only warn, don't fail
      if (status !== 'online') warnProblems.push(`${name}: ${status} (requires vLLM on boss)`);
    }
    for (const name of optional) {
      const p = procs.find(x => x.name === name);
      if (!p) continue; // optional — absence is fine
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      summary[name] = `${status} (restarts=${restarts})`;
      if (restarts > 1000) problems.push(`${name}: crash loop (${restarts} restarts)`);
    }
    // Library-watcher memory check: max_memory_restart=12G in ecosystem.config.cjs.
    // First scan after Dropbox sync touches all mtimes reads 8,514 files — one-time cost.
    // Subsequent scans use mtime tier-1 fast-path and stay under 400MB.
    const watcher = procs.find(x => x.name === 'siftersearch-library-watcher');
    if (watcher?.monit?.memory) {
      const memMB = Math.round(watcher.monit.memory / 1024 / 1024);
      if (memMB > 10000) warnProblems.push(`siftersearch-library-watcher: memory ${memMB}MB (approaching 12GB restart limit — possible leak)`);
      if (summary['siftersearch-library-watcher']) summary['siftersearch-library-watcher'] += `, mem=${memMB}MB`;
    }
    if (problems.length > 0) fail('pm2', problems.join('; '), summary);
    else if (warnProblems.length > 0) warn('pm2', warnProblems.join('; '), summary);
    else ok('pm2', 0, summary);
  } catch (err) {
    warn('pm2', `pm2 query failed: ${err.message}`);
  }
}

// ─── DB write recency ─────────────────────────────────────────────────────
// Uses sync_staleness data from the pipeline endpoint to infer worker health.
// If unsynced_count is 0 or shrinking, the sync worker is alive.
// Falls back to warn if pipeline endpoint is unavailable.
async function checkDbActivity() {
  const ph = await fetchPipelineHealth();
  if (ph._error) {
    return warn('db_activity', `pipeline endpoint unavailable — cannot verify DB activity: ${ph._error}`);
  }
  // If sync is stuck (old unsynced rows), that's a worker failure — reported by sync_staleness.
  // Here we just confirm the DB is reachable via the API (implied by pipeline endpoint responding).
  const { sync } = ph;
  if (sync.unsynced_count === 0) {
    return ok('db_activity', 0, { note: 'fully synced', total_paragraphs: sync.total_paragraphs });
  }
  // Sync worker alive if it's making progress (staleness check handles stuck case)
  ok('db_activity', 0, {
    unsynced_remaining: sync.unsynced_count,
    oldest_hours: sync.oldest_unsynced_hours
  });
}

// ─── Pipeline health via API endpoint ─────────────────────────────────────
// Calls /api/search/health/pipeline which queries the DB server-side.
// Works from any machine (no direct DB access needed).
// Checks: sync staleness, Meili vs DB divergence, entity lock-storm, schema version.
// Shared promise so concurrent callers don't each make a separate request.
// Falls back to curl if node fetch fails — node HTTPS can be unreliable under
// concurrent socket pressure (boss/Meili TCP hangs exhaust libuv thread pool).
let _pipelineHealthPromise = null;
async function fetchPipelineHealth() {
  if (!_pipelineHealthPromise) {
    // Prefer localhost when on tower-nas — avoids Cloudflare Tunnel round-trip
    // and works even when the public URL is slow or unreachable.
    const localUrl = 'http://localhost:7839/api/search/health/pipeline';
    const publicUrl = `${API_BASE}/api/search/health/pipeline`;
    _pipelineHealthPromise = (async () => {
      // Try localhost first (fast, works on-server)
      try {
        const res = await fetch(localUrl, { signal: AbortSignal.timeout(15000) });
        if (res.ok) return res.json();
      } catch { /* not on tower-nas, fall through */ }
      // Fall back to public URL
      try {
        const res = await fetch(publicUrl, { signal: AbortSignal.timeout(30000) });
        if (res.ok) return res.json();
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        return { _error: err.message };
      }
    })();
  }
  return _pipelineHealthPromise;
}

async function checkSyncStaleness() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('sync_staleness', `pipeline endpoint unavailable: ${ph._error}`);

  const { sync, status } = ph;
  const details = {
    unsynced_count: sync.unsynced_count,
    oldest_unsynced_hours: sync.oldest_unsynced_hours,
    synced_last_2h: status.synced_last_2h ?? 'n/a'
  };

  // Check for stuck worker first (independent of WAL/count availability)
  if (status.sync_stuck) {
    const msg = sync.unsynced_count === -1
      ? 'sync processor stuck — no rows synced in last 2h (WAL too large to count backlog)'
      : `${sync.unsynced_count.toLocaleString()} paragraphs unsynced, none synced in last 2h — sync processor stuck`;
    return fail('sync_staleness', msg, details);
  }

  // unsynced_count === -1 means the API skipped the COUNT(*) because WAL was too large.
  // We CANNOT query the DB directly here — better-sqlite3 COUNT(*) on 4.7M rows blocks
  // the event loop for seconds, causing all parallel fetch() calls to time out.
  if (sync.unsynced_count === -1) {
    return warn('sync_staleness', 'WAL too large — unsynced count unavailable (high write activity)');
  }

  if (sync.unsynced_count === 0) return ok('sync_staleness', 0, { unsynced: 0 });
  // Mass-reset guard: if >50% of all paragraphs are unsynced, something catastrophic happened.
  // Use max(total_paragraphs, unsynced_count) as denominator to handle stale cached counts.
  const denom = Math.max(sync.total_paragraphs, sync.unsynced_count, 1);
  const massResetThreshold = sync.unsynced_count / denom;
  if (massResetThreshold > 0.5 && sync.unsynced_count > 500000) {
    return fail('sync_staleness',
      `MASS RESET DETECTED: ${sync.unsynced_count.toLocaleString()} paragraphs unsynced — restore Meili from backup instead of re-syncing`,
      { ...details, total_paragraphs: sync.total_paragraphs, unsynced: sync.unsynced_count });
  }
  if (sync.unsynced_count > 50000) {
    const rate = status.synced_last_2h > 0 ? `${status.synced_last_2h.toLocaleString()} synced in last 2h` : 'no activity in last 2h';
    return warn('sync_staleness',
      `large backlog: ${sync.unsynced_count.toLocaleString()} unsynced (${rate})`,
      details);
  }
  ok('sync_staleness', 0, details);
}

async function checkMeiliSyncTasks() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('meili_sync_tasks', `pipeline endpoint unavailable: ${ph._error}`);

  const { sync_tasks } = ph;
  if (!sync_tasks) return warn('meili_sync_tasks', 'pipeline endpoint missing sync_tasks — API may need restart');

  const { stale_count, oldest_age_hours, total_processing } = sync_tasks;
  const details = { stale_count, oldest_age_hours, total_processing };

  if (stale_count > 0) {
    return warn('meili_sync_tasks',
      `${stale_count} processing task(s) older than 4h (oldest: ${oldest_age_hours?.toFixed(1)}h) — reconciler may be stuck`,
      details);
  }
  ok('meili_sync_tasks', 0, details);
}

async function checkWal() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('wal_size', `pipeline endpoint unavailable: ${ph._error}`);
  if (!ph.wal || ph.wal.size_gb === null) return warn('wal_size', 'WAL file not found or endpoint outdated');

  const gb = ph.wal.size_gb;
  const details = { size_gb: gb };
  if (gb > 8) return fail('wal_size', `WAL ${gb}GB — checkpoint blocked (restart api to release reader locks)`, details);
  if (gb > 3) return warn('wal_size', `WAL ${gb}GB — larger than normal, read performance degraded`, details);
  ok('wal_size', 0, details);
}

async function checkMeiliVsDb() {
  if (!await meiliReachable()) {
    return warn('meili_vs_db', 'remote_only (run on tower-nas to check Meili)');
  }
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('meili_vs_db', `pipeline endpoint unavailable: ${ph._error}`);

  try {
    const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
    const res = await fetch(`${MEILI_URL}/indexes/paragraphs/stats`,
      { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return warn('meili_vs_db', `Meili stats HTTP ${res.status}`);
    const meiliCount = (await res.json()).numberOfDocuments || 0;

    const dbSynced = ph.sync.total_paragraphs - ph.sync.unsynced_count;
    const delta = dbSynced - meiliCount;
    // Use total_paragraphs as denominator when dbSynced is tiny (mass-reset scenario)
    const denominator = Math.max(dbSynced, ph.sync.total_paragraphs * 0.1, 1);
    const pct = Math.round((delta / denominator) * 100);
    const details = { db_synced: dbSynced, meili_docs: meiliCount, delta, delta_pct: pct, total_paragraphs: ph.sync.total_paragraphs };

    if (pct > 20) return fail('meili_vs_db', `Meili missing ${pct}% of synced DB paragraphs — restore from backup if mass reset occurred`, details);
    if (pct > 5) return warn('meili_vs_db', `Meili ${pct}% behind DB`, details);
    ok('meili_vs_db', 0, details);
  } catch (err) {
    if (await meiliStatsBusy(err)) warn('meili_vs_db', 'stats timeout (Meili busy indexing — not a failure)');
    else warn('meili_vs_db', err.message);
  }
}

async function checkEntityPipeline() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('entity_pipeline', `pipeline endpoint unavailable: ${ph._error}`);

  const { entity, status } = ph;
  const details = {
    entity_mention_rows: entity.mention_rows,
    dup_ratio: entity.dup_ratio,
    promotion_queue_pending: entity.promotion_queue_pending,
    extraction_runs_24h: entity.extraction_runs_24h
  };

  if (status.lock_storm) {
    return fail('entity_pipeline',
      `entity_mentions has ${entity.dup_ratio}x duplicate rows — UNIQUE constraint missing, DB lock storm active`,
      details);
  }
  if (entity.promotion_queue_pending > 100000) {
    return warn('entity_pipeline',
      `promotion_queue has ${entity.promotion_queue_pending.toLocaleString()} unresolved entries`, details);
  }
  ok('entity_pipeline', 0, details);
}

async function checkSchemaVersion() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('schema_version', `pipeline endpoint unavailable: ${ph._error}`);

  const { schema, status } = ph;
  const details = { db_version: schema.db_version, code_version: schema.expected_version };

  if (status.migration_pending) {
    return fail('schema_version',
      `DB at v${schema.db_version}, code expects v${schema.expected_version} — migration pending`, details);
  }
  ok('schema_version', 0, details);
}

// ─── Enrichment progress ──────────────────────────────────────────────────
// Uses pipeline health endpoint (server-side partial-index queries) — no local
// better-sqlite3 which would block the event loop and cause Meili fetch timeouts.
async function checkEnrichment() {
  if (!await meiliReachable()) return warn('enrichment', 'remote_only (run on tower-nas to check enrichment)');
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('enrichment', `pipeline endpoint unavailable: ${ph._error}`);
  // enrichment stats are skipped in pipeline endpoint when WAL is large (would block).
  if (!ph.enrichment) return ok('enrichment', 0, { note: 'stats deferred (WAL large or not yet available)' });

  const total = ph.sync?.total_paragraphs ?? 0;
  const { needs_context_count, needs_hype_count } = ph.enrichment;
  const withContext = total - needs_context_count;
  const ctxPct = total > 0 ? Math.round((withContext / total) * 100) : 0;
  const withHype = withContext - needs_hype_count;
  const hypePct = withContext > 0 ? Math.round((withHype / withContext) * 100) : 0;
  const details = { total, context_pct: ctxPct, hype_pct: hypePct,
    needs_context: needs_context_count, needs_hype: needs_hype_count };

  if (needs_context_count > 0 && ctxPct < 50) {
    return warn('enrichment', `context enrichment ${ctxPct}% complete (${needs_context_count.toLocaleString()} remaining)`, details);
  }
  ok('enrichment', 0, details);
}

// ─── Chat smoke test ──────────────────────────────────────────────────────
async function checkChatSmoke() {
  if (!SIFTER_API_KEY) {
    return warn('chat_smoke', 'PUBLIC_SIFTER_API_KEY not set, skipping');
  }
  try {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'What does the corpus say about prayer?' }],
      tenant: 'siftersearch'
    });
    const t = Date.now();
    const res = await fetch(`${API_BASE}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SIFTER_API_KEY,
        Accept: 'text/event-stream'
      },
      body,
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      return fail('chat_smoke', `HTTP ${res.status}`);
    }
    // Drain the stream and look for a `done` event with a non-empty reply
    const decoder = new TextDecoder();
    let buf = '';
    let final = null;
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === 'done') final = evt.final_reply || '';
        } catch { /* skip */ }
      }
    }
    const ms = Date.now() - t;
    if (!final || final.length < 50) {
      return fail('chat_smoke', 'reply empty or too short', { latency_ms: ms, reply_len: final?.length });
    }
    if (ms > 20000) {
      return warn('chat_smoke', `slow (${ms}ms)`, { latency_ms: ms, reply_len: final.length });
    }
    ok('chat_smoke', ms, { reply_len: final.length });
  } catch (err) {
    fail('chat_smoke', err.message);
  }
}

// ─── Deep Research queue health ───────────────────────────────────────────
async function checkDeepResearch() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('deep_research', `pipeline endpoint unavailable: ${ph._error}`);

  const dr = ph.deep_research;
  if (!dr) return warn('deep_research', 'deep_research stats missing from pipeline endpoint');

  const details = {
    queue_total: dr.queue_total,
    queue_pending: dr.queue_pending,
    queue_failed: dr.queue_failed,
    last_completed: dr.last_completed
  };

  // Only fail if tasks are actively pending AND failing (not just historical failures with no work)
  if (dr.queue_pending > 0 && dr.queue_failed > 10) {
    return fail('deep_research',
      `${dr.queue_failed} failed + ${dr.queue_pending} pending — worker may be crash-looping`, details);
  }
  // Historical failures with no pending work = past errors, worker is idle (ok)
  if (dr.queue_failed > 50) {
    return warn('deep_research', `${dr.queue_failed} historical failed tasks`, details);
  }
  ok('deep_research', 0, details);
}

// ─── Entity-mentions Meili sidecar ───────────────────────────────────────
async function checkEntityMentionsIndex() {
  if (!await meiliReachable()) {
    return warn('entity_mentions_idx', 'remote_only (run on tower-nas to check Meili)');
  }
  try {
    const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
    const res = await fetch(`${MEILI_URL}/indexes/entity_mentions_idx/stats`,
      { headers, signal: AbortSignal.timeout(30000) });
    if (res.status === 404) {
      // Not yet created — only warn if entity pipeline has data
      const ph = await fetchPipelineHealth();
      if ((ph.entity?.mention_rows ?? 0) > 100) {
        return warn('entity_mentions_idx', `index missing but DB has ${ph.entity.mention_rows} rows — sidecar not yet synced`);
      }
      return ok('entity_mentions_idx', 0, { note: 'index not yet created (no data yet)' });
    }
    if (!res.ok) return warn('entity_mentions_idx', `HTTP ${res.status}`);
    const stats = await res.json();
    ok('entity_mentions_idx', 0, { docs: stats.numberOfDocuments });
  } catch (err) {
    if (await meiliStatsBusy(err)) warn('entity_mentions_idx', 'stats timeout (Meili busy indexing — not a failure)');
    else warn('entity_mentions_idx', err.message);
  }
}

// ─── Log file sizes ───────────────────────────────────────────────────────
// Library watcher memory leak causes crash-restart cycles that flood logs.
// Warn when total log dir size exceeds 10GB; fail at 20GB (disk risk on /home 218GB).
async function checkLogFiles() {
  // spawnSync check: if pm2 isn't local, we're not on tower-nas, skip silently
  const pm2bin = [process.env.PM2_BIN, '/usr/bin/pm2', '/usr/local/bin/pm2', 'pm2'].find(Boolean);
  const pm2test = spawnSync(pm2bin, ['jlist'], { timeout: 5000, maxBuffer: 256, encoding: 'utf8' });
  if (pm2test.stdout?.indexOf('[') === -1) {
    return warn('log_files', 'remote_only (run on tower-nas to check log files)');
  }
  try {
    const logDir = join(PROJECT_ROOT, 'logs');
    const { readdir, stat } = await import('node:fs/promises');
    const files = await readdir(logDir).catch(() => []);
    let totalBytes = 0;
    for (const f of files) {
      const s = await stat(join(logDir, f)).catch(() => null);
      if (s) totalBytes += s.size;
    }
    const totalGB = Math.round(totalBytes / 1024 / 1024 / 1024 * 10) / 10;
    const details = { total_gb: totalGB, log_dir: logDir };
    if (totalGB > 20) return fail('log_files', `logs ${totalGB}GB — disk risk (clear old library-watcher logs)`, details);
    if (totalGB > 10) return warn('log_files', `logs ${totalGB}GB (library-watcher memory leak flooding logs)`, details);
    ok('log_files', 0, details);
  } catch (err) {
    warn('log_files', err.message);
  }
}

// ─── Graph extraction pipeline ───────────────────────────────────────────
async function checkGraphPipeline() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('graph_pipeline', `pipeline endpoint error: ${ph._error}`);
  const g = ph.graph;
  if (!g) return warn('graph_pipeline', 'remote_only (run on tower-nas)');

  const total = (g.extracted || 0) + (g.pending || 0);
  const pct = total > 0 ? Math.round(g.extracted / total * 100) : 0;

  // FAIL: resolver is backed up — extractor running but resolver not consuming
  if (g.extractions_unresolved > 5000 && g.extraction_runs_24h > 0)
    return fail('graph_pipeline', `resolver backlog: ${g.extractions_unresolved.toLocaleString()} unresolved extractions`, g);

  // WARN: large unresolved backlog even if extractor is idle
  if (g.extractions_unresolved > 1000)
    return warn('graph_pipeline', `${g.extractions_unresolved.toLocaleString()} unresolved extractions (resolver may be stopped)`, g);

  ok('graph_pipeline', 0, {
    extracted: g.extracted, pending: g.pending, pct: `${pct}%`,
    unresolved: g.extractions_unresolved, aliases: g.entity_aliases
  });
}

// ─── Run all ──────────────────────────────────────────────────────────────

// Run api + pipeline-health fetch in parallel first.
// If the API is down, Meilisearch and boss are also unreachable from this
// machine — skip their 8s timeouts and mark them api_down immediately.
await Promise.all([checkApi(), fetchPipelineHealth()]);

const apiDown = checks.api?.severity === 'fail';
if (apiDown) {
  // When tower-nas is unreachable, skip all remote-service checks to avoid
  // burning 8s timeouts per check. Mark as warn so they appear in output.
  for (const c of ['meili_paragraphs', 'meili_hype', 'boss_vllm', 'entity_mentions_idx', 'meili_vs_db', 'enrichment', 'graph_pipeline'])
    warn(c, 'skipped: api_down (tower-nas unreachable)');
}

const probes = [
  ...(!apiDown ? [
    ['meili', checkMeili],
    ['boss_vllm', checkVllm],
    ['entity_mentions_idx', checkEntityMentionsIndex],
    ['meili_vs_db', checkMeiliVsDb],              // catches silent Meili/DB divergence
  ] : []),
  ['pm2', checkPm2],
  ['log_files', checkLogFiles],                    // catches library-watcher log bloat
  ['db_activity', checkDbActivity],
  ['sync_staleness', checkSyncStaleness],         // catches "527K unsynced for 11 days"
  ['meili_sync_tasks', checkMeiliSyncTasks],      // catches stale optimistic-sync tasks
  ['wal_size', checkWal],                          // catches WAL bloat blocking checkpoints
  ['entity_pipeline', checkEntityPipeline],       // catches lock-storm pattern
  ['schema_version', checkSchemaVersion],         // catches pending migrations
  ['deep_research', checkDeepResearch],           // deep_research_queue stuck/failing
  // enrichment + graph_pipeline: only meaningful on tower-nas; skip when api is down.
  ...(!apiDown ? [
    ['enrichment', checkEnrichment],
    ['graph_pipeline', checkGraphPipeline],
  ] : []),
];
if (!QUICK) probes.push(['chat_smoke', checkChatSmoke]);

await Promise.all(probes.map(([_, fn]) => fn().catch(err => fail(_, err.message))));

const totalMs = Date.now() - startTime;
const allOk = Object.values(checks).every(c => c.ok);
const failed = Object.entries(checks).filter(([_, c]) => !c.ok && c.severity === 'fail');
const warned = Object.entries(checks).filter(([_, c]) => !c.ok && c.severity === 'warn');

const report = {
  ok: allOk,
  total_ms: totalMs,
  timestamp: new Date().toISOString(),
  failed_count: failed.length,
  warning_count: warned.length,
  checks
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  // Human-readable summary
  console.log('═'.repeat(60));
  console.log(`Health Check — ${allOk ? '✅ all systems operational' : (failed.length > 0 ? '🔴 FAILURES' : '⚠️  WARNINGS')}`);
  console.log(`Probed in ${totalMs}ms · ${Object.keys(checks).length} components`);
  console.log('═'.repeat(60));
  for (const [name, c] of Object.entries(checks)) {
    const icon = c.ok ? '✓' : (c.severity === 'fail' ? '✗' : '⚠');
    const status = c.ok ? 'ok' : c.message;
    const lat = c.latency_ms != null ? ` (${c.latency_ms}ms)` : '';
    console.log(`  ${icon} ${name.padEnd(22)} ${status}${lat}`);
    if (VERBOSE && Object.keys(c).length > 2) {
      for (const [k, v] of Object.entries(c)) {
        if (['ok', 'severity', 'message', 'latency_ms'].includes(k)) continue;
        console.log(`        ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }
  console.log('═'.repeat(60));
  if (failed.length) console.log(`${failed.length} failures: ${failed.map(([n]) => n).join(', ')}`);
  if (warned.length) console.log(`${warned.length} warnings: ${warned.map(([n]) => n).join(', ')}`);
}

process.exit(allOk ? 0 : 1);
