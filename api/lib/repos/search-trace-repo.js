// search-trace-repo — every read/write of search_trace (migrations 122 + 197): the trace writer (single-writer routed), the
// forensic reads behind /api/admin/search-trace + /anis/turns/:id/trace, the latency-contract window, and the hits retention.
// Every list read is a range on an index (created_at / thread / turn / tool / parent) with a row cap. Deps: db.
import { query, queryAll, queryOne } from '../db.js';

const now = () => Math.floor(Date.now() / 1000);
const clampInt = (v, lo, hi, dflt) => Math.min(Math.max(lo, parseInt(v, 10) || dflt), hi);

/** The newest traces of the last `minutes` (at most `limit`): trace_id, endpoint + timings only, newest first. */
export const recentTraceTimings = ({ minutes = 60, limit = 5000 } = {}) => queryAll(
  `SELECT trace_id, endpoint, timings_json, created_at FROM search_trace WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
  [now() - Math.max(1, Number(minutes) || 60) * 60, Math.min(Math.max(1, Number(limit) || 5000), 20000)],
  'search-trace:recent-timings');

/** Traces after id `after` (the improve worker's cursor), oldest first, at most `limit`, none older than `sinceDays`
 *  (fractional days work: the improve worker passes the time since it went live).
 *  SELECT * so the hits the introspection layer stores ride along without a second read. Range on the id PK. */
export const tracesAfter = (after = 0, { sinceDays = 30, limit = 200 } = {}) => queryAll(
  `SELECT * FROM search_trace WHERE id > ? AND created_at >= ? ORDER BY id LIMIT ?`,
  [Number(after) || 0, Math.floor(Date.now() / 1000 - (sinceDays == null || Number.isNaN(Number(sinceDays)) ? 30 : Math.max(0, Number(sinceDays))) * 86400), Math.min(Math.max(1, Number(limit) || 200), 1000)],
  'search-trace:after');
/** One trace row (buildTrace's shape) → INSERT through the writer. */
export const insertTrace = (row) => {
  const cols = Object.keys(row);
  return query(`INSERT INTO search_trace (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]), 'search-trace:insert');
};

/**
 * The forensic list. f: { days, endpoint, query, zeroOnly, slowerThan, layer, sort, limit, thread, turn, tool, docIds }.
 * docIds = "where did this doc rank": rows whose stored ranked list holds any of them (a LIKE on hits_json inside the days
 * window — the window is what bounds it, so it is capped at 30 days when a doc is asked for).
 */
export function listTraces(f = {}) {
  const limit = clampInt(f.limit, 1, 500, 50);
  const where = ['1=1'], params = [];
  const docIds = (f.docIds || []).map(Number).filter(Number.isFinite).slice(0, 50);
  const days = f.days ? clampInt(f.days, 1, 3650, 7) : docIds.length ? 7 : null;
  if (days) { where.push('created_at >= ?'); params.push(now() - Math.min(days, docIds.length ? 30 : 3650) * 86400); }
  if (f.endpoint) { where.push('endpoint = ?'); params.push(String(f.endpoint)); }
  if (f.query) { where.push('query LIKE ?'); params.push(`%${f.query}%`); }
  if (f.zeroOnly) where.push('result_count = 0');
  if (f.slowerThan) { where.push('total_ms >= ?'); params.push(parseInt(f.slowerThan, 10) || 0); }
  if (f.layer) { where.push('top1_layer = ?'); params.push(String(f.layer)); }
  if (f.thread) { where.push('thread_id = ?'); params.push(String(f.thread)); }
  if (f.turn) { where.push('turn_id = ?'); params.push(String(f.turn)); }
  if (f.tool) { where.push('tool = ?'); params.push(String(f.tool)); }
  if (docIds.length) { where.push(`(${docIds.map(() => 'hits_json LIKE ?').join(' OR ')})`); params.push(...docIds.map((d) => `%,${d},%`)); }
  const order = f.sort === 'slow' ? 'total_ms DESC' : 'created_at DESC';
  return queryAll(`SELECT * FROM search_trace WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`, [...params, limit], 'search-trace:list');
}

