<script>
  // A rolling figure: each digit a wheel that turns to its new value (transform only); other characters stand still.
  // SSR renders the value at rest, so the first paint is complete. Reduced motion: no roll (library-stacks.css).
  let { text = '', label = '' } = $props();
  const chars = $derived(String(text).split(''));
</script>

<span class="roll" role="img" aria-label={label || text}>
  {#each chars as c, i (chars.length - i)}
    {#if /\d/.test(c)}
      <span class="wheel" aria-hidden="true"><span class="strip" style={`transform:translateY(${-Number(c) * 10}%)`}>{#each Array(10) as _, d}<span>{d}</span>{/each}</span></span>
    {:else}<span class="sep" aria-hidden="true">{c}</span>{/if}
  {/each}
</span>

<style>
  .roll { display: inline-flex; align-items: flex-end; font-variant-numeric: tabular-nums; line-height: 1; }
  .wheel { display: inline-block; height: 1em; overflow: hidden; }
  .strip { display: flex; flex-direction: column; transition: transform 1.1s cubic-bezier(0.3, 1.25, 0.5, 1); }
  .strip span { height: 1em; display: block; text-align: center; }
  .sep { display: inline-block; height: 1em; }
  @media (prefers-reduced-motion: reduce) { .strip { transition: none; } }
</style>
