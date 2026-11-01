// archive-reprobe ops job: run the current worker probe (fingerprint + body.md, intake_sample.py) over every book/document already catalogued on a drive — books first, then scans —
// on home workers via the same LAN 'intake' queue as archive-sample (it reuses samplePass: stage, pull, fingerprint → collection.db, md/<id>.md). Idempotent and resumable: a file whose collection
// row already has its fingerprint is skipped, a staged one carries metadata.reprobe, so a rerun (or a drain: the run requeues itself) continues where it stopped. The earlier probe stays on the
// item until the new result replaces it; a failure is recorded as metadata.reprobe.error (params.redo retries those). params { drive, window?, minutes?, redo? }. Lane 'archive'.
import { getDrive, itemsToReprobe, setReprobe, setProbe } from '../repos/archives-repo.js';
import { fingerprintedPaths } from '../repos/collection-repo.js';
import { samplePass } from './archive-sample-job.js';

/** The next `limit` items to probe: books before scans, best score first; files already fingerprinted are marked skipped (never offered again). */
export async function nextToReprobe(driveId, { limit, redo = false, select = itemsToReprobe, mark = setReprobe, done = fingerprintedPaths }) {
  const have = done(driveId), out = [];
  for (const kind of ['book', 'scan']) {
    for (;;) {
      const page = await select(driveId, { kind, limit: Math.max(limit, 50), redo });
      if (!page.length) break;
      let skipped = 0;
      for (const it of page) {
        if (have.has(it.primary_rel)) { await mark(it.id, { skipped: 'fingerprinted', at: new Date().toISOString() }); skipped++; } else if (out.length < limit && !out.some((o) => o.id === it.id)) out.push(it);
      }
      if (out.length >= limit || !skipped) break;   // a page with no skips left everything it had to the staging window
    }
    if (out.length >= limit) break;
  }
  return out;
}

export async function archiveReprobeJob({ drive, window = 24, minutes = 20, redo = false, round = 1 } = {}, deps = {}) {
  if (!drive) throw new Error('archive-reprobe needs drive');
  const d = await (deps.getDrive || getDrive)(drive);
  if (!d?.root) throw new Error(`no drive ${drive}`);
  const { r2StageStore } = await import('../media/r2-stage.js');
  const q = deps.q || (await import('../repos/media-queue-repo.js')).localQueue();
  const store = deps.store !== undefined ? deps.store : await r2StageStore();
  const mark = deps.mark || setReprobe, save = deps.save || setProbe;
  const draining = deps.draining || (await import('../drain.js')).isDraining, nap = deps.nap || ((ms) => new Promise((r) => setTimeout(r, ms)));
  // the pass saves three kinds of probe record: a result (has a class) replaces the probe; a queued/failed marker goes to metadata.reprobe and never overwrites the earlier probe
  const probeSave = (id, p) => (p.class ? save(id, p) : p.queued ? mark(id, { queued: p.queued }) : mark(id, { error: p.error, at: p.at }));
  const toProbe = (_d, { limit }) => nextToReprobe(drive, { limit, redo, select: deps.select, mark, done: deps.done });
  const total = { drive, round, passes: 0, pulled: 0, failed: 0, probed: 0, probes_staged: 0, errors: {} };
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    const p = await samplePass({ drive, window, deps: { ...deps, q, store, drive: d, probeSave, toProbe, toSample: async () => [], wanting: async () => [] } });
    total.passes++;
    for (const k of ['pulled', 'failed', 'probed', 'probes_staged']) total[k] += p[k];
    for (const [k, v] of Object.entries(p.errors)) total.errors[k] = (total.errors[k] || 0) + v;
    if (draining() || Date.now() >= until) break;
    await nap(60_000);
  }
  const st = await q.stats('intake'), inFlight = (st?.states?.queued?.n || 0) + (st?.states?.leased?.n || 0) + (st?.states?.done?.n || 0);
  total.in_flight = inFlight;
  total.remaining = (await toProbe(d, { limit: 1 })).length;
  if ((inFlight || total.remaining) && !deps.noRequeue) await (deps.requeue || (async (p) => (await import('../repos/ops-report-repo.js')).enqueue('archive-reprobe', p, 'archive-reprobe')))({ drive, window, minutes, redo, round: round + 1 });
  return total;
}
