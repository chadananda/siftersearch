// ONE MEDIA ITEM through the pipeline (planning/media-library-plan.md): archive → enhance → web → transcribe → correct →
// describe → quotes → thumb → render → ingest → catalog. Each stage writes its files into the item folder and records
// itself in meta.json (stages[name] = { at, ms, … }); a finished stage is skipped on the next run, so the job resumes after
// a crash or a drain. Originals are hard-linked read-only and never modified. Deps injected for tests (see `defaults`).
import { mkdir, readFile, writeFile, rename, link, copyFile, chmod, stat, readdir } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename, extname, relative } from 'path';
import { slugify, makeSlug, parseMediaPath } from './names.js';
import { lightChain, probeStarts, chooseAsrInput, chooseListening } from './enhance.js';
import { computePeaks, normalizePeaks } from './peaks.js';
import { toParagraphs, paragraphText, assignSpeakers, smoothTurns } from './paragraphs.js';
import { buildVocab, CORE_TERMS, promptTerms } from './vocab.js';
import { transcriptMarkdown, pageHtml } from './render.js';
import { defaultPlayback, youtubeDefault, YOUTUBE_GRANT } from './rights.js';
import { tileSvg } from './thumbs.js';

export const STAGES = ['archive', 'enhance', 'web', 'transcribe', 'correct', 'describe', 'quotes', 'thumb', 'render', 'ingest', 'catalog'];
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
    if (await d.draining()) return { yielded: true, resume: { id: item.id }, slug: meta.slug, done };
    const t0 = Date.now();
    await repo.updateMediaItem(item.id, { stage, state: 'running' });
    const rec = {};
    try {

    if (stage === 'archive') {
      const isYt = item.source_kind === 'youtube';
      let src = item.source_ref, probe, info = null, hints;
      if (isYt) {
        info = await d.youtube.youtubeInfo(item.source_ref);
        hints = { speaker: null, title: info.title, date: info.upload_date, year: info.upload_date ? Number(info.upload_date.slice(0, 4)) : null, collection: info.channel };
      } else {
        probe = await tools.ffprobe(src);
        hints = parseMediaPath(relative(join(mediaRoot(), traditionOf(src)), src).replace(/^talks\//, ''));
      }
      const named = await llm.nameItem({ rel: isYt ? `${info.channel} / ${info.title}` : relative(mediaRoot(), src), tags: isYt ? { description: info.description.slice(0, 600), tags: info.tags } : probe.tags,
        hints, duration: isYt ? info.duration_s : probe.duration_s }, { spend });
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
        original = await d.youtube.youtubeAudio(item.source_ref, join(dir, 'original'));
        probe = await tools.ffprobe(original);
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
        source: isYt ? { kind: 'youtube', url: info.url, youtube_id: info.youtube_id, channel: info.channel, channel_id: info.channel_id, channel_url: info.channel_url, upload_date: info.upload_date, title: info.title, license: info.license }
          : { kind: 'file', path: src, sha256: sha, bytes: (await stat(original)).size, probe },
        original: relative(dir, original), version: 1 };
      // every YouTube channel gets its own permission record (Chad can switch one to clips/search if its owner objects)
      let channel = isYt && info.channel_id ? await repo.getChannel(info.channel_id) : null;
      if (isYt && info.channel_id && !channel) channel = await repo.upsertChannel({ channel_id: info.channel_id, name: info.channel, playback: youtubeDefault(), granted_by: YOUTUBE_GRANT });
      meta.rights = meta.rights || { playback: defaultPlayback({ sourceKind: item.source_kind, speaker, channel }), download: false,
        basis: isYt ? `channel ${info.channel}: ${channel?.playback || youtubeDefault()} (${channel?.granted_by || YOUTUBE_GRANT})` : 'default for the local archive (Chad to confirm)' };
      await repo.updateMediaItem(item.id, { slug: finalSlug, dir, title, speaker, tradition, collection, year, date: meta.date, duration_s: probe.duration_s, has_video: probe.has_video,
        sha256: sha, youtube_id: info?.youtube_id || null, channel: info?.channel || null, playback: meta.rights.playback });
      item = { ...item, dir, slug: finalSlug };
    }

    if (stage === 'enhance') {
      const orig = join(dir, meta.original);
      const th = await threads();
      const m0 = await tools.tool('metrics', orig, {}, { threads: 2, stop });
      await mkdir(join(dir, 'enhanced'), { recursive: true });
      const light = join(dir, 'enhanced', 'light.flac');
      const chain = lightChain({ ...m0, sample_rate: meta.source?.probe?.sample_rate });
      await tools.ffmpeg(['-i', orig, '-vn', '-ac', '1', '-ar', '48000', '-af', chain, '-c:a', 'flac', light], { stop });
      const m1 = await tools.tool('metrics', light, {}, { threads: 2, stop });
      const variants = [{ name: 'original', file: orig, ...m0 }, { name: 'light', file: light, ...m1 }];
      if (!opts.noDfn && existsSync(tools.PY_DFN())) {
        const dfn = join(dir, 'enhanced', 'dfn.flac');
        await tools.tool('dfn', light, { output: dfn }, { python: tools.PY_DFN(), threads: th, stop });
        variants.push({ name: 'dfn', file: dfn, ...(await tools.tool('metrics', dfn, {}, { threads: 2, stop })) });
      }
      const starts = probeStarts(meta.duration_s).join(',');
      const lang = /^[a-z]{2}$/.test(meta.language_hint || '') ? meta.language_hint : '';
      for (const v of variants) {
        const p = await tools.asr('probe', v.file, { model: 'large-v3-turbo', starts, len: 60, lang }, { stop });
        Object.assign(v, { avg_logprob: p.avg_logprob, words: p.words, probe_s: p.seconds, sample: p.excerpts?.[0]?.text?.slice(0, 200), languages: p.excerpts?.map((e) => e.language) });
      }
      const asr = chooseAsrInput(variants), listen = chooseListening(variants);
      meta.enhancement = { chain, variants: variants.map(({ file, ...v }) => ({ ...v, file: relative(dir, file) })), asr_input: asr.name, asr_why: asr.why, listening: listen.name, listening_why: listen.why };
      rec.threads = th;
    }

    if (stage === 'web') {
      const v = meta.enhancement.variants.find((x) => x.name === meta.enhancement.listening) || meta.enhancement.variants[1];
      const src = join(dir, v.file);
      await mkdir(join(dir, 'web'), { recursive: true });
      const ogg = join(dir, 'web', `${meta.slug}.ogg`), m4a = join(dir, 'web', `${meta.slug}.m4a`);
      await tools.ffmpeg(['-i', src, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', ogg], { stop });
      await tools.ffmpeg(['-i', src, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', m4a], { stop });
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
      if (!meta.languages) {
        const starts = probeStarts(meta.duration_s, 6, 30).join(',');
        const li = await tools.asr('langid', join(dir, meta.original), { model: 'large-v3-turbo', starts }, { stop }).catch(() => null);
        meta.languages = (li?.excerpts || []).map((e) => ({ at: e.start, language: e.language, prob: e.prob }));
      }
      const heard = meta.languages.filter((x) => x.prob >= 0.5).map((x) => x.language);
      const langs = heard.length ? heard : (v?.languages || []);
      const mixed = new Set(langs.filter(Boolean)).size > 1;
      const top = Object.entries(langs.reduce((a, l) => ({ ...a, [l]: (a[l] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0];
      const lang = opts.lang || (mixed ? 'multi' : (top || (/^[a-z]{2}$/.test(meta.language_hint || '') ? meta.language_hint : '')));
      const prompt = `${meta.title}${meta.speaker ? ` — a talk by ${meta.speaker}` : ''}. ${promptTerms({ title: meta.title, speaker: meta.speaker }, vocab).join(', ')}.`;
      const th = await threads();
      const out = join(dir, 'transcript.raw.json');
      // ASR on boss and DIARIZATION on tower AT THE SAME TIME (10-21: diarization inside the boss run took 1,473 of 2,198 s);
      // an interpreted talk diarizes on boss first (its speaker blocks choose each block's language)
      const multi = lang === 'multi';
      const turnsFile = join(dir, 'diarization.json');
      // allSettled: when a drain kills one, the other is stopped too before the stage gives up (never orphaned)
      const settled = await Promise.allSettled([
        tools.asr('transcribe', join(dir, v.file), { model: opts.model || process.env.MEDIA_ASR_MODEL || 'large-v3-turbo', lang, prompt: lang === 'en' || lang === '' ? prompt : '', diarize: multi, output: out, batch: 8 }, { timeoutMs: 12 * 3600_000, stop }),
        multi ? null : tools.tool('diarize', join(dir, v.file), { output: turnsFile }, { threads: th, timeoutMs: 6 * 3600_000, stop }),
      ]);
      const bad = settled.find((x) => x.status === 'rejected');
      if (bad) throw bad.reason;
      const r = settled[0].value;
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
      const paras = toParagraphs(raw.segments);
      const res = await llm.correctParagraphs(paras, vocab, { spend });
      await writeJson(join(dir, 'transcript.work.json'), { paragraphs: res.paragraphs, corrections: res.diff, refused: res.refused });
      rec.corrections = res.diff.length; rec.refused = res.refused.length;
    }

    if (stage === 'describe') {
      const work = await readJson(join(dir, 'transcript.work.json'));
      const desc = await llm.describeTalk(work.paragraphs, { title: meta.title, speaker: meta.speaker, date: meta.date, year: meta.year, event: meta.event, place: meta.place, series: meta.series, source: meta.source?.kind === 'youtube' ? { channel: meta.source.channel, title: meta.source.title } : null }, { spend });
      const byN = new Map(work.paragraphs.map((p) => [p.n, p]));
      meta.summary = desc.summary || null; meta.topics = desc.topics || [];
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

    if (stage === 'quotes') {
      const work = await readJson(join(dir, 'transcript.work.json'));
      const found = await llm.findQuotations(work.paragraphs, { spend });
      const q = d.quotes || await import('./quotes.js');
      const lq = await q.linkQuotes(work.paragraphs, found.quotes);
      const lt = await q.linkTeachings(work.paragraphs, found.teachings, (t, ps) => llm.verifyTeaching(t, ps, { spend }));
      await writeJson(join(dir, 'quotes.json'), { candidates: found, quotes: lq.linked, quotes_rejected: lq.rejected, teachings: lt.linked, teachings_rejected: lt.rejected });
      rec.quotes = lq.linked.length; rec.crs = lt.linked.length; rec.candidates = found.quotes.length + found.teachings.length;
    }

    if (stage === 'thumb') {
      const finder = d.thumbs?.findSpeakerImage || (await import('./thumbs.js')).findSpeakerImage;
      const found = meta.has_video ? null : await finder(meta.speaker, { tradition: meta.tradition }).catch(() => null);
      if (found) {
        const r = await fetch(found.url, { headers: { 'User-Agent': 'SifterSearch media library (https://siftersearch.com)' } });
        await writeFile(join(dir, 'thumb.jpg'), Buffer.from(await r.arrayBuffer()));
        meta.thumb = { file: 'thumb.jpg', ...found };
      } else {
        const peaks = (await readJson(join(dir, 'waveform.json')))?.data || [];
        await writeFile(join(dir, 'thumb.svg'), tileSvg({ speaker: meta.speaker, title: meta.title, peaks }));
        meta.thumb = { file: 'thumb.svg', kind: 'tile' };
      }
      rec.kind = meta.thumb.kind;
    }

    if (stage === 'render') {
      const work = await readJson(join(dir, 'transcript.work.json'));
      const qj = await readJson(join(dir, 'quotes.json'), { quotes: [], teachings: [] });
      const quotes = qj.quotes || [], crs = [...(qj.teachings || [])];
      const { breakoutsOf } = d.quotes || await import('./quotes.js');
      const raw = await readJson(join(dir, 'transcript.raw.json'));
      const transcript = { slug: meta.slug, language: meta.language, asr: meta.asr, enhancement: meta.enhancement ? { asr_input: meta.enhancement.asr_input, listening: meta.enhancement.listening } : null,
        speakers: meta.speakers, chapters: meta.chapters, paragraphs: work.paragraphs, quotes, cross_references: crs,
        corrections: work.corrections, corrections_refused: work.refused, turns: raw?.turns || [] };
      await writeJson(join(dir, 'transcript.json'), transcript);
      await writeFile(join(dir, 'transcript.md'), transcriptMarkdown({ meta, paragraphs: work.paragraphs, quotes, chapters: meta.chapters }));
      const api = `/api/media/${meta.slug}`;
      await writeFile(join(dir, 'page.html'), pageHtml({ meta, paragraphs: work.paragraphs, quotes, crs: breakoutsOf([...quotes, ...crs]), chapters: meta.chapters, speakers: meta.speakers,
        audio: meta.rights.playback === 'full' ? `web/${meta.slug}.ogg` : null, clipUrl: meta.rights.playback === 'clips' ? `${api}/clip-url` : null,
        pageUrl: `https://siftersearch.com/media/${meta.slug}`, thumb: meta.thumb?.file ? `${api}/file/${meta.thumb.file}` : null }));
      meta.words_n = work.paragraphs.reduce((a, p) => a + p.words.length, 0);
      meta.version = (meta.version || 1) + (meta.stages.render ? 1 : 0);
    }

    if (stage === 'ingest') {
      const res = await (d.ingest || (await import('./ingest.js')).ingestTranscript)({ dir, meta });
      meta.doc_id = res.documentId; meta.pi = res.pi || {}; rec.doc_id = res.documentId; rec.links = res.links;
    }

    if (stage === 'catalog') {
      const qj = await readJson(join(dir, 'quotes.json'), { quotes: [], teachings: [] });
      await repo.updateMediaItem(item.id, { title: meta.title, speaker: meta.speaker, language: meta.language, year: meta.year ? Number(meta.year) : null, date: meta.date,
        doc_id: meta.doc_id || null, thumb: meta.thumb?.file || null, quotes_n: qj.quotes?.length || 0, crs_n: qj.teachings?.length || 0, words_n: meta.words_n || 0,
        asr_conf: meta.enhancement?.variants?.find((v) => v.name === meta.enhancement.asr_input)?.avg_logprob ?? null, cost_usd: Math.round(spend.usd * 10000) / 10000,
        meta: { summary: meta.summary, topics: meta.topics, chapters: meta.chapters, rights: meta.rights, source: meta.source, thumb: meta.thumb, event: meta.event, place: meta.place, version: meta.version },
        state: 'done', stage: 'catalog', why: null });
    }

    } catch (err) {
      if (err.code !== 'DRAIN') throw err;
      await save();
      return { yielded: true, resume: { id: item.id, stage }, slug: meta.slug, done };
    }
    meta.stages[stage] = { at: d.now(), ms: Date.now() - t0, ...rec };
    done.push(stage);
    await save();
  }
  return { slug: meta.slug, done, meta };
}

/** Files of an item folder that are published (served by the API, cached on R2). */
export async function publishedFiles(dir) {
  const out = [];
  for (const f of ['page.html', 'transcript.json', 'transcript.md', 'waveform.json', 'thumb.jpg', 'thumb.svg']) if (existsSync(join(dir, f))) out.push(f);
  for (const f of await readdir(join(dir, 'web')).catch(() => [])) out.push(`web/${f}`);
  return out;
}

export { paragraphText };
