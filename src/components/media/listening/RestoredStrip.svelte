<script>
  // The restoration readout on /media (Chad 10-24): talks published of those planned, held for review, and the latest 30 as box-set spines in a scrolling list (Chad 10-29);
  // beside them a small card per machine doing the work (Chad 10-29): role, GPU, RAM, speed (× real time over the last hour, bar vs the fastest).
  // Six cards fit one row beside the list (Chad 10-30: Tower, Boss, Aorus and three RunPods). Each card is a little machine (Chad 10-30: "half-oldtime-radio,
  // half-computer", "a CRT ... green scanline, slightly rounded Apple-II"): walnut chassis, brass name plate + pilot jewel, a phosphor CRT, two needle meters
  // (CPU = busy % of the machine's CPU quota, GPU = % of its power limit: api/lib/media/worker-cards.js readGauges) and a vent grille.
  // A working machine's CRT types a work-log tail, faster the busier it is (Chad 10-30: "frenetic activity ... typing") — decoration, not a real log.
  // Pods carry cute Pod* names (api/lib/media/worker-cards.js podName). Tower is the CONDUCTOR, not a worker, so it looks different: an enamelled steel
  // console with an amber display, one CPU meter and a switchboard lamp per worker, lit while that worker is busy (Chad 10-30).
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

  // the analog meters: a 110° scale (pivot 24,29, radius 19), ticks every 10 %, a red zone past 90 %
  const ang = (v) => -55 + (Math.max(0, Math.min(100, v)) / 100) * 110;
  const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [24 + r * Math.sin(a), 29 - r * Math.cos(a)].map((x) => x.toFixed(2)); };
  const arc = (from, to) => { const [x1, y1] = pt(ang(from), 19), [x2, y2] = pt(ang(to), 19); return `M${x1} ${y1} A19 19 0 0 1 ${x2} ${y2}`; };
  const TICKS = Array.from({ length: 11 }, (_, i) => { const [x1, y1] = pt(ang(i * 10), i % 5 ? 16.8 : 15.2), [x2, y2] = pt(ang(i * 10), 19.6); return { x1, y1, x2, y2, major: !(i % 5) }; });
  const SCALE = arc(0, 90), REDZONE = arc(90, 100);

  // the CRT tail: a work-log that types itself in bursts while a machine works
  const VERBS = { cloud: ['UNIPASE', 'DENOISE', 'DEREVERB', 'STFT', 'ISTFT', 'LUFS', 'GUARD', 'VAD', 'BLK', 'FLAC'], tower: ['STAGE', 'R2 PUT', 'R2 GET', 'POLL', 'LEDGER', 'SYNC', 'FEED'], home: ['WHISPER', 'ASR', 'DIARIZE', 'GRADE', 'DFN', 'ALIGN'] };
  const kind = (w) => (w.key === 'tower' ? 'tower' : /^sifter-/.test(w.key) ? 'cloud' : 'home');
  const hex = () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const logLine = (w) => { const r = Math.random(); return `>${pick(VERBS[kind(w)])} ${hex()}${r < 0.4 ? ` ${Math.floor(Math.random() * 100)}%` : r < 0.7 ? ' OK' : ` ${hex()}`}`; };
  const crew = $derived(workers.filter((w) => w.key !== 'tower'));
  const busy = (w) => w.status === 'working' || w.status === 'conducting';
  const pace = (w) => { const g = w.gauges; const a = g ? Math.max(g.cpu ?? 0, g.gpu ?? 0) / 100 : w.jobs ? 0.6 : 0.3; return 0.25 + a * 2.6; };   // characters per tick
  let tty = $state({});   // key → { done: [two finished lines], typing, target, carry }
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; });
    io.observe(root);
    const id = setInterval(() => {
      if (!seen || document.hidden) return;
      const next = {};
      for (const w of workers) {
        if (!busy(w)) continue;
        const t = tty[w.key] ? { ...tty[w.key] } : { done: [], typing: '', target: logLine(w), carry: Math.random() * 3 };
        t.carry += pace(w) * (Math.random() < 0.15 ? 0 : 0.4 + Math.random() * 1.4);   // bursts and pauses, not a metronome
        const k = Math.floor(t.carry); t.carry -= k;
        t.typing = t.target.slice(0, t.typing.length + k);
        if (t.typing.length >= t.target.length) { t.done = [...t.done, t.target].slice(-2); t.typing = ''; t.target = logLine(w); }
        next[w.key] = t;
      }
      tty = next;
    }, 60);
    return () => { clearInterval(id); io.disconnect(); };
  });
