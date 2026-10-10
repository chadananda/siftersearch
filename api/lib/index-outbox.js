// INDEX OUTBOX — how a removal reaches every search index (planning/architecture-data-access-20261009.md, P2).
// SQLite TRIGGERS (migration 143) enqueue a paragraph the moment it is soft-deleted, marked a duplicate, or hard-deleted —
// in the same transaction, whichever code did it (route, ingester, raw script) — so no path can forget. The sync worker
// drains the queue to each engine: Meili (the doc's own paragraph index) and Qdrant (phrases · paragraphs_kw · hype, by
// paragraph_id). Before 10-09 the worker RE-UPSERTED deleted/duplicate rows and nothing ever deleted a Qdrant point.
// Deps: db.js; engine clients are passed in (Meili client, Qdrant request fn) so this file names no engine.
import { queryAll, transaction } from './db.js';

/** The Meili paragraph index a doc's paragraphs live in (shared with the worker's upserts: one routing rule). */
export function paragraphIndexFor(doc, registry = {}) {
  if (!doc?.source_site) return 'paragraphs';
  const prefix = registry[doc.source_site]?.meili_index_prefix;
  return prefix ? `siftersearch_${prefix}_paragraphs` : 'paragraphs';
}

/** Explicit enqueue for callers outside the triggers' reach (e.g. a site-only store). Idempotent. */
export async function enqueueIndexDeletes(paraIds, docId = null) {
  const ids = [...new Set((paraIds || []).map(Number).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 500) {
    await transaction(ids.slice(i, i + 500).map((id) => ({
      sql: 'INSERT OR REPLACE INTO index_outbox (para_id, doc_id) VALUES (?, ?)', args: [id, docId] })), 'outbox:enqueue');
  }
  return ids.length;
}

/**
 * BACKLOG: rows that left the corpus BEFORE the triggers existed (migration 143) were never removed from the engines.
 * Enqueue every non-live row in ONE id window (content.id in (afterId, afterId+span]) — a short primary-key range read,
 * never a long scan (a long read transaction balloons the WAL). Callers walk the windows and pace on queue depth.
 * → { enqueued, nextAfterId, done }
 */
export async function enqueueBacklogWindow(afterId = 0, span = 50000) {
  const [{ maxId } = {}] = await queryAll('SELECT MAX(id) AS maxId FROM content', [], 'outbox:backlog-max');
  const hi = afterId + span;
  const rows = await queryAll(`SELECT c.id, c.doc_id FROM content c LEFT JOIN docs d ON d.id = c.doc_id
      WHERE c.id > ? AND c.id <= ? AND (c.deleted_at IS NOT NULL OR COALESCE(c.is_duplicate, 0) = 1
        OR d.id IS NULL OR d.deleted_at IS NOT NULL OR d.duplicate_of IS NOT NULL)`, [afterId, hi], 'outbox:backlog-window');
  for (let i = 0; i < rows.length; i += 500) {
    await transaction(rows.slice(i, i + 500).map((r) => ({
      sql: 'INSERT OR REPLACE INTO index_outbox (para_id, doc_id) VALUES (?, ?)', args: [r.id, r.doc_id] })), 'outbox:enqueue');
  }
  return { enqueued: rows.length, nextAfterId: hi, done: hi >= (maxId || 0) };
}

/** Rows waiting in the outbox (pacing for backlog walks). */
export async function outboxDepth() {
  const [{ n } = {}] = await queryAll('SELECT COUNT(*) AS n FROM index_outbox', [], 'outbox:depth');
  return n || 0;
}

export const QDRANT_PARAGRAPH_COLLECTIONS = Object.freeze(['phrases', 'paragraphs_kw', 'hype']);

/**
 * Drain the outbox: paragraphs that are live again are dropped (their upsert wins — ids can be reused); the rest are
 * removed from their Meili index and from every Qdrant paragraph collection. Works in slices of `chunk` rows and clears
 * each slice as soon as every engine took it, so progress survives a slow engine or the caller's timeout; stops starting
 * slices after `budgetMs`. An engine failure leaves that slice queued for the next tick.
 * → { removed, skippedLive, meiliJobs, qdrantCalls }
 */
export async function drainIndexOutbox({ meili = null, qdrant = null, registry = {}, max = 20000, chunk = 5000, budgetMs = 60000 } = {}) {
  const t0 = Date.now();
  const rows = await queryAll(`SELECT o.para_id, o.doc_id, d.source_site,
      EXISTS (SELECT 1 FROM content c JOIN docs cd ON cd.id = c.doc_id WHERE c.id = o.para_id AND c.deleted_at IS NULL
        AND COALESCE(c.is_duplicate, 0) = 0 AND cd.deleted_at IS NULL AND cd.duplicate_of IS NULL) AS live
      FROM index_outbox o LEFT JOIN docs d ON d.id = o.doc_id ORDER BY o.queued_at LIMIT ?`, [max], 'outbox:read');
  let removed = 0, skippedLive = 0, meiliJobs = 0, qdrantCalls = 0;
  for (let s = 0; s < rows.length && Date.now() - t0 < budgetMs; s += chunk) {
    const slice = rows.slice(s, s + chunk), dead = slice.filter((r) => !r.live);
    // Qdrant first: the engine search is moving to (and its deletes are idempotent, so a retry after a Meili failure
    // repeats them harmlessly) — Meili down or switched off must never hold Qdrant removals back.
    if (qdrant && dead.length) {
      const ids = dead.map((r) => r.para_id);
      for (const coll of QDRANT_PARAGRAPH_COLLECTIONS) {
        for (let i = 0; i < ids.length; i += 1000) {
          await qdrant(`/collections/${coll}/points/delete?wait=false`, { filter: { must: [{ key: 'paragraph_id', match: { any: ids.slice(i, i + 1000) } }] } });
          qdrantCalls++;
        }
      }
    }
    if (meili && dead.length) {
      // a doc row already hard-deleted → unknown site: remove from the primary index (where all library paragraphs live)
      const byIndex = new Map();
      for (const r of dead) { const ix = paragraphIndexFor({ source_site: r.source_site }, registry); byIndex.set(ix, [...(byIndex.get(ix) || []), r.para_id]); }
      for (const [ix, ids] of byIndex) { await meili.index(ix).deleteDocuments(ids); meiliJobs++; }
    }
    const done = slice.map((r) => r.para_id);
    for (let i = 0; i < done.length; i += 500) {
      await transaction([{ sql: `DELETE FROM index_outbox WHERE para_id IN (${done.slice(i, i + 500).map(() => '?').join(',')})`, args: done.slice(i, i + 500) }], 'outbox:clear');
    }
    removed += dead.length; skippedLive += slice.length - dead.length;
  }
  return { removed, skippedLive, meiliJobs, qdrantCalls };
}
