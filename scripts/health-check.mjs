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
 *   - API responsiveness (/api/search/health)
 *   - Meilisearch paragraphs index (size + embeddings)
 *   - Meilisearch hype_questions sidecar (size + embeddings)
 *   - boss vLLM endpoint
 *   - PM2 processes (api, worker, library-watcher, enrichment, updater)
 *   - SQLite recent worker write activity (proves worker is alive)
 *   - SQLite recent enrichment write activity (proves boss is producing)
 *   - Chat endpoint smoke test (skipped with --quick)
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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
  // Try node fetch; fall back to curl if node HTTPS is broken in this environment
  const url = `${API_BASE}/api/search/health`;
  try {
    const [res, ms] = await timed(() =>
      fetch(url, { signal: AbortSignal.timeout(8000) })
    );
    if (!res.ok) return fail('api', `HTTP ${res.status}`, { latency_ms: ms });
    if (ms > 2000) return warn('api', `slow (${ms}ms)`, { latency_ms: ms });
    return ok('api', ms);
  } catch {
    // Curl fallback
    try {
      const t = Date.now();
      const { stdout } = await exec(`curl -s --max-time 10 -o /dev/null -w "%{http_code}" "${url}"`, { timeout: 12000 });
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
    fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers, signal: AbortSignal.timeout(15000) })
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const stats = await res.json();
  return { stats, latency_ms: ms };
}

async function checkMeili() {
  // paragraphs (main)
  try {
    const { stats, latency_ms } = await meiliIndex('paragraphs');
    if (!stats.numberOfDocuments) return warn('meili_paragraphs', 'empty');
    const embedRatio = stats.numberOfEmbeddedDocuments / stats.numberOfDocuments;
    if (embedRatio < 0.5) {
      return warn('meili_paragraphs', `only ${Math.round(embedRatio * 100)}% embedded`,
        { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments, latency_ms });
    }
    ok('meili_paragraphs', latency_ms,
      { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments });
  } catch (err) {
    fail('meili_paragraphs', err.message);
  }

  // hype_questions (sidecar)
  try {
    const { stats, latency_ms } = await meiliIndex('hype_questions');
    if (!stats.numberOfDocuments) {
      // Empty is ok during initial bring-up — just flag it
      return warn('meili_hype', 'empty (sidecar not yet populated)',
        { docs: 0, latency_ms });
    }
    const embedRatio = stats.numberOfEmbeddedDocuments / stats.numberOfDocuments;
    if (embedRatio < 0.95) {
      return warn('meili_hype', `${Math.round(embedRatio * 100)}% embedded`,
        { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments, latency_ms });
    }
    ok('meili_hype', latency_ms,
      { docs: stats.numberOfDocuments, embedded: stats.numberOfEmbeddedDocuments });
  } catch (err) {
    fail('meili_hype', err.message);
  }
}

// ─── boss vLLM endpoint ───────────────────────────────────────────────────
async function checkVllm() {
  try {
    const [res, ms] = await timed(() =>
      fetch(`${VLLM_URL}/models`, { signal: AbortSignal.timeout(15000) })
    );
    if (!res.ok) return fail('boss_vllm', `HTTP ${res.status}`, { latency_ms: ms });
    const data = await res.json();
    const model = data?.data?.[0]?.id || 'unknown';
    ok('boss_vllm', ms, { model });
  } catch (err) {
    fail('boss_vllm', err.message);
  }
}

