<script>
  // THE SIGNAL CHAIN (Chad 10-22: "explain the unique process … show which talks are in which process"): the stages a
  // talk travels — Import → Remaster → Transcribe → Correct → Link quotes → Cross-reference → Moments — as a row of valve
  // tiles with a signal flowing through them. Each tile: what happens, its live count (GET /api/media/progress), and the
  // talks in it right now (GET /api/media/progress/live), which glide to the next tile as they move on. Tap a tile for
  // all its talks with their steps. Below: just published. Polls every 15 s while on screen; reduced motion: still.
  import { onMount } from 'svelte';
  import { crossfade, fly } from 'svelte/transition';
  import RecordLabel from './RecordLabel.svelte';
  import { media } from '../../../lib/api.js';
  import { TILES, byTile, fmt, stepTrack, elapsed, SOURCE_LABEL } from '../../../lib/media-progress.js';

  let { progress = null, live = null } = $props();
  let p = $state(progress), lv = $state(live);
  let open = $state(null), reduced = $state(false), now = $state(Date.now()), root;
  const tiles = $derived(byTile(lv?.in_progress));
  const published = $derived(Array.isArray(lv?.recently_published) ? lv.recently_published.filter((x) => x?.slug) : []);
  const [send, receive] = crossfade({ duration: (d) => (reduced ? 0 : Math.min(700, Math.sqrt(d) * 30)), fallback: (node) => ({ duration: reduced ? 0 : 300, css: (t) => `opacity:${t}` }) });
  const isOnAir = (w) => (w.stages || []).some((s) => s.name === 'publish' && s.state === 'done');
  const keyOf = (w) => w.slug || w.title;

  const ICON = {
    import: 'M4 6h16v3H4zM6 9v9h12V9M10 13h4',
    remaster: 'M3 12h3l2-5 3 10 3-14 2 9h5',
    transcribe: 'M5 5h14M5 9h10M5 13h14M5 17h8',
    correct: 'M4 17l4 1 10-10-5-5L3 13zM14 4l5 5',
    quotes: 'M6 7h4v4H7l-1 4M14 7h4v4h-3l-1 4',
    ideas: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z',
    moments: 'M12 3l2.5 5.5L20 9l-4.2 4 1 6L12 16l-4.8 3 1-6L4 9l5.5-.5z',
  };

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(root);
    const tick = setInterval(() => { if (visible) now = Date.now(); }, 1000);
    const poll = setInterval(async () => {
      if (!visible || document.hidden) return;
      try {
        const [a, b] = await Promise.all([fetch(media.href('/api/media/progress/live')), fetch(media.href('/api/media/progress'))]);
        if (a.ok) lv = await a.json();
        if (b.ok) p = await b.json();
      } catch { /* keep the last view */ }
    }, 15_000);
    return () => { clearInterval(tick); clearInterval(poll); io.disconnect(); };
  });
</script>

