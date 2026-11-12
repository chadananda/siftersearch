<script>
  // Hand-built money flow (no d3-sankey installed): HyPE $ -> tradition -> stated questions / implied first principles. Implied split is ESTIMATED (ledger has $ per run only).
  import { colorOf, usd } from './util.js';
  let { spend } = $props();
  const W = 960, H = 400, NW = 18, GAP = 10, X0 = 150, X1 = 480, X2 = 760;
  const lay = $derived.by(() => {
    const rows = (spend?.byReligion || []).filter((r) => r.usd > 0).sort((a, b) => b.usd - a.usd);
    const T = rows.reduce((a, r) => a + r.usd, 0) || 1, f = spend?.totalUsd ? Math.min(1, (spend.impliedShareUsd || 0) / spend.totalUsd) : 0;
    const k = (H - GAP * (rows.length - 1)) / T;
    let y = 0, lo = 0, ro = 0;
    const mids = rows.map((r) => { const h = r.usd * k, m = { ...r, y, h, l0: lo, r0: ro }; y += h + GAP; lo += h; return m; });
    const impliedH = T * f * k, statedH = T * (1 - f) * k, hs = H - impliedH - statedH - 40;
    const sy = 0, iy = statedH + Math.max(30, Math.min(hs, 60));
    let sOff = 0, iOff = 0;
    const links = mids.flatMap((m) => { const a = { m, kind: 'stated', h: m.h * (1 - f), ty: sy + sOff }, b = { m, kind: 'implied', h: m.h * f, ty: iy + iOff }; sOff += a.h; iOff += b.h; return [a, b]; });
    return { mids, links, T, f, statedH, impliedH, iy, sy };
  });
  const path = (x0, y0, x1, y1) => `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
  let hover = $state(null);
</script>

<svg viewBox={`0 0 ${W} ${H + 20}`} class="w-full" role="img" aria-label="Where the HyPE money goes">
  <g transform="translate(0,10)">
    <rect x={X0 - NW} y="0" width={NW} height={H} rx="4" fill="var(--accent)" />
    <text x={X0 - NW - 10} y={H / 2 - 8} text-anchor="end" class="lbl">HyPE spend</text>
    <text x={X0 - NW - 10} y={H / 2 + 14} text-anchor="end" class="val">{usd(lay.T, 0)}</text>
    {#each lay.mids as m (m.religion)}
      <path d={path(X0, m.l0 + m.h / 2, X1 - NW, m.y + m.h / 2)} stroke={colorOf(m.religion)} stroke-width={Math.max(1, m.h)} fill="none" opacity={hover && hover !== m.religion ? 0.1 : 0.4} class="rib" />
      <rect x={X1 - NW} y={m.y} width={NW} height={Math.max(2, m.h)} rx="3" fill={colorOf(m.religion)} onmouseenter={() => (hover = m.religion)} onmouseleave={() => (hover = null)} />
      <text x={X1 - NW - 8} y={m.y + m.h / 2 - 2} text-anchor="end" class="lbl">{m.religion}</text>
      <text x={X1 - NW - 8} y={m.y + m.h / 2 + 14} text-anchor="end" class="val">{usd(m.usd, 0)}{m.estimated ? ' est.' : ''}</text>
    {/each}
    {#each lay.links as l (l.m.religion + l.kind)}
      {#if l.h > 0.3}<path d={path(X1, l.m.y + (l.kind === 'stated' ? l.h / 2 : l.m.h - l.h / 2), X2 - NW, l.ty + l.h / 2)} stroke={colorOf(l.m.religion)} stroke-width={l.h} fill="none" opacity={hover && hover !== l.m.religion ? 0.08 : l.kind === 'implied' ? 0.7 : 0.3} class="rib" />{/if}
    {/each}
    <rect x={X2 - NW} y={lay.sy} width={NW} height={Math.max(2, lay.statedH)} rx="3" fill="var(--text-tertiary)" />
    <text x={X2 + 6} y={lay.sy + lay.statedH / 2 - 2} class="lbl">Stated questions</text>
    <text x={X2 + 6} y={lay.sy + lay.statedH / 2 + 14} class="val">{usd(lay.T * (1 - lay.f), 0)} est.</text>
    <rect x={X2 - NW} y={lay.iy} width={NW} height={Math.max(2, lay.impliedH)} rx="3" fill="var(--accent-tertiary)" />
    <text x={X2 + 6} y={lay.iy + lay.impliedH / 2 - 2} class="lbl">Implied first principles</text>
    <text x={X2 + 6} y={lay.iy + lay.impliedH / 2 + 14} class="val">{usd(lay.T * lay.f, 0)} est.</text>
  </g>
</svg>

<style>
  .lbl { fill: var(--text-primary); font-size: 14px; font-weight: 600; } .val { fill: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }
  .rib { transition: opacity .25s; stroke-linecap: butt; animation: draw 1.2s ease-out both; } @keyframes draw { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .rib { animation: none; } }
</style>
