// MEDIA LIBRARY ops jobs (planning/media-library-plan.md §4), lane `media` in siftersearch-reports — one at a time, paced.
//   media-scan  { roots?, paths?, urls?, batch = 1, round = 1 } — new recordings (files under the roots / explicit paths,
//               or YouTube URLs) become queued items; a file whose sha256 is already held, or a YouTube id already held,
//               is not added twice. Then queues the next `batch` media-item jobs and itself behind them (gradual, like the
//               Dewey ingest folder). Dewey's drop folder for media: DEWEY_MEDIA_DIR (/tank/dewey-ingest/media).
//   media-item  { id, from?, only?, threads?, lang?, model?, reslug? } — one item through the stage machine (api/lib/media/item.js);
//               yields to a drain between stages and resumes where it stopped.
//   media-vocab { minMentions? } — the controlled vocabulary's names from the entity graph → data/media-vocab.json.
import { readdir, stat, writeFile, mkdir, rename } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { join, extname, dirname } from 'path';
import { parseMediaPath } from '../media/names.js';
import { createMediaItem, findMediaBySha, findMediaBySource, findMediaByYoutube, getMediaItem, updateMediaItem, pendingMedia, vocabularyNames, youtubeHeldSince, releaseHeldYoutube } from '../repos/media-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { logActivity } from '../repos/activity-repo.js';
import { youtubeId, COOL_HOURS } from '../media/youtube.js';

export const MEDIA_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'aif', 'wma', 'mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi']);
export const deweyMediaDir = () => process.env.DEWEY_MEDIA_DIR || '/tank/dewey-ingest/media';
const sha256Of = (path) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });

/** Media files under a folder (recursive), smallest first; hidden files and folders skipped. */
export async function mediaFiles(dir) {
  const out = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (MEDIA_EXT.has(extname(e.name).slice(1).toLowerCase())) out.push({ path: p, size: (await stat(p)).size });
    }
  };
  await walk(dir);
  return out.sort((a, b) => a.size - b.size);
}

export const feedOn = () => process.env.MEDIA_FEED !== '0';

export async function mediaScanJob({ roots = null, paths = [], urls = [], batch = 1, round = 1, queueOnly = false } = {}, deps = {}) {
  const { list = mediaFiles, sha = sha256Of, queue = enqueue, by = 'media-scan' } = deps;
  const out = { round, added: [], held: [], queued: [], skipped: 0 };
  if (!queueOnly) {
    for (const url of urls) {
      const id = youtubeId(url);
      if (!id) { out.held.push({ url, why: 'not a YouTube video URL' }); continue; }
      if (await findMediaByYoutube(id)) { out.skipped++; continue; }
      const it = await createMediaItem({ source_kind: 'youtube', source_ref: url, youtube_id: id });
      out.added.push(it.id);
    }
    const files = [...paths.map((p) => ({ path: p })), ...(await Promise.all((roots || [deweyMediaDir()]).map((r) => list(r)))).flat()];
    for (const f of files) {
      if (await findMediaBySource(f.path)) { out.skipped++; continue; }
      const h = await sha(f.path);
      const twin = await findMediaBySha(h);
      if (twin) {   // the same recording under another name (the Acuto folders repeat the Dunbar course): recorded, not added
        await createMediaItem({ source_kind: 'file', source_ref: f.path, sha256: h, state: 'duplicate', why: `same file as item ${twin.id}${twin.slug ? ` (${twin.slug})` : ''}` });
        out.held.push({ path: f.path, why: `duplicate of ${twin.id}` });
        continue;
      }
      const it = await createMediaItem({ source_kind: 'file', source_ref: f.path, sha256: h });
      out.added.push(it.id);
    }
  }
  // YouTube cool-down: after a bot check / 429 no YouTube item starts for COOL_HOURS (local files go on); then held ones get
  // one polite retry
  const cooling = (await youtubeHeldSince(COOL_HOURS))?.n > 0;
  if (!cooling) await releaseHeldYoutube(COOL_HOURS);
  // processing is fed by the media service's feed loop (N at once, by rank); the old one-at-a-time chain is off
  if (feedOn()) {
    await logActivity('media', `media scan round ${round}: ${out.added.length} added, ${out.held.length} held (the feed loop schedules them)`).catch(() => {});
    return { ...out, remaining: null };
  }
  const next = (await pendingMedia(batch + 200)).filter((i) => i.state === 'queued' && !(cooling && i.source_kind === 'youtube')).slice(0, batch);
  for (const it of next) { await updateMediaItem(it.id, { state: 'scheduled' }); await queue('media-item', { id: it.id }, by); out.queued.push(it.id); }
  const remaining = (await pendingMedia(5000)).filter((i) => i.state === 'queued' && !(cooling && i.source_kind === 'youtube')).length;
  if (remaining > 0 && batch > 0) await queue('media-scan', { batch, round: round + 1, queueOnly: true }, by);
  await logActivity('media', `media scan round ${round}: ${out.added.length} added, ${out.held.length} held, ${out.queued.length} queued, ${remaining} waiting`).catch(() => {});
  return { ...out, remaining };
}

