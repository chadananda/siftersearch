// ONE MEDIA ITEM through the pipeline (planning/media-library-plan.md): archive → enhance → web → transcribe → correct →
// describe → headings → quotes → links → assess → thumb → render → ingest → catalog. Each stage writes its files into the item folder and records
// itself in meta.json (stages[name] = { at, ms, … }); a finished stage is skipped on the next run, so the job resumes after
// a crash or a drain. Originals are hard-linked read-only and never modified. Deps injected for tests (see `defaults`).
import { mkdir, readFile, writeFile, rename, link, copyFile, chmod, stat, readdir } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename, extname, relative } from 'path';
import { slugify, makeSlug, parseMediaPath } from './names.js';
import { lightChain, probeStarts, chooseAsrInput, chooseListening } from './enhance.js';
import { computePeaks, normalizePeaks } from './peaks.js';
import { toParagraphs, paragraphText, assignSpeakers, smoothTurns, flattenWords } from './paragraphs.js';
import { revertInsertions } from './faithfulness.js';
import { repairParagraphLoops, publishProblems } from './loops.js';
import { buildVocab, CORE_TERMS, promptTerms } from './vocab.js';
import { transcriptMarkdown, pageHtml } from './render.js';
import { defaultPlayback, youtubeDefault, YOUTUBE_GRANT, LEVELS } from './rights.js';
import { tileSvg } from './thumbs.js';
import { gradeReport, asrConfidence, priorityOf } from './grade.js';

// tower's MODEL work (grade: DNSMOS/NISQA · enhance: DeepFilterNet) runs in TWO slots at 4 threads even when more items are
// in flight (10-22: four in parallel took on-tower search p90 to 5.3 s)
// two slots at 4 threads each = tower's 8-thread media budget (plan §12); one slot made enhance the compute lane's bottleneck
const TOWER_SLOTS = Math.max(1, Number(process.env.MEDIA_TOWER_SLOTS) || 2);
let towerBusy = 0;
const towerWait = [];
export async function towerSlot(fn) {
  if (towerBusy >= TOWER_SLOTS) await new Promise((r) => towerWait.push(r));
  towerBusy++;
  try { return await fn(); } finally { towerBusy--; towerWait.shift()?.(); }
}

// tower's LIGHT work (ffmpeg chains and encodes, signal metrics: ≤ 2 threads each) in FOUR slots = the same 8 threads. Prep
// waits on the GPU host most of the time (grade, DeepFilterNet, probes run there): more prep workers, CPU still bounded
const LIGHT_SLOTS = Math.max(1, Number(process.env.MEDIA_LIGHT_SLOTS) || 4);
let lightBusy = 0;
const lightWait = [];
export async function towerLight(fn) {
  if (lightBusy >= LIGHT_SLOTS) await new Promise((r) => lightWait.push(r));
  lightBusy++;
  try { return await fn(); } finally { lightBusy--; lightWait.shift()?.(); }
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
  await q('phrase-index', { docs: [docId], maxUsd: 0.25, budgetKey: 'media-phrase-index' }, 'media-ingest');
  return ['keyword-fill', 'section-index', 'phrase-index'];
}

export const STAGES = ['archive', 'grade', 'enhance', 'web', 'transcribe', 'correct', 'clean', 'describe', 'thumb', 'render', 'ingest', 'catalog',
  'headings', 'quotes', 'links', 'assess', 'update'];
export const archiveRoot = () => process.env.MEDIA_ARCHIVE_ROOT || '/tank/media/library';
export const mediaRoot = () => process.env.MEDIA_SOURCE_ROOT || '/tank/media';
const TRADITION_DIR = { "Baha'i": 'bahai', Islam: 'islam' };

