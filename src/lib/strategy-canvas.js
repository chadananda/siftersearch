// Pure transform: public strategy graph → xyflow nodes/edges (dagre LR layout), edge counts from branch stats, optional run overlay.
// Used by src/components/anis/StrategyCanvas.svelte; unit-tested in tests/api/strategy-canvas.test.js. Deps: @dagrejs/dagre.
import dagre from '@dagrejs/dagre';
import { humanStep, stepKind } from './strategy-docs.js';

export const NODE_W = 230, NODE_H = 96, PILL_W = 64, PILL_H = 28;
const END = '$end';

/** Per-edge turn counts from branches ("node:edge" paths with .turns) → Map("from|on" → turns). */
export function edgeCounts(branches = []) {
  const m = new Map();
  for (const b of branches) for (const p of b.branch || []) {
    const i = p.lastIndexOf(':');
    if (i < 0) continue;
    const k = `${p.slice(0, i)}|${p.slice(i + 1)}`;
    m.set(k, (m.get(k) || 0) + (b.turns || 0));
  }
  return m;
}
/** "reads → writes" chips from a catalog entry's input/output text. */
const chips = (t) => String(t || '').split(/[,+]/).map((x) => x.trim()).filter(Boolean).slice(0, 4);

/**
 * graph = {entry, nodes:[{id, step, step_version, activity, kind, cls, template}], edges:[{from,on,to}]}
 * opts: steps (catalog by activity name: description,input,output,tools,live), branches, strategies (for hand-off links),
 *       run {path:[id], values:{id:{…}}} (lit path, dimmed rest).
 */
export function buildFlow(graph, { steps = [], branches = [], strategies = [], run = null } = {}) {
  const gn = graph?.nodes || [], ge = graph?.edges || [];
  const cat = new Map(steps.map((s) => [s.name, s]));
  const counts = edgeCounts(branches);
  const out = new Map(); for (const e of ge) out.set(e.from, [...(out.get(e.from) || []), e]);
  const lit = run ? new Set(run.path || []) : null;
  const pathEdge = new Set(run ? (run.path || []).slice(1).map((id, i) => `${run.path[i]}>${id}`) : []);
  const byName = new Map(strategies.map((s) => [s.name, s]));
  const nodes = gn.map((n) => {
    const c = cat.get(n.activity) || {};
    const exits = (out.get(n.id) || []).filter((e) => e.on !== '*');
    const handName = n.activity?.startsWith('strategy.') ? n.activity.slice(9) : null;
    return { id: n.id, type: 'step', position: { x: 0, y: 0 }, width: NODE_W, height: NODE_H,
      data: { id: n.id, title: humanStep(n.activity) || n.id, activity: n.activity, step: `${n.step}@${n.step_version}`, kind: stepKind(n),
        decision: n.cls === 'jev' || new Set(exits.map((e) => e.on)).size >= 2, entry: n.id === graph.entry,
        tool: c.tools?.[0] || null, tools: c.tools || [], description: c.description || '', reads: chips(c.input), writes: chips(c.output),
        template: n.template || null, live: c.live || null, hand: handName && byName.get(handName) ? { id: byName.get(handName).id, name: handName } : null,
        state: lit ? (lit.has(n.id) ? 'lit' : 'dim') : 'normal', value: run?.values?.[n.id] ?? null } };
  });
  const ends = ge.some((e) => e.to === END);
  if (ends) nodes.push({ id: END, type: 'end', position: { x: 0, y: 0 }, width: PILL_W, height: PILL_H, data: { title: 'end', state: lit ? 'lit' : 'normal' } });
  const total = (from) => (out.get(from) || []).reduce((a, e) => a + (counts.get(`${from}|${e.on}`) || 0), 0);
  const edges = ge.map((e, i) => {
    const n = counts.get(`${e.from}|${e.on}`), t = total(e.from), thenEdge = e.on === '*';
    const parts = [thenEdge ? '' : e.on, n != null && !(thenEdge && (out.get(e.from) || []).length === 1) ? `${n}${t ? ` · ${Math.round((n / t) * 100)}%` : ''}` : ''].filter(Boolean);
    const on = run ? pathEdge.has(`${e.from}>${e.to}`) : null;
    return { id: `e${i}-${e.from}-${e.to}`, source: e.from, target: e.to, label: parts.join(' · '), type: 'smoothstep', style: run ? (on ? 'stroke-width:3' : 'opacity:.3') : '',
      data: { on: e.on, count: n ?? null, state: run ? (on ? 'lit' : 'dim') : 'normal' } };
  });
  // dagre LR layout (centres → xyflow top-left)
  const g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 90 }); g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  dagre.layout(g);
  for (const n of nodes) { const p = g.node(n.id); n.position = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) }; }
  return { nodes, edges: edges.filter((e) => g.hasNode(e.source) && g.hasNode(e.target)) };
}
