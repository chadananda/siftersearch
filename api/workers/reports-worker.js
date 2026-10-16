// siftersearch-reports — runs queued ops reports (api/lib/ops/reports.js) one at a time at low OS priority, so whole-table
// scans never run inside the API or compete with each other. Results → ops_report_runs (writes go through the writer).
// Deps: ops-report-repo, ops/reports, logger.
import os from 'os';
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { claimNext, finish, requeueStale } from '../lib/repos/ops-report-repo.js';
import { REPORTS, LANES } from '../lib/ops/reports.js';
import { sendEmail } from '../services/email.js';

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
    try {
      const fn = REPORTS[run.name];
      if (!fn) throw new Error(`unknown report "${run.name}"`);
      const result = await fn(run.params || {});
      await finish(run.id, { result, ms: Date.now() - t0 });
      logger.info({ id: run.id, name: run.name, lane: name, ms: Date.now() - t0 }, 'report done');
      const short = stoppedShort(result);
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
