<script>
  // Slim seekable progress bar drawn from the item's BBC audiowaveform peaks (waveform.json); a plain bar until it loads
  // (or when it can't). Click/drag or ←/→ (±5 s) to seek; the selected ?t= range is shaded. Deps: lib/media.js, lib/api.js.
  import { onMount } from 'svelte';
  import { media } from '../../lib/api.js';
  import { waveformBars } from '../../lib/media.js';
  import { formatTime } from '../../../api/lib/media/range.js';

  let { url = null, duration = 0, current = 0, range = null, disabled = false, onseek } = $props();

  let bars = $state([]);
  let el;
  const N = 160;
  const pct = $derived(duration ? Math.min(100, (current / duration) * 100) : 0);
  const rangeBox = $derived(range?.end != null && duration ? { x: (range.start / duration) * N, w: ((range.end - range.start) / duration) * N } : null);

  onMount(async () => {
    if (!url) return;
    try { bars = waveformBars(await (await fetch(media.href(url))).json(), N); } catch { /* plain bar */ }
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

<div bind:this={el} role="slider" tabindex={disabled ? -1 : 0} aria-label="Seek" aria-valuemin="0" aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(current)}
  aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`} aria-disabled={disabled}
  class={['relative h-10 w-full touch-none select-none rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent', disabled ? 'cursor-default' : 'cursor-pointer']}
  onpointerdown={down} onkeydown={key}>
  <svg class="h-full w-full" viewBox={`0 0 ${N} 100`} preserveAspectRatio="none" aria-hidden="true">
    <defs><clipPath id="wf-played"><rect x="0" y="0" width={(pct / 100) * N} height="100" /></clipPath></defs>
    {#if rangeBox}<rect class="fill-highlight-range" x={rangeBox.x} y="0" width={Math.max(0.5, rangeBox.w)} height="100" />{/if}
    {#if bars.length}
      <g class="fill-surface-3">{#each bars as b, i (i)}<rect x={i + 0.15} y={50 - b * 46} width="0.7" height={b * 92} />{/each}</g>
      <g class="fill-accent" clip-path="url(#wf-played)">{#each bars as b, i (i)}<rect x={i + 0.15} y={50 - b * 46} width="0.7" height={b * 92} />{/each}</g>
    {:else}
      <rect class="fill-surface-3" x="0" y="46" width={N} height="8" rx="2" />
      <rect class="fill-accent" x="0" y="46" width={(pct / 100) * N} height="8" rx="2" />
    {/if}
  </svg>
</div>
