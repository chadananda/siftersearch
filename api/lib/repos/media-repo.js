// media-repo — the media library catalogue (media_items, media_channels; migration 163). The per-item folder's meta.json
// is the source of truth; these rows are what the /media listing filters and what the pipeline's state machine records.
// Writes go through the single writer (transaction). Callers: routes/media.js, ops/media-jobs.js. Deps: db.js.
import { queryAll, queryOne, transaction } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';
import { approvedSpeakerLabel, canonicalSpeakerKey, speakerDecisions } from '../media/speaker-decisions.js';

const now = () => new Date().toISOString();
const parse = (r) => r && { ...r, has_video: !!r.has_video, meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return null; } })() : null };
const COLS = new Set(['stages_done', 'published_at', 'queue_rank', 'audience', 'grade', 'primary_issue', 'chain_key', 'priority', 'speaker_key', 'slug', 'title', 'speaker', 'tradition', 'collection', 'language', 'year', 'date', 'duration_s', 'has_video', 'source_kind', 'source_ref',
  'sha256', 'youtube_id', 'channel', 'playback', 'stage', 'state', 'why', 'dir', 'doc_id', 'thumb', 'quotes_n', 'crs_n', 'words_n', 'asr_conf', 'cost_usd', 'meta', 'restored', 'stages_missing', 'next_stage', 'verdict', 'in_quality', 'out_quality', 'in_bw_khz', 'out_bw_khz', 'completed_at']);

