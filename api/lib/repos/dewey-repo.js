// dewey-repo — Dewey's wanted list + intake queue (dewey_items, migration 158). One row per wanted work; every state
// change appends to its log with the reason. Callers: routes/dewey.js and the dewey-research / dewey-intake ops jobs.
import { queryAll, queryOne, transaction } from '../db.js';

const J = (v) => (v == null ? null : JSON.stringify(v));
const parse = (r) => r && { ...r, identified: r.identified ? JSON.parse(r.identified) : null, research: r.research ? JSON.parse(r.research) : null, log: JSON.parse(r.log || '[]') };
const now = () => new Date().toISOString();

/** state 'wanted' (a work to find) or 'offered' (an uploaded document we lack, archived, waiting for the member's yes). */
export async function createItem({ title, author = null, kind = null, identified = null, by = null, state = 'wanted', why = 'added from a holdings check' }) {
  const at = now();
  await transaction([{ sql: `INSERT INTO dewey_items (title, author, kind, identified, state, log, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [String(title).slice(0, 500), author, kind, J(identified), state, J([{ at, state, why, by }]), by, at, at] }], 'dewey:create');
  return parse(await queryOne('SELECT * FROM dewey_items WHERE created_at = ? AND title = ? ORDER BY id DESC LIMIT 1', [at, String(title).slice(0, 500)], 'dewey:created'));
}

export const getItem = async (id) => parse(await queryOne('SELECT * FROM dewey_items WHERE id = ?', [Number(id)], 'dewey:get'));

/** Open items first (anything not yet in the library), newest first. */
export const listItems = async ({ state = null, limit = 100 } = {}) => (await queryAll(`SELECT * FROM dewey_items ${state ? 'WHERE state = ?' : ''}
  ORDER BY CASE WHEN state = 'ingested' THEN 1 ELSE 0 END, updated_at DESC LIMIT ?`, state ? [state, limit] : [limit], 'dewey:list')).map(parse);

/** An item already wanted under this title (case/diacritics-insensitive enough for a duplicate guard). */
export const findOpenByTitle = async (title) => parse(await queryOne(`SELECT * FROM dewey_items WHERE LOWER(title) = LOWER(?) AND state NOT IN ('ingested', 'offered', 'declined') LIMIT 1`, [String(title)], 'dewey:by-title'));

/** The item for this exact file (by its sha256), newest first — the ingest folder's "have we handled this file?". */
export const findBySha = async (sha256) => parse(await queryOne('SELECT * FROM dewey_items WHERE sha256 = ? ORDER BY id DESC LIMIT 1', [String(sha256)], 'dewey:by-sha'));

/** The Dewey item that became this document (its archived original lives on the item). */
export const findByDoc = async (docId) => parse(await queryOne('SELECT * FROM dewey_items WHERE doc_id = ? ORDER BY id DESC LIMIT 1', [Number(docId)], 'dewey:by-doc'));

/** Change fields and, when `state` changes, append { at, state, why } to the log. */
export async function updateItem(id, fields = {}, why = null) {
  const cur = await getItem(id);
  if (!cur) throw new Error(`dewey item ${id} not found`);
  const set = { ...fields };
  if (set.research !== undefined) set.research = J(set.research);
  if (set.identified !== undefined) set.identified = J(set.identified);
  const log = cur.log;
  if (fields.state && fields.state !== cur.state || why) log.push({ at: now(), state: fields.state || cur.state, why });
  set.log = J(log.slice(-200)); set.updated_at = now();
  const keys = Object.keys(set);
  await transaction([{ sql: `UPDATE dewey_items SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, args: [...keys.map((k) => set[k]), Number(id)] }], 'dewey:update');
  return getItem(id);
}

/** Dewey's intake ACTIVITY (Chad 10-17: "documents we are loading now or have very recently loaded"): items past the
 *  wanted stage — source attached, processing, waiting for OCR, failed, ingested — most recently changed first. */
export const intakeActivity = async (limit = 30) => (await queryAll(`SELECT * FROM dewey_items WHERE state NOT IN ('wanted', 'researched', 'offered', 'declined', 'archived', 'lead', 'to-buy')
  ORDER BY updated_at DESC LIMIT ?`, [limit], 'dewey:activity')).map(parse);

/** THE IMPORT BOARD (Observatory, Chad 10-18: "show such activity of importing new documents … the flow of new material
 *  and what we do for each"): decided items only (never an offer still awaiting a yes), changed in the last `hours`. */
export async function importBoard({ hours = 48, limit = 16 } = {}) {
  const since = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const items = (await queryAll(`SELECT * FROM dewey_items WHERE state IN ('source', 'processing', 'needs-ocr', 'needs-human', 'ingested', 'failed')
    AND updated_at >= ? ORDER BY updated_at DESC LIMIT ?`, [since(hours), limit], 'dewey:import-board')).map(parse);
  const byState = Object.fromEntries((await queryAll('SELECT state, COUNT(*) n FROM dewey_items GROUP BY state', [], 'dewey:import-states')).map((r) => [r.state, r.n]));
  const done = await queryOne(`SELECT SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) d1, SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) d7
    FROM dewey_items WHERE state = 'ingested'`, [since(24), since(168)], 'dewey:import-done');
  return { items, byState, imported_24h: done?.d1 || 0, imported_7d: done?.d7 || 0 };
}

// ── Dewey's thread: one per member, shared by every device (dewey_messages, migration 160) ──
/** Append a message: role 'user' | 'assistant'; parts = cards/thumbnails to show it again. → id */
export async function appendMessage(userId, role, content, parts = null) {
  await transaction([{ sql: 'INSERT INTO dewey_messages (user_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [Number(userId), role, content == null ? null : String(content).slice(0, 20000), parts ? JSON.stringify(parts) : null, new Date().toISOString()] }], 'dewey:message');
  return (await queryOne('SELECT MAX(id) AS id FROM dewey_messages WHERE user_id = ?', [Number(userId)], 'dewey:message-id'))?.id;
}

/** A member's thread: messages after `after` (oldest first), or the newest `limit` when after is 0. */
export async function threadOf(userId, { after = 0, limit = 60 } = {}) {
  const rows = after
    ? await queryAll('SELECT * FROM dewey_messages WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?', [Number(userId), Number(after), limit], 'dewey:thread-after')
    : (await queryAll('SELECT * FROM dewey_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?', [Number(userId), limit], 'dewey:thread')).reverse();
  return rows.map((r) => ({ ...r, parts: r.parts ? JSON.parse(r.parts) : null }));
}
