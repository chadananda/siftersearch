<script>
  // ʿAyn (ع) — in Arabic both "eye" and "wellspring / source": the SourceHunt mark. A lens holding the letter, with Latin
  // letters orbiting it; while `hunting`, the orbit speeds up and draws in (English being traced to its Arabic/Persian source).
  let { size = 96, hunting = false } = $props();
  const LETTERS = ['S', 'o', 'u', 'r', 'c', 'e', 'H', 'u', 'n', 't'];
</script>

<div class="ayn" class:hunting style="--s: {size}px" aria-hidden="true">
  <svg viewBox="0 0 120 120" width={size} height={size}>
    <defs>
      <linearGradient id="ayn-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="stop-a" />
        <stop offset="0.55" class="stop-b" />
        <stop offset="1" class="stop-c" />
      </linearGradient>
      <radialGradient id="ayn-glass" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" class="glass-a" />
        <stop offset="1" class="glass-b" />
      </radialGradient>
    </defs>
    <!-- handle -->
    <line x1="80" y1="80" x2="108" y2="108" stroke="url(#ayn-ring)" stroke-width="9" stroke-linecap="round" />
    <!-- glass + ring -->
    <circle cx="52" cy="52" r="38" fill="url(#ayn-glass)" />
    <circle cx="52" cy="52" r="38" fill="none" stroke="url(#ayn-ring)" stroke-width="6" />
    <circle class="ring-pulse" cx="52" cy="52" r="38" fill="none" stroke="url(#ayn-ring)" stroke-width="2" />
    <!-- the letter: ʿayn -->
    <text x="52" y="66" text-anchor="middle" class="glyph">ع</text>
    <!-- glint -->
    <path d="M30 34 A26 26 0 0 1 46 22" fill="none" class="glint" stroke-width="3" stroke-linecap="round" />
  </svg>
  <div class="orbit">
    {#each LETTERS as l, i}
      <span style="--i: {i}; --n: {LETTERS.length}">{l}</span>
    {/each}
  </div>
</div>

<style>
  .ayn { position: relative; width: calc(var(--s) * 1.5); height: calc(var(--s) * 1.5); display: grid; place-items: center; flex-shrink: 0; }
  .ayn svg { position: relative; z-index: 1; filter: drop-shadow(0 6px 18px color-mix(in srgb, var(--accent-primary) 35%, transparent)); }
  .stop-a { stop-color: var(--accent-primary); }
  .stop-b { stop-color: var(--accent-secondary); }
  .stop-c { stop-color: var(--accent-tertiary); }
  .glass-a { stop-color: color-mix(in srgb, var(--accent-primary) 18%, transparent); }
  .glass-b { stop-color: color-mix(in srgb, var(--accent-tertiary) 6%, transparent); }
  .glint { stroke: color-mix(in srgb, white 70%, transparent); }
  .glyph { font-family: 'Amiri', 'Noto Naskh Arabic', serif; font-size: 52px; fill: var(--text-primary); }
  .ring-pulse { opacity: 0; transform-origin: 52px 52px; }
  .hunting .ring-pulse { animation: ring 1.6s ease-out infinite; }

  .orbit { position: absolute; inset: 0; animation: spin 26s linear infinite; }
  .orbit span {
    position: absolute; left: 50%; top: 50%; font-family: 'Libre Caslon Text', Georgia, serif; font-size: calc(var(--s) * 0.13);
    color: var(--text-muted); opacity: 0.75;
    transform: rotate(calc(360deg / var(--n) * var(--i))) translateY(calc(var(--s) * -0.7)) rotate(calc(-360deg / var(--n) * var(--i)));
    transition: transform 900ms cubic-bezier(.2,.8,.2,1), opacity 600ms, color 600ms;
  }
  .hunting .orbit { animation-duration: 3.2s; }
  .hunting .orbit span {
    color: var(--accent-primary); opacity: 1;
    transform: rotate(calc(360deg / var(--n) * var(--i))) translateY(calc(var(--s) * -0.52)) rotate(calc(-360deg / var(--n) * var(--i)));
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes ring { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.45); } }
  @media (prefers-reduced-motion: reduce) { .orbit, .hunting .orbit, .hunting .ring-pulse { animation: none; } }
</style>