export async function mediaItemJob({ id, ids = null, from = null, only = null, redo = null, threads = null, lang = null, model = null, reslug = false, force = false, stage = null, priority = null, feed = null } = {}, deps = {}) {
  // ids: [..] or 'done' (every published item) → one media-item run each, same options (a back-fill: { ids: 'done', redo: [...] })
  if (id == null && ids) {
    const list = ids === 'done' ? await (deps.repo || await import('../repos/media-repo.js')).doneItemIds() : [].concat(ids).map(Number).filter(Boolean);
    for (const one of list) await (deps.queue || enqueue)('media-item', Object.fromEntries(Object.entries({ id: one, from, only, redo, threads, lang, model, priority }).filter(([, v]) => v != null)));
    return { queued: list.length };
  }
  let item = await getMediaItem(id);
  if (!item) throw new Error(`media item ${id} not found`);
  // a RESUMED run (a drain saved { stage } into its params) continues where it stopped: its `from` / `reslug` were done on
  // the first start and must not run again (10-22: a `from: web` run redid web on every resume; a reslug would have
  // deleted its own new folder)
  if (stage) { from = null; reslug = false; redo = null; }
  // RESLUG (an unpublished item named badly): its folder under the archive root is removed and the item archived again
  // (force: also a published pilot item — its transcript document is retired and its library file removed first)
  if (reslug) {
    if (item.state === 'done' && !force) throw new Error('a published item keeps its slug');
    const { archiveRoot } = await import('../media/item.js');
    const rm = deps.rm || (await import('fs/promises')).rm;
    if (item.doc_id) {
      await (deps.retire || (async (ids) => (await import('../docs-repo.js')).softDeleteDocs(ids, { reason: 'media reslug', allowLastCopy: true })))([item.doc_id]);
      const { config } = await import('../config.js');
      if (item.slug) await rm(join(config.library.basePath, item.tradition || "Baha'i", 'Media', `${item.slug}.md`), { force: true });
    }
    if (item.dir && item.dir.startsWith(`${archiveRoot()}/`)) await rm(item.dir, { recursive: true, force: true });
    item = await updateMediaItem(id, { slug: null, dir: null, doc_id: null, state: 'running' });
    from = 'archive';
  }
  const { runItem } = deps.runItem ? deps : await import('../media/item.js');
  try {
    const r = await runItem(item, { from, only, redo, threads, lang, model });
    if (r.yielded) return r;
    await logActivity('media', `▶ media ${r.slug}: ${r.done.join(' → ') || 'nothing to do'}`).catch(() => {});
    return { id, slug: r.slug, done: r.done, cost_usd: r.meta?.cost?.usd ?? null, stages: r.meta?.stages };
  } catch (err) {
    // a bot check / rate limit is not a failure (no alert mail): the item waits out the YouTube cool-down and is retried
    if (err.code === 'BOT_CHECK') {
      await updateMediaItem(id, { state: 'held', why: String(err.message).slice(0, 500) }).catch(() => {});
      await logActivity('media', `⏸ media item ${id}: YouTube asked for a bot check / rate-limited — held for the cool-down`).catch(() => {});
      return { id, held: true, why: String(err.message).slice(0, 300) };
    }
    // a failed ITEM is recorded on the item (the admin status and the morning summary list them) and the run ends normally:
    // a night of 450 recordings must not mail Chad once per odd file (each failure used to raise an ops alert)
    const prior = /^retry:\d+/.exec(item.why || '')?.[0];   // a retried item keeps its retry count (retryTransientFailures caps it)
    await updateMediaItem(id, { state: 'failed', why: `${prior ? `${prior} ` : ''}${String(err.message)}`.slice(0, 500) }).catch(() => {});
    await logActivity('media', `✗ media item ${id} failed: ${String(err.message).slice(0, 160)}`).catch(() => {});
    if (deps.throwOnFail) throw err;
    return { id, failed: true, why: String(err.message).slice(0, 300) };
  }
}

