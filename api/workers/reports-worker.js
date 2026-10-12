// siftersearch-reports — runs queued ops reports (api/lib/ops/reports.js) one at a time at low OS priority, so whole-table
// scans never run inside the API or compete with each other. Results → ops_report_runs (writes go through the writer).
// Deps: ops-report-repo, ops/reports, logger.
import os from 'os';
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { claimNext, finish, requeueStale } from '../lib/repos/ops-report-repo.js';
import { REPORTS, HEAVY, inQuietWindow } from '../lib/ops/reports.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
try { os.setPriority(19); } catch { /* not permitted — runs at normal priority */ }
const IDLE_MS = 15_000;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

await requeueStale().catch((err) => logger.warn({ err: err.message }, 'reports: requeue failed'));
logger.info({ reports: Object.keys(REPORTS) }, 'Reports worker started');
while (!stopping) {
  // heavy scans wait for the 02:00–06:00 window; everything else runs now (paced jobs throttle themselves)
  const run = await claimNext({ skip: inQuietWindow() ? [] : [...HEAVY] }).catch((err) => { logger.warn({ err: err.message }, 'reports: claim failed'); return null; });
  if (!run) { await new Promise((r) => setTimeout(r, IDLE_MS)); continue; }
  const t0 = Date.now();
  try {
    const fn = REPORTS[run.name];
    if (!fn) throw new Error(`unknown report "${run.name}"`);
    const result = await fn(run.params || {});
    await finish(run.id, { result, ms: Date.now() - t0 });
    logger.info({ id: run.id, name: run.name, ms: Date.now() - t0 }, 'report done');
  } catch (err) {
    await finish(run.id, { error: String(err.message || err).slice(0, 500), ms: Date.now() - t0 }).catch(() => {});
    logger.error({ id: run.id, name: run.name, err: err.message }, 'report failed');
  }
}
process.exit(0);
