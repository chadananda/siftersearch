// activity-repo — the public activity log (activity_log, migration 152): short content-free lines from the machinery that
// the home-page Observatory's terminal scrolls (jobs, indexer progress, ledger, findability probes, Anís turns without text
// or person). logActivity never throws — a log line is never worth a failed job. Deps: db.js.
import { query, queryAll } from '../db.js';

const KEEP = 5000;
let writes = 0;

/** Append one line (kind: a short tag like 'index', 'ledger', 'probe', 'anis', 'job'). Trimmed to 200 chars. */
export async function logActivity(kind, text, at = Math.floor(Date.now() / 1000)) {
  try {
    await query('INSERT INTO activity_log (at, kind, text) VALUES (?, ?, ?)', [at, String(kind).slice(0, 16), String(text).replace(/\s+/g, ' ').slice(0, 200)], 'activity:log');
    if (++writes % 200 === 0) await query(`DELETE FROM activity_log WHERE id <= (SELECT MAX(id) FROM activity_log) - ${KEEP}`, [], 'activity:prune');
  } catch { /* a log line never breaks the work it describes */ }
}

/** Lines after an id (oldest first), or the newest `limit` when no id. */
export const recentActivity = async (afterId = 0, limit = 200) => (afterId
  ? queryAll('SELECT id, at, kind, text FROM activity_log WHERE id > ? ORDER BY id LIMIT ?', [Number(afterId), Math.min(Number(limit) || 200, 500)], 'activity:after')
  : (await queryAll('SELECT id, at, kind, text FROM activity_log ORDER BY id DESC LIMIT ?', [Math.min(Number(limit) || 200, 500)], 'activity:recent')).reverse());
