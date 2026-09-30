// Meilisearch deletions, queued and sent in bulk. A Meili job costs ~95 s whatever its size (1 doc/job 94 s median,
// 500 docs/job 413 s — measured 2026-09-29), so ingest must never send one job per document.
// :deps: db.js (queue table meili_pending_deletes, migr 138) · a Meili client passed in by the worker
// :edge: a deleted paragraph id can be REUSED by a new paragraph; ids that are live again are skipped (their upsert wins).
import { queryAll, transaction } from './db.js';

/** Queue paragraph ids for deletion from a Meili index (idempotent). */
export async function queueMeiliDeletes(ids, indexUid = 'paragraphs') {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  for (let i = 0; i < list.length; i += 500) {
    await transaction(list.slice(i, i + 500).map((id) => ({
      sql: 'INSERT OR IGNORE INTO meili_pending_deletes (para_id, index_uid) VALUES (?, ?)', args: [id, indexUid] })), 'meili:queue-deletes');
  }
  return list.length;
}

/**
 * Send queued deletions as a few large jobs (chunk ids per job). Returns { sent, skippedLive, jobs }.
 * Ids now belonging to a live paragraph are dropped from the queue without deleting (the new row's upsert replaces it).
 */
export async function flushMeiliDeletes(meili, { chunk = 5000, max = 50000 } = {}) {
  const rows = await queryAll(`SELECT q.para_id, q.index_uid,
      EXISTS (SELECT 1 FROM content c WHERE c.id = q.para_id AND c.deleted_at IS NULL) AS live
      FROM meili_pending_deletes q ORDER BY q.queued_at LIMIT ?`, [max], 'meili:pending-read');
  if (!rows.length) return { sent: 0, skippedLive: 0, jobs: 0 };
  const byIndex = new Map();
  for (const r of rows) if (!r.live) byIndex.set(r.index_uid, [...(byIndex.get(r.index_uid) || []), r.para_id]);
  let sent = 0, jobs = 0;
  for (const [indexUid, ids] of byIndex) {
    for (let i = 0; i < ids.length; i += chunk) {
      await meili.index(indexUid).deleteDocuments(ids.slice(i, i + chunk));
      sent += Math.min(chunk, ids.length - i); jobs++;
    }
  }
  const done = rows.map((r) => [r.para_id, r.index_uid]);
  for (let i = 0; i < done.length; i += 500) {
    await transaction(done.slice(i, i + 500).map(([id, idx]) => ({
      sql: 'DELETE FROM meili_pending_deletes WHERE para_id = ? AND index_uid = ?', args: [id, idx] })), 'meili:pending-clear');
  }
  return { sent, skippedLive: rows.filter((r) => r.live).length, jobs };
}
