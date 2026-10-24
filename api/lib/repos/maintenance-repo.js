// maintenance-repo — the 10-24 night window's schema maintenance as NAMED steps (no arbitrary SQL over HTTP): dead content
// indexes, the unread table_counts triggers, the telemetry tables that moved to telemetry.db, ANALYZE, and a per-row write
// probe. Each DROP frees a whole b-tree INSIDE the single writer (10-23: 17 s and 68 s), so steps run one at a time from
// scripts/ops/db-maintenance.sh with the writers drained around each. Evidence: planning/content-write-cost-20261023.md.
// Deps: db.js (reads here, DDL through the writer).
import { queryAll, transaction, telemetryAll } from '../db.js';

const idx = (name, why) => ({ kind: 'index', name, why, sql: [`DROP INDEX IF EXISTS ${name}`] });
const TRIGGERS = ['trg_content_insert', 'trg_content_soft_delete', 'trg_content_undelete', 'trg_content_synced', 'trg_content_unsynced',
  'trg_content_insert_doc_count', 'trg_content_delete_doc_count', 'trg_content_embedding_set', 'trg_content_embedding_clear',
  'trg_docs_insert', 'trg_docs_soft_delete', 'trg_docs_undelete'];
export const TELEMETRY_MOVED = ['query_stats', 'slow_query_log', 'db_write_stats'];

/** The window, in order. `why` is the evidence line written to the log. */
export const MAINTENANCE_STEPS = [
  { kind: 'probe', name: 'probe-before', why: 'per-row INSERT cost before (rolled back)' },
  idx('idx_content_doc_graph', 'graph_enriched = 0: only the graph extractor reads it (retired 07-10)'),
  idx('idx_content_graph_unsync', 'graph_enriched = 0: retired graph extractor; /pipeline/health no longer counts it'),
  idx('idx_content_needs_thesis', 'hyp_thesis IS NULL: only LEGACY sonnet-enrichment (retired 07-10)'),
  idx('idx_content_enhanced_unsynced', 'HyPE→Meili flag (Meili retired 10-21); hype.js forces idx_content_hype_to_sync; getEnhancedUnsynced has no caller'),
  idx('idx_content_synced', 'every live synced predicate also says deleted_at IS NULL → idx_content_unsynced_partial; the bare counts are in dead getIngestionStats'),
  idx('idx_content_synced_deleted', 'synced = 0 → unsynced_partial; doc-scoped synced = 1 → doc_deleted; no other synced = 1 filter'),
  idx('idx_content_hash_embed_length', 'same 7k rows as idx_content_oversized; 0 plans; LENGTH(text) <= ? never matches the expression'),
  idx('idx_content_embed_length', 'same rows as idx_content_needs_embedding_v2, which every embedding-backlog query uses'),
  idx('idx_content_recently_synced', 'synced = 1 AND updated_at: only the Meili full-sync check (MEILI_WRITES=off) and a removed health route'),
  idx('idx_content_sync_lookup', 'same WHERE and leading doc_id as idx_content_dirty_doc_updated'),
  idx('idx_content_not_duplicate', 'no query filters is_duplicate = 0 (the live ones use COALESCE(is_duplicate, 0) = 0)'),
  idx('idx_content_needs_context', 'context IS NULL: only getUndisambiguated, whose enhancement-worker runs nowhere'),
  { kind: 'triggers', name: 'table-counts-triggers', why: 'table_counts is read by nothing (9 on content, 3 on docs)',
    sql: TRIGGERS.map((t) => `DROP TRIGGER IF EXISTS ${t}`) },
  ...TELEMETRY_MOVED.map((t) => ({ kind: 'table', name: t, why: 'written to telemetry.db since db-write-path-20261023; the sifter.db copy is dead',
    sql: [`DROP TABLE IF EXISTS ${t}`] })),
  { kind: 'analyze', name: 'analyze-content', why: 'planner statistics after the drops (approximate: analysis_limit 1000 — a full ANALYZE reads every index)',
    sql: ['PRAGMA analysis_limit = 1000', 'ANALYZE content', 'PRAGMA analysis_limit = 0'] },
  { kind: 'probe', name: 'probe-after', why: 'per-row INSERT cost after (rolled back)' },
];
export const stepNamed = (name) => MAINTENANCE_STEPS.find((s) => s.name === name) || null;

