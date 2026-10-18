// dewey-repo — Dewey's wanted list + intake queue (dewey_items, migration 158). One row per wanted work; every state
// change appends to its log with the reason. Callers: routes/dewey.js and the dewey-research / dewey-intake ops jobs.
import { queryAll, queryOne, transaction } from '../db.js';

const J = (v) => (v == null ? null : JSON.stringify(v));
const parse = (r) => r && { ...r, identified: r.identified ? JSON.parse(r.identified) : null, research: r.research ? JSON.parse(r.research) : null, log: JSON.parse(r.log || '[]') };
const now = () => new Date().toISOString();

export async function createItem({ title, author = null, kind = null, identified = null, by = null }) {
  const at = now();
  await transaction([{ sql: `INSERT INTO dewey_items (title, author, kind, identified, state, log, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'wanted', ?, ?, ?, ?)`,
    args: [String(title).slice(0, 500), author, kind, J(identified), J([{ at, state: 'wanted', why: 'added from a holdings check', by }]), by, at, at] }], 'dewey:create');
  return parse(await queryOne('SELECT * FROM dewey_items WHERE created_at = ? AND title = ? ORDER BY id DESC LIMIT 1', [at, String(title).slice(0, 500)], 'dewey:created'));
}

export const getItem = async (id) => parse(await queryOne('SELECT * FROM dewey_items WHERE id = ?', [Number(id)], 'dewey:get'));

/** Open items first (anything not yet in the library), newest first. */
export const listItems = async ({ state = null, limit = 100 } = {}) => (await queryAll(`SELECT * FROM dewey_items ${state ? 'WHERE state = ?' : ''}
  ORDER BY CASE WHEN state = 'ingested' THEN 1 ELSE 0 END, updated_at DESC LIMIT ?`, state ? [state, limit] : [limit], 'dewey:list')).map(parse);

/** An item already wanted under this title (case/diacritics-insensitive enough for a duplicate guard). */
export const findOpenByTitle = async (title) => parse(await queryOne(`SELECT * FROM dewey_items WHERE LOWER(title) = LOWER(?) AND state != 'ingested' LIMIT 1`, [String(title)], 'dewey:by-title'));

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
