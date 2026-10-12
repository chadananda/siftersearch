// anis-threads-repo — Anís's conversations for the admin Threads view (Chad 10-12: "follow all Anís threads … audit each
// interaction"). chat_sessions = one thread per person per channel; chat_messages = its rounds (user turn + his reply, with
// the routing path). Every read bounded by a date window or one session id. Deps: db.js.
import { queryAll } from '../db.js';

/** Threads with a reply in the last `days`, newest activity first: who, channel, rounds, and the reply ids (for audits). */
export async function listAnisThreads({ days = 30, limit = 200 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  return queryAll(`SELECT s.id, COALESCE(s.channel, m.channel) AS channel, s.title, s.participant_id, s.started_at,
      MAX(COALESCE(m.answered_at, m.created_at)) AS last_at, COUNT(*) AS replies, GROUP_CONCAT(m.id) AS reply_ids,
      (SELECT u.content FROM chat_messages u WHERE u.session_id = s.id AND u.role = 'user' ORDER BY u.round_index, u.id LIMIT 1) AS first_question
    FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.role = 'assistant' AND COALESCE(m.answered_at, m.created_at) >= ?
    GROUP BY s.id ORDER BY last_at DESC LIMIT ?`, [since, Number(limit)], 'anis-threads:list');
}

/** One thread in order: every user turn and reply, with status, channel and the routing path. */
export async function anisThreadMessages(sessionId) {
  return queryAll(`SELECT id, round_index, role, content, status, channel, path_json, created_at, answered_at
    FROM chat_messages WHERE session_id = ? ORDER BY round_index, CASE role WHEN 'user' THEN 0 ELSE 1 END, id LIMIT 2000`,
  [String(sessionId)], 'anis-threads:messages');
}

/** The thread's own row (title, participant, channel). */
export async function anisThread(sessionId) {
  return (await queryAll(`SELECT id, channel, title, participant_id, started_at, last_activity, status FROM chat_sessions WHERE id = ?`,
    [String(sessionId)], 'anis-threads:one'))[0] || null;
}
