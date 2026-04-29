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

/* global AbortSignal */

import { exec as execCb } from 'child_process';
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
  try {
    const [res, ms] = await timed(() =>
      fetch(`${API_BASE}/api/search/health`, { signal: AbortSignal.timeout(5000) })
    );
    if (!res.ok) return fail('api', `HTTP ${res.status}`, { latency_ms: ms });
    if (ms > 2000) return warn('api', `slow (${ms}ms)`, { latency_ms: ms });
    ok('api', ms);
  } catch (err) {
    fail('api', err.message);
  }
}

// ─── Meilisearch indexes ──────────────────────────────────────────────────
async function meiliIndex(uid) {
  const headers = MEILI_KEY ? { Authorization: `Bearer ${MEILI_KEY}` } : {};
  const [res, ms] = await timed(() =>
    fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers, signal: AbortSignal.timeout(5000) })
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
      fetch(`${VLLM_URL}/models`, { signal: AbortSignal.timeout(5000) })
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
    const { stdout } = await exec('pm2 jlist 2>/dev/null', { timeout: 5000 });
    if (!stdout || !stdout.trim().startsWith('[')) {
      return warn('pm2', 'pm2 not available locally (run on tower-nas to verify)');
    }
    const procs = JSON.parse(stdout);
    const expected = ['siftersearch-api', 'siftersearch-worker',
      'siftersearch-library-watcher', 'siftersearch-enrichment', 'siftersearch-updater'];
    const summary = {};
    for (const name of expected) {
      const p = procs.find(x => x.name === name);
      if (!p) { summary[name] = 'missing'; continue; }
      const status = p.pm2_env?.status || 'unknown';
      const restarts = p.pm2_env?.restart_time ?? 0;
      const uptime = p.pm2_env?.pm_uptime
        ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0;
      summary[name] = `${status} (restarts=${restarts}, uptime=${uptime}s)`;
    }
    const allOnline = expected.every(n => summary[n]?.startsWith('online'));
    if (allOnline) ok('pm2', 0, summary);
    else fail('pm2', 'some processes not online', summary);
  } catch (err) {
    warn('pm2', `pm2 query failed: ${err.message}`);
  }
}

// ─── DB write recency ─────────────────────────────────────────────────────
async function checkDbActivity() {
  try {
    const dbPath = join(PROJECT_ROOT, 'data/sifter.db');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Worker activity: any content row updated in last 24h is healthy
    // (sync worker touches updated_at; enrichment also bumps it)
    const recent = db.prepare(`
      SELECT
        COUNT(*) AS recent_changes,
        MAX(updated_at) AS latest
      FROM content
      WHERE updated_at >= datetime('now', '-24 hours') AND deleted_at IS NULL
    `).get();
    db.close();

    if (!recent.latest) {
      return warn('db_activity', 'no content updates in last 24h', recent);
    }
    const latestMs = new Date(recent.latest).getTime();
    const ageMin = Math.round((Date.now() - latestMs) / 60000);
    if (ageMin > 60 * 6) { // more than 6 hours stale
      return warn('db_activity', `last write was ${ageMin}m ago`,
        { recent_changes: recent.recent_changes, latest: recent.latest });
    }
    ok('db_activity', 0,
      { recent_changes: recent.recent_changes, latest: recent.latest, age_minutes: ageMin });
  } catch (err) {
    warn('db_activity', err.message);
  }
}

// ─── Enrichment progress ──────────────────────────────────────────────────
async function checkEnrichment() {
  try {
    const dbPath = join(PROJECT_ROOT, 'data/sifter.db');
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

// ─── Run all ──────────────────────────────────────────────────────────────
const probes = [
  ['api', checkApi],
  ['meili', checkMeili],
  ['boss_vllm', checkVllm],
  ['pm2', checkPm2],
  ['db_activity', checkDbActivity],
  ['enrichment', checkEnrichment]
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
