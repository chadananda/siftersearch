// doc_pipeline state — the single source of truth the unified orchestrator walks.
// (docs/architecture/unified-enrichment-pipeline.md). Replaces the scattered content booleans
// (context IS NULL / graph_enriched=0 / hyp_thesis IS NULL) that the six legacy pollers raced on.
// Deps: api/lib/db.js (writes route to the single-writer when SIFTER_WRITER_URL is set), profile.js.

import { query, queryAll, queryOne } from '../db.js';
import { PROFILE_OVERRIDES } from './profile.js';

// Coverage at/above which a stage counts as "done" for a doc. Tolerant because non-prose blocks
// (illustration-list captions, dedications) legitimately produce no disambiguation — counting them
// as failures would make a stricter gate unreachable. The stage modules should record SKIPPED
// distinctly from ERROR; until then, coverage is (enriched prose / total prose+quote).
const DONE_COVERAGE = 0.6;
export const DISAMBIG_VERSION = 'deepseek-disambig-v1';
export const HYPE_VERSION = 'hype-book-v1';

const STAGES = ['disambig', 'hype', 'extract', 'reconcile'];

/** Update one stage's status (+ optional version / error) for a doc. */
export async function setStage(docId, stage, status, { version, error } = {}) {
  if (!STAGES.includes(stage)) throw new Error(`unknown stage: ${stage}`);
  const sets = [`${stage}_status = ?`, 'updated_at = unixepoch()'];
  const args = [status];
  if (version !== undefined) { sets.push(`${stage}_version = ?`); args.push(version); }
  if (error !== undefined) { sets.push('error_detail = ?'); args.push(error ? String(error).slice(0, 500) : null); }
  args.push(docId);
  await query(`UPDATE doc_pipeline SET ${sets.join(', ')} WHERE doc_id = ?`, args);
}

export async function getRow(docId) {
  return queryOne(`SELECT * FROM doc_pipeline WHERE doc_id = ?`, [docId]);
}

export async function setEnabled(docId, enabled) {
  await query(`UPDATE doc_pipeline SET enabled = ?, updated_at = unixepoch() WHERE doc_id = ?`, [enabled ? 1 : 0, docId]);
}

export async function setPriority(docId, priority) {
  await query(`UPDATE doc_pipeline SET priority = ?, updated_at = unixepoch() WHERE doc_id = ?`, [priority, docId]);
}

/**
 * The executor's LIVE run state, reported into the canonical doc_pipeline row (replaces the old status file).
 * `run` = {docId,stage,stageIndex,totalStages,pid,host,startedAt,updatedAt} while grounding, or null when done/idle.
 */
export async function setRun(docId, run) {
  await query(`INSERT INTO doc_pipeline (doc_id) VALUES (?) ON CONFLICT(doc_id) DO NOTHING`, [docId]);
  await query(`UPDATE doc_pipeline SET run_json = ?, updated_at = unixepoch() WHERE doc_id = ?`,
    [run ? JSON.stringify(run) : null, docId]);
}

export async function getRun(docId) {
  const row = await queryOne(`SELECT run_json FROM doc_pipeline WHERE doc_id = ?`, [docId]);
  try { return row?.run_json ? JSON.parse(row.run_json) : null; } catch { return null; }
}

/** The single doc grounding RIGHT NOW (freshest non-idle run_json, within 10 min), or null. Drives the live UI/API. */
export async function activeRun() {
  const rows = await queryAll(
    `SELECT doc_id, run_json, updated_at FROM doc_pipeline WHERE run_json IS NOT NULL ORDER BY updated_at DESC LIMIT 4`);
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows) {
    try {
      const run = JSON.parse(r.run_json);
      // Live only if heartbeated recently (executor refreshes run_json every 30s); past 150s the book is treated dead.
      if (run?.stage && run.stage !== 'done' && (now - (r.updated_at || 0) < 150)) return { doc_id: r.doc_id, ...run };
    } catch { /* skip malformed */ }
  }
  return null;
}

/**
 * Pick the next unit of work by priority, enforcing the DISAMBIGUATE → {HyPE ∥ EXTRACT} order.
 * Returns { doc_id, stage, partial } or null. Only ENABLED docs are eligible.
 */
export async function pickNextWork() {
  // 1) Disambiguation first — lowest priority (earliest) pending/partial enabled doc.
  const dis = await queryOne(
    `SELECT doc_id, disambig_status FROM doc_pipeline
     WHERE enabled = 1 AND disambig_status IN ('pending','partial')
     ORDER BY priority ASC, doc_id ASC LIMIT 1`);
  if (dis) return { doc_id: dis.doc_id, stage: 'disambig', partial: dis.disambig_status === 'partial' };

  // 2) HyPE / extract — only where disambiguation is done at the current version. Independent → either.
  const post = await queryOne(
    `SELECT doc_id, hype_status, extract_status FROM doc_pipeline
     WHERE enabled = 1 AND disambig_status = 'done' AND disambig_version = ?
       AND (hype_status IN ('pending','partial') OR extract_status IN ('pending','partial'))
     ORDER BY priority ASC, doc_id ASC LIMIT 1`, [DISAMBIG_VERSION]);
  if (post) {
    const stage = post.hype_status !== 'done' ? 'hype' : 'extract';
    return { doc_id: post.doc_id, stage, partial: post[`${stage}_status`] === 'partial' };
  }
  return null;
}

