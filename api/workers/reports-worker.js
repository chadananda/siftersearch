// siftersearch-reports (and siftersearch-reports-carry) — the OPS macro-service: queued ops jobs (api/lib/ops/reports.js)
// in their lanes, plus the loops that feed them (telemetry, activity pulse, Dewey's scout pulse, OCR self-healing). The
// shared machinery — drain, heartbeat, own-job requeue, lanes, alerts — is api/lib/ops/service-worker.js. Indexing is
// its own service (api/workers/indexer-worker.js): this worker never claims an indexing job. Deps: reports, service-worker.
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { REPORTS, LANES, LANE_WORKERS, INDEX_JOB_NAMES, MEDIA_JOBS } from '../lib/ops/reports.js';
import { logActivity } from '../lib/repos/activity-repo.js';
import { isDraining, nap } from '../lib/drain.js';
import { runService } from '../lib/ops/service-worker.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });


// Library telemetry for the home-page Observatory: one snapshot every 5 minutes (api/lib/telemetry.js); 7 days kept.
async function telemetryLoop() {
  const { buildSnapshot, seriesOf } = await import('../lib/telemetry.js');
  const repo = await import('../lib/repos/telemetry-repo.js');
  const fmt = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
  while (!isDraining()) {
    try {
      const snap = await buildSnapshot();
      await repo.saveSnapshot(snap.at, snap, seriesOf(snap));
      await repo.pruneSnapshots();
      const v = snap.vectors || {}, h = snap.health;
      logActivity('telemetry', `snapshot · ${fmt(snap.corpus.paragraphs)} ¶ · phrase ${fmt(v.phrases)} · hype ${fmt(v.hype)} · concepts ${fmt(v.concepts)}${h ? ` · load ${h.cpu.load_pct}% · tank ${h.storage.find((s) => s.dev === 'sdc')?.io?.busy_pct ?? '—'}% busy` : ''}`);
    } catch (err) { logger.warn({ err: err.message }, 'telemetry: snapshot failed'); }
    await nap(5 * 60_000);
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
  while (!isDraining()) {
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
    await nap(15000);
  }
}

// OCR self-healing (10-18): restarts dropped in-flight OCR jobs and 71 items sat at needs-ocr with five jobs queued. Every
// 10 minutes each item waiting at OCR gets its job (enqueue dedupes a queued/running twin; a resumed job polls, never pays twice).
// Dewey's DAILY PULSE (dewey-scout-job.js pulsePlan): after 06:00 UTC, once a day, the scouts' runs are queued in the scout
// lane. State (which bahai-library collection, which tradition next, the last run) in $DEWEY_DIR/scout-pulse.json.
async function scoutPulse() {
  const { pulsePlan } = await import('../lib/ops/dewey-scout-job.js');
  const { enqueue, getRun } = await import('../lib/repos/ops-report-repo.js');
  const { deweyDir } = await import('../lib/dewey/research.js');
  const { readFile, writeFile, mkdir } = await import('fs/promises');
  const f = `${deweyDir()}/scout-pulse.json`;
  while (!isDraining()) {
    try {
      const now = new Date();
      if (process.env.DEWEY_PULSE !== 'off' && now.getUTCHours() >= 6) {
        const st = await readFile(f, 'utf8').then(JSON.parse).catch(() => ({}));
        const last = st.lastBahaiRun ? await getRun(st.lastBahaiRun).catch(() => null) : null;
        const { runs, state } = pulsePlan(st, { today: now.toISOString().slice(0, 10), lastBahaiResult: last?.result || null });
        if (runs.length) {
          const ids = [];
          for (const r of runs) ids.push((await enqueue('dewey-scout', r, 'scout-pulse')).id);
          await mkdir(deweyDir(), { recursive: true });
          await writeFile(f, JSON.stringify({ ...state, lastBahaiRun: ids[0], runs: ids }, null, 1));
        }
      }
    } catch { /* next half hour */ }
    await nap(1_800_000);
  }
}


async function ocrLoop() {
  const { listItems } = await import('../lib/repos/dewey-repo.js');
  const { enqueue, pendingRuns } = await import('../lib/repos/ops-report-repo.js');
  const { slpEnabled } = await import('../lib/dewey/searchlayer.js');
  while (!isDraining()) {
    if (slpEnabled()) {
      const waiting = await listItems({ state: 'needs-ocr', limit: 1000 }).catch(() => []);
      // an item already on its way (a Review answer queues it with priority — different params, so enqueue's own dedupe
      // missed it, 10-18: four items queued twice) is not queued again
      const onWay = new Set((await pendingRuns('dewey-ocr').catch(() => [])).map((r) => Number(r.params?.id)));
      for (const i of waiting) if (!onWay.has(i.id)) await enqueue('dewey-ocr', { id: i.id }, 'ocr-loop').catch(() => {});
    }
    await nap(600_000);
  }
}

// OPS_ONLY="a,b": a second worker process that runs ONLY these jobs (10-12: carry runs waited hours behind a slow batch;
// a separate process starts them without restarting — and killing mid-book — the main worker). Claims are atomic.
const ONLY = String(process.env.OPS_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const CARRY = ['reingest-carry'];   // siftersearch-reports-carry's jobs (and MEDIA_JOBS, siftersearch-media's) — the main worker never claims (or requeues) them
// the media service also watches Dewey's media drop folder (a dropped file starts the pipeline with no other step)
async function mediaDropLoop() {
  const { mediaDropPass } = await import('../lib/ops/media-jobs.js');
  while (!isDraining()) {
    try { const r = await mediaDropPass(); if (r.queued) logger.info(r, 'media drop folder: new files — media-scan queued'); }
    catch (err) { logger.warn({ err: err.message }, 'media drop folder pass failed'); }
    await nap(5 * 60_000);
  }
}
if (ONLY.length) await runService({ name: process.env.name || 'siftersearch-reports-carry', registry: REPORTS, only: ONLY, loops: ONLY.includes('media-scan') ? [mediaDropLoop] : [] });
else await runService({ name: process.env.name || 'siftersearch-reports', registry: REPORTS, lanes: LANES, laneWorkers: LANE_WORKERS,
  main: true, foreign: [...INDEX_JOB_NAMES, ...CARRY, ...MEDIA_JOBS], loops: [telemetryLoop, pulseLoop, scoutPulse, ocrLoop] });
