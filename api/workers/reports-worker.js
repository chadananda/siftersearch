// siftersearch-reports — runs queued ops reports (api/lib/ops/reports.js) one at a time at low OS priority, so whole-table
// scans never run inside the API or compete with each other. Results → ops_report_runs (writes go through the writer).
// Deps: ops-report-repo, ops/reports, logger.
import os from 'os';
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { claimNext, finish, requeueStale } from '../lib/repos/ops-report-repo.js';
import { REPORTS, HEAVY, LANES, inQuietWindow } from '../lib/ops/reports.js';

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
    // heavy work waits for the overnight window; everything else runs now (paced jobs throttle themselves)
    const skip = [...skipAlways, ...(inQuietWindow() ? [] : [...HEAVY])];
    const run = await claimNext({ only, skip }).catch((err) => { logger.warn({ err: err.message, lane: name }, 'reports: claim failed'); return null; });
    if (!run) { await new Promise((r) => setTimeout(r, IDLE_MS)); continue; }
    const t0 = Date.now();
    try {
      const fn = REPORTS[run.name];
      if (!fn) throw new Error(`unknown report "${run.name}"`);
      const result = await fn(run.params || {});
      await finish(run.id, { result, ms: Date.now() - t0 });
      logger.info({ id: run.id, name: run.name, lane: name, ms: Date.now() - t0 }, 'report done');
    } catch (err) {
      await finish(run.id, { error: String(err.message || err).slice(0, 500), ms: Date.now() - t0 }).catch(() => {});
      logger.error({ id: run.id, name: run.name, lane: name, err: err.message }, 'report failed');
    }
  }
}
const laneNames = Object.values(LANES).flat();
// OPS_ONLY="a,b": a second worker process that runs ONLY these jobs (10-12: carry runs waited hours behind a slow batch;
// a separate process starts them without restarting — and killing mid-book — the main worker). Claims are atomic.
const ONLY = String(process.env.OPS_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
if (ONLY.length) await lane(`only:${ONLY.join('+')}`, ONLY, []);
else await Promise.all([lane('main', [], laneNames), ...Object.entries(LANES).map(([n, names]) => lane(n, names, []))]);
process.exit(0);
