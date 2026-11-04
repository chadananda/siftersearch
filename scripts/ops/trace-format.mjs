// Human-readable tables for the search-introspection API (ops.mjs anis-trace | search-trace | search-replay). Pure: JSON in, text out.
const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const pad = (s, n) => cut(s, n).padEnd(n);
// one letter per source tier (api/lib/search-trace.js TIER_CODE): C = a Writings compilation's unattributed passage;
// X = NO TIER READABLE (tier_gap: the document has no religion — a metadata gap); · = another tradition / web
const TIER = { writings: 'W', guardian: 'G', compilation: 'C', reported: 'R', house: 'H', secondary: 'S' };
export const tierMark = (h = {}) => TIER[h.tier] || (h.tier_gap ? 'X' : '·');
const when = (t) => (t == null ? '' : typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') : String(t).slice(0, 16));
const filt = (f) => (f && Object.keys(f).length ? JSON.stringify(f) : '');

/** A ranked list → lines "  rank tier layer score  title — author". */
export const hitLines = (hits = [], n = 10) => hits.slice(0, n).map((h) => `   ${String(h.rank).padStart(2)} ${tierMark(h)} ${pad(h.layer || '', 8)} ${pad(h.score ?? '', 8)} ${cut(h.title || `doc ${h.doc_id}`, 60)}${h.author ? ` — ${cut(h.author, 30)}` : ''}  [d${h.doc_id} p${h.para_id}]`);

/** One search (a trace or a thread-view search) → a header line + its hits. */
export const searchBlock = (s, n = 10) => [
  ` • ${pad(s.tool || s.endpoint, 18)} ${pad(s.step || '', 16)} ${String(s.ms ?? s.total_ms ?? '').padStart(5)} ms  ${String(s.results ?? s.result_count ?? '').padStart(3)} hits  "${cut(s.query, 70)}" ${filt(s.filters)}  (${s.trace_id})`,
  ...hitLines(s.hits || [], n)];

const writerLines = (t) => [
  ...(t.writer_passages?.length ? [' writer passages:', ...t.writer_passages.map((p) => `   ${String(p.n).padStart(2)} ${tierMark(p)} ${p.cited ? 'CITED' : '     '} ${cut(p.title, 60)}${p.author ? ` — ${cut(p.author, 30)}` : ''}`)] : [' writer passages: none recorded']),
];

/** GET /anis/turns/:id/trace → text. */
export function turnText(t) {
  return [`TURN ${t.turn}  status ${t.status ?? '?'}  route ${[t.route?.gate, t.route?.kind, t.route?.strategy].filter(Boolean).join(' / ')}`,
    ` Q: ${cut(t.question, 200)}`, ` A: ${cut(t.reply, 200)}`, ` searches (${t.searches?.length || 0}):`,
    ...(t.searches || []).flatMap((s) => searchBlock(s, 20)), ...writerLines(t)].join('\n');
}

/** GET /anis/threads/:id → text, round by round. */
export function threadText(d) {
  const lines = [`THREAD ${d.id}  ${d.channel || ''}  ${d.person?.name || d.person?.email || ''}  rounds ${d.rounds?.length || 0}`];
  for (const r of d.rounds || []) {
    lines.push('', `ROUND ${r.round}  (turn ${d.id}:${r.round})  ${r.reply?.route?.gate || ''} ${r.reply?.route?.strategy || ''}`, ` Q: ${cut(r.question?.text, 200)}`, ` A: ${cut(r.reply?.text, 200)}`);
    const ss = r.reply?.searches || [];
    lines.push(` searches (${ss.length}):`, ...ss.flatMap((s) => searchBlock(s, 10)));
    if (r.reply) lines.push(...writerLines(r.reply));
  }
  return lines.join('\n');
}

/** GET /search-trace → one line per trace (+ the doc's rank when ?doc= was asked). */
export function traceListText(res) {
  const head = `${res.count} traces  p50 ${res.summary?.latency?.p50 ?? '?'} ms  p95 ${res.summary?.latency?.p95 ?? '?'} ms  zero ${Math.round((res.summary?.zero_result_rate || 0) * 100)}%`;
  const rows = (res.traces || []).map((t) => `${when(t.created_at)}  ${pad(t.endpoint, 18)} ${pad(t.tool || '', 16)} ${String(t.total_ms ?? '').padStart(5)} ms ${String(t.result_count ?? '').padStart(3)}  ${pad(t.query, 60)}  ${t.doc_ranks ? `rank ${t.doc_ranks.map((d) => d.rank).join(',') || '—'}  ` : ''}top1 ${cut(t.top1_title, 40)}  ${t.trace_id}${t.turn_id ? `  turn ${t.turn_id}` : ''}`);
  return [head, ...(res.note ? [res.note] : []), ...rows].join('\n');
}

/** GET /search-trace/:id → text. */
export function traceText(res) {
  const t = res.trace || {};
  return [`TRACE ${t.trace_id}  ${t.endpoint}  ${when(t.created_at)}  ${t.total_ms} ms  ${t.result_count} hits  top1 ${t.top1_layer}`,
    ` query: ${t.query}`, ...(t.turn_id ? [` turn ${t.turn_id}  tool ${t.tool || '-'}  step ${t.step || '-'}  route ${t.route || '-'}`] : []),
    ...(t.filters ? [` filters ${filt(t.filters)}`] : []), ` timings ${JSON.stringify(t.timings || {})}`, ...hitLines(t.hits || [], 20),
    ...(res.engine_calls || []).flatMap((c) => searchBlock({ ...c, ms: c.total_ms, results: c.result_count }, 10)),
    ...(res.same_question?.length ? [` same question ${res.same_question.length}×: ${res.same_question.slice(0, 5).map((s) => `${when(s.created_at)} ${s.total_ms}ms ${s.result_count}h`).join(' | ')}`] : [])].join('\n');
}

const moveOf = (m) => (m === 'new' ? 'NEW' : m === 0 ? '=' : m > 0 ? `+${m}` : String(m));
/** POST …/replay → old vs new ranks per replayed search. */
export function replayText(res) {
  const lines = [`REPLAY ${res.turn || res.trace_id}  ${res.replays?.length || 0} searches re-run on current code (no LLM, untraced)${res.note ? `  — ${res.note}` : ''}`];
  for (const x of res.replays || []) {
    lines.push('', ` • ${x.tool || x.endpoint}  "${cut(x.query, 70)}"  (${x.trace_id})`);
    if (x.error) { lines.push(`   cannot replay: ${x.error}`); continue; }
    const d = x.diff;
    lines.push(`   ${d.same ? 'SAME ranking' : `kept ${d.kept}, new ${d.entered}, dropped ${d.dropped_count}${d.top1_changed ? ', TOP-1 CHANGED' : ''}`}   ${x.old_ms ?? '?'} ms → ${x.new_ms} ms`);
    lines.push(...d.rows.slice(0, 20).map((h) => `   ${String(h.rank).padStart(2)} (was ${h.old_rank == null ? ' —' : String(h.old_rank).padStart(2)}) ${moveOf(h.move).padStart(4)} ${tierMark(h)} ${cut(h.title || `doc ${h.doc_id}`, 60)}`));
    lines.push(...d.dropped.slice(0, 10).map((h) => `   -- (was ${String(h.old_rank).padStart(2)}) DROPPED ${cut(h.title || `doc ${h.doc_id}`, 60)}`));
  }
  return lines.join('\n');
}
