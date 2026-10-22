<script>
  // The call-sign ticker: a slow news crawl of what is new and what was heard ("Just added…", "New voice…", short quotes).
  // Pauses on hover/focus and offscreen; reduced motion → a still, scrollable line.
  import { onMount } from 'svelte';
  let { lines = [] } = $props();
  let root, offscreen = $state(false);
  onMount(() => {
    const io = new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; });
    io.observe(root);
    return () => io.disconnect();
  });
</script>

{#if lines.length}
  <div bind:this={root} class="ticker -mx-4 sm:-mx-6 lg:-mx-8" class:lr-paused={offscreen} role="region" aria-label="What's new on the air">
    <span class="callsign font-dial" aria-hidden="true">WSFT</span>
    <div class="crawl">
      <ul class="row" style={`--dur:${Math.max(50, lines.length * 9)}s`}>
        {#each [0, 1] as copy (copy)}
          {#each lines as l, i (`${copy}-${i}`)}
            <li aria-hidden={copy ? 'true' : undefined}>
              <span class="tag font-dial">{l.tag}</span>
              <a href={l.href} tabindex={copy ? -1 : undefined}>{l.text}</a>
              <span class="sep" aria-hidden="true">◆</span>
            </li>
          {/each}
        {/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .ticker { display: flex; align-items: stretch; background: var(--radio-walnut-deep); color: var(--radio-on-dark); border-block: 2px solid var(--radio-brass); overflow: hidden; }
  .callsign { flex: none; display: grid; place-items: center; padding: 0 1rem; background: var(--radio-needle); color: var(--radio-on-dark); font-weight: 800; letter-spacing: 0.18em; font-size: 1rem; z-index: 1; }
  .crawl { overflow: hidden; flex: 1; mask-image: linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent); }
  .row { display: flex; width: max-content; animation: crawl var(--dur) linear infinite; }
  .ticker:hover .row, .ticker:focus-within .row, .lr-paused .row { animation-play-state: paused; }
  @keyframes crawl { to { transform: translateX(-50%); } }
  li { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0 0.7rem 1.1rem; white-space: nowrap; font-size: 0.95rem; }
  .tag { font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.85rem; color: var(--radio-amber); }
  a { color: var(--radio-on-dark); }
  a:hover { color: var(--radio-amber); text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--radio-amber); outline-offset: 2px; }
  .sep { color: var(--radio-brass); font-size: 0.6rem; margin-left: 0.5rem; }
  @media (prefers-reduced-motion: reduce) { .row { animation: none; } .crawl { overflow-x: auto; mask-image: none; } li[aria-hidden='true'] { display: none; } }
</style>
