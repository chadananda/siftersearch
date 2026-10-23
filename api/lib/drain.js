// DRAIN — a queued update for a queue/loop worker (docs/architecture/continuous-deploy.md; Chad 10-19: "the system will not
// take up new tasks if an update is queued but first update and restart as soon as all tasks are cleared"). The updater
// sends SIGHUP: loops stop claiming work, sleeping loops wake (nap), the work in hand finishes, the process exits 0 and
// pm2 starts it again on the new code. SIGINT/SIGTERM (pm2 stop/restart) drain the same way. No deps.
let draining = false;
let reason = null;
let since = null;   // when the drain began (ms) — a drain held for long is a stuck job (system-checks warns)
const wakers = new Set();

export const isDraining = () => draining;
export const drainReason = () => reason;
export const drainSince = () => since;

/** Begin draining (idempotent): every nap() resolves now. */
export function startDrain(why = 'drain') {
  if (draining) return;
  draining = true; reason = why; since = Date.now();
  for (const wake of wakers) wake();
  wakers.clear();
}

/** setTimeout that a drain cuts short — a loop sleeping 30 minutes must not hold a deploy for 30 minutes. */
export const nap = (ms) => new Promise((resolve) => {
  if (draining) return resolve();
  const done = () => { clearTimeout(t); wakers.delete(done); resolve(); };
  const t = setTimeout(done, ms);
  wakers.add(done);
});

/** SIGHUP = drain for an update; SIGINT/SIGTERM = drain for a stop. onDrain(reason) runs once. */
export function drainOnSignals(onDrain = () => {}) {
  for (const sig of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(sig, () => { const first = !draining; startDrain(sig); if (first) onDrain(sig); });
}