export async function mediaVocabJob({ limit = 6000, file = process.env.MEDIA_VOCAB_FILE || join(process.cwd(), 'data', 'media-vocab.json') } = {}) {
  const rows = await vocabularyNames({ limit });
  const names = rows.filter((r) => /[^\x00-\x7f]|['’‘-]/.test(r.name) || /^[A-Z]/.test(r.name)).map((r) => ({ name: r.name, type: r.type, n: r.n }));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify({ built_at: new Date().toISOString(), names }, null, 0));
  await rename(`${file}.tmp`, file);
  return { names: names.length, file, top: names.slice(0, 10).map((n) => n.name) };
}

/** DEWEY'S MEDIA DROP FOLDER (Chad 10-21: "drop a file … and the pipeline runs"): one pass — a file in DEWEY_MEDIA_DIR not yet
 *  known queues a media-scan of the folder, unless one is already waiting. → { new, queued }. Run every few minutes by the
 *  media service (api/workers/reports-worker.js). */
export async function mediaDropPass(deps = {}) {
  const { list = mediaFiles, known = findMediaBySource, pending = async () => (await import('../repos/ops-report-repo.js')).pendingRuns('media-scan'), queue = enqueue } = deps;
  const dir = deweyMediaDir();
  const files = await list(dir);
  const fresh = [];
  for (const f of files) if (!(await known(f.path))) fresh.push(f.path);
  if (!fresh.length) return { new: 0, queued: false };
  const waiting = (await pending()).some((r) => (r.params?.roots || []).includes(dir) || (r.params?.paths || []).some((p) => fresh.includes(p)));
  if (!waiting) await queue('media-scan', { roots: [dir], batch: 1 }, 'media-drop');
  return { new: fresh.length, queued: !waiting };
}

// ── media-speakers { refresh?, names?, pauseMs? }: one canonical portrait per speaker (api/lib/media/speakers.js), the master
// kept once in MEDIA_SPEAKER_DIR (served through the image worker, face-centred crops), every item linked by speaker_key.
export const speakerDir = () => process.env.MEDIA_SPEAKER_DIR || '/tank/media/speakers';
/** One person's canonical portrait: kept when held (unless refresh), retried after retryDays, else found (overrides first),
 *  downloaded once into MEDIA_SPEAKER_DIR and recorded. → 'kept' | 'found' | 'none' (with the record). */
export async function ensurePortrait(name, { refresh = false, retryDays = 7, overrides = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const sp = deps.speakers || await import('../media/speakers.js');
  const fetchImpl = deps.fetchImpl || fetch;
  const ov = overrides || deps.overrides || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-speaker-portraits.json'), 'utf8').catch(() => '{}'));
  const key = sp.speakerKey(name);
  if (!key) return { status: 'none', key: null };
  const cur = await repo.getSpeaker(key);
  if (cur?.file && !refresh) return { status: 'kept', key, record: cur };
  if (!refresh && cur?.tried_at && Date.now() - Date.parse(cur.tried_at) < retryDays * 86400_000 && !ov[key]) return { status: 'none', key, record: cur };
  const clean = sp.cleanName(name), parts = sp.ascii(clean).split(/\s+/);
  const entity_id = await repo.personEntityId(sp.ascii(clean).replace(/[^a-zA-Z]/g, '').toLowerCase(), parts[parts.length - 1]).catch(() => null);
  const at = new Date().toISOString();
  // 1) the biography pages' portrait of this person (Chad 10-22: reuse it before searching the web)
  const bio = sp.biographyPortrait ? await sp.biographyPortrait(entity_id, { manifest: deps.bioManifest || null }).catch(() => null) : null;
  if (bio?.cdn) {
    const record = await repo.upsertSpeaker({ key, name: clean, entity_id, file: bio.cdn, sha: createHash('sha256').update(bio.cdn).digest('hex'), origin: 'biography',
      source_url: bio.source_url || bio.url || null, page_url: `https://siftersearch.com/biography/${entity_id}`, credit: bio.credit || bio.author || null, licence: bio.license || null, fetched_at: at, tried_at: at });
    return { status: 'found', key, record, origin: 'biography' };
  }
  // 2) the web (hand-found overrides, Bahaipedia/bahai.media, Wikidata/Commons, Wikipedia)
  const p = await sp.portraitFor(name, { overrides: ov, fetchImpl }).catch(() => null);
  if (!p?.url) return { status: 'none', key, record: await repo.upsertSpeaker({ key, name: clean, entity_id, tried_at: at }) };
  const r = await fetchImpl(p.url, { headers: { 'User-Agent': 'SifterSearch media library (https://siftersearch.com)' }, signal: AbortSignal.timeout(30000) });
  const type = r.headers?.get?.('content-type') || '';
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type) || bytes.length < 3000) {
    return { status: 'none', key, record: await repo.upsertSpeaker({ key, name: clean, entity_id, tried_at: at, note: `download refused (${r.status} ${type})` }) };
  }
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const dir = deps.dir || speakerDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.${ext}`), bytes);   // the master, kept on tower too
  const sha = createHash('sha256').update(bytes).digest('hex');
  // stored ONCE in the cdn-assets bucket where the image worker reads it (as the biography portraits are)
  const file = await (deps.putCdn || sp.putCdnPortrait)(`media-speakers/${key}.${ext}`, bytes, type, { fetchImpl });
  const record = await repo.upsertSpeaker({ key, name: clean, entity_id, file, sha, width: p.width || null, height: p.height || null, origin: p.origin,
    source_url: p.source_url || p.url, page_url: p.page_url || null, credit: p.credit || null, licence: p.licence || null, fetched_at: at, tried_at: at });
  return { status: 'found', key, record, origin: p.origin };
}

export async function mediaSpeakersJob({ refresh = false, names = [], pauseMs = 1200, retryDays = 7 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const sp = deps.speakers || await import('../media/speakers.js');
  const overrides = deps.overrides || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-speaker-portraits.json'), 'utf8').catch(() => '{}'));
  const people = [...(await repo.mediaSpeakerNames()).map((r) => r.speaker), ...names];
  const out = { speakers: 0, found: 0, kept: 0, none: [], new: [] };
  const seen = new Set();
  for (const name of people) {
    const key = sp.speakerKey(name);
    if (!key) continue;
    if (!names.includes(name)) await repo.setItemsSpeakerKey(name, key);
    if (seen.has(key)) continue;
    seen.add(key); out.speakers++;
    const r = await ensurePortrait(name, { refresh, retryDays, overrides }, { ...deps, repo, speakers: sp });
    if (r.status === 'kept') out.kept++;
    else if (r.status === 'found') { out.found++; out.new.push(`${r.record?.name} (${r.origin})`); if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs)); }
    else out.none.push(name);
  }
  await logActivity('media', `speaker portraits: ${out.found} new, ${out.kept} kept, ${out.none.length} without a photo, of ${out.speakers}`).catch(() => {});
  return out;
}

// media-playback { level = 'full', sourceKind? }: the catalogue's playback level for every item (Chad 10-22: "everything
// should be local"), then each published item's page re-rendered for it (render → ingest → catalog).
export async function mediaPlaybackJob({ level = 'full', sourceKind = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { LEVELS } = await import('../media/rights.js');
  if (!LEVELS.includes(level)) throw new Error(`level must be one of ${LEVELS.join(', ')}`);
  const changed = await repo.setPlayback(level, { sourceKind });
  const ids = await repo.doneItemIds();
  for (const id of ids) await (deps.queue || enqueue)('media-item', { id, redo: ['update'] }, 'media-playback');
  return { level, changed, rerendered: ids.length };
}

// media-grade { ids?, after? }: the quality grade for items already processed (back-fill; new items grade in the pipeline).
// One item at a time; yields to a drain with its resume point.
export async function mediaGradeJob({ ids = null, after = 0 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { runItem } = deps.runItem ? deps : await import('../media/item.js');
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const list = (ids || await repo.doneItemIds()).filter((id) => id > after).sort((a, b) => a - b);
  const out = { graded: 0, grades: {}, failed: [] };
  for (const id of list) {
    if (draining()) return { ...out, yielded: true, resume: { after: id - 1 } };
    const item = await repo.getMediaItem(id);
    if (!item?.dir) continue;
    try {
      const r = await runItem(item, { only: ['grade'] });
      const gr = r.meta?.quality?.overall || '?';
      out.graded++; out.grades[gr] = (out.grades[gr] || 0) + 1;
    } catch (err) { out.failed.push({ id, why: String(err.message).slice(0, 120) }); }
  }
  return out;
}

// ── media-short { slug, start, end, format?, template? }: an audiogram short (api/lib/media/short-job.js), cached per
// talk version × range × format × template; rendered on boss's CPU through the gate
export async function mediaShortJob(params = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { renderShortFor } = deps.short || await import('../media/short-job.js');
  const item = await repo.getMediaBySlug(params.slug);
  const portraitUrl = async (it) => {
    const sp = it.speaker_key ? await repo.getSpeaker(it.speaker_key) : null;
    // the extended 9:16 master when there is one for the current portrait (no stretching, room for every crop)
    if (sp?.ext_file && sp.ext_sha && sp.ext_of === sp.sha) return `https://siftersearch.com/img/cdn/siftersearch.com/${sp.ext_file}?v=${sp.ext_sha.slice(0, 16)}`;
    return sp?.file && sp.sha ? `https://siftersearch.com/img/cdn/siftersearch.com/${sp.file}?v=${sp.sha.slice(0, 16)}` : null;
  };
  return renderShortFor(item, params, { portraitUrl, ...(deps.render || {}) });
}

