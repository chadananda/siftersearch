<script>
  // Seekable waveform scrubber drawn from the item's BBC audiowaveform peaks (waveform.json); a plain bar until it loads
  // (or when it can't). Click/drag or ←/→ (±5 s) to seek; the selected ?t= range is shaded; `ticks` (topic subheaders) mark
  // the chapters like stations on a dial. `variant`: 'dial' (the hero, on the amber dial glass) | 'slim' (the sticky bar).
  // Deps: lib/media.js, lib/api.js. Peaks are fetched once per URL and shared between instances.
  import { onMount } from 'svelte';
  import { media } from '../../lib/api.js';
  import { waveformBars } from '../../lib/media.js';
  import { formatTime } from '../../../api/lib/media/range.js';

  let { url = null, duration = 0, current = 0, range = null, disabled = false, onseek, ticks = [], pins = [], variant = 'dial', label = 'Seek' } = $props();

  let bars = $state([]);
  let el;
  const N = variant === 'slim' ? 120 : 160;
  const pct = $derived(duration ? Math.min(100, (current / duration) * 100) : 0);
  const rangeBox = $derived(range?.end != null && duration ? { x: (range.start / duration) * N, w: ((range.end - range.start) / duration) * N } : null);
  // moments: needle-red pins along the foot of the wave
  const pinX = $derived(duration ? pins.filter((t) => t > 0 && t < duration).map((t) => (t / duration) * N) : []);
  const marks = $derived(duration ? ticks.filter((t) => t.t != null && t.t > 0 && t.t < duration).map((t) => ({ ...t, x: (t.t / duration) * N })) : []);

  const cache = (globalThis.__wfCache ??= new Map());
  onMount(async () => {
    if (!url) return;
    try {
      if (!cache.has(url)) cache.set(url, fetch(media.href(url)).then((r) => r.json()));
      bars = waveformBars(await cache.get(url), N);
    } catch { /* plain bar */ }
  });

  const timeAt = (clientX) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration; };
  function down(e) {
    if (disabled || !duration) return;
    el.setPointerCapture?.(e.pointerId);
    onseek?.(timeAt(e.clientX));
  }
  function key(e) {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onseek?.(Math.max(0, Math.min(duration, current + (e.key === 'ArrowRight' ? 5 : -5)))); }
  }
</script>

<div bind:this={el} role="slider" tabindex={disabled ? -1 : 0} aria-label={label} aria-valuemin="0" aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(current)}
  aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`} aria-disabled={disabled}
  class={['wf relative w-full touch-none select-none rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-radio-amber', variant === 'slim' ? 'h-7' : 'h-16 sm:h-20', disabled ? 'cursor-default' : 'cursor-pointer']}
  onpointerdown={down} onkeydown={key}>
  <svg class="h-full w-full" viewBox={`0 0 ${N} 100`} preserveAspectRatio="none" aria-hidden="true">
    <defs><clipPath id={`wf-played-${variant}`}><rect x="0" y="0" width={(pct / 100) * N} height="100" /></clipPath></defs>
    {#if rangeBox}<rect class="fill-highlight-range" x={rangeBox.x} y="0" width={Math.max(0.5, rangeBox.w)} height="100" />{/if}
    {#each marks as m, i (i)}<rect class="fill-radio-brass" x={m.x - 0.15} y="0" width="0.3" height="100" opacity="0.55" /><rect class="fill-radio-brass" x={m.x - 0.6} y="0" width="1.2" height="7" />{/each}
    {#if bars.length}
      <g class={variant === 'slim' ? 'fill-radio-on-dark' : 'fill-radio-dial-ink'} opacity={variant === 'slim' ? 0.3 : 0.28}>{#each bars as b, i (i)}<rect x={i + 0.15} y={54 - b * 42} width="0.7" height={b * 84} rx="0.3" />{/each}</g>
      <g class="fill-radio-amber" clip-path={`url(#wf-played-${variant})`}>{#each bars as b, i (i)}<rect x={i + 0.15} y={54 - b * 42} width="0.7" height={b * 84} rx="0.3" />{/each}</g>
    {:else}
      <rect class="fill-radio-line" x="0" y="48" width={N} height="10" rx="2" />
      <rect class="fill-radio-amber" x="0" y="48" width={(pct / 100) * N} height="10" rx="2" />
    {/if}
    {#each pinX as x, i (i)}<rect class="fill-radio-needle" x={x - 0.9} y="92" width="1.8" height="8" rx="0.6" />{/each}
    <rect class="fill-radio-needle" x={(pct / 100) * N - 0.35} y="0" width="0.7" height="100" />
  </svg>
  {#if variant === 'dial'}
    {#each marks as m, i (i)}
      <span class="tick-tip" style={`left:${(m.x / N) * 100}%`} title={`${formatTime(m.t)} — ${m.title}`} aria-hidden="true"></span>
    {/each}
  {/if}
</div>

<style>
  .tick-tip { position: absolute; top: -2px; width: 14px; height: 14px; transform: translateX(-50%); }
</style>
