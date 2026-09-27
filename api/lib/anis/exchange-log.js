// Anis exchange log — "write it down before you try" (PRD F1). The inbound message is stored as a PENDING user turn in
// the person's thread before any model runs; closeExchange completes it with the reply, the status and the path that
// produced it. One history per person across channels: a thread is the person's most recent one still active within
// IDLE_MS on the same channel (or the thread they explicitly resumed), else a new one. Pending/failed rows are the
// replay queue. The user turn is addressed by (session, round, role) — no reliance on insert ids through the writer.
// Deps: db.js (injectable), threads.js (title, ownership).
import { randomUUID } from 'node:crypto';
import * as realDb from '../db.js';
import { deriveThreadTitle, ownsThread, TITLE_AFTER_ROUNDS } from '../threads.js';

export const IDLE_MS = 30 * 60 * 1000;

/**
 * Which thread does this message belong to? Pure. `requested` = the row of a conversation the client asked to resume
 * (only if the caller owns it); `latest` = the participant's most recent live thread on this channel.
 */
export function pickThread({ requested = null, latest = null, who = {}, now = Date.now(), idleMs = IDLE_MS } = {}) {
  if (requested && requested.status !== 'deleted' && ownsThread(requested, who)) return requested.id;
  if (latest && latest.status !== 'deleted' && ownsThread(latest, who)) {
    const last = Date.parse(String(latest.last_activity).replace(' ', 'T') + (/[zZ+]/.test(String(latest.last_activity)) ? '' : 'Z'));
    if (Number.isFinite(last) && now - last < idleMs) return latest.id;
  }
  return null;
}

/** Store the inbound message as pending. → { conversationId, round, isNew } */
export async function openExchange({ participantId, userId = null, conversationId = null, channel = 'widget-chat', text, tenant = 'siftersearch' }, db = realDb) {
  const who = { participantId, userId };
  const requested = conversationId ? await db.queryOne(`SELECT * FROM chat_sessions WHERE id = ?`, [conversationId]) : null;
  const latest = participantId ? await db.queryOne(
    `SELECT * FROM chat_sessions WHERE participant_id = ? AND (channel = ? OR channel IS NULL) AND status != 'deleted'
      ORDER BY last_activity DESC LIMIT 1`, [String(participantId), channel]) : null;
  let id = pickThread({ requested, latest, who });
  const isNew = !id;
  if (isNew) {
    id = `conv_${randomUUID()}`;
    await db.query(`INSERT INTO chat_sessions (id, tenant_id, user_id, participant_id, channel) VALUES (?, ?, ?, ?, ?)`,
      [id, tenant, userId, participantId == null ? null : String(participantId), channel]);
  }
  const max = await db.queryOne(`SELECT MAX(round_index) r FROM chat_messages WHERE session_id = ?`, [id]);
  const round = max?.r == null ? 0 : Number(max.r) + 1;
  await db.query(`INSERT INTO chat_messages (session_id, round_index, role, content, status, channel) VALUES (?, ?, 'user', ?, 'pending', ?)`,
    [id, round, String(text || ''), channel]);
  return { conversationId: id, round, isNew };
}

/** Complete the exchange: the reply, its status (answered|canned|tarpit|failed) and the path that produced it. */
export async function closeExchange({ conversationId, round, reply, status = 'answered', path = {}, channel = 'widget-chat' }, db = realDb) {
  await db.query(`INSERT INTO chat_messages (session_id, round_index, role, content, status, channel, path_json, answered_at)
    VALUES (?, ?, 'assistant', ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [conversationId, round, String(reply || ''), status, channel, JSON.stringify(path)]);
  await db.query(`UPDATE chat_messages SET status = ?, path_json = ? WHERE session_id = ? AND round_index = ? AND role = 'user'`,
    [status, JSON.stringify(path), conversationId, round]);
  await db.query(`UPDATE chat_sessions SET message_count = message_count + 2, last_activity = CURRENT_TIMESTAMP WHERE id = ?`, [conversationId]);
  if (round + 1 >= TITLE_AFTER_ROUNDS) {
    const first = await db.queryOne(`SELECT content FROM chat_messages WHERE session_id = ? AND role = 'user' ORDER BY round_index, id LIMIT 1`, [conversationId]);
    if (first?.content) await db.query(`UPDATE chat_sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')`, [deriveThreadTitle(first.content), conversationId]);
  }
}

/** Mark an exchange failed (the replay queue picks it up). */
export async function failExchange({ conversationId, round, error }, db = realDb) {
  await db.query(`UPDATE chat_messages SET status = 'failed', path_json = ? WHERE session_id = ? AND round_index = ? AND role = 'user'`,
    [JSON.stringify({ error: String(error || '').slice(0, 300) }), conversationId, round]);
}

/** The replay queue: user turns still pending after `olderThanMin`, or failed. */
export async function pendingExchanges({ olderThanMin = 5, limit = 100 } = {}, db = realDb) {
  return db.queryAll(`SELECT m.session_id, m.round_index, m.content, m.channel, m.status, m.created_at, s.participant_id
      FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
     WHERE m.role = 'user' AND (m.status = 'failed' OR (m.status = 'pending' AND m.created_at < datetime('now', ?)))
     ORDER BY m.created_at LIMIT ?`, [`-${Number(olderThanMin)} minutes`, limit]);
}
