<script>
  // The publications that cite the quote, as a shelf of book spines — colour by where the copy lives, height by how many
  // of its passages hold the quote. Spines rise in one after another; on narrow screens the shelf scrolls sideways.
  let { items = [], linkCount = 0 } = $props();
  const SITE = {
    'oceanlibrary.com': { label: 'OceanLibrary', cls: 'site-ol' },
    'bahai-library.com': { label: 'Bahá’í Library Online', cls: 'site-bl' },
    'oceanoflights.org': { label: 'Ocean of Lights', cls: 'site-oo' },
  };
  const site = (s) => SITE[s] || { label: 'SifterSearch library', cls: 'site-lib' };
  const legend = $derived([...new Map(items.map((c) => [site(c.site).cls, site(c.site)])).values()]);
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="sh-label">Cited across {items.length} publication{items.length === 1 ? '' : 's'}</h2>
    <div class="flex flex-wrap gap-3 text-xs text-muted">
      {#each legend as l (l.cls)}<span class="flex items-center gap-1.5"><i class="dot {l.cls}"></i>{l.label}</span>{/each}
      {#if linkCount}<span>· {linkCount} passages linked as quoting it</span>{/if}
    </div>
  </div>
  {#if items.length}
    <div class="shelf" role="list">
      {#each items as c, i (c.documentId)}
        <a href={c.rangeUrl || c.url} target="_blank" rel="noopener" role="listitem" class="spine {site(c.site).cls}"
          style="--h: {118 + Math.min(c.paragraphs, 8) * 10}px; --d: {Math.min(i, 40) * 35}ms"
          title="{c.title}{c.author ? ` — ${c.author}` : ''} · {site(c.site).label}{c.paragraphs > 1 ? ` · ${c.paragraphs} passages` : ''}">
          <span class="spine-title">{c.title}</span>
          {#if c.paragraphs > 1}<span class="spine-count">{c.paragraphs}</span>{/if}
        </a>
      {/each}
    </div>
  {:else}
    <p class="text-secondary">No other publication in the library quotes these words.</p>
  {/if}
</div>

<style>
  .shelf {
    display: flex; align-items: flex-end; gap: 6px; padding: 12px 4px 0; overflow-x: auto; scroll-snap-type: x proximity;
    border-bottom: 6px solid color-mix(in srgb, var(--text-muted) 35%, transparent); min-height: 210px;
  }
  .spine {
    --c: var(--accent-primary);
    position: relative; flex: 0 0 auto; width: 34px; height: var(--h); border-radius: 4px 4px 1px 1px; scroll-snap-align: start;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 82%, black) 0 3px, color-mix(in srgb, var(--c) 72%, var(--surface-1)) 3px 100%);
    box-shadow: inset -3px 0 0 color-mix(in srgb, black 18%, transparent), 0 2px 6px color-mix(in srgb, black 18%, transparent);
    display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 8px 0 6px;
    animation: rise 520ms cubic-bezier(.2,.9,.25,1.15) both; animation-delay: var(--d);
    transition: transform 180ms, filter 180ms;
  }
  .spine:hover, .spine:focus-visible { transform: translateY(-10px); filter: brightness(1.12); outline: none; }
  .spine-title {
    writing-mode: vertical-rl; transform: rotate(180deg); font-family: 'Libre Caslon Text', Georgia, serif; font-size: 11px;
    color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-height: calc(var(--h) - 34px);
    text-shadow: 0 1px 2px color-mix(in srgb, black 40%, transparent);
  }
  .spine-count { font-size: 10px; font-weight: 700; color: white; opacity: .9; }
  .site-ol { --c: var(--accent-primary); }
  .site-bl { --c: var(--accent-tertiary); }
  .site-oo { --c: var(--accent-secondary); }
  .site-lib { --c: var(--warning); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; background: var(--c); }
  @keyframes rise { from { transform: translateY(40px) scaleY(.6); opacity: 0; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .spine { animation: none; } }
</style>
