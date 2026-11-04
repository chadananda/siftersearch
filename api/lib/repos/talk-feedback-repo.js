// talk-feedback-repo — listeners' score / comment / best-start suggestion per talk (talk_feedback, USER db migration 12; one row per
// user × media_items.id, upserted). Names come from users (never emails). Callers: routes/talk-feedback.js. Deps: db.js (user DB).
import { userQuery, userQueryAll } from '../db.js';

/** Create or replace this user's feedback on one talk. */
export async function saveFeedback({ mediaId, userId, score = null, comment = null, startS = null }) {
  await userQuery(`INSERT INTO talk_feedback (media_id, user_id, score, comment, suggested_start_s, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(media_id, user_id) DO UPDATE SET score = excluded.score, comment = excluded.comment,
      suggested_start_s = excluded.suggested_start_s, updated_at = unixepoch()`,
  [Number(mediaId), Number(userId), score, comment, startS], 'talk-feedback:save');
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One talk's feedback: count, average score, the suggested starts (count + median), every entry newest first (≤ limit),
 *  and `mine` (userId's own row, or null). Banned accounts are left out. */
export async function feedbackFor(mediaId, { userId = null, limit = 200 } = {}) {
  const rows = await userQueryAll(`SELECT f.user_id, f.score, f.comment, f.suggested_start_s, f.created_at, f.updated_at, u.name
      FROM talk_feedback f LEFT JOIN users u ON u.id = f.user_id
     WHERE f.media_id = ? AND COALESCE(u.tier, '') != 'banned'
     ORDER BY f.updated_at DESC, f.id DESC LIMIT ?`, [Number(mediaId), Math.max(1, Math.min(1000, Number(limit) || 200))], 'talk-feedback:for-talk');
  const scores = rows.map((r) => r.score).filter((s) => s != null);
  const starts = rows.map((r) => r.suggested_start_s).filter((s) => s != null);
  const shape = (r) => ({ name: r.name?.trim() || 'A listener', score: r.score, comment: r.comment, suggested_start_s: r.suggested_start_s,
    created_at: r.created_at, updated_at: r.updated_at });
  const own = userId != null ? rows.find((r) => String(r.user_id) === String(userId)) : null;
  return {
    count: rows.length,
    scored: scores.length,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    starts: { count: starts.length, median: median(starts) },
    entries: rows.map((r) => ({ ...shape(r), mine: own === r })),
    mine: own ? shape(own) : null,
  };
}
