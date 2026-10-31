// Tower ↔ edge job queue (worker/queue, Chad 10-30). FEED keeps ~2.5 h of whole talks queued for the machines actually engaged (their measured
// ability, from /_q/capacity), staged by file id; PULL fetches finished results by job id, adopts them exactly like a home whole result, then acks
// (the Worker deletes the staged input + results from R2). Runs in the background of the cloud lane loop (media-jobs.js); nothing is fed while
// no queue agent is engaged, so the ssh lanes keep every talk until a machine pulls. Deps injected for tests.
// KINDS: 'whole' (new import, input = the audio) and the remaster kinds restore|post|cleanup (input = the audio + transcript, job.json {post: cfg},
// result through restore-job.js's one intake). A kind is fed only while an engaged host advertises it (its `can`).
// TYPED (stage-queue §2, deps.typed = the LAN queue): a share (MEDIA_TYPED_FRACTION) of whole talks runs as cpu-prep -> gpu -> cpu-finish;
// each step is validated (stage-jobs.js) and the next job takes its outputs from the results store, so a step is acked only once the step
// after it has finished; cpu-finish lands through the whole intake and stamps tool/settings/fp per stage.
// deps.edge (the /_q client, set while pods boot typed: MEDIA_POD_TYPED=1): the gpu step overflows there (SJ.gpuRoute); tower copies the
// original + the previous step's files into the other queue's files/<file id>/ and acks each step on the queue that holds it.
import { join } from 'node:path';
import { readFile, writeFile, rm, rename, stat } from 'node:fs/promises';
import * as SJ from './stage-jobs.js';
import { decide } from './exclusions.js';
import { cbPerson, cbVerdict } from './cb-date.js';

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
  const cfg = await rj.restoreCfg(it, m, { mode: kind, full }), sha = cfg.words_key, fileId = fileIdFor(it.id, sha, kind);
  let bytes = 0;
  for (const [file, name] of rj.restoreInputs(it, m, kind)) bytes += (await q.put('files', fileId, name, file)).bytes || 0;
  const jf = join(it.dir, '.queue-job.json');
  await writeFile(jf, JSON.stringify({ post: cfg })); await q.put('files', fileId, 'job.json', jf); await rm(jf, { force: true });
  return { sha, fileId, bytes };
}

// a rented pod that delivered a talk proves the pool, as on the ssh lane (10-31: pod 374 delivered 3 via the queue and the lane stayed at 1 canary)
const provePool = (st, host) => { if (String(host).startsWith('pod-')) { st.proven = true; st.boot_fails = 0; } };

let peopleMemo = null;
const speakerPeople = () => (peopleMemo ||= import('../ops/media-jobs.js').then((x) => x.loadSpeakerPeople()).catch(() => []));
/** The speaker gates item.js runs before any stage (exclusions; Covenant-breaker by date), applied BEFORE a talk goes to a worker. A worker's
 *  catalogue is job-local, so the gate there only ended the job early ("cpu-prep: grade did not finish") and tower fed the talk again
 *  (10-31: 2614/2619 Stephen Hall, 2640/2641 Douglas Martin, newer-generation). → null | { state: 'excluded'|'review', why }. */
export async function speakerGate(it, m, { people = speakerPeople } = {}) {
  const ex = decide({ speakers: [m?.speaker, it?.speaker], title: m?.title || '', sourceTitle: m?.source?.title || '' })?.excluded;
  if (ex) return { state: 'excluded', why: ex.reason };
  const cbp = cbPerson(m?.speaker || it?.speaker, await people());
  if (!cbp) return null;
  const v = cbVerdict(cbp.cb_from, m?.date || m?.year || it?.year || null);
  if (v === 'include') return null;
  return v === 'exclude' ? { state: 'excluded', why: `covenant-breaker: recorded on or after ${cbp.cb_from} (${cbp.name})` }
    : { state: 'review', why: `review: ${cbp.name} talk with no recording date before/after ${cbp.cb_from} — Chad decides` };
}
/** Gate one talk before feeding: a gated talk gets its state on the catalogue and leaves the lane's queue (true). */
async function gated(it, m, repo, deps) {
  const g = await speakerGate(it, m, deps.cbPeople ? { people: deps.cbPeople } : {});
  if (!g) return false;
  await repo.updateMediaItem(it.id, { state: g.state, why: g.why.slice(0, 500) });
  return true;
}

