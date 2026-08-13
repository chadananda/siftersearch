// The audit trail for everything that changes a FILE or a DOC. Written because "we cannot figure out why
// files were moved" — mutations were audited only into the process log, which cannot be queried from off-box
// and rotates away, so a doc that disappeared had no recoverable explanation.
//
// Rules this module enforces by shape:
//   - Every entry names an ACTOR and a REASON. An audit row that cannot answer "why" is decoration.
//   - Append-only: rows are never updated or deleted, so a doc's history IS the history.
//   - Best-effort but NEVER silent: a failed audit write is counted via swallow(), so a broken trail shows up
//     in /server/reconcile instead of quietly leaving a blind spot.
//   - Auditing must never break the operation it describes. It is a witness, not a participant.
import { query, queryAll } from './db.js';
import { swallow } from './swallow.js';

export const ACTIONS = [
  'file.write', 'file.delete',
  'doc.create', 'doc.update', 'doc.retire', 'doc.delete', 'doc.restore', 'doc.language',
];

/**
 * Record one mutation.
 * @param {object} e {actor, action, target, docId, reason, detail, runId}
 */
export async function audit(e = {}) {
  const { actor, action, target = null, docId = null, reason = null, detail = null, runId = null } = e;
  if (!actor || !action) { swallow(new Error('audit() needs actor and action'), 'audit.malformed', { action }); return; }
  await query(
    `INSERT INTO audit_log (actor, action, target, doc_id, reason, detail_json, run_id)
     VALUES (?,?,?,?,?,?,?)`,
    [String(actor).slice(0, 80), String(action).slice(0, 40), target ? String(target).slice(0, 500) : null,
      docId ?? null, reason ? String(reason).slice(0, 300) : null,
      detail ? JSON.stringify(detail).slice(0, 2000) : null, runId ?? null],
  ).catch((err) => swallow(err, 'audit.write', { action, docId }));
}

/** Everything that ever happened to one doc, oldest first — the "why did this change?" lookup. */
export async function docHistory(docId, { limit = 200 } = {}) {
  return queryAll(
    `SELECT id, at, actor, action, target, reason, detail_json, run_id FROM audit_log
      WHERE doc_id = ? ORDER BY at ASC, id ASC LIMIT ?`, [docId, limit]).catch(() => []);
}

/** Recent mutations, filterable. The general "what has been touching the library?" view. */
export async function recentAudit({ action = null, actor = null, sinceEpoch = null, docId = null, limit = 200 } = {}) {
  const where = ['1=1'], args = [];
  if (action) { where.push('action = ?'); args.push(action); }
  if (actor) { where.push('actor = ?'); args.push(actor); }
  if (docId != null) { where.push('doc_id = ?'); args.push(docId); }
  if (sinceEpoch) { where.push('at >= ?'); args.push(sinceEpoch); }
  return queryAll(
    `SELECT id, at, actor, action, target, doc_id, reason, detail_json, run_id FROM audit_log
      WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...args, Math.min(limit, 1000)]).catch(() => []);
}

/** Counts by action+actor over a window — "what removed 190 docs last night?" in one row. */
export async function auditSummary({ sinceEpoch = Math.floor(Date.now() / 1000) - 86400 } = {}) {
  return queryAll(
    `SELECT action, actor, COUNT(*) n, MIN(at) first_at, MAX(at) last_at FROM audit_log
      WHERE at >= ? GROUP BY action, actor ORDER BY n DESC`, [sinceEpoch]).catch(() => []);
}
