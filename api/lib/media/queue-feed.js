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
// CPU pod (Chad 10-31): an edge host that lists cpu-prep/cpu-finish (a rented CPU pod, cloud.createCpuPod) takes the OVERFLOW of the home CPU
// hosts: the feed adds its measured rate, rebalancePrep moves the excess prep steps to the edge, and a step that finished on the edge is pulled
// and acked there whatever its type. A talk whose input is FLAC/WAV never leaves the LAN (no decoded audio in the cloud).
import { join, extname } from 'node:path';
import { VIDEO } from './r2-stage.js';
import { readFile, writeFile, rm, rename, stat } from 'node:fs/promises';
import * as SJ from './stage-jobs.js';
import { untransitArgs, TRANSIT, isDecoded } from '../../../scripts/media/worker/transit.mjs';
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
// a recording whose probe found no audio stream (a silent film clip): nothing to grade, transcribe or remaster (10-31: 2493/2494/2497 failed prep as "ffmpeg … does not contain any stream")
export const noAudio = (m) => { const p = m?.source?.probe; return !!p && p.codec == null && p.channels == null && p.sample_rate == null; };
async function gated(it, m, repo, deps) {
  const g = noAudio(m) ? { state: 'review', why: 'no audio stream (a silent video): nothing to transcribe or remaster — Chad decides' }
    : await speakerGate(it, m, deps.cbPeople ? { people: deps.cbPeople } : {});
  if (!g) return false;
  await repo.updateMediaItem(it.id, { state: g.state, why: g.why.slice(0, 500) });
  return true;
}

