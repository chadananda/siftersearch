// MEDIA LIBRARY ops jobs (planning/media-library-plan.md §4), lane `media` in siftersearch-reports — one at a time, paced.
//   media-scan  { roots?, paths?, urls?, batch = 1, round = 1 } — new recordings (files under the roots / explicit paths,
//               or YouTube URLs) become queued items; a file whose sha256 is already held, or a YouTube id already held,
//               is not added twice. Then queues the next `batch` media-item jobs and itself behind them (gradual, like the
//               Dewey ingest folder). Dewey's drop folder for media: DEWEY_MEDIA_DIR (/tank/dewey-ingest/media).
//   media-item  { id, from?, only?, threads?, lang?, model?, reslug? } — one item through the stage machine (api/lib/media/item.js);
//               yields to a drain between stages and resumes where it stopped.
//   media-vocab { minMentions? } — the controlled vocabulary's names from the entity graph → data/media-vocab.json.
import { late } from '../media/late.js';
import { hostProfile, hostRegistry } from '../media/tools.js';
import {audioVersion, markAudioPending} from '../media/talk-audio.js';
import { readdir, stat, writeFile, mkdir, rename } from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { pipeline as streamPipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { join, extname, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseMediaPath, seriesTitle, partTitle } from '../media/names.js';
import { historicalIndex, historicalTier } from '../media/historical.js';
import { createMediaItem, findMediaBySha, findMediaBySource, findMediaByYoutube, getMediaItem, updateMediaItem, pendingMedia, vocabularyNames, youtubeHeldSince, releaseHeldYoutube } from '../repos/media-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { logActivity } from '../repos/activity-repo.js';
import { youtubeId, COOL_HOURS } from '../media/youtube.js';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
const execFile = promisify(execFileCb);

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

/** media-find { like, rank?, speaker?, title? } — which items came from a path/URL containing `like`; optional write: queue_rank (lower = sooner), speaker, title (only when given). */
export async function mediaFindJob({ like, rank = null, speaker = null, title = null } = {}, deps = {}) {
  if (!like || String(like).length < 3) throw new Error('like (3+ characters) required');
  const R = deps.repo || await import('../repos/media-repo.js');
  const rows = await R.mediaBySourceLike(like);
  const set = Object.fromEntries(Object.entries({ queue_rank: rank, speaker, title }).filter(([, v]) => v != null));
  if (Object.keys(set).length) for (const r of rows) await R.updateMediaItem(r.id, set);
  return { items: rows, wrote: Object.keys(set).length ? { fields: Object.keys(set), items: rows.length } : null };
}

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

/** Fetch an Internet Archive audio item's MP3s into Dewey's inbox. Exact SHA-256 holdings are rejected before media-scan;
 *  media-scan repeats the check atomically at catalogue insertion, then the normal feed starts unique talks. */
export async function mediaArchiveImportJob({ identifier, pauseMs = 2000, limit = 100 } = {}, deps = {}) {
  if (!/^[a-z0-9][a-z0-9_-]{2,100}$/i.test(String(identifier || ''))) throw new Error('valid Archive.org identifier required');
  const repo = deps.repo || await import('../repos/media-repo.js');
  const fetchImpl = deps.fetchImpl || fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const fs = deps.fs || await import('fs/promises');
  const inbox = deps.inbox || deweyMediaDir();
  const metadataUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const mr = await fetchImpl(metadataUrl, { signal: AbortSignal.timeout(60_000) });
  if (!mr.ok) throw new Error(`Archive.org metadata HTTP ${mr.status}`);
  const metadata = await mr.json();
  const files = (metadata.files || []).filter((f) => f.source === 'original' && /^audio\/mpeg$|^VBR MP3$|\.mp3$/i.test(`${f.format || ''} ${f.name || ''}`))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  if (!files.length) throw new Error(`no original MP3s found in Archive.org item ${identifier}`);
  await mkdir(inbox, { recursive: true });
  const seenMd5 = new Map(), out = { identifier, listed: files.length, downloaded: [], duplicates: [], failed: [] };
  for (const f of files) {
    const dest = join(inbox, basename(f.name));
    const temp = `${dest}.download-${process.pid}.part`;
    if (f.md5 && seenMd5.has(String(f.md5).toLowerCase())) {
      out.duplicates.push({ name: f.name, duplicate_of: seenMd5.get(String(f.md5).toLowerCase()), by: 'archive-md5' });
      continue;
    }
    if (f.md5) seenMd5.set(String(f.md5).toLowerCase(), f.name);
    try {
      let sha;
      if (existsSync(dest)) sha = await sha256Of(dest);
      else {
        const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(30 * 60_000) });
        if (!r.ok || !r.body) throw new Error(`download HTTP ${r.status}`);
        await streamPipeline(Readable.fromWeb(r.body), createWriteStream(temp, { flags: 'wx' }));
        sha = await sha256Of(temp);
        const held = await repo.findMediaBySha(sha);
        if (held) {
          await fs.rm(temp, { force: true });
          out.duplicates.push({ name: f.name, duplicate_of: held.slug || held.id, by: 'sha256' });
          continue;
        }
        await rename(temp, dest);
      }
      const held = await repo.findMediaBySha(sha);
      if (held) { out.duplicates.push({ name: f.name, duplicate_of: held.slug || held.id, by: 'sha256' }); continue; }
      const sidecar = { provider: 'archive.org', identifier, name: f.name, url: `https://archive.org/details/${identifier}`, file_url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
        md5: f.md5 || null, sha1: f.sha1 || null, sha256: sha, bytes: Number(f.size) || null, license: metadata.metadata?.licenseurl || null };
      await fs.writeFile(`${dest}.source.json`, JSON.stringify(sidecar, null, 1));
      const scan = await mediaScanJob({ roots: [], paths: [dest], batch: 1 }, { repo, ...deps });
      out.downloaded.push({ name: f.name, sha256: sha, added: scan.added || [], duplicates: scan.skipped || 0 });
    } catch (err) {
      await fs.rm(temp, { force: true }).catch(() => {});
      out.failed.push({ name: f.name, error: String(err.message).slice(0, 180) });
    }
    await sleep(Math.max(0, Math.min(30_000, Number(pauseMs) || 0)));
  }
  await logActivity('media', `Archive.org ${identifier}: ${out.downloaded.length} files downloaded, ${out.duplicates.length} exact duplicates, ${out.failed.length} failed`).catch(() => {});
  return out;
}

