<script>
  // The publications that cite the quote, as a shelf of book spines — colour by where the copy lives, height by how many
  // of its passages hold the quote. Spines rise in one after another once the panel is up (70 ms apart — the results stream
  // in a beat at a time, 10-12); on narrow screens the shelf scrolls sideways. Styles: ./citation-shelf.css, imported by
  // SourceHunt.svelte — this component never renders on the server, so its own <style> never reached the page (10-12).
  let { items = [], linkCount = 0 } = $props();
  const SITE = {
    'oceanlibrary.com': { label: 'OceanLibrary', cls: 'site-ol' },
    'bahai-library.com': { label: 'Bahá’í Library Online', cls: 'site-bl' },
    'oceanoflights.org': { label: 'Ocean of Lights', cls: 'site-oo' },
  };
  const site = (s) => SITE[s] || { label: 'SifterSearch library', cls: 'site-lib' };
  const legend = $derived([...new Map(items.map((c) => [site(c.site).cls, site(c.site)])).values()]);
</script>

<div class="citation-shelf flex flex-col gap-3">
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
          style="--h: {118 + Math.min(c.paragraphs, 8) * 10}px; --d: {280 + Math.min(i, 40) * 70}ms"
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

