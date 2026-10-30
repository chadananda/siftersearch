<script>
  // The restoration readout on /media (Chad 10-24): talks published of those planned, held for review, and the latest 30 as box-set spines in a scrolling list (Chad 10-29);
  // beside them a small card per machine doing the work (Chad 10-29): role, GPU, RAM, speed (× real time over 3 h, bar vs the fastest).
  // Cached SSR first view, then liveRefresh (src/lib/live-data.js) every 30 s while on screen. The block's height is reserved, so a patch never shifts the page.
  import { onMount } from 'svelte';
  import { liveRefresh } from '../../../lib/live-data.js';
  import { media } from '../../../lib/api.js';
  import { eraVar, duration } from '../../../lib/media-listing.js';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { preview, playExcerpt } from '../../../lib/media-preview.svelte.js';

  let { initial = null } = $props();
  let d = $state(initial);
  let root;
  const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US'));
  const workers = $derived(Array.isArray(d?.workers) ? d.workers : []);
  const fastest = $derived(Math.max(1, ...workers.map((w) => w.speed || 0)));
  const LAMP = { working: 'on', conducting: 'on', starting: 'blink', idle: 'dim', resting: 'off' };
  const playing = (slug) => preview.item?.s === slug && preview.playing;
  const recent = $derived(Array.isArray(d?.recent) ? d.recent.filter((x) => x?.slug) : []);
  onMount(() => liveRefresh(() => media.restored(), (next) => { d = next; }, { every: 30_000, el: root, initial }));
</script>

