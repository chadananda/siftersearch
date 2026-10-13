<script>
  // A compact, sideways-scrolling band of book spines at the foot of a SourceHunt box (Chad 10-13): every place the words
  // can be read, best first (the Writings / tablets, then citations). Colour = publisher; a gold cap = the Writings.
  // Short on purpose: both boxes must fit on one screen. Styles: ./source-band.css, imported by SourceHunt.svelte.
  let { label = '', items = [], onCopy = null, copied = false, pending = false, selected = 0, onSelect = null } = $props();   // pending: frame kept, spines wait their beat
  const SITE = {
    'oceanlibrary.com': { label: 'OceanLibrary', cls: 'site-ol' }, 'oceanoflights.org': { label: 'Ocean of Lights', cls: 'site-oo' },
    phelps: { label: 'Phelps Inventory', cls: 'site-ph' }, 'bahai-library.com': { label: 'Bahá’í Library Online', cls: 'site-bl' },
  };
  const site = (s) => SITE[s] || { label: 'SifterSearch library', cls: 'site-lib' };
  const legend = $derived([...new Map(items.map((c) => [site(c.site).cls, site(c.site)])).values()]);
</script>

{#if items.length}
  <div class="source-band mt-auto flex flex-col gap-1.5 border-t border-border-subtle pt-2.5">   <!-- mt-auto: pinned to the box foot so both bands line up (Chad 10-13) -->
    <!-- one fixed-height line, so the spines of both boxes start at the same height -->
    <div class="flex h-6 items-center justify-between gap-3 overflow-hidden whitespace-nowrap">
      <span class="truncate text-xs text-secondary">{label}</span>
      <span class="flex shrink-0 items-center gap-2.5 text-[11px] text-muted">
        {#each legend as l (l.cls)}<span class="flex items-center gap-1"><i class="dot {l.cls}"></i>{l.label}</span>{/each}
        {#if onCopy && !pending}<button class="linkchip" onclick={onCopy}>{copied ? 'Copied' : 'Copy all'}</button>{/if}
      </span>
    </div>
    <div class="band" role="list">
      {#if !pending}{#each items as c, i (c.key)}
        <!-- a click SHOWS the item in its box (Chad 10-13: view each in place, open from the box's corner link);
             ⌘/ctrl/middle-click still opens it in a new tab -->
        <a href={c.url} target="_blank" rel="noopener" role="listitem" class="spine {site(c.site).cls}" class:writ={c.top} class:sel={i === selected}
          aria-current={i === selected ? 'true' : undefined}
          onclick={(e) => { if (!onSelect || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onSelect(i); }}
          style="--d: {120 + Math.min(i, 40) * 60}ms"
          title="{c.title}{c.sub ? ` — ${c.sub}` : ''} · {site(c.site).label}{c.grade ? ` · ${c.grade}` : ''}">
          <span class="spine-title">{c.title}</span>
        </a>
      {/each}{/if}
    </div>
  </div>
{/if}
