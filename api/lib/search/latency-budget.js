// Search latency contract (Chad 11-03: "we keep fixing it then it keeps being slow again"; "no indexed qdrant search should
// exceed 10ms"). ONE table of per-stage p95 budgets (ms) for the engine (multiIndexSearch `_timings`) and the planned search
// (plannedSearch `timings`), plus pure helpers that turn trace rows into p50/p95-vs-budget. Read by: the ops endpoint
// GET /api/admin/ops/search-latency, scripts/ops/search-bench.mjs, system-checks, and the CI ratchet (every stamped
// stage must have a row here). Numbers: measured on tower 11-03 (serial / 3x / 8x bench) + margin; see each note.

// Engine stages. Parallel layers are completion OFFSETS from the engine's start (a vector layer's offset includes the
// embedding it awaits); hydrate/rank/merge/total are durations. `qdrant` = the slowest single Qdrant call in the search.
export const ENGINE_BUDGETS = Object.freeze({
  qdrant: { ms: 10, note: 'any one Qdrant call, wall (Chad: fixed). identity transport 7-11 ms; phrases+payload ~21 ms server' },
  embed: { ms: 400, note: 'Gemini query embedding over the network: 212-438 ms serial measured; memoized 10 min' },
  phrase: { ms: 450, note: 'embed + phrases query' },
  qhype: { ms: 450, note: 'embed + hype groups query' },
  qconcept: { ms: 450, note: 'embed + concepts groups query' },
  canon: { ms: 500, note: 'canonical-docs phrases pass, starts with the first wave' },
  doctrinal: { ms: 500, note: 'authoritative phrases pass' },
  doctrinal_hype: { ms: 500, note: 'authoritative hype pass' },
  qkeyword: { ms: 60, note: 'BM25 sparse, no embedding: 0.7 ms server, 43 ms offset measured' },
  qkeyword_retry: { ms: 500, note: 'retry after a failed keyword call (rare)' },
  concept: { ms: 25, note: 'in-memory lexicon match (29k entries indexed by first word, 89653a25)' },
  hydrate: { ms: 60, note: 'SQLite paragraphsByIds of stub hits: avg 20 / worst 90 ms (query_stats search:hydrate, 2 h)' },
  rank: { ms: 60, note: 'RRF + rerank + diversify after hydration (CPU)' },
  merge: { ms: 120, note: 'everything after the last layer: hydrate + rank' },
  main_embed: { ms: 400, note: 'legacy Meili main layer (retired; absent when SEARCH_QDRANT=only)' },
  main_engine: { ms: 400, note: 'legacy Meili main layer' },
  main_cross: { ms: 400, note: 'legacy Meili main layer' },
  total: { ms: 600, note: 'one bare engine call: 416-609 ms serial measured, embedding-bound' },
});

// Planned-search stages (all durations from the plannedSearch start or the stage's own start).
export const PLANNED_BUDGETS = Object.freeze({
  spell: { ms: 20, note: 'spelling correction, synchronous: known words <1 ms; a long word with no 1-edit neighbour runs the 2-edit search, 40-80 ms on a 1.8M vocabulary (measured locally)' },
  plan: { ms: 400, note: 'Jev plan LLM: 136-587 ms serial measured' },
  named: { ms: 150, note: 'named works -> doc ids (timeout 800)' },
  passages: { ms: 600, note: 'all engine calls of the relax ladder: 287-582 ms serial' },
  claims: { ms: 600, note: 'people / encounter claims beside the passages' },
  target: { ms: 300, note: 'search-target resolve wait after passages' },
  evidence: { ms: 150, note: 'cited paragraphs of a people answer' },
  resolve: { ms: 400, note: 'entity resolution: 213-463 ms serial' },
  search: { ms: 700, note: 'everything after the plan' },
  total: { ms: 1000, note: "Chad's 1 s budget for the whole planned search" },
});

export const QDRANT_CALL_MS = ENGINE_BUDGETS.qdrant.ms;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One engine `_timings` → {stage: ms}, with each collection's slowest call as `qdrant:<collection>`. Pure. */
export function engineStages(t = {}) {
  const out = {};
  for (const k of Object.keys(ENGINE_BUDGETS)) if (num(t[k]) != null) out[k] = t[k];
  for (const [c, ms] of Object.entries(t.qdrant_by || {})) if (num(ms) != null) out[`qdrant:${c}`] = ms;
  return out;
}

/** One planned `timings` → {stage: ms} (the `_ms` suffix dropped). Pure. */
export function plannedStages(t = {}) {
  const out = {};
  for (const k of Object.keys(PLANNED_BUDGETS)) { const v = num(t[`${k}_ms`]); if (v != null) out[k] = v; }
  return out;
}

/** The budget for a stage of a kind ('engine' | 'planned'); `qdrant:<collection>` shares the per-call budget. */
export function budgetFor(kind, stage) {
  if (kind === 'engine' && stage.startsWith('qdrant:')) return QDRANT_CALL_MS;
  return (kind === 'planned' ? PLANNED_BUDGETS : ENGINE_BUDGETS)[stage]?.ms ?? null;
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null);

