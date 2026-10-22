<script>
  // A talk's own waveform (48 peaks from the listing index) as mirrored bars, era-tinted. `breathing` lets each bar swell
  // gently (transform only, staggered); `progress` (0..1) inks the bars already played. A flat-ish line when no peaks.
  import { waveHeights, eraVar } from '../../../lib/media-listing.js';

  let { w = '', year = null, breathing = false, progress = -1, bars = 48, class: cls = '', tint = null } = $props();
  const hs = $derived.by(() => {
    const h = waveHeights(w);
    if (!h.length) return Array.from({ length: bars }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 1.7)));
    if (h.length === bars) return h;
    return Array.from({ length: bars }, (_, i) => h[Math.floor((i / bars) * h.length)]);
  });
  const color = $derived(tint || eraVar(year));
</script>

<svg viewBox={`0 0 ${bars * 4} 40`} preserveAspectRatio="none" class={`wave ${cls}`} class:breathing aria-hidden="true">
  {#each hs as h, i (i)}
    <rect x={i * 4 + 0.6} y={20 - h * 19} width="2.6" height={Math.max(1.2, h * 38)} rx="1.2"
      fill={color} opacity={progress >= 0 ? (i / bars <= progress ? 1 : 0.35) : 0.9} style={`--i:${i % 12}`} />
  {/each}
</svg>

<style>
  .wave { display: block; width: 100%; overflow: visible; }
  .wave rect { transform-box: fill-box; transform-origin: center; }
  .breathing rect { animation: breathe 2.6s ease-in-out infinite; animation-delay: calc(var(--i) * -0.21s); }
  @keyframes breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.62); } }
  @media (prefers-reduced-motion: reduce) { .breathing rect { animation: none; } }
  :global(.lr-paused) .breathing rect { animation-play-state: paused; }
</style>