export async function feed(st, deps) {
  const { q, repo, wr, rj, full = true, decided = () => false, readMeta = readMetaFile, now = Date.now, max = 20 } = deps;
  const cap = await q.capacity();
  if (!cap.hosts.length) return { fed: 0, why: 'no queue host engaged' };
  const can = new Set(cap.hosts.flatMap((h) => h.can || []));
  st.qjobs ||= {};
  const typed = deps.typed ? await feedTyped(st, cap, deps) : null;
  let queuedS = cap.queued_audio_h * 3600;
  if (queuedS >= LOW_H * 3600 * cap.rate) return { fed: 0, queued_h: cap.queued_h, ...(typed ? { typed } : {}) };
  let fed = 0;
  while (queuedS < TARGET_H * 3600 * cap.rate && fed < max) {
    // new talks first (Chad 10-31): a whole talk brings a talk on air; a remaster only upgrades one already up
    const i = [(id) => kindOf(st, id) === 'whole' && can.has('whole'), (id) => can.has(kindOf(st, id))].map((f) => st.queue.findIndex(f)).find((x) => x >= 0) ?? -1;
    if (i < 0) break;
    const [itemId] = st.queue.splice(i, 1), kind = kindOf(st, itemId);
    try {
      const it = await repo.getMediaItem(itemId), m = await readMeta(it.dir);
      if (await gated(it, m, repo, deps)) continue;
      if (kind !== 'whole' && decided(m, itemId)) continue;
      const { sha, fileId, bytes } = await stage(kind, it, m, { q, wr, rj: rj || await restoreJob(), full }), id = jobIdFor(itemId, sha, kind);
      await q.enqueue([{ id, file_id: fileId, item_id: itemId, type: 'media', stages: [kind], invoice: { audio_s: m.duration_s || 0, bytes }, need: { ram_gb: 5 } }]);
      st.qjobs[id] = { itemId, slug: it.slug, sha, kind, audio_s: m.duration_s || 0, at: now() };
      queuedS += m.duration_s || 0; fed++;
    } catch (e) { st.queue.push(itemId); return { fed, error: `#${itemId}: ${e.message}`.slice(0, 300) }; }   // to the back: one bad talk never blocks the feed
  }
  return { fed, queued_h: cap.rate ? queuedS / cap.rate / 3600 : null, ...(typed ? { typed } : {}) };
}

const typedFileId = (itemId, sha) => `t${itemId}-${sha.slice(0, 12)}`;
/** Typed feed: only while hosts for all three steps are engaged; keeps ~TARGET_H of prep queued; order by band (pickNext). */
async function feedTyped(st, cap, { q, edge = null, repo, wr, readMeta = readMetaFile, now = Date.now, max = 20, fraction, cbPeople }) {
  const types = new Set(cap.hosts.flatMap((h) => h.types || []));
  const lack = SJ.AUDIO_TYPES.filter((t) => !types.has(t) && !(t === 'gpu' && edge));   // pods boot on the edge's gpu backlog
  if (lack.length) return { fed: 0, why: `no ${lack.join('/')} host engaged` };
  st.chains ||= {};
  const t = cap.by_type?.['cpu-prep'] || {}, rate = t.rate || (t.queued_h ? t.queued_audio_h / t.queued_h : 1);
  let queuedS = (t.queued_audio_h || 0) * 3600, fed = 0;
  while (queuedS < TARGET_H * 3600 * rate && fed < max) {
    const i = SJ.pickNext(st, (id) => SJ.typedEligible(st, id) && SJ.typedShare(id, fraction) && !st.chains[id]);
    if (i < 0) break;
    const [itemId] = st.queue.splice(i, 1);
    try {
      const it = await repo.getMediaItem(itemId), m = await readMeta(it.dir);
      if (await gated(it, m, repo, { cbPeople })) continue;
      const input = join(it.dir, m.original), sha = await wr.fileSha(input);
      const wj = { ...wr.wholeJob(it, m, sha), threads: 4 }, fileId = typedFileId(itemId, sha), audio_s = m.duration_s || 0;
      const { bytes } = await q.put('files', fileId, wj.input, input);
      const job = SJ.typedJob('cpu-prep', { itemId, fileId, wj, band: SJ.bandOf(st, itemId), audio_s, bytes });
      await q.enqueue([job]);
      st.chains[itemId] = { sha, fileId, slug: it.slug, input: wj.input, audio_s, at: now() };
      st.qjobs[job.id] = { itemId, slug: it.slug, sha, kind: 'typed', type: 'cpu-prep', audio_s, at: now() };
      queuedS += audio_s; fed++;
    } catch (e) { st.queue.push(itemId); return { fed, error: `#${itemId}: ${e.message}`.slice(0, 300) }; }
  }
  return { fed };
}

