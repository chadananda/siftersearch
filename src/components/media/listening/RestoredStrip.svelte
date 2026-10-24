<script>
  // The restoration readout on /media (Chad 10-24): talks published of those planned, talks restored, held for review, and the five latest.
  // Cached SSR first view, then liveRefresh (src/lib/live-data.js) every 30 s while on screen. The block's height is reserved, so a patch never shifts the page.
  import { onMount } from 'svelte';
  import { liveRefresh } from '../../../lib/live-data.js';
  import { media } from '../../../lib/api.js';

  let { initial = null } = $props();
  let d = $state(initial);
  let root;
  const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US'));
  const recent = $derived(Array.isArray(d?.recent) ? d.recent.filter((x) => x?.slug) : []);
  onMount(() => liveRefresh(() => media.restored(), (next) => { d = next; }, { every: 30_000, el: root, initial }));
</script>

<section class="restored mx-auto max-w-6xl rounded-2xl border border-radio-line bg-radio-paper px-5 py-4" bind:this={root} aria-label="Restoration progress">
  <div class="stats">
    <div><b>{n(d?.published)}</b><span>published of {n(d?.planned)} planned</span></div>
    <div><b>{n(d?.restored)}</b><span>restored</span></div>
    <div><b>{n(d?.held)}</b><span>held for review</span></div>
  </div>
  <div class="strip">
    <span class="lbl">Just restored</span>
    {#each recent as x (x.slug)}
      <a href={`/media/${x.slug}`} class="chip" title={x.speaker || ''}>{x.title}</a>
    {:else}
      <span class="chip empty">The next talks appear here as they are published</span>
    {/each}
  </div>
</section>

<style>
  .restored { min-height: 8.5rem; }
  .stats { display: flex; flex-wrap: wrap; gap: 0.75rem 2rem; }
  .stats div { display: flex; flex-direction: column; min-width: 7rem; }
  .stats b { font-size: 1.6rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stats span { font-size: 0.8rem; opacity: 0.75; }
  .strip { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.9rem; min-height: 4.2rem; align-content: flex-start; }
  .lbl { font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; margin-right: 0.25rem; }
  .chip { display: inline-block; max-width: 18rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0.25rem 0.7rem; border: 1px solid currentColor; border-radius: 999px; font-size: 0.85rem; text-decoration: none; opacity: 0.9; }
  .chip.empty { opacity: 0.5; border-style: dashed; }
  a.chip:hover { opacity: 1; }
</style>
