<script>
  // Daily HyPE spend (area, real ledger) with questions taught overlaid as a line. d3-scale + d3-shape; scales with the SVG viewBox.
  import { scaleTime, scaleLinear } from 'd3-scale';
  import { area, line, curveMonotoneX } from 'd3-shape';
  import { usd, compact } from './util.js';
  let { days = [] } = $props();
  const W = 960, H = 280, M = { l: 52, r: 56, t: 14, b: 28 };
  const g = $derived.by(() => {
    if (!days.length) return null;
    const d = days.map((x) => ({ ...x, t: new Date(x.day) }));
    const x = scaleTime().domain([d[0].t, d[d.length - 1].t]).range([M.l, W - M.r]);
    const y = scaleLinear().domain([0, Math.max(...d.map((v) => v.usd)) * 1.1 || 1]).range([H - M.b, M.t]);
    const y2 = scaleLinear().domain([0, Math.max(...d.map((v) => v.questions)) * 1.1 || 1]).range([H - M.b, M.t]);
    return { d, x, y, y2, a: area().x((v) => x(v.t)).y0(H - M.b).y1((v) => y(v.usd)).curve(curveMonotoneX)(d), l: line().x((v) => x(v.t)).y((v) => y2(v.questions)).curve(curveMonotoneX)(d), ticks: y.ticks(4), ticks2: y2.ticks(4), xt: x.ticks(6) };
  });
  let hi = $state(null);
  function move(e) { if (!g) return; const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W; const t = g.x.invert(px).getTime(); hi = g.d.reduce((b, v) => (Math.abs(v.t - t) < Math.abs(b.t - t) ? v : b), g.d[0]); }
</script>

{#if g}
  <div class="relative">
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full" role="img" aria-label="Daily HyPE spend" onmousemove={move} onmouseleave={() => (hi = null)}>
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".55" /><stop offset="1" stop-color="var(--accent)" stop-opacity="0" /></linearGradient></defs>
      {#each g.ticks as t (t)}<line x1={M.l} x2={W - M.r} y1={g.y(t)} y2={g.y(t)} stroke="var(--border-subtle)" /><text x={M.l - 8} y={g.y(t) + 4} text-anchor="end" class="ax">{usd(t, 0)}</text>{/each}
      {#each g.ticks2 as t (t)}<text x={W - M.r + 8} y={g.y2(t) + 4} class="ax">{compact(t)}</text>{/each}
      {#each g.xt as t (+t)}<text x={g.x(t)} y={H - 8} text-anchor="middle" class="ax">{t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>{/each}
      <path d={g.a} fill="url(#sg)" /><path d={g.l} fill="none" stroke="var(--accent-tertiary)" stroke-width="2" stroke-dasharray="1200" class="ln" />
      {#if hi}<line x1={g.x(hi.t)} x2={g.x(hi.t)} y1={M.t} y2={H - M.b} stroke="var(--border-strong)" /><circle cx={g.x(hi.t)} cy={g.y(hi.usd)} r="4" fill="var(--accent)" /><circle cx={g.x(hi.t)} cy={g.y2(hi.questions)} r="4" fill="var(--accent-tertiary)" />{/if}
    </svg>
    {#if hi}<div class="tip"><b>{hi.day}</b><br />{usd(hi.usd)} · {compact(hi.paragraphs)} ¶<br />{compact(hi.questions)} questions · {compact(hi.implied)} implied</div>{/if}
    <p class="text-xs text-muted"><span style="color:var(--accent)">■</span> spend per day (left) · <span style="color:var(--accent-tertiary)">■</span> questions taught (right)</p>
  </div>
{:else}<p class="text-muted">No daily spend data yet.</p>{/if}

<style>
  .ax { fill: var(--text-muted); font-size: 11px; } .ln { animation: dash 1.8s ease-out forwards; stroke-dashoffset: 1200; } @keyframes dash { to { stroke-dashoffset: 0; } }
  .tip { position: absolute; top: 0; right: 4rem; background: var(--surface-solid); border: 1px solid var(--border-default); border-radius: .5rem; padding: .4rem .7rem; font-size: .75rem; color: var(--text-secondary); pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { .ln { animation: none; stroke-dashoffset: 0; } }
</style>