/** Drop a talk's chain: every step's job is acked (its results go), then the talk retries like a whole job. */
async function failChain(st, id, ackJob, error, repo) {
  const qj = st.qjobs[id], ch = st.chains?.[qj.itemId] || {};
  for (const x of [id, ...SJ.AUDIO_TYPES.map((t) => ch[t]?.id)]) if (x) ackJob(x);
  delete st.chains?.[qj.itemId];
  await retry(st, qj, error, repo);
}

const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));
/** Pull finished typed steps: validate; prep/gpu → enqueue the next step (ack the one before); finish → the whole intake + tool stamps. */
// stageInline:false (the lane): a prepped talk's gpu step always lands on the LAN; the mover (rebalanceGpu, beside the pass) stages it on R2.
// Uploading inline held tower's pass 50+ min on its uplink (10-31), so nothing was pulled or adopted meanwhile.
const MOVE_PARALLEL = Number(process.env.MEDIA_MOVE_PARALLEL) || 3;
const PERMANENT = /result refused|chain record lost|delivered without its stages/, PULL_TRIES = 5;
/** Every typed pull error → st.pull_errors (last 50: at, job, error), so a failing step is never silent. */
export function logPullError(st, job, error, at = Date.now()) {
  (st.pull_errors ||= []).push({ at, job, error });
  if (st.pull_errors.length > 50) st.pull_errors.splice(0, st.pull_errors.length - 50);
}
/** Each adopted typed step → st.step_log {type, host, audio_s, at} (last 500): the worker cards' speed per host, pod and type (worker-cards.js). */
export function logStep(st, type, host, audio_s, at) {
  (st.step_log ||= []).push({ type, host: host || null, audio_s: audio_s || 0, at });
  if (st.step_log.length > 500) st.step_log.splice(0, st.step_log.length - 500);
}
async function pullTyped(st, ack, { q, edge = null, repo, wr, readMeta = readMetaFile, now = Date.now, syncStages, buffer = null, stageInline = true }) {
  let adopted = 0, errors = 0, steps = 0, lanCap;
  const buf = { staged_h: buffer?.buffer_h || 0, want_h: buffer?.want_h || 0 };
  st.chains ||= {};
  const ackEdge = [], qOf = (where) => (where === 'edge' ? edge : q);
  const ackJob = (id) => { const list = st.qjobs[id]?.where === 'edge' ? ackEdge : ack; if (!list.includes(id)) list.push(id); delete st.qjobs[id]; };
  for (const type of SJ.AUDIO_TYPES) for (const [src, sq] of [['lan', q], ...(type === 'gpu' && edge ? [['edge', edge]] : [])]) {
    for (const j of await sq.listDone(200, type)) {   // adopted steps stay 'done' until the next step finishes: skip them
      const qj = st.qjobs[j.id];
      if (!qj || qj.adopted) continue;
      const ch = st.chains[qj.itemId], outputs = (j.result?.outputs || []).map((o) => o.name);
      let stg = null;
      try {
        if (!ch) throw Error('chain record lost');
        const it = await repo.getMediaItem(qj.itemId);
        stg = join(it.dir, `.typed-${type}`);
        await rm(stg, { recursive: true, force: true });
        if (type !== 'cpu-finish') {
          await sq.get('results', j.id, 'result.json', join(stg, 'result.json'));
          const r = SJ.validateTyped(type, await readJson(join(stg, 'result.json')), { inputSha: ch.sha, slug: qj.slug, outputs: outputs.length ? outputs : null });
          ch[type] = SJ.stepOf(j, r, now());
          logStep(st, type, j.host, ch.audio_s, now());
          const m = await readMeta(it.dir), next = SJ.chainNext(m, ch);
          if (!next || SJ.AUDIO_TYPES.indexOf(next) <= SJ.AUDIO_TYPES.indexOf(type)) throw Error(`${type} delivered without its stages (next would be ${next})`);
          const where = next === 'gpu' && !stageInline ? 'lan' : next === 'gpu' ? SJ.gpuRoute(lanCap ||= await q.capacity().catch(() => null), { edge: !!edge, targetH: TARGET_H, ...buf }) : 'lan', nq = qOf(where);
          if (where === 'edge') buf.staged_h += (ch.audio_s || 0) / 3600;
          const files = where !== src ? sentFiles(r.files) : r.files;   // staged: what the next host rebuilds itself never crosses the uplink
          if (where !== src) {   // the next step runs on the other transport: its inputs go into that queue's files/<file id>/
            if (where === 'edge') await nq.put('files', ch.fileId, ch.input, join(it.dir, m.original));   // the LAN holds it from the feed
            for (const f of files) { const tmp = join(stg, 'x', 'item', f.path); await sq.get('results', j.id, 'item/' + f.path, tmp); await nq.put('files', ch.fileId, 'item/' + f.path, tmp); }
          }
          const job = SJ.typedJob(next, { itemId: qj.itemId, fileId: ch.fileId, wj: { input: ch.input, input_sha: ch.sha, threads: 4 }, prev: { id: j.id, files, staged: where !== src }, band: SJ.bandOf(st, qj.itemId), audio_s: ch.audio_s });
          await nq.enqueue([job]);
          qj.adopted = true;
          st.qjobs[job.id] = { itemId: qj.itemId, slug: qj.slug, sha: ch.sha, kind: 'typed', type: next, audio_s: ch.audio_s, at: now(), ...(where === 'edge' ? { where } : {}) };
          const before = SJ.AUDIO_TYPES[SJ.AUDIO_TYPES.indexOf(type) - 1];   // this step has consumed the one before: its results can go
          if (before && ch[before]) ackJob(ch[before].id);
          steps++;
        } else {
          for (const o of outputs) await sq.get('results', j.id, o, join(stg, o));
          const r = SJ.validateTyped(type, await readJson(join(stg, 'result.json')), { inputSha: ch.sha, slug: qj.slug, outputs });
          const meta = await wr.adoptWholeResult(stg, it.dir, await readMeta(it.dir), ch.sha, null);
          ch[type] = SJ.stepOf(j, r, now());
          logStep(st, type, j.host, ch.audio_s, now());
          SJ.stampTools(meta, ch);
          await writeFile(join(it.dir, 'meta.json.typed-part'), JSON.stringify(meta, null, 2)); await rename(join(it.dir, 'meta.json.typed-part'), join(it.dir, 'meta.json'));
          await (syncStages || (async (id, stages) => (await import('../repos/media-ledger-repo.js')).syncItemStages(id, stages)))(it.id, meta.stages).catch(() => {});
          if (['whole_queued', 'scheduled', 'queued', 'running'].includes((await repo.getMediaItem(it.id))?.state))
            await repo.updateMediaItem(it.id, { state: 'transcribed', stage: null, stages_done: ',' + Object.keys(meta.stages || {}).join(',') + ',' });
          st.done.push({ id: it.id, slug: it.slug, mode: 'typed', audio_s: ch.audio_s, gpu: ch.gpu?.host, pod: ch.gpu?.host, prep: ch['cpu-prep']?.host, finish: j.host, at: now(), via: 'queue' });
          provePool(st, ch.gpu?.host);
          for (const x of [j.id, ch['cpu-prep']?.id, ch.gpu?.id]) if (x) ackJob(x);
          delete st.chains[qj.itemId];
          adopted++;
        }
      } catch (e) {
        if (stg) await rm(stg, { recursive: true, force: true }).catch(() => {});
        if (e.code === 'ABANDONED') throw e;   // the pass was abandoned (drain / self-heal): nothing is failed or acked, the next pass resumes
        errors++;
        const error = `typed ${type} from ${j.host}: ${e.message}`.slice(0, 300);
        logPullError(st, j.id, error);
        // a refused result is final; a transfer or I/O error leaves the step done on its queue, retried next pass (never acked-and-lost), final after PULL_TRIES
        if (PERMANENT.test(e.message) || (qj.pull_fails = (qj.pull_fails || 0) + 1) >= PULL_TRIES) await failChain(st, j.id, ackJob, error, repo);
        continue;
      }
      if (stg) await rm(stg, { recursive: true, force: true }).catch(() => {});
    }
    for (const f of (await sq.stats(type)).failed || []) if (st.qjobs[f.id]) { errors++; logPullError(st, f.id, `queue ${type}${src === 'edge' ? ' (edge)' : ''}: ${f.error}`.slice(0, 300)); await failChain(st, f.id, ackJob, `queue ${type}${src === 'edge' ? ' (edge)' : ''}: ${f.error}`, repo); }
  }
  if (ackEdge.length) await edge.ack(ackEdge);   // the LAN list is acked by pull()
  return { adopted, steps, errors, ...(edge ? { edge_acked: ackEdge.length } : {}) };
}

