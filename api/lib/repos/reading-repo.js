// reading-repo — Anís reading guide state (reading_sessions, migration 148) and the page's disambiguated mentions.
// Bounded: one participant's sessions, one doc's paragraph ids. Deps: db.js.
import { queryAll, queryOne, query } from '../db.js';

const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
const row = (r) => r && { ...r, pages: parse(r.pages, []), explained: parse(r.explained, {}) };

/** The reader's most recently used active book (the default for "next"). */
export async function latestSession(participantId) {
  return row(await queryOne(`SELECT * FROM reading_sessions WHERE participant_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [participantId], 'reading:latest'));
}

export async function sessionFor(participantId, docId) {
  return row(await queryOne('SELECT * FROM reading_sessions WHERE participant_id = ? AND doc_id = ?', [participantId, Number(docId)], 'reading:one'));
}

/** Create or update a reader's session for a book. */
export async function saveSession({ participantId, docId, title, cursor, pages, explained, status = 'active' }) {
  await query(`INSERT INTO reading_sessions (participant_id, doc_id, title, cursor, pages, explained, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(participant_id, doc_id) DO UPDATE SET title = excluded.title, cursor = excluded.cursor, pages = excluded.pages,
      explained = excluded.explained, status = excluded.status, updated_at = unixepoch()`,
  [participantId, Number(docId), title ?? null, Number(cursor) || 0, JSON.stringify(pages || []), JSON.stringify(explained || {}), status]);
}

/** Resolved entities mentioned in these paragraphs (OceanLibrary ids, para_N) of one doc, with how often. */
export async function pageMentions(docId, pids) {
  if (!pids.length) return [];
  return queryAll(`SELECT m.para_id pid, m.entity_id id, ge.canonical_name name, ge.entity_type type, COUNT(*) n
      FROM entity_mentions_v2 m JOIN graph_entities ge ON ge.id = m.entity_id
     WHERE m.doc_id = ? AND m.para_id IN (${pids.map(() => '?').join(',')}) AND m.entity_id IS NOT NULL
     GROUP BY m.para_id, m.entity_id ORDER BY m.para_id, n DESC`, [Number(docId), ...pids], 'reading:mentions');
}
