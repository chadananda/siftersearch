// Trace replay — re-run a traced search on TODAY's code and diff its ranked list against what it returned then
// (Chad 11-04: "no reason you should have to write code to check search history"). Engine rows only: no planner, no
// Jev, no writer, no reply, never traced (noTrace) and nothing billed but, on an embedding-cache miss, one query embed.
// A 'planned' row replays the engine calls it made (its children, parent_trace); a turn replays every engine call it made.
// Deps (injectable): search.js multiIndexSearch, search/qdrant-layers.js, repos/search-trace-repo.js.
import { compactHit, expandHits, rankDiff } from '../search-trace.js';

const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
const MAX_TURN_ROWS = 40;

const liveDeps = async () => {
  const repo = await import('../repos/search-trace-repo.js');
  return {
    engine: async (q, o) => (await import('../search.js')).multiIndexSearch(q, o),
    layer: async (name, q, o) => (await import('./qdrant-layers.js'))[name]?.(q, o),
    children: repo.childTraces, titles: repo.docTitles,
  };
};

/** Re-run ONE engine row (multi-index, planned:<shape>, layer:<name>) → its new hits, or { error } when it cannot be. */
async function rerun(row, d) {
  const opts = parse(row.options_json) || {};
  const t0 = Date.now();
  const ep = String(row.endpoint || '');
  if (ep.startsWith('layer:')) {
    const name = ep.slice(6);
    const r = await d.layer(name, row.query, { limit: opts.limit ?? 20, filters: opts.filters });
    if (r == null) return { error: `no layer function ${name}` };
    return { hits: (Array.isArray(r) ? r : r.hits || []).map((h) => ({ ...h, _layer: name })), ms: Date.now() - t0 };
  }
  if (!row.options_json && ep !== 'multi-index' && !ep.startsWith('planned:')) return { error: `${ep} rows carry no engine options to replay` };
  const r = await d.engine(row.query, { ...opts, noTrace: true });
  return { hits: r?.hits || [], ms: Date.now() - t0 };
}

/** One engine row → { trace_id, endpoint, tool, query, old_ms, new_ms, diff } (titles filled by the caller). */
async function replayRow(row, d) {
  if (!row.hits_json) return { trace_id: row.trace_id, endpoint: row.endpoint, query: row.query, error: 'no stored ranked list (traced before 11-04, or pruned)' };
  const r = await rerun(row, d).catch((err) => ({ error: err.message }));
  if (r.error) return { trace_id: row.trace_id, endpoint: row.endpoint, query: row.query, error: r.error };
  const newJson = r.hits.slice(0, 20).map(compactHit);
  return { trace_id: row.trace_id, endpoint: row.endpoint, tool: row.tool ?? null, step: row.step ?? null, query: row.query,
    old_ms: row.total_ms ?? null, new_ms: r.ms, _old: parse(row.hits_json) || [], _new: newJson };
}

// stored arrays → titled lists → the diff (one docs read for every row)
async function finish(results, d) {
  const ids = results.flatMap((x) => [...(x._old || []), ...(x._new || [])].map((h) => h[1])).filter((v) => v != null);
  const titles = await d.titles(ids).catch(() => new Map());
  return results.map(({ _old, _new, ...x }) => (x.error ? x : { ...x, diff: rankDiff(expandHits(_old, titles), expandHits(_new, titles)) }));
}

/** Replay one trace row (a 'planned' row → its engine calls). → { trace_id, endpoint, query, replays: [...] } */
export async function replayTrace(row, deps) {
  const d = { ...(await liveDeps().catch(() => ({}))), ...deps };
  const rows = row.endpoint === 'planned' ? await d.children(row.trace_id) : [row];
  if (!rows.length) return { trace_id: row.trace_id, endpoint: row.endpoint, query: row.query, replays: [], note: 'a planned row with no engine calls traced under it (pre-11-04 or served from cache)' };
  const out = [];
  for (const r of rows.slice(0, MAX_TURN_ROWS)) out.push(await replayRow(r, d));
  return { trace_id: row.trace_id, endpoint: row.endpoint, query: row.query, replays: await finish(out, d) };
}

/** Replay every engine call one Anís turn made (the 'planned' wrapper rows skipped — their children are in the set). */
export async function replayTurn(rows, deps) {
  const d = { ...(await liveDeps().catch(() => ({}))), ...deps };
  const engineRows = rows.filter((r) => r.endpoint !== 'planned').slice(0, MAX_TURN_ROWS);
  const out = [];
  for (const r of engineRows) out.push(await replayRow(r, d));
  return { searches: rows.length, replayed: engineRows.length, replays: await finish(out, d) };
}
