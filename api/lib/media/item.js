import {speakerKey} from './speaker-key.js';
import {audioVersion, audioAlignment, listeningVariant, markAudioPending, timingSignature} from './talk-audio.js';
// ONE MEDIA ITEM through the pipeline (planning/media-library-plan.md): archive → enhance → web → transcribe → correct →
// describe → headings → quotes → links → assess → thumb → render → ingest → catalog. Each stage writes its files into the item folder and records
// itself in meta.json (stages[name] = { at, ms, … }); a finished stage is skipped on the next run, so the job resumes after
// a crash or a drain. Originals are hard-linked read-only and never modified. Deps injected for tests (see `defaults`).
import { qualityOf } from './remaster-quality.js';
const towerStrict = () => process.env.MEDIA_REMASTER_STRICT === '1';   // STRICT: tower never reprocesses audio — set once the pre-worker backlog has drained
import { podPost, podComplete, resign as podResign, take as podTake, forget as podForget, podDir } from './pod-post.js';
import { late } from './late.js';
import { slotWait } from './tools.js';
import { mkdir, readFile, writeFile, rename, link, copyFile, chmod, stat, readdir } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename, extname, relative } from 'path';
import { slugify, makeSlug, parseMediaPath } from './names.js';
import { purgeTalk } from './edge-purge.js';
import { archiveSuperseded } from './supersede.js';
import { isRestored } from './talk-audio.js';
import { lightChain, probeStarts, chooseAsrInput, chooseListening, safeChain, listeningSource, OGG_ARGS, WEB_CODEC, OGG_ARGS_REMASTER, M4A_BITRATE_REMASTER, WEB_CODEC_REMASTER, isRemastered, remasterEligible } from './enhance.js';
import { computePeaks, normalizePeaks } from './peaks.js';
import { labelInterpreter, lossyWindows, spliceWindow, toParagraphs, paragraphText, assignSpeakers, smoothTurns, flattenWords } from './paragraphs.js';
import { revertInsertions } from './faithfulness.js';
import { repairParagraphLoops, publishProblems } from './loops.js';
import { fixMojibake } from './text-repair.js';
import { buildVocab, CORE_TERMS, promptTerms } from './vocab.js';
import { transcriptMarkdown, pageHtml } from './render.js';
import { defaultPlayback, youtubeDefault, YOUTUBE_GRANT, LEVELS } from './rights.js';
import { tileSvg } from './thumbs.js';
import { classifyScreen, screenEnabled, singleTurns } from './spkscreen.js';
import { cbPerson, cbVerdict } from './cb-date.js';
import { decide } from './exclusions.js';
import { gradeReport, asrConfidence, priorityOf } from './grade.js';
import { applyTagHints } from './tag-hints.js';

// tower's MODEL work (grade: DNSMOS/NISQA · enhance: DeepFilterNet) runs in TWO slots at 4 threads even when more items are
// in flight (10-22: four in parallel took on-tower search p90 to 5.3 s)
// two slots at 4 threads each = tower's 8-thread media budget (plan §12); one slot made enhance the compute lane's bottleneck
const TOWER_SLOTS = Math.max(1, Number(process.env.MEDIA_TOWER_SLOTS) || 2);
let towerBusy = 0;
const towerWait = [];
export async function towerSlot(fn) {
  while (towerBusy >= TOWER_SLOTS) await slotWait(towerWait, 'a tower slot');
  towerBusy++;
  try { return await fn(); } finally { towerBusy--; towerWait.shift()?.(); }
}

// tower's LIGHT work (ffmpeg chains and encodes, signal metrics: ≤ 2 threads each) in FOUR slots = the same 8 threads. Prep
// waits on the GPU host most of the time (grade, DeepFilterNet, probes run there): more prep workers, CPU still bounded
const LIGHT_SLOTS = Math.max(1, Number(process.env.MEDIA_LIGHT_SLOTS) || 4);
let lightBusy = 0;
const lightWait = [];
export async function towerLight(fn) {
  while (lightBusy >= LIGHT_SLOTS) await slotWait(lightWait, 'a light slot');
  lightBusy++;
  try { return await fn(); } finally { lightBusy--; lightWait.shift()?.(); }
}
// RE-RUNS of published talks (backfills: safe listening, speaker merge, relink — ~590 queued 10-23) get ONE tower slot of
// their own, so they never take the light slots from new talks' prep (18:40: the publish rate fell 30 → 20/h while they ran)
const RERUN_SLOTS = Math.max(1, Number(process.env.MEDIA_RERUN_SLOTS) || 1);
let rerunBusy = 0;
const rerunWait = [];
export async function rerunLight(fn) {
  while (rerunBusy >= RERUN_SLOTS) await slotWait(rerunWait, 'the re-run slot');
  rerunBusy++;
  try { return await fn(); } finally { rerunBusy--; rerunWait.shift()?.(); }
}

// REMASTER runs (the overnight UniPASE backfill, Chad 10-23) get their OWN tower pool for the word guard, realign and the
// re-encodes: in the one re-run slot they queued behind ~600 listening re-runs (a 54-min talk took 25 min). Night-time
// search load is low; MEDIA_REMASTER_SLOTS (4) bounds them.
const REMASTER_SLOTS = Math.max(1, Number(process.env.MEDIA_REMASTER_SLOTS) || 4);
let remasterBusy = 0;
const remasterWait = [];
export async function remasterSlot(fn) {
  while (remasterBusy >= REMASTER_SLOTS) await slotWait(remasterWait, 'a remaster slot');
  remasterBusy++;
  try { return await fn(); } finally { remasterBusy--; remasterWait.shift()?.(); }
}

/** The invented-second-speaker merge for one talk (spkmerge.js): titanet scores on tower (≤ 2 threads, a light slot).
 *  → { paragraphs, speakers, merged, summary } | null (one speaker, or nothing to score) */
async function mergeSpeakers(paragraphs, speakers, { dir, meta, tools, light = towerLight }) {
  const M = await import('./spkmerge.js');
  const spans = M.spansOf(paragraphs);
  if (!spans.mainKey || !Object.keys(spans.others).length || !tools.tool) return null;
  const { tmpdir } = await import('os');
  const f = join(tmpdir(), `spkmerge-${process.pid}-${Date.now()}.json`);
  await writeFile(f, JSON.stringify({ main: spans.main, others: spans.others }));
  try {
    const r = await light(() => tools.tool('spkmerge', join(dir, meta.original), { spans: f }, { threads: 2, timeoutMs: 30 * 60_000 }));
    const dec = M.decideMerge(r, spans);
    return { ...M.applyMerge(paragraphs, speakers, spans.mainKey, dec.merge), summary: dec.summary };
  } finally { await (await import('fs/promises')).unlink(f).catch(() => {}); }
}

// the speaker people (data/media-speaker-people.json), read once per process (the cb-date check)
let peopleMemo = null;
async function cbPeople() {
  if (!peopleMemo) peopleMemo = (await import('../ops/media-jobs.js')).loadSpeakerPeople().catch(() => []);
  return peopleMemo;
}

// the speaker PRESCREEN on tower: ~35 s wall / 70 s CPU at 2 threads for an hour of audio, two at a time
let screenBusy = 0;
const screenWait = [];
async function screenSlot(fn) {
  while (screenBusy >= 2) await slotWait(screenWait, 'a prescreen slot');
  screenBusy++;
  try { return await fn(); } finally { screenBusy--; screenWait.shift()?.(); }
}

// PUBLISH EARLY (Chad 10-22: "talks should be published as they are completed … start ingesting for search"): the core —
// transcript, name corrections, the copy-edit with its faithfulness check, a short description — is rendered, ingested for
// search and catalogued (published) at once; the enrichment (subheaders, quotes, links, audience + moments) follows and
// 'update' re-renders, re-ingests (only changed paragraphs: the ingester diffs) and re-catalogues the published talk in place
/** The completed stages as the catalogue keeps them (",archive,grade,…,"; LIKE '%,quotes,%' counts them). */
export const stagesDone = (stages = {}) => `,${STAGES.filter((s) => stages[s]?.at).join(',')},`;

/** Queue the search layers for one ingested media document (deduplicated by the ops queue: same job + params = one run). */
export async function searchFollowUp(docId, { queue = null } = {}) {
  const q = queue || (await import('../repos/ops-report-repo.js')).enqueue;
  await q('keyword-fill', { ids: [docId] }, 'media-ingest');
  await q('section-index', { ids: [docId] }, 'media-ingest');
  await q('phrase-index', { docs: [docId], maxUsd: 0.25, budgetKey: `media-phrase-index:${docId}` }, 'media-ingest');   // per-talk cap (10-23: one shared key stopped every talk after the first $0.25; a talk costs ~$0.001, max ~$0.009)
  return ['keyword-fill', 'section-index', 'phrase-index'];
}

// the speaker identities (data/media-speaker-people.json), loaded once per process
let speakerPeople = null;

export const STAGES = ['archive', 'grade', 'enhance', 'remaster', 'realign', 'web', 'transcribe', 'preview', 'diarize', 'trim', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog',
  'headings', 'quotes', 'links', 'assess', 'update'];
export const archiveRoot = () => process.env.MEDIA_ARCHIVE_ROOT || '/tank/media/library';
export const mediaRoot = () => process.env.MEDIA_SOURCE_ROOT || '/tank/media';
const TRADITION_DIR = { "Baha'i": 'bahai', Islam: 'islam' };

const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const readJson = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
// a temp name of its own per write: checkpoints saved by parallel probes must not share one (10-23)
let wseq = 0;
async function writeJson(p, v) { const t = `${p}.${process.pid}.${++wseq}.tmp`; await writeFile(t, JSON.stringify(v, null, 1)); await rename(t, p); }

/** The tradition a source path belongs to (first folder under the media root). */
export function traditionOf(path) {
  const rel = relative(mediaRoot(), path).split('/');
  return rel[0] && !rel[0].startsWith('..') ? rel[0] : "Baha'i";
}

async function defaults() {
  const tools = await import('./tools.js');
  const llm = await import('./llm.js');
  const repo = await import('../repos/media-repo.js');
  const youtube = await import('./youtube.js');
  const { isDraining } = await import('../drain.js');
  return { tools, llm, repo, youtube, now: () => new Date().toISOString(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), draining: async () => isDraining(), drainingNow: isDraining };
}

/** The link stage's lookups (server-side: bio set, identity lookup index, document finder, section index, link policy). */
async function linkDeps() {
  const [{ listBioPersons }, { mediaBiographyCandidates }, { findDocuments }, { findSections }, { linkFor }, {ensureBioSlug}] = await Promise.all([
    late('api/lib/bio.js'), import('./biography-candidates.js'), late('api/lib/docs-repo.js'), late('api/lib/repos/sections-repo.js'), late('api/lib/source-links.js'), late('api/lib/repos/bio-slug-repo.js')]);
  const bio = (await listBioPersons())?.persons || [];
  return { bio, additionalBio:await mediaBiographyCandidates(), personUrl:async id=>{const slug=await ensureBioSlug(id);return slug?`/biography/${slug}`:null;}, sections: (t) => findSections(t, { limit: 20 }), linkFor,
    find: async (t) => (await findDocuments(t, { limit: 12, fields: 'id,title,author,religion,collection,language,source_site,source_url,slug,paragraph_count,external_id' }))?.docs || [] };
}

