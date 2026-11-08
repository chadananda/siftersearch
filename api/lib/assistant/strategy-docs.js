// The PUBLIC shapes behind the three layered Anís docs pages: /docs/anis-tools (foundation) → /docs/response-strategies (graphs,
// question classes, building steps) → /docs/anis-activities (reader activities). Graph rows come from strategies.db; the
// classes, plan tools, reader activities and decisions from planning/anis-strategies.json (anis-docs-data.js).
// Pure: rows + stats in, JSON out. What leaves here is structure and aggregates only — never a turn id, a question, a reply
// or template/prompt text (tests/api/strategy-docs.test.js checks the leak list).
import { SCHEMAS } from './tools.js';

const CANDIDATE = new Set(['candidate', 'replay', 'replaying', 'shadow']);
const exemplarText = (e) => (typeof e === 'string' ? e : e?.description ?? e?.class ?? null);   // class descriptions only, never e.question
const stat = (s) => (s ? { turns: s.turns, share: s.share, p50_ms: s.p50_ms, p95_ms: s.p95_ms, usd_per_turn: s.usd_per_turn, judged: s.judged,
  n_scored: s.n_scored, score: s.score, weak_pct: s.weak_pct, top_defects: s.top_defects || [] } : null);
const branchOut = (b) => ({ hash: b.hash, branch: b.branch, share: b.share, turns: b.turns, p50_ms: b.p50_ms, score: b.score, n_scored: b.n_scored, judged: b.judged, weak_pct: b.weak_pct });
const DAY = 86400_000;
const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z')) : NaN);

/**
 * snapshot = strategiesSnapshot(); activities = activityCatalog(); stats = strategyStats(); branches = id → branchStats(id).
 * → { strategies:[…active, with graph, templates, stats, branches, candidates], summary }
 */
export function publicStrategies({ snapshot, activities = [], stats = [], branches = () => [], promotions = null, now = Date.now() }) {
  // promotions = strategy_promotions ledger rows (newest first): each candidate shows its latest replay verdict — numbers and
  // failed rules only (decision.numbers never holds a question).
  const replayOf = (id, v) => {
    const p = (promotions || []).find((x) => x.strategy_id === id && Number(x.version) === Number(v) && x.action !== 'rollback' && x.decision);
    if (!p) return null;
    const n = p.decision.numbers || {};
    const scores = n.mean_candidate != null ? `score ${n.mean_candidate} vs ${n.mean_current} on ${n.n_class} questions` : null;
    const verdict = p.decision.promote ? (p.action === 'dry' ? 'would promote' : 'promoted') : `held: ${(p.decision.failed || [])[0] ?? p.action}`;
    return { action: p.action, promote: !!p.decision.promote, failed: p.decision.failed || [], numbers: p.decision.numbers || null,
      usd: p.usd ?? null, at: p.created_at ?? null, summary: [verdict, scores].filter(Boolean).join(' · ') };
  };
  const act = new Map(activities.map((a) => [a.name, a]));
  const steps = new Map(snapshot.steps.map((s) => [`${s.id}@${s.version}`, s]));
  const byId = new Map();
  for (const r of snapshot.strategies) { if (!byId.has(r.id)) byId.set(r.id, []); byId.get(r.id).push(r); }
  const statOf = (id, v) => stats.find((s) => s.strategy === id && Number(s.version) === Number(v)) || null;
  const out = [];
  for (const [id, rows] of byId) {
    const active = rows.filter((r) => r.status === 'active').sort((a, b) => b.version - a.version)[0];
    if (!active) continue;
    const g = active.graph || { nodes: {}, edges: [] };
    const nodes = Object.entries(g.nodes || {}).map(([nid, n]) => {
      const st = steps.get(`${n.step}@${n.step_version}`);
      const a = act.get(st?.activity) || {};
      return { id: nid, step: n.step, step_version: n.step_version, activity: st?.activity ?? null, kind: a.kind ?? null, cls: a.cls ?? null,
        template: st?.template_id ? { id: st.template_id, version: st.template_version } : null };
    });
    const templates = [...new Map(nodes.filter((n) => n.template).map((n) => [`${n.template.id}@${n.template.version}`, n.template])).values()];
    out.push({
      id, version: active.version, name: active.name, description: active.description ?? null,
      classes: Array.isArray(active.classes) ? active.classes : (SERVES[id] || []),
      exemplars: (active.exemplars || []).map(exemplarText).filter(Boolean),
      graph: { entry: g.entry, nodes, edges: (g.edges || []).map((e) => ({ from: e.from, on: e.on, to: e.to })) },
      templates,
      stats: stat(statOf(id, active.version)),
      branches: (branches(id) || []).slice(0, 12).map(branchOut),
      candidates: rows.filter((r) => r.version > active.version || CANDIDATE.has(r.status)).filter((r) => r !== active)
        .map((r) => ({ version: r.version, status: r.status, parent_version: r.parent_version ?? null, created_at: r.created_at ?? null,
          stats: stat(statOf(id, r.version)), replay: replayOf(id, r.version) ?? r.replay ?? null })),
    });
  }
  const promoted30 = promotions
    ? promotions.filter((p) => p.action === 'promote' && now - ts(p.created_at) <= 30 * DAY).length   // the ledger, when there is one
    : snapshot.strategies.filter((r) => r.status === 'active' && r.parent_version != null && r.created_by !== 'seed' && now - ts(r.created_at) <= 30 * DAY).length;
  return { strategies: out, summary: { active: out.length, candidates: snapshot.strategies.filter((r) => CANDIDATE.has(r.status)).length, promotions_30d: promoted30 } };
}

