// edge-mirror-repo — tower's full copy of the edge's D1 databases (migration 206): rows as JSON keyed by primary key, plus
// the reads the admin uses to review what Anís generates (research cache, question log, edge conversations). Server
// processes only; writes route through the single writer. Deps: db.js
import { queryAll, queryOne, transaction } from '../db.js';

const parse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
/** Pure: the mirror key of a row — its primary-key values, else its rowid. */
export const pkOf = (row, pk) => (pk?.length ? JSON.stringify(pk.map((c) => row[c])) : String(row._rowid_));

export const mirrorTables = (db) => queryAll('SELECT * FROM edge_mirror_tables WHERE db = ? ORDER BY name', [db], 'edge-mirror:tables');

export async function saveTable(db, { name, sql, pk = null }) {
  await transaction([{ sql: `INSERT INTO edge_mirror_tables (db, name, sql, pk) VALUES (?, ?, ?, ?)
    ON CONFLICT(db, name) DO UPDATE SET sql = excluded.sql, pk = excluded.pk WHERE sql != excluded.sql OR IFNULL(pk, '') != IFNULL(excluded.pk, '')`,
  args: [db, name, sql, pk ? JSON.stringify(pk) : null] }], 'edge-mirror:table');
}

/** Upsert one page of rows; an unchanged row is not rewritten. */
export async function upsertRows(db, tbl, pk, rows) {
  if (!rows.length) return;
  await transaction(rows.map((r) => ({ sql: `INSERT INTO edge_mirror (db, tbl, pk, rid, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(db, tbl, pk) DO UPDATE SET rid = excluded.rid, data = excluded.data, synced_at = CURRENT_TIMESTAMP
    WHERE data != excluded.data OR rid != excluded.rid`, args: [db, tbl, pkOf(r, pk), r._rowid_, JSON.stringify(r)] })), 'edge-mirror:rows');
}

/** After a full pass: rows the edge no longer has leave the mirror; the table's count, cursor and stamps are recorded. */
export async function finishTable(db, tbl, { seen = null, maxRid, full }) {
  const stmts = [];
  if (full && seen) {
    const have = await queryAll('SELECT pk FROM edge_mirror WHERE db = ? AND tbl = ?', [db, tbl], 'edge-mirror:pks');
    for (const { pk } of have) if (!seen.has(pk)) stmts.push({ sql: 'DELETE FROM edge_mirror WHERE db = ? AND tbl = ? AND pk = ?', args: [db, tbl, pk] });
  }
  stmts.push({ sql: `UPDATE edge_mirror_tables SET rows = (SELECT COUNT(*) FROM edge_mirror WHERE db = ? AND tbl = ?), max_rid = MAX(max_rid, ?),
    synced_at = CURRENT_TIMESTAMP${full ? ', full_at = CURRENT_TIMESTAMP' : ''} WHERE db = ? AND name = ?`, args: [db, tbl, maxRid, db, tbl] });
  await transaction(stmts, 'edge-mirror:finish');
  return stmts.length - 1;
}

const rowsOf = async (tbl, where = '', args = [], tail = '', name = 'edge-mirror:read') =>
  (await queryAll(`SELECT data FROM edge_mirror WHERE db = 'anis' AND tbl = ? ${where} ${tail}`, [tbl, ...args], name)).map((r) => parse(r.data));

/** The research cache for review: newest first, passages counted (full passages via researchSet). */
export async function researchSets({ status = null, limit = 500 } = {}) {
  return (await rowsOf('anis_research_sets', status ? "AND json_extract(data, '$.status') = ?" : '', status ? [status] : [],
    `ORDER BY json_extract(data, '$.updated_at') DESC LIMIT ${Number(limit) || 500}`, 'edge-mirror:sets'))
    .map(({ passages, ...s }) => ({ ...s, passages: parse(passages, []).length }));
}
export async function researchSet(id) {
  const [s] = await rowsOf('anis_research_sets', "AND json_extract(data, '$.id') = ?", [Number(id)], '', 'edge-mirror:set');
  if (!s) return null;
  const asked = await rowsOf('anis_question_log', "AND json_extract(data, '$.set_id') = ?", [Number(id)], "ORDER BY json_extract(data, '$.at') DESC LIMIT 50", 'edge-mirror:set-asked');
  return { ...s, passages: parse(s.passages, []), asked };
}
export async function questionLog({ days = 30, limit = 500 } = {}) {
  return rowsOf('anis_question_log', "AND json_extract(data, '$.at') >= ?", [Date.now() - days * 864e5], `ORDER BY json_extract(data, '$.at') DESC LIMIT ${Number(limit) || 500}`, 'edge-mirror:qlog');
}
/** Edge conversations: newest first, each with its first question and turn count. */
export async function edgeConversations({ days = 30, limit = 200 } = {}) {
  return queryAll(`SELECT c.data AS c, (SELECT COUNT(*) FROM edge_mirror t WHERE t.db = 'anis' AND t.tbl = 'anis_turns' AND json_extract(t.data, '$.conversation_id') = json_extract(c.data, '$.id')) AS turns,
      (SELECT json_extract(t.data, '$.content') FROM edge_mirror t WHERE t.db = 'anis' AND t.tbl = 'anis_turns' AND json_extract(t.data, '$.conversation_id') = json_extract(c.data, '$.id')
        AND json_extract(t.data, '$.role') = 'user' ORDER BY json_extract(t.data, '$.round') LIMIT 1) AS first_question
    FROM edge_mirror c WHERE c.db = 'anis' AND c.tbl = 'anis_conversations' AND json_extract(c.data, '$.updated_at') >= ?
    ORDER BY json_extract(c.data, '$.updated_at') DESC LIMIT ?`, [Date.now() - days * 864e5, Number(limit) || 200], 'edge-mirror:conversations')
    .then((rows) => rows.map((r) => ({ ...parse(r.c), turns: r.turns, first_question: r.first_question })));
}
export async function edgeConversation(id) {
  const c = await queryOne(`SELECT data FROM edge_mirror WHERE db = 'anis' AND tbl = 'anis_conversations' AND pk = ?`, [JSON.stringify([id])], 'edge-mirror:conversation');
  if (!c) return null;
  const turns = (await rowsOf('anis_turns', "AND json_extract(data, '$.conversation_id') = ?", [id],
    "ORDER BY json_extract(data, '$.round'), CASE json_extract(data, '$.role') WHEN 'user' THEN 0 ELSE 1 END", 'edge-mirror:turns'))
    .map((t) => ({ ...t, meta: parse(t.meta) }));
  return { conversation: parse(c.data), turns };
}