// PRE-FEED DUPLICATE GATE (coordinator tick 9/12, 11-01: 2187 and 2576 ran their GPU step and were then dropped as duplicates).
// The content check (dedupe.js) needs a transcript, so before any GPU only what is already known can decide:
//  · a confirmed verdict already on the talk (meta.dedup duplicate with a check, or a terminal state) → it is not fed;
//  · the SAME FILE (sha256) as a talk already through preview, published or in a chain → duplicate (byte-identical: nothing to choose);
//  · the same length to ±0.05 s as such a talk in the SAME source folder (2576: download--0053.mp4 = the m4a of bahai-law, 2782.368 s both)
//    → held for review (unconfirmed: Chad decides), never dropped;
//  · the same length elsewhere → fed LAST (priority is order: it still runs, after everything else).
const ADVANCED = new Set(['done', 'review', 'held', 'transcribed', 'asr_queued', 'diar_queued', 'llm_queued']);   // or in a chain (st.chains)
const NEW = new Set(['queued', 'scheduled', 'whole_queued', 'running', 'failed']);   // only a talk not yet through the pipeline is gated (a 'whole' redo of a published talk is not)
const folderOf = (ref) => String(ref || '').split('/').slice(-2, -1)[0] || null;
export async function feedDup(it, m, repo, st = {}) {
  if (['duplicate', 'excluded'].includes(it.state)) return { skip: true };
  if (!NEW.has(it.state)) return null;
  if (m?.dedup?.verdict === 'duplicate' && m.dedup.check && !m.dedup.dissolved_at) return { state: 'duplicate', why: `duplicate of ${m.dedup.best || m.dedup.of} (recorded ${m.dedup.check.by}; not fed again)` };
  if (!repo.feedTwinRows) return null;
  const sha = it.sha256 || m?.source?.sha256 || null, dur = m?.duration_s ?? it.duration_s ?? null;
  if (!sha && dur == null) return null;
  const twins = await repo.feedTwinRows({ id: it.id, sha256: sha, duration_s: dur });
  const ahead = (t) => ADVANCED.has(t.state) || !!st.chains?.[t.id];
  const same = twins.find((t) => sha && t.sha256 === sha && ahead(t));
  if (same) return { state: 'duplicate', why: `duplicate of ${same.slug || `#${same.id}`}: same file (sha256), found before feed`, of: same };
  const len = twins.filter((t) => t.sha256 !== sha && ahead(t));
  const near = len.find((t) => folderOf(t.source_ref) && folderOf(t.source_ref) === folderOf(it.source_ref));
  if (near) return { state: 'review', why: `possible duplicate of ${near.slug || `#${near.id}`}: same length (${dur} s) in the same source folder, found before feed — not transcribed; Chad decides`, of: near };
  if (len.length) return { later: len[0].slug || `#${len[0].id}` };
  return null;
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
// Chad 10-30: "pushing video around to process audio is simply absurd". A typed chain's input is the recording's AUDIO: a video's audio track,
// stream-copied (no re-encode, so every step decodes the same samples), kept beside the talk as TYPED_INPUT.<ext> while the chain lives; the
// chain's sha names that file. Tower keeps the video (meta.original): adoption restores original + source. No audio track → the original.
export const TYPED_INPUT = '.typed-input';
async function chainInput(it, m, demux) {
  if (!demux || !VIDEO.has(extname(m.original).slice(1).toLowerCase())) return m.original;
  const a = await demux(join(it.dir, m.original), it.dir).catch(() => null);
  if (!a) return m.original;
  const rel = `${TYPED_INPUT}.${a.ext}`;
  await rename(a.file, join(it.dir, rel));
  return rel;
}
const chainSrc = (it, m, ch) => join(it.dir, ch.src || m.original);
/** Typed feed: only while hosts for all three steps are engaged; keeps ~TARGET_H of prep queued; order by band (pickNext). */
/** The edge's engaged cpu-prep supply (a CPU pod): { rate, queued_audio_h } at its measured rate, or null when no edge host lists cpu-prep. */
const edgePrep = (cap) => { const t = cap?.by_type?.['cpu-prep']; return t?.hosts?.length ? { rate: t.rate || 0, queued_audio_h: t.queued_audio_h || 0 } : null; };
async function feedTyped(st, cap, { q, edge = null, gpuEdge = true, repo, wr, readMeta = readMetaFile, now = Date.now, max = 20, fraction, cbPeople, demux = null, buffer = null }) {
  const types = new Set(cap.hosts.flatMap((h) => h.types || []));
  const lack = SJ.AUDIO_TYPES.filter((t) => !types.has(t) && !(t === 'gpu' && edge && gpuEdge !== false));   // pods boot on the edge's gpu backlog
  if (lack.length) return { fed: 0, why: `no ${lack.join('/')} host engaged` };
  st.chains ||= {};
  const t = cap.by_type?.['cpu-prep'] || {}, rate = t.rate || (t.queued_h ? t.queued_audio_h / t.queued_h : 1);
  // the pods' gpu buffer is full (measured: staged ≥ want_h, core.bufferPolicy) and prep still has work queued: feeding more only piles prep
  // output behind the GPU — and each fed talk costs tower a hash + copy inside the pass that also pulls results and plans rentals
  // (11-01: 160 h of prep queued, 167 h of gpu staged vs want 112 h; the pass sat 8+ min feeding at ~2.5 min a talk, the pod plan went stale)
  if (buffer && buffer.buffer_low === false && (t.queued_audio_h || 0) > 0) return { fed: 0, why: `gpu buffer full (${Math.round(buffer.buffer_h ?? 0)} h staged, want ${Math.round(buffer.want_h ?? 0)} h); ${Math.round(t.queued_audio_h)} h of prep queued` };
  // an edge CPU host (the CPU pod) adds its measured prep rate; its queue counts as fed (rebalancePrep moves the overflow there)
  const ep = edge ? edgePrep(await edge.capacity?.().catch(() => null)) : null, eRate = ep?.rate || 0;
  let queuedS = (t.queued_audio_h || 0) * 3600 + (ep ? ep.queued_audio_h * 3600 : 0), fed = 0, held = 0;
  st.feedLater ||= {};   // talk id → the same-length copy it waits behind (fed last, never dropped)
  const ok = (id) => SJ.typedEligible(st, id) && SJ.typedShare(id, fraction) && !st.chains[id];
  while (queuedS < TARGET_H * 3600 * (rate + eRate) && fed < max) {
    let i = SJ.pickNext(st, (id) => ok(id) && !st.feedLater[id]), last = false;
    if (i < 0) { i = SJ.pickNext(st, ok); last = true; }   // nothing else left: the same-length copies run now
    if (i < 0) break;
    const [itemId] = st.queue.splice(i, 1);
    try {
      const it = await repo.getMediaItem(itemId), m = await readMeta(it.dir);
      if (await gated(it, m, repo, { cbPeople })) continue;
      const dup = last ? null : await feedDup(it, m, repo, st);
      if (dup?.skip) continue;
      if (dup?.later) { st.feedLater[itemId] = dup.later; st.queue.push(itemId); continue; }
      if (dup?.state) { await repo.updateMediaItem(it.id, { state: dup.state, why: dup.why.slice(0, 500) }); held++; continue; }
      delete st.feedLater[itemId];
      const src = await chainInput(it, m, demux), input = join(it.dir, src), sha = await wr.fileSha(input);
      const wj = { ...wr.wholeJob(it, m, sha), threads: 4 }, fileId = typedFileId(itemId, sha), audio_s = m.duration_s || 0;
      if (src !== m.original) wj.input = 'in' + extname(src);
      const job = SJ.typedJob('cpu-prep', { itemId, fileId, wj, band: SJ.bandOf(st, itemId), audio_s });
      // job ids are deterministic (talk + input sha): a talk fed again after its chain was dropped would meet its OLD step under the same
      // id — enqueue leaves a done/leased job alone, so the stale result came back with no chain ("chain record lost", 1947 10-31).
      // Cancel it first (before the put: a cancel also clears the staged files no other job names).
      if (q.cancel) await q.cancel([job.id]).catch(() => null);
      const { bytes } = await q.put('files', fileId, wj.input, input);
      job.invoice.bytes = bytes;
      await q.enqueue([job]);
      st.chains[itemId] = { sha, fileId, slug: it.slug, input: wj.input, audio_s, at: now(), bytes, ...(src !== m.original ? { src } : {}) };
      st.qjobs[job.id] = { itemId, slug: it.slug, sha, kind: 'typed', type: 'cpu-prep', audio_s, at: now() };
      queuedS += audio_s; fed++;
    } catch (e) { st.queue.push(itemId); return { fed, held, error: `#${itemId}: ${e.message}`.slice(0, 300) }; }
  }
  return { fed, ...(held ? { held } : {}) };
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
/** A cloud host sent each listed FLAC/WAV as an Opus transit (scripts/media/worker/transit.mjs: no decoded audio in R2, Chad 10-31). After
 *  adoption, decode each back to its listed name beside the talk (tower: ffmpeg -c:a flac = one 'encode' slot) and record it in meta: that
 *  master went through Opus 96k (its input already had, from the gpu step), so meta says so. Lossless masters exist only for LAN chains. */
export async function untransit(dir, r, meta, { run = null, now = Date.now } = {}) {
  const ts = (r?.files || []).filter((f) => f.transit_of);
  if (!ts.length) return meta;
  run ||= (await import('./tools.js')).run;
  for (const f of ts) {
    const to = join(dir, f.transit_of), part = `${to}.part.flac`;
    await run('ffmpeg', untransitArgs(join(dir, f.path), part), { timeoutMs: 600_000 });
    await rename(part, to); await rm(join(dir, f.path), { force: true });
  }
  meta.master_transit = ts.map((f) => ({ path: f.transit_of, via: f.path, settings: f.transit || TRANSIT, at: new Date(now()).toISOString() }));
  return meta;
}
async function pullTyped(st, ack, { q, edge = null, gpuEdge = true, repo, wr, readMeta = readMetaFile, now = Date.now, syncStages, buffer = null, stageInline = true, run = null }) {
  let adopted = 0, errors = 0, steps = 0, lanCap, edgeCap;
  const buf = { staged_h: buffer?.buffer_h || 0, want_h: buffer?.want_h || 0 };
  st.chains ||= {};
  const ackEdge = [], qOf = (where) => (where === 'edge' ? edge : q);
  const ackJob = (id) => { const list = st.qjobs[id]?.where === 'edge' ? ackEdge : ack; if (!list.includes(id)) list.push(id); delete st.qjobs[id]; };
  // every step type is pulled from both transports: gpu from the pods, cpu-prep/cpu-finish from a CPU pod (an edge step is acked on the edge)
  for (const type of SJ.AUDIO_TYPES) for (const [src, sq] of [['lan', q], ...(edge ? [['edge', edge]] : [])]) {
    for (const j of await sq.listDone(200, type)) {   // adopted steps stay 'done' until the next step finishes: skip them
      seenAgent(st, j.host, j.updated);
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
          const where = lanOnly(ch) ? 'lan' : next === 'gpu' ? (src === 'lan' && !stageInline ? 'lan' : SJ.gpuRoute(lanCap ||= await q.capacity().catch(() => null), { edge: !!edge && gpuEdge !== false, targetH: TARGET_H, ...buf }))
            : src === 'edge' ? SJ.cpuRoute(next, lanCap ||= await q.capacity().catch(() => null), edgeCap ||= await edge.capacity?.().catch(() => null), { targetH: TARGET_H }) : 'lan', nq = qOf(where);
          if (where === 'edge' && next === 'gpu') buf.staged_h += (ch.audio_s || 0) / 3600;
          // staged, or anything a cloud host made: what the next host rebuilds itself never crosses the uplink, and a cloud host never uploaded
          // it (queue-agent cloudSkips), so an edge step's next inputs never name it (it would 404 in the results store)
          const files = where !== src || src === 'edge' ? sentFiles(r.files) : r.files;
          if (where !== src) {   // the next step runs on the other transport: its inputs go into that queue's files/<file id>/
            await nq.put('files', ch.fileId, ch.input, chainSrc(it, m, ch));   // the original, from tower's copy (the transport it came from may have dropped it)
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
          await untransit(it.dir, r, meta, { run, now });
          ch[type] = SJ.stepOf(j, r, now());
          logStep(st, type, j.host, ch.audio_s, now());
          SJ.stampTools(meta, ch);
          await writeFile(join(it.dir, 'meta.json.typed-part'), JSON.stringify(meta, null, 2)); await rename(join(it.dir, 'meta.json.typed-part'), join(it.dir, 'meta.json'));
          await (syncStages || (async (id, stages) => (await import('../repos/media-ledger-repo.js')).syncItemStages(id, stages)))(it.id, meta.stages).catch(() => {});
          if (['whole_queued', 'scheduled', 'queued', 'running'].includes((await repo.getMediaItem(it.id))?.state))
            await repo.updateMediaItem(it.id, { state: 'transcribed', stage: null, stages_done: ',' + Object.keys(meta.stages || {}).join(',') + ',' });
          st.done.push({ id: it.id, slug: it.slug, mode: 'typed', remaster: meta.remaster?.status || null, swapped: meta.remaster?.swapped ?? null, audio_s: ch.audio_s, gpu: ch.gpu?.host, pod: ch.gpu?.host, prep: ch['cpu-prep']?.host, finish: j.host, at: now(), via: 'queue' });
          provePool(st, ch.gpu?.host);
          for (const x of [j.id, ch['cpu-prep']?.id, ch.gpu?.id]) if (x) ackJob(x);
          if (ch.src) await rm(join(it.dir, ch.src), { force: true }).catch(() => {});
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
  const waiting = Object.entries(st.qjobs || {}).filter(([id, qj]) => qj.kind === 'typed' && qj.type === 'gpu' && !qj.where && !leased.has(id) && st.chains?.[qj.itemId]?.['cpu-prep'] && !lanOnly(st.chains[qj.itemId])).sort((a, b) => a[1].at - b[1].at);
  // a file already on the edge at its size is not sent again: a move cut by a restart resumes where it stopped (10-31: restarts every few
  // minutes meant no talk ever finished its upload)
  // with pods the home GPU is CPU-first (core.bufferPolicy lan_keep_h): the LAN keeps only its own BUFFER_H, the rest goes to the pods
  const keepH = Number.isFinite(buffer?.lan_keep_h) ? buffer.lan_keep_h : null;
  let lanH = waiting.reduce((a, [, qj]) => a + (qj.audio_s || 0), 0) / 3600;
  const putOnce = async (have, fileId, name, file) => { const size = (await stat(file)).size; if (have.get(name) === size) { skipped++; return; } await edge.put('files', fileId, name, file); bytes += size; };
  const moveOne = async (id, qj) => {
    const ch = st.chains[qj.itemId], prep = ch['cpu-prep'], files = sentFiles(prep.files);
    // the pass runs beside the move on the same state: a home GPU may take, finish and have this step adopted meanwhile (its prep then acked)
    const waitingStill = () => st.qjobs[id] === qj && !qj.adopted && st.chains?.[qj.itemId] === ch;
    const it = await repo.getMediaItem(qj.itemId), m = await readMeta(it.dir), stg = join(it.dir, '.typed-move');
    let withdrawn = false;
    try {
      const have = new Map(((await edge.list?.('files', ch.fileId).catch(() => null)) || []).map((o) => [o.name, o.bytes]));
      await putOnce(have, ch.fileId, ch.input, chainSrc(it, m, ch));
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
      if (e.lost && !withdrawn) { if (waitingStill() && await restartLost(st, id, qj, { q, repo, now }, e.message)) lost++; }
      else if (withdrawn) await q.enqueue([SJ.typedJob('gpu', { itemId: qj.itemId, fileId: ch.fileId, wj: { input: ch.input, input_sha: ch.sha, threads: 4 }, prev: { id: prep.id, files: prep.files, staged: false }, band: SJ.bandOf(st, qj.itemId), audio_s: ch.audio_s })]).catch(() => {});
      else st.q_move_error = { at: now(), id, error: String(e.message).slice(0, 300) };
    } finally { await rm(stg, { recursive: true, force: true }).catch(() => {}); }
  };
  // several at once (tower's uplink is the limit; parallel streams keep it full through each request's round trips), until the buffer is met
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () => {
    while (i < waiting.length && (edgeH < wantH || (keepH != null && lanH > keepH))) {
      const [id, qj] = waiting[i++];
      edgeH += (qj.audio_s || 0) / 3600; lanH -= (qj.audio_s || 0) / 3600;   // counted when started, so the lanes never overfill the buffer together
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
export const REBUILT = SJ.REBUILT;
export const sentFiles = (files = []) => files.filter((f) => !REBUILT.has(f.path));
/** A chain whose input is decoded audio (FLAC/WAV) stays on the LAN: the edge client refuses the name, and no decoded audio goes to the cloud. */
export const lanOnly = (ch) => isDecoded(ch?.input);

/** CPU overflow (Chad 10-31): home CPU hosts first, a CPU pod on the edge takes the excess. While an edge host lists cpu-prep, prep steps waiting
 *  on the LAN beyond TARGET_H at the home hosts' measured rate move to the edge, up to TARGET_H at the edge's measured rate. The original is
 *  copied first (a file already there at its size is not sent again), then the LAN step is withdrawn and the same step enqueued on the edge;
 *  a withdrawn step the edge refuses goes back to the LAN. Newest first: home hosts keep the steps they reach soonest. FLAC/WAV inputs stay. */
export async function rebalancePrep(st, { q, edge, repo, wr, readMeta = readMetaFile, now = Date.now, parallel = MOVE_PARALLEL }) {
  const ep = edgePrep(await edge.capacity().catch(() => null));
  if (!ep) return { moved: 0, why: 'no edge cpu-prep host' };
  const lp = (await q.capacity().catch(() => null))?.by_type?.['cpu-prep'] || {};
  const keepH = TARGET_H * (lp.hosts?.length ? lp.rate || 0 : 0), wantH = TARGET_H * ep.rate;   // audio-hours each side works through in TARGET_H
  let lanH = lp.queued_audio_h || 0, edgeH = ep.queued_audio_h, moved = 0, skipped = 0, kept_lan = 0, bytes = 0;
  const leased = new Set(((await q.stats('cpu-prep').catch(() => null))?.leased || []).map((j) => j.id));
  const waiting = Object.entries(st.qjobs || {}).filter(([id, qj]) => qj.kind === 'typed' && qj.type === 'cpu-prep' && !qj.where && !leased.has(id) && st.chains?.[qj.itemId])
    .filter(([, qj]) => !lanOnly(st.chains[qj.itemId]) || (kept_lan++, false)).sort((a, b) => b[1].at - a[1].at);
  const moveOne = async (id, qj) => {
    const ch = st.chains[qj.itemId];
    let withdrawn = false, job = null;
    try {
      const it = await repo.getMediaItem(qj.itemId), m = await readMeta(it.dir), src = chainSrc(it, m, ch), size = (await stat(src)).size;
      const have = new Map(((await edge.list?.('files', ch.fileId).catch(() => null)) || []).map((o) => [o.name, o.bytes]));
      if (have.get(ch.input) === size) skipped++; else { await edge.put('files', ch.fileId, ch.input, src); bytes += size; }
      job = SJ.typedJob('cpu-prep', { itemId: qj.itemId, fileId: ch.fileId, wj: { ...wr.wholeJob(it, m, ch.sha), input: ch.input, threads: 4 }, band: SJ.bandOf(st, qj.itemId), audio_s: ch.audio_s, bytes: size });
      if (!st.qjobs[id] || !(await q.withdraw([id]))?.withdrawn) return;   // a home host took it meanwhile: it stays home
      withdrawn = true;
      await edge.enqueue([job]);
      delete st.qjobs[id];
      st.qjobs[job.id] = { ...qj, at: now(), where: 'edge' };
      moved++;
    } catch (e) {
      if (withdrawn && job) await q.enqueue([job]).catch(() => {});   // the edge refused a withdrawn step: back to the LAN, the talk is not lost
      else if (e.code === 'ABANDONED') throw e;
      st.q_move_prep_error = { at: now(), id, error: String(e.message).slice(0, 300) };
    }
  };
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () => {
    while (i < waiting.length && lanH > keepH && edgeH < wantH) {
      const [id, qj] = waiting[i++];
      lanH -= (qj.audio_s || 0) / 3600; edgeH += (qj.audio_s || 0) / 3600;
      await moveOne(id, qj);
    }
  }));
  return { moved, bytes, ...(skipped ? { resumed_files: skipped } : {}), ...(kept_lan ? { kept_lan } : {}) };
}

/** A waiting gpu step whose prep files are gone (404 from the results store: acked by an older failure path) can never run: withdraw it, drop
 *  the chain and queue the talk again from prep, once without counting it against the talk (the loss was ours); a repeat goes through retry(). */
// Only a step still QUEUED is lost: withdraw first, and a step a host leased or finished keeps its chain (10-31: the mover's snapshot said
// "waiting" for gpu-2488/2489 while aorus ran them and the pass adopted them, acking prep; the 404 then dropped live chains, so their
// finish steps failed "chain record lost" and the talks ran again from prep).
async function restartLost(st, id, qj, { q, repo, now }, error) {
  const ch = st.chains?.[qj.itemId] || {};
  if (!((await q.withdraw([id]).catch(() => null))?.withdrawn)) return false;
  const acks = SJ.AUDIO_TYPES.map((t) => ch[t]?.id).filter((x) => x && x !== id);
  if (acks.length) await q.ack(acks).catch(() => null);
  delete st.qjobs[id]; delete st.chains?.[qj.itemId];
  (st.lost_restarts ||= []).push({ at: now(), item: qj.itemId, job: id, error: String(error).slice(0, 200) });
  if (st.lost_restarts.length > 50) st.lost_restarts.splice(0, st.lost_restarts.length - 50);
  st.lost ||= {};
  if (!st.lost[qj.itemId]) { st.lost[qj.itemId] = 1; if (!st.queue.includes(qj.itemId)) st.queue.unshift(qj.itemId); }
  else await retry(st, qj, `prep files lost again: ${error}`, repo);
  return true;
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

/** The last sign of life of each queue agent (a lease heartbeat or a finished step), kept in the lane state across passes and restarts:
 *  an agent pod is judged dead only on this, never on ssh (media-jobs.js). */
export function seenAgent(st, host, at) {
  if (!host || !(at > 0)) return;
  st.agent_seen ||= {};
  if (!(st.agent_seen[host] >= at)) st.agent_seen[host] = at;
}
/** One background pass: pull first (frees R2 + gives back failures), then top the window up. */
export async function tick(st, deps) {
  const out = { pulled: await pull(st, deps) };
  const forgiven = forgiveOurs(st); if (forgiven.length) out.forgiven = forgiven;
  if (deps.typed && deps.edge && deps.rebalance !== false) {
    out.moved = await rebalanceGpu(st, deps).catch((e) => ({ error: String(e.message).slice(0, 200) }));
    out.moved_prep = await rebalancePrep(st, deps).catch((e) => ({ error: String(e.message).slice(0, 200) }));
  }
  out.fed = await feed(st, deps);
  out.leased = {}; out.beat = {};   // jobs each agent holds (machine cards) + its latest heartbeat (an agent pod is alive while it beats: media-jobs.js)
  // every job type: stats() alone reads 'media' only, so typed leases (cpu-prep, gpu, cpu-finish) were missing and the cards read {} (10-31)
  const all = await Promise.all(['media', ...SJ.AUDIO_TYPES].map((t) => Promise.resolve().then(() => deps.q.stats(t)).catch(() => null)));
  for (const j of all.flatMap((x) => x?.leased || [])) {
    out.leased[j.host] = (out.leased[j.host] || 0) + 1;
    out.beat[j.host] = Math.max(out.beat[j.host] || 0, j.updated || 0);
    seenAgent(st, j.host, j.updated);
  }
  return out;
}