// ── media-shorts-moments { per = 2, roles = ['hand', 'uhj'] }: queue a short for the top moments of the talks by Hands of the
// Cause and House of Justice members (template chosen by content / rotation; already rendered ones are skipped by the job)
export async function mediaShortsMomentsJob({ per = 2, roles = ['hand', 'uhj'] } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { speakerRole } = deps.listing || await import('../media/listing-index.js');
  const queue = deps.queue || enqueue;
  const { join: pj } = await import('path');
  const { readFile: rf } = await import('fs/promises');
  const out = { talks: 0, queued: 0, no_moments: 0 };
  for (const id of await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir || !roles.includes(speakerRole(it.speaker, { year: it.year }))) continue;
    out.talks++;
    const meta = JSON.parse(await rf(pj(it.dir, 'meta.json'), 'utf8').catch(() => '{}'));
    const ms = (meta.moments || []).slice(0, per);
    if (!ms.length) { out.no_moments++; continue; }
    for (const m of ms) { await queue('media-short', { slug: it.slug, start: m.t0_ms / 1000, end: Math.min(m.t1_ms / 1000, m.t0_ms / 1000 + 60), format: 'vertical' }, 'shorts-moments'); out.queued++; }
  }
  return out;
}

// ── media-portraits-extend { keys?, force? }: one EXTENDED 9:16 master per speaker portrait (api/lib/media/outpaint.js) — the
// margins filled once by the image-outpaint role, the original pixels pasted back; stored beside the original in cdn-assets
// (media-speakers/<key>-ext.jpg) and recorded on the speaker (ext_*: AI-extended, model, prompt, $). Skips a speaker whose
// extension was made from the current original.
export async function mediaPortraitsExtendJob({ keys = null, force = false, limit = 500 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const op = deps.outpaint || await import('../media/outpaint.js');
  const tools = deps.tools || await import('../media/tools.js');
  const { putCdnPortrait } = deps.speakers || await import('../media/speakers.js');
  const { modelFor } = await import('../model-roles.js');
  const model = modelFor('image-outpaint').model;
  const { createHash } = await import('crypto');
  const { tmpdir } = await import('os');
  const { writeFile: wf, rm: rmf } = await import('fs/promises');
  const fetchImpl = deps.fetchImpl || fetch;
  const all = (await repo.listSpeakers()).filter((s) => s.file && s.sha && (!keys || keys.includes(s.key)));
  const out = { speakers: all.length, extended: 0, kept: 0, failed: [], usd: 0 };
  for (const s of all.slice(0, limit)) {
    if (!force && s.ext_file && s.ext_of === s.sha) { out.kept++; continue; }
    try {
      // already generated and uploaded but never recorded (10-22: the record failed after the upload): adopt it, don't pay twice
      if (!s.ext_file && !force) {
        const prev = await fetchImpl(`https://siftersearch.com/img/cdn/siftersearch.com/media-speakers/${s.key}-ext.jpg?v=adopt`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
        const buf = prev?.ok ? Buffer.from(await prev.arrayBuffer()) : null;
        if (buf && buf.length > 20000) {
          await repo.setSpeakerExtension(s.key, { ext_file: `media-speakers/${s.key}-ext.jpg`, ext_sha: createHash('sha256').update(buf).digest('hex'), ext_of: s.sha, ext_model: model,
            ext_prompt: op.OUTPAINT_PROMPT, ext_usd: 0.042, ext_at: new Date().toISOString(), ext_error: '' });
          out.adopted = (out.adopted || 0) + 1; continue;
        }
      }
      const r = await fetchImpl(`https://siftersearch.com/img/cdn/siftersearch.com/${s.file}?v=${s.sha.slice(0, 16)}`, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`original HTTP ${r.status}`);
      const src = Buffer.from(await r.arrayBuffer());
      const tmp = join(tmpdir(), `portrait-${s.key}-${Date.now()}`);
      await wf(tmp, src);
      // the image's own size (tools.ffprobe is the audio prober: no width/height — 10-22: NaN sizes failed all 89)
      const dims = await tools.imageSize(tmp).finally(() => rmf(tmp, { force: true }));
      const ext = await op.extendPortrait(src, dims, { model, ffmpeg: (args) => tools.ffmpeg(args, { timeoutMs: 120_000 }),
        outpaint: (png) => op.geminiOutpaint(png, { model, fetchImpl }) });
      const file = await putCdnPortrait(`media-speakers/${s.key}-ext.jpg`, ext.bytes, 'image/jpeg', { fetchImpl });
      await repo.setSpeakerExtension(s.key, { ext_file: file, ext_sha: createHash('sha256').update(ext.bytes).digest('hex'), ext_of: s.sha, ext_model: model,
        ext_prompt: ext.prompt, ext_usd: ext.usd, ext_at: new Date().toISOString(), ext_error: '' });
      out.extended++; out.usd = Math.round((out.usd + ext.usd) * 10000) / 10000;
    } catch (err) {
      out.failed.push({ key: s.key, error: String(err.message).slice(0, 160) });
      await repo.setSpeakerExtension(s.key, { ext_error: String(err.message).slice(0, 300) }).catch(() => {});
    }
  }
  await logActivity('media', `▶ portraits extended: ${out.extended} (${out.kept} kept, ${out.failed.length} failed) · $${out.usd}`).catch(() => {});
  return out;
}

// ── THROUGHPUT (Chad 10-22: "about a month" at one item at a time) ──────────────────────────────────────────────────────
// THE QUEUE ORDER (Chad 10-22: "first please focus on the historical materials"): 1 historic recordings (the earliest
// material: historic-recordings, pilgrim recollections, the first generation — Martha Root, Louis Gregory, …) · 2 Hands of the
// Cause · 3 members of the Universal House of Justice · 4 other historic speakers from the local collections · 5 modern
// scholars (the curated webinars) last. Oldest first within a tier. rank = tier × 10⁷ + year × 10³ + order (lower = sooner).
export const TIERS = [[1, 'historic', 'Historic recordings'], [2, 'hands', 'Hands of the Cause'], [3, 'uhj', 'Universal House of Justice'],
  [4, 'historic-speakers', 'Other historic speakers'], [5, 'scholars', 'Modern scholars']];
const FIRST_GENERATION = /\b(martha root|louis g(?:\.|regory)|louis gregory|dorothy (?:beecher )?baker|keith ransom|may (?:bolles )?maxwell|lua getsinger|thornton chase|hippolyte dreyfus|corinne true|clara dunn|abdu.?l.?bah|abdul.?baha)\b/i;
const HISTORIC_COLLECTION = /historic|pilgrim|recollection|early|martha|guardian/i;
const yearOf = (...ss) => { for (const s of ss) { const m = /\b(19[0-9]{2}|20[0-2][0-9])\b/.exec(String(s || '')); if (m) return Number(m[1]); } return 9999; };
/** A target's tier: 1 historic · 2 Hands · 3 UHJ · 4 other historic speakers (local) · 5 modern scholars. Pure. */
export function tierOf({ source_kind, collection = '', path = '', speaker = '', role = null, ytRole = null }) {
  const who = `${speaker} ${path}`;
  if (FIRST_GENERATION.test(who) || (source_kind !== 'youtube' && HISTORIC_COLLECTION.test(`${collection} ${path}`))) return 1;
  if (ytRole === 'Hand of the Cause' || role === 'hand') return 2;
  if (ytRole === 'UHJ member' || role === 'uhj') return 3;
  if (source_kind !== 'youtube') return 4;
  return 5;
}
export const rankOf = (tier, year, order) => tier * 1e7 + Math.min(9999, year || 9999) * 1e3 + Math.min(999, order % 1000);
export async function rankFor(row, info, speakerRole) {
  if (row.source_kind === 'youtube') {
    const x = info.get(row.youtube_id) || {};
    const tier = tierOf({ source_kind: 'youtube', speaker: x.speaker || row.speaker || '', ytRole: x.role || null });
    return rankOf(tier, yearOf(x.title, row.year), x.i ?? row.id);
  }
  const p = parseMediaPath(row.rel || '');
  const speaker = row.speaker || p.speaker || '';
  const tier = tierOf({ source_kind: 'file', collection: row.collection || p.collection || '', path: row.rel || '', speaker, role: speakerRole(speaker, { year: row.year || p.year }) });
  return rankOf(tier, row.year || p.year || yearOf(row.rel), row.id);
}
export async function mediaRankJob({ talks = join(process.cwd(), 'planning', 'media-targets', 'youtube-talks.json'), register = true } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { speakerRole } = deps.listing || await import('../media/listing-index.js');
  const { readFile: rf } = await import('fs/promises');
  const { relative } = await import('path');
  const { mediaRoot } = await import('../media/item.js');
  // EVERY target is a catalogue row (Chad 10-22: "we should have close to 1400"): the talks file's videos that are not
  // Shorts, not "about" the speaker, one per duplicate group
  const t = JSON.parse(await rf(talks, 'utf8').catch(() => '{}'));
  const info = new Map();
  const registered = [];
  const seenGroup = new Set();
  let order = 0;
  for (const sec of ['hands_uhj', 'hooper_dunbar', 'curated_sacred_traditions']) {
    for (const x of t[sec] || []) {
      if (!x.video_id || x.is_short || x.relation === 'about') continue;
      const g = x.duplicate_group || x.video_id;
      if (seenGroup.has(g)) continue;
      seenGroup.add(g);
      info.set(x.video_id, { speaker: x.speaker, role: sec === 'curated_sacred_traditions' ? 'scholar' : x.role, title: x.title, i: order++ });
      if (register && !(await repo.findMediaByYoutube(x.video_id))) {
        const it = await repo.createMediaItem({ source_kind: 'youtube', source_ref: x.url || `https://www.youtube.com/watch?v=${x.video_id}`, youtube_id: x.video_id, channel: x.channel || null });
        registered.push(it.id);
      }
    }
  }
  const rows = await repo.rankRows();
  const ranks = [];
  for (const r of rows) ranks.push({ id: r.id, rank: await rankFor({ ...r, rel: r.source_kind === 'youtube' ? '' : relative(mediaRoot(), r.source_ref || '') }, info, speakerRole) });
  await repo.setQueueRanks(ranks);
  const tiers = Object.fromEntries(TIERS.map(([n, key]) => [key, ranks.filter((x) => Math.floor(x.rank / 1e7) === n).length]));
  return { registered: registered.length, ranked: ranks.length, tiers };
}

// media-fetch { limit }: DOWNLOADS, apart from processing — the next YouTube items by rank go into the archive (audio via
// yt-dlp + PO token → Titan → Seemuapps, the original kept, meta written), politely paced; the item goes back to 'queued'
// for processing. A bot check stops the round and holds the item for the cool-down.
export async function mediaFetchJob({ limit = 6, pauseMs = 25000 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { runItem } = deps.runItem ? deps : await import('../media/item.js');
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const nap = deps.nap || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = { downloaded: [], held: [], failed: [] };
  if ((await repo.youtubeHeldSince(COOL_HOURS))?.n > 0) return { ...out, cooling: true };
  for (const it of await repo.nextToDownload(limit)) {
    if (draining()) break;
    await repo.updateMediaItem(it.id, { state: 'running', stage: 'archive' });
    try {
      await runItem(it, { only: ['archive'] });
      await repo.updateMediaItem(it.id, { state: 'queued', stage: 'archive' });
      out.downloaded.push(it.id);
    } catch (err) {
      if (err.code === 'BOT_CHECK') { await repo.updateMediaItem(it.id, { state: 'held', why: String(err.message).slice(0, 500) }); out.held.push(it.id); break; }
      await repo.updateMediaItem(it.id, { state: 'failed', why: `download: ${String(err.message).slice(0, 480)}` });
      out.failed.push({ id: it.id, why: String(err.message).slice(0, 160) });
    }
    await nap(pauseMs + Math.round(Math.random() * pauseMs));   // polite pacing
  }
  if (out.downloaded.length || out.failed.length) await logActivity('media', `⬇ media downloads: ${out.downloaded.length} in, ${out.failed.length} failed, ${out.held.length} held`).catch(() => {});
  return out;
}

/** One FEED pass (the media service runs it every 30 s): keep N new items in processing (by rank, as priority runs so they
 *  go ahead of re-runs of published items) and one download run queued. → { scheduled, inflight } */
export async function mediaFeedPass(deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const parallel = deps.parallel || (await import('../media/tools.js')).mediaParallel();
  const queue = deps.queue || ops.enqueue;
  const pending = await ops.pendingRuns('media-item');
  const inflight = pending.filter((r) => r.params?.feed).length;
  const out = { scheduled: [], inflight };
  if (repo.retryTransientFailures) { const back = await repo.retryTransientFailures(); if (back.length) out.retried = back; }
  for (const it of await repo.nextToProcess(Math.max(0, parallel - inflight))) {
    await repo.updateMediaItem(it.id, { state: 'scheduled' });
    await queue('media-item', { id: it.id, feed: true, priority: true }, 'media-feed');
    out.scheduled.push(it.id);
  }
  const fetchPending = (await ops.pendingRuns('media-fetch')).length;
  if (!fetchPending && (await repo.nextToDownload(1)).length && !((await repo.youtubeHeldSince(COOL_HOURS))?.n > 0)) { await queue('media-fetch', { limit: 6 }, 'media-feed'); out.fetch = true; }
  return out;
}

// media-stages-sync: the catalogue's stages_done from each item's meta.json (once, for items processed before migration 173)
export async function mediaStagesSyncJob(params = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { stagesDone } = await import('../media/item.js');
  const { readFile: rf } = await import('fs/promises');
  const rows = (await repo.rankRows()).map((r) => r.id);
  let n = 0;
  for (const id of rows) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const meta = JSON.parse(await rf(join(it.dir, 'meta.json'), 'utf8').catch(() => '{}'));
    await repo.updateMediaItem(id, { stages_done: stagesDone(meta.stages || {}) }); n++;
  }
  return { synced: n };
}

// media-quote-audit { write? }: every published talk's quote and cross-reference links checked against the passage gate
// (api/lib/media/quotes.js passageGate: no headings, contents, front matter or file-named works); with write, the affected
// talks are relinked (redo quotes + update; the new gate picks the next good source)
export async function mediaQuoteAuditJob({ write = false } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { paragraphsByIds } = deps.paragraphs || await import('../paragraphs-repo.js');
  const { passageGate } = await import('../media/quotes.js');
  const { readFile: rf } = await import('fs/promises');
  const queue = deps.queue || enqueue;
  const out = { talks: 0, quotes: 0, crs: 0, rejected_quotes: 0, rejected_crs: 0, reasons: {}, affected: [], sample: [] };
  for (const id of await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const q = JSON.parse(await rf(join(it.dir, 'quotes.json'), 'utf8').catch(() => '{}'));
    const links = [...(q.quotes || []).map((x) => ({ kind: 'quote', id: x.source?.id ?? x.found_id, cite: x.cite })), ...(q.teachings || []).map((x) => ({ kind: 'cr', id: x.source?.id, cite: x.cite }))].filter((x) => x.id);
    if (!links.length) continue;
    out.talks++;
    const rows = new Map((await paragraphsByIds(links.map((x) => x.id))).map((r) => [r.id, r]));
    let bad = 0;
    for (const l of links) {
      out[l.kind === 'quote' ? 'quotes' : 'crs']++;
      const why = rows.has(l.id) ? passageGate(rows.get(l.id)) : 'source paragraph gone';
      if (!why) continue;
      bad++; out[l.kind === 'quote' ? 'rejected_quotes' : 'rejected_crs']++;
      out.reasons[why] = (out.reasons[why] || 0) + 1;
      if (out.sample.length < 12) out.sample.push({ slug: it.slug, kind: l.kind, cite: l.cite, why });
    }
    if (bad) { out.affected.push(it.slug); if (write) await queue('media-item', { id, redo: ['quotes', 'update'] }, 'media-quote-audit'); }
  }
  return out;
}

// ── STAGE LANES (Chad 10-22: "no internet dependencies on GPU processing. Queue up work and keep them busy") ─────────────────
// COMPUTE (LAN only: archive · grade · enhance · web renditions · transcription with alignment and diarization on boss) and
// LLM (names · copy-edit · description · publish · subheaders · quotes · links · assess · update; API-bound) are separate
// jobs with their own lanes: an item leaves the compute lane 'transcribed' and the LLM feed picks it up — an API storm never
// holds a compute slot, and the compute machines never wait for the internet.
export const COMPUTE_STAGES = ['archive', 'grade', 'enhance', 'web', 'transcribe'];
export async function mediaComputeJob({ id, ...rest } = {}, deps = {}) {
  const before = await (deps.repo?.getMediaItem || getMediaItem)(id);
  const r = await mediaItemJob({ id, ...rest, only: COMPUTE_STAGES }, deps);
  if (!r?.failed && !r?.held && !r?.yielded) await (deps.repo?.updateMediaItem || updateMediaItem)(id, { state: before?.state === 'done' ? 'done' : 'transcribed' });
  return failedRun(r);
}
// a failed ITEM is NOT a failed run (a thrown run mails Chad once per item — a night of failures = a mailbox of alerts):
// the run's result carries failed:true, the item its 'failed' state + reason, /api/media/progress/live → health counts them,
// system-checks WARNs past MEDIA_FAIL_WARN an hour, and the feed's capped retry brings the item back
function failedRun(r) { return r?.failed ? { ...r, outcome: 'item-failed' } : r; }
export async function mediaLlmJob({ id, ...rest } = {}, deps = {}) {
  // everything after the compute stages (they are recorded done, so runItem skips them)
  return failedRun(await mediaItemJob({ id, ...rest }, deps));
}

/** The FEED for both lanes (30 s): keep the compute queue `computeDepth` deep (by rank; YouTube items once downloaded) and the
 *  LLM queue `llmDepth` deep (transcribed items by rank); one download run queued; transient failures back after 30 min. */
export async function mediaLanesFeedPass(deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || ops.enqueue;
  const computeDepth = deps.computeDepth ?? (Number(process.env.MEDIA_COMPUTE_DEPTH) || 8);
  const llmDepth = deps.llmDepth ?? (Number(process.env.MEDIA_LLM_DEPTH) || 8);
  const out = { compute: [], llm: [] };
  if (repo.retryTransientFailures) { const back = await repo.retryTransientFailures(); if (back.length) out.retried = back; }
  const compute = await ops.pendingRuns('media-compute');
  out.compute_pending = compute.length;
  for (const it of await repo.nextToProcess(Math.max(0, computeDepth - compute.length))) {
    await repo.updateMediaItem(it.id, { state: 'scheduled' });
    await queue('media-compute', { id: it.id, priority: true }, 'media-feed');
    out.compute.push(it.id);
  }
  const llm = await ops.pendingRuns('media-llm');
  out.llm_pending = llm.length;
  for (const it of await repo.nextTranscribed(Math.max(0, llmDepth - llm.length))) {
    await repo.updateMediaItem(it.id, { state: 'llm_queued' });
    await queue('media-llm', { id: it.id, priority: true }, 'media-feed');
    out.llm.push(it.id);
  }
  const fetchPending = (await ops.pendingRuns('media-fetch')).length;
  if (!fetchPending && (await repo.nextToDownload(1)).length && !((await repo.youtubeHeldSince(COOL_HOURS))?.n > 0)) { await queue('media-fetch', { limit: 6 }, 'media-feed'); out.fetch = true; }
  return out;
}