export async function createMediaItem({ source_kind, source_ref, sha256 = null, youtube_id = null, channel = null, tradition = null, collection = null, state = 'queued', why = null }) {
  const at = now();
  await transaction([{ sql: `INSERT INTO media_items (source_kind, source_ref, sha256, youtube_id, channel, tradition, collection, state, why, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [source_kind, source_ref, sha256, youtube_id, channel, tradition, collection, state, why, at, at] }], 'media:create');
  return parse(await queryOne('SELECT * FROM media_items WHERE source_ref = ? ORDER BY id DESC LIMIT 1', [source_ref], 'media:created'));
}

export const getMediaItem = async (id) => parse(await queryOne('SELECT * FROM media_items WHERE id = ?', [Number(id)], 'media:get'));
export const getMediaBySlug = async (slug) => parse(await queryOne('SELECT * FROM media_items WHERE slug = ?', [String(slug)], 'media:by-slug'));
export const findMediaBySha = async (sha) => parse(await queryOne('SELECT * FROM media_items WHERE sha256 = ? ORDER BY id LIMIT 1', [String(sha)], 'media:by-sha'));
export const findMediaByYoutube = async (id) => parse(await queryOne('SELECT * FROM media_items WHERE youtube_id = ? ORDER BY id LIMIT 1', [String(id)], 'media:by-youtube'));
export const findMediaBySource = async (ref) => parse(await queryOne('SELECT * FROM media_items WHERE source_ref = ? ORDER BY id LIMIT 1', [String(ref)], 'media:by-source'));
export const slugTaken = async (slug) => !!(await queryOne('SELECT 1 x FROM media_items WHERE slug = ?', [String(slug)], 'media:slug-taken'));
export const mediaByDocIds = async (ids) => (ids.length ? (await queryAll(`SELECT * FROM media_items WHERE doc_id IN (${ids.map(() => '?').join(',')})`, ids.map(Number), 'media:by-docs')).map(parse) : []);

/** Point a talk at a new source file (media-supersede): source_ref + sha256 (+ duration) change in ONE guarded UPDATE — only while the
 *  row still holds `expect_sha256` (a second supersede racing the first changes nothing). meta.json stays the file's business. → the row. */
export async function supersedeMediaSource(id, { source_ref, sha256, duration_s = null, expect_sha256 = null }) {
  if (!source_ref || !sha256) throw new Error('supersedeMediaSource needs source_ref and sha256');
  const at = now();
  await transaction([{ sql: `UPDATE media_items SET source_ref = ?, sha256 = ?, duration_s = COALESCE(?, duration_s), updated_at = ? WHERE id = ? AND (sha256 IS ? OR sha256 = ? OR sha256 = ?)`,
    args: [source_ref, sha256, duration_s, at, Number(id), expect_sha256, expect_sha256, sha256] }], 'media:supersede-source');
  const row = await getMediaItem(id);
  if (row?.sha256 !== sha256) throw new Error(`media item ${id} changed under the supersede (sha256 is ${row?.sha256?.slice(0, 12)})`);
  return row;
}

/** Change fields (unknown keys are ignored; meta is JSON). */
export async function updateMediaItem(id, fields = {}) {
  const set = Object.fromEntries(Object.entries(fields).filter(([k]) => COLS.has(k)));
  const approved = set.speaker !== undefined ? approvedSpeakerLabel(set.speaker) : null;
  if (approved) { set.speaker = approved.name; set.speaker_key = approved.key; }
  else if (set.speaker_key) set.speaker_key = canonicalSpeakerKey(set.speaker_key);
  if (set.meta !== undefined && typeof set.meta !== 'string') set.meta = JSON.stringify(set.meta);
  if (set.has_video !== undefined) set.has_video = set.has_video ? 1 : 0;
  set.updated_at = now();
  const keys = Object.keys(set);
  // an EXCLUDED talk stays excluded (10-23: a lane finishing its run would otherwise set it back to prepped / done)
  const col = (k) => (k === 'state' ? `state = CASE WHEN state = 'excluded' THEN 'excluded' ELSE ? END` : `${k} = ?`);
  await transaction([{ sql: `UPDATE media_items SET ${keys.map(col).join(', ')} WHERE id = ?`, args: [...keys.map((k) => set[k]), Number(id)] }], 'media:update');
  return getMediaItem(id);
}

/** Archived file talks (folder + source), id order, a page after `afterId` — for the tag-hint backfill and review. */
/** Items whose source path/URL contains `like` (a bounded lookup for operators, ≤ 20). */
export const mediaBySourceLike = (like, limit = 20) => queryAll('SELECT id, slug, state, stage, queue_rank, speaker, title, source_ref, updated_at, sha256, why FROM media_items WHERE source_ref LIKE ? ORDER BY id LIMIT ?', [`%${String(like).replace(/[%_]/g, '')}%`, Math.min(20, Number(limit) || 20)], 'media:by-source-like');
export const hintItems = async ({ afterId = 0, limit = 25 } = {}) => queryAll(`SELECT id, slug, dir, state, source_ref FROM media_items
  WHERE dir IS NOT NULL AND source_kind = 'file' AND state NOT IN ('duplicate', 'excluded') AND id > ? ORDER BY id LIMIT ?`, [Number(afterId) || 0, Math.max(1, Math.min(500, Number(limit) || 25))], 'media:hint-items');

/** Published talks the remaster backfill may take (Chad 10-23: graded B or worse), best first. */
export const remasterCandidates = async (grades = ['B', 'C', 'D', 'E']) => queryAll(`SELECT id, slug, dir, duration_s, grade FROM media_items
  WHERE state = 'done' AND grade IN (${grades.map(() => '?').join(',')}) ORDER BY COALESCE(priority, -1) DESC, id`, grades, 'media:remaster-candidates');
/** Every catalogue row not yet excluded, with what the exclusion rules match on. */
export const exclusionCandidates = async () => queryAll(`SELECT id, slug, title, speaker, speaker_key, state, doc_id, dir, source_kind, source_ref, youtube_id
  FROM media_items WHERE state != 'excluded' ORDER BY id`, [], 'media:exclusion-candidates');
/** Take talks out of the library for good: state 'excluded' (no lane picks it, no listing shows it), the reason kept. */
export async function excludeItems(ids = [], why) {
  for (let i = 0; i < ids.length; i += 200) {
    await transaction(ids.slice(i, i + 200).map((id) => ({ sql: `UPDATE media_items SET state = 'excluded', why = ?, queue_rank = NULL, updated_at = ? WHERE id = ?`, args: [String(why).slice(0, 500), now(), Number(id)] })), 'media:exclude');
  }
  return ids.length;
}

/** Undo excludeItems for talks hidden on purpose (media-restore): an EXCLUDED row goes back to `state` (default 'done'). → how many */
export async function restoreItems(ids = [], state = 'done') {
  await transaction(ids.map((id) => ({ sql: `UPDATE media_items SET state = ?, why = NULL, updated_at = ? WHERE id = ? AND state = 'excluded'`, args: [state, now(), Number(id)] })), 'media:restore');
  return ids.length;
}
/** Slugs → rows (any state), for the restore job. */
export async function itemsBySlugs(slugs = []) {
  if (!slugs.length) return [];
  return queryAll(`SELECT id, slug, title, state, doc_id FROM media_items WHERE slug IN (${slugs.map(() => '?').join(',')})`, slugs, 'media:by-slugs');
}

/** YouTube items held by a bot check / rate limit within the last `hours` (the cool-down before any YouTube work). */
export const youtubeHeldSince = async (hours) => (await queryOne(`SELECT COUNT(*) n, MAX(updated_at) last FROM media_items WHERE source_kind = 'youtube' AND state = 'held'
  AND updated_at >= ?`, [new Date(Date.now() - hours * 3600_000).toISOString()], 'media:youtube-held'));

/** Held YouTube items whose cool-down has passed → queued again (one polite retry per cool-down). → how many */
export async function releaseHeldYoutube(hours) {
  const before = new Date(Date.now() - hours * 3600_000).toISOString();
  const r = await queryOne(`SELECT COUNT(*) n FROM media_items WHERE source_kind = 'youtube' AND state = 'held' AND updated_at < ?`, [before], 'media:held-count');
  if (r?.n) await transaction([{ sql: `UPDATE media_items SET state = 'queued', updated_at = ? WHERE source_kind = 'youtube' AND state = 'held' AND updated_at < ?`, args: [now(), before] }], 'media:release-held');
  return r?.n || 0;
}

/** Items still to process (queued, or interrupted while running), oldest first. */
export const pendingMedia = async (limit = 10) => (await queryAll(`SELECT * FROM media_items WHERE state IN ('queued', 'running') ORDER BY COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:pending')).map(parse);
/** The next items to PROCESS, by rank: queued, and (a YouTube item) already downloaded — downloads have their own lane. */
const COMPUTE = ['archive', 'grade', 'enhance', 'web', 'transcribe', 'diarize', 'trim'];
// an item already part-way through (a retry, a resumed run) goes first: it holds files and finished stages
export const nextToProcess = async (limit = 3) => (await queryAll(`SELECT * FROM media_items WHERE state = 'queued' AND (source_kind != 'youtube' OR dir IS NOT NULL)
  ORDER BY CASE WHEN stage IS NOT NULL AND stage != 'archive' THEN 0 ELSE 1 END, COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:next')).map(parse);
/** Items PREPPED (archive … web done), waiting for an ASR slot; part-way first, then by rank. */
export const nextPrepped = async (limit = 6) => (limit > 0 ? (await queryAll(`SELECT * FROM media_items WHERE state = 'prepped' ORDER BY COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:next-asr')).map(parse) : []);
export const nextAsrDone = async (limit = 6) => (limit > 0 ? (await queryAll(`SELECT * FROM media_items WHERE state = 'asr_done' ORDER BY COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:next-diar')).map(parse) : []);
export const preppedCount = async () => (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE state = 'prepped'`, [], 'media:prepped-count'))?.n || 0;
/** Items whose compute stages are done, waiting for the LLM lane, by rank. */
export const nextTranscribed = async (limit = 8) => (await queryAll(`SELECT * FROM media_items WHERE state = 'transcribed' ORDER BY COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:next-llm')).map(parse);
/** The next YouTube items to DOWNLOAD, by rank (queued, not yet in the archive). */
export const nextToDownload = async (limit = 5) => (await queryAll(`SELECT * FROM media_items WHERE state = 'queued' AND source_kind = 'youtube' AND dir IS NULL
  ORDER BY COALESCE(queue_rank, 900000000), id LIMIT ?`, [limit], 'media:next-download')).map(parse);
/** Set queue ranks: rows [{ id, rank }] (one transaction). */
export async function setQueueRanks(rows = []) {
  for (let i = 0; i < rows.length; i += 500) await transaction(rows.slice(i, i + 500).map((r) => ({ sql: 'UPDATE media_items SET queue_rank = ? WHERE id = ?', args: [r.rank, r.id] })), 'media:ranks');
  return rows.length;
}
/** Every item's id, source and identity (for ranking). */
export const rankRows = async () => queryAll(`SELECT id, source_kind, source_ref, youtube_id, speaker, year, collection, title, state FROM media_items WHERE state NOT IN ('duplicate')`, [], 'media:rank-rows');
/** Progress by source: downloaded (in the archive) / published / failed / held / waiting. */
export const progressCounts = async () => queryAll(`SELECT source_kind source, COUNT(*) total,
  SUM(CASE WHEN dir IS NOT NULL THEN 1 ELSE 0 END) downloaded, SUM(CASE WHEN state = 'done' AND restored = 1 THEN 1 ELSE 0 END) published,
  SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) failed, SUM(CASE WHEN state = 'held' THEN 1 ELSE 0 END) held,
  SUM(CASE WHEN state IN ('scheduled', 'running', 'prepped', 'asr_queued', 'asr_done', 'diar_queued', 'transcribed', 'llm_queued') THEN 1 ELSE 0 END) in_progress, SUM(CASE WHEN state = 'queued' THEN 1 ELSE 0 END) waiting,
  SUM(CASE WHEN state = 'done' AND restored = 1 THEN COALESCE(duration_s, 0) ELSE 0 END) published_s
  FROM media_items WHERE state != 'duplicate' GROUP BY source_kind`, [], 'media:progress');
/** FAILED items go back to the queue after 30 min, at most twice ("retry:N" leads their reason) — every failure except the
 *  ones a retry cannot fix (a removed video, a missing file). A failure must never just sit (10-22: a gate bug failed every
 *  compute run for hours, silently). → [ids] */
export async function retryTransientFailures({ olderThanMin = 30, max = 2 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMin * 60_000).toISOString();
  const rows = await queryAll(`SELECT id, why, stage FROM media_items WHERE state = 'failed' AND updated_at < ?
    AND NOT (COALESCE(why, '') LIKE '%Private video%' OR why LIKE '%Video unavailable%' OR why LIKE '%removed by the uploader%' OR why LIKE '%not found on disk%' OR why LIKE '%no audio stream%')`, [cutoff], 'media:retryable-failed');
  const ids = [];
  for (const r of rows) {
    const n = Number(/^retry:(\d+)/.exec(r.why || '')?.[1] || 0);
    // a HOST's fault is not the talk's: "No space left on device" (10-23 16:09, aorus's disk full of job folders) is retried
    // without spending one of its retries
    const hostFault = /No space left on device/i.test(r.why || '');
    if (n >= max && !hostFault) continue;
    // a failure in an LLM stage goes straight back to the LLM lane ('transcribed'); a compute one to the compute queue
    const back = r.stage && !COMPUTE.includes(r.stage) ? 'transcribed' : 'queued';
    await transaction([{ sql: `UPDATE media_items SET state = ?, why = ?, updated_at = ? WHERE id = ?`, args: [back, `retry:${hostFault ? n : n + 1} ${String(r.why || '').replace(/^retry:\d+\s*/, '')}`.slice(0, 500), now(), r.id] }], 'media:retry');
    ids.push(r.id);
  }
  return ids;
}
// the import's SOURCES, from the queue rank (media-rank): the curated sheet · Hooper Dunbar · other Hands/UHJ on YouTube · local
// recordings (Hands/UHJ first) · other YouTube
export const SOURCES = [['historic', 'Historic recordings', 1e7, 2e7], ['hands', 'Hands of the Cause', 2e7, 3e7], ['uhj', 'Universal House of Justice', 3e7, 4e7],
  ['historic-speakers', 'Other historic speakers', 4e7, 5e7], ['scholars', 'Modern scholars', 5e7, 1e9]];
const LATER = "'correct','clean','describe','headings','quotes','links','assess','thumb','render','ingest','catalog'";
/** The import, by source: one group-by over the catalogue (≈1,300 rows, indexed). */
export async function importProgress() {
  const bucket = `CASE ${SOURCES.map(([k, , lo, hi]) => `WHEN COALESCE(queue_rank, 900000000) >= ${lo} AND COALESCE(queue_rank, 900000000) < ${hi} THEN '${k}'`).join(' ')} ELSE 'scholars' END`;
  const rows = await queryAll(`SELECT ${bucket} source, COUNT(*) total, SUM(CASE WHEN dir IS NOT NULL THEN 1 ELSE 0 END) downloaded,
    SUM(CASE WHEN state = 'done' OR stage IN (${LATER}) THEN 1 ELSE 0 END) transcribed, SUM(CASE WHEN state = 'done' AND restored = 1 THEN 1 ELSE 0 END) published,
    SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) failed,
    SUM(CASE WHEN stages_done LIKE '%,enhance,%' THEN 1 ELSE 0 END) enhanced, SUM(CASE WHEN stages_done LIKE '%,remaster,%' THEN 1 ELSE 0 END) remastered,
    SUM(CASE WHEN stages_done LIKE '%,transcribe,%' THEN 1 ELSE 0 END) aligned, SUM(CASE WHEN stages_done LIKE '%,quotes,%' THEN 1 ELSE 0 END) cross_referenced,
    SUM(COALESCE(quotes_n, 0)) quote_links, SUM(COALESCE(crs_n, 0)) concept_crs
    FROM media_items WHERE state != 'duplicate' GROUP BY 1`, [], 'media:import-progress');
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const recent = (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE state = 'done' AND restored = 1 AND completed_at >= ?`, [since], 'media:published-30m'))?.n || 0;
  // the machines' rate: remaster stages finished in the last hour (10-30: "2 remastered/hr" was publications ×2 while 14 talks remastered)
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const remastered60 = (await queryOne(`SELECT COUNT(*) n FROM media_stages WHERE stage = 'remaster' AND status = 'done' AND at >= ?`, [hourAgo], 'media:remastered-60m'))?.n ?? null;
  return { rows, published_30m: recent, remastered_60m: remastered60 };
}
/** The items being worked on now (downloading / processing / being enriched after publication): a handful of rows. */
export const queuedCount = async () => (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE state IN ('queued', 'scheduled')`, [], 'media:queued-count'))?.n || 0;
/** The items whose run is RUNNING NOW (ids from the ops queue), for the live view — never the last stage written (10-22: a
 *  published item showed 'grade' for hours after its re-run stopped). */
export const liveItemsByIds = async (ids = []) => (ids.length ? (await queryAll(`SELECT id, slug, title, speaker, speaker_key, source_kind, youtube_id, duration_s, dir, state, stage, queue_rank, updated_at
  FROM media_items WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`, ids.map(Number), 'media:live-ids')).map(parse) : []);
export const liveItems = async (limit = 12) => (await queryAll(`SELECT id, slug, title, speaker, speaker_key, source_kind, youtube_id, duration_s, dir, state, stage, queue_rank, updated_at
  FROM media_items WHERE state = 'running' OR (state = 'done' AND stage IS NOT NULL AND stage NOT IN ('catalog')) ORDER BY updated_at DESC LIMIT ?`, [limit], 'media:live')).map(parse);
export const recentlyPublished = async (limit = 6) => queryAll(`SELECT slug, title, speaker, speaker_key, duration_s, published_at FROM media_items
  WHERE state = 'done' AND restored = 1 AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?`, [limit], 'media:recent-published');
/** PIPELINE HEALTH for the watchdog (system-checks) and /progress/live: failures in the window (by stage), items running,
 *  and the backlog each lane could be working on — a backlog with nothing running is an IDLE lane. One group-by. */
export async function pipelineHealth({ sinceIso = new Date(Date.now() - 3600_000).toISOString() } = {}) {
  const r = await queryOne(`SELECT
      SUM(CASE WHEN state = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) failed_window,
      SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) failed_total,
      SUM(CASE WHEN state = 'running' AND stage IN ('archive','grade','enhance','web','transcribe') THEN 1 ELSE 0 END) compute_running,
      SUM(CASE WHEN state = 'running' AND (stage IS NULL OR stage NOT IN ('archive','grade','enhance','web','transcribe')) THEN 1 ELSE 0 END) llm_running,
      SUM(CASE WHEN state IN ('queued','scheduled') AND COALESCE(stage, '') != 'download' AND (source_kind != 'youtube' OR dir IS NOT NULL) THEN 1 ELSE 0 END) compute_backlog,
      SUM(CASE WHEN state IN ('transcribed','llm_queued') THEN 1 ELSE 0 END) llm_backlog,
      SUM(CASE WHEN state IN ('prepped','asr_queued') THEN 1 ELSE 0 END) asr_backlog,
      SUM(CASE WHEN state IN ('asr_done','diar_queued') THEN 1 ELSE 0 END) diar_backlog,
      SUM(CASE WHEN state = 'done' AND why LIKE 'update failed:%' THEN 1 ELSE 0 END) published_problems,
      SUM(CASE WHEN published_at >= ? THEN 1 ELSE 0 END) published_window,
      SUM(CASE WHEN state = 'done' AND updated_at >= ? AND published_at < ? THEN 1 ELSE 0 END) rerendered_window
    FROM media_items`, [sinceIso, sinceIso, sinceIso, sinceIso], 'media:health');
  const by = await queryAll(`SELECT COALESCE(stage, '?') stage, COUNT(*) n FROM media_items WHERE state = 'failed' AND updated_at >= ? GROUP BY stage`, [sinceIso], 'media:health-failed');
  const recent = await queryAll(`SELECT slug, stage, why, updated_at FROM media_items WHERE state = 'failed' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 10`, [sinceIso], 'media:health-failed-items');
  const n = (k) => Number(r?.[k] || 0);
  return { since: sinceIso, failed: n('failed_window'), failed_total: n('failed_total'), failed_by_stage: Object.fromEntries(by.map((x) => [x.stage, x.n])),
    failed_items: recent.map((x) => ({ slug: x.slug, stage: x.stage, why: String(x.why || '').slice(0, 200), at: x.updated_at })),
    compute_running: n('compute_running'), llm_running: n('llm_running'), compute_backlog: n('compute_backlog'), asr_backlog: n('asr_backlog'), diar_backlog: n('diar_backlog'), llm_backlog: n('llm_backlog'), published: n('published_window'), rerendered: n('rerendered_window'), published_problems: n('published_problems') };   // published = FIRST publications (published_at); rerendered = re-runs of talks published before the window
}
/** RESTORE: a talk once published (catalogued) that a failed re-run marked 'failed' goes back to 'done', its reason kept as
 *  'update failed: …' (10-23: the publish gate took ~13 published talks off the site). → [ids] */
export async function restorePublished() {
  const rows = await queryAll(`SELECT id, why FROM media_items WHERE state = 'failed' AND (published_at IS NOT NULL OR stages_done LIKE '%,catalog,%')`, [], 'media:restore-published');
  if (rows.length) await transaction(rows.map((r) => ({ sql: `UPDATE media_items SET state = 'done', why = ?, updated_at = ? WHERE id = ?`,
    args: [`update failed: ${String(r.why || '').replace(/^(?:retry:\d+\s*)?(?:update failed:\s*)?/, '')}`.slice(0, 500), now(), r.id] })), 'media:restore-published');
  return rows.map((r) => r.id);
}
/** Published talks whose last re-run failed ('update failed: …'), for a re-run. */
export const publishedProblemIds = async () => (await queryAll(`SELECT id FROM media_items WHERE state = 'done' AND why LIKE 'update failed:%'`, [], 'media:published-problems')).map((r) => r.id);
/** Items published since a time (throughput). */
export const publishedSince = async (iso) => (await queryOne(`SELECT COUNT(*) n, SUM(COALESCE(duration_s, 0)) secs FROM media_items WHERE state = 'done' AND updated_at >= ?`, [iso], 'media:published-since')) || { n: 0, secs: 0 };

/** The /media listing: published items (state 'done'), filtered. → { items, total } */
export async function listMedia({ speaker, tradition, collection, year, language, minDur, maxDur, hasVideo, ids, grade, issue, audience, state = 'done', sort = 'recent', limit = 50, offset = 0, includePending = false } = {}) {
  speaker = approvedSpeakerLabel(speaker)?.name || speaker;
  const where = ['state = ?'], args = [state];
  if (state === 'done' && !includePending) where.push('restored = 1');   // on the air = a restored copy exists (Chad 10-29); the rest is pending
  const eq = (col, v) => { if (v != null && v !== '') { where.push(`${col} = ?`); args.push(v); } };
  eq('speaker', speaker); eq('tradition', tradition); eq('collection', collection); eq('language', language); eq('primary_issue', issue);
  if (grade) { const gs = String(grade).toUpperCase().split(/[,\s]+/).filter((x) => /^[A-E]$/.test(x)); if (gs.length) { where.push(`grade IN (${gs.map(() => '?').join(',')})`); args.push(...gs); } }
  // audience: a preset (newcomers 1–2, community 3–4, internal 5) or a level 1–5
  const AUD = { newcomers: [1, 2], community: [3, 4], internal: [5] };
  const lv = AUD[audience] || (/^[1-5]$/.test(String(audience ?? '')) ? [Number(audience)] : null);
  if (lv) { where.push(`audience IN (${lv.map(() => '?').join(',')})`); args.push(...lv); }
  if (year) { where.push('year = ?'); args.push(Number(year)); }
  if (minDur) { where.push('duration_s >= ?'); args.push(Number(minDur)); }
  if (maxDur) { where.push('duration_s <= ?'); args.push(Number(maxDur)); }
  if (hasVideo != null && hasVideo !== '') { where.push('has_video = ?'); args.push(hasVideo === true || hasVideo === '1' || hasVideo === 'true' ? 1 : 0); }
  if (ids) { if (!ids.length) return { items: [], total: 0 }; where.push(`id IN (${ids.map(() => '?').join(',')})`); args.push(...ids.map(Number)); }
  const order = sort === 'priority' ? 'COALESCE(priority, -1) DESC, id' : sort === 'grade' ? 'grade DESC, priority DESC' : sort === 'title' ? 'title COLLATE NOCASE' : sort === 'year' ? 'year DESC, title' : sort === 'speaker' ? 'speaker, year' : 'updated_at DESC';
  const w = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE ${w}`, args, 'media:count'))?.n || 0;
  const items = (await queryAll(`SELECT id, slug, title, speaker, speaker_key, tradition, collection, language, year, date, duration_s, has_video, source_kind, youtube_id, channel,
    playback, thumb, quotes_n, crs_n, words_n, doc_id, grade, primary_issue, chain_key, priority, audience, updated_at FROM media_items WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
  [...args, Math.min(200, Number(limit) || 50), Number(offset) || 0], 'media:list')).map(parse);
  return { items, total };
}

/** Every published item, the columns the /media listing index needs (+ dir to read its files), newest first. */
export const mediaIndexRows = async () => queryAll(`SELECT id, slug, title, speaker, speaker_key, collection, language, year, duration_s, has_video, source_kind,
  playback, thumb, quotes_n, crs_n, grade, priority, dir, updated_at FROM media_items WHERE state = 'done' AND restored = 1 ORDER BY updated_at DESC, id DESC`, [], 'media:index-rows');

/** Filter facets for the listing: value → count, published items only. */
export async function mediaFacets() {
  const facet = async (col) => (await queryAll(`SELECT ${col} v, COUNT(*) n FROM media_items WHERE state = 'done' AND restored = 1 AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC LIMIT 200`, [], `media:facet-${col}`));
  const [speaker, tradition, collection, year, language, audience] = await Promise.all(['speaker', 'tradition', 'collection', 'year', 'language', 'audience'].map(facet));
  const video = await queryOne(`SELECT SUM(has_video) v, COUNT(*) n, SUM(duration_s) secs FROM media_items WHERE state = 'done' AND restored = 1`, [], 'media:facet-video');
  return { speaker, tradition, collection, year, language, audience, video: video?.v || 0, total: video?.n || 0, hours: Math.round((video?.secs || 0) / 360) / 10 };
}

/** Pipeline counts by state (the status page and the morning summary). */
export const mediaStates = async () => queryAll('SELECT state, stage, COUNT(*) n FROM media_items GROUP BY state, stage', [], 'media:states');

/** Transcript paragraphs (with their t0/t1 block attributes) for search hits. */
export const mediaParagraphs = async (ids) => (ids.length ? queryAll(`SELECT id, doc_id, paragraph_index, text, block_attrs FROM content WHERE id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`,
  ids.map(Number), 'media:paragraphs') : []);

/** A transcript document's paragraph ids by their para_N (block id) — to store quote links on the right rows. */
export const docParagraphMap = async (docId) => queryAll(`SELECT id, paragraph_index, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`,
  [Number(docId)], 'media:doc-paragraphs');

// ── YouTube channel permissions (Chad edits) ──
export const getChannel = async (id) => queryOne('SELECT * FROM media_channels WHERE channel_id = ?', [String(id)], 'media:channel');
export const listChannels = async () => queryAll('SELECT * FROM media_channels ORDER BY name', [], 'media:channels');
export async function upsertChannel({ channel_id, name = null, playback = 'clips', granted_by = null, note = null }) {
  await transaction([{ sql: `INSERT INTO media_channels (channel_id, name, playback, granted_by, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET name = COALESCE(excluded.name, name), playback = excluded.playback, granted_by = excluded.granted_by,
    note = excluded.note, updated_at = excluded.updated_at`, args: [String(channel_id), name, playback, granted_by, note, now()] }], 'media:channel-upsert');
  return getChannel(channel_id);
}

/** Vocabulary names from the entity graph — LIVE persons, places, works, groups, events, most important first (the pilot's
 *  first build filtered on religion/mention_count, which these records do not carry: 0 names). — media-vocab job. */
export const vocabularyNames = async ({ limit = 6000 } = {}) => queryAll(`SELECT canonical_name name, entity_type type, importance n FROM graph_entities
  WHERE entity_type IN ('person', 'place', 'work', 'group', 'event', 'title') AND length(canonical_name) BETWEEN 4 AND 60
  AND ${LIVE_SQL()} ORDER BY COALESCE(importance, 0) DESC LIMIT ?`, [limit], 'media:vocab-names');

// ── speaker portraits (migration 164) ──
export const getSpeaker = async (key) => queryOne('SELECT * FROM media_speakers WHERE key = ?', [String(canonicalSpeakerKey(key))], 'media:speaker');
export const speakersByKeys = async (keys) => (keys.length ? queryAll(`SELECT * FROM media_speakers WHERE key IN (${keys.map(() => '?').join(',')})`, keys, 'media:speakers') : []);
export const listSpeakers = async () => queryAll('SELECT * FROM media_speakers ORDER BY name', [], 'media:speakers-all');
export const itemsBySpeakerKeys = async (keys) => keys.length ? queryAll(`SELECT id, slug, dir, speaker, speaker_key, state, doc_id FROM media_items WHERE speaker_key IN (${keys.map(() => '?').join(',')})`, keys, 'media:items-speaker-keys') : [];
const SPK = ['name', 'entity_id', 'file', 'sha', 'width', 'height', 'origin', 'source_url', 'page_url', 'credit', 'licence', 'fetched_at', 'tried_at', 'note', 'ext_file', 'ext_sha', 'ext_of', 'ext_model', 'ext_prompt', 'ext_usd', 'ext_at', 'ext_error',
  'sketch_file', 'sketch_sha', 'sketch_sq_file', 'sketch_sq_sha', 'sketch_width', 'sketch_height', 'sketch_model', 'sketch_source_sha', 'sketch_source_file', 'sketch_source_credit', 'sketch_source_licence', 'sketch_source_url', 'sketch_likeness', 'sketch_usd', 'sketch_at', 'sketch_state', 'sketch_attempted_at', 'sketch_error'];
export async function upsertSpeaker(row) {
  const key = canonicalSpeakerKey(row.key);
  if (key !== row.key) {
    const decision = (speakerDecisions().profile_merges || []).find(x => x.from === row.key);
    row = { ...row, key, name: decision?.name || row.name };
    const current = await getSpeaker(key);
    if (current?.entity_id) row.entity_id = current.entity_id;
    if (current?.file && current.file !== row.file) for (const field of SPK.filter(k => !['name', 'entity_id', 'note'].includes(k))) row[field] = undefined;
  }
  const vals = SPK.map((k) => (row[k] === undefined ? null : row[k]));
  await transaction([{ sql: `INSERT INTO media_speakers (key, ${SPK.join(', ')}, updated_at) VALUES (?, ${SPK.map(() => '?').join(', ')}, ?)
    ON CONFLICT(key) DO UPDATE SET ${SPK.map((k) => `${k} = COALESCE(excluded.${k}, ${k})`).join(', ')}, updated_at = excluded.updated_at`,
  args: [String(row.key), ...vals, now()] }], 'media:speaker-upsert');
  return getSpeaker(row.key);
}
/** Consolidate only explicitly approved profile keys. Preserve canonical fields,
 * gallery originals/extensions and alternate entity references in the merge note.
 * No recording, graph person, or media byte is deleted. */
export async function mergeSpeakerProfiles({ from, to, name }, decisions = speakerDecisions()) {
  if (from === to || !(decisions.profile_merges || []).some(x => x.from === from && x.to === to && x.name === name)) throw new Error('Speaker profile merge was not approved');
  const profiles = await speakersByKeys([from, to]);
  const source = profiles.find(p => p.key === from), target = profiles.find(p => p.key === to);
  if (!source) return { from, to, already_merged: true };
  const merged = { ...source, ...(target || {}), key: to, name };
  for (const field of SPK) if (merged[field] == null) merged[field] = source[field] ?? null;
  if (target?.file) for (const field of SPK.filter(k => !['name', 'entity_id', 'note'].includes(k))) merged[field] = target[field] ?? null;
  merged.note = [target?.note, source.note, `Merged ${from} into ${to}; source entity ${source.entity_id ?? 'none'}; preserved source portrait ${source.file ?? 'none'}`].filter(Boolean).join('\n');
  const at = now(), vals = SPK.map(k => merged[k] ?? null);
  const galleryCols = [...GAL, 'ext_file', 'ext_sha', 'ext_model', 'ext_usd', 'ext_at', 'ext_error'];
  const ops = [{ sql: `INSERT INTO media_speakers (key, ${SPK.join(', ')}, updated_at) VALUES (?, ${SPK.map(() => '?').join(', ')}, ?)
    ON CONFLICT(key) DO UPDATE SET ${SPK.map(k => `${k} = excluded.${k}`).join(', ')}, updated_at = excluded.updated_at`, args: [to, ...vals, at] },
    { sql: 'UPDATE media_items SET speaker_key = ?, speaker = ?, updated_at = ? WHERE speaker_key = ?', args: [to, name, at, from] },
    { sql: `INSERT INTO media_speaker_photos (speaker_key, sha, ${galleryCols.join(', ')}, updated_at)
      SELECT ?, sha, ${galleryCols.join(', ')}, ? FROM media_speaker_photos WHERE speaker_key = ? ON CONFLICT(speaker_key, sha) DO NOTHING`, args: [to, at, from] }];
  if (source.file && source.sha) ops.push({ sql: `INSERT INTO media_speaker_photos (speaker_key, sha, file, rank, width, height, origin, source_url, page_url, credit, licence, note, needs_ext, ext_file, ext_sha, ext_model, ext_usd, ext_at, ext_error, updated_at)
    VALUES (?, ?, ?, 100, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(speaker_key, sha) DO NOTHING`,
    args: [to, source.sha, source.file, source.width ?? null, source.height ?? null, source.origin ?? null, source.source_url ?? null, source.page_url ?? null, source.credit ?? null, source.licence ?? null, `Preserved from approved merge of ${from}`, source.ext_file ?? null, source.ext_sha ?? null, source.ext_model ?? null, source.ext_usd ?? null, source.ext_at ?? null, source.ext_error ?? null, at] });
  ops.push({ sql: 'DELETE FROM media_speaker_photos WHERE speaker_key = ?', args: [from] }, { sql: 'DELETE FROM media_speakers WHERE key = ?', args: [from] });
  await transaction(ops, 'media:approved-speaker-merge');
  return { from, to, merged: true, source_entity_id: source.entity_id ?? null, canonical_entity_id: merged.entity_id ?? null };
}
/** Distinct speakers of the catalogue (with their items' ids) — the portrait job's work list. */
export const mediaSpeakerNames = async () => queryAll(`SELECT speaker, speaker_key, COUNT(*) n FROM media_items WHERE speaker IS NOT NULL AND speaker != ''
  GROUP BY speaker, speaker_key ORDER BY n DESC`, [], 'media:speaker-names');
export async function setItemsSpeakerKey(speaker, key) {
  await transaction([{ sql: 'UPDATE media_items SET speaker_key = ? WHERE speaker = ?', args: [key, speaker] }], 'media:set-speaker-key');
}
/** The graph person for a name: live persons whose folded canonical name equals the folded name. → id or null */
export async function personEntityId(folded, surname) {
  const rows = await queryAll(`SELECT id, canonical_name cn, importance FROM graph_entities WHERE entity_type = 'person' AND canonical_name LIKE ? AND ${LIVE_SQL()} LIMIT 200`,
    [`%${surname}%`], 'media:person-entity');
  const f = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const hit = rows.filter((r) => f(r.cn) === folded).sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
  return hit?.id ?? null;
}

/** Set the playback level of items (all, or one source kind) → how many changed. */
export async function setPlayback(level, { sourceKind = null } = {}) {
  const r = await queryOne(`SELECT COUNT(*) n FROM media_items WHERE playback != ?${sourceKind ? ' AND source_kind = ?' : ''}`, sourceKind ? [level, sourceKind] : [level], 'media:playback-count');
  await transaction([{ sql: `UPDATE media_items SET playback = ?, updated_at = ? WHERE playback != ?${sourceKind ? ' AND source_kind = ?' : ''}`, args: sourceKind ? [level, now(), level, sourceKind] : [level, now(), level] }], 'media:set-playback');
  return r?.n || 0;
}
/** Published rows whose restored flag was never set (before migration 186): the backfill's work list, and its answer. */
export const unclassifiedDone = async (limit = 50) => queryAll(`SELECT id, dir FROM media_items WHERE dir IS NOT NULL AND state != 'duplicate' AND (restored IS NULL OR stages_missing IS NULL OR (restored = 1 AND completed_at IS NULL)) ORDER BY (state = 'done') DESC, id LIMIT ?`, [Number(limit) || 50], 'media:restored-todo');
/** Every published row, in id order: the on-air flag is re-derived from meta.json in both directions (10-31: rows set 0 under the old verdict rule are re-checked). */
export const doneRows = async (afterId = 0, limit = 200) => queryAll(`SELECT id, dir, restored FROM media_items WHERE state = 'done' AND id > ? ORDER BY id LIMIT ?`, [Number(afterId) || 0, Number(limit) || 200], 'media:done-verify');
const IDX = ['restored', 'stages_missing', 'next_stage', 'verdict', 'in_quality', 'out_quality', 'in_bw_khz', 'out_bw_khz', 'completed_at'];
export const setIndex = async (id, f) => transaction([{ sql: `UPDATE media_items SET ${IDX.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, args: [...IDX.map((c) => f[c] ?? null), Number(id)] }], 'media:set-index');
export const setRestored = async (id, flag) => transaction([{ sql: 'UPDATE media_items SET restored = ? WHERE id = ?', args: [flag ? 1 : 0, Number(id)] }], 'media:set-restored');
/** The re-judge work list (Chad 10-31): published talks whose remaster is held (review) or still playing the original (kept/deferred → 'unrepairable'), in id order after a cursor. */
export const heldCandidates = async (afterId = 0, limit = 20) => queryAll(`SELECT id, slug, dir FROM media_items WHERE state = 'done' AND dir IS NOT NULL AND verdict IN ('review', 'unrepairable', 'spliced') AND id > ? ORDER BY id LIMIT ?`, [Number(afterId) || 0, Number(limit) || 20], 'media:held-candidates');
/** The held page's rows: held for Chad (review/unrepairable) or archived, with their listing fields. */
export const heldRows = async (verdicts = ['review', 'unrepairable', 'archived']) => queryAll(`SELECT id, slug, title, speaker, duration_s, dir, verdict FROM media_items WHERE state = 'done' AND dir IS NOT NULL AND verdict IN (${verdicts.map(() => '?').join(',')}) ORDER BY id`, verdicts, 'media:held-rows');
export const doneItemIds = async () => (await queryAll(`SELECT id FROM media_items WHERE state = 'done' ORDER BY id`, [], 'media:done-ids')).map((r) => r.id);

/** The repair list: graded published items worth fixing, grouped by their recommended fix chain, most urgent first. */
export async function repairList({ minGrade = 'C', limit = 500 } = {}) {
  const rows = await queryAll(`SELECT id, slug, title, speaker, duration_s, grade, primary_issue, chain_key, priority FROM media_items
    WHERE state = 'done' AND grade IS NOT NULL AND grade >= ? AND chain_key IS NOT NULL AND chain_key != 'none' ORDER BY priority DESC LIMIT ?`, [minGrade, limit], 'media:repairs');
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.chain_key)) groups.set(r.chain_key, { chain: r.chain_key, items: [], hours: 0, priority: 0 }); const gr = groups.get(r.chain_key); gr.items.push(r); gr.hours += (r.duration_s || 0) / 3600; gr.priority += r.priority || 0; }
  return [...groups.values()].map((gr) => ({ ...gr, hours: Math.round(gr.hours * 10) / 10, priority: Math.round(gr.priority * 10) / 10 })).sort((a, b) => b.priority - a.priority);
}
/** Grade distribution of the published items. */
export const gradeCounts = async () => queryAll(`SELECT grade, primary_issue, COUNT(*) n FROM media_items WHERE state = 'done' GROUP BY grade, primary_issue ORDER BY grade, n DESC`, [], 'media:grade-counts');
/** Does another item hold the same speaker + title (another copy of the talk)? */
export const sameTalkCount = async (speaker, title) => (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE speaker = ? AND title = ? AND state != 'duplicate'`, [speaker, title], 'media:same-talk'))?.n || 0;

// ── name and work links (migration 166) ──
/** Replace an item's links (one transaction through the single writer). rows: [{ para, paragraph_index, kind, text, entity_id,
 *  target_doc_id, section, url, confidence, basis }] */
export async function replaceMediaLinks(itemId, rows = []) {
  const ops = [{ sql: 'DELETE FROM media_links WHERE item_id = ?', args: [Number(itemId)] }];
  for (const r of rows) ops.push({ sql: `INSERT INTO media_links (item_id, para, paragraph_index, kind, text, entity_id, target_doc_id, section, url, confidence, basis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [Number(itemId), r.para, r.paragraph_index ?? null, r.kind, r.text ?? null, r.entity_id ?? null, r.target_doc_id ?? null,
    r.section ?? null, r.url ?? null, r.confidence ?? null, r.basis ?? null] });
  await transaction(ops, 'media:links-replace');
  return rows.length;
}
/** Talks that name a person (for a biography page's "talks that mention" list later). */
export const mediaLinksForEntity = async (entityId, { limit = 50 } = {}) => queryAll(`SELECT l.item_id, l.para, l.paragraph_index, l.text, m.slug, m.title, m.speaker
  FROM media_links l JOIN media_items m ON m.id = l.item_id WHERE l.entity_id = ? AND m.state = 'done' ORDER BY m.title LIMIT ?`, [Number(entityId), limit], 'media:links-entity');

