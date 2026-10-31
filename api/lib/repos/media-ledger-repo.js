// media-ledger-repo — the per-(talk, stage) ledger (media_stages, migration 190). Mirrors meta.json's stages; read for counts,
// rates and "which talks have / lack stage X". Writes go through the single writer. Callers: media/item.js, whole-result.js,
// ops reports (reconcile), routes/media-ops.js, Dewey. Deps: db.js, media/ledger.js.
import { queryAll, transaction } from '../db.js';
import { stageRows, stageDiff } from '../media/ledger.js';

const now = () => new Date().toISOString();

export const itemStages = (itemId) => queryAll('SELECT stage, status, at, ms, host, detail, updated_at FROM media_stages WHERE item_id = ? ORDER BY at', [Number(itemId)], 'media-ledger:item');

/** Make the rows of one talk equal its meta.stages (only the difference is written). → { upserted, removed } */
export async function syncItemStages(itemId, stages) {
  const id = Number(itemId);
  if (!Number.isFinite(id)) return { upserted: 0, removed: 0 };
  const { upsert, remove } = stageDiff(await itemStages(id), stageRows(stages));
  if (!upsert.length && !remove.length) return { upserted: 0, removed: 0 };
  const t = now();
  await transaction([
    ...upsert.map((r) => ({ sql: `INSERT INTO media_stages (item_id, stage, status, at, ms, host, detail, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id, stage) DO UPDATE SET status = excluded.status, at = excluded.at, ms = excluded.ms, host = excluded.host, detail = excluded.detail, updated_at = excluded.updated_at`,
    args: [id, r.stage, r.status, r.at, r.ms, r.host, r.detail, t] })),
    ...(remove.length ? [{ sql: `DELETE FROM media_stages WHERE item_id = ? AND stage IN (${remove.map(() => '?').join(',')})`, args: [id, ...remove] }] : []),
  ], 'media-ledger:sync');
  return { upserted: upsert.length, removed: remove.length };
}

/** Per stage × status: talks and audio-hours (excluded/duplicate talks left out). */
export const stageCounts = () => queryAll(`SELECT s.stage, s.status, COUNT(*) n, ROUND(SUM(COALESCE(m.duration_s, 0)) / 3600.0, 1) audio_h
  FROM media_stages s JOIN media_items m ON m.id = s.item_id WHERE m.state NOT IN ('excluded', 'duplicate') GROUP BY s.stage, s.status ORDER BY s.stage`, [], 'media-ledger:counts');

/** Stages finished since `sinceIso`: talks and audio-hours per stage (the rate). */
export const stagesSince = (sinceIso) => queryAll(`SELECT s.stage, COUNT(*) n, ROUND(SUM(COALESCE(m.duration_s, 0)) / 3600.0, 1) audio_h
  FROM media_stages s JOIN media_items m ON m.id = s.item_id WHERE s.status = 'done' AND s.at >= ? GROUP BY s.stage ORDER BY n DESC`, [String(sinceIso)], 'media-ledger:since');

/** Talks that HAVE (status given) or LACK (missing = true) a stage, id order after `afterId`. */
export function itemsByStage({ stage, status = 'done', missing = false, afterId = 0, limit = 50 }) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 50));
  if (missing) return queryAll(`SELECT m.id, m.slug, m.title, m.speaker, m.state, m.duration_s FROM media_items m
    WHERE m.id > ? AND m.dir IS NOT NULL AND m.state NOT IN ('excluded', 'duplicate')
    AND NOT EXISTS (SELECT 1 FROM media_stages s WHERE s.item_id = m.id AND s.stage = ? AND s.status = 'done') ORDER BY m.id LIMIT ?`, [Number(afterId) || 0, String(stage), lim], 'media-ledger:missing');
  return queryAll(`SELECT m.id, m.slug, m.title, m.speaker, m.state, m.duration_s, s.status, s.at, s.host FROM media_stages s JOIN media_items m ON m.id = s.item_id
    WHERE s.stage = ? AND s.status = ? AND m.id > ? ORDER BY m.id LIMIT ?`, [String(stage), String(status), Number(afterId) || 0, lim], 'media-ledger:by-stage');
}

