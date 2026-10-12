// carry-repo — read + move the derived work attached to paragraph rows, so a re-ingest can carry it to the rows that now
// hold the same words (ops job reingest-carry). Content writes go through the single writer; graph.db is its own file.
// Deps: db.js, carry-map (column list).
import { queryAll, transaction, graphQuery, graphQueryAll } from '../db.js';
import { CARRY_COLUMNS } from '../ops/carry-map.js';

const chunks = (a, n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const ph = (a) => a.map(() => '?').join(',');

/** A doc's live rows with text + every carry column. */
export const snapshotRows = (docId) => queryAll(`SELECT id, text, ${CARRY_COLUMNS.join(', ')} FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`, [docId]);

export async function linksFor(ids) {
  const out = [];
  for (const c of chunks(ids)) out.push(...await queryAll(`SELECT * FROM content_alignment WHERE retired_at IS NULL AND (trans_id IN (${ph(c)}) OR orig_id IN (${ph(c)}))`, [...c, ...c]));
  return out;
}
export async function mentionsV2For(ids) {
  const out = [];
  for (const c of chunks(ids)) out.push(...await queryAll(`SELECT id, para_id, surface FROM entity_mentions_v2 WHERE para_id IN (${ph(c)})`, c.map(String)));
  return out;
}
export async function graphMentionsFor(ids) {
  const out = [];
  // content_id is declared TEXT but holds INTEGER values (10-11: a lookup with strings found none) — match both forms
  for (const c of chunks(ids, 250)) out.push(...await graphQueryAll(`SELECT id, entity_id, content_id, role FROM entity_mentions WHERE content_id IN (${ph(c)}) OR content_id IN (${ph(c)})`, [...c.map(Number), ...c.map(String)]));
  return out;
}

/** [{ id, set: { col: value } }] */
export async function applyColumns(changes) {
  for (const c of chunks(changes, 200)) {
    await transaction(c.filter((x) => Object.keys(x.set).length).map((x) => {
      const cols = Object.keys(x.set).filter((k) => CARRY_COLUMNS.includes(k));
      return { sql: `UPDATE content SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, args: [...cols.map((k) => x.set[k]), x.id] };
    }), 'ops:carry-columns');
  }
}

/** Copy each old link onto the new ids (INSERT OR IGNORE) and retire the old one. [{ link, transId, origId }] */
export async function relink(moves) {
  const t = Math.floor(Date.now() / 1000);
  for (const c of chunks(moves, 200)) {
    await transaction(c.flatMap((m) => [
      { sql: `INSERT OR IGNORE INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, via_id, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [m.transId, m.origId, m.link.trans_doc, m.link.orig_doc, m.link.basis, m.link.score, m.link.via_id, `${m.link.method || ''}+carry`.replace(/^\+/, '')] },
      { sql: 'UPDATE content_alignment SET retired_at = ? WHERE id = ?', args: [t, m.link.id] },
    ]), 'ops:carry-links');
  }
}

export async function moveMentionsV2(moves) {
  for (const c of chunks(moves, 500)) await transaction(c.map((m) => ({ sql: 'UPDATE entity_mentions_v2 SET para_id = ? WHERE id = ?', args: [String(m.to), m.id] })), 'ops:carry-mentions');
}
export async function moveGraphMentions(moves) {
  for (const m of moves) await graphQuery('UPDATE OR IGNORE entity_mentions SET content_id = ? WHERE id = ?', [Number(m.to), m.id]);
}

/** Active links the carry created (method ends '+carry') that touch these rows. */
export async function carryLinksFor(ids) {
  const out = [];
  for (const c of chunks(ids)) out.push(...await queryAll(`SELECT id, trans_id, orig_id FROM content_alignment WHERE retired_at IS NULL AND method LIKE '%+carry'
    AND (trans_id IN (${ph(c)}) OR orig_id IN (${ph(c)}))`, [...c, ...c]));
  return out;
}
export async function retireLinks(linkIds) {
  const t = Math.floor(Date.now() / 1000);
  for (const c of chunks(linkIds)) await transaction([{ sql: `UPDATE content_alignment SET retired_at = ? WHERE id IN (${ph(c)})`, args: [t, ...c] }], 'ops:carry-retire');
}
