// Conversation THREADS — ownership + naming for chat_sessions. A thread belongs to a PARTICIPANT (the same
// key the companion uses: a verified account id, else the temporary session id), never to the API key owner,
// which would pool every visitor's conversations into one account. Pure helpers here; the routes do the I/O.
// Deps: none (keep it trivially testable — the API seam is the contract, per the threads testing plan).

// A thread is worth naming once there is an exchange to name (round >= 2); before that the "title" would
// just be the opening question with no answer to characterise it.
export const TITLE_AFTER_ROUNDS = 2;

/**
 * Reader-facing thread title from the opening question. Deterministic fallback for the AI namer: it must
 * never leave a thread called "Untitled", because an unnamed thread is unfindable in a list.
 * @param {string} firstUserMessage
 * @returns {string} a short, single-line title
 */
export function deriveThreadTitle(firstUserMessage) {
  let t = String(firstUserMessage || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New conversation';
  t = t.replace(/^(hi|hello|hey)[,!.\s]+/i, '');                    // greetings carry no subject
  t = t.replace(/^(can you|could you|please|i want to know|tell me|i'?d like to know)\s+/i, '');
  // Keep it to one clause: a title is a handle, not the question itself.
  const clause = t.split(/(?<=[?.!])\s|[—;]\s/)[0] || t;
  let out = clause.length > 72 ? `${clause.slice(0, 69).replace(/\s+\S*$/, '')}…` : clause;
  out = out.replace(/\s*\?$/, '?');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Does this participant own this thread? Ownership is checked SERVER-side against the row: a client that
 * knows (or guesses) a conversation_id must not be able to read someone else's conversation.
 * @param {{participant_id?: string, user_id?: number|null}} row a chat_sessions row
 * @param {{participantId?: string, userId?: number|null}} who
 */
export function ownsThread(row, who = {}) {
  if (!row) return false;
  const pid = who.participantId == null ? null : String(who.participantId);
  const uid = who.userId == null ? null : String(who.userId);
  if (pid && row.participant_id != null && String(row.participant_id) === pid) return true;
  // An account also owns threads recorded against its numeric user_id (rows created before the
  // participant column existed, and rows written while signed in).
  if (uid && row.user_id != null && String(row.user_id) === uid) return true;
  return false;
}

/** The SQL filter + args for "threads belonging to me". Authed callers see both keys; anon only their own. */
export function ownThreadsFilter({ participantId = null, userId = null } = {}) {
  const or = [], args = [];
  if (participantId) { or.push('participant_id = ?'); args.push(String(participantId)); }
  if (userId != null) { or.push('user_id = ?'); args.push(userId); }
  if (!or.length) return null;                        // no identity ⇒ no threads, NOT "all threads"
  return { where: `(${or.join(' OR ')})`, args };
}

// Close the BOTH-WAYS link between a private thread and its public dialog. Extracted from
// routes/content.js so the publish path and its test exercise ONE implementation: the test used to carry
// its own copy of this statement pair, which passes whatever production does — a mirror test cannot catch
// drift, and drift in exactly these two writes is why both columns sat NULL for months.
//
// Best-effort BY DESIGN: a linkage failure must never fail a publish that already succeeded. That makes its
// failure mode silence, so the failure is COUNTED (swallow) rather than logged — a warn line scrolls away,
// a counter trips the health check.
export async function linkThreadToDialog(query, { slug, conversationId, tenantId, swallow }) {
  if (!conversationId) return { linked: false, why: 'no conversation_id — publish was not from a thread' };
  try {
    await query('UPDATE published_conversations SET conversation_id = ? WHERE tenant_id = ? AND slug = ?',
      [conversationId, tenantId, slug]);
    await query(`UPDATE chat_sessions SET published_slug = ?, status = 'published' WHERE id = ?`,
      [slug, conversationId]);
    return { linked: true };
  } catch (err) {
    swallow?.(err, 'dialog.link-thread-to-slug', { slug, conversationId });
    return { linked: false, why: err.message };
  }
}
