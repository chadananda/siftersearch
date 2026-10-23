<script>
  // A rolling number: each digit a wheel that turns to its new value (transform only). SSR renders the value at rest;
  // a change rolls the wheels. Thousands separators stay fixed. Reduced motion: no roll.
  let { value = 0, label = '' } = $props();
  const chars = $derived(Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US').split(''));
</script>

<span class="odo" role="img" aria-label={`${Math.round(Number(value) || 0).toLocaleString('en-US')}${label ? ` ${label}` : ''}`}>
  {#each chars as c, i (chars.length - i)}
    {#if /\d/.test(c)}
      <span class="wheel" aria-hidden="true"><span class="strip" style={`transform:translateY(${-Number(c) * 10}%)`}>{#each Array(10) as _, d}<span>{d}</span>{/each}</span></span>
    {:else}<span class="sep" aria-hidden="true">{c}</span>{/if}
  {/each}
</span>

<style>
  .odo { display: inline-flex; align-items: flex-end; font-variant-numeric: tabular-nums; line-height: 1; }
  .wheel { display: inline-block; height: 1em; overflow: hidden; }
  .strip { display: flex; flex-direction: column; transition: transform 0.9s cubic-bezier(0.3, 1.25, 0.5, 1); will-change: transform; }
  .strip span { height: 1em; display: block; text-align: center; }
  .sep { display: inline-block; height: 1em; }
  @media (prefers-reduced-motion: reduce) { .strip { transition: none; } }
</style>
