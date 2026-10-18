// siftersearch-reports — runs queued ops reports (api/lib/ops/reports.js) one at a time at low OS priority, so whole-table
// scans never run inside the API or compete with each other. Results → ops_report_runs (writes go through the writer).
// Deps: ops-report-repo, ops/reports, logger.
import os from 'os';
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { claimNext, finish, requeueStale } from '../lib/repos/ops-report-repo.js';
import { REPORTS, LANES, LANE_WORKERS } from '../lib/ops/reports.js';
import { sendEmail } from '../services/email.js';
import { logActivity } from '../lib/repos/activity-repo.js';

// A job that FAILS or STOPS SHORT (budget cap, monthly cap) is mailed at once (10-16: a phrase run stopped at its $20 cap
// and went unnoticed for 11 hours; Chad: "you were supposed to be watching it closely"). Never throws.
async function alert(run, what, detail) {
  const to = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
  if (!to) return;
  await sendEmail({ to, subject: `SifterSearch ops: ${run.name} #${run.id} ${what}`,
    text: `${run.name} #${run.id} ${what}.\n\n${detail}\n\nParams: ${JSON.stringify(run.params || {}).slice(0, 400)}` })
    .catch((err) => logger.warn({ err: err.message, id: run.id }, 'reports: alert mail failed'));
}
const stoppedShort = (result) => { const s = JSON.stringify(result || {}); return /"phase":"stopped"/.test(s) ? (s.match(/"reason":"([^"]+)"/)?.[1] || 'stopped early') : null; };

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
try { os.setPriority(19); } catch { /* not permitted — runs at normal priority */ }
const IDLE_MS = 15_000;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

if (!process.env.OPS_ONLY) await requeueStale().catch((err) => logger.warn({ err: err.message }, 'reports: requeue failed'));
logger.info({ reports: Object.keys(REPORTS) }, 'Reports worker started');
async function lane(name, only, skipAlways) {
  while (!stopping) {
    // no time-of-day gate (10-14): every job runs when claimed; heavy ones are serialised in their own lane and paced
    const skip = skipAlways;
    const run = await claimNext({ only, skip }).catch((err) => { logger.warn({ err: err.message, lane: name }, 'reports: claim failed'); return null; });
    if (!run) { await new Promise((r) => setTimeout(r, IDLE_MS)); continue; }
    const t0 = Date.now();
    const what = (() => { const p = run.params || {}; return p.budgetKey || p.field || (p.docs?.length ? `${p.docs.length} documents` : p.ids?.length ? `${p.ids.length} documents` : ''); })();
    logActivity('job', `▶ ${run.name}${what ? ` · ${what}` : ''} · #${run.id} started`);
    try {
      const fn = REPORTS[run.name];
      if (!fn) throw new Error(`unknown report "${run.name}"`);
      const result = await fn(run.params || {});
      await finish(run.id, { result, ms: Date.now() - t0 });
      logger.info({ id: run.id, name: run.name, lane: name, ms: Date.now() - t0 }, 'report done');
      const short = stoppedShort(result);
      logActivity('job', `${short ? '■' : '✓'} ${run.name}${what ? ` · ${what}` : ''} · #${run.id} ${short ? `stopped: ${short}` : 'done'} · ${Math.round((Date.now() - t0) / 1000)} s`);
      if (short) await alert(run, 'stopped short', `Reason: ${short}\nIt is not finished: raise the cap and re-queue it to continue (finished work is kept).`);
    } catch (err) {
      // A restart kills the job's child process (indexer) before this process exits: that is NOT a failure. Leave the run
      // 'running' so requeueStale() puts it back on the next start (10-15: five phrase runs were marked failed by
      // restarts and one sat dead for hours until re-queued by hand).
      // the child's death can reach us before our own SIGINT does: a killed child ("exit null") waits for the signal
      if (!stopping && /exit null|SIGTERM|SIGINT|SIGKILL/.test(String(err.message))) await new Promise((r) => setTimeout(r, 2000));
      if (stopping) { logger.warn({ id: run.id, name: run.name, lane: name }, 'report interrupted by shutdown — requeued on next start'); break; }
      await finish(run.id, { error: String(err.message || err).slice(0, 500), ms: Date.now() - t0 }).catch(() => {});
      await alert(run, 'FAILED', String(err.message || err).slice(0, 1500));
      logActivity('job', `✗ ${run.name} · #${run.id} failed`);
      logger.error({ id: run.id, name: run.name, lane: name, err: err.message }, 'report failed');
    }
  }
}
// Rolling coverage refresh (planning/index-coverage-plan.md): the 300 stalest documents re-measured every minute, so the
// ledger converges even when a producer forgets to ask. Cheap per document (doc_id indexes + Qdrant counts).
async function rollingCoverage() {
  const { coverageRefreshJob } = await import('../lib/ops/coverage-job.js');
  const totals = await import('../lib/repos/coverage-repo.js');
  let rebuilt = 0;
  while (!stopping) {
    // the totals move by deltas; a full rebuild when empty and once a day corrects drift (retired docs, tradition changes)
    if (Date.now() - rebuilt > 86400000 || await totals.coverageTotalsEmpty().catch(() => false)) {
      await totals.rebuildCoverageTotals().then(() => { rebuilt = Date.now(); logActivity('ledger', 'coverage totals rebuilt from the full ledger (daily)'); })
        .catch((err) => logger.warn({ err: err.message }, 'coverage: totals rebuild failed'));
    }
    const r = await coverageRefreshJob({ limit: 300 }).catch((err) => { logger.warn({ err: err.message }, 'coverage: rolling refresh failed'); return null; });
    if (r?.measured) logActivity('ledger', `re-measured ${r.measured} documents × 11 layers · index coverage ledger`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

// BM25 and document structure right behind ingestion (Chad 10-16: "the first thing to be completed after initial paragraph ingestion"): every
// 10 minutes, if the ledger shows a real keyword gap, queue keyword-fill (enqueue dedupes a queued/running twin).
async function keywordLoop() {
  const { keywordGapDocs } = await import('../lib/repos/keyword-repo.js');
  const { enqueue } = await import('../lib/repos/ops-report-repo.js');
  const last = {};
  while (!stopping) {
    // only when the gap CHANGED since the last queued run: a gap a fill cannot close (10-17: the same 197 documents
    // re-sent every 10 minutes) must not become a write loop on the NVMe
    for (const [scope, job] of [['primary', 'keyword-fill'], ['supplemental', 'keyword-fill-sites']]) {
      const gap = await keywordGapDocs({ scope, significant: true }).catch(() => []);
      const sig = gap.map((d) => `${d.id}:${d.total}:${d.indexed}`).join(',');
      if (gap.length && sig !== last[scope]) {
        last[scope] = sig;
        await enqueue(job, { significant: true }, 'keyword-loop').catch((err) => logger.warn({ err: err.message }, 'keyword loop: enqueue failed'));
      }
    }
    // document structure (sub-documents, TOC) right after ingestion (Chad 10-17): read every live document not yet read
    const unread = await (await import('../lib/repos/sections-repo.js')).docsWithoutStructure(1).catch(() => []);
    if (unread.length) await enqueue('section-index', { unread: true }, 'structure-loop').catch((err) => logger.warn({ err: err.message }, 'structure loop: enqueue failed'));
    // a NEW long book whose own headings gave no structure → inference (its Contents page / the work's standard structure)
    const infer = await (await import('../lib/repos/sections-repo.js')).autoInferCandidates().catch(() => []);
    if (infer.length) await enqueue('structure-infer', { ids: infer }, 'structure-loop').catch((err) => logger.warn({ err: err.message }, 'structure loop: infer enqueue failed'));
    // PAID follow-through (phrase vectors for new books) runs only under a standing daily cap — AUTO_INDEX_USD_DAY,
    // 0/unset = off (Chad sets it); each run carries its own maxUsd and the shared budget key
    const cap = Number(process.env.AUTO_INDEX_USD_DAY || 0);
    if (cap > 0) {
      const phraseless = await (await import('../lib/repos/coverage-repo.js')).newDocsMissingLayer('phrase').catch(() => []);
      if (phraseless.length) await enqueue('phrase-index', { docs: phraseless, maxUsd: cap, budgetKey: 'auto-ingest' }, 'follow-through').catch((err) => logger.warn({ err: err.message }, 'follow-through: phrase enqueue failed'));
    }
    await new Promise((r) => setTimeout(r, 600_000));
  }
}

// Library telemetry for the home-page Observatory: one snapshot every 5 minutes (api/lib/telemetry.js); 7 days kept.
async function telemetryLoop() {
  const { buildSnapshot, seriesOf } = await import('../lib/telemetry.js');
  const repo = await import('../lib/repos/telemetry-repo.js');
  const fmt = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
  while (!stopping) {
    try {
      const snap = await buildSnapshot();
      await repo.saveSnapshot(snap.at, snap, seriesOf(snap));
      await repo.pruneSnapshots();
      const v = snap.vectors || {}, h = snap.health;
      logActivity('telemetry', `snapshot · ${fmt(snap.corpus.paragraphs)} ¶ · phrase ${fmt(v.phrases)} · hype ${fmt(v.hype)} · concepts ${fmt(v.concepts)}${h ? ` · load ${h.cpu.load_pct}% · tank ${h.storage.find((s) => s.dev === 'sdc')?.io?.busy_pct ?? '—'}% busy` : ''}`);
    } catch (err) { logger.warn({ err: err.message }, 'telemetry: snapshot failed'); }
    await new Promise((r) => setTimeout(r, 5 * 60_000));
  }
}
// PULSE (Chad 10-16: "the console is a bit dead … there is a ton of indexing activity going on"): the machinery's real
// activity, from the two places everything passes through — the single writer's per-minute stats (every write batch,
// attributed to its process and statement) and the vector collections' growth. One line per active writer caller per
// completed minute; one line per collection that grew, every 30 s. Content-free; the activity log's own writes excluded.
async function pulseLoop() {
  const WRITER = process.env.WRITER_STATS_URL || 'http://127.0.0.1:7849/stats';
  const QD = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n).toLocaleString('en-US'));
  let reported = new Date(Date.now() - 60000).toISOString().slice(0, 16);   // minutes up to and including this are done
  let last = {}, tick = 0;
  while (!stopping) {
    try {
      const done = new Date(Date.now() - 60000).toISOString().slice(0, 16);   // the last COMPLETE minute
      if (done > reported) {
        const rows = await fetch(WRITER, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => []);
        const fresh = rows.filter((r) => r.minute > reported && r.minute <= done && r.name !== 'activity:log' && (r.changes >= 10 || r.errors > 0));   // trivial single-row writes are noise
        for (const r of fresh.sort((a, b) => b.changes - a.changes).slice(0, 8)) {
          logActivity('writer', `${r.caller.replace(/^siftersearch-/, '')}/${r.name} · ${fmt(r.batches)} batches · ${fmt(r.changes)} rows${r.errors ? ` · ${r.errors} errors` : ''} · ${(r.ms_total / 1000).toFixed(1)} s`);
        }
        reported = done;
      }
      const vectors = {};
      for (const c of ['phrases', 'paragraphs_kw', 'hype', 'concepts']) {
        const n = await fetch(`${QD}/collections/${c}`, { headers: { 'api-key': process.env.QDRANT_KEY || '' }, signal: AbortSignal.timeout(5000) })
          .then((r) => r.json()).then((j) => j?.result?.points_count).catch(() => null);
        if (n == null) continue;
        vectors[c] = n;
        if (tick % 2 === 0 && last[c] != null && n !== last[c]) logActivity('qdrant', `${c} ${n > last[c] ? '+' : '−'}${fmt(Math.abs(n - last[c]))} points · ${fmt(n)} total`);
        if (tick % 2 === 0) last[c] = n;
      }
      tick++;
      // the pulse row the home page polls (migration 154): I/O over a 1.5 s sample, load, vectors, writer rows/min
      const { ioBetween } = await import('../lib/system-health.js');
      const { readFileSync } = await import('fs');
      let io = {};
      try { const a = readFileSync('/proc/diskstats', 'utf8'); await new Promise((r) => setTimeout(r, 1500)); io = ioBetween(a, readFileSync('/proc/diskstats', 'utf8'), 1500); } catch { /* not Linux */ }
      const minute = new Date(Date.now() - 60000).toISOString().slice(0, 16);
      const wrows = await fetch(WRITER, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => []);
      const writer = wrows.filter((r) => r.minute >= minute && r.name !== 'activity:log').reduce((a, r) => ({ rows: a.rows + r.changes, batches: a.batches + r.batches }), { rows: 0, batches: 0 });
      const os = await import('os');
      const [load1] = os.loadavg();
      const tel = await import('../lib/repos/telemetry-repo.js');
      // jobs from here, every 15 s — the 5-minute snapshot missed a job re-queued by a restart and the page said "idle"
      const { shapeJobs } = await import('../lib/telemetry.js');
      const live = await tel.liveJobs().catch(() => []);
      const jobs = { running: shapeJobs(live.filter((j) => j.status === 'running')).running, queued: live.filter((j) => j.status === 'queued').length,
        queued_names: [...new Set(live.filter((j) => j.status === 'queued').map((j) => j.name))] };
      await tel.savePulse(Math.floor(Date.now() / 1000), { io, vectors, writer, jobs, cpu: { load_pct: Math.round((load1 / os.cpus().length) * 100) } });
    } catch (err) { logger.warn({ err: err.message }, 'pulse failed'); }
    await new Promise((r) => setTimeout(r, 15000));
  }
}
const laneNames = Object.values(LANES).flat();
// OPS_ONLY="a,b": a second worker process that runs ONLY these jobs (10-12: carry runs waited hours behind a slow batch;
// a separate process starts them without restarting — and killing mid-book — the main worker). Claims are atomic.
const ONLY = String(process.env.OPS_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
if (ONLY.length) await lane(`only:${ONLY.join('+')}`, ONLY, []);
else await Promise.all([lane('main', [], laneNames), ...Object.entries(LANES).flatMap(([n, names]) => Array.from({ length: Math.max(1, LANE_WORKERS[n] || 1) }, (_, k) => lane(k ? `${n}#${k + 1}` : n, names, []))), rollingCoverage(), keywordLoop(), telemetryLoop(), pulseLoop()]);
process.exit(0);