/** Talks with a folder (the reconcile walk), id order after `afterId`. */
export const ledgerWalk = ({ afterId = 0, limit = 200 } = {}) => queryAll(`SELECT id, dir FROM media_items WHERE dir IS NOT NULL AND state != 'duplicate' AND id > ? ORDER BY id LIMIT ?`,
  [Number(afterId) || 0, Math.max(1, Math.min(1000, Number(limit) || 200))], 'media-ledger:walk');

/** Talks whose title, slug or speaker contains `q` (≤ 10) — Dewey's "how is <talk> doing?". */
export const findTalks = (q, limit = 10) => queryAll(`SELECT id, slug, title, speaker, state, stage, duration_s, published_at FROM media_items
  WHERE state != 'duplicate' AND (title LIKE ? OR slug LIKE ? OR speaker LIKE ?) ORDER BY published_at IS NULL, id LIMIT ?`,
  [`%${q}%`, `%${q}%`, `%${q}%`, Math.max(1, Math.min(10, Number(limit) || 10))], 'media-ledger:find');

/** The re-run campaign's work list (ops/media-jobs.js mediaRerunJob): finished talks whose `stage` is done and not already marked stale,
 *  narrowed by the recorded tool record ({ fp_not } = recorded fp differs or none recorded · { fp } · { tool }). Id order. */
export function rerunCandidates({ stage, where = {} }) {
  const args = [String(stage)];
  let w = '';
  if (where.fp_not) { w = " AND COALESCE(json_extract(s.detail, '$.fp'), '') != ?"; args.push(String(where.fp_not)); }
  else if (where.fp) { w = " AND json_extract(s.detail, '$.fp') = ?"; args.push(String(where.fp)); }
  else if (where.tool) { w = " AND json_extract(s.detail, '$.tool') = ?"; args.push(String(where.tool)); }
  return queryAll(`SELECT m.id, m.dir, m.duration_s, m.state, m.published_at FROM media_stages s JOIN media_items m ON m.id = s.item_id
    WHERE s.stage = ? AND s.status = 'done' AND m.state = 'done' AND m.dir IS NOT NULL AND COALESCE(json_extract(s.detail, '$.stale'), 0) = 0${w} ORDER BY m.id`, args, 'media-ledger:rerun');
}

/** Stages a re-run campaign has marked and the feed has not yet re-done (ledger detail.stale): the feed's campaign stages. */
export const campaignStages = async () => (await queryAll(`SELECT DISTINCT stage FROM media_stages WHERE json_extract(detail, '$.stale') = 1`, [], 'media-ledger:campaign-stages')).map((r) => r.stage);
/** Published talks a campaign marked stale for `stage`, in id order: the feed's work list for a campaign stage (exactly the marked talks, nothing else). */
export const staleByStage = async (stage, limit = 6) => queryAll(`SELECT m.id, m.slug, m.dir FROM media_stages s JOIN media_items m ON m.id = s.item_id
  WHERE s.stage = ? AND json_extract(s.detail, '$.stale') = 1 AND m.state = 'done' AND m.dir IS NOT NULL ORDER BY m.id LIMIT ?`, [String(stage), Number(limit) || 6], 'media-ledger:stale-by-stage');

/** Recorded $ per audio-hour of a stage's last 500 runs (the tick's `usd`): the rerun dry run's p75 estimate. */
export const stageUsd = async (stage) => (await queryAll(`SELECT json_extract(s.detail, '$.usd') * 3600.0 / m.duration_s v FROM media_stages s JOIN media_items m ON m.id = s.item_id
  WHERE s.stage = ? AND json_extract(s.detail, '$.usd') IS NOT NULL AND m.duration_s > 0 ORDER BY s.at DESC LIMIT 500`, [String(stage)], 'media-ledger:stage-usd')).map((r) => Number(r.v));