const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const readJson = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
async function writeJson(p, v) { await writeFile(`${p}.tmp`, JSON.stringify(v, null, 1)); await rename(`${p}.tmp`, p); }

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
  const [{ listBioPersons }, { entityLookup }, { findDocuments }, { findSections }, { linkFor }] = await Promise.all([
    import('../bio.js'), import('../entity-api.js'), import('../docs-repo.js'), import('../repos/sections-repo.js'), import('../source-links.js')]);
  const bio = (await listBioPersons())?.persons || [];
  return { bio, lookup: (n) => entityLookup(n, { type: 'person', limit: 10 }), sections: (t) => findSections(t, { limit: 20 }), linkFor,
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
  const d = { ...(await defaults()), ...deps };
  const { tools, llm, repo } = d;
  let meta = item.dir ? await readJson(join(item.dir, 'meta.json'), {}) : {};
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

  for (const stage of STAGES) {
    if (meta.stages[stage]?.at) continue;
    if (opts.only && !opts.only.includes(stage)) continue;
    if (await d.draining()) return { yielded: true, resume: { id: item.id, stage }, slug: meta.slug, done };   // stage: a resumed run never redoes its from/reslug
    const t0 = Date.now();
    // a published talk stays published while later stages (or a re-run) work on it
    await repo.updateMediaItem(item.id, { stage, state: item.state === 'done' || meta.stages.catalog?.at ? 'done' : 'running' });
    const rec = {};
    try {

    if (stage === 'archive') {
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
        const got = d.youtube.fetchAudio ? await d.youtube.fetchAudio(item.source_ref, join(dir, 'original'))
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
          : { kind: 'file', path: src, sha256: sha, bytes: (await stat(original)).size, probe },
        original: relative(dir, original), version: 1 };
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
      const m = tools.gpuOrTower ? await tools.gpuOrTower('grade', join(dir, meta.original), {}, { job: meta.grade_job, pidFile: join(dir, 'grade.pid'), stop, slot: towerSlot })
        : await towerSlot(() => tools.tool('grade', join(dir, meta.original), {}, { threads: 4, stop, timeoutMs: 3600_000 }));
      delete meta.grade_job;
      meta.quality = { measured_at: d.now(), raw: m, ...gradeReport(m) };
      if (existsSync(join(dir, 'transcript.raw.json'))) await finishQuality(meta, dir, d, item);
      rec.grade = meta.quality.overall; rec.primary_issue = meta.quality.primary_issue;
    }

    if (stage === 'enhance') {
      const orig = join(dir, meta.original);
      const th = await threads();
      const m0 = await towerLight(() => tools.tool('metrics', orig, {}, { threads: 2, stop }));
      await mkdir(join(dir, 'enhanced'), { recursive: true });
      const light = join(dir, 'enhanced', 'light.flac');
      const chain = lightChain({ ...m0, sample_rate: meta.source?.probe?.sample_rate });
      await towerLight(() => tools.ffmpeg(['-i', orig, '-vn', '-ac', '1', '-ar', '48000', '-af', chain, '-c:a', 'flac', light], { stop }));
      const m1 = await towerLight(() => tools.tool('metrics', light, {}, { threads: 2, stop }));
      const variants = [{ name: 'original', file: orig, ...m0 }, { name: 'light', file: light, ...m1 }];
      if (!opts.noDfn && existsSync(tools.PY_DFN())) {
        const dfn = join(dir, 'enhanced', 'dfn.flac');
        if (!meta.dfn_job) { meta.dfn_job = `${meta.slug}-df-${Date.now().toString(36)}`.slice(0, 110); await save(); }
        if (tools.gpuOrTower) await tools.gpuOrTower('dfn', light, { output: dfn }, { job: meta.dfn_job, pidFile: join(dir, 'enhanced', 'dfn.pid'), python: tools.PY_DFN(), stop, file: true, slot: towerSlot });
        else await towerSlot(() => tools.tool('dfn', light, { output: dfn }, { python: tools.PY_DFN(), threads: 4, stop }));
        delete meta.dfn_job;
        variants.push({ name: 'dfn', file: dfn, ...(await towerLight(() => tools.tool('metrics', dfn, {}, { threads: 2, stop }))) });
      }
      const starts = probeStarts(meta.duration_s).join(',');
      const lang = /^[a-z]{2}$/.test(meta.language_hint || '') ? meta.language_hint : '';
      // the variants' probes at once (the GPU host's memory lock paces them)
      await Promise.all(variants.map(async (v) => {
        const p = await tools.asr('probe', v.file, { model: 'large-v3-turbo', starts, len: 60, lang }, { stop, ...(tools.probeHost ? { host: tools.probeHost() } : {}) });
        Object.assign(v, { avg_logprob: p.avg_logprob, words: p.words, probe_s: p.seconds, sample: p.excerpts?.[0]?.text?.slice(0, 200), languages: p.excerpts?.map((e) => e.language) });
      }));
      const asr = chooseAsrInput(variants), listen = chooseListening(variants);
      meta.enhancement = { chain, variants: variants.map(({ file, ...v }) => ({ ...v, file: relative(dir, file) })), asr_input: asr.name, asr_why: asr.why, listening: listen.name, listening_why: listen.why };
      rec.threads = th;
    }

    if (stage === 'web') {
      const v = meta.enhancement.variants.find((x) => x.name === meta.enhancement.listening) || meta.enhancement.variants[1];
      const src = join(dir, v.file);
      await mkdir(join(dir, 'web'), { recursive: true });
      const ogg = join(dir, 'web', `${meta.slug}.ogg`), m4a = join(dir, 'web', `${meta.slug}.m4a`);
      await Promise.all([
        towerLight(() => tools.ffmpeg(['-i', src, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', ogg], { stop })),
        towerLight(() => tools.ffmpeg(['-i', src, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', m4a], { stop }))]);
      // the DURATION from the web encode (QA 10-22: the original's header under-reported by ~6 s on 31 talks)
      const enc = tools.ffprobe ? await tools.ffprobe(m4a).catch(() => null) : null;
      if (enc?.duration_s && enc.duration_s > (meta.duration_s || 0)) meta.duration_s = Math.round(enc.duration_s * 100) / 100;
      const parts = [];
      await tools.pcmStream(ogg, 8000, (f) => parts.push(f));
      const all = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
      let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      await writeJson(join(dir, 'waveform.json'), normalizePeaks(computePeaks(all, 8000, { pixelsPerSecond: 20 })));
      rec.bytes = { ogg: (await stat(ogg)).size, m4a: (await stat(m4a)).size };
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
        const li = await tools.asr('langid', join(dir, meta.original), { model: 'large-v3-turbo', starts, len: 12 }, { stop }).catch(() => null);
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
      if (!meta.asr_job?.id) { meta.asr_job = { id: `${meta.slug}-${Date.now().toString(36)}`.slice(0, 110), host: tools.pickAsrHost ? tools.pickAsrHost() : (tools.asrHost ? tools.asrHost() : null) }; await save();
        // the DISPATCH log: which host took the transcription and the load it saw (10-22: 'why is aorus idle?')
        console.info(`[media] dispatch transcribe ${meta.slug} → ${meta.asr_job.host} (${tools.asrPickReason ? tools.asrPickReason(meta.asr_job.host) : 'single host'})`);
      } else console.info(`[media] re-attach transcribe ${meta.slug} → ${meta.asr_job.host} (job ${meta.asr_job.id})`);
      if (!meta.diar_job?.id) { meta.diar_job = { id: `${meta.slug}-dz-${Date.now().toString(36)}`.slice(0, 110) }; await save(); }
      const viaJob = async () => {
        if (!tools.asrJob || !meta.asr_job.host) return tools.asr('transcribe', join(dir, v.file), asrOpts, { timeoutMs: 12 * 3600_000, stop });
        try { return await tools.asrJob(join(dir, v.file), asrOpts, { host: meta.asr_job.host, job: meta.asr_job.id, stop }); }
        catch (err) { if (err.code === 'DRAIN' || !/ssh exit 255|Connection|timed out|No route/i.test(err.message)) throw err; return tools.asr('transcribe', join(dir, v.file), asrOpts, { timeoutMs: 12 * 3600_000, stop }); }
      };
      const settled = await Promise.allSettled([
        viaJob(),
        // diarization on BOSS beside the ASR job (tower only as a guarded, 4-thread fallback: tools.diarize)
        multi ? null : (tools.diarize ? tools.diarize(join(dir, v.file), turnsFile, { pidFile: join(dir, 'diarization.pid'), job: meta.diar_job.id, stop })
          : tools.tool('diarize', join(dir, v.file), { output: turnsFile }, { threads: Math.min(4, th), timeoutMs: 6 * 3600_000, stop })),
      ]);
      const bad = settled.find((x) => x.status === 'rejected');
      if (bad) throw bad.reason;
      const r = settled[0].value;
      delete meta.asr_job; delete meta.diar_job;
      const raw = await readJson(out);
      if (!multi) {
        raw.turns = smoothTurns((await readJson(turnsFile, { turns: [] })).turns || []);
        raw.segments = assignSpeakers(raw.segments, raw.turns);
        await writeJson(out, raw);
      }
      meta.language = raw.language; meta.asr = { model: raw.model, language: raw.language, languages: raw.languages, mode: lang === 'multi' ? 'interpreted' : 'single', prompt: raw.prompt,
        aligned: raw.aligned, align_score: raw.align_score, timings: raw.timings, host: r.host || 'tower', threads: r.host ? null : th, rtf: Math.round((r.seconds / Math.max(1, raw.duration_s)) * 1000) / 1000, input: meta.enhancement.asr_input,
        speakers: new Set(raw.turns.map((t) => t.speaker)).size };
      rec.rtf = meta.asr.rtf;
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
      const desc = await llm.describeTalk(work.paragraphs, { title: meta.title, speaker: meta.speaker, date: meta.date, year: meta.year, event: meta.event, place: meta.place, series: meta.series, source: meta.source?.kind === 'youtube' ? { channel: meta.source.channel, title: meta.source.title } : null }, { spend });
      const byN = new Map(work.paragraphs.map((p) => [p.n, p]));
      meta.summary = desc.summary || null; meta.topics = desc.topics || [];
      // a file-name title that names nothing ("01 (thursday)", "Class 5", "Part 2") gives way to the recording's own subject
      if (desc.title && (String(meta.title || '').length < 14 || /^(?:\d+\b|part\b|class\b|session\b|day\b|talk\b|track\b|untitled)/i.test(String(meta.title || '').trim()))) {
        meta.file_title = meta.title; meta.title = String(desc.title).slice(0, 160);
      }
      meta.speakers = desc.speakers || {};
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
      const found = await llm.findQuotations(work.paragraphs, { spend });
      const q = d.quotes || await import('./quotes.js');
      // quotations (source hunt) and teachings (concept search + a verify call) use different services: both at once
      const [lq, lt] = await Promise.all([q.linkQuotes(work.paragraphs, found.quotes),
        q.linkTeachings(work.paragraphs, found.teachings, (t, ps) => llm.verifyTeaching(t, ps, { spend }))]);
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
      const lp0 = repairParagraphLoops(work.paragraphs || []);
      if (lp0.repaired.length) {
        work.paragraphs = lp0.paragraphs;
        await writeJson(join(dir, 'transcript.work.json'), { ...work, loops: [...(work.loops || []), ...lp0.repaired] });
        meta.asr_loops_repaired = (meta.asr_loops_repaired || 0) + lp0.repaired.length;
      }
      // the PUBLISH GATE (QA 10-22): a loop, a lossy decode (U+FFFD) or mojibake left in the text → not published
      const problems = publishProblems(work.paragraphs || []);
      if (problems.length) { meta.publish_blocked = problems.slice(0, 20); await save(); throw new Error(`publish blocked: ${problems.length} text problem(s) — ${problems.slice(0, 3).map((x) => `p${x.p} ${x.kind} "${x.text}"`).join('; ')}`); }
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
        audio: meta.rights.playback === 'full' ? `web/${meta.slug}.ogg` : null, clipUrl: meta.rights.playback === 'clips' ? `${api}/clip-url` : null,
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
      // the transcript's name/work links into the catalogue (paragraph_index = the ingested paragraph, for search hits)
      const lk = (await readJson(join(dir, 'links.json'), { links: [] })).links || [];
      if (repo.replaceMoments && meta.moments) await repo.replaceMoments(item.id, meta.moments);
      if (repo.replaceMediaLinks) await repo.replaceMediaLinks(item.id, lk.map((l) => ({ ...l, paragraph_index: meta.pi?.[l.para] ?? null, target_doc_id: l.doc_id ?? null })));
      if (meta.quality && !meta.quality.final) await finishQuality(meta, dir, d, item);
      // faithfulness in the quality report: what the edit passes tried to add to the heard words and was reverted
      if (meta.quality) meta.quality.insertions_reverted = (meta.faithfulness?.correct || 0) + (meta.faithfulness?.clean || 0);
      const qj = await readJson(join(dir, 'quotes.json'), { quotes: [], teachings: [] });
      await repo.updateMediaItem(item.id, { speaker_key: meta.speaker_key || (meta.speaker ? (await import('./speakers.js')).speakerKey(meta.speaker) : null), title: meta.title, speaker: meta.speaker, language: meta.language, year: meta.year ? Number(meta.year) : null, date: meta.date,
        doc_id: meta.doc_id || null, thumb: meta.thumb?.file || null, quotes_n: qj.quotes?.length || 0, crs_n: qj.teachings?.length || 0, words_n: meta.words_n || 0,
        asr_conf: meta.enhancement?.variants?.find((v) => v.name === meta.enhancement.asr_input)?.avg_logprob ?? null, cost_usd: Math.round(spend.usd * 10000) / 10000,
        meta: { summary: meta.summary, topics: meta.topics, chapters: meta.chapters, headings_n: (meta.headings || []).length, audience_intro: meta.audience?.intro || [], rights: meta.rights, source: meta.source, thumb: meta.thumb, event: meta.event, place: meta.place, version: meta.version },
        state: 'done', stage: 'catalog', why: null, ...(item.published_at ? {} : { published_at: d.now() }), audience: meta.audience?.score ?? null, ...(meta.quality ? { grade: meta.quality.overall, primary_issue: meta.quality.primary_issue, chain_key: meta.quality.chain_key, priority: meta.quality.priority } : {}) });
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
  const key = meta.speaker_key || (meta.speaker ? (await import('./speakers.js')).speakerKey(meta.speaker) : null);
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
