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
  const next = (await pendingMedia(batch + 200)).filter((i) => i.state === 'queued' && !(cooling && i.source_kind === 'youtube')).slice(0, batch);
  for (const it of next) { await updateMediaItem(it.id, { state: 'scheduled' }); await queue('media-item', { id: it.id }, by); out.queued.push(it.id); }
  const remaining = (await pendingMedia(5000)).filter((i) => i.state === 'queued' && !(cooling && i.source_kind === 'youtube')).length;
  if (remaining > 0 && batch > 0) await queue('media-scan', { batch, round: round + 1, queueOnly: true }, by);
  await logActivity('media', `media scan round ${round}: ${out.added.length} added, ${out.held.length} held, ${out.queued.length} queued, ${remaining} waiting`).catch(() => {});
  return { ...out, remaining };
}

export async function mediaItemJob({ id, from = null, only = null, threads = null, lang = null, model = null, reslug = false, force = false, stage = null } = {}, deps = {}) {
  let item = await getMediaItem(id);
  if (!item) throw new Error(`media item ${id} not found`);
  // a RESUMED run (a drain saved { stage } into its params) continues where it stopped: its `from` / `reslug` were done on
  // the first start and must not run again (10-22: a `from: web` run redid web on every resume; a reslug would have
  // deleted its own new folder)
  if (stage) { from = null; reslug = false; }
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
    const r = await runItem(item, { from, only, threads, lang, model });
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
    await updateMediaItem(id, { state: 'failed', why: String(err.message).slice(0, 500) }).catch(() => {});
    throw err;
  }
}

export async function mediaVocabJob({ minMentions = 8, limit = 6000, file = process.env.MEDIA_VOCAB_FILE || join(process.cwd(), 'data', 'media-vocab.json') } = {}) {
  const rows = await vocabularyNames({ minMentions, limit });
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
