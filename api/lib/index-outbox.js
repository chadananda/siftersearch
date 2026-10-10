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

export const QDRANT_PARAGRAPH_COLLECTIONS = Object.freeze(['phrases', 'paragraphs_kw', 'hype']);

/**
 * Drain the outbox: paragraphs that are live again are dropped (their upsert wins — ids can be reused); the rest are
 * removed from their Meili index and from every Qdrant paragraph collection, then cleared. An engine failure leaves the
 * rows queued for the next tick. → { removed, skippedLive, meiliJobs, qdrantCalls }
 */
export async function drainIndexOutbox({ meili = null, qdrant = null, registry = {}, max = 20000, chunk = 5000 } = {}) {
  const rows = await queryAll(`SELECT o.para_id, o.doc_id, d.source_site,
      EXISTS (SELECT 1 FROM content c JOIN docs cd ON cd.id = c.doc_id WHERE c.id = o.para_id AND c.deleted_at IS NULL
        AND COALESCE(c.is_duplicate, 0) = 0 AND cd.deleted_at IS NULL AND cd.duplicate_of IS NULL) AS live
      FROM index_outbox o LEFT JOIN docs d ON d.id = o.doc_id ORDER BY o.queued_at LIMIT ?`, [max], 'outbox:read');
  if (!rows.length) return { removed: 0, skippedLive: 0, meiliJobs: 0, qdrantCalls: 0 };
  const dead = rows.filter((r) => !r.live);
  let meiliJobs = 0, qdrantCalls = 0;
  if (meili && dead.length) {
    // a doc row already hard-deleted → unknown site: remove from the primary index (where all library paragraphs live)
    const byIndex = new Map();
    for (const r of dead) { const ix = paragraphIndexFor({ source_site: r.source_site }, registry); byIndex.set(ix, [...(byIndex.get(ix) || []), r.para_id]); }
    for (const [ix, ids] of byIndex) for (let i = 0; i < ids.length; i += chunk) { await meili.index(ix).deleteDocuments(ids.slice(i, i + chunk)); meiliJobs++; }
  }
  if (qdrant && dead.length) {
    const ids = dead.map((r) => r.para_id);
    for (const coll of QDRANT_PARAGRAPH_COLLECTIONS) {
      for (let i = 0; i < ids.length; i += 1000) {
        await qdrant(`/collections/${coll}/points/delete?wait=false`, { filter: { must: [{ key: 'paragraph_id', match: { any: ids.slice(i, i + 1000) } }] } });
        qdrantCalls++;
      }
    }
  }
  const done = rows.map((r) => r.para_id);
  for (let i = 0; i < done.length; i += 500) {
    await transaction([{ sql: `DELETE FROM index_outbox WHERE para_id IN (${done.slice(i, i + 500).map(() => '?').join(',')})`, args: done.slice(i, i + 500) }], 'outbox:clear');
  }
  return { removed: dead.length, skippedLive: rows.length - dead.length, meiliJobs, qdrantCalls };
}
