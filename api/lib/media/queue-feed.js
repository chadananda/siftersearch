// Tower ↔ edge job queue (worker/queue, Chad 10-30). FEED keeps ~2.5 h of whole talks queued for the machines actually engaged (their measured
// ability, from /_q/capacity), staged by file id; PULL fetches finished results by job id, adopts them exactly like a home whole result, then acks
// (the Worker deletes the staged input + results from R2). Runs in the background of the cloud lane loop (media-jobs.js); nothing is fed while
// no queue agent is engaged, so the ssh lanes keep every talk until a machine pulls. Deps injected for tests.
// KINDS: 'whole' (new import, input = the audio) and the remaster kinds restore|post|cleanup (input = the audio + transcript, job.json {post: cfg},
// result through restore-job.js's one intake). A kind is fed only while an engaged host advertises it (its `can`).
import { join } from 'node:path';
import { readFile, writeFile, rm, rename } from 'node:fs/promises';

export const TARGET_H = 2.5, LOW_H = 2;
export const jobIdFor = (itemId, sha, kind = 'whole') => `${kind}-${itemId}-${sha.slice(0, 12)}`;
const fileIdFor = (itemId, sha, kind = 'whole') => `${kind[0]}${itemId}-${sha.slice(0, 12)}`;
const readMetaFile = async (dir) => JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
export const kindOf = (st, id) => (st.items?.[id]?.kind === 'whole' ? 'whole' : st.items?.[id]?.mode || 'restore');
const restoreJob = () => import('./restore-job.js');

/** Stage one talk's inputs by file id → the queue job (no enqueue). */
async function stage(kind, it, m, { q, wr, rj, full }) {
  if (kind === 'whole') {
    const input = join(it.dir, m.original), sha = await wr.fileSha(input), fileId = fileIdFor(it.id, sha);
    const job = { ...wr.wholeJob(it, m, sha), threads: 4 }, jf = join(it.dir, '.queue-job.json');
    await writeFile(jf, JSON.stringify(job));
    const { bytes } = await q.put('files', fileId, job.input, input);
    await q.put('files', fileId, 'job.json', jf); await rm(jf, { force: true });
    return { sha, fileId, bytes };
  }
  const cfg = await rj.restoreCfg(it, m, { mode: kind, full }), sha = cfg.work_sha, fileId = fileIdFor(it.id, sha, kind);
  let bytes = 0;
  for (const [file, name] of rj.restoreInputs(it, m, kind)) bytes += (await q.put('files', fileId, name, file)).bytes || 0;
  const jf = join(it.dir, '.queue-job.json');
  await writeFile(jf, JSON.stringify({ post: cfg })); await q.put('files', fileId, 'job.json', jf); await rm(jf, { force: true });
  return { sha, fileId, bytes };
}

export async function feed(st, { q, repo, wr, rj, full = true, decided = () => false, readMeta = readMetaFile, now = Date.now, max = 20 }) {
  const cap = await q.capacity();
  if (!cap.hosts.length) return { fed: 0, why: 'no queue host engaged' };
  const can = new Set(cap.hosts.flatMap((h) => h.can || []));
  st.qjobs ||= {};
  let queuedS = cap.queued_audio_h * 3600;
  if (queuedS >= LOW_H * 3600 * cap.rate) return { fed: 0, queued_h: cap.queued_h };
  let fed = 0;
  while (queuedS < TARGET_H * 3600 * cap.rate && fed < max) {
    const i = st.queue.findIndex((id) => can.has(kindOf(st, id)));
    if (i < 0) break;
    const [itemId] = st.queue.splice(i, 1), kind = kindOf(st, itemId);
    try {
      const it = await repo.getMediaItem(itemId), m = await readMeta(it.dir);
      if (kind !== 'whole' && decided(m, itemId)) continue;
      const { sha, fileId, bytes } = await stage(kind, it, m, { q, wr, rj: rj || await restoreJob(), full }), id = jobIdFor(itemId, sha, kind);
      await q.enqueue([{ id, file_id: fileId, item_id: itemId, type: 'media', stages: [kind], invoice: { audio_s: m.duration_s || 0, bytes }, need: { ram_gb: 5 } }]);
      st.qjobs[id] = { itemId, slug: it.slug, sha, kind, audio_s: m.duration_s || 0, at: now() };
      queuedS += m.duration_s || 0; fed++;
    } catch (e) { st.queue.push(itemId); return { fed, error: `#${itemId}: ${e.message}`.slice(0, 300) }; }   // to the back: one bad talk never blocks the feed
  }
  return { fed, queued_h: cap.rate ? queuedS / cap.rate / 3600 : null };
}

