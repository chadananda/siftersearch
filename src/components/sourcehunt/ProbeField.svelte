<script>
  // ProbeField: a canvas of probe cells that visualises the hunt as it happens. The parent drives it with REAL stage
  // results: burst(n) lights n cells (candidates found), lock(n) holds n cells lit (verbatim matches), focus() pulses one
  // (the source chosen). `active` keeps a background shimmer while the server works. Colours come from the theme tokens
  // (resolved through a probe element, so light-dark() works); prefers-reduced-motion draws a still field.
  import { onMount } from 'svelte';

  let { active = false, height = 150 } = $props();

  let canvas, wrap, probeEls = [];
  let cells = [], cols = 0, rows = 0, palette = ['#38bdf8', '#2dd4bf', '#a78bfa', '#fbbf24'], dim = 'rgba(148,163,184,0.16)';
  let raf = 0, reduced = false, locked = new Set(), focused = -1, last = 0;
  const SIZE = 5, GAP = 4;

  function layout() {
    if (!wrap || !canvas) return;
    const w = wrap.clientWidth, dpr = window.devicePixelRatio || 1;
    cols = Math.max(10, Math.floor((w + GAP) / (SIZE + GAP)));
    rows = Math.max(6, Math.floor((height + GAP) / (SIZE + GAP)));
    canvas.width = w * dpr; canvas.height = height * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${height}px`;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    cells = Array.from({ length: cols * rows }, () => ({ v: 0, c: (Math.random() * palette.length) | 0 }));
    locked = new Set(); focused = -1;
    draw();
  }

  function readPalette() {
    const got = probeEls.map((el) => el && getComputedStyle(el).color).filter(Boolean);
    if (got.length === 4) palette = got;
    if (probeEls[4]) dim = getComputedStyle(probeEls[4]).color;
  }

  const rnd = () => (Math.random() * cells.length) | 0;
  /** Light n random cells (a burst of real results). */
  export function burst(n, colorIndex = null) {
    for (let i = 0; i < Math.min(n, cells.length); i++) { const k = rnd(); cells[k].v = 1; if (colorIndex != null) cells[k].c = colorIndex; }
    if (reduced) draw();
  }
  /** Hold n cells lit (the matches that survive the verbatim check). */
  export function lock(n) {
    locked = new Set();
    while (locked.size < Math.min(n, cells.length)) locked.add(rnd());
    for (const k of locked) cells[k].c = 0;
    if (reduced) draw();
  }
  /** Pulse one locked cell (the chosen source). */
  export function focus() { focused = locked.size ? [...locked][0] : rnd(); if (reduced) draw(); }
  export function reset() { for (const c of cells) c.v = 0; locked = new Set(); focused = -1; if (reduced) draw(); }

  function draw(t = 0) {
    const ctx = canvas?.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < cells.length; i++) {
      const x = (i % cols) * (SIZE + GAP), y = ((i / cols) | 0) * (SIZE + GAP), cell = cells[i];
      const lit = locked.has(i) ? 0.75 + 0.25 * Math.sin(t / 300 + i) : cell.v;
      ctx.fillStyle = dim; ctx.fillRect(x, y, SIZE, SIZE);
      if (lit > 0.02) { ctx.globalAlpha = Math.min(1, lit); ctx.fillStyle = palette[cell.c]; ctx.fillRect(x, y, SIZE, SIZE); ctx.globalAlpha = 1; }
      if (i === focused) {
        const r = 6 + 4 * (1 + Math.sin(t / 220));
        ctx.strokeStyle = palette[0]; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - r / 2, y - r / 2, SIZE + r, SIZE + r); ctx.globalAlpha = 1;
      }
    }
  }

  function tick(t) {
    const dt = Math.min(64, t - last); last = t;
    if (active) for (let i = 0; i < 14; i++) { const k = rnd(); cells[k].v = Math.max(cells[k].v, 0.35 + Math.random() * 0.4); }
    for (const c of cells) c.v *= Math.pow(0.93, dt / 16);
    draw(t);
    raf = requestAnimationFrame(tick);
  }

  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    readPalette(); layout();
    const ro = new ResizeObserver(layout); ro.observe(wrap);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { readPalette(); draw(); };
    mq.addEventListener('change', onTheme);
    const mo = new MutationObserver(onTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mq.removeEventListener('change', onTheme); mo.disconnect(); };
  });
</script>

<div bind:this={wrap} class="probe-wrap" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
  <!-- theme colour probes: the canvas reads their computed colours -->
  <span bind:this={probeEls[0]} class="text-accent hidden-probe"></span>
  <span bind:this={probeEls[1]} class="text-accent-secondary hidden-probe"></span>
  <span bind:this={probeEls[2]} class="text-accent-tertiary hidden-probe"></span>
  <span bind:this={probeEls[3]} class="text-warning hidden-probe"></span>
  <span bind:this={probeEls[4]} class="text-border hidden-probe"></span>
</div>

<style>
  .probe-wrap { position: relative; width: 100%; overflow: hidden; }
  .probe-wrap canvas { display: block; }
  .hidden-probe { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
</style>