<section class="restored mx-auto max-w-6xl rounded-2xl border border-radio-line bg-radio-paper px-5 py-4" bind:this={root} aria-label="Restoration progress">
  <div class="left">
    <p class="stats"><b>{n(d?.published)}</b> completed of {n(d?.planned)} planned <span class="sep">·</span> <b>{n(d?.held)}</b> held for review</p>
    <div class="spines">
      <ol aria-label="Just restored">
        {#each recent as x (x.slug)}
          {@const it = { s: x.slug, t: x.title, y: x.year, sp: x.speaker }}
          <li class="spine-row" in:fly={{ y: -24, duration: 420 }} animate:flip={{ duration: 420 }}>
            <a href={`/media/${x.slug}`} class="spine" style={`--st:${eraVar(x.year)}`} title={`Open “${x.title}”${x.speaker ? ` · ${x.speaker}` : ''}`}>
              <span class="truncate">{x.title}</span><span class="spine-meta">{x.year || ''}{x.year && x.d ? ' · ' : ''}{x.d ? duration(x.d) : ''}</span>
              <svg class="spine-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
            </a><button type="button" class="spine-play" class:on={playing(x.slug)} onclick={(e) => { e.stopPropagation(); playExcerpt(it); }}
              aria-label={playing(x.slug) ? `Pause the excerpt of ${x.title}` : `Play 20 seconds of ${x.title} here`} title={playing(x.slug) ? 'Pause' : 'Play 20 s here'}>
              {#if playing(x.slug)}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              {:else}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>{/if}
            </button>
          </li>
        {:else}
          <li class="empty">The next talks appear here as they are published</li>
        {/each}
      </ol>
    </div>
  </div>
  {#if workers.length}
    <ul class="machines" aria-label="Machines at work">
      {#each workers as w (w.key)}
        <li class="card" title={`${w.name}: ${w.status}${w.jobs ? `, ${w.jobs} at work` : ''}`}>
          <div class="head"><i class={`lamp ${LAMP[w.status] || 'dim'}`}></i><b>{w.name}</b><em>{w.jobs ? `${w.jobs} at work` : w.status}</em></div>
          <div class="role">{w.role}</div>
          {#each w.specs || [['GPU', w.gpu], ['RAM', w.ram]] as [k, v] (k)}<div class="spec"><span>{k}</span>{v}</div>{/each}
          <div class="speed">
            {#if w.key !== 'tower'}<div class="bar"><i style={`width:${Math.round(((w.speed || 0) / fastest) * 100)}%`}></i></div><span>{w.speed ? `${w.speed}× real time` : w.jobs ? 'first talks under way' : 'no work in 3 h'}</span>{:else}<span>{w.jobs} talks in hand</span>{/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .restored { min-height: 8.5rem; display: flex; gap: 1rem 1.25rem; align-items: stretch; }
  .left { flex: 1 1 16rem; min-width: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  .stats { margin: 0; font-size: 0.8rem; color: var(--radio-ink-soft); }
  .stats b { font-size: 1.15rem; color: var(--radio-ink); font-variant-numeric: tabular-nums; }
  .stats .sep { margin: 0 0.35rem; opacity: 0.5; }
  /* the list never sets the box height: the cards do; it scrolls inside what they leave */
  .spines { position: relative; flex: 1; min-height: 6.5rem; }
  .spines ol { position: absolute; inset: 0; margin: 0; padding: 0 0.2rem 0 0; list-style: none; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: thin; scrollbar-color: var(--radio-brass) transparent; }
  /* the box-set spine rows (Jukebox.svelte), newest on top: a new talk slides in and pushes the rest down */
  .spine-row { display: flex; gap: 3px; flex: none; }
  .spine { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.6rem; padding: 0.42rem 0.5rem 0.42rem 0.7rem; border-radius: 0.3rem; font-size: 0.9rem; color: var(--radio-on-dark); text-decoration: none;
    background: linear-gradient(90deg, var(--st) 0 6px, color-mix(in srgb, var(--radio-walnut-deep) 82%, transparent) 6px); box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.3); transition: background 0.2s, color 0.2s; }
  .spine:hover, .spine:focus-visible { background: linear-gradient(90deg, var(--st) 0 6px, var(--radio-walnut-deep) 6px); color: var(--radio-amber); }
  .spine .truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spine-meta { margin-left: auto; flex: none; font: 600 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em; opacity: 0.75; }
  .spine-go { flex: none; width: 0.95rem; height: 0.95rem; margin-left: -0.25rem; opacity: 0.45; transition: opacity 0.2s, transform 0.2s; }
  .spine:hover .spine-go, .spine:focus-visible .spine-go { opacity: 1; transform: translateX(2px); }
  .spine-play { flex: none; display: grid; place-items: center; width: 2.1rem; border-radius: 0.3rem; color: var(--radio-amber);
    background: color-mix(in srgb, var(--radio-walnut-deep) 82%, transparent); box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.3); transition: background 0.2s, color 0.2s; }
  .spine-play svg { width: 0.95rem; height: 0.95rem; }
  .spine-play:hover, .spine-play.on { background: var(--radio-amber); color: var(--radio-walnut-deep); }
  .empty { font-size: 0.8rem; opacity: 0.6; padding: 0.3rem 0; }
  @media (max-width: 52rem) { .spines { min-height: 9rem; } }
  .machines { flex: 0 1 auto; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: stretch; gap: 0.5rem; list-style: none; margin: 0; padding: 0; }
  .card { display: flex; flex-direction: column; }
  .card .speed { margin-top: auto; padding-top: 0.3rem; }
  @media (max-width: 52rem) { .restored { flex-direction: column; } .machines { justify-content: flex-start; } }
  .card { width: 9.75rem; padding: 0.45rem 0.6rem; border: 1px solid var(--radio-line); border-radius: 0.6rem; background: var(--radio-panel); font-size: 0.72rem; line-height: 1.3; color: var(--radio-ink-soft); }
  .card .head { display: flex; align-items: center; gap: 0.35rem; }
  .card .head b { font-size: 0.82rem; color: var(--radio-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .head em { margin-left: auto; font-style: normal; font-size: 0.65rem; opacity: 0.8; white-space: nowrap; }
  .card .role { color: var(--radio-brass); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.15rem; }
  .card .spec { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .spec span { display: inline-block; width: 2.6rem; font-size: 0.6rem; letter-spacing: 0.1em; opacity: 0.7; }
  .card .speed span { font-variant-numeric: tabular-nums; font-size: 0.68rem; }
  .bar { height: 0.3rem; border-radius: 999px; background: var(--radio-brass-soft); overflow: hidden; margin-bottom: 0.15rem; }
  .bar i { display: block; height: 100%; background: var(--radio-amber); border-radius: 999px; transition: width 0.6s ease; }
  .lamp { width: 0.5rem; height: 0.5rem; border-radius: 50%; flex: none; background: var(--radio-ink-soft); opacity: 0.35; }
  .lamp.on { background: var(--radio-amber); opacity: 1; box-shadow: 0 0 0.4rem var(--radio-glow); }
  .lamp.dim { background: var(--radio-brass); opacity: 0.6; }
  .lamp.blink { background: var(--radio-amber); animation: blink 1.2s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.2; } }
  @media (prefers-reduced-motion: reduce) { .lamp.blink { animation: none; } .bar i { transition: none; } }
</style>