<section bind:this={root} class="chain-wrap" aria-labelledby="chain-h">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h2 id="chain-h" class="font-marquee text-2xl text-radio-ink sm:text-3xl">How we resurrect an old recording</h2>
  </div>
  <p class="mt-1 max-w-3xl text-radio-ink-soft">Not copies of recordings: every talk is restored, transcribed word by word, corrected with care and linked to the Writings it cites.</p>

  <ol class="chain">
    {#each TILES as t, i (t.id)}
      {@const here = tiles.get(t.id) || []}
      {@const c = p ? t.count(p) : null}
      <li class="tile" class:busy={here.length} style={`--i:${i}`}>
        <button type="button" class="tile-btn" aria-expanded={open === t.id} onclick={() => (open = open === t.id ? null : t.id)}
          aria-label={`${t.name}: ${here.length} talk${here.length === 1 ? '' : 's'} here now. Show them`}>
          <span class="valve" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={ICON[t.id]} /></svg></span>
          <span class="t-name">{t.name}</span>
          <span class="t-line">{t.line}</span>
          {#if c != null && c > 0}<span class="t-count">{t.unit(c, p)}</span>{/if}
        </button>
        <div class="chips" aria-hidden={here.length ? undefined : 'true'}>
          {#each here.slice(0, 3) as w (keyOf(w))}
            <span class="chip" title={`${w.title || 'A new talk'}${w.speaker ? ` — ${w.speaker}` : ''}`} in:receive={{ key: keyOf(w) }} out:send={{ key: keyOf(w) }}>
              <span class="h-6 w-6 flex-none overflow-hidden rounded-full"><RecordLabel name={w.speaker || w.title || ''} photo={typeof w.thumb === 'string' ? w.thumb : null} size={24} /></span>
              <span class="truncate">{w.title || 'A new talk'}</span>
            </span>
          {/each}
          {#if here.length > 3}<span class="more">+{here.length - 3}</span>{/if}
        </div>
      </li>
    {/each}
  </ol>

  {#if open}
    {@const t = TILES.find((x) => x.id === open)}
    {@const here = tiles.get(open) || []}
    <div class="drawer" role="region" aria-label={`${t.name}: the talks here now`} in:fly={{ y: reduced ? 0 : -8, duration: reduced ? 0 : 250 }}>
      <p class="font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-brass-bright">{t.name} · {here.length ? `${here.length} talk${here.length === 1 ? '' : 's'} here now` : 'nothing here this minute'}</p>
      <ul class="mt-2 grid gap-2 md:grid-cols-2">
        {#each here as w (keyOf(w))}
          {@const steps = stepTrack(w.stages)}
          <li class="row">
            <span class="h-9 w-9 flex-none overflow-hidden rounded-full"><RecordLabel name={w.speaker || w.title || ''} photo={typeof w.thumb === 'string' ? w.thumb : null} size={36} /></span>
            <div class="min-w-0 flex-1">
              {#if w.slug && isOnAir(w)}<a href={`/media/${w.slug}`} class="r-title">{w.title || w.slug}</a>{:else}<p class="r-title">{w.title || 'A new talk'}</p>{/if}
              <p class="text-xs opacity-80">{w.speaker || 'Speaker not yet known'}{w.source ? ` · ${SOURCE_LABEL[w.source] || w.source}` : ''}{w.started_at ? ` · ${elapsed(w.started_at, now)}` : ''}</p>
              <ol class="track" aria-label="Steps">{#each steps as s (s.name)}<li class={`st ${s.state}`} title={`${s.label}: ${s.state}`}></li>{/each}</ol>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}


  {#if published.length}
    <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span class="font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">Just on the air</span>
      {#each published.slice(0, 5) as x (x.slug)}
        <a href={`/media/${x.slug}`} class="pubchip" in:fly={{ x: reduced ? 0 : -14, duration: reduced ? 0 : 450 }}>
          <span class="h-6 w-6 flex-none overflow-hidden rounded-full"><RecordLabel name={x.speaker || x.title || ''} photo={typeof x.thumb === 'string' ? x.thumb : null} size={24} /></span>
          <span class="truncate">{x.title || x.slug}</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .chain { position: relative; display: grid; gap: 0.7rem; margin-top: 1rem; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  /* the signal: a lit line through the valves, a pulse travelling left to right */
  .chain::before { content: ''; position: absolute; left: 3%; right: 3%; top: 2.05rem; height: 2px; background: linear-gradient(90deg, var(--radio-brass-soft), var(--radio-amber), var(--radio-brass-soft)); }
  /* the pulse: an element as wide as the line with the dot at its left edge, translated by its own width */
  .chain::after { content: ''; position: absolute; top: calc(2.05rem - 5px); left: 3%; width: 94%; height: 12px; pointer-events: none;
    background: radial-gradient(circle at 6px 6px, var(--radio-amber) 3.5px, var(--radio-glow) 5px, transparent 7px) no-repeat; animation: signal 5.5s linear infinite; }
  @keyframes signal { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { transform: translateX(100%); opacity: 0; } }
  @media (max-width: 1023px) {
    .chain { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(12.5rem, 1fr); overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 0.4rem; }
    .tile { scroll-snap-align: start; }
    .chain::after { display: none; }
  }
  .tile { position: relative; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .tile-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; text-align: left; padding: 0.7rem 0.75rem 0.8rem; border-radius: 1rem; background: var(--radio-paper);
    box-shadow: inset 0 0 0 1px var(--radio-line); transition: box-shadow 0.25s, transform 0.25s; min-height: 11.5rem; }
  .tile-btn:hover, .tile-btn[aria-expanded='true'] { box-shadow: inset 0 0 0 2px var(--radio-amber), 0 8px 20px var(--radio-brass-soft); transform: translateY(-2px); }
  .tile-btn:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .valve { position: relative; z-index: 1; display: grid; place-items: center; width: 2.6rem; height: 2.6rem; border-radius: 9999px; color: var(--radio-walnut-deep);
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--radio-amber) 55%, white), var(--radio-amber)); box-shadow: 0 0 0 3px var(--radio-paper), 0 0 0 4px var(--radio-brass); }
  .tile.busy .valve { box-shadow: 0 0 0 3px var(--radio-paper), 0 0 0 4px var(--radio-brass), 0 0 18px 4px var(--radio-glow); animation: warm 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * 0.35s); }
  @keyframes warm { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.18); } }
  .valve svg { width: 1.3rem; height: 1.3rem; }
  .t-name { font: 700 0.95rem/1.1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--radio-ink); }
  .t-line { font-size: 0.82rem; line-height: 1.4; color: var(--radio-ink-soft); }
  .t-count { margin-top: auto; font: 700 0.85rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em; color: var(--radio-amber); font-variant-numeric: tabular-nums; }
  .chips { display: flex; flex-direction: column; gap: 0.3rem; min-height: 1.6rem; }
  .chip { display: flex; align-items: center; gap: 0.4rem; min-width: 0; padding: 0.15rem 0.5rem 0.15rem 0.15rem; border-radius: 9999px; font-size: 0.78rem; color: var(--radio-ink);
    background: var(--radio-panel); box-shadow: inset 0 0 0 1px var(--radio-line); }
  .more { font: 700 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; color: var(--radio-ink-soft); padding-left: 0.4rem; }
  .drawer { margin-top: 0.9rem; padding: 0.9rem 1rem; border-radius: 1rem; background: var(--radio-walnut-deep); color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .row { display: flex; gap: 0.6rem; align-items: flex-start; }
  .r-title { display: block; font-weight: 600; color: var(--radio-on-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a.r-title { text-decoration: underline; text-decoration-color: var(--radio-brass); text-underline-offset: 3px; }
  a.r-title:hover { color: var(--radio-amber); }
  .track { display: flex; gap: 2px; margin-top: 0.35rem; }
  .st { flex: 1; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--radio-on-dark) 18%, transparent); }
  .st.done { background: var(--radio-brass-bright); } .st.running { background: var(--radio-amber); animation: warm 1.4s ease-in-out infinite; } .st.failed { background: var(--radio-needle); }
  .pubchip { display: inline-flex; align-items: center; gap: 0.45rem; max-width: 18rem; padding: 0.2rem 0.65rem 0.2rem 0.2rem; border-radius: 9999px; font-size: 0.88rem; font-weight: 600;
    color: var(--radio-ink); background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); }
  .pubchip:hover { box-shadow: inset 0 0 0 2px var(--radio-amber); }
  .pubchip:focus-visible, a.r-title:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .chain::after { animation: none; display: none; } .tile.busy .valve, .st.running { animation: none; } .tile-btn { transition: none; } }
</style>
