<script>
  // /media — THE LISTENING ROOM (planning/media-listing-design.md). Owns the tuner (as-you-type search + station presets +
  // decades + one voice), loads the full listing index (GET /api/media/index) after first paint, and lays the page out:
  // On Air hero → ticker → tuner → voices → jukebox → topics → eras, plus the docked preview player. SSR renders the first
  // view from the same pure plan (src/lib/media-listing.js), so hydration keeps every card in place.
  import { onMount } from 'svelte';
  import OnAir from './OnAir.svelte';
  import Ticker from './Ticker.svelte';
  import Voices from './Voices.svelte';
  import Jukebox from './Jukebox.svelte';
  import Eras from './Eras.svelte';
  import MiniPlayer from './MiniPlayer.svelte';
  import RecordLabel from './RecordLabel.svelte';
  import { media } from '../../../lib/api.js';
  import { PRESETS, DECADES, buildSearch, searchItems, planLayout, eras as erasOf, topTopics, decadeOf } from '../../../lib/media-listing.js';
  import { formatTime } from '../../../../api/lib/media/range.js';
  import { pauseOffscreen } from '../../../lib/offscreen.js';

  let { initial = {}, initialState = {} } = $props();

  // ── data ──
  let items = $state(initial.items || []);
  let speakers = $state(initial.speakers || []);
  let complete = $state(!!initial.complete);
  const seed = initial.seed || 'x';
  const speakersByKey = $derived(new Map(speakers.map((s) => [s.k, s])));
  const index = $derived(buildSearch(items));

  // ── tuner state ──
  let qInput = $state(initialState.q || '');
  let q = $state(initialState.q || '');
  let preset = $state(initialState.preset || '');
  let decade = $state(initialState.era ? Number(initialState.era) : null);
  let speaker = $state(initialState.speaker || '');
  let reduced = $state(false);
  let limit = $state(30);
  let hits = $state(null);
  let qTimer, hitTimer, hitSeq = 0;

  const active = $derived(!!(q.trim() || preset || decade || speaker));
  const results = $derived(active ? searchItems(index, { q, preset, decade, speaker }, speakersByKey) : items);
  const cards = $derived(!active && !complete && initial.cards ? initial.cards : planLayout(results, speakersByKey, { seed }));
  const shown = $derived(cards.slice(0, limit));
  const eraList = $derived(complete ? erasOf(items) : initial.eras || []);
  const topics = $derived(complete ? topTopics(items) : initial.topics || []);
  const total = $derived(complete ? items.length : initial.stats?.total || items.length);
  const decadesPresent = $derived(new Set(items.map((i) => decadeOf(i.y)).filter(Boolean)));
  const pinned = $derived(speaker ? speakersByKey.get(speaker) : null);

  function sync() {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (preset) p.set('p', preset);
    if (decade) p.set('era', String(decade));
    if (speaker) p.set('speaker', speaker);
    const qs = p.toString();
    history.replaceState(history.state, '', `/media${qs ? `?${qs}` : ''}`);
  }

  async function loadAll() {
    if (complete) return;
    try {
      const data = await media.index();
      items = data.items; speakers = data.speakers; complete = !data.pending;
    } catch { /* keep the SSR slice */ }
  }

  function onInput(e) {
    qInput = e.currentTarget.value;
    loadAll();
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { q = qInput; limit = 30; sync(); }, 90);
    clearTimeout(hitTimer);
    const text = qInput.trim();
    if (text.length < 3) { hits = null; return; }
    hitTimer = setTimeout(async () => {
      const id = ++hitSeq;
      try {
        const data = await media.list(`q=${encodeURIComponent(text)}&limit=1&facets=0`);
        if (id === hitSeq) hits = (data.hits || []).slice(0, 6);
      } catch { if (id === hitSeq) hits = null; }
    }, 550);
  }

  const setPreset = (id) => { preset = preset === id ? '' : id; limit = 30; loadAll(); sync(); };
  const setDecade = (d) => { decade = decade === d ? null : d; limit = 30; loadAll(); sync(); };
  function setSpeaker(k) { speaker = k; limit = 30; loadAll(); sync(); document.getElementById('tuner')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  function setTopic(t) { qInput = t; q = t; limit = 30; loadAll(); sync(); document.getElementById('tuner')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  function clearAll() { qInput = ''; q = ''; preset = ''; decade = null; speaker = ''; hits = null; limit = 30; sync(); }
  function onDecadeSection(d) { setDecade(d); document.getElementById('tuner')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }

  let sentinel, live = $state(false);
  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // the ambient motion (drifts, glow, ticker) starts once the page has settled: first paint is the complete still frame
    const wake = () => setTimeout(() => (live = true), 2500);
    if (document.readyState === 'complete') wake(); else addEventListener('load', wake, { once: true });
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => (live = true), { once: true, passive: true });
    if (active) loadAll();
    else (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => loadAll(), { timeout: 3000 });
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && limit < cards.length) limit += 24; }, { rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<div class="room" class:lr-live={live}>
  <OnAir highlights={initial.highlights || []} {speakersByKey} stats={initial.stats || {}} />

  <div class="mt-6"><Ticker lines={initial.ticker || []} /></div>

  <!-- THE TUNER -->
  <section id="tuner" class="tuner mt-8 scroll-mt-20" aria-label="Find a talk">
    <form role="search" onsubmit={(e) => e.preventDefault()} class="relative">
      <label for="tune-q" class="mb-2 block font-dial text-sm font-bold uppercase tracking-[0.24em] text-radio-ink-soft">Tune in</label>
      <div class="tune-box">
        <svg class="tune-knob" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" /><line x1="20" y1="20" x2="20" y2="6" /></svg>
        <input id="tune-q" type="search" value={qInput} oninput={onInput} onfocus={loadAll} autocomplete="off" spellcheck="false"
          placeholder="A speaker, a topic, a phrase…" class="min-w-0 flex-1 bg-transparent font-marquee text-xl text-radio-ink placeholder:text-radio-ink-soft focus:outline-none sm:text-3xl" />
        {#if active}<button type="button" class="clear" onclick={clearAll}>Clear</button>{/if}
      </div>
    </form>

    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Stations">
      {#each PRESETS as p (p.id)}
        <button type="button" class="key" aria-pressed={preset === p.id} onclick={() => setPreset(p.id)}>{p.label}</button>
      {/each}
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Decades">
      {#each DECADES as d (d)}
        <button type="button" class="key decade" aria-pressed={decade === d} disabled={complete && !decadesPresent.has(d)} onclick={() => setDecade(d)}>{d}s</button>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      {#if pinned}
        <span class="pin">
          <span class="h-7 w-7 overflow-hidden rounded-full"><RecordLabel name={pinned.n} photo={pinned.p} year={pinned.y0} size={28} /></span>
          {pinned.n}
          <button type="button" onclick={() => { speaker = ''; sync(); }} aria-label={`Stop listening to ${pinned.n} only`}>×</button>
        </span>
      {/if}
      <p class="font-dial text-base font-semibold uppercase tracking-wider text-radio-ink-soft" aria-live="polite" aria-atomic="true">
        {#if active}{results.length} of {total} talk{total === 1 ? '' : 's'}{:else}{total} talks on the dial{/if}
      </p>
    </div>

    {#if hits?.length}
      <div class="mt-5">
        <h2 class="font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">Heard in the transcripts</h2>
        <ol class="mt-2 grid gap-2 md:grid-cols-2">
          {#each hits as h, i (`${h.slug}-${h.t0}-${i}`)}
            <li><a href={`/media/${h.slug}?t=${Math.floor(h.t0)}`} class="heard"><span class="t font-dial">{formatTime(h.t0)}</span><span class="line-clamp-2">{h.text}</span></a></li>
          {/each}
        </ol>
      </div>
    {/if}
  </section>

  {#if !active}
    <div class="mt-12"><Voices {speakers} active={speaker} onpick={setSpeaker} /></div>
  {/if}

  <section class="mt-12" aria-labelledby="jb-h" use:pauseOffscreen>
    <h2 id="jb-h" class="mb-4 font-marquee text-3xl text-radio-ink sm:text-4xl">{active ? 'On this frequency' : 'The jukebox'}</h2>
    {#if shown.length}
      <Jukebox cards={shown} {speakersByKey} onspeaker={setSpeaker} {reduced} />
    {:else}
      <p class="rounded-2xl bg-radio-panel px-6 py-10 text-center text-radio-ink-soft">Nothing on this frequency yet. <button type="button" class="font-semibold text-radio-ink underline" onclick={clearAll}>Clear the tuner</button></p>
    {/if}
    <div bind:this={sentinel} class="h-px"></div>
    {#if limit < cards.length}
      <div class="mt-6 flex justify-center"><button type="button" class="key" onclick={() => (limit += 30)}>More from the jukebox ({cards.length - limit} left)</button></div>
    {/if}
  </section>

  {#if topics.length}
    <section class="mt-16" aria-labelledby="topics-h" use:pauseOffscreen>
      <h2 id="topics-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">On the program</h2>
      <ul class="topics mt-4 flex flex-wrap gap-2.5">
        {#each topics as t, i (t.label)}
          <li style={`--i:${i}`}><button type="button" class="topic" class:big={t.n > 1} onclick={() => setTopic(t.label)}>{t.label}{#if t.n > 1}<span class="n font-dial">{t.n}</span>{/if}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="mt-16"><Eras eras={eraList} ondecade={onDecadeSection} /></div>
</div>

<MiniPlayer />

<style>
  .tune-box { display: flex; align-items: center; gap: 0.9rem; padding: 0.9rem 1.1rem; border-radius: 1.1rem; background: var(--radio-paper);
    box-shadow: inset 0 0 0 2px var(--radio-brass), 0 10px 30px var(--radio-brass-soft); transition: box-shadow 0.3s; }
  .tune-box:focus-within { box-shadow: inset 0 0 0 3px var(--radio-amber), 0 0 0 6px var(--radio-glow); }
  .tune-knob { flex: none; width: 2.6rem; height: 2.6rem; transition: transform 0.6s cubic-bezier(0.3, 1.4, 0.5, 1); }
  .tune-knob circle { fill: var(--radio-walnut); stroke: var(--radio-brass); stroke-width: 2.5; }
  .tune-knob line { stroke: var(--radio-amber); stroke-width: 3; stroke-linecap: round; }
  .tune-box:focus-within .tune-knob { transform: rotate(120deg); }
  input[type='search']::-webkit-search-cancel-button { display: none; }
  .tune-box input, .tune-box input:focus, .tune-box input:focus-visible { outline: none; box-shadow: none; border: 0; }   /* the box's own ring shows focus */
  .clear { flex: none; font: 700 0.95rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--radio-ink-soft); padding: 0.6rem 0.8rem; border-radius: 0.6rem; }
  .clear:hover { color: var(--radio-amber); }
  .key { min-height: 2.75rem; padding: 0.5rem 1rem; border-radius: 0.7rem; font: 700 1rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--radio-ink); background: var(--radio-panel); box-shadow: inset 0 -3px 0 var(--radio-line), inset 0 0 0 1px var(--radio-line), 0 2px 0 var(--radio-line);
    transition: transform 0.12s, box-shadow 0.12s, background 0.2s, color 0.2s; }
  .key:hover { background: var(--radio-dial); }
  .key[aria-pressed='true'] { transform: translateY(2px); background: var(--radio-walnut); color: var(--radio-on-dark); box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 2px var(--radio-amber), 0 0 14px var(--radio-glow); }
  .key:disabled { opacity: 0.35; cursor: default; }
  .key:focus-visible, .clear:focus-visible, .topic:focus-visible, .heard:focus-visible, .pin button:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .key.decade { min-width: 4.4rem; padding-inline: 0.7rem; }
  .pin { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.4rem 0.25rem 0.3rem; border-radius: 9999px; background: var(--radio-walnut); color: var(--radio-on-dark); font-weight: 600; }
  .pin button { width: 2rem; height: 2rem; border-radius: 9999px; font-size: 1.2rem; line-height: 1; color: var(--radio-on-dark); }
  .heard { display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.7rem 0.9rem; border-radius: 0.8rem; background: var(--radio-paper); color: var(--radio-ink); box-shadow: inset 0 0 0 1px var(--radio-line); font-size: 0.95rem; }
  .heard:hover { box-shadow: inset 0 0 0 2px var(--radio-brass); }
  .heard .t { flex: none; font-weight: 700; color: var(--radio-amber); }
  .topic { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.95rem; border-radius: 9999px; font-family: 'Libre Caslon Text', Georgia, serif; font-size: 1rem; color: var(--radio-ink);
    background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); transition: background 0.2s, box-shadow 0.2s; }
  .topic.big { font-size: 1.2rem; box-shadow: inset 0 0 0 1.5px var(--radio-brass); }
  .topic:hover { background: var(--radio-dial); }
  .topic .n { font-weight: 800; color: var(--radio-amber); }
  .topics li { animation: bob 6s ease-in-out infinite; animation-delay: calc(var(--i) * -0.7s); }
  :global(.lr-paused) .topics li { animation-play-state: paused; }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .topics li { animation: none; } .tune-knob { transition: none; } }
</style>