/** The code building steps: activities = activityCatalog(); snapshot → which strategies/steps use each; live = activityStats(). */
export function publicSteps({ activities = [], snapshot, live = {} }) {
  const usedBy = new Map();
  const steps = new Map(snapshot.steps.map((s) => [`${s.id}@${s.version}`, s]));
  for (const r of snapshot.strategies.filter((x) => x.status === 'active')) {
    for (const [nid, n] of Object.entries(r.graph?.nodes || {})) {
      const st = steps.get(`${n.step}@${n.step_version}`);
      if (!st) continue;
      if (!usedBy.has(st.activity)) usedBy.set(st.activity, []);
      usedBy.get(st.activity).push({ strategy: r.id, name: r.name, node: nid, step: `${n.step}@${n.step_version}` });
    }
  }
  return { steps: activities.map((a) => ({ ...a, used_by: usedBy.get(a.name) || [], live: live[a.name] || null })) };
}

// ---- the plan (planning/anis-strategies.json) joined to the live registry and graphs ----

// Plan tool id → the registry tool that now implements it (the plan predates the canonical _search/_lookup names).
export const PLAN_TO_REGISTRY = {
  find_work: 'document_search', about_work: 'work_notes_lookup', bm25: 'literal_search', phrase_semantic: 'phrase_search',
  hype: 'hype_search', library_search: 'combined_search', read_around: 'context_lookup', source_of: 'quotation_trace',
  trace_source: 'source_trace', find_original: 'original_lookup', find_translation: 'translation_lookup',
  word_study: 'rendering_lookup', people_search: 'biography_search', web: 'web_search',
};
// Seeded strategy id → the question classes (A1–H2) its graph serves; a row carrying `classes` overrides this.
export const SERVES = { comparison: ['C1', 'C2', 'C3'], understanding: ['B1', 'B2', 'B3'], prayer: ['D2'], guidance: ['D4'], reference: ['A5'], compilation: ['F1'] };
const GENERAL = 'respond';
const CLASS_ID = /^[A-H]\d$/;
const TOOLS_PAGE = '/docs/anis-tools', STRAT_PAGE = '/docs/response-strategies', ACT_PAGE = '/docs/anis-activities';
export const statusClass = (st) => (/^exists|^partly live|^live/.test(st || '') ? 'live' : /^partial|^pages exist/.test(st || '') ? 'partial' : 'later');
const toolHref = (id) => `${TOOLS_PAGE}#${PLAN_TO_REGISTRY[id] || id}`;
const classHref = (id) => `${STRAT_PAGE}#class-${id}`;
const total = (s) => (s.test_questions?.lead || 0) + (s.test_questions?.also || 0);
export const grounding = (n) => (n >= 100 ? 'strong' : n >= 20 ? 'moderate' : n >= 3 ? 'few' : 'thin');
const fallbackText = (f) => (f === 'deep_research' ? 'the deep-research job' : f === 'agent' ? 'the research agent' : f);
const usesOf = (plan) => {   // plan tool id → { classes, reader activities } that use it
  const u = new Map();
  const add = (id, k, v) => { if (!u.has(id)) u.set(id, { classes: [], reader_activities: [] }); const l = u.get(id)[k]; if (!l.includes(v)) l.push(v); };
  for (const s of plan?.strategies || []) for (const t of s.tiers || []) for (const st of t.steps || []) if (st.id && st.kind !== 'use') add(st.id, 'classes', s.id);
  for (const a of plan?.activities || []) for (const r of a.reuses || []) if (!CLASS_ID.test(r)) add(r, 'reader_activities', a.id);
  return u;
};
const planTool = (t, u) => ({ id: t.id, name: t.name, does: t.does, where: t.where, cost: t.cost, status: t.status, status_class: statusClass(t.status),
  classes: u.get(t.id)?.classes || [], reader_activities: u.get(t.id)?.reader_activities || [] });