/** The pods' R2 buffer (deps.buffer from the pod plan: buffer_h staged on the edge, want_h = BUFFER_H of pod work) is short while gpu steps
 *  wait on the LAN: move the waiting steps to the edge (withdraw is refused once a LAN host has leased one), the original + the prep files
 *  copied into the edge's files/<file id>/. Gpu work is staged BEFORE a pod boots, so a paid pod never sits idle (10-31: pod 377 booted with
 *  3 gpu steps queued on the LAN and none on the edge). */
// Crash-safe order: the files are copied to the edge while the LAN step is still queued (a drain mid-upload loses nothing), then the LAN
// copy is withdrawn and the edge step enqueued at once. It is slow (tower's uplink), so the lane runs it beside its pass, not inside it.
export async function rebalanceGpu(st, { q, edge, repo, readMeta = readMetaFile, now = Date.now, buffer = null, parallel = MOVE_PARALLEL }) {
  const wantH = buffer?.want_h || 0;
  if (!(wantH > 0)) return { moved: 0 };
  const cap = await edge.capacity().catch(() => null);
  if (!cap) return { moved: 0 };
  let edgeH = cap.by_type?.gpu?.queued_audio_h || 0, moved = 0, skipped = 0, bytes = 0, lost = 0, audioS = 0;
  const t0 = now();
  const leased = new Set(((await q.stats('gpu').catch(() => null))?.leased || []).map((j) => j.id));   // a step a home GPU holds is never copied
  const waiting = Object.entries(st.qjobs || {}).filter(([id, qj]) => qj.kind === 'typed' && qj.type === 'gpu' && !qj.where && !leased.has(id) && st.chains?.[qj.itemId]?.['cpu-prep']).sort((a, b) => a[1].at - b[1].at);
  // a file already on the edge at its size is not sent again: a move cut by a restart resumes where it stopped (10-31: restarts every few
  // minutes meant no talk ever finished its upload)
  const putOnce = async (have, fileId, name, file) => { const size = (await stat(file)).size; if (have.get(name) === size) { skipped++; return; } await edge.put('files', fileId, name, file); bytes += size; };
  const moveOne = async (id, qj) => {
    const ch = st.chains[qj.itemId], prep = ch['cpu-prep'], files = sentFiles(prep.files);
    const it = await repo.getMediaItem(qj.itemId), m = await readMeta(it.dir), stg = join(it.dir, '.typed-move');
    let withdrawn = false;
    try {
      const have = new Map(((await edge.list?.('files', ch.fileId).catch(() => null)) || []).map((o) => [o.name, o.bytes]));
      await putOnce(have, ch.fileId, ch.input, join(it.dir, m.original));
      for (const f of files) {
        const tmp = join(stg, 'item', f.path);
        try { await q.get('results', prep.id, 'item/' + f.path, tmp); } catch (e) { if (e.status === 404) e.lost = true; throw e; }
        await putOnce(have, ch.fileId, 'item/' + f.path, tmp);
      }
      if (!st.qjobs[id] || !(await q.withdraw([id]))?.withdrawn) return;   // a home GPU took it (or it finished) meanwhile: it stays home
      withdrawn = true;
      const job = SJ.typedJob('gpu', { itemId: qj.itemId, fileId: ch.fileId, wj: { input: ch.input, input_sha: ch.sha, threads: 4 }, prev: { id: prep.id, files, staged: true }, band: SJ.bandOf(st, qj.itemId), audio_s: ch.audio_s });
      await edge.enqueue([job]);
      delete st.qjobs[id];
      st.qjobs[job.id] = { ...qj, at: now(), where: 'edge' };
      moved++; audioS += ch.audio_s || 0;
    } catch (e) {   // the LAN copy was withdrawn but the edge refused it: put it back so the talk is not lost
      if (e.code === 'ABANDONED' && !withdrawn) throw e;
      if (e.lost && !withdrawn) { await restartLost(st, id, qj, { q, repo, now }, e.message); lost++; }
      else if (withdrawn) await q.enqueue([SJ.typedJob('gpu', { itemId: qj.itemId, fileId: ch.fileId, wj: { input: ch.input, input_sha: ch.sha, threads: 4 }, prev: { id: prep.id, files: prep.files, staged: false }, band: SJ.bandOf(st, qj.itemId), audio_s: ch.audio_s })]).catch(() => {});
      else st.q_move_error = { at: now(), id, error: String(e.message).slice(0, 300) };
    } finally { await rm(stg, { recursive: true, force: true }).catch(() => {}); }
  };
  // several at once (tower's uplink is the limit; parallel streams keep it full through each request's round trips), until the buffer is met
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () => {
    while (i < waiting.length && edgeH < wantH) {
      const [id, qj] = waiting[i++];
      edgeH += (qj.audio_s || 0) / 3600;   // counted when started, so the lanes never overfill the buffer together
      await moveOne(id, qj);
    }
  }));
  const ms = now() - t0;
  return { moved, bytes, ms, ...(audioS ? { mb_per_audio_h: Math.round(bytes / 1e6 / (audioS / 3600)) } : {}), ...(ms > 0 && audioS ? { audio_h_per_h: +((audioS / 3600) / (ms / 3600e3)).toFixed(1) } : {}),
    ...(skipped ? { resumed_files: skipped } : {}), ...(lost ? { restarted_lost: lost } : {}) };
}