// ── moments and audience (migration 167) ──
/** Replace an item's moments (keys are stable for the same words, so a shared link survives a re-run that keeps them). */
export async function replaceMoments(itemId, moments = []) {
  const ops = [{ sql: 'DELETE FROM media_moments WHERE item_id = ?', args: [Number(itemId)] }];
  for (const m of moments) ops.push({ sql: `INSERT OR REPLACE INTO media_moments (item_id, key, para, i0, i1, t0_ms, t1_ms, text, context, kind, topics, why, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [Number(itemId), m.key, m.para ?? null, m.i0 ?? null, m.i1 ?? null, m.t0_ms ?? null, m.t1_ms ?? null,
    m.text, m.context ?? null, m.kind ?? null, JSON.stringify(m.topics || []), m.why ?? null, m.rank ?? null] });
  await transaction(ops, 'media:moments-replace');
  return moments.length;
}
const momentRow = (r) => (r ? { ...r, topics: (() => { try { return JSON.parse(r.topics || '[]'); } catch { return []; } })() } : null);
/** One moment by its short key, with its talk (for a shareable moment page). The internal note is not returned. */
export const momentByKey = async (key) => momentRow(await queryOne(`SELECT mm.key, mm.para, mm.t0_ms, mm.t1_ms, mm.text, mm.context, mm.kind, mm.topics, mm.rank,
  m.slug, m.title, m.speaker, m.speaker_key, m.year, m.playback, m.audience FROM media_moments mm JOIN media_items m ON m.id = mm.item_id
  WHERE mm.key = ? AND m.state = 'done'`, [String(key)], 'media:moment'));
/** Moments across the library (the ticker): best-ranked first, optionally only from talks up to an audience level. */
export const listMoments = async ({ limit = 50, maxAudience = null, kind = null } = {}) => (await queryAll(`SELECT mm.key, mm.t0_ms, mm.t1_ms, mm.text, mm.context, mm.kind,
  mm.topics, m.slug, m.title, m.speaker, m.audience FROM media_moments mm JOIN media_items m ON m.id = mm.item_id WHERE m.state = 'done'
  ${maxAudience ? 'AND m.audience <= ?' : ''} ${kind ? 'AND mm.kind = ?' : ''} ORDER BY mm.rank, m.updated_at DESC LIMIT ?`,
[...(maxAudience ? [Number(maxAudience)] : []), ...(kind ? [String(kind)] : []), Math.min(500, Number(limit) || 50)], 'media:moments')).map(momentRow);
/** The best introductory ranges across the library (section-level, rated 1–2), from each item's catalogue meta. */
export async function introClips({ limit = 40 } = {}) {
  const rows = await queryAll(`SELECT slug, title, speaker, audience, meta FROM media_items WHERE state = 'done' AND meta LIKE '%"intro"%'`, [], 'media:intro-clips');
  const out = [];
  for (const r of rows) {
    let m = {}; try { m = JSON.parse(r.meta || '{}'); } catch { /* none */ }
    for (const c of m.audience_intro || []) out.push({ slug: r.slug, title: r.title, speaker: r.speaker, talk_audience: r.audience, ...c });
  }
  return out.sort((a, b) => a.score - b.score || (b.t1 - b.t0) - (a.t1 - a.t0)).slice(0, limit);
}

/** Record an extended portrait master (or its failure) on an existing speaker: a plain UPDATE (upsertSpeaker's INSERT needs
 *  the name — 10-22: 89 extensions were generated and uploaded but not recorded). */
export async function setSpeakerExtension(key, f = {}) {
  const cols = ['ext_file', 'ext_sha', 'ext_of', 'ext_model', 'ext_prompt', 'ext_usd', 'ext_at', 'ext_error'].filter((k) => f[k] !== undefined);
  if (!cols.length) return getSpeaker(key);
  await transaction([{ sql: `UPDATE media_speakers SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE key = ?`, args: [...cols.map((k) => f[k]), now(), String(key)] }], 'media:speaker-ext');
  return getSpeaker(key);
}

/** Persist an automatically generated speaker sketch and its retry state. The image bytes live in R2; only provenance and
 *  immutable, content-addressed paths belong in the catalogue. */
export async function setSpeakerSketch(key, f = {}) {
  const cols = ['sketch_file', 'sketch_sha', 'sketch_sq_file', 'sketch_sq_sha', 'sketch_width', 'sketch_height', 'sketch_model',
    'sketch_source_sha', 'sketch_source_file', 'sketch_source_credit', 'sketch_source_licence', 'sketch_source_url', 'sketch_likeness',
    'sketch_usd', 'sketch_at', 'sketch_state', 'sketch_attempted_at', 'sketch_error'].filter((k) => f[k] !== undefined);
  if (!cols.length) return getSpeaker(key);
  const vals = cols.map((k) => k === 'sketch_likeness' && f[k] != null && typeof f[k] !== 'string' ? JSON.stringify(f[k]) : f[k]);
  await transaction([{ sql: `UPDATE media_speakers SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE key = ?`, args: [...vals, now(), String(key)] }], 'media:speaker-sketch');
  return getSpeaker(key);
}

/** The model's measured cost for today's successful and failed attempts. */
export const speakerSketchSpendSince = async (since) => Number((await queryOne(
  'SELECT COALESCE(SUM(usd), 0) usd FROM media_speaker_sketch_runs WHERE at >= ?', [String(since)], 'media:speaker-sketch-spend'))?.usd || 0);

export async function recordSpeakerSketchRun({ key, at = now(), usd = 0, status, source_sha = null, error = null }) {
  await transaction([{ sql: `INSERT INTO media_speaker_sketch_runs (speaker_key, at, usd, status, source_sha, error) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [String(key), String(at), Number(usd) || 0, String(status), source_sha, error ? String(error).slice(0, 500) : null] }], 'media:speaker-sketch-run');
}

