// ONE OPS SERVICE (docs/architecture/continuous-deploy.md — macro-services: reports, indexer, carry). Runs queued ops jobs
// from ITS registry in ITS lanes at low OS priority, writes through the writer. Shared by every ops service so each is
// only a registry + lanes + its own loops: drains on SIGHUP (finishes the jobs in hand, claims nothing new, exits 0 →
// pm2 restarts on the new code), heartbeats what it is doing, and on start requeues only ITS OWN interrupted jobs (one
// service restarting must never requeue — and so double-run — another's live job). Deps: ops-report-repo, drain, heartbeat.
import os from 'os';
import { logger } from '../logger.js';
import { claimNext, finish, requeueStale, saveResume } from '../repos/ops-report-repo.js';
import { sendEmail } from '../../services/email.js';
import { logActivity } from '../repos/activity-repo.js';
import { drainOnSignals, isDraining, nap } from '../drain.js';
import { startHeartbeat } from '../service-heartbeat.js';

const IDLE_MS = 15_000;

// A job that FAILS or STOPS SHORT (budget cap, monthly cap) is mailed at once (10-16: a phrase run stopped at its $20 cap
// and went unnoticed for 11 hours; Chad: "you were supposed to be watching it closely"). Never throws.
async function alert(run, what, detail) {
  const to = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
  if (!to) return;
  await sendEmail({ to, subject: `SifterSearch ops: ${run.name} #${run.id} ${what}`,
    text: `${run.name} #${run.id} ${what}.\n\n${detail}\n\nParams: ${JSON.stringify(run.params || {}).slice(0, 400)}` })
    .catch((err) => logger.warn({ err: err.message, id: run.id }, 'ops: alert mail failed'));
}
export const stoppedShort = (result) => { const s = JSON.stringify(result || {}); return /"phase":"stopped"/.test(s) ? (s.match(/"reason":"([^"]+)"/)?.[1] || 'stopped early') : null; };

/**
 * service: name · registry {job: fn} · lanes {lane: [jobs]} · laneWorkers {lane: n} · main: also run a catch-all lane for
 * registry jobs in no lane (skipping `foreign`, jobs another service owns) · only: run nothing but these jobs ·
 * loops: [async fns run beside the lanes — they loop while !isDraining()].
 */
export async function runService({ name, registry, lanes = {}, laneWorkers = {}, main = false, foreign = [], only = [], loops = [] }) {
  try { os.setPriority(19); } catch { /* not permitted — runs at normal priority */ }
  drainOnSignals((sig) => logger.info({ sig, service: name }, 'draining — finishing the jobs in hand, claiming nothing new'));
  const inHand = new Map();
  startHeartbeat({ name, state: () => ({ inflight: inHand.size, doing: [...inHand.values()] }) });

  const laneNames = Object.values(lanes).flat();
  const mine = only.length ? only : Object.keys(registry).filter((j) => !foreign.includes(j));
  // requeue only MY interrupted jobs ('running' = its process died); never another service's live ones
  await requeueStale({ only: mine }).catch((err) => logger.warn({ err: err.message, service: name }, 'ops: requeue failed'));
  logger.info({ service: name, jobs: mine.length, lanes: Object.keys(lanes) }, 'ops service started');

  async function lane(laneName, onlyJobs, skip) {
    while (!isDraining()) {
      // no time-of-day gate (10-14): every job runs when claimed; heavy ones are serialised in their own lane and paced
      const run = await claimNext({ only: onlyJobs, skip }).catch((err) => { logger.warn({ err: err.message, lane: laneName }, 'ops: claim failed'); return null; });
      if (!run) { await nap(IDLE_MS); continue; }
      const t0 = Date.now();
      inHand.set(laneName, `${run.name} #${run.id}`);
      const what = (() => { const p = run.params || {}; return p.budgetKey || p.field || (p.docs?.length ? `${p.docs.length} documents` : p.ids?.length ? `${p.ids.length} documents` : ''); })();
      logActivity('job', `▶ ${run.name}${what ? ` · ${what}` : ''} · #${run.id} started`);
      try {
        const fn = registry[run.name];
        if (!fn) throw new Error(`unknown report "${run.name}"`);
        const result = await fn(run.params || {});
        // A RESUMABLE long job YIELDS at a safe point when the service drains (10-19: a multi-hour paragraph-authors run held
        // the whole reports service — every lane, the Phelps ingest included — in 'draining' until it ended). The run stays
        // 'running', so the next start's requeueStale() puts it back and it resumes on the new code.
        // A job that returns `resume` (params for where it stopped) continues there, not from the start (10-20: stamp-voices
        // held the indexer in 'draining' for hours, and a plain requeue would have redone every window).
        if (result?.yielded && isDraining() && result.resume) await saveResume(run.id, { ...(run.params || {}), ...result.resume }).catch((err) => logger.warn({ id: run.id, err: err.message }, 'ops: resume point not saved'));
        if (result?.yielded && isDraining()) { logger.info({ id: run.id, name: run.name, lane: laneName }, 'job yielded to the drain — requeued on next start'); logActivity('job', `⏸ ${run.name} · #${run.id} yielded to an update — resumes after restart`); break; }
        await finish(run.id, { result, ms: Date.now() - t0 });
        logger.info({ id: run.id, name: run.name, lane: laneName, ms: Date.now() - t0 }, 'report done');
        const short = stoppedShort(result);
        logActivity('job', `${short ? '■' : '✓'} ${run.name}${what ? ` · ${what}` : ''} · #${run.id} ${short ? `stopped: ${short}` : 'done'} · ${Math.round((Date.now() - t0) / 1000)} s`);
        if (short) await alert(run, 'stopped short', `Reason: ${short}\nIt is not finished: raise the cap and re-queue it to continue (finished work is kept).`);
      } catch (err) {
        // A hard stop kills the job's child process (indexer) before this process exits: that is NOT a failure. Leave the
        // run 'running' so requeueStale() puts it back on the next start (10-15: five phrase runs were marked failed by
        // restarts). The child's death can reach us before our own signal does: a killed child ("exit null") waits for it.
        if (!isDraining() && /exit null|SIGTERM|SIGINT|SIGKILL/.test(String(err.message))) await new Promise((r) => setTimeout(r, 2000));
        if (isDraining() && /exit null|SIGTERM|SIGINT|SIGKILL/.test(String(err.message))) { logger.warn({ id: run.id, name: run.name, lane: laneName }, 'job interrupted by shutdown — requeued on next start'); break; }
        await finish(run.id, { error: String(err.message || err).slice(0, 500), ms: Date.now() - t0 }).catch(() => {});
        await alert(run, 'FAILED', String(err.message || err).slice(0, 1500));
        logActivity('job', `✗ ${run.name} · #${run.id} failed`);
        logger.error({ id: run.id, name: run.name, lane: laneName, err: err.message }, 'report failed');
      } finally { inHand.delete(laneName); }
    }
  }

  const workers = only.length
    ? [lane(`only:${only.join('+')}`, only, [])]
    : [...(main ? [lane('main', [], [...laneNames, ...foreign])] : []),
      ...Object.entries(lanes).flatMap(([n, names]) => Array.from({ length: Math.max(1, laneWorkers[n] || 1) }, (_, k) => lane(k ? `${n}#${k + 1}` : n, names, [])))];
  await Promise.all([...workers, ...loops.map((loop) => loop().catch((err) => logger.error({ err: err.message, service: name }, 'ops: loop crashed')))]);
  logger.info({ service: name }, 'ops service drained — exiting for the new code');
  process.exit(0);
}
