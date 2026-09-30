// Reads of the document metadata store (doc_meta + its SQLite FTS5 index). Used by the public API, the chat's
// document tools, and (next) disambiguation/HyPE prompts. Deps: db.js, doc-meta.js (ftsQuery).
// :rules: relevance (bm25, negative = better) is weighted by the 1–10 authority, so canonical texts outrank scrapes.
// :edge: search runs exact title, exact phrase, every word, then any word — "Mulla Husayn" must not lead with
//   "Muhammad Husayn son of Mulla Shafi".
import { queryAll, queryOne } from './db.js';
import { ftsQuery } from './doc-meta.js';

const parse = (x) => { try { return x ? JSON.parse(x) : null; } catch { return null; } };

/** The full metadata record of one document, or null. */
export async function getDocMeta(docId) {
  const row = await queryOne('SELECT meta FROM doc_meta WHERE doc_id = ?', [docId], 'docmeta:get')
    || await queryOne('SELECT meta FROM tablet_meta WHERE doc_id = ?', [docId], 'docmeta:get-legacy');
  return parse(row?.meta);
}

/** The one-line context (for prompts) of each document id given: Map docId → line. */
export async function getDocContexts(docIds) {
  const ids = [...new Set((docIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await queryAll(`SELECT doc_id, context FROM doc_meta WHERE doc_id IN (${ids.map(() => '?').join(',')})`, ids, 'docmeta:contexts');
  return new Map(rows.filter((r) => r.context).map((r) => [r.doc_id, r.context]));
}

/**
 * Find documents by metadata. q = free text over title/names/recipient/place/subjects/first line/description;
 * kind, author, place, genre, pin = exact filters; year_from/year_to = overlapping Gregorian range.
 */
export async function searchDocMeta(q = {}) {
  const filters = []; const fargs = [];
  for (const [k, col] of [['kind', 'm.kind'], ['author', 'm.author'], ['place', 'm.place'], ['genre', 'm.genre'], ['pin', 'm.pin']]) {
    if (q[k]) { filters.push(`${col} = ?`); fargs.push(String(q[k])); }
  }
  if (Number(q.year_from)) { filters.push('m.year_to >= ?'); fargs.push(Number(q.year_from)); }
  if (Number(q.year_to)) { filters.push('m.year_from <= ?'); fargs.push(Number(q.year_to)); }
  const limit = Math.min(200, Number(q.limit) || 20);
  const cols = 'm.doc_id, m.kind, m.title, m.author, m.place, m.year_from, m.year_to, m.genre, m.pin, m.context';
  const run = (match, n, exclude = []) => {
    const where = [...(match ? ['doc_meta_fts MATCH ?'] : []), ...filters, ...(exclude.length ? [`m.doc_id NOT IN (${exclude.map(() => '?').join(',')})`] : [])];
    if (!where.length) return [];
    return queryAll(`SELECT ${cols} FROM ${match ? 'doc_meta_fts f JOIN doc_meta m ON m.doc_id = f.rowid' : 'doc_meta m'}
        WHERE ${where.join(' AND ')} ${match ? 'ORDER BY bm25(doc_meta_fts, 4, 3, 5, 3, 2, 1, 1, 2, 1) * (1 + COALESCE(m.authority, 1) / 5.0)' : 'ORDER BY m.authority DESC, m.year_from'} LIMIT ?`,
      [...(match ? [match] : []), ...fargs, ...exclude, n], 'docmeta:search');
  };
  // exact title first (the canonical "Some Answered Questions" above 80 chapters that mention it), then exact phrase,
  // every word, any word — each tier only fills what the one before left
  let hits = [];
  if (String(q.q || '').trim()) {
    hits = await queryAll(`SELECT ${cols} FROM doc_meta m WHERE lower(m.title) = lower(?) ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
        ORDER BY COALESCE(m.authority, 1) DESC LIMIT ?`, [String(q.q).trim(), ...fargs, limit], 'docmeta:search-title');
  }
  for (const op of ['PHRASE', 'AND', 'OR']) {
    const match = ftsQuery(q.q, op);
    if (hits.length >= limit || (!match && op !== 'AND')) continue;
    hits = hits.concat(await run(match, limit - hits.length, hits.map((h) => h.doc_id)));
  }
  return { total: hits.length, hits };
}