/** Tools page: REGISTRY entries (tools.js) + the code steps that call them + live 7-day numbers (toolStats()), merged with the
 *  plan's tool rows by id (PLAN_TO_REGISTRY); plan tools with no registry entry are listed by status: built in code / planned. */
export function publicTools({ tools = [], activities = [], live = {}, plan = null }) {
  const callers = new Map();
  for (const a of activities) for (const t of a.tools || []) { if (!callers.has(t)) callers.set(t, []); callers.get(t).push(a.name); }
  const u = usesOf(plan);
  const planTools = (plan?.tools || []).map((t) => planTool(t, u));
  const byRegistry = new Map(planTools.filter((t) => PLAN_TO_REGISTRY[t.id]).map((t) => [PLAN_TO_REGISTRY[t.id], t]));
  const names = new Set(tools.map((t) => t.name));
  const rest = planTools.filter((t) => !names.has(PLAN_TO_REGISTRY[t.id]));
  return {
    schemas: Object.fromEntries(Object.entries(SCHEMAS).map(([k, v]) => [k, strip(v)])),
    tools: tools.map((t) => ({ name: t.name, label: t.label, kind: t.kind, purpose: t.purpose ?? null, description: t.description ?? null,
      input: strip(t.input), output: strip(t.output), outputName: t.outputName ?? null, activities: callers.get(t.name) || [], live: live[t.name] || null,
      plan: byRegistry.get(t.name) || null })),
    built: rest.filter((t) => t.status_class === 'live'),      // exist in code and run inside the pipeline; not model-callable
    planned: rest.filter((t) => t.status_class !== 'live'),    // partial or to build
    counts: { exists: planTools.filter((t) => t.status === 'exists').length, partial: planTools.filter((t) => t.status === 'partial').length,
      to_build: planTools.filter((t) => t.status === 'to build').length, registry: tools.length },
    plan_source: plan ? { file: 'planning/anis-strategies.json', updated: plan.updated ?? null } : null,
  };
}
const strip = (s) => { if (!s || typeof s !== 'object') return s ?? null; const { $id, ...rest } = s; return rest; };

/** Response Strategies page, the plan half: cost ladder, question classes A1–H2 (each with the active graph that serves it),
 *  composition, follow-up moves, decisions. strategies = publicStrategies().strategies (active, with `classes`). */