// files the gpu job rebuilds itself, so they never cross tower's uplink: light.flac (~176 MB per audio-h of 48 kHz FLAC; the originals are
// ~11 MB/audio-h) is one deterministic ffmpeg pass over the original from enh_ck.m0 (item.js enhance rebuilds it when the file is absent:
// ~35 s CPU per audio-h, measured on boss 10-31), beside a gpu job of ~15 min. A LAN gpu step still reads it from the results store.
export const REBUILT = new Set(['enhanced/light.flac']);
export const sentFiles = (files = []) => files.filter((f) => !REBUILT.has(f.path));

/** A waiting gpu step whose prep files are gone (404 from the results store: acked by an older failure path) can never run: withdraw it, drop
 *  the chain and queue the talk again from prep, once without counting it against the talk (the loss was ours); a repeat goes through retry(). */
async function restartLost(st, id, qj, { q, repo, now }, error) {
  const ch = st.chains?.[qj.itemId] || {};
  await q.withdraw([id]).catch(() => null);
  const acks = SJ.AUDIO_TYPES.map((t) => ch[t]?.id).filter((x) => x && x !== id);
  if (acks.length) await q.ack(acks).catch(() => null);
  delete st.qjobs[id]; delete st.chains?.[qj.itemId];
  (st.lost_restarts ||= []).push({ at: now(), item: qj.itemId, job: id, error: String(error).slice(0, 200) });
  if (st.lost_restarts.length > 50) st.lost_restarts.splice(0, st.lost_restarts.length - 50);
  st.lost ||= {};
  if (!st.lost[qj.itemId]) { st.lost[qj.itemId] = 1; if (!st.queue.includes(qj.itemId)) st.queue.unshift(qj.itemId); }
  else await retry(st, qj, `prep files lost again: ${error}`, repo);
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

export async function pull(st, deps) {
  const { q, repo, wr, rj, remaster = async () => {}, readMeta = readMetaFile, now = Date.now } = deps;
  st.qjobs ||= {};
  const ack = [];
  const typed = deps.typed ? await pullTyped(st, ack, deps) : null;
  let adopted = 0, errors = 0;
  for (const j of await q.listDone(20)) {
    const qj = st.qjobs[j.id];
    if (!qj) continue;   // not ours (a smoke test, another caller)
    try {
      if (qj.kind && qj.kind !== 'whole') {
        const it = await repo.getMediaItem(qj.itemId), dj = await adoptRestore(j, it, rj || await restoreJob(), q);
        if (!st.done.some((d) => d.id === it.id)) {   // a duplicate result never double-publishes
          st.done.push({ id: it.id, slug: it.slug, mode: qj.kind, audio_s: dj.audio_s ?? qj.audio_s, seconds: dj.seconds, gpu: j.host, pod: j.host, at: now(), via: 'queue' });
          provePool(st, j.host);
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
      provePool(st, j.host);
      adopted++;
    } catch (e) { if (e.code === 'ABANDONED') throw e; errors++; await retry(st, qj, `queue result from ${j.host}: ${e.message}`, repo); }
    ack.push(j.id); delete st.qjobs[j.id];
  }
  for (const f of (await q.stats()).failed || []) {   // the queue gave up after its 3 attempts
    const qj = st.qjobs[f.id];
    if (!qj) continue;
    await retry(st, qj, `queue: ${f.error}`, repo); ack.push(f.id); delete st.qjobs[f.id];
  }
  if (ack.length) await q.ack(ack);
  return { adopted, errors, acked: ack.length, ...(typed ? { typed } : {}) };
}
// a talk whose queue job failed goes back to tower's lane once (ssh hosts/pods), then is recorded failed
async function retry(st, qj, error, repo) {
  st.attempts ||= {};
  st.attempts[qj.itemId] = (st.attempts[qj.itemId] || 0) + 1;
  if (st.attempts[qj.itemId] < 2) { st.queue.push(qj.itemId); return; }
  (st.failed ||= []).push({ id: qj.itemId, error: error.slice(0, 400) });
  if (['whole', 'typed'].includes(qj.kind || 'whole')) await repo.updateMediaItem(qj.itemId, { state: 'failed', why: error.slice(0, 500) });   // a failed remaster leaves the talk as it was
}

// refusals that were tower's own contract bugs, not the talk's: forgiven once (the attempt given back, the talk to the FRONT of the queue)
// 10-31: cpu-finish required enhanced/pod/post.json, which item.js deletes once a remaster is published, so every GOOD finish was refused
export const OUR_REFUSALS = [/cpu-finish result refused: missing enhanced\/pod\/post\.json/];
export function forgiveOurs(st, at = Date.now()) {
  st.forgiven ||= {};
  const back = [];
  for (const e of st.pull_errors || []) {
    if (!OUR_REFUSALS.some((r) => r.test(e.error))) continue;
    const item = Number(/^[a-z-]+-(\d+)-[0-9a-f]+$/.exec(e.job)?.[1]);
    if (!item || st.forgiven[item] || st.chains?.[item]) continue;
    st.forgiven[item] = at;
    if (st.attempts?.[item]) st.attempts[item]--;
    st.failed = (st.failed || []).filter((f) => f.id !== item);
    const i = (st.queue ||= []).indexOf(item); if (i >= 0) st.queue.splice(i, 1);
    back.push(item);
  }
  st.queue.unshift(...back);
  return back;
}

/** One background pass: pull first (frees R2 + gives back failures), then top the window up. */
export async function tick(st, deps) {
  const out = { pulled: await pull(st, deps) };
  const forgiven = forgiveOurs(st); if (forgiven.length) out.forgiven = forgiven;
  if (deps.typed && deps.edge && deps.rebalance !== false) out.moved = await rebalanceGpu(st, deps).catch((e) => ({ error: String(e.message).slice(0, 200) }));
  out.fed = await feed(st, deps);
  out.leased = {}; out.beat = {};   // jobs each agent holds (machine cards) + its latest heartbeat (an agent pod is alive while it beats: media-jobs.js)
  // every job type: stats() alone reads 'media' only, so typed leases (cpu-prep, gpu, cpu-finish) were missing and the cards read {} (10-31)
  const all = await Promise.all(['media', ...SJ.AUDIO_TYPES].map((t) => Promise.resolve().then(() => deps.q.stats(t)).catch(() => null)));
  for (const j of all.flatMap((x) => x?.leased || [])) {
    out.leased[j.host] = (out.leased[j.host] || 0) + 1;
    out.beat[j.host] = Math.max(out.beat[j.host] || 0, j.updated || 0);
  }
  return out;
}
