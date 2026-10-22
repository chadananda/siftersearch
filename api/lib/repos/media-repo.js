// media-repo — the media library catalogue (media_items, media_channels; migration 163). The per-item folder's meta.json
// is the source of truth; these rows are what the /media listing filters and what the pipeline's state machine records.
// Writes go through the single writer (transaction). Callers: routes/media.js, ops/media-jobs.js. Deps: db.js.
import { queryAll, queryOne, transaction } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';

const now = () => new Date().toISOString();
const parse = (r) => r && { ...r, has_video: !!r.has_video, meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return null; } })() : null };
const COLS = new Set(['grade', 'primary_issue', 'chain_key', 'priority', 'speaker_key', 'slug', 'title', 'speaker', 'tradition', 'collection', 'language', 'year', 'date', 'duration_s', 'has_video', 'source_kind', 'source_ref',
  'sha256', 'youtube_id', 'channel', 'playback', 'stage', 'state', 'why', 'dir', 'doc_id', 'thumb', 'quotes_n', 'crs_n', 'words_n', 'asr_conf', 'cost_usd', 'meta']);

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

/** Change fields (unknown keys are ignored; meta is JSON). */
export async function updateMediaItem(id, fields = {}) {
  const set = Object.fromEntries(Object.entries(fields).filter(([k]) => COLS.has(k)));
  if (set.meta !== undefined && typeof set.meta !== 'string') set.meta = JSON.stringify(set.meta);
  if (set.has_video !== undefined) set.has_video = set.has_video ? 1 : 0;
  set.updated_at = now();
  const keys = Object.keys(set);
  await transaction([{ sql: `UPDATE media_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, args: [...keys.map((k) => set[k]), Number(id)] }], 'media:update');
  return getMediaItem(id);
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
export const pendingMedia = async (limit = 10) => (await queryAll(`SELECT * FROM media_items WHERE state IN ('queued', 'running') ORDER BY id LIMIT ?`, [limit], 'media:pending')).map(parse);

/** The /media listing: published items (state 'done'), filtered. → { items, total } */
export async function listMedia({ speaker, tradition, collection, year, language, minDur, maxDur, hasVideo, ids, grade, issue, state = 'done', sort = 'recent', limit = 50, offset = 0 } = {}) {
  const where = ['state = ?'], args = [state];
  const eq = (col, v) => { if (v != null && v !== '') { where.push(`${col} = ?`); args.push(v); } };
  eq('speaker', speaker); eq('tradition', tradition); eq('collection', collection); eq('language', language); eq('primary_issue', issue);
  if (grade) { const gs = String(grade).toUpperCase().split(/[,\s]+/).filter((x) => /^[A-E]$/.test(x)); if (gs.length) { where.push(`grade IN (${gs.map(() => '?').join(',')})`); args.push(...gs); } }
  if (year) { where.push('year = ?'); args.push(Number(year)); }
  if (minDur) { where.push('duration_s >= ?'); args.push(Number(minDur)); }
  if (maxDur) { where.push('duration_s <= ?'); args.push(Number(maxDur)); }
  if (hasVideo != null && hasVideo !== '') { where.push('has_video = ?'); args.push(hasVideo === true || hasVideo === '1' || hasVideo === 'true' ? 1 : 0); }
  if (ids) { if (!ids.length) return { items: [], total: 0 }; where.push(`id IN (${ids.map(() => '?').join(',')})`); args.push(...ids.map(Number)); }
  const order = sort === 'priority' ? 'COALESCE(priority, -1) DESC, id' : sort === 'grade' ? 'grade DESC, priority DESC' : sort === 'title' ? 'title COLLATE NOCASE' : sort === 'year' ? 'year DESC, title' : sort === 'speaker' ? 'speaker, year' : 'updated_at DESC';
  const w = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) n FROM media_items WHERE ${w}`, args, 'media:count'))?.n || 0;
  const items = (await queryAll(`SELECT id, slug, title, speaker, speaker_key, tradition, collection, language, year, date, duration_s, has_video, source_kind, youtube_id, channel,
    playback, thumb, quotes_n, crs_n, words_n, doc_id, grade, primary_issue, chain_key, priority, updated_at FROM media_items WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
  [...args, Math.min(200, Number(limit) || 50), Number(offset) || 0], 'media:list')).map(parse);
  return { items, total };
}

/** Filter facets for the listing: value → count, published items only. */
export async function mediaFacets() {
  const facet = async (col) => (await queryAll(`SELECT ${col} v, COUNT(*) n FROM media_items WHERE state = 'done' AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC LIMIT 200`, [], `media:facet-${col}`));
  const [speaker, tradition, collection, year, language] = await Promise.all(['speaker', 'tradition', 'collection', 'year', 'language'].map(facet));
  const video = await queryOne(`SELECT SUM(has_video) v, COUNT(*) n, SUM(duration_s) secs FROM media_items WHERE state = 'done'`, [], 'media:facet-video');
  return { speaker, tradition, collection, year, language, video: video?.v || 0, total: video?.n || 0, hours: Math.round((video?.secs || 0) / 360) / 10 };
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
export const getSpeaker = async (key) => queryOne('SELECT * FROM media_speakers WHERE key = ?', [String(key)], 'media:speaker');
export const speakersByKeys = async (keys) => (keys.length ? queryAll(`SELECT * FROM media_speakers WHERE key IN (${keys.map(() => '?').join(',')})`, keys, 'media:speakers') : []);
export const listSpeakers = async () => queryAll('SELECT * FROM media_speakers ORDER BY name', [], 'media:speakers-all');
const SPK = ['name', 'entity_id', 'file', 'sha', 'width', 'height', 'origin', 'source_url', 'page_url', 'credit', 'licence', 'fetched_at', 'tried_at', 'note'];
export async function upsertSpeaker(row) {
  const vals = SPK.map((k) => (row[k] === undefined ? null : row[k]));
  await transaction([{ sql: `INSERT INTO media_speakers (key, ${SPK.join(', ')}, updated_at) VALUES (?, ${SPK.map(() => '?').join(', ')}, ?)
    ON CONFLICT(key) DO UPDATE SET ${SPK.map((k) => `${k} = COALESCE(excluded.${k}, ${k})`).join(', ')}, updated_at = excluded.updated_at`,
  args: [String(row.key), ...vals, now()] }], 'media:speaker-upsert');
  return getSpeaker(row.key);
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