export async function mediaItemJob({ id, ids = null, from = null, only = null, redo = null, threads = null, lang = null, model = null, reslug = false, force = false, stage = null, priority = null, feed = null, merge_speakers = false, remaster = false } = {}, deps = {}) {
  // ids: [..] or 'done' (every published item) → one media-item run each, same options (a back-fill: { ids: 'done', redo: [...] })
  if (id == null && ids) {
    const R = deps.repo || await import('../repos/media-repo.js');
    // ids or SLUGS (an audit names talks by slug)
    const list = ids === 'done' ? await R.doneItemIds() : ids === 'problems' ? await R.publishedProblemIds()
      : (await Promise.all([].concat(ids).map(async (x) => (/^\d+$/.test(String(x)) ? Number(x) : (await R.getMediaBySlug(String(x)))?.id)))).filter(Boolean);
    // never a second run on an item with one queued or running (two runs on one item overwrite each other's files)
    const ops = deps.ops || (deps.queue ? { pendingRuns: async () => [] } : await import('../repos/ops-report-repo.js'));
    const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
    const skipped = list.filter((x) => busy.has(x));
    for (const one of list.filter((x) => !busy.has(x))) await (deps.queue || enqueue)('media-item', Object.fromEntries(Object.entries({ id: one, from, only, redo, threads, lang, model, priority }).filter(([, v]) => v != null)));
    return skipped.length ? { queued: list.length - skipped.length, skipped_busy: skipped } : { queued: list.length };
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
      await (deps.retire || (async (ids) => (await late('api/lib/docs-repo.js')).softDeleteDocs(ids, { reason: 'media reslug', allowLastCopy: true })))([item.doc_id]);
      const { config } = await import('../config.js');
      if (item.slug) await rm(join(config.library.basePath, item.tradition || "Baha'i", 'Media', `${item.slug}.md`), { force: true });
    }
    if (item.dir && item.dir.startsWith(`${archiveRoot()}/`)) await rm(item.dir, { recursive: true, force: true });
    item = await updateMediaItem(id, { slug: null, dir: null, doc_id: null, state: 'running' });
    from = 'archive';
  }
  const { runItem } = deps.runItem ? deps : await import('../media/item.js');
  try {
    const r = await runItem(item, { from, only, redo, threads, lang, model, mergeSpeakers: !!merge_speakers, remaster: !!remaster });
    if (r.yielded) return r;
    await logActivity('media', `▶ media ${r.slug}: ${r.done.join(' → ') || 'nothing to do'}`).catch(() => {});
    return { id, slug: r.slug, done: r.done, cost_usd: r.meta?.cost?.usd ?? null, stages: r.meta?.stages };
  } catch (err) {
    // no worker could take the stage (tower never does heavy work): not a failure — the item goes back in the queue and is retried after a pause
    if (err.code === 'WORKER_WAIT') {
      if (!(item.state === 'done' || item.published_at || /,catalog,/.test(item.stages_done || ''))) await updateMediaItem(id, { state: 'queued', why: `waiting for a worker: ${String(err.message).slice(0, 200)}` }).catch(() => {});
      await new Promise((r) => setTimeout(r, deps.waitMs ?? 90_000));   // damps the retry loop: each lane worker retries at most once a minute and a half
      return { id, waiting: true, why: String(err.message).slice(0, 200) };
    }
    // a bot check / rate limit is not a failure (no alert mail): the item waits out the YouTube cool-down and is retried
    if (err.code === 'BOT_CHECK') {
      await updateMediaItem(id, { state: 'held', why: String(err.message).slice(0, 500) }).catch(() => {});
      await logActivity('media', `⏸ media item ${id}: YouTube asked for a bot check / rate-limited — held for the cool-down`).catch(() => {});
      return { id, held: true, why: String(err.message).slice(0, 300) };
    }
    // a failed ITEM is recorded on the item (the admin status and the morning summary list them) and the run ends normally:
    // a night of 450 recordings must not mail Chad once per odd file (each failure used to raise an ops alert)
    const prior = /^retry:\d+/.exec(item.why || '')?.[0];   // a retried item keeps its retry count (retryTransientFailures caps it)
    // a PUBLISHED talk whose re-run failed stays published (10-23: blocked re-links took 15 talks off the catalogue): the
    // failure is kept in why ('update failed: …') and the run's result; health counts these as published_problems
    if (item.state === 'done' || item.published_at || /,catalog,/.test(item.stages_done || '')) await updateMediaItem(id, { state: 'done', why: `update failed: ${String(err.message)}`.slice(0, 500) }).catch(() => {});
    else await updateMediaItem(id, { state: 'failed', why: `${prior ? `${prior} ` : ''}${String(err.message)}`.slice(0, 500) }).catch(() => {});
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
export async function ensurePortrait(name, { refresh = false, retryDays = 7, overrides = null, queueSketch = true } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const sp = deps.speakers || await import('../media/speakers.js');
  const fetchImpl = deps.fetchImpl || fetch;
  const ov = overrides || deps.overrides || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-speaker-portraits.json'), 'utf8').catch(() => '{}'));
  const key = sp.speakerKey(name);
  if (!key) return { status: 'none', key: null };
  const cur = await repo.getSpeaker(key);
  if (cur?.file && !refresh) { if (queueSketch) await queueSpeakerSketch(key, { repo, queue: deps.queue }); return { status: 'kept', key, record: cur }; }
  if (!refresh && cur?.tried_at && Date.now() - Date.parse(cur.tried_at) < retryDays * 86400_000 && !ov[key]) return { status: 'none', key, record: cur };
  const clean = sp.cleanName(name), parts = sp.ascii(clean).split(/\s+/);
  const entity_id = await repo.personEntityId(sp.ascii(clean).replace(/[^a-zA-Z]/g, '').toLowerCase(), parts[parts.length - 1]).catch(() => null);
  const at = new Date().toISOString();
  // 1) the biography pages' portrait of this person (Chad 10-22: reuse it before searching the web)
  const bio = sp.biographyPortrait ? await sp.biographyPortrait(entity_id, { manifest: deps.bioManifest || null }).catch(() => null) : null;
  if (bio?.cdn) {
    const record = await repo.upsertSpeaker({ key, name: clean, entity_id, file: bio.cdn, sha: createHash('sha256').update(bio.cdn).digest('hex'), origin: 'biography',
      source_url: bio.source_url || bio.url || null, page_url: `https://siftersearch.com/biography/${entity_id}`, credit: bio.credit || bio.author || null, licence: bio.license || null, fetched_at: at, tried_at: at });
    if (queueSketch) await queueSpeakerSketch(key, { repo, queue: deps.queue });
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
  if (queueSketch) await queueSpeakerSketch(key, { repo, queue: deps.queue });
  return { status: 'found', key, record, origin: p.origin };
}

/** Queue one sketch when the speaker has a source portrait. New and already catalogued speakers share the same path. */
export async function queueSpeakerSketch(key, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const queue = deps.queue || enqueue;
  const s = await repo.getSpeaker(key);
  if (!s?.file || s.sketch_file || s.sketch_state === 'held') return { queued: false };
  if (s.sketch_state === 'failed' && Date.now() - Date.parse(s.sketch_attempted_at || 0) < 24 * 3600_000) return { queued: false, cooldown: true };
  const pending = deps.pendingRuns || (await import('../repos/ops-report-repo.js')).pendingRuns;
  if ((await pending('media-speaker-sketch')).some((r) => r.params?.key === key)) return { queued: false, busy: true };
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const cap = Number(process.env.MEDIA_SPEAKER_SKETCH_DAILY_USD || 2);
  if (await repo.speakerSketchSpendSince(day.toISOString()) >= cap) return { queued: false, budget: true };
  await repo.setSpeakerSketch(key, { sketch_state: 'queued', sketch_error: null });
  await queue('media-speaker-sketch', { key }, 'media-speaker-sketch');
  return { queued: true };
}

/** Generate, likeness-check, upload and record one speaker drawing. The Python renderer remains an implementation detail
 *  invoked by this pipeline stage; it is never a separate manual publishing step. */
export async function mediaSpeakerSketchJob({ key } = {}, deps = {}) {
  if (!key) throw new Error('speaker key required');
  const repo = deps.repo || await import('../repos/media-repo.js');
  const sp = deps.speakers || await import('../media/speakers.js');
  const s = await repo.getSpeaker(key);
  if (!s) return { key, skipped: 'speaker missing' };
  if (s.sketch_file) return { key, kept: true };
  const at = new Date().toISOString();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const cap = Number(process.env.MEDIA_SPEAKER_SKETCH_DAILY_USD || 2);
  if (await repo.speakerSketchSpendSince(day.toISOString()) >= cap) {
    await repo.setSpeakerSketch(key, { sketch_state: 'waiting-budget', sketch_attempted_at: at });
    return { key, waiting_budget: true };
  }
  let usd = 0, sourceSha = s.sha || null;
  try {
    if (!s.file || !s.sha) {
      const r = await ensurePortrait(s.name, { queueSketch: false }, { repo, speakers: sp });
      if (!r.record?.file || !r.record?.sha) throw new Error('no source portrait found');
      Object.assign(s, r.record); sourceSha = s.sha;
    }
    const outDir = process.env.SPEAKER_SKETCH_OUT || join(process.cwd(), 'tmp', 'speaker-sketch');
    await mkdir(outDir, { recursive: true });
    const extraPath = join(outDir, 'pipeline-sources.json');
    const gallery = await repo.galleryRows([key]);
    const sources = [
      { sha: s.sha, file: s.file, origin: 'current-primary', source_url: s.source_url, credit: s.credit, licence: s.licence },
      ...gallery.map((p) => ({ sha: p.sha, file: p.file, origin: p.origin, source_url: p.source_url, credit: p.credit, licence: p.licence, face: p.face ? JSON.parse(p.face) : null })),
    ].filter((x, i, a) => x.sha && a.findIndex((y) => y.sha === x.sha) === i);
    await writeFile(extraPath, JSON.stringify({ [key]: sources }));
    const script = join(process.cwd(), 'scripts', 'media', 'speaker_sketch.py');
    await execFile(process.env.PYTHON || 'python3', [script, 'batch', key], { cwd: process.cwd(), timeout: 30 * 60_000,
      env: { ...process.env, SPEAKER_SKETCH_EXTRA_SOURCES: extraPath, SPEAKER_SKETCH_OUT: outDir } });
    const ledger = JSON.parse(await (await import('fs/promises')).readFile(join(outDir, 'ledger.json'), 'utf8'));
    const finalName = ledger.final?.[key];
    const d = finalName && ledger.drawings?.[finalName];
    usd = Number(d?.usd || 0);
    if (!d || !d.likeness?.pass) throw new Error(ledger.held?.[key] || 'likeness gate did not pass');
    const tall = Buffer.from(await (await import('fs/promises')).readFile(join(outDir, `${finalName}.jpg`)));
    const square = Buffer.from(await (await import('fs/promises')).readFile(join(outDir, `${finalName}-sq.jpg`)));
    const tallSha = createHash('sha256').update(tall).digest('hex');
    const sqSha = createHash('sha256').update(square).digest('hex');
    const file = await sp.putCdnPortrait(`media-speakers/${key}/sketch-${tallSha}.jpg`, tall, 'image/jpeg');
    const sqFile = await sp.putCdnPortrait(`media-speakers/${key}/sketch-sq-${sqSha}.jpg`, square, 'image/jpeg');
    await repo.setSpeakerSketch(key, { sketch_file: file, sketch_sha: tallSha, sketch_sq_file: sqFile, sketch_sq_sha: sqSha,
      sketch_width: d.w, sketch_height: d.h, sketch_model: d.model, sketch_source_sha: d.source_sha, sketch_source_file: d.source_file,
      sketch_source_credit: d.source_credit, sketch_source_licence: sources.find((x) => x.sha === d.source_sha)?.licence || null,
      sketch_source_url: sources.find((x) => x.sha === d.source_sha)?.source_url || null, sketch_likeness: d.likeness,
      sketch_usd: usd, sketch_at: at, sketch_state: 'ready', sketch_attempted_at: at, sketch_error: null });
    await repo.recordSpeakerSketchRun({ key, at, usd, status: 'ready', source_sha: d.source_sha });
    return { key, ready: true, usd, likeness: d.likeness };
  } catch (err) {
    const status = /no take passed|likeness gate/.test(String(err.message)) ? 'held' : /no source portrait/.test(String(err.message)) ? 'no-source' : 'failed';
    await repo.setSpeakerSketch(key, { sketch_state: status, sketch_attempted_at: at, sketch_usd: usd, sketch_error: String(err.message).slice(0, 300) }).catch(() => {});
    await repo.recordSpeakerSketchRun({ key, at, usd, status, source_sha: sourceSha, error: err.message }).catch(() => {});
    return { key, failed: true, why: String(err.message).slice(0, 200), usd };
  }
}

/** Low-rate backfill pass; schedules one eligible catalogued speaker per pass. */
export async function mediaSpeakerSketchSweepJob() {
  const repo = await import('../repos/media-repo.js');
  const sp = await import('../media/speakers.js');
  for (const { speaker } of await repo.mediaSpeakerNames()) {
    const key = sp.speakerKey(speaker);
    if (!key) continue;
    const s = await repo.getSpeaker(key);
    if (s?.file && !s.sketch_file && !['held', 'no-source'].includes(s.sketch_state)) {
      const r = await queueSpeakerSketch(key, { repo });
      if (r.queued) return { queued: key };
      continue;
    }
    if (!s?.file && (!s?.tried_at || Date.now() - Date.parse(s.tried_at) >= 7 * 86400_000)) {
      const r = await ensurePortrait(speaker, { queueSketch: false }, { repo, speakers: sp });
      if (r.record?.file) { await queueSpeakerSketch(key, { repo }); return { searched: key, portrait: 'found', queued: key }; }
      return { searched: key, portrait: 'none' };
    }
  }
  return { queued: null };
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
    // the speaker's DRAWING (Chad 10-23: the courtroom-sketch portrait is primary everywhere) — drawn at 9:16, no stretching
    const sp = it.speaker_key ? await repo.getSpeaker(it.speaker_key) : null;
    const sk = (deps.sketchOf || (await import('../media/sketch.js')).speakerSketchOrStatic)(sp);
    if (sk) return sk.url;
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
// historicalOf(name) → { historical } (api/lib/media/historical.js): first-hand speakers rank beside the Hands (Chad 10-23)
export async function rankFor(row, info, speakerRole, historicalOf = () => null) {
  if (row.source_kind === 'youtube') {
    const x = info.get(row.youtube_id) || {};
    const speaker = x.speaker || row.speaker || '';
    const h = historicalOf(speaker);
    const tier = historicalTier(tierOf({ source_kind: 'youtube', speaker, ytRole: x.role || null }), h?.historical, h?.rank);
    return rankOf(tier, yearOf(x.title, row.year), x.i ?? row.id);
  }
  const p = parseMediaPath(row.rel || '');
  const speaker = row.speaker || p.speaker || '';
  const h = historicalOf(speaker);
  const tier = historicalTier(tierOf({ source_kind: 'file', collection: row.collection || p.collection || '', path: row.rel || '', speaker, role: speakerRole(speaker, { year: row.year || p.year }) }), h?.historical, h?.rank);
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
  // ITC Counsellors appointed before 1988 (Chad 10-23), kept in their own targets file
  const itc = JSON.parse(await rf(deps.itcTalks || join(dirname(talks), 'itc-talks.json'), 'utf8').catch(() => '{}'));
  t.itc_pre_1988 = itc.itc_pre_1988 || [];
  t.first_hand = itc.first_hand || [];   // International Bahá'í Council members, pilgrims of the Guardian's time (Chad 10-23)
  const historicalOf = deps.historicalOf || historicalIndex(await loadSpeakerPeople());
  const { decide } = await import('../media/exclusions.js');
  const excludedTarget = deps.excluded || ((x) => !!decide({ speakers: [x.speaker], title: x.title || '' })?.excluded);
  const info = new Map();
  const registered = [];
  const seenGroup = new Set();
  let order = 0;
  for (const sec of ['hands_uhj', 'hooper_dunbar', 'itc_pre_1988', 'first_hand', 'curated_sacred_traditions']) {
    for (const x of t[sec] || []) {
      if (!x.video_id || x.is_short || x.relation === 'about') continue;
      if (excludedTarget(x)) continue;   // data/media-exclusions.json (Chad 10-23)
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
  for (const r of rows) ranks.push({ id: r.id, rank: await rankFor({ ...r, rel: r.source_kind === 'youtube' ? '' : relative(mediaRoot(), r.source_ref || '') }, info, speakerRole, historicalOf) });
  await repo.setQueueRanks(ranks);
  const tiers = Object.fromEntries(TIERS.map(([n, key]) => [key, ranks.filter((x) => Math.floor(x.rank / 1e7) === n).length]));
  return { registered: registered.length, ranked: ranks.length, tiers };
}

// media-fetch { limit }: DOWNLOADS, apart from processing — the next YouTube items by rank go into the archive (audio via
// yt-dlp + PO token → Titan → Seemuapps, the original kept, meta written), politely paced; the item goes back to 'queued'
// for processing. A bot check stops the round and holds the item for the cool-down.
export async function mediaFetchJob({ limit = 6, ids = null, pauseMs = Number(process.env.MEDIA_FETCH_PAUSE_MS) || 15000 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const { runItem } = deps.runItem ? deps : await import('../media/item.js');
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const nap = deps.nap || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = { downloaded: [], held: [], failed: [] };
  // claimed ids (the feed): what this run does not get to goes back to the queue (a drain, a cool-down)
  const release = async (list) => { for (const it of list) await repo.updateMediaItem(it.id, { state: 'queued', stage: null }); };
  const list = ids ? (await Promise.all([].concat(ids).map((id) => (repo.getMediaItem ? repo.getMediaItem(id) : { id })))).filter(Boolean) : await repo.nextToDownload(limit);
  if ((await repo.youtubeHeldSince(COOL_HOURS))?.n > 0) { if (ids) await release(list); return { ...out, cooling: true }; }
  for (const [k, it] of list.entries()) {
    if (draining()) { if (ids) await release(list.slice(k)); break; }
    await repo.updateMediaItem(it.id, { state: 'running', stage: 'archive' });
    try {
      await runItem(it, { only: ['archive'] });
      await repo.updateMediaItem(it.id, { state: 'queued', stage: 'archive' });
      out.downloaded.push(it.id);
    } catch (err) {
      // a drain stopped the download: this item and the rest go back to the queue (fetched again after the restart)
      if (err.code === 'DRAIN') { await release(list.slice(k)); out.yielded = true; break; }
      if (err.code === 'BOT_CHECK') { await repo.updateMediaItem(it.id, { state: 'held', why: String(err.message).slice(0, 500) }); out.held.push(it.id); if (ids) await release(list.slice(k + 1)); break; }
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
  const { paragraphsByIds } = deps.paragraphs || await late('api/lib/paragraphs-repo.js');
  const { passageGate } = await import('../media/quotes.js');
  const { readFile: rf } = await import('fs/promises');
  const queue = deps.queue || enqueue;
  const out = { talks: 0, quotes: 0, crs: 0, rejected_quotes: 0, rejected_crs: 0, reasons: {}, affected: [], sample: [] };
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const busy = new Set((await Promise.all(['media-item', 'media-llm'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
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
    // never a second run on an item that already has one queued or running (two runs on one item overwrite each other's files)
    if (bad) { out.affected.push(it.slug); if (write && !busy.has(id)) { await queue('media-item', { id, redo: ['quotes', 'update'] }, 'media-quote-audit'); out.requeued = (out.requeued || 0) + 1; } }
  }
  return out;
}

// ── STAGE LANES (Chad 10-22: "no internet dependencies on GPU processing. Queue up work and keep them busy") ─────────────────
// COMPUTE (LAN only: archive · grade · enhance · web renditions · transcription with alignment and diarization on boss) and
// LLM (names · copy-edit · description · publish · subheaders · quotes · links · assess · update; API-bound) are separate
// jobs with their own lanes: an item leaves the compute lane 'transcribed' and the LLM feed picks it up — an API storm never
// holds a compute slot, and the compute machines never wait for the internet.
export const COMPUTE_STAGES = ['archive', 'grade', 'enhance', 'web', 'transcribe', 'diarize', 'trim'];
// the compute lane is TWO lanes (10-22: ASR slots sat empty while their workers were busy with tower-side prep):
//   PREP (media-compute: archive · grade · enhance · web — tower files, plus grade/dfn/probes on the GPU host) → 'prepped'
//   ASR  (media-asr: transcribe — one worker per ASR slot, fed from a buffer of prepped items) → 'transcribed'
export const PREP_STAGES = ['archive', 'grade', 'enhance', 'web'];
async function laneJob(id, rest, deps, only, next) {
  const before = await (deps.repo?.getMediaItem || getMediaItem)(id);
  const r = await mediaItemJob({ id, ...rest, only }, deps);
  if (!r?.failed && !r?.held && !r?.yielded && !r?.waiting) await (deps.repo?.updateMediaItem || updateMediaItem)(id, { state: before?.state === 'done' ? 'done' : next });
  return failedRun(r);
}
export async function mediaComputeJob({ id, ...rest } = {}, deps = {}) {
  const cloud=deps.cloud||await import('../media/cloud.js');
  const accepted=cloud.acceptedWorker?await cloud.acceptedWorker(deps.acceptedWorkerFile):null;
  if(rest.require_whole&&accepted?.whole_imports!=='cloud')throw Error('Whole-recording farm is not enabled');
  if(!accepted?.whole_imports)return laneJob(id,rest,deps,PREP_STAGES,'prepped');
  const repo=deps.repo||await import('../repos/media-repo.js');
  let item=await repo.getMediaItem(id);
  if(item?.state==='done')return laneJob(id,rest,deps,PREP_STAGES,'prepped');
  try {
  if(!item?.dir){await (deps.runItem||(await import('../media/item.js')).runItem)(item,{only:['archive']});item=await repo.getMediaItem(id);}
  const fs=await import('node:fs/promises');
  const meta=JSON.parse(await fs.readFile(join(item.dir,'meta.json'),'utf8'));
  if(accepted.whole_imports==='cloud'){
    await cloud.addOrders([{id:item.id,slug:item.slug,duration_s:meta.duration_s||item.duration_s||0,mode:'whole',kind:'whole'}]);
    await repo.updateMediaItem(id,{state:'scheduled',stage:'whole'});
    return {id,whole_queued:true};
  }
  const T=deps.tools||await import('../media/tools.js');
  const stop=deps.draining||(await import('../drain.js')).isDraining;
    const m=await (deps.homeWholeRecording||(await import('../media/home-recording.js')).homeWholeRecording)(item,meta,{T,image:accepted.image,stop});
    await repo.updateMediaItem(id,{state:'transcribed',stage:null,stages_done:','+Object.keys(m.stages).join(',')+','});
    return {id,whole_worker:true,stages:Object.keys(m.stages)};
  } catch(err){
    if(err.code==='DRAIN')return {id,yielded:true};
    await repo.updateMediaItem(id,{state:err.code==='WORKER_WAIT'?'queued':'failed',why:String(err.message).slice(0,500)});
    throw err;
  }
}
export const mediaAsrJob = ({ id, ...rest } = {}, deps = {}) => laneJob(id, rest, deps, ['transcribe'], 'asr_done');
// DIARIZE (its own lane, 10-23 04:29): the ASR worker never waits on a diarization
export const mediaDiarJob = ({ id, ...rest } = {}, deps = {}) => laneJob(id, rest, deps, ['diarize', 'trim'], 'transcribed');   // + the silence trim (words known)
// a failed ITEM is NOT a failed run (a thrown run mails Chad once per item — a night of failures = a mailbox of alerts):
// the run's result carries failed:true, the item its 'failed' state + reason, /api/media/progress/live → health counts them,
// system-checks WARNs past MEDIA_FAIL_WARN an hour, and the feed's capped retry brings the item back
function failedRun(r) { return r?.failed ? { ...r, outcome: 'item-failed' } : r; }
/** ON THE AIR = RESTORED (Chad 10-29): flag the published rows nobody has classified yet (migration 186) from each item's meta.json,
 *  a bounded batch per feed tick, so the count and the listing hold only talks with a restored copy. → how many were flagged */
let verifyCursor = 0, verifyDone = false;
export const resetRestoredVerify = () => { verifyCursor = 0; verifyDone = false; };
export async function backfillRestored({ repo, readMeta, limit = 40 } = {}) {
  const { isComplete, indexFields } = await import('../media/item.js');
  const fs = await import('fs/promises');
  const read = readMeta || (async (dir) => JSON.parse(await fs.readFile(join(dir, 'meta.json'), 'utf8')));
  let n = 0;
  for (const r of await repo.unclassifiedDone(limit)) {
    const m = r.dir ? await read(r.dir).catch(() => null) : null;
    if (!m) { await repo.setIndex(r.id, { restored: 0, stages_missing: 99 }); n++; continue; }
    await repo.setIndex(r.id, indexFields(m)); n++;
  }
  // one pass per process over rows already flagged: a flag set under an older, looser definition (light tier) is corrected
  if (!verifyDone && repo.restoredRows) {
    const rows = await repo.restoredRows(verifyCursor, limit * 5);
    if (!rows.length) verifyDone = true;
    for (const r of rows) {
      verifyCursor = r.id;
      const m = r.dir ? await read(r.dir).catch(() => null) : null;
      if (m && !isComplete(m)) { await repo.setRestored(r.id, false); n++; }
    }
  }
  return n;
}
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
  const accepted=deps.acceptedWorker??await (await import('../media/cloud.js')).acceptedWorker();
  const wholeInputs=accepted?.whole_imports==='cloud';
  // compute runs in hand (queued + running) = 3 × the compute workers: always ≥ 2 × the workers WAITING (10-22: aorus at
  // 27× real time starves on a shallow queue)
  const computeWorkers = deps.computeWorkers ?? (await import('../media/tools.js')).asrHosts().reduce((n, h) => n + h.slots, 0);
  const computeDepth = deps.computeDepth ?? (Number(process.env.MEDIA_COMPUTE_DEPTH) || 3 * (computeWorkers || 4));
  const llmDepth = deps.llmDepth ?? (Number(process.env.MEDIA_LLM_DEPTH) || 8);
  const out = { compute: [], llm: [] };
  if (repo.restorePublished) { const back = await repo.restorePublished(); if (back.length) out.restored = back; }
  if (repo.unclassifiedDone) { const n = await backfillRestored({ repo, readMeta: deps.readMeta }); if (n) out.restored_flagged = n; }
  if (repo.retryTransientFailures) { const back = await repo.retryTransientFailures(); if (back.length) out.retried = back; }
  // ASR: every slot busy, as many again waiting — from the PREPPED buffer
  const asr = await ops.pendingRuns('media-asr');
  out.asr = []; out.asr_pending = asr.length;
  for (const it of await (repo.nextPrepped ? repo.nextPrepped(Math.max(0, 2 * (computeWorkers || 4) - asr.length)) : [])) {
    await repo.updateMediaItem(it.id, { state: 'asr_queued' });
    await queue('media-asr', { id: it.id, priority: true }, 'media-feed');
    out.asr.push(it.id);
  }
  // DIARIZE: its own lane, fed from the transcribed-not-yet-diarized items
  const diar = await ops.pendingRuns('media-diar');
  out.diar = []; out.diar_pending = diar.length;
  const diarDepth = deps.diarDepth ?? (Number(process.env.MEDIA_DIAR_DEPTH) || 10);
  for (const it of await (repo.nextAsrDone ? repo.nextAsrDone(Math.max(0, diarDepth - diar.length)) : [])) {
    await repo.updateMediaItem(it.id, { state: 'diar_queued' });
    await queue('media-diar', { id: it.id, priority: true }, 'media-feed');
    out.diar.push(it.id);
  }
  // PREP: keep the prepped buffer ≥ 2 × the ASR slots (prep runs in hand ≤ computeDepth), so no ASR slot waits on prep
  const compute = await ops.pendingRuns('media-compute');
  out.compute_pending = compute.length;
  const buffered = (repo.preppedCount ? await repo.preppedCount() : 0) + asr.length;
  // in hand: at least the prep workers (16) so none idles; stop once 3 × the ASR slots are prepped or queued for ASR
  const inputs=wholeInputs?await ops.pendingRuns('media-whole-input'):[];
  const wantPrep = wholeInputs?Math.max(0,4-inputs.length):buffered >= 3 * (computeWorkers || 4) ? 0 : Math.max(0, Math.max(computeDepth, deps.computeDepth != null ? 0 : (Number(process.env.MEDIA_PREP_WORKERS) || 16)) - compute.length);
  for (const it of await repo.nextToProcess(wantPrep)) {
    await repo.updateMediaItem(it.id, { state: 'scheduled' });
    await queue(wholeInputs?'media-whole-input':'media-compute', { id: it.id, priority: true }, 'media-feed');
    out.compute.push(it.id);
  }
  const llm = await ops.pendingRuns('media-llm');
  out.llm_pending = llm.length;
  for (const it of await repo.nextTranscribed(Math.max(0, llmDepth - llm.length))) {
    await repo.updateMediaItem(it.id, { state: 'llm_queued' });
    await queue('media-llm', { id: it.id, priority: true }, 'media-feed');
    out.llm.push(it.id);
  }
  // DOWNLOADS: up to MEDIA_FETCH_RUNS (2) runs at once, each with its OWN ids (claimed here as 'scheduled' / stage
  // 'download', so two runs never take the same video); none while a bot check is cooling down
  const fetchRuns = deps.fetchRuns ?? (Number(process.env.MEDIA_FETCH_RUNS) || 2);
  const fetchPending = (await ops.pendingRuns('media-fetch')).length;
  if (fetchPending < fetchRuns && !((await repo.youtubeHeldSince(COOL_HOURS))?.n > 0)) {
    const ids = (await repo.nextToDownload(6)).map((x) => x.id);
    if (ids.length) {
      for (const id of ids) await repo.updateMediaItem(id, { state: 'scheduled', stage: 'download' });
      await queue('media-fetch', { ids }, 'media-feed'); out.fetch = ids;
    }
  }
  return out;
}

// ── METADATA FIX (QA 10-22 item 7: 17 talks without a speaker, series titles in four patterns, "Afshin" titled by the
// series) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Pure: the corrected { speaker, title, series, part, part_of } for one item, from its file name (known speakers) and title.
 *  item: { speaker, title, source_kind, source_ref }; → only the fields that change. */
export function metaFixFor(item, { known = [], rel = null } = {}) {
  const out = {};
  const h = item.source_kind !== 'youtube' && rel ? parseMediaPath(rel, { known }) : null;
  let speaker = item.speaker || null, title = item.title || '';
  const sameAsSpeaker = speaker && title && fold(title).toLowerCase().replace(/\s*\(part \d+\)$/, '') === fold(speaker).toLowerCase();
  if (h?.speaker && h.speakerFrom === 'file' && (!speaker || (h.series && fold(speaker).toLowerCase() === fold(h.series).toLowerCase()) || sameAsSpeaker)) {
    if (h.speaker !== speaker) out.speaker = speaker = h.speaker;
    if (h.series && (sameAsSpeaker || !title || fold(title).toLowerCase().startsWith(fold(h.speaker).toLowerCase()))) title = partTitle({ title: h.series, part: h.part });
  }
  const st = seriesTitle(title);
  if (st.part) { out.series = st.title; out.part = st.part; if (st.of) out.part_of = st.of; title = partTitle(st); }
  else if (h?.series && h.part) { out.series = h.series; out.part = h.part; }
  if (title && title !== item.title) out.title = title;
  return out;
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'`]/g, '');

/** Apply metaFixFor to published talks, then give a speaker to the series siblings that lack one (when every sibling with a
 *  speaker agrees). write=false: the plan only. write=true: meta.json updated and an 'update' run queued (re-render, search,
 *  catalogue) for each changed talk not already busy. → { changed: [{ slug, ...fields }], skipped_busy } */
export async function mediaMetaFixJob({ write = false, ids = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const read = deps.readMeta || (async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'meta.json'), 'utf8')));
  const writeMeta = deps.writeMeta || (async (dir, m) => (await import('fs/promises')).writeFile(join(dir, 'meta.json'), JSON.stringify(m, null, 2)));
  const known = (await repo.listSpeakers()).map((s) => s.name).filter(Boolean);
  const { mediaRoot } = deps.roots || await import('../media/item.js');
  const rows = [];
  for (const id of ids || await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const meta = await read(it.dir).catch(() => null);
    if (!meta) continue;
    const rel = it.source_kind !== 'youtube' && it.source_ref ? String(it.source_ref).replace(`${mediaRoot()}/`, '').replace(/^[^/]+\/talks\//, '') : null;
    rows.push({ it, meta, fix: metaFixFor({ ...it, title: meta.title || it.title, speaker: meta.speaker || it.speaker }, { known, rel }) });
  }
  // series siblings: the speaker every titled sibling agrees on
  const bySeries = new Map();
  for (const r of rows) { const s = r.fix.series || r.meta.series; if (s) { const k = fold(s).toLowerCase(); if (!bySeries.has(k)) bySeries.set(k, []); bySeries.get(k).push(r); } }
  for (const group of bySeries.values()) {
    const names = [...new Set(group.map((r) => r.fix.speaker || r.meta.speaker).filter(Boolean))];
    if (names.length === 1) for (const r of group) if (!(r.fix.speaker || r.meta.speaker)) r.fix.speaker = names[0];
  }
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { checked: rows.length, changed: [], skipped_busy: [] };
  for (const r of rows) {
    if (!Object.keys(r.fix).length) continue;
    out.changed.push({ slug: r.it.slug, ...r.fix });
    if (!write) continue;
    if (busy.has(r.it.id)) { out.skipped_busy.push(r.it.slug); continue; }
    await writeMeta(r.it.dir, { ...r.meta, ...r.fix });
    await queue('media-item', { id: r.it.id, redo: ['update'] }, 'media-meta-fix');
  }
  return out;
}

// ── SPEAKER IDENTITY (Chad 10-23: one person, many name forms; api/lib/media/identity.js, data/media-speaker-people.json) ──
export async function loadSpeakerPeople(read = async () => (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-speaker-people.json'), 'utf8')) {
  try { const d = JSON.parse(await read()); const people = d.people || []; people.notSpeakers = d.not_speakers || []; return (await import('../media/speaker-decisions.js')).peopleWithDecisions(people); } catch { return []; }
}
/** The identity context of one item (evidence for a surname-only or ambiguous name). */
export function identityContext(item, meta = {}) {
  const yt = item.source_kind === 'youtube';
  const titleYears = [...String(`${meta.title || item.title || ''} ${meta.source?.title || ''}`).matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  return { title: [meta.title || item.title || '', meta.source?.title || ''].filter(Boolean).join(' · '), collection: item.collection || meta.collection || '', series: meta.series || '', channel: meta.source?.channel || item.channel || '',
    source_kind: item.source_kind, recorded_year: yt ? (titleYears.length ? Math.min(...titleYears) : null) : (meta.year || item.year || null) };
}

/** media-identity { write, ids? }: every published speaker → one person (or held for review); recording vs upload years.
 *  write: meta.json (speaker = house-style name, speaker_key = the person's key, recorded/uploaded year + flag) and an
 *  'update' run per changed talk (re-render, search, catalogue); busy talks are skipped. → the audit (clusters, review, flags). */
export async function mediaIdentityJob({ write = false, ids = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const { resolveSpeaker, recordingYear } = await import('../media/identity.js');
  const people = deps.people || await loadSpeakerPeople();
  const read = deps.readMeta || (async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'meta.json'), 'utf8')));
  const writeMeta = deps.writeMeta || (async (dir, m) => (await import('fs/promises')).writeFile(join(dir, 'meta.json'), JSON.stringify(m, null, 2)));
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const clusters = new Map(), review = [], flags = [], changed = [], skipped_busy = [];
  for (const id of ids || await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const meta = await read(it.dir).catch(() => null);
    if (!meta) continue;
    const said = meta.speaker || it.speaker || null;
    if (!said) continue;
    const ctx = identityContext(it, meta);
    const r = resolveSpeaker(said, people, ctx, { notSpeakers: people.notSpeakers || [] });
    const fix = {};
    if (r.not_speaker) { fix.speaker = null; fix.speaker_key = null; review.push({ slug: it.slug, said, why: 'a series name, not a speaker — speaker cleared', candidates: [] }); }
    if (r.key) {
      if (!clusters.has(r.key)) clusters.set(r.key, { key: r.key, display: r.display, role: r.person?.role || null, forms: new Map() });
      const c = clusters.get(r.key); const f = c.forms.get(said) || { n: 0, bases: new Set() }; f.n++; f.bases.add(r.basis); c.forms.set(said, f);
      if (meta.speaker !== r.display || it.speaker !== r.display) fix.speaker = r.display;   // the meta file or the catalogue row
      if (meta.speaker_key !== r.key || it.speaker_key !== r.key) fix.speaker_key = r.key;
      const y = recordingYear({ year: meta.year || it.year, source_kind: it.source_kind, title: `${meta.title || ''} ${meta.source?.title || ''}`, description: meta.source?.description || '', file: it.source_ref || '' }, r.person);
      if (y.flag) flags.push({ slug: it.slug, speaker: r.display, flag: y.flag });
      if (it.source_kind === 'youtube' && y.uploaded_year && (y.flag || y.recorded_year) && (y.recorded_year !== (meta.year ?? null) || y.recorded_year !== (it.year ?? null))) { fix.year = y.recorded_year; fix.uploaded_year = y.uploaded_year; }
      if (y.flag && meta.date_flag !== y.flag) fix.date_flag = y.flag;
    } else if (r.review) review.push({ slug: it.slug, said, why: r.review, candidates: r.candidates || [] });
    if (!Object.keys(fix).length) continue;
    changed.push({ slug: it.slug, from: said, ...fix });
    if (!write) continue;
    // the catalogue row at once (the /media index groups by it) — also for a talk with a run queued: the row is not the
    // run's to write until its catalog stage, and the meta file below is left to that run
    const row0 = {};
    if ('speaker' in fix) row0.speaker = fix.speaker;
    if ('speaker_key' in fix) row0.speaker_key = fix.speaker_key;
    if ('year' in fix) row0.year = fix.year;
    if (busy.has(it.id)) { if (Object.keys(row0).length && repo.updateMediaItem) await repo.updateMediaItem(it.id, row0); skipped_busy.push(it.slug); continue; }
    await writeMeta(it.dir, { ...meta, ...fix });
    // the catalogue row at once (the /media index groups by it), the re-render follows in the update run
    const row = {};
    if ('speaker' in fix) row.speaker = fix.speaker;
    if ('speaker_key' in fix) row.speaker_key = fix.speaker_key;
    if ('year' in fix) row.year = fix.year;
    if (Object.keys(row).length && repo.updateMediaItem) await repo.updateMediaItem(it.id, row);
    if (fix.speaker_key && repo.upsertSpeaker) await repo.upsertSpeaker({ key: fix.speaker_key, name: fix.speaker || meta.speaker });
    await queue('media-item', { id: it.id, redo: ['update'] }, 'media-identity');
  }
  return {
    clusters: [...clusters.values()].map((c) => ({ key: c.key, display: c.display, role: c.role, forms: [...c.forms].map(([name, f]) => ({ name, talks: f.n, basis: [...f.bases].join('; ') })) }))
      .sort((a, b) => b.forms.length - a.forms.length || a.display.localeCompare(b.display)),
    review, date_flags: flags, changed, skipped_busy,
  };
}

/** The YouTube targets' own speaker + title by video id (a queued talk is not named until it is downloaded). */
async function youtubeTargetInfo(files = ['youtube-talks.json', 'youtube-queue.json'].map((f) => join(process.cwd(), 'planning', 'media-targets', f))) {
  const { readFile } = await import('fs/promises');
  const info = new Map();
  const walk = (x) => {
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    if (!x || typeof x !== 'object') return;
    if (x.video_id && (x.speaker || x.title)) { if (!info.has(x.video_id)) info.set(x.video_id, { speaker: x.speaker || '', title: x.title || '' }); return; }
    for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v);
  };
  for (const f of files) walk(JSON.parse(await readFile(f, 'utf8').catch(() => 'null')));
  return info;
}

/** media-exclude { write }: talks by a speaker an exclusion rule names (data/media-exclusions.json; Chad 10-23 "no House
 *  members elected after '88") → out of the library for good. write: state 'excluded' with the rule's reason (no lane picks
 *  it up, no listing shows it, every /media route answers 404), its queued / running runs cancelled, its detached
 *  transcription / diarization stopped on its host, its transcript document soft-deleted — paragraph by paragraph in short
 *  chunks — so the index outbox takes it out of search. The archive folder and the original are kept. → the list. */
export async function mediaExcludeJob({ write = false } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const { decide, loadExclusions } = await import('../media/exclusions.js');
  const rules = deps.rules || loadExclusions();
  const targets = deps.targets || await youtubeTargetInfo();
  const read = deps.readMeta || (async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'meta.json'), 'utf8')));
  const hits = [];
  const unsure = [];   // surname only (Chad 10-23: "spelling is not trustworthy") — listed for Chad, NOT excluded
  // Chad's per-talk decisions (data/media-exclusions.json `talks`): exclude, or needs_listen (stays as it is, listed)
  const decided = new Map((deps.talks || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-exclusions.json'), 'utf8').catch(() => '{}')).talks || []).map((t) => [Number(t.id), t]));
  const decidedBySlug = new Map((deps.talks || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-exclusions.json'), 'utf8').catch(() => '{}')).talks || []).filter((t) => t.slug).map((t) => [t.slug, t]));
  const needs_listen = [];
  for (const it of await repo.exclusionCandidates()) {
    const meta = it.dir ? await read(it.dir).catch(() => null) : null;
    const t = it.youtube_id ? targets.get(it.youtube_id) : null;
    const titles = { title: it.title || meta?.title || '', sourceTitle: meta?.source?.title || t?.title || '' };
    const speakers = [it.speaker, meta?.speaker, t?.speaker].filter(Boolean);
    const dec = decide({ speakers, ...titles }, rules);
    const m = dec?.excluded;
    const row = { id: it.id, slug: it.slug, title: it.title || meta?.title || t?.title || null, speaker: it.speaker || meta?.speaker || t?.speaker || null, state: it.state,
      published: it.state === 'done', doc_id: it.doc_id || meta?.doc_id || null, year: meta?.year || null };
    const td = decided.get(Number(it.id)) || decidedBySlug.get(it.slug);   // a hold may name the talk by slug (Chad 10-25)
    if (td?.decision === 'restore') continue;   // brought back on purpose (media-restore): never excluded again
    if (td?.decision === 'needs_listen') { needs_listen.push({ ...row, why: td.reason }); continue; }
    if (td?.decision === 'exclude') { hits.push({ ...row, person: row.speaker, reason: td.reason, evidence: `Chad decided this talk: ${td.decided}`, jobs: ['asr_job', 'diar_job'].map((k) => meta?.[k]).filter((j) => j?.id && j?.host) }); continue; }
    if (m) { hits.push({ ...row, person: m.person, reason: m.reason, evidence: m.evidence, jobs: ['asr_job', 'diar_job'].map((k) => meta?.[k]).filter((j) => j?.id && j?.host) }); continue; }
    if (dec?.unsure) unsure.push({ ...row, might_be: dec.unsure.person, evidence: dec.unsure.evidence });
  }
  const by = (k) => Object.fromEntries([...new Set(hits.map((h) => h[k]))].map((v) => [v, hits.filter((h) => h[k] === v).length]));
  const out = { matched: hits.length, published: hits.filter((h) => h.published).length, queued: hits.filter((h) => !h.published).length, by_person: by('person'), by_state: by('state'),
    talks: hits.map(({ jobs, ...h }) => h), unsure, needs_listen };
  if (!write) return out;
  const ids = new Set(hits.map((h) => h.id));
  // 1. no lane picks them up again; a run in hand stops at its next stage (runItem checks the row)
  for (const reason of new Set(hits.map((h) => h.reason))) await repo.excludeItems(hits.filter((h) => h.reason === reason).map((h) => h.id), reason);
  // 2. their queued / running runs cancelled
  out.runs_cancelled = 0;
  for (const n of ['media-item', 'media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-fetch']) {
    for (const r of await ops.pendingRuns(n)) {
      const rid = [r.params?.id, ...[].concat(r.params?.ids || [])].map(Number);
      if (rid.some((x) => ids.has(x))) { await ops.cancel(r.id); out.runs_cancelled++; }
    }
  }
  // 3. detached jobs stopped on their hosts
  const tools = deps.tools || await import('../media/tools.js');
  out.remote_cancelled = 0;
  for (const h of hits) for (const j of h.jobs) if (await tools.cancelRemote(j.host, j.id).catch(() => false)) out.remote_cancelled++;
  // 4. out of search: the transcript documents soft-deleted (chunked; the outbox de-indexes) — a transcript is its talk's
  // only copy, so the last-copy guard is waived here on purpose; ≤ 20 per call (the delete circuit breaker is 25)
  const docs = deps.docs || await late('api/lib/docs-repo.js');
  const docIds = hits.map((h) => h.doc_id).filter(Boolean);
  out.docs_deleted = 0; out.docs_refused = [];
  for (let i = 0; i < docIds.length; i += 20) {
    const r = await docs.softDeleteDocs(docIds.slice(i, i + 20), { reason: `media-exclude: ${hits[0].reason}`, allowLastCopy: true });
    out.docs_deleted += r.deleted || 0; out.docs_refused.push(...(r.refused || []));
  }
  // 5. the edge copies of their pages gone (the page and API entry; the listing refreshes with the next warm)
  const purge = deps.purge || (await import('../media/edge-purge.js')).purgeTalk;
  out.purged = 0;
  for (const h of hits.filter((x) => x.published)) if (await purge(h.slug)) out.purged++;
  return out;
}

/** media-restore { write, since? }: bring back talks a decision marks 'restore' (data/media-exclusions.json `talks`, by id or
 *  slug) that are currently excluded: state 'done' again, the transcript document and its paragraphs restored (re-indexed by
 *  the worker), an 'update' run queued (page, catalogue), the edge copies purged. Nothing was ever deleted, so this is exact.
 *  write=false: the plan. */
export async function mediaRestoreJob({ write = false } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const talks = deps.talks || JSON.parse(await (await import('fs/promises')).readFile(join(process.cwd(), 'data', 'media-exclusions.json'), 'utf8').catch(() => '{}')).talks || [];
  const want = talks.filter((t) => t.decision === 'restore' && t.slug);
  const rows = (await repo.itemsBySlugs(want.map((t) => t.slug))).filter((r) => r.state === 'excluded');
  const out = { decisions: want.length, restorable: rows.map((r) => r.slug), not_excluded: want.filter((t) => !rows.some((r) => r.slug === t.slug)).map((t) => t.slug) };
  if (!write || !rows.length) return out;
  const { content } = deps.content ? { content: deps.content } : await import('../content.js');
  const queue = deps.queue || enqueue;
  const purge = deps.purge || (await import('../media/edge-purge.js')).purgeTalk;
  await repo.restoreItems(rows.map((r) => r.id), 'done');
  out.docs_restored = 0;
  for (const r of rows) {
    const t = want.find((x) => x.slug === r.slug);
    if (r.doc_id) out.docs_restored += (await content.restoreRetiredDocs([r.doc_id], { since: t.hidden_at || '2000-01-01', reason: `media-restore: ${r.slug}` })).restored || 0;
    await queue('media-item', { id: r.id, redo: ['update'] }, 'media-restore');
    await purge(r.slug);
  }
  out.restored = rows.map((r) => r.slug);
  return out;
}

/** media-stages { write?, ids?, stages?, redo?, state? }: which stages each talk still needs, and (write) queue exactly those through the engine.
 *  Report: how many talks are complete, and the count missing each stage. `stages` = the stages that must be done (default COMPLETE_STAGES);
 *  `redo` = stages to re-run for the selected talks even when done; `ids` narrows the talks. Queues media-item { id, redo } — no direct DB or tower work. */
export async function mediaStagesJob({ write = false, ids = null, stages = null, redo = null, limit = 500 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const { COMPLETE_STAGES, STAGES } = deps.stages || await import('../media/item.js');
  const need = (stages || COMPLETE_STAGES).filter((s) => STAGES.includes(s));
  const forced = (redo || []).filter((s) => STAGES.includes(s));
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { talks: 0, complete: 0, missing: Object.fromEntries(need.map((s) => [s, 0])), queued: 0, skipped_busy: 0 };
  for (const id of ids || await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it) continue;
    out.talks++;
    const done = String(it.stages_done || '');
    const miss = need.filter((s) => !done.includes(`,${s},`));
    for (const s of miss) out.missing[s]++;
    if (!miss.length && it.restored === 1) out.complete++;
    const todo = [...new Set([...miss, ...forced])];
    if (!write || !todo.length || out.queued >= limit) continue;
    if (busy.has(it.id)) { out.skipped_busy++; continue; }
    await queue('media-item', { id: it.id, redo: STAGES.filter((s) => todo.includes(s)).concat(it.published_at && !todo.includes('update') ? ['update'] : []) }, 'media-stages'); out.queued++;
  }
  return out;
}
/** media-relink { write, ids?, why? }: published talks whose links.json refused person mentions for a reason that no longer
 *  holds (default: the retired Covenant-breaker guard — Chad 10-23 "we should link to them accurately"; it also refused
 *  'the Guardian' and '‘Abdu’l-Bahá') → a ['links', 'update'] re-run (stored mentions re-resolved, no model call; busy talks
 *  skipped). → counts */
export async function mediaRelinkJob({ write = false, ids = null, why = 'Covenant-breaker', only = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const read = deps.readLinks || (async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'links.json'), 'utf8')));
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { talks: 0, affected: 0, mentions: 0, queued: 0, skipped_busy: 0 };
  for (const id of ids || await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    out.talks++;
    const l = await read(it.dir).catch(() => null);
    const n = (l?.unresolved || []).filter((u) => u.kind === 'person' && String(u.why || '').includes(why)).length;
    if (!n) continue;
    out.affected++; out.mentions += n;
    if (!write) continue;
    if (busy.has(it.id)) { out.skipped_busy++; continue; }
    await queue('media-item', { id: it.id, redo: ['links', 'update'], ...(only?{only}:{}) }, 'media-relink'); out.queued++;
  }
  return out;
}

/** media-safe-listening { write, ids?, limit? } (Chad 10-23, by ear: the DFN / restored listening copies "badly mangled"
 *  the words): every published talk's listening copy becomes the ORIGINAL with transparent processing only (enhance.js
 *  safeChain), re-encoded with the fullband Ogg — a ['web', 'trim', 'update'] re-run per talk, low priority in the pipeline
 *  lane. A talk whose copies already carry the current settings (meta.web_codec) is left alone; busy talks are skipped.
 *  DFN stays the ASR input where it was chosen. → counts */
export async function mediaSafeListeningJob({ write = false, ids = null, limit = Infinity } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const { safeChain, WEB_CODEC } = await import('../media/enhance.js');
  const read = deps.readMeta || (async (dir) => JSON.parse(await (await import('fs/promises')).readFile(join(dir, 'meta.json'), 'utf8')));
  const writeMeta = deps.writeMeta || (async (dir, m) => (await import('fs/promises')).writeFile(join(dir, 'meta.json'), JSON.stringify(m, null, 2)));
  // two runs for one talk at once would race on its meta.json: a talk with any run in hand is skipped (a later pass takes
  // it) — except a QUEUED relink ([links, update]), which is cancelled and folded into this talk's one re-run
  const pending = (await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat();
  const relinkOf = new Map(pending.filter((r) => r.status === 'queued' && JSON.stringify(r.params?.redo || []) === '["links","update"]').map((r) => [Number(r.params?.id), r.id]));
  const busy = new Set(pending.filter((r) => !relinkOf.has(Number(r.params?.id)) || relinkOf.get(Number(r.params?.id)) !== r.id).map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { talks: 0, from: {}, queued: 0, current: 0, skipped_busy: 0, relinks_folded: 0 };
  for (const id of ids || await repo.doneItemIds()) {
    if (out.queued >= limit) break;
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const meta = await read(it.dir).catch(() => null);
    if (!meta?.enhancement) continue;
    out.talks++;
    const was = meta.enhancement.listening || 'none';
    if (was === 'safe' && meta.web_codec === WEB_CODEC) { out.current++; continue; }
    out.from[was] = (out.from[was] || 0) + 1;
    if (!write) continue;
    if (busy.has(it.id)) { out.skipped_busy++; continue; }
    const vs = meta.enhancement.variants || [];
    const orig = vs.find((v) => v.name === 'original') || {};
    markAudioPending(meta);
    meta.enhancement.variants = [...vs.filter((v) => v.name !== 'safe'), { name: 'safe', file: orig.file || meta.original, af: safeChain(orig), chain: 'transparent: high-pass, hum notch when measured, loudness' }];
    if (was !== 'safe') meta.enhancement.listening_before = { name: was, why: meta.enhancement.listening_why || null };
    meta.enhancement.listening = 'safe';
    meta.enhancement.listening_why = 'the original, transparent processing only (Chad 10-23: denoised / restored copies clipped words)';
    meta.audio_version = audioVersion(meta);
    meta.version = (meta.version || 1) + 1;   // web stage publishes the new audio version after encoding
    await writeMeta(it.dir, meta);
    const redo = ['web', 'trim', 'update'];
    if (relinkOf.has(it.id)) { await ops.cancel(relinkOf.get(it.id)); redo.splice(2, 0, 'links'); out.relinks_folded++; }
    await queue('media-item', { id: it.id, redo }, 'media-safe-listening'); out.queued++;
  }
  return out;
}

/** media-speaker-merge { write, ids?, limit? }: published talks with more than one paragraph speaker and no merge yet → a
 *  run with merge_speakers (spkmerge.js: a labelled 'other speaker' whose voice — speaker AND paragraph — is the main
 *  speaker's goes back to the main speaker; a real questioner stays) + 'update'. A QUEUED run for the same talk is
 *  cancelled and folded in (one run per talk: two would race on its files); a running one → skipped. → counts */
export async function mediaSpeakerMergeJob({ write = false, ids = null, limit = Infinity } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const { readFile } = await import('fs/promises');
  const read = deps.readFiles || (async (dir) => ({ meta: JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')), work: JSON.parse(await readFile(join(dir, 'transcript.work.json'), 'utf8')) }));
  const pending = (await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n).then((rs) => rs.map((r) => ({ ...r, job: n })))))).flat();
  const queuedItem = new Map(pending.filter((r) => r.job === 'media-item' && r.status === 'queued').map((r) => [Number(r.params?.id), r]));
  const running = new Set(pending.filter((r) => !(r.job === 'media-item' && r.status === 'queued')).map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { talks: 0, multi: 0, done_before: 0, queued: 0, folded: 0, skipped_busy: 0 };
  for (const id of ids || await repo.doneItemIds()) {
    if (out.queued >= limit) break;
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const f = await read(it.dir).catch(() => null);
    if (!f) continue;
    out.talks++;
    if (new Set((f.work.paragraphs || []).map((p) => p.spk).filter(Boolean)).size < 2) continue;
    out.multi++;
    if (f.meta.speaker_merge) { out.done_before++; continue; }
    if (!write) continue;
    if (running.has(it.id)) { out.skipped_busy++; continue; }
    const q = queuedItem.get(it.id);
    const redo = [...new Set([...(q?.params?.redo || []).filter((x) => x !== 'update'), 'update'])];
    if (q) { await ops.cancel(q.id); out.folded++; }
    await queue('media-item', { id: it.id, redo, merge_speakers: true }, 'media-speaker-merge'); out.queued++;
  }
  return out;
}

/** media-talk-identities { write }: per-talk speaker decisions made from the evidence (data/media-speaker-people.json
 *  `talk_identities`, each with its reason — Chad 10-23: "settle identities yourself from the evidence"): the talk's speaker
 *  and/or individual speaker labels are set in its meta, then media-identity resolves the person (catalogue row, key) and
 *  queues the re-render. A talk with a RUNNING run is skipped (it would overwrite the meta); a queued run is fine. → counts */
export async function mediaTalkIdentitiesJob({ write = false } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const { readFile, writeFile: wf } = await import('fs/promises');
  const data = deps.data || JSON.parse(await readFile(join(process.cwd(), 'data', 'media-speaker-people.json'), 'utf8'));
  const read = deps.readMeta || (async (dir) => JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')));
  const writeMeta = deps.writeMeta || (async (dir, m) => wf(join(dir, 'meta.json'), JSON.stringify(m, null, 2)));
  const running = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat()
    .filter((r) => r.status === 'running').map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { decisions: 0, applied: [], unchanged: 0, missing: [], skipped_running: [] };
  const ids = [];
  for (const t of data.talk_identities || []) {
    out.decisions++;
    const it = repo.getMediaBySlug ? await repo.getMediaBySlug(t.slug) : null;
    if (!it?.dir) { out.missing.push(t.slug); continue; }
    const meta = await read(it.dir).catch(() => null);
    if (!meta) { out.missing.push(t.slug); continue; }
    const same = (!t.speaker || meta.speaker === t.speaker) && (!t.title || meta.title === t.title) && Object.entries(t.speaker_labels || {}).every(([k, v]) => meta.speakers?.[k] === v);
    if (same) { out.unchanged++; continue; }
    if (!write) { out.applied.push(t.slug); continue; }
    if (running.has(it.id)) { out.skipped_running.push(t.slug); continue; }
    if (t.speaker) meta.speaker = t.speaker;
    if (t.title) { meta.title_was = meta.title_was || meta.title; meta.title = t.title; }   // a retitle (Chad 10-24); the slug stays, the old URL keeps working
    if (t.speaker_labels) meta.speakers = { ...(meta.speakers || {}), ...t.speaker_labels };
    meta.identity_decision = { reason: t.reason, at: new Date().toISOString() };
    await writeMeta(it.dir, meta);
    if ((t.speaker || t.title) && repo.updateMediaItem) await repo.updateMediaItem(it.id, { ...(t.speaker ? { speaker: t.speaker } : {}), ...(t.title ? { title: t.title } : {}) });
    out.applied.push(t.slug); ids.push(it.id);
  }
  if (write && ids.length) {
    out.identity = await (deps.identity || mediaIdentityJob)({ write: true, ids }, deps.identity ? {} : { repo, ops });
    // a label-only change (no talk speaker) still needs the re-render
    const queue = deps.queue || enqueue;
    for (const id of ids) await queue('media-item', { id, redo: ['update'] }, 'media-talk-identities');
  }
  return out;
}

/** media-remaster { id }: one talk's TOWER part of the remaster (Chad 10-23): the word guard on the UniPASE copy the cloud
 *  worker left in its folder, realign, the Opus 96k + original encodes, trim, update. Its own lane ('remaster'). */
// ONE remaster run per talk at a time (10-24: duplicate runs — a pod's collection, a re-score, a resume — raced on meta.json
// and a stale run overwrote a newer verdict). Same process: a run for a busy talk waits, then runs on the latest files.
const remasterBusy = new Map();
export async function mediaRemasterJob(params = {}, deps = {}) {
  const key = String(params.id);
  const prev = remasterBusy.get(key);
  const mine = (async () => { if (prev) await prev.catch(() => {}); return remasterRun(params, deps); })();
  remasterBusy.set(key, mine);
  try { return await mine; } finally { if (remasterBusy.get(key) === mine) remasterBusy.delete(key); }
}
async function remasterRun({ id, ...rest } = {}, deps = {}) {
  // phase 1: the word guard only; phase 2 (realign → encode → publish) only when the UniPASE copy became the listening copy —
  // a 'review' / 'skipped' talk keeps its published audio untouched (no re-encode, no re-ingest)
  let r = await mediaItemJob({ id, ...rest, remaster: true, redo: ['remaster'] }, deps);
  if (!r?.yielded) {
    const repo0 = deps.repo || await import('../repos/media-repo.js');
    const it0 = await repo0.getMediaItem(Number(id));
    const m0 = it0?.dir ? JSON.parse(await (await import('fs/promises')).readFile(join(it0.dir, 'meta.json'), 'utf8').catch(() => '{}')) : {};
    const take = m0.remaster?.status === 'done' && m0.enhancement?.listening === 'unipase';
    const undo = m0.enhancement?.listening !== 'unipase' && (m0.web_original || (m0.aligned_to && m0.aligned_to !== 'safe'));   // a remaster still published but no longer chosen
    if (take || undo) r = await mediaItemJob({ id, ...rest, remaster: true, redo: ['realign', 'web', 'trim', 'update'] }, deps);
  }
  // one line per finished talk → the backfill's progress file (data/run/remaster-results.jsonl; read by the overnight status)
  try {
    const fs = await import('fs/promises');
    const repo = deps.repo || await import('../repos/media-repo.js');
    const it = await repo.getMediaItem(Number(id));
    const m = it?.dir ? JSON.parse(await fs.readFile(join(it.dir, 'meta.json'), 'utf8')) : null;
    if (m) {
      const file = deps.resultsFile || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'run', 'remaster-results.jsonl');
      await fs.mkdir(dirname(file), { recursive: true });
      await fs.appendFile(file, JSON.stringify({ at: new Date().toISOString(), id: it.id, slug: it.slug, grade: m.quality?.overall ?? null,
        status: m.remaster?.status ?? null, listening: m.enhancement?.listening ?? null, swapped_pct: m.remaster?.swapped_pct ?? null, fallback_sent_pct: m.remaster?.fallback_sent_pct ?? null, unguardable_s: m.remaster?.unguardable_s ?? null,
        unplaced_pct: m.remaster?.realign_unplaced_pct ?? null, aligned_to: m.aligned_to ?? null, web_original: m.web_original ?? null,
        web: m.web?.ogg ?? m.web ?? null, why: m.remaster?.why ?? null }) + '\n');
    }
  } catch { /* the log is a convenience; the talk's own meta is the record */ }
  return r;
}

/** media-remaster-revert { ids }: back to the transparent original (one flag per talk: listening = 'safe'); the word
 *  times return to the original's (s0/e0) in realign. The remaster files are kept. */
export async function mediaRemasterRevertJob({ ids = [] } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const queue = deps.queue || enqueue;
  const { readFile, writeFile: wf } = await import('fs/promises');
  const out = { reverted: [] };
  for (const x of [].concat(ids)) {
    const it = /^\d+$/.test(String(x)) ? await repo.getMediaItem(Number(x)) : await repo.getMediaBySlug(String(x));
    if (!it?.dir) continue;
    const m = JSON.parse(await readFile(join(it.dir, 'meta.json'), 'utf8'));
    if (!m.enhancement) continue;
    markAudioPending(m);
    m.enhancement.listening = 'safe';
    m.enhancement.listening_why = 'reverted to the transparent original (media-remaster-revert)';
    m.remaster = { ...(m.remaster || {}), status: 'reverted', at: new Date().toISOString() };
    m.audio_version = audioVersion(m);
    m.version = (m.version || 1) + 1;
    await wf(join(it.dir, 'meta.json'), JSON.stringify(m, null, 2));
    await queue('media-item', { id: it.id, redo: ['realign', 'web', 'trim', 'update'] }, 'media-remaster-revert');
    out.reverted.push(it.slug);
  }
  return out;
}

/** media-remaster-review-pack { out?, clipS? }: the talks the word guard HELD (> 15 % of sentences fell back — the worst audio,
 *  where Chad most wants the upgrade) as a morning review set (coordinator 10-23): per talk a 40 s A/B — the original
 *  (transparent chain) vs the FULL UniPASE copy, no splice — from the stretch with the most flagged sentences, and those
 *  sentences' text (published text · the original's ASR · the copy's ASR). Incremental: clips already cut are kept.
 *  → writes <out>/clips/*.m4a + <out>/review.json; returns the counts */
export async function mediaRemasterReviewPackJob({ out = null, clipS = 40, ids = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const T = deps.tools || await import('../media/tools.js');
  const { safeChain } = await import('../media/enhance.js');
  const fs = await import('fs/promises');
  const dir = out || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'run', 'remaster-review');
  await fs.mkdir(join(dir, 'clips'), { recursive: true });
  const rd = async (f, d = null) => JSON.parse(await fs.readFile(f, 'utf8').catch(() => 'null')) ?? d;
  const exists = (f) => fs.stat(f).then(() => true, () => false);
  const words = (asr, s, e) => (asr?.segments || []).flatMap((g) => g.words || []).filter((w) => w.s >= s - 0.3 && w.s <= e + 0.3).map((w) => w.w).join(' ').trim();
  const entries = [], skipped = [];
  let cut = 0;
  for (const it of await repo.remasterCandidates(['B', 'C', 'D', 'E'])) {
    if (ids?.length && !ids.includes(it.id)) continue;
    const m = it.dir ? await rd(join(it.dir, 'meta.json')) : null;
    if (m?.remaster?.status !== 'review' || m.remaster.fallback_sent_pct == null) continue;
    const enh = join(it.dir, 'enhanced');
    const g = await rd(join(enh, 'unipase.guard.json'), {});
    const flagged = (g.detail || []).filter((x) => x.swap);
    if (!flagged.length || !(await exists(join(enh, 'unipase.cloud.flac')))) continue;
    // the clip window with the most flagged sentences
    let best = { t: Math.max(0, flagged[0].s - 3), n: 0 };
    for (const f of flagged) { const t = Math.max(0, f.s - 3); const n = flagged.filter((x) => x.s >= t && x.e <= t + clipS).length; if (n > best.n) best = { t, n }; }
    const orig = (m.enhancement?.variants || []).find((v) => v.name === 'original') || {};
    const co = join(dir, 'clips', `${it.slug}.orig.m4a`), cu = join(dir, 'clips', `${it.slug}.unipase.m4a`);
    const enc = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart'];
    if (!(await exists(co)) || !(await exists(cu))) try {
      await T.ffmpeg(['-ss', String(best.t), '-t', String(clipS), '-i', join(it.dir, m.original), '-af', safeChain(orig), ...enc, co]);
      await T.ffmpeg(['-ss', String(best.t), '-t', String(clipS), '-i', join(enh, 'unipase.cloud.flac'), '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.891:level=disabled', ...enc, cu]);
      cut++;
    } catch (err) { skipped.push({ id: it.id, slug: it.slug, error: String(err.message).slice(0, 200) }); continue; }
    const work = await rd(join(it.dir, 'transcript.work.json'), { paragraphs: [] });
    const ao = await rd(join(enh, 'unipase.asr_orig.json')) || await rd(join(it.dir, 'transcript.raw.json'));
    const au = await rd(join(enh, 'unipase.asr.json'));
    const byN = new Map((work.paragraphs || []).map((p) => [p.n, p]));
    const shown = flagged.filter((x) => x.s >= best.t && x.e <= best.t + clipS).slice(0, 6).map((x) => {
      const p = byN.get(x.n); const [i0, i1] = (p?.sentences || [])[x.k] || [0, 0];
      return { at: Math.round(x.s - best.t), text: (p?.words || []).slice(i0, i1).map((w) => w.w).join(' '), original_heard: words(ao, x.s, x.e), remaster_heard: words(au, x.s, x.e), lost: x.lost };
    });
    entries.push({ id: it.id, slug: it.slug, title: m.title || it.slug, speaker: m.speaker || null, grade: m.quality?.overall || it.grade, fallback_pct: m.remaster.fallback_sent_pct,
      unguardable_s: m.remaster.unguardable_s ?? null, clip_start_s: Math.round(best.t), clip_s: clipS, orig: `clips/${it.slug}.orig.m4a`, unipase: `clips/${it.slug}.unipase.m4a`,
      flagged: shown, page: `https://siftersearch.com/media/${it.slug}`, held_at: m.remaster.at || null });
  }
  entries.sort((a, b) => b.fallback_pct - a.fallback_pct);
  await fs.writeFile(join(dir, 'review.json'), JSON.stringify(entries, null, 1));
  return { held: entries.length, clips_cut: cut, skipped, dir };
}

/** media-remaster-decide { picks: [{ id | slug, choice: 'publish' | 'keep' }] }: Chad's morning picks from the review page.
 *  publish → the FULL UniPASE copy (no splice; -18 LUFS, -1 dBFS) becomes the listening copy, then realign → encode →
 *  publish with the original kept (the "Original" button); keep → the transparent original stays, marked decided. */
export async function mediaRemasterDecideJob({ picks = [] } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const T = deps.tools || await import('../media/tools.js');
  const queue = deps.queue || enqueue;
  const fs = await import('fs/promises');
  const out = { published: [], kept: [], skipped: [] };
  for (const pk of [].concat(picks)) {
    const x = pk.id ?? pk.slug;
    const it = /^\d+$/.test(String(x)) ? await repo.getMediaItem(Number(x)) : await repo.getMediaBySlug(String(x));
    if (!it?.dir) { out.skipped.push(String(x)); continue; }
    const mf = join(it.dir, 'meta.json');
    const m = JSON.parse(await fs.readFile(mf, 'utf8'));
    const at = new Date().toISOString();
    if (pk.choice === 'publish') {
      markAudioPending(m);
      const cloud = join(it.dir, 'enhanced', 'unipase.cloud.flac'), full = join(it.dir, 'enhanced', 'unipase.full.flac');
      await T.ffmpeg(['-i', cloud, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11,alimiter=limit=0.891:level=disabled', '-ac', '1', '-ar', '48000', '-c:a', 'flac', full]);
      const vs = (m.enhancement.variants || []).filter((v) => v.name !== 'unipase');
      vs.push({ name: 'unipase', file: 'enhanced/unipase.full.flac', shifts_time: true, full: true, chosen_by: 'human' });
      m.enhancement.variants = vs;
      if (m.enhancement.listening !== 'unipase') m.enhancement.listening_before = { name: m.enhancement.listening };
      m.enhancement.listening = 'unipase';
      m.remaster = { ...(m.remaster || {}), status: 'done', verdict: 'pass-human-full', decided_at: at };
      await fs.writeFile(mf, JSON.stringify(m, null, 2));
      await queue('media-item', { id: it.id, remaster: true, redo: ['realign', 'web', 'trim', 'update'] }, 'media-remaster-decide');
      out.published.push(it.slug);
    } else if (pk.choice === 'keep') {
      m.remaster = { ...(m.remaster || {}), status: 'kept', verdict: 'keep-human', decided_at: at };
      await fs.writeFile(mf, JSON.stringify(m, null, 2));
      out.kept.push(it.slug);
    } else out.skipped.push(it.slug);
  }
  return out;
}

/** HOME HOSTS as extra remaster workers (Chad 10-23 overnight): aorus when its card has UniPASE's ~4.3 GB free beside the
 *  transcriptions (ASR keeps priority: a free ASR slot is required to start), boss only when cool (one APU heat budget).
 *  UniPASE through the gate's 'unipase' verb, then the copy's transcript through the host's normal ASR job; the files land
 *  where the pods' land and the talk's media-remaster run is queued. Re-attaches by job id after a restart. */
export function homeEligible(host, T) {
  if (!T.diskOk(host, { kind: 'unipase' })) return false;
  if (!T.coolEnough(host)) return false;
  const load = T.asrLoad?.()[host];
  return !load || load.busy < load.slots;
}
/** A gate-transport host: UniPASE (gate verb) + the copy's transcript, then the CPU tail in the accepted worker image ('post'). → the done record */
export async function gateRestoreChain(host, it, m, { T, C, fs, image, stop, deps = {} }) {
  const first = await (deps.homeRemaster || homeRemaster)(host, it, m, { T, C, fs, stop });
  const tail = await (deps.homeRecording || (await import('../media/home-recording.js')).homeRecording)(host, it, m, { T, image, mode: 'post', stop });
  return { ...first, ...tail, unipase_s: first.unipase_s, asr_s: first.asr_s, post_s: tail?.post_s ?? null, seconds: (first.seconds || 0) + (tail?.seconds || 0), gpu: host };
}
export async function homeRemaster(host, it, m, { T, C, fs, stop }) {
  const enh = join(it.dir, 'enhanced');
  await fs.mkdir(enh, { recursive: true });
  const job = `um-${C.jobIdOf(it)}`.slice(0, 100);
  const copy = join(enh, 'unipase.cloud.flac');
  const t0 = Date.now();
  const unreserve = T.reserveGpu ? T.reserveGpu(host, 'unipase') : () => {};
  try { await T.remoteJob('unipase', join(it.dir, m.original), { output: `${copy}.part` }, { host, job, stop, file: true, pollMs: 10_000 }); }
  finally { unreserve(); }
  await fs.rename(`${copy}.part`, copy);
  const t1 = Date.now();
  await T.asrJob(copy, { output: join(enh, 'unipase.asr.json.part') }, { host, job: `ua-${C.jobIdOf(it)}`.slice(0, 100), stop });
  await fs.rename(join(enh, 'unipase.asr.json.part'), join(enh, 'unipase.asr.json'));
  const done = { audio_s: it.duration_s || m.duration_s || null, unipase_s: Math.round((t1 - t0) / 1000), asr_s: Math.round((Date.now() - t1) / 1000), seconds: Math.round((Date.now() - t0) / 1000), gpu: host, pod: host, cost_per_hr: 0 };
  await fs.writeFile(join(enh, 'unipase.done.json'), JSON.stringify(done));
  return done;
}

/** The talk's language RUNS from its paragraphs: consecutive paragraphs of one language joined, the boundaries halfway
 *  between paragraphs, the first from 0, the last to the end (+1 s). Codes folded ('En', 'Eng' → 'en'). → [{s, e, lang}] */
export function languageRuns(paragraphs = [], duration = null) {
  const code = (l) => { const x = String(l || '').toLowerCase(); return x.startsWith('eng') ? 'en' : x.startsWith('per') || x.startsWith('far') ? 'fa' : x.startsWith('ara') ? 'ar' : x.slice(0, 2) || null; };
  const ps = paragraphs.filter((p) => p.t0 != null && p.t1 != null).sort((a, b) => a.t0 - b.t0);
  const runs = [];
  for (const p of ps) {
    const lang = code(p.lang);
    const last = runs.at(-1);
    if (last && last.lang === lang) last.e = p.t1;
    else { if (last) { const mid = (last.e + p.t0) / 2; last.e = mid; runs.push({ s: mid, e: p.t1, lang }); } else runs.push({ s: 0, e: p.t1, lang }); }
  }
  if (runs.length) runs.at(-1).e = Math.max(runs.at(-1).e, Number(duration) || 0) + 1;
  return runs.map((r) => ({ s: Math.round(r.s * 1000) / 1000, e: Math.round(r.e * 1000) / 1000, lang: r.lang }));
}

/** Worst first: grade E → B, then the narrowest bandwidth, then the lowest SNR (unknowns last within their grade). */
export function worstFirst(talks) {
  const rank = { E: 0, D: 1, C: 2, B: 3, A: 4 };
  const num = (v) => (v == null ? Infinity : Number(v));
  return [...talks].sort((a, b) => (rank[a.grade] ?? 5) - (rank[b.grade] ?? 5) || num(a.bw) - num(b.bw) || num(a.snr) - num(b.snr) || a.id - b.id);
}

/** media-cloud-remaster { write, ids?, limit?, maxPods? } — THE RUNPOD BACKFILL (Chad 10-23). Dry: the candidates and the
 *  estimate. Write: up to maxPods (3) pods run UniPASE + Whisper on the originals; each finished copy lands in its talk's
 *  folder and the talk's media-remaster run is queued. Budget-capped (cloud.js), every pod terminated at the end, on a
 *  fatal error, or (their own watchdog) after 15 idle minutes; a drain YIELDS — pods and jobs in flight live in the state
 *  file and are re-attached on the next start. → summary (spend, $/audio-hour, done, failed) */

/** Measured host capability (Chad 10-28): EWMA of audio-seconds processed per wall-second PER SLOT, from completed orders. Vendor-blind. */
export function updateRate(rates, host, audioS, wallS, alpha = 0.3) {
  if (!(audioS > 0) || !(wallS > 30)) return rates;
  const h = host.replace(/-\d+$/, ''), r = audioS / wallS;
  rates[h] = { rate: rates[h] ? rates[h].rate * (1 - alpha) + r * alpha : r, n: (rates[h]?.n || 0) + 1 };
  return rates;
}
/** Slots a host may use concurrently: its physical maximum scaled by measured per-slot speed against the best host (never below 1; unmeasured hosts get the maximum so they get measured). */
export function rankedSlots(rates, host, maxSlots) {
  const mine = rates[host.replace(/-\d+$/, '')]?.rate, best = Math.max(0, ...Object.values(rates).map((x) => x.rate));
  if (!mine || !best) return maxSlots;
  return Math.max(1, Math.min(maxSlots, Math.round(maxSlots * mine / best)));
}

/** May home host `h` take queued order `id`? ONE host per order (Chad 10-28: upload is the bottleneck — the same audio never goes to two computers):
 *  an order another host holds is never eligible, and a whole order runs every stage on the host that takes it. Vendor-blind: boss (AMD) takes whole
 *  orders as soon as its GPU path is accepted (`boss_whole`), exactly like aorus (NVIDIA). */
export function homeEligibleItem(h, id, st, acceptedWorker, env = process.env) {
  const whole = st.items?.[id]?.kind === 'whole';
  if (acceptedWorker?.hold_whole && whole) return false;
  if (!homeCanTake(h, id, st, acceptedWorker, env)) return false;
  // Published talks first (Chad 10-28): a new-talk (whole) order takes a host only when no queued remaster work can run there. Both get processed.
  return !(whole && st.queue?.some((q) => q !== id && st.items?.[q]?.kind !== 'whole' && homeCanTake(h, q, st, acceptedWorker, env)));
}
const baseHost = (h) => String(h).replace(/-\d+$/, '');
const isGateHost = (h) => hostProfile(baseHost(h)).transport === 'gate';
function homeCanTake(h, id, st, acceptedWorker, env) {
  const it = st.items?.[id], whole = it?.kind === 'whole';
  if (Object.values(st.home || {}).some((c) => c?.itemId === id)) return false;
  return !isGateHost(h) || !acceptedWorker || it?.mode === 'post'
    || (whole && (acceptedWorker.gate_whole ?? acceptedWorker.boss_whole) === true)
    || (!whole && (it?.mode || 'restore') === 'restore' && (env.MEDIA_GATE_RESTORE ?? env.MEDIA_BOSS_RESTORE) !== '0');
}

export async function mediaCloudRemasterJob({ write = false, ids = null, limit = null, maxPods = 3, tickMs = 15_000, force = false, mode = 'restore' } = {}, deps = {}) {
  const requestedMaxPods = maxPods;
  const configuredPods = Number(process.env.MEDIA_CLOUD_MAX_PODS);
  if (Number.isInteger(configuredPods) && configuredPods > 0) maxPods = Math.min(maxPods, Math.floor(configuredPods));
  const cleanupMode = mode === 'cleanup';   // talks the word guard held (review / kept / deferred): the deterministic cleanup only, no generative copy
  const C = deps.cloud || await import('../media/cloud.js');
  let acceptedWorker = C.acceptedWorker ? await C.acceptedWorker(deps.acceptedWorkerFile) : null;
  const L = deps.ledger || await import('../media/pod-ledger.js');
  const minHours = deps.minHours ?? L.LEDGER.minHoursPerPod();   // WORK FIRST, RENT SECOND: a pod only where ≥ this many audio hours wait for it
  const repo = deps.repo || await import('../repos/media-repo.js');
  const T = deps.tools || await import('../media/tools.js');
  const baseRun = deps.run || T.run;
  const queue = deps.queue || enqueue;
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const run=(cmd,args,opts={})=>baseRun(cmd,args,{...opts,stop:opts.stop||draining});
  const nap = deps.nap || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || Date.now;
  const fs = await import('fs/promises');
  const readMeta = deps.readMeta || (async (dir) => JSON.parse(await fs.readFile(join(dir, 'meta.json'), 'utf8')));
  const save = (st) => C.saveState(st, deps.stateFile);
  const st = await C.loadState(deps.stateFile);
  // the queue: explicit ids, else every published B–E talk not yet remastered, WORST FIRST (Chad 10-23: E, D, C, B; within a
  // grade the narrowest bandwidth, then the lowest SNR). Persisted in the state file, so a restart resumes in order; a new run
  // after a finished one rebuilds it (spend stays cumulative — the cap covers every run).
  // a run in progress (a resume after a drain) keeps its queue: its own ids must not be queued again (10-23: the pilot's
  // resume re-added all ten on every deploy)
  if (!st.started || st.finished) {
    const list = ids ? (await Promise.all([].concat(ids).map(async (x) => (/^\d+$/.test(String(x)) ? repo.getMediaItem(Number(x)) : repo.getMediaBySlug(String(x)))))).filter(Boolean)
      : await repo.remasterCandidates(String(process.env.MEDIA_REMASTER_GRADES || 'B,C,D,E').split(',').map((g) => g.trim().toUpperCase()));
    const busy = new Set([...Object.values(st.jobs || {}).map((j) => j.itemId), ...(force ? [] : (st.done || []).map((d) => d.id)), ...(st.queue || [])]);
    let want = [];
    for (const it of list) {
      if (!it?.dir || busy.has(it.id)) continue;
      const m = await readMeta(it.dir).catch(() => null);
      if (!m) continue;
      const held = ['review', 'kept', 'deferred'].includes(m.remaster?.status);
      if (cleanupMode ? (!held && !force) || m.remaster?.method === 'cleaned' : (!force && (held || m.remaster?.status === 'done'))) continue;   // force (explicit ids): redo
      const raw = m.quality?.raw || {};
      want.push({ id: it.id, slug: it.slug, grade: m.quality?.overall || it.grade || null, bw: raw.bandwidth_khz ?? null, snr: raw.snr_db ?? null, duration_s: it.duration_s || m.duration_s || 0 });
    }
    if (!ids) want = worstFirst(want);
    if (limit) want = want.slice(0, limit);
    if (!write) {
      const hours = want.reduce((a, x) => a + x.duration_s, 0) / 3600;
      const byGrade = {};
      for (const x of want) { const g = (byGrade[x.grade || '?'] ||= { talks: 0, hours: 0 }); g.talks++; g.hours = Math.round((g.hours + x.duration_s / 3600) * 10) / 10; }
      return { talks: want.length, hours: Math.round(hours * 10) / 10, by_grade: byGrade, sample: want.slice(0, 10).map((x) => `${x.grade} ${x.bw ?? '?'}kHz ${x.snr ?? '?'}dB ${x.slug}`) };
    }
    if (st.finished) { st.finished = null; st.started = null; st.pod_failures = 0; }
    st.items = st.items || {};
    for (const x of want) st.items[x.id] = { slug: x.slug, grade: x.grade, duration_s: x.duration_s, ...(cleanupMode ? { mode: 'cleanup' } : {}) };
    st.queue = [...(st.queue || []), ...want.map((x) => x.id)];
  }
  if (!write) return { queue: st.queue.length, jobs: Object.keys(st.jobs || {}).length, spent_usd: C.spendOf(st, now()) };
  st.started = st.started || now(); st.pods = st.pods || {}; st.jobs = st.jobs || {}; st.attempts = st.attempts || {}; st.done = st.done || []; st.failed = st.failed || [];
  // a run that ended on "N pods failed to start" starts clean (only the money stops a run for good: cap / balance)
  if (/pods failed to start/.test(st.cloud_stopped || '')) { st.cloud_stopped = null; st.pod_failures = 0; }
  st.pod_failures = st.pod_failures || 0; st.home = st.home || {}; st.home_done = st.home_done || 0;
  // the legacy home-host path (the gate's 'unipase' verb) has no worker result for tower to take: off in cleanup runs and in STRICT mode (workers only)
  const acceptedHomeHosts=a=>hostRegistry().flatMap(({name})=>isGateHost(name)
    ?((a.gate_cpu??a.boss_cpu)?[name,name+'-2']:[])
    :Array.from({length:Math.max(2,Math.min(4,Number(a.docker_slots??a.aorus_slots)||2))},(_,i)=>i?name+'-'+(i+1):name));
  let homeHosts = acceptedWorker ? acceptedHomeHosts(acceptedWorker) : (cleanupMode || process.env.MEDIA_REMASTER_STRICT === '1') ? [] : (deps.homeHosts ?? String(process.env.MEDIA_HOME_REMASTER_HOSTS ?? hostRegistry().map((x) => x.name).join(',')).split(',').map((h) => h.trim()).filter(Boolean));
  const allHomeHosts=homeHosts;
  const rankedHosts=()=>{   // stronger host keeps more concurrent slots; a slower one is cut to what its measured speed earns (re-evaluated every tick)
    if(!acceptedWorker||!st.rates)return allHomeHosts;
    const baseOf=h=>h.replace(/-\d+$/,''), maxOf={}, used={};
    for(const h of allHomeHosts)maxOf[baseOf(h)]=(maxOf[baseOf(h)]||0)+1;
    return allHomeHosts.filter(h=>{const b=baseOf(h);used[b]=(used[b]||0)+1;return used[b]<=rankedSlots(st.rates,b,maxOf[b])||!!st.home?.[h];});
  };
  const homeTasks = new Map();   // host → promise (in this process)
  // a talk decided since it was queued (kept / deferred by Chad, or already done) costs no GPU time: dropped when its turn comes
  const decided = (m,id) => !force && !st.items?.[id]?.redo && ['done', 'kept', 'deferred'].includes(m?.remaster?.status);
  const beatFile = `${deps.stateFile || C.STATE_FILE}.beat`;   // the lane's liveness, written on its own timer: a long transfer must not look like a dead lane to the reaper
  const beat = () => fs.writeFile(beatFile, String(now())).catch(() => {});
  beat();
  const hb = setInterval(beat, 60_000); hb.unref?.();
  const pub = deps.publicKey || (await fs.readFile(join((await import('os')).homedir(), '.ssh', 'id_ed25519.pub'), 'utf8')).trim();
  const closePod = async (p, why) => {
    try { await C.terminatePod(p.id, deps); } catch (err) { p.terminate_error = String(err.message).slice(0, 200); return false; }
    p.terminated = now(); p.why = why;
    // a pod that never took a job is WASTED rent (10-25: 56 of 75 pods booted, idled or died without working: $20 of the first $52). Three in a row
    // open the circuit breaker: no new rentals for 30 min, then ONE canary must prove itself before the pool grows again.
    if (!(p.jobs_assigned > 0) && /unreachable|boot|warm|bootstrap|worker stopped|idle|no SSH|selftest|canary/i.test(String(why)) && !/^(cap|account balance|the next 10 min)/.test(String(why))) {
      const wasted = (p.costPerHr || 0) * Math.max(0, p.terminated - p.created) / 3600_000;
      st.wasted_usd = Math.round(((st.wasted_usd || 0) + wasted) * 100) / 100;
      st.boot_fails = (st.boot_fails || 0) + 1;
      (st.waste_log ||= []).push({ at: now(), pod: p.name, why: String(why).slice(0, 120), usd: Math.round(wasted * 100) / 100, host: p.host_key || null, boot_s: p.ready_at ? Math.round((p.ready_at - p.created) / 1000) : null });
      st.waste_log = st.waste_log.slice(-30);
      if (st.boot_fails >= (deps.breakerAfter ?? 3)) { st.breaker_until = now() + (deps.breakerMs ?? 30 * 60_000); st.breaker_reason = `${st.boot_fails} pods in a row never worked (last: ${String(why).slice(0, 100)})`; st.proven = false; st.boot_fails = 0; st.breaker_trips = (st.breaker_trips || 0) + 1; }
    }
    st.spent_closed = Math.round(((st.spent_closed || 0) + (p.costPerHr || 0) * Math.max(0, p.terminated - p.created) / 3600_000) * 100) / 100;
    for (const [j, x] of Object.entries(st.jobs)) if (x.pod === p.id) { st.queue.unshift(x.itemId); delete st.jobs[j]; }
    return true;
  };
  const requireGate = process.env.MEDIA_POOL_REQUIRE_GATE === '1';   // pods must carry /opt/gate (the new image): older ones finish their jobs and are replaced
  let balance = null, balAt = 0, stop = null, yielded = false;
  // the dead-man heartbeat must not depend on how long a tick takes (10-24: a 10-minute upload queue starved it and a pod shut itself down)
  const pump = setInterval(() => {
    for (const q of Object.values(st.pods)) if (!q.terminated && q.ip && q.port && q.status !== 'booting') C.podSsh(run, q, 'touch /workspace/spool/.tower-hb', { timeoutMs: 30_000 }).catch(() => {});
  }, 60_000);
  pump.unref?.();
  try {
    for (;;) {
      if (draining()) { yielded = true; await Promise.allSettled([...homeTasks.values()]); break; }
      for(const cur of Object.values(st.home))if(!cur.image&&acceptedWorker)cur.image=acceptedWorker.image;
      if(C.acceptedWorker){acceptedWorker=await C.acceptedWorker(deps.acceptedWorkerFile);if(acceptedWorker)homeHosts=acceptedHomeHosts(acceptedWorker);}
      for(const [h,cur] of Object.entries(st.home))if(!homeTasks.has(h)&&acceptedWorker?.reset_home_ids?.includes(cur.itemId)&&cur.image!==acceptedWorker.image){
        delete st.home[h];delete st.attempts[cur.itemId];if(!st.queue.includes(cur.itemId))st.queue.unshift(cur.itemId);
        (st.home_recoveries||=[]).push({id:cur.itemId,at:now(),from_image:cur.image,reason:'operator verified stalled before restoration; original retained; old process left untouched'});
      }
      if (C.rentalCapacity) maxPods = await C.rentalCapacity(requestedMaxPods);
      st.capacity_target = maxPods;
      const rentalPause = await C.rentalPauseReason?.();
      if (rentalPause && !Object.keys(st.jobs).length) {
        await Promise.allSettled([...homeTasks.values()]);
        stop = `operator pause: ${rentalPause}`;
        break;
      }
      if (now() - balAt > 120_000) { balance = (await C.accountBalance(deps).catch(() => ({ balance }))).balance; balAt = now(); }
      // the money stops the PODS, not the backfill: the home hosts carry on (and the log says how far the cloud got)
      // a money stop is not for ever: when the cap is raised or the balance topped up the stop clears (10-25: a sticky "balance < $90" ended the run and nothing restarted it)
      if (st.cloud_stopped && /^(cap|account balance|the next 10 min)/.test(st.cloud_stopped) && !C.budgetStop(st, balance, now())) { st.cloud_stopped = null; st.cloud_stopped_at = null; }
      const why = st.cloud_stopped || C.budgetStop(st, balance, now());
      if (why && !st.cloud_stopped) {
        st.cloud_stopped = why; st.cloud_stopped_at = now(); st.cloud_done_at_stop = st.done.length;
        for (const p of Object.values(st.pods).filter((q) => !q.terminated)) await closePod(p, why);
      }
      if (st.cloud_stopped && !homeHosts.length) { stop = st.cloud_stopped; break; }
      // WORK ORDERS (media-cloud-order): cleanup runs for held talks, and 'post' runs that take the guard / realign / encodes of results tower is still
      // holding in its own queue onto the workers. Taken in here so the one persistent lane (state file, budget, pods) serves every kind of work.
      if (now() - (st.orders_checked || 0) > 20_000) {
        st.orders_checked = now();
        const taken = await (C.peekOrders?C.peekOrders(deps.ordersFile):C.takeOrders(deps.ordersFile));
        for (const o of taken) {
          if (o.redo) {
            st.done = st.done.filter((d) => d.id !== o.id);
            st.failed = st.failed.filter(d=>d.id!==o.id);delete st.attempts[o.id];
            st.items[o.id]={slug:o.slug,grade:o.grade,duration_s:o.duration_s,mode:o.mode,kind:o.kind,redo:true};
          }
          if (o.first) { st.items[o.id] = { ...(st.items[o.id] || { slug: o.slug, grade: o.grade, duration_s: o.duration_s, mode: o.mode, kind: o.kind }), first: true }; if (!st.queue.includes(o.id) && !Object.values(st.jobs).some((j) => j.itemId === o.id)) st.queue.push(o.id); }
          if ((!o.redo && st.done.some((d) => d.id === o.id && (d.mode || 'restore') === o.mode)) || st.queue.includes(o.id) || Object.values(st.jobs).some((j) => j.itemId === o.id)) continue;
          st.items[o.id] = { slug: o.slug, grade: o.grade, duration_s: o.duration_s, mode: o.mode, kind:o.kind, redo:!!o.redo, ...(o.first ? { first: true } : {}) };
          st.queue.push(o.id);   // fresh talks first: a 'post' run ships the ~300 MB restored copy BACK up tower's ~1.4 MB/s uplink (vs ~60 MB for an original) — it fills the gaps
        }
        if(taken.length&&C.ackOrders){await save(st);await C.ackOrders(taken,deps.ordersFile);}
      }
      st.queue = laneOrder(st.queue, st.items);
      // BACKPRESSURE (Chad 10-24): never hand out a new talk while more than N finished results wait for tower's word guard / realign /
      // encode — GPUs would be paid for output nobody can consume. Pods that go without work idle out (10 min) and are terminated.
      if (now() - (st.backlog_checked || 0) > 30_000) {
        const opsRepo = deps.ops || await import('../repos/ops-report-repo.js');
        st.backlog = (await opsRepo.pendingRuns('media-remaster').catch(() => [])).length; st.backlog_checked = now();
      }
      const held = (st.backlog || 0) > (deps.maxBacklog ?? Number(process.env.MEDIA_CLOUD_MAX_BACKLOG ?? 12));
      st.held = held;
      // home hosts: re-attach a task from before a restart, start one when a host is free and eligible
      // ASR KEEPS PRIORITY (Chad 10-23): a home host starts a UniPASE copy only while no transcription waits in the queue
      if (homeHosts.length && now() - (st.asr_checked || 0) > 120_000) {
        const opsRepo = deps.ops || await import('../repos/ops-report-repo.js');
        st.asr_waiting = (await opsRepo.pendingRuns('media-asr').catch(() => [])).filter((r) => r.status === 'queued').length; st.asr_checked = now();
      }
      for (const h of rentalPause && !acceptedWorker ? [] : rankedHosts()) {
        if (homeTasks.has(h)) continue;
        if ((st.host_down?.[h.replace(/-\d+$/, '')] || 0) > now()) continue;   // a host that stopped answering is left alone for a while (10-28: boss went offline and 41 talks burned their attempts in minutes)
        // any home host: hot, or short of RAM for our job on top of its own capacity-derived reserve (MemAvailable, read live from the gate every 30 s)
        const hostBase=h.replace(/-\d+$/,''); const bossBlocked=((T.coolEnough&&!T.coolEnough(hostBase))||(T.diskOk&&!T.diskOk(hostBase,{kind:(acceptedWorker?.gate_whole??acceptedWorker?.boss_whole)&&st.queue.some(id=>st.items?.[id]?.kind==='whole'&&homeEligibleItem(h,id,st,acceptedWorker))?'whole':'unipase'})));
        const eligibleIndex=bossBlocked?-1:st.queue.findIndex(id=>homeEligibleItem(h,id,st,acceptedWorker));
        const cur = st.home[h] || (eligibleIndex>=0&&st.queue.length && !held && (acceptedWorker || (!st.asr_waiting && homeEligible(h, T))) ? { itemId: st.queue.splice(eligibleIndex,1)[0], since: now() } : null);
        if (!cur) continue;
        if(acceptedWorker&&!cur.image)cur.image=acceptedWorker.image;
        st.home[h] = cur;
        homeTasks.set(h, (async () => {
          const it = await repo.getMediaItem(cur.itemId);
          const m = it?.dir ? await readMeta(it.dir).catch(() => null) : null;
          if (!m?.original) throw new Error('no original');
          if (st.items?.[it.id]?.kind==='whole'){
            const completed=await (await import('../media/home-recording.js')).homeWholeRecording(it,m,{T,host:baseHost(h),image:isGateHost(h)?((acceptedWorker.gate_image??acceptedWorker.boss_image)||acceptedWorker.image):(cur.image||acceptedWorker.image),legacyLock:acceptedWorker.aorus_legacy_lock!==false,stop:draining});
            if(['whole_queued','scheduled','queued','running'].includes((await repo.getMediaItem(it.id))?.state))await repo.updateMediaItem(it.id,{state:'transcribed',stage:null,stages_done:','+Object.keys(completed.stages).join(',')+','});
            st.done.push({id:it.id,slug:it.slug,mode:'whole',audio_s:m.duration_s,gpu:h,pod:h,at:now()});updateRate(st.rates||={},h,m.duration_s,(now()-cur.since)/1000);st.home_done++;return;
          }
          if (decided(m,it.id)) return;
          const wantMode = st.items?.[it.id]?.mode || 'restore';
          const dj = acceptedWorker
            ? (isGateHost(h) && wantMode === 'restore'
              // BOSS RESTORES (Chad 10-28): UniPASE on its ROCm iGPU through the gate's 'unipase' verb + the copy's ASR, then the worker container's CPU tail
              // (word guard, realign, encodes, verdict) on the same box; tower only takes the complete result
              ? await gateRestoreChain(baseHost(h), it, m, { T, C, fs, image: cur.image || acceptedWorker.image, stop: draining })
              : await (await import('../media/home-recording.js')).homeRecording(baseHost(h),it,m,{T,image:cur.image||acceptedWorker.image,mode:wantMode,stop:draining}))
            : await (deps.homeRemaster || homeRemaster)(h, it, m, { T, C, fs, stop: draining });
          if (st.done.some((d) => d.id === it.id)) return;   // a duplicate result never double-publishes
          st.done.push({ id: it.id, slug: it.slug, audio_s: dj.audio_s, seconds: dj.seconds, gpu: h, pod: h,at:now(),mode:st.items?.[it.id]?.mode||'restore' });
          updateRate(st.rates||={},h,dj.audio_s||m.duration_s,(now()-cur.since)/1000);st.home_done++;
          await queue('media-remaster', { id: it.id }, 'media-cloud-remaster');
        })().then(() => { delete st.home[h]; }, async (err) => {
          if (err?.code === 'DRAIN') return;   // left running on the host; re-attached next start
          delete st.home[h];
          // the HOST is unreachable, not the talk: back to the front of the queue, no attempt used, the host rests 10 min
          if (/ssh exit (255|SIGKILL|SIGTERM)|rsync exit (10|12|30|35|255)|Connection timed out|Operation timed out|No route to host|Connection refused|Connection closed|Connection reset|timed out/i.test(String(err?.message || err))) {
            (st.host_down ||= {})[h.replace(/-\d+$/, '')] = now() + (deps.hostRestMs ?? 10 * 60_000);
            st.queue.unshift(cur.itemId); st.home_last_error = `${h} #${cur.itemId}: host unreachable — resting 10 min`;
            return;
          }
          st.attempts[cur.itemId] = (st.attempts[cur.itemId] || 0) + 1;
          if (st.attempts[cur.itemId] < 2) st.queue.push(cur.itemId); else {
            st.failed.push({ id: cur.itemId, error: `${h}: ${String(err?.message || err).slice(-300)}` });
            if(st.items?.[cur.itemId]?.kind==='whole')await repo.updateMediaItem(cur.itemId,{state:'failed',why:String(err.message).slice(0,500)});
          }
          st.home_errors = (st.home_errors || 0) + 1; st.home_last_error = `${h} #${cur.itemId}: ${String(err?.message || err).slice(-300)}`;
        }).finally(() => homeTasks.delete(h)));
      }
      const live = Object.values(st.pods).filter((p) => !p.terminated);
      const imageStarting=acceptedWorker&&live.some(p=>p.image===acceptedWorker.image&&p.status!=='ready');
      const imageDrainId=acceptedWorker&&!imageStarting?live.filter(p=>p.image&&p.image!==acceptedWorker.image).sort((a,b)=>a.created-b.created)[0]?.id:null;
      const inflight = Object.keys(st.jobs).length;
      if (!st.queue.length && !inflight && !homeTasks.size) break;
      const hoursOf = (ids) => ids.reduce((a, id) => a + (st.items?.[id]?.duration_s || 0), 0) / 3600;
      const waitingH = hoursOf(st.queue.filter(id=>!acceptedWorker?.hold_whole||st.items?.[id]?.kind!=='whole')) + hoursOf(Object.values(st.jobs).map((j) => j.itemId));
      const rampCap = st.proven ? maxPods : 1;   // CANARY FIRST: one pod must finish a real talk before the pool grows
      const wantRaw = st.cloud_stopped || rentalPause ? 0 : minHours > 0 ? L.podsWanted({ queueHours: waitingH, maxPods, minHours }) : Math.min(maxPods, Math.ceil((st.queue.length + inflight) / C.CLOUD.perPod));
      const want = Math.min(wantRaw, rampCap);
      const keepPods = new Set([...live].sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || a.created - b.created).slice(0, maxPods).map(p => p.id));
      const surplusPods = new Set(maxPods > 0 ? live.filter(p => !keepPods.has(p.id)).map(p => p.id) : []);
      // nothing to rent for and nobody else to give the tail to: the run ends here, spending nothing (the queue stays in the state file)
      if (!wantRaw && !homeHosts.length && !live.length && !inflight && st.queue.length && !st.cloud_stopped) { stop = `${st.queue.length} talks (${Math.round(waitingH * 10) / 10} h) wait, below the ${minHours} h a pod needs — none rented`; break; }
      const breakerOn = !!st.breaker_until && now() < st.breaker_until;
      if (live.length < want && !held && !breakerOn) {
        const name = `sifter-unipase-${Object.keys(st.pods).length + 1}`;
        const pod = await C.createPod(name, pub, { ...deps, prefer: acceptedWorker?.prefer_community?{cloud:'COMMUNITY',dcs:[]}:C.rentalPrefer(st) }).catch((err) => ({ error: err.message }));
        if (pod.error) { st.last_error = pod.error.slice(0, 300); st.pod_failures++; st.boot_fails = (st.boot_fails || 0) + 1; if (st.boot_fails >= (deps.breakerAfter ?? 3)) { st.breaker_until = now() + (deps.breakerMs ?? 30 * 60_000); st.breaker_reason = `${st.boot_fails} rentals failed (${st.last_error.slice(0, 100)})`; st.proven = false; st.boot_fails = 0; } }
        else {
          st.pods[pod.id] = { id: pod.id, name, created: now(), costPerHr: pod.costPerHr ?? pod.adjustedCostPerHr ?? null, status: 'booting',image:acceptedWorker?.image||null };
          await save(st);  // persist the paid allocation before slow audio transfers or a process restart
        }
      }
      const utilBy = {};
      // Transfer each pod's bounded batch in parallel; the uplink, not the GPU, can be the limiting resource.
      await Promise.all(live.map(async (p) => {
        try {
          if (surplusPods.has(p.id) && !Object.values(st.jobs).some(j => j.pod === p.id)) { await closePod(p, `pool reduced to ${maxPods}`); return; }
          if (p.status === 'booting') {
            let g = await C.getPod(p.id, deps);
            p.image=g.imageName||acceptedWorker?.image||null;
            p.cpu_count=g.vcpuCount||null;
            p.max_jobs=Number(g.memoryInGb)>=32?8:6;
            if((!g.publicIp||!g.portMappings?.['22'])&&C.getPodConnection)g={...g,...await C.getPodConnection(p.id,deps)};
            if (p.costPerHr == null) p.costPerHr = g.costPerHr ?? g.adjustedCostPerHr ?? null;
            p.gpu = g.machine?.gpuDisplayName || g.gpu?.displayName || p.gpu || null;
            p.dc = g.machine?.dataCenterId || g.dataCenterId || p.dc || null; p.host_key = g.machineId || g.machine?.id || p.host_key || null; p.cloud = g.cloudType || g.machine?.cloudType || p.cloud || null;
            const port = g.portMappings?.['22'];
            if (g.publicIp && port) {
              p.ip = g.publicIp; p.port = port;
              await C.podSsh(run, p, 'mkdir -p /workspace/spool && echo ok', { timeoutMs: 60_000 });
              const probeOut = (await C.podSsh(run, p, 'test -f /opt/sifter-image-version && echo BAKED; test -x /opt/gate/asr-gate.sh && echo GATE; true', { timeoutMs: 60_000 })).stdout || '';
              const baked = /BAKED/.test(probeOut); p.gate = /GATE/.test(probeOut);
              if (baked) {
                p.baked = true;   // the image carries code + weights + aligners: nothing to upload or download
                if (!acceptedWorker) try {   // legacy images only; accepted images are immutable
                  const tgz = join((await import('os')).tmpdir(), `media-scripts-${process.pid}.tgz`);
                  await run('tar', ['czf', tgz, '-C', join(dirname(C.WORKER_FILE)), ...C.MEDIA_SCRIPTS], { timeoutMs: 60_000 });
                  await C.podPut(run, p, tgz, '/workspace/media-scripts.tgz');
                } catch { /* the image's own copy runs */ }
                await C.podSsh(run, p, 'cat > /workspace/bootstrap.sh && rm -f /workspace/boot.rc && (setsid nohup bash -c "bash /workspace/bootstrap.sh > /workspace/boot.log 2>&1; echo \\$? > /workspace/boot.rc" >/dev/null 2>&1 < /dev/null &) && echo spawned', { input: acceptedWorker ? C.BOOTSTRAP_WHOLE.replace('--max-jobs 6',`--max-jobs ${p.max_jobs}`) : C.BOOTSTRAP_BAKED, timeoutMs: 120_000 });
              } else {
                await C.podPut(run, p, C.WORKER_FILE, '/workspace/runpod_worker.py');
                await C.podPut(run, p, C.REPO_TGZ(), '/workspace/unipase-repo.tgz');
                try {   // the pod's half of the remaster: worker + word guard + aligner + post.py (small); a failure here only means tower does those steps itself
                  const tgz = join((await import('os')).tmpdir(), `media-scripts-${process.pid}.tgz`);
                  await run('tar', ['czf', tgz, '-C', join(dirname(C.WORKER_FILE)), ...C.MEDIA_SCRIPTS], { timeoutMs: 60_000 });
                  await C.podPut(run, p, tgz, '/workspace/media-scripts.tgz');
                } catch { /* optional */ }
                // DETACHED on the pod (pip + a ~3.7 GB verified fetch take minutes): the loop keeps feeding the other pods meanwhile
                await C.podSsh(run, p, 'cat > /workspace/bootstrap.sh && rm -f /workspace/boot.rc && (setsid nohup bash -c "bash /workspace/bootstrap.sh > /workspace/boot.log 2>&1; echo \\$? > /workspace/boot.rc" >/dev/null 2>&1 < /dev/null &) && echo spawned', { input: C.BOOTSTRAP, timeoutMs: 120_000 });
              }
              p.status = 'warming'; p.lastOk = now();
            } else if (now() - p.created > C.CLOUD.bootTimeoutMs) { await closePod(p, 'boot timeout'); st.pod_failures++; }
          } else if (p.status === 'warming') {
            const { stdout } = await C.podSsh(run, p, 'test -f /workspace/spool/.worker-ready && echo READY; [ -f /workspace/boot.rc ] && [ "$(cat /workspace/boot.rc)" != 0 ] && { echo BOOTFAIL; tail -c 400 /workspace/boot.log; }; tail -2 /workspace/worker.log 2>/dev/null; touch /workspace/spool/.tower-hb; true', { timeoutMs: 60_000 });
            p.lastOk = now();
            if (/READY/.test(stdout)) {
              // nvidia-smi can see a card CUDA cannot open (pod 342, 10-29: every job died "CUDA unknown error"): prove the GPU before it gets work
              const cu = await C.podSsh(run, p, C.CUDA_PROBE, { timeoutMs: 120_000 }).catch((e) => ({ stdout: String(e.message || e) }));
              if (/CUDA_OK/.test(cu.stdout || '')) { p.status = 'ready'; p.ready_at = now(); p.cuda_ok = true; }
              else { p.gpu_broken = true; p.boot_log = String(cu.stdout || '').slice(-300); st.last_error = `GPU unusable on ${p.name}: ${p.boot_log.slice(-160)}`; await closePod(p, 'GPU unusable: CUDA does not initialise'); st.pod_failures++; }
            }
            else if (/BOOTFAIL/.test(stdout)) { p.boot_log = stdout.slice(-400); st.last_error = `boot failed on ${p.name}: ${stdout.slice(-200)}`; await closePod(p, 'bootstrap failed'); st.pod_failures++; }
            else if (now() - p.created > C.CLOUD.warmTimeoutMs) { p.boot_log = stdout.slice(-400); await closePod(p, 'warm-up timeout'); st.pod_failures++; }
          } else if (p.status === 'ready') {
            if (!p.cuda_ok) {   // a pod made ready before the probe existed is proved once too
              const cu = await C.podSsh(run, p, C.CUDA_PROBE, { timeoutMs: 120_000 }).catch((e) => ({ stdout: String(e.message || e) }));
              if (/CUDA_OK/.test(cu.stdout || '')) p.cuda_ok = true;
              else { p.gpu_broken = true; p.boot_log = String(cu.stdout || '').slice(-300); st.last_error = `GPU unusable on ${p.name}: ${p.boot_log.slice(-160)}`; await closePod(p, 'GPU unusable: CUDA does not initialise'); st.pod_failures++; return; }
            }
            if(acceptedWorker&&!p.image)p.image=(await C.getPod(p.id,deps)).imageName||acceptedWorker.image;
            const staleImage=acceptedWorker&&p.image!==acceptedWorker.image&&p.id===imageDrainId;
            if(staleImage&&!Object.values(st.jobs).some(j=>j.pod===p.id)){await closePod(p,'accepted image updated; finished recordings drained');return;}
            const { stdout } = await C.podSsh(run, p, 'cd /workspace/spool 2>/dev/null && for d in */; do d=${d%/}; if [ -f "$d/done.json" ] || { [ -f "$d/result.json" ] && [ -f "$d/complete" ]; }; then echo "DONE $d"; fi; [ -f "$d/failed" ] && echo "FAIL $d"; [ -f "$d/ready" ] && echo "WAIT $d"; if [ -f "$d/ready" ] || [ -f "$d/running" ] || [ -f "$d/done.json" ] || [ -f "$d/complete" ]; then echo "STAGED $d"; else echo "PARTIAL $d"; fi; done; touch /workspace/spool/.tower-hb; echo UTIL $(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1); echo STATUS $(cat /workspace/spool/.worker-status.json 2>/dev/null); true', { timeoutMs: 60_000 });
            p.lastOk = now();
            const um = /UTIL (\d+)/.exec(stdout); if (um) utilBy[p.id] = Number(um[1]);
            const wm = /^STATUS (\{.*\})$/m.exec(stdout); if (wm) { try { const w = JSON.parse(wm[1]); if (w.at !== p.worker?.at || !p.worker_seen) p.worker_seen = now(); p.worker = { ...w, ready_jobs: (stdout.match(/^WAIT /gm) || []).length }; } catch { /* partial write */ } }
            // A live heartbeat is not progress: cached VRAM can strand a worker
            // with staged inputs and no active work indefinitely.
            const blocked = p.worker?.ready_jobs > 0 && p.worker.running === 0 && p.worker.cpu_jobs === 0 && p.worker.gpu_util < 5 && !/^DONE /m.test(stdout);
            if (blocked) p.admission_blocked_since ||= now(); else delete p.admission_blocked_since;
            if (p.admission_blocked_since && now() - p.admission_blocked_since > 5 * 60_000) {
              const gate = await C.podSsh(run, p, "pgrep -fc '^[^ ]*python[^ ]* .*media_tool.py' || true", { timeoutMs: 30_000 });
              if (Number(gate.stdout.trim()) !== 0) return;  // auxiliary jobs must finish before recycling this rental
              await closePod(p, 'admission stalled: staged inputs without active work for 5 min');
              return;
            }
            // a pod whose every talk fails is broken, whatever its heartbeat says: 3 failures in 15 min and nothing finished → drop it, its talks go back to the queue
            if ((p.worker?.failures_15m || 0) >= 3 && !st.done.some((d) => d.pod === p.name || d.pod === p.id)) { await closePod(p, 'jobs keep failing: 3 in 15 min, none finished'); st.pod_failures++; return; }
            // a worker that stopped (idled itself out, crashed, drained) leaves a pod that bills and takes jobs it will never run: replace it, its jobs go back to the queue
            if (p.worker_seen && now() - p.worker_seen > 240_000 && !stdout.includes('READY')) { p.dead_worker = true; }
            if (!wm && p.status === 'ready' && !p.worker_seen) p.worker_seen = now();   // the worker's live controller numbers (limit, VRAM, heat, state)
            const finishedJobs=new Set(stdout.split('\n').filter(l=>/^(DONE|FAIL) /.test(l)).map(l=>l.trim().split(' ')[1]));
            // keep the pod fed (one running, one waiting)
            // its own idle timer (10 min) is about to end it: no job is handed to a worker that is leaving
            let uploadsThisPass = 0;
            while (uploadsThisPass < 1 && Object.values(st.jobs).filter(j=>j.pod===p.id).length<2*C.CLOUD.perPod && !staleImage && !surplusPods.has(p.id) && !draining() && !rentalPause && !held && !(requireGate && !p.gate) && !(p.idle_since && now() - p.idle_since > 8 * 60_000) && Object.entries(st.jobs).filter(([id,j]) => j.pod === p.id&&!finishedJobs.has(id)).length < Math.min(acceptedWorker&&p.image!==acceptedWorker.image?2:(acceptedWorker?.max_inflight_per_pod||C.CLOUD.perPod), Math.max(1, Math.ceil((st.queue.length + Object.keys(st.jobs).length) / Math.max(1, live.filter((q) => q.status === 'ready').length)))) && st.queue.length) {   // a fair share: one pod never takes the whole queue while another waits
              let eligible=st.queue.findIndex(id=>st.items?.[id]?.kind!=='whole'||(!acceptedWorker?.hold_whole&&p.image===acceptedWorker?.image));
              if((p.whole_since_restore||0)>=2){const repair=st.queue.findIndex(id=>st.items?.[id]?.kind!=='whole'&&(st.items?.[id]?.mode||'restore')==='restore');if(repair>=0)eligible=repair;}
              if(eligible<0)break;
              const itemId = st.queue.splice(eligible,1)[0]; const tAssign = now();
              const it = await repo.getMediaItem(itemId);
              const m = it?.dir ? await readMeta(it.dir).catch(() => null) : null;
              const whole=st.items?.[itemId]?.kind==='whole';
              if (!whole&&decided(m,itemId)) continue;
              if (!m?.original) { st.failed.push({ id: itemId, slug: it?.slug, error: 'no original' }); continue; }
              const job = C.jobIdOf(it), src = join(it.dir, m.original), ext = (extname(src).slice(1) || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
              uploadsThisPass++;
              try {
              st.jobs[job]={itemId,slug:it.slug,pod:p.id,since:tAssign,status:'uploading',...(whole?{kind:'whole',input_sha:await (await import('../media/whole-result.js')).fileSha(src)}:{})};
              await save(st);
              await C.podSsh(run, p, `mkdir -p /workspace/spool/${job}`, { timeoutMs: 60_000 });
              await C.podPut(run, p, src, `/workspace/spool/${job}/in.${ext}.part`);
              await C.podSsh(run,p,`mv /workspace/spool/${job}/in.${ext}.part /workspace/spool/${job}/in.${ext}`,{timeoutMs:60000});
              if(whole){
                const W=await import('../media/whole-result.js'),sha=st.jobs[job].input_sha;
                await C.podSsh(run,p,`cat > /workspace/spool/${job}/job.json && touch /workspace/spool/${job}/ready`,{timeoutMs:60000,input:JSON.stringify({...W.wholeJob(it,m,sha),threads:Math.max(2,Math.min(6,Math.floor((p.cpu_count||16)/(p.max_jobs||6))))})});
                p.jobs_assigned=(p.jobs_assigned||0)+1;
                p.whole_since_restore=(p.whole_since_restore||0)+1;
                st.jobs[job]={itemId,slug:it.slug,pod:p.id,since:tAssign,uploaded_s:Math.round((now()-tAssign)/1000),kind:'whole',input_sha:sha};
                continue;
              }
              const work = await fs.readFile(join(it.dir, 'transcript.work.json'), 'utf8').then(JSON.parse).catch(() => null);
              // the rest of the remaster runs on the pod too (word guard, realign, 4 web encodes — scripts/media/worker/post.py); tower validates and publishes
              let post;
              if (work?.paragraphs?.length && m.enhancement && deps.podPost !== false) {
                const E = await import('../media/enhance.js'), PP = await import('../media/pod-post.js');
                const orig = (m.enhancement.variants || []).find((v) => v.name === 'original') || {};
                const raw = m.quality?.raw || {}, hum = Math.max(raw.hum50_db ?? 0, raw.hum60_db ?? 0) >= 10 ? ((raw.hum50_db ?? 0) >= (raw.hum60_db ?? 0) ? 50 : 60) : null;
                post = { mode: st.items?.[itemId]?.mode || 'restore', cleanup: !acceptedWorker, ...(acceptedWorker ? {assess_quality:true,trim:m.trim} : {}), bw_khz: raw.bandwidth_khz ?? null, hum_hz: hum, audio_s: m.duration_s || it.duration_s, af: E.safeChain(orig), max_fallback_pct: Number(process.env.MEDIA_REMASTER_MAX_FALLBACK_PCT) || 15, slug: m.slug || it.slug, work_sha: await PP.sha256File(join(it.dir, 'transcript.work.json')),
                  ogg: ['-ac', '1', '-ar', '48000', ...E.OGG_ARGS_REMASTER], m4a: ['-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', E.M4A_BITRATE_REMASTER, '-movflags', '+faststart'],
                  orig_ogg: ['-ac', '1', '-ar', '48000', ...E.OGG_ARGS], orig_m4a: ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart'] };
                if (post.mode === 'post') for (const [f, to] of [['unipase.cloud.flac', 'out.flac'], ['unipase.asr.json', 'asr.json'], ['unipase.asr_orig.json', 'asr_orig.json']]) { const lf = join(it.dir, 'enhanced', f); if (existsSync(lf)) await C.podPut(run, p, lf, `/workspace/spool/${job}/${to}`); }   // a result tower holds: the pod finishes it
                await C.podPut(run, p, join(it.dir, 'transcript.work.json'), `/workspace/spool/${job}/work.json`);
                if (post.mode === 'cleanup') await C.podPut(run, p, join(it.dir, 'transcript.raw.json'), `/workspace/spool/${job}/asr_orig.json`);   // the original's own transcript: the guard's reference
              }
              await C.podSsh(run, p, `cat > /workspace/spool/${job}/job.json && touch /workspace/spool/${job}/ready`, { timeoutMs: 60_000, input: JSON.stringify({ runs: languageRuns(work?.paragraphs || [], m.duration_s || it.duration_s), ...(post ? { post } : {}) }) });
              p.jobs_assigned = (p.jobs_assigned || 0) + 1;
              p.whole_since_restore=0;
              st.jobs[job] = { itemId, slug: it.slug, pod: p.id, since: tAssign, uploaded_s: Math.round((now() - tAssign) / 1000) };
              } catch(error){delete st.jobs[job];if(!st.queue.includes(itemId))st.queue.unshift(itemId);await save(st);throw error;}
            }
            let resultsThisPass = 0;
            for (const line of stdout.split('\n')) {
              const [kind, job] = line.trim().split(' ');
              const x = st.jobs[job];
              if (!x || x.pod !== p.id) continue;
              if(kind==='STAGED'&&x.status==='uploading'){x.status='assigned';continue;}
              if(kind==='PARTIAL'&&x.status==='uploading'){delete st.jobs[job];if(!st.queue.includes(x.itemId))st.queue.unshift(x.itemId);continue;}
              if ((kind === 'DONE' || kind === 'FAIL') && resultsThisPass++ >= 1) break;  // large result batches must not stall every other pod's next poll
              const it = await repo.getMediaItem(x.itemId);
              if (kind === 'DONE' && it?.dir) {
                if(x.kind==='whole'){
                  const m=await readMeta(it.dir);
                  const completed=await (await import('../media/cloud-recording.js')).takeCloudRecording({C,run,p,job,item:it,meta:m,inputSha:x.input_sha});
                  if(['whole_queued','scheduled','queued','running'].includes(it.state))await repo.updateMediaItem(it.id,{state:'transcribed',stage:null,stages_done:','+Object.keys(completed.stages).join(',')+','});
                  await C.podSsh(run,p,`rm -rf /workspace/spool/${job}`,{timeoutMs:60000});
                  delete st.jobs[job];p.jobs_done=(p.jobs_done||0)+1;st.proven=true;st.boot_fails=0;
                  st.done.push({id:it.id,slug:it.slug,mode:'whole',audio_s:m.duration_s,pod:p.name,at:now(),cycle_s:Math.round((now()-x.since)/1000)});
                  continue;
                }
                const fetchAt = now();
                let postSteps = null;
                const enh = join(it.dir, 'enhanced');
                await fs.mkdir(enh, { recursive: true });
                // when the worker finished guard + alignment + encodes the raw generative copy is not needed here (the guarded one is): skip ~200 MB per audio hour of downlink
                const finished = await C.podSsh(run, p, `test -f /workspace/spool/${job}/post.json && grep -q '"web"' /workspace/spool/${job}/post.json && echo FULL; true`, { timeoutMs: 60_000 }).then((r) => /FULL/.test(r.stdout)).catch(() => false);
                if (finished && !['cleanup', 'post'].includes(st.items?.[it.id]?.mode)) { await fs.writeFile(join(enh, 'unipase.cloud.flac'), ''); await fs.writeFile(join(enh, 'unipase.asr.json'), '{}'); }
                for (const [rf, lf, optional] of ((['cleanup', 'post'].includes(st.items?.[it.id]?.mode) || finished) ? [['done.json', 'unipase.done.json']] : [['out.flac', 'unipase.cloud.flac'], ['asr.json', 'unipase.asr.json'], ['asr_orig.json', 'unipase.asr_orig.json', true], ['done.json', 'unipase.done.json']])) {
                  try { await C.podGet(run, p, `/workspace/spool/${job}/${rf}`, join(enh, `${lf}.part`)); }
                  catch (err) { if (optional) { await fs.rm(join(enh, lf), { force: true }); continue; } throw err; }   // an older worker: no like-for-like reference
                  await fs.rename(join(enh, `${lf}.part`), join(enh, lf));
                }
                // the worker's guard / realign / encodes (best effort: anything missing is computed on tower)
                try {
                  const pd = join(enh, 'pod'); await fs.rm(pd, { recursive: true, force: true }); await fs.mkdir(join(pd, 'web'), { recursive: true });
                  await C.podGet(run, p, `/workspace/spool/${job}/post.json`, join(pd, 'post.json'));
                  const pj = JSON.parse(await fs.readFile(join(pd, 'post.json'), 'utf8'));
                  postSteps = pj.steps || null;
                  if (pj.guard) {
                    for (const f of ['unipase.flac', 'unipase.guard.json', ...(pj.realign ? ['realign.json'] : [])]) await C.podGet(run, p, `/workspace/spool/${job}/post/${f}`, join(pd, f));
                    for (const f of Object.values(pj.web || {})) await C.podGet(run, p, `/workspace/spool/${job}/post/${f}`, join(pd, 'web', f));
                    if (pj.waveform_file) await C.podGet(run, p, `/workspace/spool/${job}/post/${pj.waveform_file}`, join(pd, pj.waveform_file));
                  }
                } catch { await fs.rm(join(enh, 'pod'), { recursive: true, force: true }).catch(() => {}); }
                const dj = JSON.parse(await fs.readFile(join(enh, 'unipase.done.json'), 'utf8'));
                dj.pod = p.name; dj.cost_per_hr = p.costPerHr;
                await fs.writeFile(join(enh, 'unipase.done.json'), JSON.stringify(dj));
                await C.podSsh(run, p, `rm -rf /workspace/spool/${job}`, { timeoutMs: 60_000 }).catch(() => {});
                delete st.jobs[job];
                p.jobs_done = (p.jobs_done || 0) + 1; st.boot_fails = 0; st.proven = true;   // a pod that finished a talk proves the pool
                const imode = st.items?.[it.id]?.mode || 'restore';
                if (st.done.some((d) => d.id === it.id && (d.mode || 'restore') === imode)) continue;   // idempotent: a second result for a talk never queues a second run
                st.done.push({ id: it.id, slug: it.slug, audio_s: dj.audio_s, seconds: dj.seconds, gpu: dj.gpu, pod: p.name, mode: imode, cycle_s: Math.round((now() - x.since) / 1000), upload_s: x.uploaded_s, pod_s: dj.seconds, post_s: dj.post_s ?? null, download_s: Math.round((now() - fetchAt) / 1000), post_steps: postSteps, at: now() });
                // a 'post' result for a talk tower has already finished itself is stale: drop it; otherwise tower's queued run takes it in seconds
                const mt = await readMeta(it.dir).catch(() => null);
                if (imode === 'post' && !st.items?.[it.id]?.redo && ['done', 'review'].includes(mt?.remaster?.status)) { await fs.rm(join(enh, 'pod'), { recursive: true, force: true }).catch(() => {}); continue; }
                await queue('media-remaster', { id: it.id }, 'media-cloud-remaster');   // tower takes the finished result (seconds); an identical queued run is not doubled
              } else if (kind === 'FAIL') {
                const err = await C.podSsh(run, p, `for f in error.txt worker.log post.error.txt; do [ ! -f /workspace/spool/${job}/$f ] || tail -c 2000 /workspace/spool/${job}/$f; done; true`, { timeoutMs: 60_000 }).then((r) => r.stdout).catch(() => '');
                delete st.jobs[job];
                st.attempts[x.itemId] = (st.attempts[x.itemId] || 0) + 1;
                st.last_job_error = `${x.slug}: ${err.slice(-1500)}`;
                (st.failure_log||=[]).push({at:now(),id:x.itemId,pod:p.name,error:err.slice(-2000)});st.failure_log=st.failure_log.slice(-30);
                await C.podSsh(run,p,`mkdir -p /workspace/failed-jobs; mv /workspace/spool/${job} /workspace/failed-jobs/${job}-${now()}`,{timeoutMs:60000});
                if (st.attempts[x.itemId] < 2) st.queue.push(x.itemId); else {
                  st.failed.push({ id: x.itemId, slug: x.slug, error: err.slice(-300) });
                  if(x.kind==='whole')await repo.updateMediaItem(x.itemId,{state:'failed',why:err.slice(-500)});
                }
              }
            }
            if (surplusPods.has(p.id) && !Object.values(st.jobs).some(j => j.pod === p.id)) await closePod(p, `pool reduced to ${maxPods}`);
          }
        } catch (err) {
          if(err.code==='DRAIN')return;
          p.last_error = String(err.message).slice(0, 300);
          if (now() - (p.lastOk || p.created) > (p.status === 'ready' ? C.CLOUD.deadAfterMs : C.CLOUD.bootTimeoutMs)) { await closePod(p, `unreachable: ${p.last_error}`); if (p.status !== 'ready') st.pod_failures++; }
        }
      }));
      for (const p of Object.values(st.pods).filter((q) => !q.terminated && q.dead_worker)) { await closePod(p, `worker stopped (no status for ${Math.round((now() - p.worker_seen) / 60_000)} min)`); st.pod_failures = Math.max(0, st.pod_failures); }
      // the READY, baked pods join the worker pool (pool.js): prep / probe / grade / dfn / encodes may use them as hosts of the same gate
      try {
        const P = await import('../media/pool.js');
        const ready = Object.values(st.pods).filter((q) => !acceptedWorker && !rentalPause && !q.terminated && q.status === 'ready' && q.baked && q.gate && q.ip && q.port && !q.dead_worker && !(q.idle_since && now() - q.idle_since > 8 * 60_000));
        const sig = ready.map((q) => `${P.podName(q)}@${q.ip}:${q.port}`).sort().join(',');
        if (sig !== st.pool_sig) { P.publishPool(ready.map((q) => ({ host: P.podName(q), ip: q.ip, port: q.port }))); st.pool_sig = sig; }
      } catch (err) { st.pool_error = String(err.message).slice(0, 160); }
      // the LEDGER (rented vs busy minutes, $ rented vs $ productive) and the lane's own idle rule; pod-reaper.js is the independent second path
      L.ledgerTick(st, Object.values(st.pods).filter((q) => !q.terminated), utilBy, now());
      for (const p of Object.values(st.pods).filter((q) => !q.terminated && q.idle_since && now() - q.idle_since > L.LEDGER.idleMs)) await closePod(p, `idle ${Math.round((now() - p.idle_since) / 60_000)} min`);
      // a pod from an older image (no gate: it cannot be a prep / encode host) is retired once its own jobs are done
      if (requireGate) for (const p of Object.values(st.pods).filter((q) => !q.terminated && q.status === 'ready' && !q.gate)) if (!Object.values(st.jobs).some((j) => j.pod === p.id)) await closePod(p, 'retired: image without the gate');
      // an idle pod (nothing left to give it) is terminated at once
      if (!st.queue.length) for (const p of Object.values(st.pods).filter((q) => !q.terminated && q.status === 'ready')) if (!Object.values(st.jobs).some((j) => j.pod === p.id)) await closePod(p, 'queue empty');
      st.spent_usd = C.spendOf(st, now()); st.updated = now();
      await save(st);
      await nap(tickMs);
    }
  } finally {
    clearInterval(hb); clearInterval(pump);
    try { (await import('../media/pool.js')).publishPool([]); st.pool_sig = ''; } catch { /* no pool file */ }   // the lane is ending: its pods leave the pool
    // the queue is done, the budget is spent or something failed: NO pod is left running (a drain leaves them working)
    if (!yielded) for (const p of Object.values(st.pods).filter((q) => !q.terminated)) await closePod(p, stop || 'finished');
    st.spent_usd = C.spendOf(st, now()); st.updated = now();
    if (!yielded && !st.queue.length && !Object.keys(st.jobs).length) st.finished = now();
    await save(st);
  }
  const audioH = st.done.reduce((a, d) => a + (d.audio_s || 0), 0) / 3600;
  const summary = { done: st.done.length, failed: st.failed.length, queue: st.queue.length, in_flight: Object.keys(st.jobs).length, spent_usd: st.spent_usd,
    usd_per_audio_hour: audioH ? Math.round((st.spent_usd / audioH) * 100) / 100 : null, home_done: st.home_done, cloud_stopped: st.cloud_stopped || null, audio_hours: Math.round(audioH * 10) / 10, stop, pods: Object.values(st.pods).map((p) => ({ name: p.name, gpu: p.gpu, cost_per_hr: p.costPerHr, status: p.terminated ? `terminated (${p.why})` : p.status })) };
  return yielded ? { ...summary, yielded: true, resume: { write: true, maxPods: requestedMaxPods } } : summary;
}

/** media-preview { fingerprint?, text, windows?, title?, duration_s }: Dewey compares separate transcript samples; a lone opening match is review only. */
export async function mediaPreviewJob(params = {}, deps = {}) { return (deps.preview || await import('../media/preview.js')).previewVerdict(params, deps); }

/** THE LANE KEEPER (10-25: the cloud lane stayed down for hours after a restart — the run had ended on a sticky money stop and nothing
 *  queued a new one). One pass: if the state file says work is waiting (queue or jobs, not finished) and no media-cloud-remaster run is
 *  queued or running, queue one — unless the money says stop (re-evaluated: a topped-up balance or a raised cap clears it). Runs every minute
 *  in the media service. → { action: 'queued' | 'running' | 'idle' | 'money' | 'breaker', ... } */
export async function laneKeeperPass(deps = {}) {
  const C = deps.cloud || await import('../media/cloud.js');
  const rentalPause = await C.rentalPauseReason?.();
  if (rentalPause) return { action: 'paused', why: rentalPause };
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const st = deps.state !== undefined ? deps.state : await C.loadState(deps.stateFile);
  const now = (deps.now || Date.now)();
  if (!st?.started || st.finished || !((st.queue || []).length || Object.keys(st.jobs || {}).length)) return { action: 'idle' };
  const pending = await ops.pendingRuns('media-cloud-remaster');
  if (pending.length) return { action: 'running', runs: pending.map((r) => r.id) };
  if (st.cloud_stopped && /^(cap|account balance|the next 10 min)/.test(st.cloud_stopped)) {
    const bal = deps.balance !== undefined ? deps.balance : (await C.accountBalance(deps).catch(() => ({ balance: null }))).balance;
    if (C.budgetStop(st, bal, now)) return { action: 'money', why: st.cloud_stopped };
  }
  await queue('media-cloud-remaster', { write: true, maxPods: deps.maxPods ?? 3, resume: (st.resumes || 0) + 1 }, 'lane-keeper');
  return { action: 'queued' };
}

/** The lane's queue order (stable within each band): FIRST talks (Chad 10-29: taken off the air, reverted for splicing — ahead of
 *  everything, whatever their mode), then whole imports, then fresh talks, then 'post' work (its upload is five times the bytes). */
export function laneOrder(queue, items = {}) {
  const band = (id) => (items?.[id]?.first ? 0 : items?.[id]?.kind === 'whole' ? 1 : items?.[id]?.mode === 'post' ? 3 : 2);
  return queue.map((id, i) => [band(id), i, id]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

/** media-cloud-order { mode: 'cleanup' | 'post', ids?, limit? }: put work on the cloud lane without restarting it (orders are taken in on its next tick).
 *  cleanup: talks the word guard held (review / kept / deferred) get the deterministic cleanup on a worker. post: results tower holds in its own
 *  media-remaster queue (a pod's copy is already on disk) get their guard, alignment and encodes done on a worker instead — oldest queued first. */
export async function mediaCloudOrderJob({ mode = 'post', ids = null, limit = 60, redo = false, grades = null, first = false } = {}, deps = {}) {
  const C = deps.cloud || await import('../media/cloud.js');
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const fs = await import('fs/promises');
  const readMeta = deps.readMeta || (async (dir) => JSON.parse(await fs.readFile(join(dir, 'meta.json'), 'utf8')));
  let list;
  if (mode === 'backfill') {
    // the grade D/E / C / B talks that still have only the basic cleanup, WORST FIRST (bandwidth, then SNR): the home hosts take them in this order
    const want = String(grades || 'D,E').split(',').map((g) => g.trim().toUpperCase());
    const cands = [];
    for (const it of await repo.remasterCandidates(want)) {
      if (!it?.dir) continue;
      const m = await readMeta(it.dir).catch(() => null);
      if (!m?.original || ['done', 'review', 'kept', 'deferred'].includes(m.remaster?.status) || m.remaster_tier === 'heavy') continue;
      const raw = m.quality?.raw || {};
      cands.push({ id: it.id, slug: it.slug, grade: m.quality?.overall || it.grade || null, bw: raw.bandwidth_khz ?? null, snr: raw.snr_db ?? null, duration_s: it.duration_s || m.duration_s || 0 });
    }
    const ordered = worstFirst(cands).slice(0, limit);
    await C.addOrders(ordered.map((x) => ({ id: x.id, slug: x.slug, grade: x.grade, duration_s: x.duration_s, mode: 'restore' })), deps.ordersFile);
    return { mode, ordered: ordered.length, grades: want, hours: Math.round(ordered.reduce((a, x) => a + x.duration_s, 0) / 360) / 10, sample: ordered.slice(0, 5).map((x) => `${x.grade} ${x.bw ?? '?'}kHz ${x.slug}`) };
  }
  if (ids) list = (await Promise.all([].concat(ids).map((x) => (/^\d+$/.test(String(x)) ? repo.getMediaItem(Number(x)) : repo.getMediaBySlug(String(x)))))).filter(Boolean);
  else if (mode === 'post') {
    const pending = (await ops.pendingRuns('media-remaster')).filter((r) => r.status === 'queued').map((r) => Number(r.params?.id)).filter(Boolean);
    list = (await Promise.all([...new Set(pending)].map((id) => repo.getMediaItem(id)))).filter(Boolean);
  } else list = await repo.remasterCandidates(['B', 'C', 'D', 'E']);
  const orders = [], noCopy = [];
  for (const it of list) {
    if (orders.length >= limit) break;
    if (!it?.dir) continue;
    const m = await readMeta(it.dir).catch(() => null);
    if (!m) continue;
    const has = await fs.stat(join(it.dir,'enhanced/unipase.cloud.flac')).then(s=>s.size>1024).catch(()=>false) && await fs.stat(join(it.dir,'enhanced/unipase.asr.json')).then(s=>s.size>10).catch(()=>false);
    const held = ['review', 'kept', 'deferred'].includes(m.remaster?.status);
    if (mode === 'restore' && !ids) continue;   // a redo is always explicit: the ids Chad / the agent names
    if (mode === 'post' && !has) noCopy.push(it.slug);   // the restored copy is not on tower: only a full restore redo can re-assess it
    if (mode === 'post' && (!has || (!redo && (['done', 'review', 'kept', 'deferred'].includes(m.remaster?.status) || existsSync(join(it.dir, 'enhanced', 'pod', 'post.json')))))) continue;
    if (mode === 'cleanup' && (!held || m.remaster?.method === 'cleaned')) continue;
    orders.push({ id: it.id, slug: it.slug, grade: m.quality?.overall || it.grade || null, duration_s: it.duration_s || m.duration_s || 0, mode, ...((mode === 'restore'||redo) ? { redo: true } : {}), ...(first ? { first: true } : {}) });
  }
  await C.addOrders(orders, deps.ordersFile);
  return { mode, ordered: orders.length, sample: orders.slice(0, 5).map((o) => o.slug), ...(noCopy.length ? { no_copy: noCopy } : {}) };
}

/** media-light-backfill { limit?, write? }: the LIGHT tier for every published talk that has no kept original yet (Chad 10-24: every talk has a
 *  restored version and an untouched original). The restored copy is the one already playing (the deterministic safe chain: high-pass, hum
 *  notch, loudness — linear, cannot change a word); this adds the RAW source encoded to Opus + m4a with no processing (the "Original" button),
 *  stamps meta.remaster_tier = 'light' and bumps meta.version. Encodes run on boss (encodeRemote), never on tower: when boss has no free slot the
 *  talk simply waits for the next pass. A few talks per pass, low priority. → { done, waiting, skipped } */
export async function mediaLightBackfillJob({ limit = 3, write = true } = {}, deps = {}) {
  const draining = deps.draining || (await import('../drain.js')).isDraining;
  const repo = deps.repo || await import('../repos/media-repo.js');
  const T = deps.tools || await import('../media/tools.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const fs = await import('fs/promises');
  const busy = new Set((await Promise.all(['media-item', 'media-remaster', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n).catch(() => [])))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { done: [], waiting: [], skipped: 0, remaining: 0 };
  for (const it of await repo.remasterCandidates(['A', 'B', 'C'])) {
    if (draining()) break;
    if (!it.dir || busy.has(it.id)) { out.skipped++; continue; }
    const mf = join(it.dir, 'meta.json');
    const m = JSON.parse(await fs.readFile(mf, 'utf8').catch(() => 'null'));
    if (!m?.original || m.web_original || m.remaster_tier || m.enhancement?.listening === 'unipase' || !m.slug) { out.skipped++; continue; }
    out.remaining++;
    if (!write || out.done.length >= limit) continue;
    const src = join(it.dir, m.original), web = join(it.dir, 'web');
    await fs.mkdir(web, { recursive: true });
    const ogg = join(web, `${m.slug}.original.ogg`), m4a = join(web, `${m.slug}.original.m4a`);
    const refuse = () => { throw new Error('no free encode host: not on tower'); };
    try {
      await Promise.all([T.encodeRemote('ogg', src, ogg, { af: '', job: `${m.slug}-lo-ogg`.slice(0, 110), local: refuse, stop: draining }), T.encodeRemote('m4a', src, m4a, { af: '', job: `${m.slug}-lo-m4a`.slice(0, 110), local: refuse, stop: draining })]);
    } catch (err) { if (err.code === 'DRAIN') break; out.waiting.push(`${m.slug}: ${String(err.message).slice(0, 80)}`); continue; }
    const fresh = JSON.parse(await fs.readFile(mf, 'utf8').catch(() => 'null'));
    if (!fresh || fresh.web_original || fresh.original !== m.original) continue;   // a run changed the talk meanwhile
    fresh.web_original = { ogg: `web/${m.slug}.original.ogg`, m4a: `web/${m.slug}.original.m4a` };
    fresh.remaster_tier = 'light'; fresh.version = (fresh.version || 1) + 1;
    fresh.audio_version = fresh.version;
    const Q = deps.quality || await import('../media/remaster-quality.js');
    fresh.qa = { ...(fresh.qa || {}), remaster: Q.qualityOf(fresh) };
    await fs.writeFile(mf, JSON.stringify(fresh, null, 2));
    out.done.push(m.slug);
  }
  return out;
}

/** media-remaster-quality { write? }: the per-talk remaster verdict (api/lib/media/remaster-quality.js) over every B–E talk — counts by verdict
 *  and grade, the review + unrepairable lists. write: stamps meta.qa.remaster, saves data/run/remaster-quality.json (/ops/services) and
 *  data/run/remaster-deferred.md (the archive candidates). */
export async function mediaRemasterQualityJob({ write = false } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const Q = deps.quality || await import('../media/remaster-quality.js');
  const fs = await import('fs/promises');
  const rows = [];
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const busy = new Set((await Promise.all(['media-item', 'media-remaster', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n).catch(() => [])))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  for (const it of await repo.remasterCandidates(['B', 'C', 'D', 'E'])) {
    const mf = it.dir ? join(it.dir, 'meta.json') : null;
    const m = mf ? JSON.parse(await fs.readFile(mf, 'utf8').catch(() => 'null')) : null;
    if (!m) continue;
    const qa = Q.qualityOf(m);
    let stored = !!m.qa?.remaster;
    // stamp meta.qa.remaster on talks that have none (the ~110 done before verdicts existed) — never while a media run on the talk is queued or
    // running (that run rewrites meta.json), and re-read just before the write
    if (write && (m.qa?.remaster?.verdict !== qa.verdict || m.qa?.remaster?.reason !== qa.reason) && !busy.has(it.id)) {
      const fresh = JSON.parse(await fs.readFile(mf, 'utf8').catch(() => 'null'));
      if (fresh && JSON.stringify(fresh.remaster) === JSON.stringify(m.remaster)) { fresh.qa = { ...(fresh.qa || {}), remaster: qa }; await fs.writeFile(mf, JSON.stringify(fresh, null, 2)); stored = true; }
    }
    rows.push({ slug: it.slug, title: m.title || it.slug, speaker: m.speaker || null, year: m.year || null, at: m.remaster?.at || null, hours: (it.duration_s || m.duration_s || 0) / 3600, grade: qa.metrics.grade || it.grade, qa, stored, published_remaster: m.enhancement?.listening === 'unipase' });
  }
  const sum = Q.summarize(rows);
  sum.recent = rows.filter((x) => ['usable', 'partial'].includes(x.qa.verdict) && x.published_remaster && x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30).map((x) => ({ slug: x.slug, title: x.title, speaker: x.speaker, year: x.year, hours: Math.round(x.hours * 100) / 100 }));
  if (write) {
    const dir = deps.dir || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'run');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'remaster-quality.json'), JSON.stringify(sum));
    await fs.writeFile(join(dir, 'remaster-deferred.md'), Q.deferredMarkdown(sum));
  }
  return sum;
}

/** media-trim-audit { write, ids? }: the leading/trailing silence and dead gaps of each published talk (trim.js plan from
 *  its words + waveform). write: an ['trim', 'update'] re-run where the lead or tail is ≥ 5 s or a gap is marked (busy
 *  talks skipped). → the distribution (talks, minutes trimmed, the longest leads) */
export async function mediaTrimAuditJob({ write = false, ids = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const queue = deps.queue || enqueue;
  const T = await import('../media/trim.js');
  const { flattenWords } = await import('../media/paragraphs.js');
  const rd = deps.readJson || (async (f) => JSON.parse(await (await import('fs/promises')).readFile(f, 'utf8')));
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr', 'media-diar'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { talks: 0, to_trim: 0, lead_min: 0, tail_min: 0, gaps: 0, buckets: { '<5s': 0, '5-30s': 0, '30-120s': 0, '2-10min': 0, '>10min': 0 }, longest: [], queued: 0, skipped_busy: [] };
  const rows = [];
  for (const id of ids || await repo.doneItemIds()) {
    const it = await repo.getMediaItem(id);
    if (!it?.dir) continue;
    const meta = await rd(join(it.dir, 'meta.json')).catch(() => null);
    const raw = await rd(join(it.dir, 'transcript.raw.json')).catch(() => null);
    if (!meta || !raw) continue;
    const { peaks, pps } = T.peaksOf(await rd(join(it.dir, 'waveform.json')).catch(() => null));
    const plan = T.trimPlan({ words: flattenWords(raw.segments || []), peaks, pps, duration: meta.duration_s });
    out.talks++;
    const lead = plan.start_s || 0, tail = plan.end_s != null ? meta.duration_s - plan.end_s : 0;
    const b = lead < 5 ? '<5s' : lead < 30 ? '5-30s' : lead < 120 ? '30-120s' : lead < 600 ? '2-10min' : '>10min';
    out.buckets[b]++;
    out.lead_min += lead / 60; out.tail_min += tail / 60; out.gaps += plan.gaps.length;
    rows.push({ slug: it.slug, lead_s: Math.round(lead * 10) / 10, tail_s: Math.round(tail * 10) / 10, gaps: plan.gaps.length, first_word_s: plan.lead_s });
    // the backfill re-encodes only where the LEADING silence is ≥ 5 s (Chad 10-23); new talks get the full trim in the pipeline
    if (!(lead > 0)) continue;
    out.to_trim++;
    if (!write) continue;
    if (busy.has(it.id)) { out.skipped_busy.push(it.slug); continue; }
    await queue('media-item', { id: it.id, redo: ['trim', 'update'] }, 'media-trim-audit'); out.queued++;
  }
  out.lead_min = Math.round(out.lead_min * 10) / 10; out.tail_min = Math.round(out.tail_min * 10) / 10;
  out.longest = rows.sort((a, b) => b.lead_s - a.lead_s).slice(0, 15);
  return out;
}
