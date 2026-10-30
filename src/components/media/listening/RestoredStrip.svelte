<script>
  // The restoration readout on /media (Chad 10-24): talks published of those planned, talks restored, held for review, and the five latest;
  // beside them a small card per machine doing the work (Chad 10-29): role, GPU, RAM, speed (× real time over 3 h, bar vs the fastest).
  // Cached SSR first view, then liveRefresh (src/lib/live-data.js) every 30 s while on screen. The block's height is reserved, so a patch never shifts the page.
  import { onMount } from 'svelte';
  import { liveRefresh } from '../../../lib/live-data.js';
  import { media } from '../../../lib/api.js';

  let { initial = null } = $props();
  let d = $state(initial);
  let root;
  const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US'));
  const workers = $derived(Array.isArray(d?.workers) ? d.workers : []);
  const fastest = $derived(Math.max(1, ...workers.map((w) => w.speed || 0)));
  const LAMP = { working: 'on', conducting: 'on', starting: 'blink', idle: 'dim', resting: 'off' };
  const recent = $derived(Array.isArray(d?.recent) ? d.recent.filter((x) => x?.slug) : []);
  onMount(() => liveRefresh(() => media.restored(), (next) => { d = next; }, { every: 30_000, el: root, initial }));
</script>

<section class="restored mx-auto max-w-6xl rounded-2xl border border-radio-line bg-radio-paper px-5 py-4" bind:this={root} aria-label="Restoration progress">
  <div class="stats">
    <div><b>{n(d?.published)}</b><span>completed of {n(d?.planned)} planned</span></div>
    <div><b>{n(d?.held)}</b><span>held for review</span></div>
    {#if workers.length}
      <ul class="machines" aria-label="Machines at work">
        {#each workers as w (w.key)}
          <li class="card" title={`${w.name}: ${w.status}${w.jobs ? `, ${w.jobs} at work` : ''}`}>
            <div class="head"><i class={`lamp ${LAMP[w.status] || 'dim'}`}></i><b>{w.name}</b><em>{w.jobs ? `${w.jobs} at work` : w.status}</em></div>
            <div class="role">{w.role}</div>
            <div class="spec"><span>GPU</span>{w.gpu}</div>
            <div class="spec"><span>RAM</span>{w.ram}</div>
            {#if w.key !== 'tower'}
              <div class="speed"><div class="bar"><i style={`width:${Math.round(((w.speed || 0) / fastest) * 100)}%`}></i></div><span>{w.speed ? `${w.speed}× real time` : 'no work in 3 h'}</span></div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
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
  .restored { min-height: 11rem; }
  .machines { display: flex; flex-wrap: wrap; gap: 0.5rem; list-style: none; margin: 0; padding: 0; }
  .card { width: 10.5rem; padding: 0.45rem 0.6rem; border: 1px solid var(--radio-line); border-radius: 0.6rem; background: var(--radio-panel); font-size: 0.72rem; line-height: 1.3; color: var(--radio-ink-soft); }
  .card .head { display: flex; align-items: center; gap: 0.35rem; }
  .card .head b { font-size: 0.82rem; color: var(--radio-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .head em { margin-left: auto; font-style: normal; font-size: 0.65rem; opacity: 0.8; white-space: nowrap; }
  .card .role { color: var(--radio-brass); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.15rem; }
  .card .spec { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .spec span { display: inline-block; width: 2.1rem; font-size: 0.6rem; letter-spacing: 0.1em; opacity: 0.7; }
  .card .speed { margin-top: 0.3rem; }
  .card .speed span { font-variant-numeric: tabular-nums; font-size: 0.68rem; }
  .bar { height: 0.3rem; border-radius: 999px; background: var(--radio-brass-soft); overflow: hidden; margin-bottom: 0.15rem; }
  .bar i { display: block; height: 100%; background: var(--radio-amber); border-radius: 999px; transition: width 0.6s ease; }
  .lamp { width: 0.5rem; height: 0.5rem; border-radius: 50%; flex: none; background: var(--radio-ink-soft); opacity: 0.35; }
  .lamp.on { background: var(--radio-amber); opacity: 1; box-shadow: 0 0 0.4rem var(--radio-glow); }
  .lamp.dim { background: var(--radio-brass); opacity: 0.6; }
  .lamp.blink { background: var(--radio-amber); animation: blink 1.2s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.2; } }
  @media (prefers-reduced-motion: reduce) { .lamp.blink { animation: none; } .bar i { transition: none; } }
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
