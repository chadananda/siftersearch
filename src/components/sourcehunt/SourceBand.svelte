<script>
  // A compact, sideways-scrolling band of book spines at the foot of a SourceHunt box (Chad 10-13): every place the words
  // can be read, best first (the Writings / tablets, then citations). Colour = publisher; a gold cap = the Writings.
  // Short on purpose: both boxes must fit on one screen. Styles: ./source-band.css, imported by SourceHunt.svelte.
  let { label = '', items = [], onCopy = null, copied = false } = $props();
  const SITE = {
    'oceanlibrary.com': { label: 'OceanLibrary', cls: 'site-ol' }, 'oceanoflights.org': { label: 'Ocean of Lights', cls: 'site-oo' },
    phelps: { label: 'Phelps Inventory', cls: 'site-ph' }, 'bahai-library.com': { label: 'Bahá’í Library Online', cls: 'site-bl' },
  };
  const site = (s) => SITE[s] || { label: 'SifterSearch library', cls: 'site-lib' };
  const legend = $derived([...new Map(items.map((c) => [site(c.site).cls, site(c.site)])).values()]);
</script>

{#if items.length}
  <div class="source-band flex flex-col gap-1.5 border-t border-border-subtle pt-2.5 mt-1">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span class="text-xs text-secondary">{label}</span>
      <span class="flex flex-wrap items-center gap-2.5 text-[11px] text-muted">
        {#each legend as l (l.cls)}<span class="flex items-center gap-1"><i class="dot {l.cls}"></i>{l.label}</span>{/each}
        {#if onCopy}<button class="linkchip" onclick={onCopy}>{copied ? 'Copied' : 'Copy all'}</button>{/if}
      </span>
    </div>
    <div class="band" role="list">
      {#each items as c, i (c.key)}
        <a href={c.url} target="_blank" rel="noopener" role="listitem" class="spine {site(c.site).cls}" class:writ={c.top}
          style="--d: {120 + Math.min(i, 40) * 60}ms"
          title="{c.title}{c.sub ? ` — ${c.sub}` : ''} · {site(c.site).label}{c.grade ? ` · ${c.grade}` : ''}">
          <span class="spine-title">{c.title}</span>
        </a>
      {/each}
    </div>
  </div>
{/if}
