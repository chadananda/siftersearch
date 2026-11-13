// question-log-repo — one row per standalone question Anís researched (what is asked, where, how well the research cache served it). Server processes only. Deps: db.js
import { query, queryAll } from '../db.js';

/** "7d" | "24h" | "30m" | ISO → 'YYYY-MM-DD HH:MM:SS' UTC (sqlite CURRENT_TIMESTAMP form); junk/empty → null (no lower bound). Pure. */
export function sinceStamp(since, now = Date.now()) {
  const m = /^(\d+)\s*([mhd])$/i.exec(String(since || '').trim());
  const t = m ? now - Number(m[1]) * { m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()] : Date.parse(since);
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') : null;
}

export const logQuestion = ({ question, hash, format = null, researchSetId = null, similarity = null, outcome, channel = null, site = null, ms = null }) =>
  query(`INSERT INTO anis_question_log (question, question_hash, format, research_set_id, similarity, outcome, channel, site, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [question, hash, format, researchSetId, similarity, outcome, channel, site, ms], 'question-log:insert');

/** Most asked first: grouped by research set when one served it, else by normalised-question hash → count, last_at, sample question, distinct sites, hit rate. */
export async function topQuestions({ since = null, site = null, limit = 50 } = {}) {
  const at = sinceStamp(since), where = [at && 'at >= ?', site && 'site = ?'].filter(Boolean);
  return queryAll(`SELECT COUNT(*) AS n, MAX(at) AS last_at, MAX(question) AS question, COUNT(DISTINCT site) AS sites,
      ROUND(AVG(outcome = 'hit'), 3) AS hit_rate, research_set_id
    FROM anis_question_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY COALESCE('s' || research_set_id, 'h' || question_hash) ORDER BY n DESC, last_at DESC LIMIT ?`,
  [...(at ? [at] : []), ...(site ? [site] : []), Number(limit)], 'question-log:top');
}

/** Where the questions come from: per site → count, distinct questions, last_at, hit rate. */
export async function topSites({ since = null, limit = 50 } = {}) {
  const at = sinceStamp(since);
  return queryAll(`SELECT COALESCE(site, '(none)') AS site, COUNT(*) AS n, COUNT(DISTINCT question_hash) AS questions, MAX(at) AS last_at, ROUND(AVG(outcome = 'hit'), 3) AS hit_rate
    FROM anis_question_log ${at ? 'WHERE at >= ?' : ''} GROUP BY site ORDER BY n DESC LIMIT ?`, [...(at ? [at] : []), Number(limit)], 'question-log:sites');
}