/** The controlled vocabulary: curated core + the media-vocab job's names file (when built). */
export async function loadVocab(file = process.env.MEDIA_VOCAB_FILE || join(process.cwd(), 'data', 'media-vocab.json')) {
  const extra = (await readJson(file, { names: [] })).names || [];
  return buildVocab([CORE_TERMS, extra.map((x) => (typeof x === 'string' ? x : x.name))]);
}

/**
 * Run (or resume) one item. item: the media_items row. opts: { from (stage to redo from), only ([stages]), threads }.
 * → { slug, done: [stages run], meta } or { yielded: true } when the service drains between stages.
 */
export async function runItem(item, opts = {}, deps = {}) {
  // A container worker receives explicit local tools and a job-local catalogue
  // adapter. It must never import the production DB or acquire server clients.
  const d = { ...(deps.detachedWorker ? {} : await defaults()), ...deps };
  const { tools, llm, repo } = d;
  let meta = item.dir ? await readJson(join(item.dir, 'meta.json'), {}) : {};
  meta.audio_version = audioVersion(meta);
  if (item.published_at && meta.web_listening == null) meta.web_listening = listeningVariant(meta); // legacy published copy, before any source change
  meta.stages ||= {}; meta.cost ||= { usd: 0, calls: 0, in: 0, out: 0 };
  if (opts.from) for (const s of STAGES.slice(STAGES.indexOf(opts.from))) delete meta.stages[s];
  // redo: only these stages again (a back-fill of a new stage: [new, 'update'] — update re-renders, re-ingests, re-catalogues), the rest kept
  for (const s of opts.redo || []) if (STAGES.includes(s)) delete meta.stages[s];
  const spend = meta.cost;
  const done = [];
  let dir = item.dir;
  const save = async () => { if (dir) await writeJson(join(dir, 'meta.json'), meta); };
  const latencies = [];
  const threads = async () => {
    if (opts.threads) return opts.threads;
    for (let i = 0; i < 3; i++) latencies.push(await tools.searchLatency());
    return tools.threadsFor(latencies.slice(-6));
  };
  const vocab = await (d.loadVocab || loadVocab)();
  // polled by every long child process: a drain stops the stage at once (it is redone after the restart, finished stages are kept)
  const stop = d.drainingNow || (() => false);

  // a re-run of a published talk uses the re-run slot, never the light slots new talks' prep needs
  const slotLight = opts.remaster ? remasterSlot : (item.state === 'done' || meta.stages?.catalog?.at) && opts.redo ? rerunLight : towerLight;
  const heavySlot = opts.remaster ? remasterSlot : towerSlot;
  // INVENTED SECOND SPEAKERS on a published talk (media-speaker-merge): inside this run, so no other run races on its files
  if (opts.mergeSpeakers && dir && existsSync(join(dir, 'transcript.work.json'))) {
    const work = await readJson(join(dir, 'transcript.work.json'));
    const r = await mergeSpeakers(work.paragraphs || [], meta.speakers || {}, { dir, meta, tools, light: slotLight });
    if (r?.merged) { work.paragraphs = r.paragraphs; meta.speakers = r.speakers; await writeJson(join(dir, 'transcript.work.json'), work); }
    meta.speaker_merge = { ...(r?.summary ? { speakers: r.summary } : {}), merged: r?.merged || 0, at: d.now() };
    await save();
  }

  for (const stage of STAGES) {
    if (meta.stages[stage]?.at) continue;
    if (opts.only && !opts.only.includes(stage)) continue;
    if (await d.draining()) return { yielded: true, resume: { id: item.id, stage }, slug: meta.slug, done };   // stage: a resumed run never redoes its from/reslug
    // an EXCLUDED speaker (data/media-exclusions.json, Chad 10-23) — or a row media-exclude took out — goes no further
    const ex = decide({ speakers: [meta.speaker, item.speaker], title: meta.title || '', sourceTitle: meta.source?.title || '' })?.excluded
      || ((await repo.getMediaItem?.(item.id))?.state === 'excluded' ? { reason: 'excluded' } : null);
    if (ex) {
      await repo.updateMediaItem(item.id, { state: 'excluded', why: ex.reason });
      return { excluded: true, reason: ex.reason, slug: meta.slug, done };
    }
    // a Covenant-breaker BY DATE (cb-date.js; Chad 10-23): before the break → as normal; on or after → excluded; undated → held
    const cbp = cbPerson(meta.speaker || item.speaker, await (d.cbPeople ? d.cbPeople() : cbPeople()));
    if (cbp) {
      const v = cbVerdict(cbp.cb_from, meta.date || meta.year || item.year || null);
      if (v !== 'include') {
        const why = v === 'exclude' ? `covenant-breaker: recorded on or after ${cbp.cb_from} (${cbp.name})` : `review: ${cbp.name} talk with no recording date before/after ${cbp.cb_from} — Chad decides`;
        await repo.updateMediaItem(item.id, { state: v === 'exclude' ? 'excluded' : 'review', why });
        return { [v === 'exclude' ? 'excluded' : 'held']: true, reason: why, slug: meta.slug, done };
      }
    }
    const t0 = Date.now();
    // a published talk stays published while later stages (or a re-run) work on it
    await repo.updateMediaItem(item.id, { stage, state: item.state === 'done' || meta.stages.catalog?.at ? 'done' : 'running' });
    const rec = {};
    try {

    // a SUPERSEDED talk (media-supersede): the new original is linked in and probed; slug, title, speaker, tags and the folder stay
    if (stage === 'archive' && meta.supersede_pending && item.source_kind !== 'youtube') {
      const sup = await archiveSuperseded({ item, meta, dir, tools });
      Object.assign(meta, sup.patch);
      rec.superseded = meta.supersede_pending.n; delete meta.supersede_pending;
      markAudioPending(meta);
      await repo.updateMediaItem(item.id, { duration_s: sup.probe.duration_s, has_video: sup.probe.has_video, sha256: meta.source.sha256 });
      await applyTagHints(meta, sup.probe, { filename: item.source_ref });
    } else if (stage === 'archive') {
      const isYt = item.source_kind === 'youtube';
      let src = item.source_ref, probe, info = null, hints, download = null;
      if (isYt) {
        info = await (d.youtube.youtubeInfoAny || d.youtube.youtubeInfo)(item.source_ref);
        hints = { speaker: null, title: info.title, date: info.upload_date, year: info.upload_date ? Number(info.upload_date.slice(0, 4)) : null, collection: info.channel };
      } else {
        probe = await tools.ffprobe(src);
        // known speakers find a name written without a separator ("Khadem Forerunner 1985", QA 10-22)
        const known = d.repo?.listSpeakers ? (await d.repo.listSpeakers().catch(() => [])).map((x) => x.name).filter(Boolean) : [];
        hints = parseMediaPath(relative(join(mediaRoot(), traditionOf(src)), src).replace(/^talks\//, ''), { known });
      }
      const archiveSource = !isYt ? await readJson(`${src}.source.json`) : null;
      const named = await llm.nameItem({ rel: isYt ? `${info.channel} / ${info.title}` : relative(mediaRoot(), src), tags: isYt ? { description: info.description.slice(0, 600), tags: info.tags } : probe.tags,
        hints, duration: isYt ? info.duration_s : probe.duration_s }, { spend })
        // naming is a convenience: when the API cannot be reached the parsed path names the item (compute never waits on the internet)
        .catch(() => ({}));
      // the model's reading of path + tags wins when it answered (a folder name like "Misc Other" is not a speaker); the parsed
      // hints only when the model gave nothing
      const answered = !!(named.title || named.speaker);
      // …but a speaker written in the FILE NAME ("Grossmann - World Order 2 - …") stands when the model said nothing (10-21:
      // the model left Grossmann out and the slug lost him)
      const speaker = (answered ? named.speaker : null) || (hints.speakerFrom === 'file' || !answered ? hints.speaker : null) || null;
      const title = named.title || hints.title || basename(src, extname(src));
      const year = named.year || hints.year || null;
      let finalSlug = item.slug;
      if (!finalSlug) {
        const base = makeSlug({ speaker, title: hints.part && !new RegExp(`\\b${hints.part}\\b`).test(title) ? `${title} ${hints.part}` : title, year });
        finalSlug = base;
        for (let i = 2; await repo.slugTaken(finalSlug); i++) finalSlug = `${base}-${i}`;
      }
      const tradition = item.tradition || (isYt ? "Baha'i" : traditionOf(src));
      const collection = item.collection || (isYt ? (info.channel || 'YouTube') : (hints.collection || 'Talks'));
      dir = join(archiveRoot(), TRADITION_DIR[tradition] || slugify(tradition), slugify(collection) || 'talks', finalSlug);
      await mkdir(join(dir, 'original'), { recursive: true });
      let original;
      if (isYt) {
        const got = d.youtube.fetchAudio ? await d.youtube.fetchAudio(item.source_ref, join(dir, 'original'), { stop })
          : { path: await d.youtube.youtubeAudio(item.source_ref, join(dir, 'original')), route: 'yt-dlp' };
        original = got.path;
        download = { route: got.route, sha256: got.sha256 || null, usd: got.usd || 0, run_id: got.run_id || null, tried: got.tried || [], at: d.now() };
        if (got.usd) { spend.usd += got.usd; spend.download_usd = (spend.download_usd || 0) + got.usd; }
        probe = await tools.ffprobe(original);
        if (!info.duration_s) info.duration_s = probe.duration_s;
        await chmod(original, 0o444).catch(() => {});
      } else {
        // a HARD LINK shares the source's inode: never chmod it (that would change the source file too); a copy is made read-only
        original = join(dir, 'original', basename(src));
        if (!existsSync(original)) { try { await link(src, original); } catch { await copyFile(src, original); await chmod(original, 0o444).catch(() => {}); } }
      }
      const sha = item.sha256 || await sha256Of(original);
      meta = { ...meta, id: item.id, slug: finalSlug, title, speaker, date: named.date || hints.date || null, year, place: named.place || null, event: named.event || null,
        kind: named.kind || null, language_hint: named.language_hint || null, tradition, collection, series: hints.series || null, part: hints.part || null,
        duration_s: probe.duration_s, has_video: !!probe.has_video,
        source: isYt ? { kind: 'youtube', download, url: info.url, youtube_id: info.youtube_id, channel: info.channel, channel_id: info.channel_id, channel_url: info.channel_url, upload_date: info.upload_date, title: info.title, license: info.license }
          : { kind: 'file', path: src, sha256: sha, bytes: (await stat(original)).size, probe, ...(archiveSource ? { archive: archiveSource } : {}) },
        original: relative(dir, original), version: 1 };
      // container tags (ID3/MP4/Vorbis) = hints only: recorded, compared, never applied (api/lib/media/tag-hints.js)
      if (!isYt) await applyTagHints(meta, probe, { filename: src });
      // every YouTube channel gets its own permission record (Chad can switch one to clips/search if its owner objects)
      let channel = isYt && info.channel_id ? await repo.getChannel(info.channel_id) : null;
      if (isYt && info.channel_id && !channel) channel = await repo.upsertChannel({ channel_id: info.channel_id, name: info.channel, playback: youtubeDefault(), granted_by: YOUTUBE_GRANT });
      meta.rights = meta.rights || { playback: defaultPlayback({ sourceKind: item.source_kind, speaker, channel }), download: false,
        basis: isYt ? `channel ${info.channel}: ${channel?.playback || youtubeDefault()} (${channel?.granted_by || YOUTUBE_GRANT})` : 'Chad 10-22: everything plays from our own copy' };
      await repo.updateMediaItem(item.id, { slug: finalSlug, dir, title, speaker, tradition, collection, year, date: meta.date, duration_s: probe.duration_s, has_video: probe.has_video,
        sha256: sha, youtube_id: info?.youtube_id || null, channel: info?.channel || null, playback: meta.rights.playback });
      item = { ...item, dir, slug: finalSlug };
    }

    if (stage === 'grade') {
      // the recording's QUALITY, measured on the original before any processing (Chad 10-22): per-dimension grades and the
      // fix chain; intelligibility and per-speaker levels join after transcription (finishQuality, at catalog — or here
      // at once for an item that is already transcribed)
      // DNSMOS/NISQA on tower at ≤ 4 threads (models on short excerpts; tower's search must keep its normal latency)
      // detached (pid file): a service restart re-attaches instead of starting over
      // on the GPU host (aorus) when it answers, else a detached tower process; both re-attach after a restart
      if (!meta.grade_job) { meta.grade_job = `${meta.slug}-gr-${Date.now().toString(36)}`.slice(0, 110); await save(); }
      const needGb = tools.gradeNeedGb ? tools.gradeNeedGb(meta.duration_s, meta.source?.probe?.sample_rate) : null;   // a long talk goes to tower, not into aorus's OOM killer
      const m = tools.gpuOrTower ? await tools.gpuOrTower('grade', join(dir, meta.original), {}, { job: meta.grade_job, pidFile: join(dir, 'grade.pid'), stop, slot: towerSlot, needGb })
        : await towerSlot(() => tools.tool('grade', join(dir, meta.original), {}, { threads: 4, stop, timeoutMs: 3600_000 }));
      delete meta.grade_job;
      meta.quality = { measured_at: d.now(), raw: m, ...gradeReport(m) };
      if (existsSync(join(dir, 'transcript.raw.json'))) await finishQuality(meta, dir, d, item);
      rec.grade = meta.quality.overall; rec.primary_issue = meta.quality.primary_issue;
    }

    if (stage === 'enhance') {
      // CHECKPOINTED per step (10-23: every drain threw a half-done enhance away and 16 prep runs started over): each
      // finished step is recorded in meta.enh_ck and saved; a resumed stage skips it. Remote steps re-attach by job id.
      const ck = meta.enh_ck = meta.enh_ck || { probes: {} };
      const keep = async (k, v) => { ck[k] = v; await save(); return v; };
      const orig = join(dir, meta.original);
      const th = await threads();
      const m0 = ck.m0 || await keep('m0', await towerLight(() => tools.tool('metrics', orig, {}, { threads: 2, stop })));
      await mkdir(join(dir, 'enhanced'), { recursive: true });
      const light = join(dir, 'enhanced', 'light.flac');
      const chain = lightChain({ ...m0, sample_rate: meta.source?.probe?.sample_rate });
      const jobOf = (k) => { meta.enc_jobs = meta.enc_jobs || {}; meta.enc_jobs[k] = meta.enc_jobs[k] || `${meta.slug}-${k}-${Date.now().toString(36)}`.slice(0, 110); return meta.enc_jobs[k]; };
      const lightLocal = () => towerLight(() => tools.ffmpeg(['-i', orig, '-vn', '-ac', '1', '-ar', '48000', '-af', chain, '-c:a', 'flac', light], { stop }));
      if (!(ck.light && existsSync(light))) {
        if (tools.encodeRemote) { jobOf('lc'); await save(); await tools.encodeRemote('light', orig, light, { af: chain, job: meta.enc_jobs.lc, stop, local: lightLocal }); delete meta.enc_jobs.lc; }
        else await lightLocal();
        await keep('light', true);
      }
      const m1 = ck.m1 || await keep('m1', await towerLight(() => tools.tool('metrics', light, {}, { threads: 2, stop })));
      const variants = [{ name: 'original', file: orig, ...m0 }, { name: 'light', file: light, ...m1 }];
      if (!opts.noDfn && existsSync(tools.PY_DFN())) {
        const dfn = join(dir, 'enhanced', 'dfn.flac');
        if (!(ck.dfn && existsSync(dfn))) {
          if (!meta.dfn_job) { meta.dfn_job = `${meta.slug}-df-${Date.now().toString(36)}`.slice(0, 110); await save(); }
          if (tools.gpuOrTower) await tools.gpuOrTower('dfn', light, { output: dfn }, { job: meta.dfn_job, pidFile: join(dir, 'enhanced', 'dfn.pid'), python: tools.PY_DFN(), stop, file: true, slot: towerSlot });
          else await towerSlot(() => tools.tool('dfn', light, { output: dfn }, { python: tools.PY_DFN(), threads: 4, stop }));
          delete meta.dfn_job;
          await keep('dfn', true);
        }
        const mdfn = ck.mdfn || await keep('mdfn', await towerLight(() => tools.tool('metrics', dfn, {}, { threads: 2, stop })));
        variants.push({ name: 'dfn', file: dfn, ...mdfn });
      }
      const starts = probeStarts(meta.duration_s).join(',');
      const lang = /^[a-z]{2}$/.test(meta.language_hint || '') ? meta.language_hint : '';
      // the variants' probes at once (the GPU host's memory lock paces them); each result is kept as it arrives
      await Promise.all(variants.map(async (v) => {
        let p = ck.probes?.[v.name];
        if (!p) {
          const probe = (host) => tools.asr('probe', v.file, { model: 'large-v3-turbo', starts, len: 60, lang }, { stop, ...(host ? { host } : {}) });
          const r = tools.withProbeHost ? await tools.withProbeHost(probe, { long: (meta.duration_s || 0) > 5400 }) : await probe(tools.probeHost ? tools.probeHost() : null);
          p = { avg_logprob: r.avg_logprob, words: r.words, seconds: r.seconds, excerpts: (r.excerpts || []).map((e) => ({ language: e.language, text: e.text })) };
          ck.probes = { ...(ck.probes || {}), [v.name]: p }; await save();
        }
        Object.assign(v, { avg_logprob: p.avg_logprob, words: p.words, probe_s: p.seconds, sample: p.excerpts?.[0]?.text?.slice(0, 200), languages: p.excerpts?.map((e) => e.language) });
      }));
      const asr = chooseAsrInput(variants), listen = chooseListening(variants);
      // the listening copy: the original + the transparent chain, applied at encode time (no file of its own)
      variants.push({ name: 'safe', file: orig, af: safeChain(m0), chain: 'transparent: high-pass, hum notch when measured, loudness' });
      meta.enhancement = { chain, variants: variants.map(({ file, ...v }) => ({ ...v, file: relative(dir, file) })), asr_input: asr.name, asr_why: asr.why, listening: listen.name, listening_why: listen.why };
      delete meta.enh_ck;
      rec.threads = th;
    }

    if (stage === 'remaster') {
      // UNIPASE listening copy (Chad 10-23 approved by ear; planning/remaster-rnd-20261023.md): only on a remaster run
      // (media-remaster / the cloud backfill) — a normal run records the stage and moves on. The copy itself comes from the
      // cloud worker (enhanced/unipase.cloud.flac + its transcript); here the WORD GUARD splices the original back in for
      // every sentence the copy lost, and the verdict decides whether it becomes the listening copy (§13: never worse).
      // a keep / deferral stands against the generative copy; the deterministic cleanup (method 'cleaned') is a different thing and is allowed through
      if (opts.remaster && meta.enhancement && (!['kept', 'deferred'].includes(meta.remaster?.status) || (await podPost(dir, { needFlac: false }))?.method === 'cleaned')) {   // Chad's keep / deferral stands: a late cloud result changes nothing
        const work = await readJson(join(dir, 'transcript.work.json'), { paragraphs: [] });
        const el = remasterEligible(meta, work.paragraphs || []);
        const cloud = join(dir, 'enhanced', 'unipase.cloud.flac'), casr = join(dir, 'enhanced', 'unipase.asr.json');
        if (!el.ok) meta.remaster = { ...(meta.remaster || {}), status: 'skipped', why: el.why, at: d.now() };
        else if ((!existsSync(cloud) || !existsSync(casr)) && (await podPost(dir, { needFlac: false }))?.method !== 'cleaned') meta.remaster = { ...(meta.remaster || {}), status: 'waiting', why: 'no UniPASE copy yet', at: d.now() };
        else if (towerStrict() && !(await podComplete(dir))) meta.remaster = { ...(meta.remaster || {}), status: 'waiting', why: 'no valid worker result (transcript changed or missing): back to a worker', at: d.now() };   // tower never reprocesses audio
        else {
          const orig = meta.enhancement.variants.find((v) => v.name === 'original') || {};
          const out = join(dir, 'enhanced', 'unipase.flac'), report = join(dir, 'enhanced', 'unipase.guard.json');
          // the worker already ran the word guard (scripts/media/worker/post.py) when its transcript hash still matches: take it, no CPU here
          const pod = await podPost(dir);
          if (pod) { await podTake(dir, 'unipase.flac', out); await podTake(dir, 'unipase.guard.json', report).catch(() => {}); }
          const g = pod ? pod.guard : await heavySlot(() => tools.remasterGuard({ original: join(dir, meta.original), unipase: cloud, work: join(dir, 'transcript.work.json'), asr: casr,
            // the reference: the ORIGINAL through the same model + settings as the copy (pods), else the production transcript
            ref: existsSync(join(dir, 'enhanced', 'unipase.asr_orig.json')) ? join(dir, 'enhanced', 'unipase.asr_orig.json') : join(dir, 'transcript.raw.json'), af: safeChain(orig), output: out, report }, { stop }));
          // publish unless > 15 % of sentences fell back (the coordinator's review bar, 10-23); > 40 % is listed as 'high fallback'
          // for Chad to hear; the transparent copy stays. Chant / prayer the ASR cannot read is 'unguardable' and kept.
          const maxPct = Number(process.env.MEDIA_REMASTER_MAX_FALLBACK_PCT) || 15;
          const pass = !pod?.held && pod?.qa?.output_assessment?.passed !== false && (g.fallback_sent_pct ?? g.swapped_pct) <= maxPct;
          const vs = meta.enhancement.variants.filter((v) => v.name !== 'unipase');
          vs.push({ name: 'unipase', file: 'enhanced/unipase.flac', shifts_time: true, chain: pod?.method === 'cleaned' ? 'deterministic cleanup (MossFormer2-SE 60 %, mud cut, dereverb, de-ess) + word guard at −18 LUFS' : 'UniPASE (long-form, 48 kHz) + word guard (original for lost sentences) at −18 LUFS', guard: g });
          meta.enhancement.variants = vs;
          const listeningBefore = meta.enhancement.listening || 'safe';
          if (pass) {
            if (meta.enhancement.listening !== 'unipase') meta.enhancement.listening_before = { name: meta.enhancement.listening, why: meta.enhancement.listening_why || null };
            meta.enhancement.listening = 'unipase';
            meta.remaster_tier = pod?.method === 'cleaned' ? 'cleaned' : 'heavy';
            meta.enhancement.listening_why = `UniPASE remaster (Chad 10-23): ${g.swapped} of ${g.sentences} sentences (${g.swapped_pct} %) kept from the original by the word guard`;
          } else if (meta.enhancement.listening === 'unipase') {
            // held on a re-score: a remaster published under an older rule goes back to the copy before it
            meta.enhancement.listening = meta.enhancement.listening_before?.name || 'safe';
            meta.enhancement.listening_why = 'remaster held for review (word guard) — the previous copy restored';
            delete meta.remaster_tier;
          }
          if ((meta.enhancement.listening || 'safe') !== listeningBefore) markAudioPending(meta);
          meta.remaster = { status: pass ? 'done' : 'review', verdict: pass ? (pod?.method === 'cleaned' ? 'pass-cleaned' : 'pass-auto') : 'review', ...(pod?.method ? { method: pod.method } : {}), ...(pass ? {} : { why: pod?.qa?.output_assessment?.passed === false ? pod.qa.reason : `${g.fallback_sent_pct ?? g.swapped_pct} % of sentences fell back (> ${maxPct} %): still playing the original audio — a human listens` }),
            swapped: g.swapped, sentences: g.sentences, swapped_pct: g.swapped_pct, fallback_sent_pct: g.fallback_sent_pct ?? null, unguardable_s: g.unguardable_s ?? null, lag_ms: g.lag_ms, cloud: await readJson(join(dir, 'enhanced', 'unipase.done.json'), null), at: d.now() };
          rec.remaster = meta.remaster.verdict; rec.swapped_pct = g.swapped_pct;
          meta.qa = { ...(meta.qa || {}), remaster: pod?.qa ? { ...pod.qa, at: new Date().toISOString() } : qualityOf(meta) };   // the worker decided the verdict; tower records it
        }
      }
    }

    if (stage === 'realign') {
      // WORD TIMES follow the listening copy (§15): a remaster shifts timing 5–60 ms, so the final text is force-aligned on it
      // (no transcription); the original times stay on every word as s0 / e0 (the "Original" button). A copy the aligner
      // cannot place (> 2 % of words) goes back to the transparent copy. Back on the original → the s0 / e0 times return.
      const work = await readJson(join(dir, 'transcript.work.json'), null);
      let podSigned = false;   // the worker's result was valid for the transcript before this alignment: re-sign it for the aligned one
      if (work?.paragraphs?.length && meta.enhancement) {
        const target = meta.enhancement.listening;
        const workerAlignment = target === 'unipase' ? await podPost(dir, { needFlac: false }) : null;
        if (isRemastered(meta) && (meta.aligned_to !== target || workerAlignment?.realign)) {
          const v = meta.enhancement.variants.find((x) => x.name === target);
          const out = join(dir, 'enhanced', 'realign.json');
          // the worker's alignment of THIS transcript on the guarded copy, when it ran (post.py): no alignment CPU on tower
          const pod = workerAlignment;
          const podAligned = pod?.realign && existsSync(join(podDir(dir), 'realign.json'));
          if (podAligned) await podTake(dir, 'realign.json', out);
          podSigned = !!pod;
          const r = podAligned ? pod.realign : await heavySlot(() => tools.tool('realign', join(dir, v.file), { segments: join(dir, 'transcript.work.json'), output: out }, { threads: 4, stop, timeoutMs: 3 * 3600_000 }));
          const times = (await readJson(out, { times: {} })).times || {};
          const unplaced = r.total ? 1 - r.placed / r.total : 1;
          if (unplaced > 0.02) {
            meta.enhancement.listening = meta.enhancement.listening_before?.name || 'safe';
            meta.remaster = { ...(meta.remaster || {}), status: 'review', verdict: 'review', why: `realign placed ${r.placed} of ${r.total} words — still playing the original audio`, realign_unplaced_pct: Math.round(unplaced * 10000) / 100, at: d.now() };
            meta.qa = { ...(meta.qa || {}), remaster: qualityOf(meta) };
            // The transcript's existing s/e values may belong to the remaster. Revert them to the saved original
            // timings when available; otherwise leave publication blocked until a successful safe-copy realignment.
            let restored = true;
            for (const p of work.paragraphs) {
              for (const w of p.words || []) { if (w.s0 == null) restored = false; else { w.s = w.s0; w.e = w.e0; } }
              const ts = p.words.filter((w) => w.s != null);
              if (ts.length) { p.t0 = ts[0].s; p.t1 = ts[ts.length - 1].e; }
            }
            if (restored) meta.aligned_to = 'safe';
            markAudioPending(meta);
          } else {
            for (const p of work.paragraphs) {
              const tm = times[String(p.n)] || [];
              p.words.forEach((w, i) => { if (w.s0 === undefined) { w.s0 = w.s; w.e0 = w.e; } if (tm[i]) { w.s = tm[i][0]; w.e = tm[i][1]; } });
              const ts = p.words.filter((w) => w.s != null);
              if (ts.length) { p.t0 = ts[0].s; p.t1 = ts[ts.length - 1].e; }
            }
            meta.aligned_to = target;
            rec.realigned = r.placed;
            meta.remaster = { ...(meta.remaster || {}), realign_unplaced_pct: Math.round(unplaced * 10000) / 100 };
          }
        } else if (!isRemastered(meta) && meta.aligned_to && meta.aligned_to !== 'safe') {
          for (const p of work.paragraphs) {
            p.words.forEach((w) => { if (w.s0 !== undefined) { w.s = w.s0; w.e = w.e0; delete w.s0; delete w.e0; } });
            const ts = p.words.filter((w) => w.s != null);
            if (ts.length) { p.t0 = ts[0].s; p.t1 = ts[ts.length - 1].e; }
          }
          meta.aligned_to = 'safe';
        }
        meta.audio_alignment_hash = timingSignature(work.paragraphs);
        const alignment = audioAlignment(meta, { allowPending: true });
        meta.audio_alignment_version = alignment.ready ? alignment.audio_version : null;
        // moments follow their words (i1 exclusive)
        const byN = new Map(work.paragraphs.map((p) => [p.n, p]));
        for (const m of meta.moments || []) { const p = byN.get(m.para); if (p?.words?.[m.i0]?.s != null && p.words[m.i1 - 1]?.e != null) { m.t0_ms = Math.round(p.words[m.i0].s * 1000); m.t1_ms = Math.round(p.words[m.i1 - 1].e * 1000); } }
        await writeJson(join(dir, 'transcript.work.json'), work);
        if (podSigned) await podResign(dir);
      }
    }

    if (stage === 'web') {
      delete meta.trim;   // fresh, untrimmed web copies (the 'trim' stage cuts them again from the words)
      const published = !!(meta.stages?.catalog?.at || item.published_at);
      const nextAudioVersion = published ? audioVersion(meta) + 1 : audioVersion(meta);
      markAudioPending(meta); // don't let a lazy R2 fill see a half-written file under either version
      const { src, af } = listeningSource(meta, dir);   // the original + the transparent chain (Chad 10-23), or the remaster
      const remastered = isRemastered(meta);
      const afArgs = af ? ['-af', af] : [];
      await mkdir(join(dir, 'web'), { recursive: true });
      const ogg = join(dir, 'web', `${meta.slug}.ogg`), m4a = join(dir, 'web', `${meta.slug}.m4a`);
      // the worker's four encodes of this remaster (post.py), when its transcript hash still matches and the listening copy is the guarded one
      const podW = remastered && meta.enhancement?.listening === 'unipase' ? await podPost(dir, { needFlac: false }) : null;
      const podWeb = podW?.web && ['ogg', 'm4a', 'orig_ogg', 'orig_m4a'].every((k) => existsSync(join(podDir(dir), 'web', podW.web[k]))) ? podW.web : null;
      if (podWeb && podW.trim) { meta.trim = podW.trim; meta.worker_trim = podW.trim; }
      // every web encode goes to the worker pool first (pods, boss): tower's bounded local slot is only the no-pool fallback (Chad 10-24)
      meta.enc_jobs = meta.enc_jobs || {};
      const encJob = (k) => (meta.enc_jobs[k] = meta.enc_jobs[k] || `${meta.slug}-${k}-${Date.now().toString(36)}`.slice(0, 110));
      const webEnc = (k, recipe, inp, outp, afStr, localFn) => (tools.encodeRemote ? tools.encodeRemote(recipe, inp, outp, { af: afStr || '', job: encJob(k), stop, local: localFn }) : localFn());
      const oggLocal = () => slotLight(() => tools.ffmpeg(['-i', src, '-map', '0:a:0', '-vn', ...afArgs, '-ac', '1', '-ar', '48000', ...(remastered ? OGG_ARGS_REMASTER : OGG_ARGS), ogg], { stop }));
      const m4aLocal = () => slotLight(() => tools.ffmpeg(['-i', src, '-map', '0:a:0', '-vn', ...afArgs, '-ac', '1', '-ar', remastered ? '48000' : '44100', '-c:a', 'aac', '-b:a', remastered ? M4A_BITRATE_REMASTER : '64k', '-movflags', '+faststart', m4a], { stop }));
      // the ORIGINAL (transparent) copy beside a remaster — the talk page's "Original" button (audio.original_url)
      if (podWeb) {
        for (const [k, dst] of [['ogg', ogg], ['m4a', m4a], ['orig_ogg', join(dir, 'web', `${meta.slug}.original.ogg`)], ['orig_m4a', join(dir, 'web', `${meta.slug}.original.m4a`)]]) await podTake(dir, join('web', podWeb[k]), dst);
        meta.web_original = { ogg: `web/${meta.slug}.original.ogg`, m4a: `web/${meta.slug}.original.m4a` };
      } else if (remastered) {
        const safeSrc = listeningSource({ ...meta, enhancement: { ...meta.enhancement, listening: 'safe' } }, dir);
        const oo = join(dir, 'web', `${meta.slug}.original.ogg`), om = join(dir, 'web', `${meta.slug}.original.m4a`);
        const sa = safeSrc.af ? ['-af', safeSrc.af] : [];
        await save();
        await Promise.all([webEnc('oogg', 'ogg', safeSrc.src, oo, safeSrc.af, () => slotLight(() => tools.ffmpeg(['-i', safeSrc.src, '-map', '0:a:0', '-vn', ...sa, '-ac', '1', '-ar', '48000', ...OGG_ARGS, oo], { stop }))),
          webEnc('om4a', 'm4a', safeSrc.src, om, safeSrc.af, () => slotLight(() => tools.ffmpeg(['-i', safeSrc.src, '-map', '0:a:0', '-vn', ...sa, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', om], { stop })))]);
        meta.web_original = { ogg: `web/${meta.slug}.original.ogg`, m4a: `web/${meta.slug}.original.m4a` };
      } else if (meta.remaster_tier !== 'light') delete meta.web_original;   // the light tier keeps its raw-original encodes across re-runs
      if (!podWeb) {
        await save();
        await Promise.all([webEnc('ogg', remastered ? 'oggR' : 'ogg', src, ogg, af, oggLocal), webEnc('m4a', remastered ? 'm4aR' : 'm4a', src, m4a, af, m4aLocal)]);
      }
      delete meta.enc_jobs;
      meta.web_codec = remastered ? WEB_CODEC_REMASTER : WEB_CODEC;   // the encode settings these copies were made with
      // the DURATION from the web encode (QA 10-22: the original's header under-reported by ~6 s on 31 talks)
      const enc = podW?.waveform_file ? { duration_s: podW.duration_s } : tools.ffprobe ? await tools.ffprobe(m4a).catch(() => null) : null;
      if (enc?.duration_s && enc.duration_s > (meta.duration_s || 0)) meta.duration_s = Math.round(enc.duration_s * 100) / 100;
      if (podWeb && podW.waveform_file) {
        await podTake(dir, podW.waveform_file, join(dir, 'waveform.json'));
      } else {
      const parts = [];
      await tools.pcmStream(ogg, 8000, (f) => parts.push(f));
      const all = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
      let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      await writeJson(join(dir, 'waveform.json'), normalizePeaks(computePeaks(all, 8000, { pixelsPerSecond: 20 })));
      }
      if (podWeb) await podForget(dir);
      rec.bytes = { ogg: (await stat(ogg)).size, m4a: (await stat(m4a)).size };
      meta.audio_version = nextAudioVersion;
      meta.web_listening = listeningVariant(meta);
      const alignedTarget = meta.aligned_to || meta.web_listening;
      meta.audio_alignment_version = alignedTarget === meta.web_listening ? meta.audio_version : null;
    }

    if (stage === 'transcribe') {
      const v = meta.enhancement.variants.find((x) => x.name === meta.enhancement.asr_input);
      // LANGUAGE ID on six unforced excerpts (the probe ran with the hinted language forced, so it always "heard" English —
      // 10-21: Furútan's interpreted talk looked English-only). Two languages heard clearly → an INTERPRETED talk
      // (Persian + English, Chad's English + Romanian) → per-speaker-block language (media_tool.py --lang multi)
      // twelve SHORT windows (12 s): an interpreter alternates every few sentences, and a 30 s window hears only the
      // dominant language (10-22: Chad's English + Romanian talk read as English in six 30 s windows)
      if (!meta.languages?.length || meta.languages.length < 12) {
        const starts = probeStarts(meta.duration_s, 12, 12).join(',');
        // on aorus first (a 12-window language ID is seconds on its GPU; on a loaded boss it held ASR lane workers before
        // they could dispatch — 12:29)
        const lid = (host) => tools.asr('langid', join(dir, meta.original), { model: 'large-v3-turbo', starts, len: 12 }, { stop, ...(host ? { host } : {}) });
        // NOT through the probe pool: 16 prep runs' probes fill it, and an ASR worker waiting there leaves aorus's
        // transcription slots empty (13:29: aorus idle with 6 talks waiting) — straight to the GPU host, boss if it fails
        const li = await lid(tools.gpuHost ? tools.gpuHost() : null).catch(() => lid(null)).catch(() => null);
        meta.languages = (li?.excerpts || []).map((e) => ({ at: e.start, language: e.language, prob: e.prob }));
      }
      const heard = meta.languages.filter((x) => x.prob >= 0.6).map((x) => x.language);
      const langs = heard.length ? heard : (v?.languages || []);
      const counts = langs.reduce((a, l) => ({ ...a, [l]: (a[l] || 0) + 1 }), {});
      const mixed = Object.values(counts).filter((n) => n >= 2).length > 1;   // two languages, each heard at least twice
      const top = Object.entries(langs.reduce((a, l) => ({ ...a, [l]: (a[l] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0];
      const lang = opts.lang || (mixed ? 'multi' : (top || (/^[a-z]{2}$/.test(meta.language_hint || '') ? meta.language_hint : '')));
      const prompt = `${meta.title}${meta.speaker ? ` — a talk by ${meta.speaker}` : ''}. ${promptTerms({ title: meta.title, speaker: meta.speaker }, vocab).join(', ')}.`;
      const th = await threads();
      const out = join(dir, 'transcript.raw.json');
      // ASR (detached boss job) and DIARIZATION (attached, also on boss: 10-22 watch) AT THE SAME TIME (10-21: diarization inside
      // the ASR run itself took 1,473 of 2,198 s, so they stay two processes);
      // an interpreted talk diarizes on boss first (its speaker blocks choose each block's language)
      const multi = lang === 'multi';
      const turnsFile = join(dir, 'diarization.json');
      // both run DETACHED (10-22: deploys every few minutes kept killing a 15-minute transcription): the boss job and the
      // tower diarization keep running through a drain, and the resumed stage re-attaches to them (meta.asr_job, the pid
      // file). allSettled: neither is left behind when the other fails.
      const asrOpts = { model: opts.model || process.env.MEDIA_ASR_MODEL || 'large-v3-turbo', lang, prompt: lang === 'en' || lang === '' ? prompt : '', diarize: multi, output: out, batch: 8 };
      let slot = null;
      if (!meta.asr_job?.id) {
        // a NEW transcription waits for a free slot on a host (aorus first) and holds it until its ASR job ends
        slot = tools.acquireAsrHost ? await tools.acquireAsrHost(undefined, { stop }) : null;
        meta.asr_job = { id: `${meta.slug}-${Date.now().toString(36)}`.slice(0, 110), host: slot ? slot.host : (tools.pickAsrHost ? tools.pickAsrHost() : (tools.asrHost ? tools.asrHost() : null)) }; await save();
        // the DISPATCH log: which host took the transcription and the load it saw (10-22: 'why is aorus idle?')
        console.info(`[media] dispatch transcribe ${meta.slug} → ${meta.asr_job.host} (${tools.asrPickReason ? tools.asrPickReason(meta.asr_job.host) : 'single host'})`);
      } else console.info(`[media] re-attach transcribe ${meta.slug} → ${meta.asr_job.host} (job ${meta.asr_job.id})`);
      const viaJob = async () => {
        if (!tools.asrJob || !meta.asr_job.host) { slot?.release(); return tools.asr('transcribe', join(dir, v.file), asrOpts, { timeoutMs: 12 * 3600_000, stop }); }
        try { return await tools.asrJob(join(dir, v.file), asrOpts, { host: meta.asr_job.host, job: meta.asr_job.id, stop, reserved: !!slot }); }
        catch (err) { if (err.code === 'DRAIN' || !/ssh exit 255|Connection|timed out|No route/i.test(err.message)) throw err; return tools.asr('transcribe', join(dir, v.file), asrOpts, { timeoutMs: 12 * 3600_000, stop }); }
        finally { slot?.release(); slot = null; }   // the transcription slot is held only while the ASR job runs
      };
      // the ASR ONLY (10-23 04:29: a run that also waited on its diarization held an ASR lane worker for 20 min while the GPU
      // sat idle); diarization is its own stage and lane ('diarize', media-diar)
      const r = await viaJob();
      delete meta.asr_job;
      meta.asr_lang = lang;
      const raw = await readJson(out);
      // stretches Whisper decoded to invalid bytes (U+FFFD) are RE-TRANSCRIBED on their own (a window with 1.5 s either side,
      // in that stretch's language); still lossy after that, the bytes are dropped later (flattenWords)
      const lossy = lossyWindows(raw.segments || []);
      if (lossy.length && tools.asr) {
        const { tmpdir } = await import('os');
        const { unlink } = await import('fs/promises');
        rec.lossy_windows = lossy.length; rec.lossy_fixed = 0;
        for (const wdw of lossy.slice(0, 12).reverse()) {   // from the end, so earlier indexes stay valid
          const start = Math.max(0, wdw.s - 1.5), wav = join(tmpdir(), `media-win-${process.pid}-${Date.now()}-${wdw.i0}.wav`), wout = `${wav}.json`;
          try {
            await tools.ffmpeg(['-ss', String(start), '-t', String(wdw.e - start + 1.5), '-i', join(dir, v.file), '-ac', '1', '-ar', '16000', wav], { stop });
            await tools.asr('transcribe', wav, { model: asrOpts.model, lang: wdw.lang || (lang === 'multi' ? '' : lang), output: wout, batch: 8 }, { stop });
            const fresh = (await readJson(wout, { segments: [] })).segments || [];
            if (fresh.length && !lossyWindows(fresh).length) { raw.segments = spliceWindow(raw.segments, wdw, fresh, start); rec.lossy_fixed++; }
          } catch (err) { rec.lossy_error = String(err.message).slice(0, 200); }
          finally { await unlink(wav).catch(() => {}); await unlink(wout).catch(() => {}); }
        }
        await writeJson(out, raw);
      }
      void turnsFile;
      meta.language = raw.language; meta.asr = { model: raw.model, language: raw.language, languages: raw.languages, mode: lang === 'multi' ? 'interpreted' : 'single', prompt: raw.prompt,
        aligned: raw.aligned, align_score: raw.align_score, timings: raw.timings, host: r.host || 'tower', threads: r.host ? null : th, rtf: Math.round((r.seconds / Math.max(1, raw.duration_s)) * 1000) / 1000, input: meta.enhancement.asr_input,
        speakers: new Set((raw.turns || []).map((t) => t.speaker)).size };
      rec.rtf = meta.asr.rtf;
    }

    if (stage === 'preview') {
      // Compare both the opening and a middle sample. A shared lecture-series introduction is only overlap; Dewey only
      // marks an automatic duplicate when both independent regions match, otherwise an opening match is a review hold.
      const raw = await readJson(join(dir, 'transcript.raw.json'), { segments: [] });
      const text = (raw.segments || []).map((s) => s.text || (s.words || []).map((w) => w.w || '').join(' ')).join(' ');
      const verdict = await (await import('./preview.js')).previewVerdict({ text, duration_s: meta.duration_s, title: meta.title, excludeId: item.id }, { repo });
      meta.dedup = { ...verdict, at: d.now() };
      rec.dedup = meta.dedup;
      await save();
      if (verdict.verdict === 'duplicate') {
        const why = `Dewey duplicate of ${verdict.of} (${verdict.by}, score ${verdict.score})`;
        await repo.updateMediaItem(item.id, { state: 'duplicate', why, stage: 'preview' });
        return { duplicate: true, of: verdict.of, score: verdict.score, slug: meta.slug, done };
      }
      if (verdict.verdict === 'review') {
        const why = `Dewey transcript overlap with ${verdict.of} (score ${verdict.score}); review before publication`;
        await repo.updateMediaItem(item.id, { state: 'review', why, stage: 'preview' });
        return { review: true, of: verdict.of, score: verdict.score, slug: meta.slug, done };
      }
    }

    if (stage === 'diarize') {
      // WHO SPEAKS WHEN, on its own lane: boss's CPU first (32 threads), aorus's CPU only when boss is full (1 at a time, so
      // its CPU keeps feeding its GPU). An interpreted talk was diarized inside its transcription; a transcript that already
      // has turns (made before this stage existed) is left as it is.
      const out = join(dir, 'transcript.raw.json'), turnsFile = join(dir, 'diarization.json');
      const raw = await readJson(out);
      const v = meta.enhancement.variants.find((x) => x.name === meta.enhancement.asr_input);
      // SPEAKER PRESCREEN (10-23): a monologue (one voice in every 10-s window) skips full diarization — one turn, the named
      // speaker. 'multi' / 'unsure' diarize as before; MEDIA_SPK_PRESCREEN=0 turns it off. Not for a job already dispatched.
      if (meta.asr_lang !== 'multi' && !(raw.turns || []).length && !meta.diar_job?.id && !meta.spkscreen && screenEnabled() && tools.tool) {
        try {
          const r = await screenSlot(() => tools.tool('spkscreen', join(dir, v.file), { segments: out }, { threads: 2, timeoutMs: 30 * 60_000, stop }));
          meta.spkscreen = { ...classifyScreen({ sims: r.sims || [], title: meta.title, series: meta.series, asrLang: meta.asr_lang, texts: (raw.segments || []).map((g) => g.text) }), seconds: r.seconds, at: new Date().toISOString() };
        } catch (err) {
          if (err?.code === 'DRAIN') throw err;
          meta.spkscreen = { verdict: 'unsure', reason: `prescreen failed: ${String(err.message).slice(0, 160)}`, at: new Date().toISOString() };
        }
        await save();
        console.info(`[media] prescreen ${meta.slug}: ${meta.spkscreen.verdict} (${meta.spkscreen.reason})`);
      }
      if (meta.asr_lang !== 'multi' && !(raw.turns || []).length && meta.spkscreen?.verdict === 'single' && screenEnabled() && !meta.diar_job?.id) {
        raw.turns = singleTurns(meta.duration_s || raw.duration_s);
        await writeJson(turnsFile, { turns: raw.turns, prescreen: meta.spkscreen });
        raw.segments = assignSpeakers(raw.segments, raw.turns);
        await writeJson(out, raw);
        rec.prescreen = 'single';
      } else if (meta.asr_lang !== 'multi' && !(raw.turns || []).length) {
        if (!meta.diar_job?.id) { meta.diar_job = { id: `${meta.slug}-dz-${Date.now().toString(36)}`.slice(0, 110), host: tools.pickDiarHost ? tools.pickDiarHost() : (tools.diarHost ? tools.diarHost() : null) }; await save(); }
        console.info(`[media] diarize ${meta.slug} → ${meta.diar_job.host || 'none'} (job ${meta.diar_job.id})`);
        // a failed (or cancelled) diarization is dispatched afresh next time — never re-attached to the dead job on its host
        if (tools.diarize) {
          try { await tools.diarize(join(dir, v.file), turnsFile, { pidFile: join(dir, 'diarization.pid'), job: meta.diar_job.id, stop, host: meta.diar_job.host || 'none', threads: 4, deps: { onHost: async (h) => { meta.diar_job.host = h; await save(); console.info(`[media] diarize ${meta.slug} moved → ${h} (its host was full)`); } } }); }
          catch (err) { if (err?.code !== 'DRAIN') { delete meta.diar_job; await save(); } throw err; }
        }
        else await tools.tool('diarize', join(dir, v.file), { output: turnsFile }, { threads: 4, timeoutMs: 6 * 3600_000, stop });
        delete meta.diar_job;
        raw.turns = smoothTurns((await readJson(turnsFile, { turns: [] })).turns || []);
        raw.segments = assignSpeakers(raw.segments, raw.turns);
        await writeJson(out, raw);
      }
      rec.speakers = new Set((raw.turns || []).map((t) => t.speaker)).size;
      if (meta.asr) meta.asr.speakers = rec.speakers;
    }

    if (stage === 'trim' && meta.worker_trim) {
      meta.trim = meta.worker_trim; delete meta.worker_trim;
      rec.lead_s = meta.trim.lead_s; rec.gaps = (meta.trim.gaps || []).length; rec.worker = true;
    } else if (stage === 'trim') {
      // LEADING / TRAILING SILENCE off the WEB copies only (the master is never touched); inner dead gaps marked to skip.
      // All times stay original; the player, the clip cut and the short cut convert with trim.js webTime()
      const T = await import('./trim.js');
      const raw = await readJson(join(dir, 'transcript.raw.json'), { segments: [] });
      const { peaks, pps } = T.peaksOf(await readJson(join(dir, 'waveform.json'), null));
      const plan = T.trimPlan({ words: flattenWords(raw.segments || []), peaks, pps, duration: meta.duration_s });
      rec.lead_s = plan.lead_s; rec.gaps = plan.gaps.length;
      const cutting = plan.start_s > 0 || plan.end_s != null;
      if (cutting) {
        markAudioPending(meta);
        await save();
        const ls = listeningSource(meta, dir);   // the same source and transparent chain as the web stage, then the trim's fades
        const src = ls.src, { pre, af: trimAf } = T.trimArgs(plan, meta.duration_s);
        const af = [ls.af, trimAf].filter(Boolean).join(',');
        const ogg = join(dir, 'web', `${meta.slug}.ogg`), m4a = join(dir, 'web', `${meta.slug}.m4a`);
        // the cut goes to the worker pool too (media_tool encode --ss/--t, recipes ogg / oggR / m4a / m4aR): tower's local slot is only the no-pool fallback
        const win = { ss: Number(pre[1]), t: Number(pre[3]) };
        const rem = isRemastered(meta);
        meta.enc_jobs = meta.enc_jobs || {};
        const tj = (k) => (meta.enc_jobs[k] = meta.enc_jobs[k] || `${meta.slug}-${k}-${Date.now().toString(36)}`.slice(0, 110));
        const trimEnc = (k, recipe, inp, outp, afStr, localFn) => (tools.encodeRemote ? tools.encodeRemote(recipe, inp, outp, { af: afStr, job: tj(k), stop, window: win, local: localFn }) : localFn());
        await save();
        await Promise.all([
          trimEnc('togg', rem ? 'oggR' : 'ogg', src, `${ogg}.trim.ogg`, af, () => slotLight(() => tools.ffmpeg([...pre, '-i', src, '-map', '0:a:0', '-vn', '-af', af, '-ac', '1', '-ar', '48000', ...(isRemastered(meta) ? OGG_ARGS_REMASTER : OGG_ARGS), `${ogg}.trim.ogg`], { stop }))),
          trimEnc('tm4a', rem ? 'm4aR' : 'm4a', src, `${m4a}.trim.m4a`, af, () => slotLight(() => tools.ffmpeg([...pre, '-i', src, '-map', '0:a:0', '-vn', '-af', af, '-ac', '1', '-ar', isRemastered(meta) ? '48000' : '44100', '-c:a', 'aac', '-b:a', isRemastered(meta) ? M4A_BITRATE_REMASTER : '64k', '-movflags', '+faststart', '-f', 'mp4', `${m4a}.trim.m4a`], { stop })))]);
        await rename(`${ogg}.trim.ogg`, ogg); await rename(`${m4a}.trim.m4a`, m4a);
        // the ORIGINAL copy beside a remaster gets the same cut (one audio.offset_s serves both)
        if (meta.web_original) {
          const so = listeningSource({ ...meta, enhancement: { ...meta.enhancement, listening: 'safe' } }, dir);
          const af2 = [so.af, trimAf].filter(Boolean).join(',');
          const oo = join(dir, meta.web_original.ogg), om = join(dir, meta.web_original.m4a);
          await Promise.all([
            trimEnc('toogg', 'ogg', so.src, `${oo}.trim.ogg`, af2, () => slotLight(() => tools.ffmpeg([...pre, '-i', so.src, '-map', '0:a:0', '-vn', '-af', af2, '-ac', '1', '-ar', '48000', ...OGG_ARGS, `${oo}.trim.ogg`], { stop }))),
            trimEnc('tom4a', 'm4a', so.src, `${om}.trim.m4a`, af2, () => slotLight(() => tools.ffmpeg([...pre, '-i', so.src, '-map', '0:a:0', '-vn', '-af', af2, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', `${om}.trim.m4a`], { stop })))]);
          await rename(`${oo}.trim.ogg`, oo); await rename(`${om}.trim.m4a`, om);
        }
        delete meta.enc_jobs;
        meta.audio_version = audioVersion(meta) + 1;   // immutable new key; the old key can never be filled from these new bytes
        meta.web_listening = listeningVariant(meta);
        const alignedTarget = meta.aligned_to || meta.web_listening;
        meta.audio_alignment_version = alignedTarget === meta.web_listening ? meta.audio_version : null;
        rec.trimmed_s = Math.round(((plan.start_s || 0) + (plan.end_s != null ? meta.duration_s - plan.end_s : 0)) * 10) / 10;
      }
      meta.trim = cutting || plan.gaps.length ? { start_s: plan.start_s, end_s: plan.end_s, gaps: plan.gaps, lead_s: plan.lead_s, tail_s: plan.tail_s, at: new Date().toISOString() } : null;
      if (!meta.trim) delete meta.trim;
    }

    if (stage === 'correct') {
      const raw = await readJson(join(dir, 'transcript.raw.json'));
      // ASR LOOPS repaired before anything reads the words (QA 10-22: "Karend" ×49, "Bahá'áááá…"): repeats hidden, runs collapsed
      const lp = repairParagraphLoops(toParagraphs(raw.segments));
      const paras = lp.paragraphs;
      rec.asr_loops_repaired = lp.repaired.length; meta.asr_loops_repaired = lp.repaired.length;
      const res = await llm.correctParagraphs(paras, vocab, { spend });
      // faithfulness: anything the pass added to what was heard is reverted to the heard words (10-22 "(Vol II)")
      const fx = revertInsertions(flattenWords(raw.segments), res.paragraphs);
      await writeJson(join(dir, 'transcript.work.json'), { paragraphs: fx.paragraphs, corrections: res.diff, refused: res.refused, reverted: fx.reverted, loops: lp.repaired });
      rec.corrections = res.diff.length; rec.refused = res.refused.length; rec.insertions_reverted = fx.reverted.length;
      meta.faithfulness = { ...(meta.faithfulness || {}), correct: fx.reverted.length };
    }

    if (stage === 'clean') {
      // the copy-edit pass, always from the VERBATIM (name-corrected) words, so a re-run never edits an edit
      const work = await readJson(join(dir, 'transcript.work.json'));
      const verbatim = work.verbatim || work.paragraphs;
      // framed with what is known before describe: who, what, when (the model brings its own knowledge of the Faith)
      const ctx = { speaker: meta.speaker, title: meta.title, date: meta.date, year: meta.year, event: meta.event, place: meta.place, language: meta.language, series: meta.series || null, part: meta.part || null };
      const res = await (llm.cleanTranscript ? llm.cleanTranscript(verbatim, { spend, ctx }) : { paragraphs: verbatim, log: [], stats: {}, mentions: [] });
      const rawc = await readJson(join(dir, 'transcript.raw.json'));
      const fx0 = revertInsertions(flattenWords(rawc.segments), res.paragraphs);
      // the final text pass: any loop the copy-edit left (or a revert restored) is repaired here too
      const lp2 = repairParagraphLoops(fx0.paragraphs);
      const fx = { ...fx0, paragraphs: lp2.paragraphs };
      if (lp2.repaired.length) meta.asr_loops_repaired = (meta.asr_loops_repaired || 0) + lp2.repaired.length;
      await writeJson(join(dir, 'transcript.work.json'), { ...work, verbatim, paragraphs: fx.paragraphs, cleanup: res.log, cleanup_stats: res.stats, mentions: res.mentions || [], cleanup_reverted: fx.reverted });
      rec.insertions_reverted = fx.reverted.length;
      meta.faithfulness = { ...(meta.faithfulness || {}), clean: fx.reverted.length };
      rec.applied = res.stats?.applied || 0; rec.hidden_words = res.stats?.hidden_words || 0; rec.flagged = res.stats?.flagged || 0;
    }

    if (stage === 'describe') {
      const work = await readJson(join(dir, 'transcript.work.json'));
      // an invented second speaker (the main voice split by the diarization) goes back to the main speaker before naming
      if (!meta.speaker_merge && new Set((work.paragraphs || []).map((p) => p.spk).filter(Boolean)).size > 1) {
        const r = await mergeSpeakers(work.paragraphs, {}, { dir, meta, tools }).catch(() => null);
        if (r?.merged) { work.paragraphs = r.paragraphs; await writeJson(join(dir, 'transcript.work.json'), work); }
        meta.speaker_merge = { merged: r?.merged || 0, ...(r?.summary ? { speakers: r.summary } : {}), at: d.now() };
        rec.speakers_merged = r?.merged || 0;
      }
      const desc = await llm.describeTalk(work.paragraphs, { title: meta.title, speaker: meta.speaker, date: meta.date, year: meta.year, event: meta.event, place: meta.place, series: meta.series, source: meta.source?.kind === 'youtube' ? { channel: meta.source.channel, title: meta.source.title } : null }, { spend });
      const byN = new Map(work.paragraphs.map((p) => [p.n, p]));
      meta.summary = desc.summary || null; meta.description_version = 2; meta.topics = desc.topics || [];
      // a file-name title that names nothing ("01 (thursday)", "Class 5", "Part 2") gives way to the recording's own subject
      if (desc.title && (String(meta.title || '').length < 14 || /^(?:\d+\b|part\b|class\b|session\b|day\b|talk\b|track\b|untitled)/i.test(String(meta.title || '').trim()))) {
        meta.file_title = meta.title; meta.title = String(desc.title).slice(0, 160);
      }
      meta.speakers = desc.speakers || {};
      // an interpreted talk: the other language's paragraphs are the interpreter's, whatever the diarization said
      const li = labelInterpreter(work.paragraphs, meta.speakers, /^[a-z]{2}$/.test(meta.language || '') ? meta.language : null);
      if (li.relabelled) { meta.speakers = li.speakers; work.paragraphs = li.paragraphs; await writeJson(join(dir, 'transcript.work.json'), work); rec.interpreter_paragraphs = li.relabelled; }
      meta.chapters = (desc.chapters || []).filter((c) => byN.has(Number(c.p)) && c.title).map((c) => ({ p: Number(c.p), t: byN.get(Number(c.p)).t0, title: String(c.title).slice(0, 120) }));
      for (const k of ['place', 'event', 'date', 'year']) if (!meta[k] && desc[k]) meta[k] = desc[k];
      // the transcript can name the speaker in full where the file name had a surname ("Nakhjavání" → "‘Alí Nakhjavání")
      const sur = String(meta.speaker || '').split(/\s+/).pop()?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const full = String(desc.speaker || '');
      if (!meta.speaker && full) meta.speaker = full;
      else if (sur && full.length > String(meta.speaker).length && full.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(sur)) meta.speaker = full;
      rec.chapters = meta.chapters.length;
    }

    if (stage === 'headings') {
      // topic subheaders (structure only: no audio, no time of their own); the guard keeps faithful, well-spaced ones
      const work = await readJson(join(dir, 'transcript.work.json'));
      const { acceptHeadings } = await import('./headings.js');
      const proposed = llm.proposeHeadings ? await llm.proposeHeadings(work.paragraphs, { title: meta.title, speaker: meta.speaker, summary: meta.summary }, { spend }) : [];
      const model = (await import('../model-roles.js')).modelFor('media-headings')?.model || null;
      const res = acceptHeadings(proposed, work.paragraphs, { model });
      meta.headings = res.headings;
      rec.headings = res.headings.length; rec.refused = res.refused.length;
      if (res.refused.length) rec.refused_why = res.refused.slice(0, 8).map((r) => `${r.p}: ${r.why}`);
    }

    if (stage === 'quotes') {
      const work = await readJson(join(dir, 'transcript.work.json'));
      const tq = Date.now();
      const found = await llm.findQuotations(work.paragraphs, { spend });
      rec.find_ms = Date.now() - tq;
      const q = d.quotes || await import('./quotes.js');
      // quotations (source hunt) and teachings (concept search + a verify call) use different services: both at once
      const t1 = Date.now();
      const [lq, lt] = await Promise.all([q.linkQuotes(work.paragraphs, found.quotes).finally(() => { rec.hunt_ms = Date.now() - t1; }),
        q.linkTeachings(work.paragraphs, found.teachings, (t, ps) => llm.verifyTeaching(t, ps, { spend })).finally(() => { rec.teach_ms = Date.now() - t1; })]);
      await writeJson(join(dir, 'quotes.json'), { candidates: found, quotes: lq.linked, quotes_rejected: lq.rejected, teachings: lt.linked, teachings_rejected: lt.rejected });
      rec.quotes = lq.linked.length; rec.crs = lt.linked.length; rec.candidates = found.quotes.length + found.teachings.length;
    }

    if (stage === 'links') {
      // people → /biography/<id>, works → the canonical copy (OceanLibrary first): the copy-edit pass's mentions, resolved
      // through our own layers, first mention per subheader section, only on a confident resolution
      const work = await readJson(join(dir, 'transcript.work.json'));
      const L = d.links || await linkDeps();
      const { linkMentions } = await import('./links.js');
      const res = await linkMentions(work.mentions || [], meta.headings || [], { ...L, lang: /^[a-z]{2}/.test(meta.language || '') ? meta.language.slice(0, 2) : 'en' });
      await writeJson(join(dir, 'links.json'), res);
      rec.people = res.links.filter((l) => l.kind === 'person').length; rec.works = res.links.filter((l) => l.kind === 'work').length; rec.unresolved = res.unresolved.length;
    }

    if (stage === 'assess') {
      // AUDIENCE (1–5, per section, tradition-agnostic) and MOMENTS (verbatim, verified out of context) from one whole-talk read
      const work = await readJson(join(dir, 'transcript.work.json'));
      const A = await import('./assess.js');
      const sections = A.sectionsOf(work.paragraphs, meta.headings || [], meta.chapters || []);
      const ctx = { speaker: meta.speaker, title: meta.title, date: meta.date, year: meta.year, event: meta.event, tradition: meta.tradition };
      const out = llm.assessTalk ? await llm.assessTalk(work.paragraphs, sections, ctx, { spend }) : {};
      const model = (await import('../model-roles.js')).modelFor('media-assess')?.model || null;
      meta.audience = A.audienceOf(out, sections, { model, tradition: meta.tradition || null });
      const mo = await A.momentsOf(out, work.paragraphs, { slug: meta.slug, verify: llm.verifyMoment ? (m, c) => llm.verifyMoment(m, c, { spend }) : null });
      meta.moments = mo.moments;
      await writeJson(join(dir, 'assess.json'), { audience: meta.audience, moments: mo.moments, rejected: mo.rejected });
      rec.audience = meta.audience.score; rec.moments = mo.moments.length; rec.rejected = mo.rejected.length;
    }

    if (stage === 'thumb') {
      // the SPEAKER's canonical portrait (one per person, reused by every item; face-centred crops via the image worker);
      // the generated tile below stays as the fallback
      try {
        const { ensurePortrait } = d.portraits || await import('../ops/media-jobs.js');
        const pr = meta.speaker ? await ensurePortrait(meta.speaker, {}, {}) : null;
        meta.speaker_key = pr?.key || null; rec.portrait = pr?.status || 'none';
      } catch (err) { rec.portrait = `error: ${String(err.message).slice(0, 80)}`; }
      // the item's own picture is the generated tile (the speaker's portrait is a PERSON record, above, shown in its place);
      // the old per-item photo search found namesakes (10-22: "Chad Jones" the economist, a "Bob Harris")
      const peaks = (await readJson(join(dir, 'waveform.json')))?.data || [];
      await writeFile(join(dir, 'thumb.svg'), tileSvg({ speaker: meta.speaker, title: meta.title, peaks }));
      meta.thumb = { file: 'thumb.svg', kind: 'tile' };
      rec.kind = meta.thumb.kind;
    }

    if (stage === 'render' || stage === 'update') {
      // the playback level is the catalogue's (a person can change it there): the page is rendered for it
      if (item.playback && LEVELS.includes(item.playback) && meta.rights) meta.rights.playback = item.playback;
      const work = await readJson(join(dir, 'transcript.work.json'));
      // a talk transcribed before the loop repair is repaired here, on any render or update (10-22: the gate blocked the
      // re-links of published talks on their old loops)
      // …and mojibake from before its repair ('ìWhy … î') is mended the same way
      let moji = 0;
      for (const p of work.paragraphs || []) {
        for (const w of p.words || []) { const f = fixMojibake(w.w); if (f !== w.w) { w.w = f; moji++; } }
        // and unrecoverable invalid bytes (U+FFFD) in a transcript made before that repair: removed, a word of nothing hidden
        for (const w of p.words || []) if (String(w.w).includes('\uFFFD')) { w.w = String(w.w).replace(/\uFFFD+/g, ''); if (!w.w.trim()) { w.w = '…'; w.hide = true; } moji++; }
      }
      const lp0 = repairParagraphLoops(work.paragraphs || []);
      if (moji && !lp0.repaired.length) await writeJson(join(dir, 'transcript.work.json'), work);
      if (lp0.repaired.length) {
        work.paragraphs = lp0.paragraphs;
        await writeJson(join(dir, 'transcript.work.json'), { ...work, loops: [...(work.loops || []), ...lp0.repaired] });
        meta.asr_loops_repaired = (meta.asr_loops_repaired || 0) + lp0.repaired.length;
      }
      // the PUBLISH GATE (QA 10-22): a loop, a lossy decode (U+FFFD) or mojibake left in the text → not published
      const problems = publishProblems(work.paragraphs || []);
      if (problems.length) { meta.publish_blocked = problems.slice(0, 20); await save(); throw new Error(`publish blocked: ${problems.length} text problem(s) — ${problems.slice(0, 3).map((x) => `p${x.p} ${x.kind} "${x.text}"`).join('; ')}`); }
      const timeHash = timingSignature(work.paragraphs);
      if (meta.audio_alignment_hash && meta.audio_alignment_hash !== timeHash) throw new Error('publish blocked: transcript timing changed after alignment; realign it against the selected audio before publishing');
      if (meta.rights?.playback === 'full') {
        const sync = audioAlignment(meta, { allowPending: true });
        if (!sync.ready) throw new Error(`publish blocked: selected audio (${sync.listening}) does not match transcript alignment (${sync.aligned_to}) or audio revision ${sync.audio_version}`);
        meta.web_listening = sync.listening;
        meta.audio_alignment_version = sync.audio_version;
        meta.audio_alignment_hash = timeHash;
      }
      delete meta.publish_blocked;
      const qj = await readJson(join(dir, 'quotes.json'), { quotes: [], teachings: [] });
      const quotes = qj.quotes || [], crs = [...(qj.teachings || [])];
      const { breakoutsOf } = d.quotes || await import('./quotes.js');
      const raw = await readJson(join(dir, 'transcript.raw.json'));
      const links = (await readJson(join(dir, 'links.json'), { links: [] })).links || [];
      const transcript = { slug: meta.slug, language: meta.language, asr: meta.asr, enhancement: meta.enhancement ? { asr_input: meta.enhancement.asr_input, listening: meta.enhancement.listening } : null,
        speakers: meta.speakers, chapters: meta.chapters, headings: meta.headings || [], paragraphs: work.paragraphs, quotes, cross_references: crs, links,
        moments: (meta.moments || []).map(({ why, ...m }) => m), audience: meta.audience || null,
        // the VERBATIM layer (before the copy-edit pass) and its log: every change, every flag for review
        verbatim: (work.verbatim || []).map((p) => ({ n: p.n, text: p.words.map((w) => w.w).join(' ') })), cleanup: work.cleanup || [], cleanup_stats: work.cleanup_stats || null,
        corrections: work.corrections, corrections_refused: work.refused, turns: raw?.turns || [] };
      await writeJson(join(dir, 'transcript.json'), transcript);
      await writeFile(join(dir, 'transcript.md'), transcriptMarkdown({ meta, paragraphs: work.paragraphs, quotes, links, chapters: meta.chapters, headings: meta.headings || [] }));
      const api = `/api/media/${meta.slug}`;
      await writeFile(join(dir, 'page.html'), pageHtml({ meta, paragraphs: work.paragraphs, quotes, links, crs: breakoutsOf([...quotes, ...crs]), chapters: meta.chapters, headings: meta.headings || [], speakers: meta.speakers,
        audio: meta.rights.playback === 'full' ? `web/${meta.slug}.ogg?v=${audioVersion(meta)}` : null, clipUrl: meta.rights.playback === 'clips' ? `${api}/clip-url` : null,
        pageUrl: `https://siftersearch.com/media/${meta.slug}`, thumb: meta.thumb?.file ? `${api}/file/${meta.thumb.file}` : null }));
      meta.words_n = work.paragraphs.reduce((a, p) => a + p.words.length, 0);
      meta.version = (meta.version || 1) + (meta.stages.render ? 1 : 0);
    }

    if (stage === 'ingest' || stage === 'update') {
      const res = await (d.ingest || (await import('./ingest.js')).ingestTranscript)({ dir, meta });
      meta.doc_id = res.documentId; meta.pi = res.pi || {}; rec.doc_id = res.documentId; rec.links = res.links;
      // SEARCH at once (Chad 10-22: "start ingesting for search"): the keyword (BM25) layer, the section index (subheaders)
      // and the phrase layer are filled by their own jobs — queue them for this document now (embedding follows ingest)
      if (res.documentId) { try { rec.search_followups = await (d.searchFollowUp || searchFollowUp)(res.documentId); } catch (err) { rec.search_followups = `error: ${String(err.message).slice(0, 80)}`; } }
    }

    if (stage === 'catalog' || stage === 'update') {
      // only RESTORED audio goes on air (Chad 10-29): a talk with no restored copy (any tier) stays in the pipeline, unpublished
      if (!item.published_at && !opts.publishUnrestored && meta.rights?.playback === 'full' && !isRestored(meta)) throw new Error('publish blocked: no restored audio copy yet (stays in the pipeline)');
      if (meta.rights?.playback === 'full') {
        const publishedTranscript = await readJson(join(dir, 'transcript.json'), { paragraphs: [] });
        const timeHash = timingSignature(publishedTranscript.paragraphs);
        if (meta.audio_alignment_hash && meta.audio_alignment_hash !== timeHash) throw new Error('publish blocked: published transcript timing no longer matches the audio alignment');
        const sync = audioAlignment(meta, { allowPending: true });
        if (!sync.ready) throw new Error(`publish blocked: audio ${sync.audio_version} is not aligned to the selected transcript`);
        meta.audio_alignment_version = sync.audio_version;
        meta.audio_alignment_hash = timeHash;
      }
      // SPEAKER IDENTITY: the name as said → one person (house-style name, the person's key); never a new person per
      // spelling (identity.js). A YouTube year after the speaker's death is the UPLOAD year (Chad 10-23).
      if (meta.speaker) {
        const { resolveSpeaker, recordingYear } = await import('./identity.js');
        const { loadSpeakerPeople, identityContext } = await import('../ops/media-jobs.js');
        speakerPeople = speakerPeople || await loadSpeakerPeople();
        const who = resolveSpeaker(meta.speaker, speakerPeople, identityContext(item, meta), { notSpeakers: speakerPeople.notSpeakers || [] });
        if (who.not_speaker) { meta.speaker_review = 'a series name, not a speaker'; meta.speaker = null; meta.speaker_key = null; }
        if (who.key) {
          meta.speaker = who.display; meta.speaker_key = who.key;
          const y = recordingYear({ year: meta.year, source_kind: item.source_kind, title: `${meta.title || ''} ${meta.source?.title || ''}`, description: meta.source?.description || '', file: item.source_ref || '' }, who.person);
          if (item.source_kind === 'youtube' && y.uploaded_year && (y.flag || y.recorded_year)) { meta.year = y.recorded_year; meta.uploaded_year = y.uploaded_year; }
          meta.date_flag = y.flag || undefined;
        } else if (who.review) meta.speaker_review = who.review;
      }
      // the transcript's name/work links into the catalogue (paragraph_index = the ingested paragraph, for search hits)
      const lk = (await readJson(join(dir, 'links.json'), { links: [] })).links || [];
      if (repo.replaceMoments && meta.moments) await repo.replaceMoments(item.id, meta.moments);
      if (repo.replaceMediaLinks) await repo.replaceMediaLinks(item.id, lk.map((l) => ({ ...l, paragraph_index: meta.pi?.[l.para] ?? null, target_doc_id: l.doc_id ?? null })));
      if (meta.quality && !meta.quality.final) await finishQuality(meta, dir, d, item);
      // faithfulness in the quality report: what the edit passes tried to add to the heard words and was reverted
      if (meta.quality) meta.quality.insertions_reverted = (meta.faithfulness?.correct || 0) + (meta.faithfulness?.clean || 0);
      const qj = await readJson(join(dir, 'quotes.json'), { quotes: [], teachings: [] });
      await repo.updateMediaItem(item.id, { speaker_key: meta.speaker_key || (meta.speaker ? speakerKey(meta.speaker) : null), title: meta.title, speaker: meta.speaker, language: meta.language, year: meta.year ? Number(meta.year) : null, date: meta.date,
        restored: isRestored(meta) ? 1 : 0, doc_id: meta.doc_id || null, thumb: meta.thumb?.file || null, quotes_n: qj.quotes?.length || 0, crs_n: qj.teachings?.length || 0, words_n: meta.words_n || 0,
        asr_conf: meta.enhancement?.variants?.find((v) => v.name === meta.enhancement.asr_input)?.avg_logprob ?? null, cost_usd: Math.round(spend.usd * 10000) / 10000,
        meta: { summary: meta.summary, topics: meta.topics, chapters: meta.chapters, headings_n: (meta.headings || []).length, audience_intro: meta.audience?.intro || [], rights: meta.rights, source: meta.source, thumb: meta.thumb, event: meta.event, place: meta.place, version: meta.version },
        state: 'done', stage: 'catalog', why: null, ...(item.published_at ? {} : { published_at: d.now() }), audience: meta.audience?.score ?? null, ...(meta.quality ? { grade: meta.quality.overall, primary_issue: meta.quality.primary_issue, chain_key: meta.quality.chain_key, priority: meta.quality.priority } : {}) });
      meta.audio_publish_pending = false;
    }

    } catch (err) {
      if (err.code !== 'DRAIN') throw err;
      await save();
      return { yielded: true, resume: { id: item.id, stage }, slug: meta.slug, done };
    }
    meta.stages[stage] = { at: d.now(), ms: Date.now() - t0, ...rec };
    done.push(stage);
    await save();
    await repo.updateMediaItem(item.id, { stages_done: stagesDone(meta.stages) }).catch(() => {});
  }
  if (done.length) purgeTalk(meta.slug, { version: meta.version || 1 });   // the edge-cached page + API entry of this talk: new audio/data shows within seconds
  return { slug: meta.slug, done, meta };
}

/** After transcription: ASR confidence (the chosen input's probe + the aligned word scores), per-speaker loudness, the
 *  re-graded report and the repair priority; the catalogue row gets grade / issue / chain / priority. */
export async function finishQuality(meta, dir, d, item) {
  const raw = await readJson(join(dir, 'transcript.raw.json'));
  const probe = meta.enhancement?.variants?.find((v) => v.name === meta.enhancement.asr_input)?.avg_logprob ?? null;
  const asr = raw ? asrConfidence(raw.segments, probe) : null;
  const turnsFile = existsSync(join(dir, 'diarization.json')) ? join(dir, 'diarization.json') : join(dir, 'transcript.raw.json');
  const levels = (await d.tools.tool('levels', join(dir, meta.original), { output: turnsFile }, { threads: 2 }).catch(() => null))?.speakers || null;
  const tiers = (await readJson(join(process.cwd(), 'data', 'media-speaker-tiers.json'), { tiers: {} })).tiers || {};
  const key = meta.speaker_key || (meta.speaker ? speakerKey(meta.speaker) : null);
  const copies = d.repo.sameTalkCount && meta.speaker && meta.title ? await d.repo.sameTalkCount(meta.speaker, meta.title).catch(() => 1) : 1;
  const tier = tiers[key] || 1;
  meta.quality = { ...meta.quality, ...gradeReport(meta.quality.raw, { asr, levels }), asr, levels, final: true, tier, unique: copies <= 1 };
  meta.quality.priority = priorityOf(meta.quality.overall, { tier, unique: copies <= 1 });
  if (item?.id && d.repo.updateMediaItem) await d.repo.updateMediaItem(item.id, { grade: meta.quality.overall, primary_issue: meta.quality.primary_issue, chain_key: meta.quality.chain_key, priority: meta.quality.priority });
}

/** Files of an item folder that are published (served by the API, cached on R2). */
export async function publishedFiles(dir) {
  const out = [];
  for (const f of ['page.html', 'transcript.json', 'transcript.md', 'waveform.json', 'thumb.jpg', 'thumb.svg']) if (existsSync(join(dir, f))) out.push(f);
  for (const f of await readdir(join(dir, 'web')).catch(() => [])) out.push(`web/${f}`);
  return out;
}

export { paragraphText };