/** A restore-kind result → <talk>/enhanced/pod through the one intake (refused by name otherwise); done.json → enhanced/unipase.done.json. */
async function adoptRestore(j, it, rj, q) {
  const enh = join(it.dir, 'enhanced'), stg = join(enh, 'pod-stage');
  await rm(stg, { recursive: true, force: true });
  for (const o of j.result?.outputs || []) await q.get('results', j.id, o.name, join(stg, o.name.replace(/^post\//, '')));
  await rj.adoptRestoreResult(it.dir, stg);
  await rename(join(enh, 'pod', 'done.json'), join(enh, 'unipase.done.json'));
  // the raw AI copy stays with the worker; tower keeps placeholders like the home lane
  await writeFile(join(enh, 'unipase.cloud.flac'), ''); await writeFile(join(enh, 'unipase.asr.json'), '{}');
  return JSON.parse(await readFile(join(enh, 'unipase.done.json'), 'utf8'));
}

export async function pull(st, { q, repo, wr, rj, remaster = async () => {}, readMeta = readMetaFile, now = Date.now }) {
  st.qjobs ||= {};
  const ack = [];
  let adopted = 0, errors = 0;
  for (const j of await q.listDone(20)) {
    const qj = st.qjobs[j.id];
    if (!qj) continue;   // not ours (a smoke test, another caller)
    try {
      if (qj.kind && qj.kind !== 'whole') {
        const it = await repo.getMediaItem(qj.itemId), dj = await adoptRestore(j, it, rj || await restoreJob(), q);
        if (!st.done.some((d) => d.id === it.id)) {   // a duplicate result never double-publishes
          st.done.push({ id: it.id, slug: it.slug, mode: qj.kind, audio_s: dj.audio_s ?? qj.audio_s, seconds: dj.seconds, gpu: j.host, pod: j.host, at: now(), via: 'queue' });
          await remaster(it.id);
        }
        adopted++; ack.push(j.id); delete st.qjobs[j.id]; continue;
      }
      const it = await repo.getMediaItem(qj.itemId), m = await readMeta(it.dir), staging = join(it.dir, '.whole-worker');
      await rm(staging, { recursive: true, force: true });
      for (const o of j.result?.outputs || []) await q.get('results', j.id, o.name, join(staging, o.name));
      const completed = await wr.adoptWholeResult(staging, it.dir, m, qj.sha, it.id);
      if (['whole_queued', 'scheduled', 'queued', 'running'].includes((await repo.getMediaItem(it.id))?.state))
        await repo.updateMediaItem(it.id, { state: 'transcribed', stage: null, stages_done: ',' + Object.keys(completed.stages || {}).join(',') + ',' });
      st.done.push({ id: it.id, slug: it.slug, mode: 'whole', audio_s: qj.audio_s, gpu: j.host, pod: j.host, at: now(), via: 'queue' });
      adopted++;
    } catch (e) { errors++; await retry(st, qj, `queue result from ${j.host}: ${e.message}`, repo); }
    ack.push(j.id); delete st.qjobs[j.id];
  }
  for (const f of (await q.stats()).failed || []) {   // the queue gave up after its 3 attempts
    const qj = st.qjobs[f.id];
    if (!qj) continue;
    await retry(st, qj, `queue: ${f.error}`, repo); ack.push(f.id); delete st.qjobs[f.id];
  }
  if (ack.length) await q.ack(ack);
  return { adopted, errors, acked: ack.length };
}
// a talk whose queue job failed goes back to tower's lane once (ssh hosts/pods), then is recorded failed
async function retry(st, qj, error, repo) {
  st.attempts ||= {};
  st.attempts[qj.itemId] = (st.attempts[qj.itemId] || 0) + 1;
  if (st.attempts[qj.itemId] < 2) { st.queue.push(qj.itemId); return; }
  (st.failed ||= []).push({ id: qj.itemId, error: error.slice(0, 400) });
  if ((qj.kind || 'whole') === 'whole') await repo.updateMediaItem(qj.itemId, { state: 'failed', why: error.slice(0, 500) });   // a failed remaster leaves the talk as it was
}

/** One background pass: pull first (frees R2 + gives back failures), then top the window up. */
export async function tick(st, deps) {
  const out = { pulled: await pull(st, deps) };
  out.fed = await feed(st, deps);
  out.leased = {}; out.beat = {};   // jobs each agent holds (machine cards) + its latest heartbeat (an agent pod is alive while it beats: media-jobs.js)
  for (const j of (await Promise.resolve().then(() => deps.q.stats()).catch(() => null))?.leased || []) {
    out.leased[j.host] = (out.leased[j.host] || 0) + 1;
    out.beat[j.host] = Math.max(out.beat[j.host] || 0, j.updated || 0);
  }
  return out;
}