export function publicStrategyPlan({ plan, strategies = [] }) {
  if (!plan) return null;
  const servedBy = new Map();
  for (const s of strategies) for (const c of s.classes || []) if (!servedBy.has(c)) servedBy.set(c, { id: s.id, name: s.name });
  const general = strategies.find((s) => s.id === GENERAL);
  const step = (st) => ({ kind: st.kind, id: st.id || null, label: st.label, href: !st.id ? null : st.kind === 'use' ? classHref(st.id) : toolHref(st.id) });
  const classes = (plan.strategies || []).map((s) => {
    const sc = s.scenario || {};
    const by = servedBy.get(s.id) || null;
    return {
      id: s.id, family: s.family, name: s.name, status: s.status, types: s.types || [s.id], target_time: s.target_time ?? null,
      sounds_like: sc.sounds_like || [], sounds_like_note: sc.sounds_like_note ?? null, how_often: sc.how_often ?? null, often_with: sc.often_with ?? null,
      route: (sc.route || []).map((r) => ({ jev: !!r.jev, text: r.text })), ideal_answer: sc.ideal_answer ?? null,
      jev: s.jev || null, test_questions: s.test_questions || null, grounding: grounding(total(s)),
      tiers: (s.tiers || []).map((t) => ({ cost: t.cost, steps: (t.steps || []).map(step) })),
      llm_steps: (s.tiers || []).reduce((n, t) => n + (t.steps || []).filter((x) => x.kind === 'llm').length, 0),
      post: s.post ?? null, format: s.format ?? null, fallback: fallbackText(s.fallback), open_questions: s.open_questions || [], measure: s.measure ?? null,
      served_by: by,
      falls_back: by ? null : `no graph yet — falls back to the general strategy${general ? '' : ' (not active)'}, then ${fallbackText(s.fallback)}`,
    };
  });
  const c = plan.composition || {};
  return {
    source: { file: 'planning/anis-strategies.json', updated: plan.updated ?? null },
    ladder: plan.cost_ladder || [], grounding_scale: plan.grounding_scale || null,
    families: (plan.families || []).map((f) => ({ id: f.id, name: f.name, note: f.note || null, classes: classes.filter((x) => x.family === f.id).map((x) => x.id) })),
    classes,
    composition: { intro: c.intro ?? null, rules: c.rules || [], sets: c.sets || [], note: c.note ?? null, moves_note: c.moves_note || [], other_moves: c.other_moves || [] },
    decisions: plan.decisions || [], open_questions: plan.open_questions_for_chad || [],
  };
}

/** Activities page: the reader-facing activities (plan.activities), each step and reuse linked to the question class or tool it
 *  uses where one is named. strategies = publicStrategies().strategies, for the graph that serves a linked class. */
export function publicReaderActivities({ plan, strategies = [] }) {
  if (!plan) return { about: null, activities: [], source: null };
  const toolName = Object.fromEntries((plan.tools || []).map((t) => [t.id, t.name]));
  const className = Object.fromEntries((plan.strategies || []).map((s) => [s.id, s.name]));
  const actName = Object.fromEntries((plan.activities || []).map((a) => [a.id, a.name]));
  const served = new Map();
  for (const s of strategies) for (const c of s.classes || []) if (!served.has(c)) served.set(c, s.id);
  const known = (id) => CLASS_ID.test(id) ? !!className[id] : !!(toolName[id] || actName[id]);
  const ref = (id) => (CLASS_ID.test(id) ? { kind: 'class', id, label: `${id} ${className[id] || ''}`.trim(), href: classHref(id), strategy: served.get(id) || null }
    : toolName[id] ? { kind: 'tool', id, label: toolName[id], href: toolHref(id) }
      : actName[id] ? { kind: 'activity', id, label: actName[id], href: `${ACT_PAGE}#${id}` } : { kind: 'other', id, label: id, href: null });
  const linksIn = (text) => {
    const seen = new Set(), out = [];
    for (const m of String(text).matchAll(/\b([A-H]\d|[a-z]+(?:_[a-z]+)+)\b/g)) {
      if (seen.has(m[1]) || !known(m[1])) continue;
      seen.add(m[1]); out.push(ref(m[1]));
    }
    return out;
  };
  return {
    about: plan.activities_about ?? null,
    source: { file: 'planning/anis-strategies.json', updated: plan.updated ?? null },
    activities: (plan.activities || []).map((a) => ({
      id: a.id, name: a.name, status: a.status, status_class: statusClass(a.status), when: a.week ?? null, start: a.start ?? null,
      steps: (a.steps || []).map((text) => ({ text, links: linksIn(text) })),
      schedule: a.schedule ?? null, reuses: (a.reuses || []).map(ref), channels: a.channels || [], later_channels: a.later_channels || [],
      output: a.output ?? null, state: a.state ?? null, jev: a.jev || null, open_questions: a.open_questions || [], measure: a.measure ?? null,
    })),
  };
}

