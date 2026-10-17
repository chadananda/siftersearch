<script>
  // The dial (Chad 10-16: "a circle with expanding rings for each step in the ingestion process … a powerful machine
  // ingesting and studying the library"). Centre = the library; rings outward = the enhancement stages in order; sectors =
  // traditions (equal angles — each tradition as visible as the largest); each cell = that tradition's progress on that
  // stage. A sweep circles the dial; particles stream from the core to the rings a running job is feeding.
  import { dialLayout, arcPath, fillDeg, polar, compact, pct, RING_INFO } from '../../lib/observatory.js';
  import { OCEAN_LOGO_PATH } from '../../lib/ocean-logo.js';

  let { snapshot, activeRings = [], now = Date.now(), onhover = () => {} } = $props();

  const C = 500;
  const SLUG = { "Baha'i": 'bahai', Islam: 'islam', Christian: 'christian', Judaism: 'judaism', Zoroastrian: 'zoroastrian', Hindu: 'hindu',
    Buddhist: 'buddhist', Jain: 'jain', Sikh: 'sikh', Tao: 'tao', Confucian: 'confucian', Other: 'other' };
  const LABEL = { "Baha'i": 'Bahá’í', Tao: 'Taoist', Other: 'Other' };

  const traditions = $derived(snapshot?.traditions?.map((t) => t.id) || []);
  const rings = $derived(snapshot?.rings || []);
  const layout = $derived(dialLayout(traditions, rings.map((r) => r.id)));
  const cellOf = $derived(new Map((snapshot?.cells || []).map((c) => [`${c.tradition}|${c.ring}`, c])));

  // particles: a stream to each ring being fed right now, along a fixed spread of angles (stable between renders)
  const particles = $derived.by(() => {
    const out = [];
    activeRings.forEach((ringId) => {
      const band = layout.bands.find((b) => b.id === ringId);
      if (!band) return;
      for (let i = 0; i < 9; i++) {
        const sector = layout.sectors[(i * 5 + ringId.length) % Math.max(1, layout.sectors.length)];
        if (!sector) continue;
        const a = sector.a0 + ((i * 37) % 100) / 100 * (sector.a1 - sector.a0);
        const [x0, y0] = polar(C, C, 120, a), [x1, y1] = polar(C, C, (band.r0 + band.r1) / 2, a);
        out.push({ key: `${ringId}-${i}`, path: `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`, slug: SLUG[sector.id], dur: 1.6 + (i % 4) * 0.35, begin: (i * 0.41) % 2.4 });
      }
    });
    return out;
  });

  // outer tick ring — a precision-instrument bezel
  const ticks = Array.from({ length: 120 }, (_, i) => {
    const a = i * 3, long = i % 5 === 0;
    const [x0, y0] = polar(C, C, 442, a), [x1, y1] = polar(C, C, long ? 454 : 448, a);
    return { x0, y0, x1, y1, long };
  });

  const paragraphs = $derived(snapshot?.corpus?.paragraphs ?? 0);
  function hover(e, t, ring) {
    const c = cellOf.get(`${t}|${ring.id}`);
    onhover(c ? { x: e.clientX, y: e.clientY, tradition: LABEL[t] || t, ring: RING_INFO[ring.id]?.title || ring.label, sub: RING_INFO[ring.id]?.sub, done: c.done, total: c.total, sections: ring.id === 'sections' } : null);
  }
</script>