export const getTrace = (traceId) => queryOne('SELECT * FROM search_trace WHERE trace_id = ?', [String(traceId)], 'search-trace:one');

/** The same question asked before/after a change — the comparison that attributes a quality shift. */
export const sameQuestion = (queryHash, traceId) => queryAll(
  `SELECT trace_id, created_at, endpoint, tool, search_version, total_ms, result_count, top1_layer, top1_title, cache_status
     FROM search_trace WHERE query_hash = ? AND trace_id != ? ORDER BY created_at DESC LIMIT 20`, [queryHash, traceId], 'search-trace:siblings');

/** Every trace of the last `days` (the stats aggregate). Capped: 200k rows is ~18 days at today's rate. */
export const tracesSince = (days = 7) => queryAll('SELECT * FROM search_trace WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200000',
  [now() - clampInt(days, 1, 90, 7) * 86400], 'search-trace:stats');

/** All the searches behind one Anís thread / one turn ("<thread>:<round>"), oldest first. */
export const tracesForThread = (threadId) => queryAll('SELECT * FROM search_trace WHERE thread_id = ? ORDER BY created_at, id LIMIT 2000',
  [String(threadId)], 'search-trace:thread');
export const tracesForTurn = (turnId) => queryAll('SELECT * FROM search_trace WHERE turn_id = ? ORDER BY created_at, id LIMIT 500',
  [String(turnId)], 'search-trace:turn');
/** The engine calls a planned search ran (each traced as planned:<shape>, parent_trace = the planned row). */
export const childTraces = (traceId) => queryAll('SELECT * FROM search_trace WHERE parent_trace = ? ORDER BY created_at, id LIMIT 50',
  [String(traceId)], 'search-trace:children');

/** Titles for the ranked lists (hits store ids only). → Map(id → { title, author }) */
export async function docTitles(ids = []) {
  const uniq = [...new Set(ids.map(Number).filter(Number.isFinite))].slice(0, 2000);
  if (!uniq.length) return new Map();
  const rows = await queryAll(`SELECT id, title, author, collection, religion FROM docs WHERE id IN (${uniq.map(() => '?').join(',')})`, uniq, 'search-trace:doc-titles');
  return new Map(rows.map((r) => [Number(r.id), { title: r.title, author: r.author, collection: r.collection, religion: r.religion }]));
}

/** "doc" given as words: the documents whose title answers them (docs-repo's ranked title/FTS lookup — no LIKE scan), at most 50. */
export const docIdsByTitle = async (text, limit = 50) => {
  const { findDocuments } = await import('../docs-repo.js');
  const r = await findDocuments(String(text), { scope: 'all', fields: ['id'], limit: Math.min(Math.max(1, limit), 50) });
  return (r?.docs || []).map((d) => Number(d.id));
};

/**
 * Retention: the ranked lists of searches not made by Anís (the bulk: batteries, the site) are dropped after `keepDays`; the
 * row (timings, top1) stays. Chunked, a yield between, so each write stays short. → rows cleared.
 */
// lookbackDays: the window behind the cut it sweeps (daily job → a few days; older rows were cleared by earlier runs), so the
// range read stays on the created_at index instead of walking every already-cleared row.
export async function pruneTraceHits({ keepDays = 14, lookbackDays = 7, chunk = 500, maxChunks = 400 } = {}) {
  const cut = now() - keepDays * 86400;
  let total = 0;
  for (let i = 0; i < maxChunks; i++) {
    const r = await query(`UPDATE search_trace SET hits_json = NULL WHERE id IN (SELECT id FROM search_trace
      WHERE created_at >= ? AND created_at < ? AND thread_id IS NULL AND hits_json IS NOT NULL LIMIT ?)`, [cut - lookbackDays * 86400, cut, chunk], 'search-trace:prune-hits');
    const n = Number(r?.changes ?? r?.rowsAffected ?? 0);
    total += n;
    if (n < chunk) break;
    await new Promise((res) => setImmediate(res));
  }
  return total;
}
