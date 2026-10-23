<script>
  // "On Air": the hero. A tuning dial across the decades; every ~8 s the needle drifts to another highlight talk and the
  // Now Playing panel shows its pull-quote or question, the speaker's label and a breathing waveform. The first frame is the
  // first highlight, fully rendered at rest (SSR). Rotation pauses when hovered/focused, offscreen, hidden, or when the
  // visitor prefers reduced motion. Play is on click only (the shared preview player).
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import RecordLabel from './RecordLabel.svelte';
  import Wave from './Wave.svelte';
  import ImportReadout from './ImportReadout.svelte';
  import { highlightLine, duration } from '../../../lib/media-listing.js';
  import { preview, playExcerpt } from '../../../lib/media-preview.svelte.js';

  // its own island (index.astro), ahead of the listing's large props, so the first frame paints early
  let { highlights = [], speakersByKey = {}, stats = {}, importProgress = null } = $props();

  const Y0 = 1930, Y1 = 2030;
  let idx = $state(0);
  let held = $state(false), visible = $state(true), reduced = $state(false);
  let root;
  const cur = $derived(highlights[idx] || null);
  const spk = $derived(cur ? (speakersByKey instanceof Map ? speakersByKey.get(cur.k) : speakersByKey[cur.k]) : null);
  const line = $derived(cur ? highlightLine(cur) : null);
  const pos = (y) => (y ? Math.min(1, Math.max(0, (y - Y0) / (Y1 - Y0))) : 0.985);
  const needle = $derived(pos(cur?.y));
  const playingThis = $derived(preview.item?.s === cur?.s && preview.playing);
  const progress = $derived(preview.item?.s === cur?.s && preview.end > preview.start ? (preview.t - preview.start) / (preview.end - preview.start) : -1);
  const ticks = Array.from({ length: (Y1 - Y0) / 2 + 1 }, (_, i) => Y0 + i * 2);

  function tune(i) { idx = (i + highlights.length) % highlights.length; }

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(root);
    const t = setInterval(() => {
      if (reduced || held || !visible || document.hidden || highlights.length < 2 || preview.playing) return;
      tune(idx + 1);
    }, 8000);
    return () => { clearInterval(t); io.disconnect(); };
  });
</script>