</script>

{#snippet meter(label, v, of)}
  <div class="meter" class:off={v == null} title={v == null ? `${label}: not reported by this machine` : `${label} ${v}% busy (${of})`}>
    <svg viewBox="0 0 48 31" aria-hidden="true">
      <rect class="face" width="48" height="31" rx="2.5" />
      <path class="scale" d={SCALE} /><path class="red" d={REDZONE} />
      {#each TICKS as t, i (i)}<line class:major={t.major} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />{/each}
      <text x="3" y="29" class="lbl">{label}</text><text x="45" y="29" class="num" text-anchor="end">{v == null ? '—' : `${v}%`}</text>
      <line class="needle" x1="24" y1="29" x2="24" y2="11.5" style={`transform: rotate(${ang(v ?? 0)}deg)`} />
      <circle class="hub" cx="24" cy="29" r="2.6" />
    </svg>
  </div>
{/snippet}

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
        <li class="unit" class:tower={w.key === 'tower'} title={`${w.name}: ${w.status}${w.jobs ? `, ${w.jobs} at work` : ''}`}>
          <div class="plate"><i class={`jewel ${LAMP[w.status] || 'dim'}`}></i><b>{w.name}</b></div>
          <div class="bezel"><div class="screen">
            <div class="ln hd">{w.role}</div>
            {#each w.specs || [['GPU', w.gpu], ['RAM', w.ram]] as [k, v] (k)}<div class="ln"><span class="k">{k}</span>{v}</div>{/each}
            {#if w.key !== 'tower'}
              <div class="cells" aria-hidden="true">{#each Array(10) as _, i (i)}<i class:lit={i < Math.round(((w.speed || 0) / fastest) * 10)}></i>{/each}</div>
              <div class="ln">{w.speed ? `${w.speed}× real time` : w.jobs ? 'first talks under way' : w.status === 'idle' ? 'no work last hour' : w.status}</div>
            {/if}
            {#if w.jobs}<div class="ln">{w.key === 'tower' ? `${w.jobs} talks in hand` : `${w.jobs} at work`}</div>{/if}
            <div class="tty" aria-hidden="true">
              {#each tty[w.key]?.done || [] as l, i (i)}<div class="ln dim">{l}</div>{/each}
              <div class="ln">{busy(w) ? (tty[w.key]?.typing || '>') : ']'}<span class="cur"></span></div>
            </div>
          </div></div>
          {#if w.key === 'tower'}
            <div class="meters">{@render meter('CPU', w.gauges?.cpu ?? null, 'of its CPU quota')}</div>
            <ul class="board" aria-label="Workers Tower is conducting">
              {#each crew as c (c.key)}<li title={`${c.name}: ${c.status}`}><i class={`lamp ${busy(c) ? 'on' : c.status === 'starting' ? 'blink' : ''}`}></i><span>{c.name.replace(/^Pod/, '')}</span></li>{/each}
            </ul>
          {:else}
            <div class="meters">{@render meter('CPU', w.gauges?.cpu ?? null, 'of its CPU quota')}{@render meter('GPU', w.gauges?.gpu ?? null, 'of the GPU power limit')}</div>
            <div class="grille" aria-hidden="true"></div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .restored { min-height: 12rem; display: flex; gap: 1rem 1.25rem; align-items: stretch; }
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
  @media (max-width: 52rem) { .restored { flex-direction: column; } .machines { justify-content: flex-start; } }

  /* the chassis: a walnut cabinet with four brass screws, lit from above */
  .unit { --screw: radial-gradient(circle, var(--radio-brass-bright) 0 1.3px, var(--radio-brass) 1.4px 1.9px, rgba(0, 0, 0, 0.5) 2px 2.4px, transparent 2.5px);
    width: 8.2rem; display: flex; flex-direction: column; gap: 0.3rem; padding: 0.4rem 0.4rem 0.35rem; border-radius: 0.6rem; color: var(--radio-phosphor);
    background:
      var(--screw) 0.2rem 0.2rem / 6px 6px no-repeat, var(--screw) calc(100% - 0.2rem) 0.2rem / 6px 6px no-repeat,
      var(--screw) 0.2rem calc(100% - 0.2rem) / 6px 6px no-repeat, var(--screw) calc(100% - 0.2rem) calc(100% - 0.2rem) / 6px 6px no-repeat,
      repeating-linear-gradient(97deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 5px, rgba(0, 0, 0, 0.06) 5px 6px, transparent 6px 11px),
      linear-gradient(180deg, var(--radio-walnut), var(--radio-walnut-deep));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 16px -10px rgba(0, 0, 0, 0.6); }

  /* brass name plate, engraved, with a pilot-light jewel */
  .plate { display: flex; align-items: center; gap: 0.3rem; margin: 0 0.45rem; padding: 0.12rem 0.35rem; border-radius: 2px;
    background: linear-gradient(180deg, var(--radio-brass-bright), var(--radio-brass) 60%, color-mix(in srgb, var(--radio-brass) 70%, black));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 1px rgba(0, 0, 0, 0.5); }
  .plate b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 0.7rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif;
    letter-spacing: 0.09em; text-transform: uppercase; color: #2a1a0e; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4); }
  .jewel { flex: none; width: 0.48rem; height: 0.48rem; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff8 0 15%, #5a3a22 40%, #2a1a0e);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 -1px 1px rgba(0, 0, 0, 0.5); }
  .jewel.on { background: radial-gradient(circle at 35% 30%, #fff 0 12%, #ffd27a 30%, #ff9a1f 60%, #b45309); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 0 6px 1px rgba(255, 170, 60, 0.8); }
  .jewel.dim { background: radial-gradient(circle at 35% 30%, #fff6 0 12%, #9a7330 45%, #4a3018); }
  .jewel.blink { background: radial-gradient(circle at 35% 30%, #fff 0 12%, #ffd27a 30%, #ff9a1f 60%, #b45309); animation: blink 1.1s steps(2, jump-none) infinite; }
  @keyframes blink { 50% { opacity: 0.25; box-shadow: none; } }

  /* the CRT: a dark rim, then a rounded, slightly barrelled tube with scanlines, glow and a glass glare */
  .bezel { flex: 1; display: flex; padding: 3px; border-radius: 0.7rem / 0.8rem; background: linear-gradient(180deg, #1a1712, #050403);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12), 0 1px 0 rgba(255, 255, 255, 0.12), 0 -1px 0 rgba(0, 0, 0, 0.5); }
  .screen { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; padding: 0.3rem 0.4rem 0.25rem;
    border-radius: 0.6rem / 0.75rem; background: radial-gradient(ellipse 120% 100% at 50% 40%, color-mix(in srgb, var(--radio-phosphor) 9%, var(--radio-crt)) 0%, var(--radio-crt) 70%, #010402 100%);
    box-shadow: inset 0 0 0.5rem rgba(0, 0, 0, 0.95), inset 0 0 1.5rem rgba(0, 0, 0, 0.55);
    font: 400 0.84rem/0.82 'VT323', 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.02em;
    text-shadow: 0 0 1px var(--radio-phosphor), 0 0 5px color-mix(in srgb, var(--radio-phosphor) 55%, transparent); animation: hum 7s steps(1) infinite; }
  .screen::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1; background: repeating-linear-gradient(180deg, rgba(0, 0, 0, 0.32) 0 1px, transparent 1px 3px); }
  .screen::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit;
    background: radial-gradient(ellipse 90% 45% at 30% 0%, rgba(255, 255, 255, 0.10), transparent 70%), radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.45) 100%); }
  @keyframes hum { 0%, 100% { opacity: 1; } 47% { opacity: 0.94; } 48% { opacity: 1; } 83% { opacity: 0.97; } }
  .ln { white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .ln.hd { color: color-mix(in srgb, var(--radio-phosphor) 70%, var(--radio-crt)); margin-bottom: 0.1rem; }
  .ln .k { display: inline-block; width: 2.3em; opacity: 0.6; }
  .ln.dim { opacity: 0.55; }
  .cells { display: flex; gap: 1px; margin: 0.15rem 0 0.12rem; }
  .cells i { flex: 1; height: 0.32rem; background: color-mix(in srgb, var(--radio-phosphor) 14%, transparent); }
  .cells i.lit { background: var(--radio-phosphor); box-shadow: 0 0 4px color-mix(in srgb, var(--radio-phosphor) 70%, transparent); }
  .tty { margin-top: auto; padding-top: 0.15rem; height: 2.6em; display: flex; flex-direction: column; justify-content: flex-end; }
  .cur { display: inline-block; width: 0.5em; height: 0.72em; margin-left: 1px; vertical-align: -0.04em; background: var(--radio-phosphor); box-shadow: 0 0 4px var(--radio-phosphor); animation: cur 1s steps(1) infinite; }
  @keyframes cur { 50% { opacity: 0; } }

  /* two analog meters behind brass bezels: CPU and GPU */
  .meters { display: flex; gap: 0.25rem; }
  .meter { flex: 1; padding: 2px; border-radius: 4px; background: linear-gradient(180deg, var(--radio-brass-bright), var(--radio-brass) 55%, color-mix(in srgb, var(--radio-brass) 60%, black));
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4); }
  .meter svg { display: block; width: 100%; height: auto; border-radius: 2.5px; box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.45); filter: drop-shadow(0 0 2px rgba(255, 214, 140, 0.25)); }
  .meter .face { fill: var(--radio-meter-face); }
  .meter .scale { fill: none; stroke: var(--radio-meter-ink); stroke-width: 0.9; }
  .meter .red { fill: none; stroke: var(--radio-meter-needle); stroke-width: 2.4; }
  .meter line { stroke: var(--radio-meter-ink); stroke-width: 0.8; }
  .meter line.major { stroke-width: 1.4; }
  .meter text { font: 800 6.6px/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.05em; fill: var(--radio-meter-ink); }
  .meter .num { font-variant-numeric: tabular-nums; }
  .meter .needle { stroke: var(--radio-meter-needle); stroke-width: 1.3; stroke-linecap: round; opacity: 1; transform-box: view-box; transform-origin: 24px 29px; transition: transform 1.2s cubic-bezier(0.3, 1.6, 0.5, 1); }
  .meter .hub { fill: var(--radio-meter-ink); stroke: var(--radio-brass); stroke-width: 0.6; }
  .meter.off .face { opacity: 0.6; }
  .meter.off .needle { opacity: 0.35; }

  /* the vent grille under it all */
  .grille { height: 0.4rem; margin: 0 0.5rem; border-radius: 2px; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.6) 0 2px, transparent 2px 4px);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.08); }

  /* Tower, the conductor: enamelled steel with rivets, an amber display, a switchboard of worker lamps */
  .unit.tower { --radio-phosphor: var(--radio-vfd); --radio-crt: var(--radio-vfd-tube);
    --screw: radial-gradient(circle, #d9dee0 0 1.2px, #7c868b 1.3px 1.8px, rgba(0, 0, 0, 0.55) 1.9px 2.3px, transparent 2.4px);
    background:
      var(--screw) 0.2rem 0.2rem / 6px 6px no-repeat, var(--screw) calc(100% - 0.2rem) 0.2rem / 6px 6px no-repeat,
      var(--screw) 0.2rem calc(100% - 0.2rem) / 6px 6px no-repeat, var(--screw) calc(100% - 0.2rem) calc(100% - 0.2rem) / 6px 6px no-repeat,
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 3px),
      linear-gradient(180deg, var(--radio-enamel), var(--radio-enamel-deep)); }
  .unit.tower .plate { background: linear-gradient(180deg, #eef1f2, #b5bec2 60%, #868f93); }
  .unit.tower .plate b { color: #1d2124; }
  .unit.tower .screen::before { background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 2px), repeating-linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0 1px, transparent 1px 3px); }
  .unit.tower .meters { padding: 0 1.1rem; }
  .board { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.15rem 0.3rem; margin: 0; padding: 0.2rem 0.25rem; list-style: none; border-radius: 2px;
    background: #101315; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 255, 0.08); }
  .board li { display: flex; align-items: center; gap: 0.15rem; font: 700 0.5rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em;
    text-transform: uppercase; color: #c9d1d4; }
  .lamp { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff4 0 15%, #3a4a3c 45%, #151b16); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6); }
  .lamp.on { background: radial-gradient(circle at 35% 30%, #fff 0 12%, #ffd27a 30%, #ff9a1f 65%, #b45309); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 5px 1px rgba(255, 170, 60, 0.75); }
  .lamp.blink { background: radial-gradient(circle at 35% 30%, #fff 0 12%, #ffd27a 30%, #ff9a1f 65%, #b45309); animation: blink 1.1s steps(2, jump-none) infinite; }

  @media (prefers-reduced-motion: reduce) { .lamp.blink, .jewel.blink, .screen, .cur { animation: none; } .meter .needle { transition: none; } }
</style>