/**
 * Many stage maps of one kind → per stage {n, p50, p95, max, budget, over}. `over` = p95 above budget.
 * Stages are sorted worst first by p95/budget so the first row is the one to fix. Pure.
 */
export function summarizeStages(kind, samples = []) {
  const by = new Map();
  for (const s of samples) for (const [k, v] of Object.entries(s || {})) { if (num(v) == null) continue; (by.get(k) || by.set(k, []).get(k)).push(v); }
  const rows = [];
  for (const [stage, vals] of by) {
    vals.sort((a, b) => a - b);
    const budget = budgetFor(kind, stage);
    const p95 = pct(vals, 0.95);
    rows.push({ stage, n: vals.length, p50: pct(vals, 0.5), p95, max: vals[vals.length - 1], budget, over: budget != null && p95 > budget });
  }
  return rows.sort((a, b) => (b.p95 / (b.budget || Infinity)) - (a.p95 / (a.budget || Infinity)));
}

/**
 * Trace rows ({endpoint, timings_json}) → {engine: rows, planned: rows, samples}. Engine rows are every multi-index call
 * (incl. those inside a planned search); planned rows come from endpoint 'planned' traces. Bad JSON is skipped. Pure.
 */
export function summarizeTraceRows(rows = []) {
  const engine = [], planned = [];
  for (const r of rows) {
    let t; try { t = typeof r.timings_json === 'string' ? JSON.parse(r.timings_json) : r.timings_json; } catch { continue; }
    if (!t || typeof t !== 'object') continue;
    if (r.endpoint === 'planned') planned.push(plannedStages(t)); else engine.push(engineStages(t));
  }
  return { samples: { engine: engine.length, planned: planned.length }, engine: summarizeStages('engine', engine), planned: summarizeStages('planned', planned) };
}

/**
 * The alarm verdict for a summary: only a USER-VISIBLE breach (the total of a kind) with enough samples is a breach;
 * stage overruns are listed as the cause. One issue per kind, so the alert dedups on `key`. Pure.
 */
export function latencyBreaches(summary, { minSamples = 20, factor = 1.5 } = {}) {
  const out = [];
  for (const kind of ['engine', 'planned']) {
    const rows = summary?.[kind] || [];
    const total = rows.find((r) => r.stage === 'total');
    if (!total || total.n < minSamples || total.p95 <= total.budget * factor) continue;
    const causes = rows.filter((r) => r.over && r.stage !== 'total').slice(0, 3).map((r) => `${r.stage} p95 ${r.p95}/${r.budget} ms`);
    out.push({ key: `search-latency:${kind}`, kind, p95: total.p95, budget: total.budget, n: total.n, causes,
      detail: `${kind} search p95 ${total.p95} ms vs ${total.budget} ms budget over ${total.n} searches${causes.length ? ` — ${causes.join(', ')}` : ''}` });
  }
  return out;
}

/**
 * system-checks verdict (alarm rules: only a real user-hurting breach alarms, one report per issue). A total breach seen on
 * this run AND the previous one (`prevSlow` = kinds breached last run) is CRITICAL (sustained); a first sighting is a WARN
 * (weekly queue). Stage overruns without a total breach are ONE warn naming the worst stages (weekly). Pure.
 * @returns {{checks: {name, ok, level, detail}[], slow: string[]}}
 */
export function latencyChecks(summary, prevSlow = [], opts = {}) {
  const breaches = latencyBreaches(summary, opts);
  const checks = breaches.map((b) => ({ name: `Search latency (${b.kind})`, ok: false, level: prevSlow.includes(b.kind) ? 'critical' : 'warn',
    detail: `${b.detail}${prevSlow.includes(b.kind) ? ' (sustained: two checks running)' : ''}` }));
  const breachedKinds = new Set(breaches.map((b) => b.kind));
  const stageOver = ['engine', 'planned'].filter((k) => !breachedKinds.has(k))
    .flatMap((k) => (summary?.[k] || []).filter((r) => r.over && r.n >= (opts.minSamples ?? 20)).map((r) => `${k}.${r.stage} p95 ${r.p95}/${r.budget} ms`));
  if (stageOver.length) checks.push({ name: 'Search stage budgets', ok: false, level: 'warn', detail: stageOver.slice(0, 6).join(' · ') });
  if (!checks.length) {
    const tot = (k) => (summary?.[k] || []).find((r) => r.stage === 'total');
    checks.push({ name: 'Search latency', ok: true, level: 'info', detail: ['engine', 'planned'].map((k) => (tot(k) ? `${k} p95 ${tot(k).p95}/${tot(k).budget} ms (n ${tot(k).n})` : `${k}: no searches`)).join(' · ') });
  }
  return { checks, slow: breaches.map((b) => b.kind) };
}
