<script>
  // First-principles graph: concept hubs -> questions -> passages -> authors (force-graph canvas). Click a question = side panel; "expand similar" re-roots with similar links.
  import { onMount, untrack } from 'svelte';
  import { api } from './api.js';
  import ItemCard from './ItemCard.svelte';
  import { colorOf } from './util.js';
  let { p, setp, onnav = () => {}, onchat = () => {}, concepts = [], religions = [] } = $props();
  let el = $state(null), graph, data = $state(null), error = $state(''), loading = $state(false), item = $state(null), find = $state(''), size = $state({ w: 800, h: 600 }), hover = $state(null);
  const TC = { concept: '#a78bfa', author: '#e2e8f0', passage: '#64748b' };
  const colorNode = (n) => (n.type === 'question' ? colorOf(n.religion) : n.type === 'passage' ? '#64748b' : TC[n.type]);
  const R = (n) => (n.type === 'concept' ? 9 + Math.sqrt(n.weight || 1) * 2 : n.type === 'question' ? 5 + Math.sqrt(n.weight || 1) : n.type === 'author' ? 6 : 2.5);
  let seq = 0;
  async function load() {
    const my = ++seq; loading = true; error = '';
    try { const d = await api.graph({ concept: p.concept, religion: p.religion, root: p.root, limit: 150 }); if (my !== seq) return; data = d; draw(); }
    catch (e) { if (my === seq) error = e.message; }
    if (my === seq) loading = false;
  }
  async function draw() {
    if (!el || !data) return;
    if (!graph) {
      const FG = (await import('force-graph')).default;
      graph = FG()(el).backgroundColor('rgba(0,0,0,0)').nodeRelSize(1).linkColor((l) => (l.type === 'similar' ? 'rgba(167,139,250,.8)' : 'rgba(148,163,184,.25)')).linkWidth((l) => (l.type === 'similar' ? 2 : 1))
        .nodeCanvasObject((n, ctx, gs) => {
          const r = R(n); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fillStyle = colorNode(n); ctx.globalAlpha = n.status === 'rejected' ? 0.3 : 1; ctx.fill();
          if (n.id === p.sel || n === hover) { ctx.lineWidth = 2 / gs; ctx.strokeStyle = '#fff'; ctx.stroke(); }
          ctx.globalAlpha = 1;
          if (n.type !== 'passage' && (gs > 1.1 || n.type === 'concept' || n === hover || n.id === p.sel)) { ctx.font = `${(n.type === 'concept' ? 13 : 10) / Math.max(gs, 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#e2e8f0'; ctx.fillText(n.label.length > 42 ? n.label.slice(0, 40) + '…' : n.label, n.x, n.y + r + 10 / Math.max(gs, 0.8)); }
        })
        .nodePointerAreaPaint((n, c, ctx) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, R(n) + 3, 0, 7); ctx.fill(); })
        .onNodeHover((n) => { hover = n; el.style.cursor = n ? 'pointer' : 'default'; })
        .onNodeClick((n) => pick(n)).cooldownTicks(120).onEngineStop(() => graph.zoomToFit(400, 40));
      graph.d3Force('charge')?.strength(-60);
    }
    graph.width(size.w).height(size.h).graphData({ nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) });
  }
  async function pick(n) {
    if (n.type === 'concept') { setp({ concept: n.label, root: '' }); return; }
    if (n.type === 'question') { setp({ sel: n.id }); try { item = await api.get(n.id); } catch (e) { error = e.message; } }
    else if (n.type === 'author') setp({ text: n.label, tab: 'explore' });
  }
  function focusNode() {
    const n = graph?.graphData().nodes.find((x) => x.label.toLowerCase().includes(find.toLowerCase())); if (!n || !find) return;
    graph.centerAt(n.x, n.y, 600); graph.zoom(3, 600); pick(n);
  }
  onMount(() => { const ro = new ResizeObserver(([e]) => { size = { w: e.contentRect.width, h: Math.max(480, window.innerHeight - 260) }; graph?.width(size.w).height(size.h); }); ro.observe(el.parentElement); return () => { ro.disconnect(); graph?._destructor?.(); }; });
  $effect(() => { JSON.stringify([p.concept, p.religion, p.root]); untrack(() => load()); });
  $effect(() => { const id = p.sel; if (id && data?.nodes.some((n) => n.id === id && n.type === 'question') && item?.id !== id) untrack(() => api.get(id).then((i) => (item = i)).catch(() => {})); });
</script>

<div class="bar">
  <select value={p.concept || ''} onchange={(e) => setp({ concept: e.target.value, root: '' })}><option value="">all concepts</option>{#each concepts as c (c)}<option>{c}</option>{/each}</select>
  <select value={p.religion || ''} onchange={(e) => setp({ religion: e.target.value })}><option value="">all traditions</option>{#each religions as r (r)}<option>{r}</option>{/each}</select>
  <input placeholder="find a node…" bind:value={find} onkeydown={(e) => e.key === 'Enter' && focusNode()} />
  {#if p.root}<button class="lk" onclick={() => setp({ root: '' })}>clear expansion</button>{/if}
  <div class="legend">
    <span><i style="background:#a78bfa"></i>concept</span><span><i style="background:#38bdf8"></i>question (tradition colour)</span><span><i style="background:#64748b"></i>passage</span><span><i style="background:#e2e8f0"></i>author</span><span><i class="ln"></i>similar</span>
  </div>
</div>
{#if error}<p class="text-error">{error} (showing last graph)</p>{/if}
<div class="wrap">
  <div class="canvas" style={`height:${size.h}px`}>
    <div bind:this={el} class="fg"></div>
    {#if loading && !data}<p class="ov">Building graph…</p>{:else if data && !data.nodes.length}<p class="ov">No premises for these filters yet.</p>{/if}
  </div>
  <aside class="side">
    {#if item}
      <ItemCard {item} readonly />
      <div class="btns"><button onclick={() => setp({ root: item.id })}>Expand similar</button><button onclick={() => onnav('explore', { sel: item.id })}>Open in explorer</button><button onclick={() => onnav('para', { para: item.paraId })}>HyPE editor</button><button onclick={() => onchat([item])}>Ask in chat</button></div>
    {:else}<p class="text-muted">Click a question node to see it here. Click a concept hub to filter to it; click an author to find their premises.</p>{/if}
  </aside>
</div>

<style>
  .bar { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-bottom: .75rem; } .bar select, .bar input { background: var(--surface-solid); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .5rem; padding: .35rem .6rem; font-size: .85rem; }
  .lk { color: var(--accent); } .legend { margin-left: auto; display: flex; gap: 1rem; font-size: .75rem; color: var(--text-tertiary); } .legend i { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; margin-right: .3rem; } .legend i.ln { width: 1rem; height: 2px; border-radius: 0; background: #a78bfa; vertical-align: middle; }
  .wrap { display: grid; grid-template-columns: 1fr 380px; gap: 1rem; } @media (max-width: 1100px) { .wrap { grid-template-columns: 1fr; } }
  .canvas { position: relative; min-width: 0; border-radius: 1rem; overflow: hidden; border: 1px solid var(--border-default); background: radial-gradient(circle at 50% 40%, var(--surface-2), var(--surface-solid)); } .fg { width: 100%; height: 100%; }
  .ov { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-muted); pointer-events: none; }
  .side { display: grid; gap: .75rem; align-content: start; } .btns { display: flex; flex-wrap: wrap; gap: .4rem; } .btns button { border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-primary); border-radius: .5rem; padding: .3rem .7rem; font-size: .8rem; } .btns button:hover { border-color: var(--accent); }
</style>
