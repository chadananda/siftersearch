// dewey-checks-repo — Dewey's holdings-check memo (dewey_checks, migration 161): file sha256 → last verdict + result.
// Callers: api/lib/dewey/check-memo.js. Deps: db.js.
import { query, queryOne } from '../db.js';

const parse = (r) => (r ? { ...r, identified: r.identified ? JSON.parse(r.identified) : null, result: r.result ? JSON.parse(r.result) : null } : null);

export const getCheck = async (sha256) => parse(await queryOne('SELECT * FROM dewey_checks WHERE sha256 = ?', [String(sha256)], 'dewey:check-get'));

export async function saveCheck(sha256, { verdict, identified, result, bytes = null, fileName = null }) {
  await query(`INSERT INTO dewey_checks (sha256, verdict, identified, result, bytes, file_name, checked_at, hits) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(sha256) DO UPDATE SET verdict = excluded.verdict, identified = excluded.identified, result = excluded.result,
      bytes = excluded.bytes, file_name = excluded.file_name, checked_at = excluded.checked_at`,
  [String(sha256), verdict || null, JSON.stringify(identified ?? null), JSON.stringify(result ?? null), bytes, fileName, new Date().toISOString()], 'dewey:check-save');
}

export const countHit = (sha256) => query('UPDATE dewey_checks SET hits = hits + 1 WHERE sha256 = ?', [String(sha256)], 'dewey:check-hit');