// ─── PM2 process state ────────────────────────────────────────────────────
async function checkPm2() {
  // Only meaningful when running on tower-nas. If pm2 isn't local, skip.
  try {
    const { stdout } = await exec('pm2 jlist 2>/dev/null', { timeout: 15000 });
    if (!stdout || !stdout.trim().startsWith('[')) {
      return warn('pm2', 'pm2 not available locally (run on tower-nas to verify)');
    }
    const procs = JSON.parse(stdout);
    // Empty list = pm2 running locally but no siftersearch processes — dev machine
    if (procs.length === 0) {
      return warn('pm2', 'pm2 not available locally (run on tower-nas to verify)');
    }
    const expected = ['siftersearch-api', 'siftersearch-worker',
      'siftersearch-library-watcher', 'siftersearch-enrichment', 'siftersearch-enrichment-api',
      'siftersearch-deep-research', 'siftersearch-updater'];
    // Optional: graph workers only checked if they exist in PM2 list
    const optional = ['siftersearch-graph-extractor', 'siftersearch-graph-validator',
      'siftersearch-graph-resolver', 'siftersearch-graph-promoter'];
    const summary = {};
    const problems = [];
    for (const name of expected) {
      const p = procs.find(x => x.name === name);
      if (!p) { summary[name] = 'missing'; problems.push(`${name}: missing`); continue; }
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      const uptime = p.pm2_env?.pm_uptime
        ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0;
      summary[name] = `${status} (restarts=${restarts}, uptime=${uptime}s)`;
      if (status !== 'online') problems.push(`${name}: ${status}`);
      // Flag crash loops: >50 restarts is a process that keeps dying
      if (restarts > 50) problems.push(`${name}: crash loop (${restarts} restarts)`);
    }
    for (const name of optional) {
      const p = procs.find(x => x.name === name);
      if (!p) continue; // optional — absence is fine
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      summary[name] = `${status} (restarts=${restarts})`;
      if (restarts > 50) problems.push(`${name}: crash loop (${restarts} restarts)`);
    }
    if (problems.length > 0) fail('pm2', problems.join('; '), summary);
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
    const url = `${API_BASE}/api/search/health/pipeline`;
    _pipelineHealthPromise = fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch(async () => {
        try {
          const { stdout } = await exec(`curl -s --max-time 10 "${url}"`, { timeout: 12000 });
          return JSON.parse(stdout.trim());
        } catch (curlErr) {
          return { _error: curlErr.message };
        }
      });
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

  if (sync.unsynced_count === 0) return ok('sync_staleness', 0, { unsynced: 0 });

  if (status.sync_stuck) {
    // No syncing activity in last 2h AND backlog > 1000 = truly stuck
    return fail('sync_staleness',
      `${sync.unsynced_count.toLocaleString()} paragraphs unsynced, 0 synced in last 2h — sync processor stuck`,
      details);
  }
  if (sync.unsynced_count > 50000) {
    // Large backlog but making progress — warn with rate info
    return warn('sync_staleness',
      `large backlog: ${sync.unsynced_count.toLocaleString()} unsynced (${status.synced_last_2h ?? '?'} synced in last 2h)`,
      details);
  }
  ok('sync_staleness', 0, details);
}

async function checkMeiliVsDb() {
  const ph = await fetchPipelineHealth();
  if (ph._error) return warn('meili_vs_db', `pipeline endpoint unavailable: ${ph._error}`);

  try {
    const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
    const res = await fetch(`${MEILI_URL}/indexes/paragraphs/stats`,
      { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return warn('meili_vs_db', `Meili stats HTTP ${res.status}`);
    const meiliCount = (await res.json()).numberOfDocuments || 0;

    const dbSynced = ph.sync.total_paragraphs - ph.sync.unsynced_count;
    const delta = dbSynced - meiliCount;
    const pct = dbSynced > 0 ? Math.round((delta / dbSynced) * 100) : 0;
    const details = { db_synced: dbSynced, meili_docs: meiliCount, delta, delta_pct: pct };

    if (pct > 10) return fail('meili_vs_db', `Meili missing ${pct}% of synced DB paragraphs`, details);
    if (pct > 3) return warn('meili_vs_db', `Meili ${pct}% behind DB`, details);
    ok('meili_vs_db', 0, details);
  } catch (err) {
    warn('meili_vs_db', err.message);
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
async function checkEnrichment() {
  try {
    const dbPath = join(PROJECT_ROOT, 'data/sifter.db');
    if (!existsSync(dbPath)) return warn('enrichment', 'DB not local — skipped (run on tower-nas for full check)');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    const r = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN context IS NOT NULL THEN 1 ELSE 0 END) AS with_context,
        SUM(CASE WHEN hyp_questions IS NOT NULL THEN 1 ELSE 0 END) AS with_hype,
        SUM(CASE WHEN context IS NOT NULL AND updated_at >= datetime('now','-1 hour') THEN 1 ELSE 0 END) AS recent_context
      FROM content
      WHERE deleted_at IS NULL
    `).get();
    db.close();

    const ctxPct = Math.round((r.with_context / r.total) * 100);
    const hypePct = Math.round((r.with_hype / r.total) * 100);
    const details = {
      total: r.total,
      context_pct: ctxPct,
      hype_pct: hypePct,
      recent_context_writes_1h: r.recent_context
    };
    if (r.with_context < r.total && r.recent_context === 0) {
      return warn('enrichment',
        `${100 - ctxPct}% paragraphs still need context, but no writes in last hour`,
        details);
    }
    ok('enrichment', 0, details);
  } catch (err) {
    warn('enrichment', err.message);
  }
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
  try {
    const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
    const res = await fetch(`${MEILI_URL}/indexes/entity_mentions_idx/stats`,
      { headers, signal: AbortSignal.timeout(10000) });
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
    warn('entity_mentions_idx', err.message);
  }
}

// ─── Run all ──────────────────────────────────────────────────────────────
const probes = [
  ['api', checkApi],
  ['meili', checkMeili],
  ['boss_vllm', checkVllm],
  ['pm2', checkPm2],
  ['db_activity', checkDbActivity],
  ['sync_staleness', checkSyncStaleness],         // catches "527K unsynced for 11 days"
  ['meili_vs_db', checkMeiliVsDb],                // catches silent Meili/DB divergence
  ['entity_pipeline', checkEntityPipeline],       // catches lock-storm pattern
  ['schema_version', checkSchemaVersion],         // catches pending migrations
  ['deep_research', checkDeepResearch],           // deep_research_queue stuck/failing
  ['entity_mentions_idx', checkEntityMentionsIndex], // sidecar Meili index populated
  ['enrichment', checkEnrichment]
];
if (!QUICK) probes.push(['chat_smoke', checkChatSmoke]);

// Pre-fetch the pipeline health endpoint eagerly so all pipeline-based checks
// share a single warm request. Without this, the concurrent boss/Meili TCP
// hangs in Promise.all can exhaust the libuv thread pool and delay the
// pipeline fetch past its 20s timeout even though the API responds in <1s.
await fetchPipelineHealth();

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