const freelist = async () => (await queryAll('SELECT freelist_count AS n FROM pragma_freelist_count', [], 'maintenance:freelist'))[0]?.n ?? null;
const pageSize = async () => (await queryAll('SELECT page_size AS n FROM pragma_page_size', [], 'maintenance:page-size'))[0]?.n ?? 4096;
/** Names (of `names`) that still exist in sqlite_master. */
export async function existing(names) {
  if (!names.length) return [];
  return (await queryAll(`SELECT name FROM sqlite_master WHERE name IN (${names.map(() => '?').join(',')})`, names, 'maintenance:exists')).map((r) => r.name);
}
const objectNames = (step) => (step.kind === 'triggers' ? TRIGGERS : step.kind === 'index' || step.kind === 'table' ? [step.name] : []);

/** The telemetry tables may go only when telemetry.db holds all three and is being written now. */
export async function telemetryStoreLive({ maxAgeMin = 30 } = {}) {
  const have = (await telemetryAll(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TELEMETRY_MOVED.map(() => '?').join(',')})`, TELEMETRY_MOVED, 'maintenance:tel-tables')).map((r) => r.name);
  const last = (await telemetryAll('SELECT MAX(minute) AS m FROM db_write_stats', [], 'maintenance:tel-recent'))[0]?.m || null;
  const fresh = !!last && Date.now() - Date.parse(`${last}:00Z`) < maxAgeMin * 60000;
  return { ok: have.length === TELEMETRY_MOVED.length && fresh, have, last_minute: last };
}

const rnd = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz     '[Math.floor(Math.random() * 31)]).join('');
const hex = () => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
/** Per-row INSERT cost on the live schema: `rows` paragraph inserts into a live doc, then a statement that must fail (a
 *  duplicate primary key), so the writer rolls the whole request back (its own SAVEPOINT) — nothing is kept. */
export async function writeProbe({ rows = 200 } = {}) {
  const [doc] = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1', [], 'maintenance:probe-doc');
  const [first] = await queryAll('SELECT id FROM content ORDER BY id LIMIT 1', [], 'maintenance:probe-pk');
  const statements = Array.from({ length: rows }, (_, i) => ({
    sql: 'INSERT INTO content (doc_id, paragraph_index, text, content_hash, normalized_hash, blocktype) VALUES (?, ?, ?, ?, ?, ?)',
    args: [doc.id, 900000 + i, rnd(340), hex(), hex(), 'paragraph'] }));
  statements.push({ sql: 'INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, 0, ?)', args: [first.id, doc.id, 'maintenance probe: must fail'] });
  const t0 = Date.now();
  let error = null;
  try { await transaction(statements, 'maintenance:probe'); } catch (e) { error = e.message; }
  const ms = Date.now() - t0;
  const rolledBack = /UNIQUE|PRIMARY KEY|constraint/i.test(error || '');
  return { rows, ms, ms_per_row: +(ms / rows).toFixed(2), rolled_back: rolledBack, error: rolledBack ? null : error };
}

/** Run one named step. → { step, kind, ms, freed_bytes, existed, remaining, ... } */
export async function runMaintenanceStep(name) {
  const step = stepNamed(name);
  if (!step) throw Object.assign(new Error(`unknown maintenance step ${name}`), { statusCode: 404 });
  if (step.kind === 'probe') return { step: name, kind: 'probe', why: step.why, ...(await writeProbe()) };
  if (step.kind === 'table') {
    const live = await telemetryStoreLive();
    if (!live.ok) return { step: name, kind: 'table', skipped: 'telemetry.db not verified live', telemetry: live };
  }
  const names = objectNames(step);
  const existed = await existing(names);
  if (names.length && !existed.length) return { step: name, kind: step.kind, ms: 0, existed: [], skipped: 'already gone' };
  const [ps, before] = [await pageSize(), await freelist()];
  const t0 = Date.now();
  let error = null;
  try { await transaction(step.sql.map((sql) => ({ sql })), `maintenance:${name}`); } catch (e) { error = e.message; }
  // a DROP longer than the client's 90 s timeout still completes in the writer: wait for the object to go
  let remaining = await existing(names);
  while (error && remaining.length && Date.now() - t0 < 15 * 60000) { await new Promise((r) => setTimeout(r, 5000)); remaining = await existing(names); }
  const ms = Date.now() - t0;
  const after = await freelist();
  return { step: name, kind: step.kind, why: step.why, ms, existed, remaining, error: remaining.length ? error : null,
    freed_pages: before != null && after != null ? after - before : null,
    freed_bytes: before != null && after != null ? (after - before) * ps : null };
}
