// Tower ↔ edge job queue (worker/queue, Chad 10-30). FEED keeps ~2.5 h of whole talks queued for the machines actually engaged (their measured
// ability, from /_q/capacity), staged by file id; PULL fetches finished results by job id, adopts them exactly like a home whole result, then acks
// (the Worker deletes the staged input + results from R2). Runs in the background of the cloud lane loop (media-jobs.js); nothing is fed while
// no queue agent is engaged, so the ssh lanes keep every talk until a machine pulls. Deps injected for tests.
import { join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';

export const TARGET_H = 2.5, LOW_H = 2;
export const jobIdFor = (itemId, sha) => `whole-${itemId}-${sha.slice(0, 12)}`;
const fileIdFor = (itemId, sha) => `w${itemId}-${sha.slice(0, 12)}`;
const readMetaFile = async (dir) => JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));

export async function feed(st, { q, repo, wr, readMeta = readMetaFile, now = Date.now, max = 20 }) {
  const cap = await q.capacity();
  if (!cap.hosts.length) return { fed: 0, why: 'no queue host engaged' };
  st.qjobs ||= {};
  let queuedS = cap.queued_audio_h * 3600;
  if (queuedS >= LOW_H * 3600 * cap.rate) return { fed: 0, queued_h: cap.queued_h };
  let fed = 0;
  while (queuedS < TARGET_H * 3600 * cap.rate && fed < max) {
    const i = st.queue.findIndex((id) => st.items?.[id]?.kind === 'whole');
    if (i < 0) break;
    const [itemId] = st.queue.splice(i, 1);
    try {
      const it = await repo.getMediaItem(itemId), m = await readMeta(it.dir);
      const input = join(it.dir, m.original), sha = await wr.fileSha(input), id = jobIdFor(itemId, sha), fileId = fileIdFor(itemId, sha);
      const job = { ...wr.wholeJob(it, m, sha), threads: 4 }, jf = join(it.dir, '.queue-job.json');
      await writeFile(jf, JSON.stringify(job));
      const { bytes } = await q.put('files', fileId, job.input, input);
      await q.put('files', fileId, 'job.json', jf); await rm(jf, { force: true });
      await q.enqueue([{ id, file_id: fileId, item_id: itemId, type: 'media', stages: ['whole'], invoice: { audio_s: m.duration_s || 0, bytes }, need: { ram_gb: 5 } }]);
      st.qjobs[id] = { itemId, slug: it.slug, sha, audio_s: m.duration_s || 0, at: now() };
      queuedS += m.duration_s || 0; fed++;
    } catch (e) { st.queue.push(itemId); return { fed, error: `#${itemId}: ${e.message}`.slice(0, 300) }; }   // to the back: one bad talk never blocks the feed
  }
  return { fed, queued_h: cap.rate ? queuedS / cap.rate / 3600 : null };
}

export async function pull(st, { q, repo, wr, readMeta = readMetaFile, now = Date.now }) {
  st.qjobs ||= {};
  const ack = [];
  let adopted = 0, errors = 0;
  for (const j of await q.listDone(20)) {
    const qj = st.qjobs[j.id];
    if (!qj) continue;   // not ours (a smoke test, another caller)
    try {
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
  await repo.updateMediaItem(qj.itemId, { state: 'failed', why: error.slice(0, 500) });
}

/** One background pass: pull first (frees R2 + gives back failures), then top the window up. */
export async function tick(st, deps) {
  const out = { pulled: await pull(st, deps) };
  out.fed = await feed(st, deps);
  return out;
}
