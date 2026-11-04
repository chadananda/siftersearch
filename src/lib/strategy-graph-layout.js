// A strategy graph's SVG layout for /docs/response-strategies: layered top-to-bottom by longest path from the entry (cycles
// guarded), nodes left-to-right in discovery order, '$end' as the last layer. Edges between adjacent layers are straight;
// longer ones (an early exit to the end) curve out along the right. Pure; no dependency.
export const END = '$end';
const W = 176, H = 34, GAP_X = 24, GAP_Y = 22, PAD = 12, SIDE = 70;

export function layoutGraph(graph) {
  const ids = (graph?.nodes || []).map((n) => n.id);
  const byId = new Map((graph?.nodes || []).map((n) => [n.id, n]));
  const edges = (graph?.edges || []).filter((e) => byId.has(e.from) && (byId.has(e.to) || e.to === END));
  const layer = new Map([[graph?.entry, 0]]);
  for (let pass = 0; pass <= ids.length; pass++) {   // longest-path relaxation; a cycle stops growing at ids.length
    let moved = false;
    for (const e of edges) {
      if (e.to === END || !layer.has(e.from)) continue;
      const want = layer.get(e.from) + 1;
      if (want <= ids.length && (layer.get(e.to) ?? -1) < want) { layer.set(e.to, want); moved = true; }
    }
    if (!moved) break;
  }
  let maxL = 0;
  for (const id of ids) { if (!layer.has(id)) layer.set(id, 0); maxL = Math.max(maxL, layer.get(id)); }
  const hasEnd = edges.some((e) => e.to === END);
  if (hasEnd) layer.set(END, maxL + 1);
  const rows = [];
  for (const id of [...ids, ...(hasEnd ? [END] : [])]) (rows[layer.get(id)] ||= []).push(id);
  const widest = Math.max(1, ...rows.map((r) => r?.length || 0));
  const inner = widest * W + (widest - 1) * GAP_X;
  const pos = new Map();
  rows.forEach((r, li) => (r || []).forEach((id, i) => {
    const rowW = r.length * W + (r.length - 1) * GAP_X;
    pos.set(id, { x: PAD + (inner - rowW) / 2 + i * (W + GAP_X), y: PAD + li * (H + GAP_Y) });
  }));
  const nodes = [...pos].map(([id, p]) => {
    const n = byId.get(id);
    return { id, x: p.x, y: p.y, w: W, h: H, end: id === END, activity: n?.activity ?? null, kind: n?.kind ?? null, step: n?.step ?? null };
  });
  // one drawn edge per (from, to); its label lists the named edges ('*' = any other, unlabelled)
  const merged = new Map();
  for (const e of edges) { const k = `${e.from}>${e.to}`; if (!merged.has(k)) merged.set(k, { from: e.from, to: e.to, on: [] }); if (e.on !== '*') merged.get(k).on.push(e.on); }
  const right = PAD + inner;
  const drawn = [...merged.values()].map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    const span = layer.get(e.to) - layer.get(e.from);
    const label = e.on.join(' | ');
    if (span === 1) {
      const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
      return { ...e, label, d: `M${x1},${y1} L${x2},${y2}`, lx: (x1 + x2) / 2 + 6, ly: (y1 + y2) / 2 + 4 };
    }
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x + W, y2 = b.y + H / 2, cx = right + SIDE * 0.8;
    return { ...e, label, side: true, d: `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`, lx: x1 + 6, ly: y1 - 4 };
  });
  return { width: Math.ceil(right + PAD + (drawn.some((e) => e.side) ? SIDE : 0)), height: PAD * 2 + rows.length * H + (rows.length - 1) * GAP_Y, nodes, edges: drawn };
}