<svg class="dial" viewBox="0 0 1000 1000" role="img"
  aria-label={`Library enhancement dial: ${rings.map((r) => `${r.label} ${pct(r.done, r.total)}`).join(', ')}`}>
  <defs>
    <filter id="obs-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    <radialGradient id="obs-core" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="var(--obs-core-hi)" /><stop offset="100%" stop-color="var(--obs-core-lo)" /></radialGradient>
    <linearGradient id="obs-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--obs-sweep)" stop-opacity="0" /><stop offset="100%" stop-color="var(--obs-sweep)" stop-opacity="0.28" /></linearGradient>
  </defs>

  <!-- bezel -->
  <circle cx={C} cy={C} r="440" class="bezel" />
  {#each ticks as t, i (i)}<line x1={t.x0} y1={t.y0} x2={t.x1} y2={t.y1} class:long={t.long} class="tick" />{/each}

  <!-- cells: track + progress, per tradition × stage -->
  {#each layout.sectors as s (s.id)}
    {#each layout.bands as b, bi (b.id)}
      {@const ring = rings[bi]}
      {@const c = cellOf.get(`${s.id}|${b.id}`)}
      {@const deg = c ? fillDeg(c.done, c.total, s.a0, s.a1) : 0}
      <g class="cell" class:planned={ring?.planned} style={`--c: var(--obs-${SLUG[s.id]})`}
        onmouseenter={(e) => hover(e, s.id, ring)} onmousemove={(e) => hover(e, s.id, ring)} onmouseleave={() => onhover(null)} role="presentation">
        <path d={arcPath(C, C, b.r0, b.r1, s.a0, s.a1)} class="track" />
        {#if deg > 0}<path d={arcPath(C, C, b.r0, b.r1, s.a0, s.a0 + deg)} class="fill" filter={deg / (s.a1 - s.a0) > 0.02 ? 'url(#obs-glow)' : undefined} />{/if}
      </g>
    {/each}
  {/each}

  <!-- tradition names on the bezel -->
  {#each layout.sectors as s (s.id)}
    {@const [x, y] = polar(C, C, 472, (s.a0 + s.a1) / 2)}
    {@const mid = (s.a0 + s.a1) / 2}
    <text x={x} y={y} class="trad" style={`fill: var(--obs-${SLUG[s.id]})`} text-anchor="middle" dominant-baseline="middle"
      transform={`rotate(${mid > 90 && mid < 270 ? mid + 180 : mid} ${x} ${y})`}>{(LABEL[s.id] || s.id).toUpperCase()}</text>
  {/each}

  <!-- stage names in the gap at the top, each beside its ring, with the library-wide figure -->
  {#each layout.bands as b, bi (b.id)}
    {@const ring = rings[bi]}
    <text x={C} y={C - (b.r0 + b.r1) / 2} class="stage" class:planned={ring?.planned} text-anchor="middle" dominant-baseline="middle">
      {ring?.short} <tspan class="stage-pct">{ring?.planned ? 'PLANNED' : pct(ring?.done, ring?.total)}</tspan>
    </text>
  {/each}

  <!-- the sweep -->
  <g class="sweep"><path d={arcPath(C, C, 124, 436, 0, 28)} fill="url(#obs-sweep)" /></g>

  <!-- particles: work flowing from the library into the stage being built -->
  {#each particles as p (p.key)}
    <circle r="2.6" class="particle" style={`fill: var(--obs-${p.slug})`} opacity="0">
      <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" path={p.path} />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite" />
    </circle>
  {/each}

  <!-- core: Ocean Library (Chad 10-16: "call it Ocean Library and add the faded Ocean logo at the very center"; text set
       to the circle — the name on the upper arc, the count in the middle, the holdings on the lower arc, reading upright) -->
  <circle cx={C} cy={C} r="118" fill="url(#obs-core)" class="core" />
  <path id="obs-core-top" d={`M ${C - 92} ${C} A 92 92 0 0 1 ${C + 92} ${C}`} fill="none" />
  <path id="obs-core-bottom" d={`M ${C - 100} ${C} A 100 100 0 0 0 ${C + 100} ${C}`} fill="none" />
  <g class="core-logo" transform={`translate(${C - 100} ${C - 100}) scale(${200 / 512})`}><path d={OCEAN_LOGO_PATH} /></g>
  <circle cx={C} cy={C} r="118" class="core-ring" />
  <circle cx={C} cy={C} r="106" class="core-inner" />
  <circle cx={C} cy={C} r="118" class="core-pulse" />
  <text class="core-name"><textPath href="#obs-core-top" startOffset="50%" text-anchor="middle">OCEAN LIBRARY</textPath></text>
  <text x={C} y={C + 10} class="core-num" text-anchor="middle">{compact(paragraphs)}</text>
  <text x={C} y={C + 32} class="core-label" text-anchor="middle">PARAGRAPHS</text>
  <text class="core-sub"><textPath href="#obs-core-bottom" startOffset="50%" text-anchor="middle">{compact(snapshot?.corpus?.documents)} DOCUMENTS · {snapshot?.corpus?.traditions ?? '—'} TRADITIONS</textPath></text>
</svg>

<style>
  .dial { width: 100%; height: auto; display: block; overflow: visible; }
  .bezel { fill: none; stroke: var(--obs-line); stroke-width: 1; }
  .tick { stroke: var(--obs-line); stroke-width: 1; }
  .tick.long { stroke: var(--obs-line-strong); stroke-width: 1.4; }
  .track { fill: var(--c); opacity: 0.08; transition: opacity 0.2s; }
  .fill { fill: var(--c); opacity: 0.78; transition: d 1.2s ease; }
  .cell { cursor: crosshair; }
  .cell:hover .track { opacity: 0.28; }
  .cell.planned .track { opacity: 0.05; }
  .trad { font: 600 13px/1 var(--obs-sans); letter-spacing: 0.14em; }
  .stage { font: 500 9.5px/1 var(--obs-mono); fill: var(--obs-text-dim); letter-spacing: 0.06em; }
  .stage-pct { fill: var(--obs-text); font-weight: 600; }
  .stage.planned, .stage.planned .stage-pct { fill: var(--obs-text-faint); }
  .sweep { transform-box: view-box; transform-origin: 50% 50%; animation: obs-spin 14s linear infinite; pointer-events: none; }
  .particle { filter: drop-shadow(0 0 3px currentColor); pointer-events: none; }
  .core { stroke: none; }
  .core-ring { fill: none; stroke: var(--obs-accent); stroke-width: 1.2; opacity: 0.7; }
  .core-pulse { fill: none; stroke: var(--obs-accent); stroke-width: 2; transform-box: view-box; transform-origin: 50% 50%; animation: obs-pulse 3.2s ease-out infinite; }
  .core-num { font: 600 44px/1 var(--obs-mono); fill: var(--obs-text); letter-spacing: -0.02em; }
  .core-label { font: 600 10px/1 var(--obs-sans); fill: var(--obs-text-dim); letter-spacing: 0.26em; }
  .core-name { font: 700 14px/1 var(--obs-sans); fill: var(--obs-accent); letter-spacing: 0.34em; }
  .core-sub { font: 600 9.5px/1 var(--obs-mono); fill: var(--obs-text-dim); letter-spacing: 0.16em; }
  .core-logo path { fill: var(--obs-accent); opacity: 0.2; }
  .core-inner { fill: none; stroke: var(--obs-line); stroke-width: 1; stroke-dasharray: 2 5; }
  @keyframes obs-spin { to { transform: rotate(360deg); } }
  @keyframes obs-pulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.18); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .sweep, .core-pulse, .particle { display: none; } .fill { transition: none; } }
</style>