<section bind:this={root} class="onair relative overflow-hidden rounded-3xl bg-radio-walnut-deep p-3 sm:p-4" aria-labelledby="lr-title"
  onmouseenter={() => (held = true)} onmouseleave={() => (held = false)} onfocusin={() => (held = true)} onfocusout={() => (held = false)}
  class:lr-paused={!visible}>
  <div class="cabinet relative rounded-2xl bg-radio-walnut px-4 pb-5 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
    <!-- the masthead -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="flex items-center gap-2 font-dial text-sm font-semibold uppercase tracking-[0.28em] text-radio-on-dark">
        <span class="onair-lamp" aria-hidden="true"></span> On air
      </p>
      <div class="vu hidden sm:block" aria-hidden="true"><span class="vu-needle"></span><span class="vu-scale">VU</span></div>
    </div>
    <h1 id="lr-title" class="mt-3 font-marquee text-[2.6rem] leading-[0.95] text-radio-on-dark sm:text-6xl lg:text-7xl">The Fireside Room</h1>
    <!-- the subtitle is the live import readout (Chad 10-22); the library line is the fallback when it is unavailable -->
    <ImportReadout progress={importProgress} {stats} />

    <!-- the dial -->
    <div class="dial relative mt-6 h-20 overflow-hidden rounded-xl bg-radio-dial sm:h-24" role="group" aria-label="Tuning dial: recordings by year">
      <div class="dial-glow" aria-hidden="true"></div>
      <div class="absolute inset-x-4 bottom-2 top-2" aria-hidden="true">
        {#each ticks as y (y)}
          <span class="tick" class:major={y % 10 === 0} style={`left:${pos(y) * 100}%`}></span>
          {#if y % 10 === 0 && y < Y1}
            <span class="tick-label font-dial text-radio-dial-ink" class:hidden={y % 20 !== 0} style={`left:${pos(y) * 100}%`}>{y}</span>
          {/if}
        {/each}
        <span class="tick-label undated font-dial text-radio-dial-ink" style="left:98.5%">?</span>
        <div class="needle-track"><span class="needle" style={`transform:translateX(${needle * 100}%)`}><i></i></span></div>
      </div>
    </div>

    <!-- now playing -->
    {#if cur}
      <div class="mt-6 grid items-center gap-5 sm:grid-cols-[auto_1fr] sm:gap-8">
        <div class="record relative mx-auto h-36 w-36 sm:h-44 sm:w-44" class:spinning={playingThis}>
          <div class="vinyl absolute inset-0 rounded-full bg-radio-groove"></div>
          {#key cur.s}
            <div class="absolute inset-[22%] overflow-hidden rounded-full" in:fade={{ duration: reduced ? 0 : 500 }}>
              <RecordLabel name={spk?.n || cur.sp || cur.t} photo={spk?.p} year={cur.y} size={112} eager={idx === 0} alt="" />
            </div>
          {/key}
        </div>
        <div class="min-w-0" aria-live="polite">
          {#key cur.s}
            <div in:fade={{ duration: reduced ? 0 : 600, delay: reduced ? 0 : 150 }}>
              <p class="font-dial text-xs font-semibold uppercase tracking-[0.24em] text-radio-brass-bright">
                {line.kind === 'quote' ? 'Quoted in this talk' : line.kind === 'question' ? 'A question this talk takes up' : 'Now playing'}{cur.y ? ` · tuned to ${cur.y}` : ''}
              </p>
              {#if line.kind === 'quote'}
                <blockquote class="mt-2 line-clamp-4 font-quote text-lg italic leading-snug text-radio-on-dark sm:line-clamp-3 sm:text-2xl">“{line.text}”</blockquote>
                {#if line.cite}<p class="mt-1 text-sm text-radio-on-dark opacity-75">— {line.cite}</p>{/if}
              {:else}
                <p class="mt-2 line-clamp-3 font-marquee text-2xl leading-tight text-radio-on-dark sm:line-clamp-2 sm:text-4xl">{line.text}</p>
              {/if}
              <p class="mt-3 text-sm text-radio-on-dark opacity-90 sm:text-base">
                <a href={`/media/${cur.s}`} class="font-semibold underline decoration-radio-brass decoration-2 underline-offset-4 hover:text-radio-amber hover:decoration-radio-amber focus-visible:outline-2 focus-visible:outline-radio-amber">{cur.t}</a>
                {#if cur.sp}<span class="opacity-80"> · {cur.sp}</span>{/if}
                <span class="opacity-70"> · {duration(cur.d)}</span>
              </p>
            </div>
          {/key}
          <div class="mt-4 flex items-center gap-4">
            <button type="button" class="play-btn inline-flex min-h-11 items-center gap-2 rounded-full bg-radio-amber px-5 py-2 font-dial text-base font-bold uppercase tracking-wider text-radio-walnut-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radio-on-dark"
              aria-label={playingThis ? `Pause the excerpt of ${cur.t}` : `Hear 20 seconds of ${cur.t}`} onclick={() => playExcerpt(cur, spk)}>
              {#if playingThis}
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> Pause
              {:else}
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg> Hear 20 s
              {/if}
            </button>
            <a href={`/media/${cur.s}`} class="open-talk inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full px-4 py-2 font-dial text-base font-bold uppercase tracking-wider text-radio-on-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radio-amber"
              aria-label={`Open the talk: ${cur.t}`}>Open talk <span aria-hidden="true">→</span></a>
            <div class="h-10 min-w-0 flex-1"><Wave w={cur.w} year={cur.y} breathing={!reduced} {progress} tint="var(--radio-amber)" class="h-full" /></div>
          </div>
        </div>
      </div>
      {#if highlights.length > 1}
        <div class="mt-6 flex items-center justify-center gap-1.5" role="group" aria-label="Stations">
          {#each highlights as h, i (h.s)}
            <button type="button" class="station-dot" class:on={i === idx} aria-label={`Tune to ${h.t}${h.sp ? `, ${h.sp}` : ''}`} aria-pressed={i === idx} onclick={() => tune(i)}><i></i></button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .cabinet {
    background-image:
      repeating-linear-gradient(97deg, transparent 0 7px, color-mix(in srgb, var(--radio-walnut-deep) 18%, transparent) 7px 8px, transparent 8px 19px),
      radial-gradient(120% 90% at 20% 0%, color-mix(in srgb, var(--radio-brass) 22%, transparent), transparent 60%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--radio-brass) 45%, transparent), inset 0 2px 30px rgba(0, 0, 0, 0.35);
  }
  .onair-lamp { width: 0.7rem; height: 0.7rem; border-radius: 9999px; background: var(--radio-needle); box-shadow: 0 0 10px 2px var(--radio-needle); animation: lamp 2.4s ease-in-out infinite; }
  @keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  .dial { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--radio-brass) 70%, transparent), inset 0 6px 18px rgba(0, 0, 0, 0.25); }
  .dial-glow { position: absolute; inset: 0; background: radial-gradient(60% 120% at 50% 100%, var(--radio-glow), transparent 70%); animation: glow 5s ease-in-out infinite; }
  @keyframes glow { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
  .tick { position: absolute; bottom: 0; width: 1px; height: 22%; background: var(--radio-dial-ink); opacity: 0.45; }
  .tick.major { height: 42%; width: 2px; opacity: 0.85; }
  .tick-label { position: absolute; top: 0; transform: translateX(-50%); font-size: 0.95rem; font-weight: 700; letter-spacing: 0.06em; }
  @media (min-width: 640px) { .tick-label { font-size: 1.15rem; } .tick-label.hidden { display: block; } }
  .needle-track { position: absolute; inset: -0.5rem 0; pointer-events: none; }
  .needle { position: absolute; inset: 0; transition: transform 1.6s cubic-bezier(0.34, 1.32, 0.5, 1); will-change: transform; }
  .needle i { position: absolute; left: -1.5px; top: 0; bottom: 0; width: 3px; border-radius: 2px; background: var(--radio-needle); box-shadow: 0 0 12px 1px var(--radio-needle); animation: drift 6s ease-in-out infinite; }
  @keyframes drift { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(3px); } 70% { transform: translateX(-2px); } }
  .vinyl { background-image: repeating-radial-gradient(circle at 50% 50%, var(--radio-groove) 0 2px, color-mix(in srgb, var(--radio-groove) 80%, var(--radio-on-dark)) 2px 3px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), inset 0 0 0 1px var(--radio-groove-sheen); }
  .vinyl::after { content: ''; position: absolute; inset: 0; border-radius: 9999px; background: conic-gradient(from 30deg, transparent 0 10%, var(--radio-groove-sheen) 14%, transparent 22% 55%, var(--radio-groove-sheen) 62%, transparent 70%); }
  .record { animation: spin 9s linear infinite; animation-play-state: paused; }
  .record.spinning { animation-play-state: running; animation-duration: 1.8s; }
  .record:not(.spinning) { animation: wobble 7s ease-in-out infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes wobble { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  .play-btn { box-shadow: 0 0 0 0 var(--radio-glow); transition: transform 0.2s, box-shadow 0.3s; }
  .open-talk { box-shadow: inset 0 0 0 2px var(--radio-brass); transition: box-shadow 0.2s, color 0.2s; }
  .open-talk:hover { color: var(--radio-amber); box-shadow: inset 0 0 0 2px var(--radio-amber); }
  .play-btn:hover { transform: translateY(-1px) scale(1.03); box-shadow: 0 0 0 6px var(--radio-glow); }
  .vu { position: relative; width: 4.5rem; height: 2.4rem; border-radius: 0.4rem 0.4rem 0.2rem 0.2rem; background: var(--radio-dial); overflow: hidden;
    box-shadow: inset 0 0 0 1.5px var(--radio-brass); }
  .vu-needle { position: absolute; left: 50%; bottom: -0.2rem; width: 2px; height: 2.3rem; background: var(--radio-needle); transform-origin: bottom center; animation: vu 1.3s ease-in-out infinite alternate; }
  .vu-scale { position: absolute; bottom: 0.1rem; left: 0.35rem; font: 700 0.55rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; color: var(--radio-dial-ink); }
  @keyframes vu { 0% { transform: rotate(-42deg); } 35% { transform: rotate(8deg); } 55% { transform: rotate(-12deg); } 80% { transform: rotate(26deg); } 100% { transform: rotate(-20deg); } }
  .station-dot { display: inline-grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 9999px; }
  .station-dot i { width: 0.55rem; height: 0.55rem; border-radius: 9999px; background: var(--radio-on-dark); opacity: 0.35; transition: transform 0.3s, opacity 0.3s; }
  .station-dot.on i { opacity: 1; background: var(--radio-amber); transform: scale(1.35); box-shadow: 0 0 8px var(--radio-glow); }
  .station-dot:focus-visible { outline: 2px solid var(--radio-amber); }
  .lr-paused .onair-lamp, .lr-paused .dial-glow, .lr-paused .needle i, .lr-paused .vu-needle, .lr-paused .record { animation-play-state: paused; }
  @media (prefers-reduced-motion: reduce) {
    .onair-lamp, .dial-glow, .needle i, .vu-needle, .record, .record:not(.spinning) { animation: none; }
    .needle { transition: none; }
  }
</style>