// ── speaker galleries (migration 174) ──
/** Gallery rows of these people (all when keys is null), in rank order. */
export const galleryRows = async (keys = null) => {
  keys = keys ? [...new Set(keys.map(k => canonicalSpeakerKey(k)))] : null;
  return keys && !keys.length ? [] : queryAll(`SELECT * FROM media_speaker_photos${keys ? ` WHERE speaker_key IN (${keys.map(() => '?').join(',')})` : ''}
    ORDER BY speaker_key, rank`, keys || [], 'media:gallery');
};
const GAL = ['rank', 'file', 'phash', 'width', 'height', 'face', 'origin', 'source_url', 'page_url', 'credit', 'licence', 'year', 'note', 'needs_ext'];
/** Apply one person's gallery sync (planGallerySync): upserts keep any extended master already made; deletes by sha. */
export async function applyGallery(key, { upserts = [], deletes = [] }) {
  key = canonicalSpeakerKey(key);
  const ops = deletes.map((sha) => ({ sql: 'DELETE FROM media_speaker_photos WHERE speaker_key = ? AND sha = ?', args: [String(key), sha] }));
  for (const r of upserts) ops.push({ sql: `INSERT INTO media_speaker_photos (speaker_key, sha, ${GAL.join(', ')}, updated_at) VALUES (?, ?, ${GAL.map(() => '?').join(', ')}, ?)
    ON CONFLICT(speaker_key, sha) DO UPDATE SET ${GAL.map((k) => `${k} = excluded.${k}`).join(', ')}, updated_at = excluded.updated_at`,
  args: [String(key), r.sha, ...GAL.map((k) => r[k] ?? null), now()] });
  if (ops.length) await transaction(ops, 'media:gallery-sync');
  return ops.length;
}
/** Record a gallery photo's AI-extended master (or its failure). */
export async function setGalleryExtension(key, sha, f = {}) {
  key = canonicalSpeakerKey(key);
  const cols = ['ext_file', 'ext_sha', 'ext_model', 'ext_usd', 'ext_at', 'ext_error'].filter((k) => f[k] !== undefined);
  if (cols.length) await transaction([{ sql: `UPDATE media_speaker_photos SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE speaker_key = ? AND sha = ?`,
    args: [...cols.map((k) => f[k]), now(), String(key), sha] }], 'media:gallery-ext');
}
/** Every speaker string of the catalogue by state (published, queued, …) — the portrait inventory's work list. */
export const speakerStateCounts = async () => queryAll(`SELECT speaker, speaker_key, state, COUNT(*) n FROM media_items WHERE speaker IS NOT NULL AND speaker != ''
  GROUP BY speaker, speaker_key, state`, [], 'media:speaker-states');