/**
 * Mark a document's stages dirty after re-ingest (P3 update integration). Changed paragraphs need
 * re-enrichment; unchanged content keeps its enrichment. Sets the affected stages to 'partial'.
 */
export async function markDirty(docId, changedParaIds = []) {
  const dirty = JSON.stringify(changedParaIds);
  await query(
    `UPDATE doc_pipeline
     SET disambig_status = CASE WHEN disambig_status='done' THEN 'partial' ELSE disambig_status END,
         hype_status     = CASE WHEN hype_status='done'     THEN 'partial' ELSE hype_status END,
         extract_status  = CASE WHEN extract_status='done'  THEN 'partial' ELSE extract_status END,
         reconcile_status = 'pending',
         dirty_paras = ?, updated_at = unixepoch()
     WHERE doc_id = ?`, [dirty, docId]);
}

/**
 * (Re)build doc_pipeline from the current DB state in one pass. Idempotent (INSERT OR REPLACE).
 * Derives each stage's status from actual coverage; then applies the known-book overrides
 * (priority/profile/lang/enabled). Safe to run repeatedly.
 */
export async function backfill() {
  const newFmt = `json_valid(hyp_questions) AND json_type(hyp_questions)='array' AND json_array_length(hyp_questions)>=4 AND hyp_thesis IS NOT NULL AND trim(hyp_thesis)<>''`;
  await query(`
    INSERT OR REPLACE INTO doc_pipeline
      (doc_id, priority, enabled, disambig_status, disambig_version, hype_status, hype_version, extract_status, updated_at)
    SELECT d.id, 1000, 0,
      CASE WHEN COALESCE(c.dis,0)=0 THEN 'pending' WHEN c.dis*1.0/c.total>=${DONE_COVERAGE} THEN 'done' ELSE 'partial' END,
      CASE WHEN COALESCE(c.dis,0)>0 THEN '${DISAMBIG_VERSION}' ELSE NULL END,
      CASE WHEN COALESCE(c.hy,0)=0 THEN 'pending' WHEN c.hy*1.0/c.total>=${DONE_COVERAGE} THEN 'done' ELSE 'partial' END,
      CASE WHEN COALESCE(c.hy,0)>0 THEN '${HYPE_VERSION}' ELSE NULL END,
      CASE WHEN COALESCE(cl.claims,0)>0 THEN 'done' ELSE 'pending' END,
      unixepoch()
    FROM docs d
    JOIN (
      SELECT doc_id, COUNT(*) total,
        SUM(CASE WHEN context_model='${DISAMBIG_VERSION}' AND context IS NOT NULL THEN 1 ELSE 0 END) dis,
        SUM(CASE WHEN ${newFmt} THEN 1 ELSE 0 END) hy
      FROM content WHERE blocktype IN ('paragraph','quote') AND deleted_at IS NULL GROUP BY doc_id
    ) c ON c.doc_id = d.id
    LEFT JOIN (SELECT doc_id, COUNT(*) claims FROM entity_claims GROUP BY doc_id) cl ON cl.doc_id = d.id
    WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND c.total > 0`);

  // Apply known-book overrides (priority/profile/lang) + release them into enrichment (enabled=1).
  for (const [docId, ov] of Object.entries(PROFILE_OVERRIDES)) {
    await query(
      `UPDATE doc_pipeline SET priority=?, profile=?, lang=?, enabled=1, updated_at=unixepoch() WHERE doc_id=?`,
      [ov.priority, ov.profile, ov.lang, docId]);
  }
  return statusReport();
}

/** Aggregate status view — counts by stage-status, plus the enabled worklist in priority order. */
export async function statusReport() {
  const agg = await queryAll(`
    SELECT 'disambig' stage, disambig_status status, COUNT(*) n FROM doc_pipeline GROUP BY disambig_status
    UNION ALL SELECT 'hype', hype_status, COUNT(*) FROM doc_pipeline GROUP BY hype_status
    UNION ALL SELECT 'extract', extract_status, COUNT(*) FROM doc_pipeline GROUP BY extract_status`);
  const enabled = await queryAll(`
    SELECT p.doc_id, p.priority, p.profile, p.disambig_status, p.hype_status, p.extract_status, p.run_json, d.title
    FROM doc_pipeline p JOIN docs d ON d.id = p.doc_id
    WHERE p.enabled = 1 ORDER BY p.priority ASC`);
  const totals = await queryOne(`SELECT COUNT(*) docs, SUM(enabled) enabled FROM doc_pipeline`);
  return { totals, agg, enabled };
}
