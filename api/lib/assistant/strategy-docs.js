// The PUBLIC shapes behind /docs/response-strategies, /docs/anis-activities and /docs/anis-tools (strategy graph Phase 2).
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
export function publicStrategies({ snapshot, activities = [], stats = [], branches = () => [], now = Date.now() }) {
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
      exemplars: (active.exemplars || []).map(exemplarText).filter(Boolean),
      graph: { entry: g.entry, nodes, edges: (g.edges || []).map((e) => ({ from: e.from, on: e.on, to: e.to })) },
      templates,
      stats: stat(statOf(id, active.version)),
      branches: (branches(id) || []).slice(0, 12).map(branchOut),
      candidates: rows.filter((r) => r.version > active.version || CANDIDATE.has(r.status)).filter((r) => r !== active)
        .map((r) => ({ version: r.version, status: r.status, parent_version: r.parent_version ?? null, created_at: r.created_at ?? null,
          stats: stat(statOf(id, r.version)), replay: r.replay ?? null })),
    });
  }
  const promotions = snapshot.strategies.filter((r) => r.status === 'active' && r.parent_version != null && r.created_by !== 'seed' && now - ts(r.created_at) <= 30 * DAY).length;
  return { strategies: out, summary: { active: out.length, candidates: snapshot.strategies.filter((r) => CANDIDATE.has(r.status)).length, promotions_30d: promotions } };
}

/** activities = activityCatalog(); snapshot → which strategies/steps use each; live = activityStats(). */
export function publicActivities({ activities = [], snapshot, live = {} }) {
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
  return { activities: activities.map((a) => ({ ...a, used_by: usedBy.get(a.name) || [], live: live[a.name] || null })) };
}

/** REGISTRY entries (tools.js list()) + which activities call them + live 7-day numbers (toolStats()). */
export function publicTools({ tools = [], activities = [], live = {} }) {
  const callers = new Map();
  for (const a of activities) for (const t of a.tools || []) { if (!callers.has(t)) callers.set(t, []); callers.get(t).push(a.name); }
  return {
    schemas: Object.fromEntries(Object.entries(SCHEMAS).map(([k, v]) => [k, strip(v)])),
    tools: tools.map((t) => ({ name: t.name, label: t.label, kind: t.kind, purpose: t.purpose ?? null, description: t.description ?? null,
      input: strip(t.input), output: strip(t.output), outputName: t.outputName ?? null, activities: callers.get(t.name) || [], live: live[t.name] || null })),
  };
}
const strip = (s) => { if (!s || typeof s !== 'object') return s ?? null; const { $id, ...rest } = s; return rest; };