// ── Dewey's media holdings check (lib/dewey/media-holdings.js, Chad 10-23: "do we have this talk?") ──
/** Talks whose title contains every one of these words (and, when given, whose speaker contains `speaker`): a few rows. */
export const findMediaByWords = async (words = [], { speaker = null, limit = 5 } = {}) => {
  const ws = words.filter(Boolean).slice(0, 5);
  if (!ws.length) return [];
  const where = ws.map(() => 'LOWER(title) LIKE ?');
  const args = ws.map((w) => `%${String(w).toLowerCase()}%`);
  if (speaker) { where.push('LOWER(COALESCE(speaker, \'\')) LIKE ?'); args.push(`%${String(speaker).toLowerCase()}%`); }
  return (await queryAll(`SELECT * FROM media_items WHERE state != 'duplicate' AND ${where.join(' AND ')} ORDER BY CASE WHEN state = 'done' THEN 0 ELSE 1 END, id LIMIT ?`,
    [...args, limit], 'media:by-words')).map(parse);
};
/** How many queued / scheduled items come before this rank (the import queue's order). */
export const mediaQueueAhead = async (rank) => (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE state IN ('queued', 'scheduled')
  AND COALESCE(queue_rank, 900000000) < ?`, [rank ?? 900000000], 'media:queue-ahead'))?.n || 0;
/** Talks published since `since` (the queue's recent pace, for an ETA). */
export const mediaPublishedSince = async (since) => (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE published_at >= ?`, [since], 'media:published-since'))?.n || 0;

/** Items whose length is within `pct` of `duration_s` and that are not duplicates/excluded: the candidates Dewey's stage-0 preview is matched against. */
export const itemsNearDuration = async (duration_s, pct = 0.03) => queryAll(
  `SELECT id, slug, title, speaker, dir, duration_s FROM media_items WHERE duration_s BETWEEN ? AND ? AND state NOT IN ('duplicate', 'excluded') AND dir IS NOT NULL`,
  [duration_s * (1 - pct), duration_s * (1 + pct)], 'media:preview-candidates');
