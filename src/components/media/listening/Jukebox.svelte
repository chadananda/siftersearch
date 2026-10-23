<script>
  // THE JUKEBOX: the listing as a rhythmic grid where the card's form encodes what the talk holds — a box set per prolific
  // voice (one portrait + record spines of their talks), pull-quote cards, question cards, waveform discs tinted by era,
  // portrait cards only where that face has not just appeared. Plan from src/lib/media-listing.js planLayout (seeded,
  // stable). FLIP reflow on filtering, staggered entrance for new cards, scroll-driven rise (CSS view() timeline).
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import RecordLabel from './RecordLabel.svelte';
  import Wave from './Wave.svelte';
  import { tallSrc, portraitTall, portraitCard, duration, eraVar, waveHeights } from '../../../lib/media-listing.js';
  import { preview, playExcerpt } from '../../../lib/media-preview.svelte.js';
  import { dayPick } from '../../../lib/speaker-gallery.js';

  let { cards = [], speakersByKey = new Map(), onspeaker = () => {}, reduced = false } = $props();

  const ROLE = { hand: 'Hand of the Cause', uhj: 'Universal House of Justice' };
  const playing = (it) => preview.item?.s === it.s && preview.playing;
  const by = (it) => [it.sp, it.y].filter(Boolean).join(' · ');
  const GRADE = { A: 'Studio clear', B: 'Clear', C: 'Good', D: 'Vintage tape', E: 'Archival' };
  // a plain left click on a speaker link filters in place; cmd/ctrl/shift-click and middle-click open the link as usual
  const plain = (e) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
  const toSpeaker = (e, k) => { if (!plain(e)) return; e.preventDefault(); onspeaker(k); };

  // the radial waveform disc: 48 peaks as spokes around a ring
  function spokes(w) {
    const h = waveHeights(w);
    const n = h.length || 48;
    return (h.length ? h : Array.from({ length: 48 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i)))).map((v, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2, r0 = 30, r1 = 30 + v * 18;
      return { x1: 50 + r0 * Math.cos(a), y1: 50 + r0 * Math.sin(a), x2: 50 + r1 * Math.cos(a), y2: 50 + r1 * Math.sin(a) };
    });
  }
</script>

{#snippet playBtn(it, cls = '')}
  <!-- play HERE (a 20 s excerpt in the docked player); the card's title and its "Open talk" link open the talk -->
  <button type="button" class={`pbtn ${cls}`} class:on={playing(it)} onclick={(e) => { e.stopPropagation(); playExcerpt(it, speakersByKey.get(it.k)); }}
    aria-label={playing(it) ? `Pause the excerpt of ${it.t}` : `Play 20 seconds of ${it.t} here`} title={playing(it) ? 'Pause' : 'Play 20 s here'}>
    {#if playing(it)}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
    {/if}
  </button>
{/snippet}

<!-- every card's one obvious way in: "Open talk →" (a real link; its ::after stretches over the card, so a click anywhere
     that is not another control opens the talk too) -->
{#snippet openLink(it, cls = '')}
  <a href={`/media/${it.s}`} class={`open ${cls}`} aria-label={`Open the talk: ${it.t}`}>Open talk <span aria-hidden="true">→</span></a>
{/snippet}

<ul class="jukebox" class:reduced>
  {#each cards as c, i (c.id)}
    <li class={`card k-${c.kind} s-${c.size}`} style={`--tint:${eraVar(c.it?.y ?? c.speaker?.y0)};--tilt:${i % 2 ? 0.5 : -0.5}deg`}
      animate:flip={{ duration: reduced ? 0 : 450 }} in:fly={{ y: reduced ? 0 : 24, duration: reduced ? 0 : 420, delay: reduced ? 0 : (i % 12) * 35 }}>
      {#if c.kind === 'box'}
        {@const s = dayPick(c.speaker)}   <!-- today's photo from the speaker's gallery (Chad 10-23) -->
        <!-- tall and wide crops use the EXTENDED master (outpainted once per portrait, media agent) when there is one -->
        {@const pic = s.p ? portraitTall(tallSrc(s), c.size === 'lg' ? 220 : 160) : null}
        <article class="box h-full">
          <a href={`/media?speaker=${encodeURIComponent(s.k)}`} class="box-head flex gap-4" onclick={(e) => toSpeaker(e, s.k)} aria-label={`All ${s.c || c.total} talks by ${s.n}`}>
            <div class="box-pic">
              {#if pic}
                <img src={pic.src} srcset={pic.srcset} alt={s.n} title={s.cr ? `${s.n} — photo: ${s.cr}` : s.n} width={c.size === 'lg' ? 220 : 160} height={Math.round((c.size === 'lg' ? 220 : 160) * 1.25)} loading="lazy" decoding="async" class="h-full w-full object-cover" />
              {:else}
                <div class="h-full w-full p-2"><RecordLabel name={s.n} year={s.y0} size={120} /></div>
              {/if}
            </div>
            <div class="min-w-0 self-end">
              <p class="font-dial text-xs font-bold uppercase tracking-[0.22em] text-radio-brass-bright">Box set{ROLE[s.role] ? ` · ${ROLE[s.role]}` : ''}</p>
              <h3 class="box-name font-marquee text-2xl leading-tight text-radio-on-dark sm:text-3xl">{s.n}</h3>
              <p class="mt-1 font-dial text-base font-semibold uppercase tracking-wider text-radio-on-dark opacity-80">{s.c || c.total} talks{s.y0 ? ` · ${s.y0}${s.y1 && s.y1 !== s.y0 ? `–${s.y1}` : ''}` : ''}</p>
            </div>
          </a>
          <div class="spines" style={`--n:${c.talks.length}`}>
            <ol class="spine-list" class:riffle={c.talks.length > 4 && !reduced}>
              {#each c.talks as t, j (t.s)}
                <!-- the row is the link to the talk; the round button beside it plays an excerpt here -->
                <li class="spine-row"><a href={`/media/${t.s}`} class="spine" style={`--st:${eraVar(t.y)};--j:${j}`} title={`Open “${t.t}”`}>
                  <span class="truncate">{t.t}</span><span class="spine-meta">{t.y || ''}{t.y ? ' · ' : ''}{duration(t.d)}</span>
                  <svg class="spine-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
                </a><button type="button" class="spine-play" class:on={playing(t)} onclick={(e) => { e.stopPropagation(); playExcerpt(t, s); }}
                  aria-label={playing(t) ? `Pause the excerpt of ${t.t}` : `Play 20 seconds of ${t.t} here`} title={playing(t) ? 'Pause' : 'Play 20 s here'}>
                  {#if playing(t)}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  {:else}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>{/if}
                </button></li>
              {/each}
            </ol>
          </div>
          <a href={`/media?speaker=${encodeURIComponent(s.k)}`} class="box-all" onclick={(e) => toSpeaker(e, s.k)}>All {s.c || c.total} talks by {s.n} <span aria-hidden="true">→</span></a>
        </article>
      {:else if c.kind === 'quote'}
        {@const it = c.it}
        <article class="quote h-full">
          <div class="card-top"><span class="qmark" aria-hidden="true">“</span>{@render openLink(it)}</div>
          <blockquote class="quote-text">{it.q.x}</blockquote>
          {#if it.q.c}<p class="quote-cite">— {it.q.c}</p>{/if}
          <footer class="mt-auto flex items-end gap-3 pt-3">
            <p class="min-w-0 flex-1 text-sm text-radio-ink-soft">Quoted{it.sp ? ` by ${it.sp}` : ''} in <a href={`/media/${it.s}`} class="above font-semibold text-radio-ink underline decoration-radio-brass decoration-2 underline-offset-2 hover:text-radio-amber">{it.t}</a>{it.y ? `, ${it.y}` : ''}</p>
            {@render playBtn(it)}
          </footer>
        </article>
      {:else if c.kind === 'question'}
        {@const it = c.it}
        {@const qn = it.h.find((h) => h.f === 'q') || it.h[0]}
        <article class="question h-full">
          <div class="card-top"><p class="font-dial text-xs font-bold uppercase tracking-[0.22em] text-radio-brass-bright">{qn.f === 'q' ? 'The question' : 'The theme'}</p>{@render openLink(it, 'light')}</div>
          <h3 class="question-text"><a class="above" href={`/media/${it.s}${qn.t != null ? `?t=${qn.t}` : ''}`}>{qn.x}</a></h3>
          <footer class="mt-auto flex items-end gap-3 pt-3">
            <p class="min-w-0 flex-1 text-sm text-radio-on-dark opacity-85"><a href={`/media/${it.s}`} class="above font-semibold underline decoration-radio-brass underline-offset-2 hover:text-radio-amber">{it.t}</a>{by(it) ? ` · ${by(it)}` : ''}</p>
            {@render playBtn(it, 'light')}
          </footer>
        </article>
      {:else if c.kind === 'portrait'}
        {@const it = c.it}
        {@const s = dayPick(speakersByKey.get(it.k))}
        {@const pic = portraitCard(tallSrc(s), 320)}
        <article class="portrait h-full">
          {#if pic}<img src={pic.src} srcset={pic.srcset} alt={s.n} title={s.cr ? `${s.n} — photo: ${s.cr}` : s.n} width="320" height="512" loading="lazy" decoding="async" class="portrait-img" />{/if}
          <div class="portrait-cap">
            <a href={`/media/${it.s}`} class="above block font-marquee text-xl leading-tight text-radio-on-dark hover:text-radio-amber hover:underline">{it.t}</a>
            <p class="mt-1 text-sm text-radio-on-dark opacity-85">{by(it)} · {duration(it.d)}</p>
            <p class="mt-2">{@render openLink(it, 'light')}</p>
          </div>
          {@render playBtn(it, 'corner')}
        </article>
      {:else}
        {@const it = c.it}
        <article class="wavecard h-full">
          <svg viewBox="0 0 100 100" class="disc-wave" aria-hidden="true">
            <circle cx="50" cy="50" r="29" fill="none" stroke="var(--tint)" stroke-width="0.6" opacity="0.5" />
            {#each spokes(it.w) as p, j (j)}<line {...p} stroke="var(--tint)" stroke-width="1.6" stroke-linecap="round" />{/each}
          </svg>
          <div class="flex h-full flex-col">
            <div class="card-top"><p class="font-dial text-xs font-bold uppercase tracking-[0.2em] text-radio-ink-soft">{it.y || 'Undated'}{it.g ? ` · ${GRADE[it.g] || ''}` : ''}</p>{@render openLink(it)}</div>
            <h3 class="mt-1 font-marquee text-xl leading-tight text-radio-ink"><a href={`/media/${it.s}`} class="above hover:text-radio-amber hover:underline">{it.t}</a></h3>
            {#if it.sp}<p class="mt-1 text-sm text-radio-ink-soft">{it.sp}</p>{/if}
            {#if c.size === 'wide' && (it.sum || it.tp?.length)}<p class="wave-sum mt-2 text-sm text-radio-ink-soft">{it.sum || it.tp.join(' · ')}</p>{/if}
            <div class="mt-auto flex items-center gap-3">
              <span class="font-dial text-base font-semibold text-radio-ink-soft">{duration(it.d)}</span>
              <span class="ml-auto">{@render playBtn(it)}</span>
            </div>
          </div>
        </article>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .jukebox { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); grid-auto-rows: 7.25rem; grid-auto-flow: dense; }
  .card { grid-row: span 2; min-width: 0; border-radius: 1.1rem; overflow: hidden; position: relative; transition: transform 0.35s cubic-bezier(0.3, 0.7, 0.4, 1), box-shadow 0.35s; }
  .s-tall { grid-row: span 4; }
  .s-wide { grid-row: span 2; grid-column: span 2; }
  .s-lg { grid-row: span 4; grid-column: span 2; }
  /* one column on a phone: cards size to their content (a fixed row grid leaves empty bands), with a floor per form */
  @media (max-width: 559px) {
    .jukebox { grid-auto-rows: auto; }
    .card, .s-tall, .s-wide, .s-lg { grid-row: auto; grid-column: auto; }
    .k-box { height: 27rem; } .k-portrait { height: 26rem; } .k-wave { min-height: 10.5rem; } .k-question { min-height: 11rem; }
  }
  .card:hover { transform: translateY(-4px) rotate(var(--tilt)); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18), 0 0 0 2px var(--radio-brass); }
  .card:focus-within { box-shadow: 0 0 0 3px var(--radio-amber); }
  @supports (animation-timeline: view()) {
    .jukebox:not(.reduced) .card > article { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% entry 70%; }
    @keyframes rise { from { opacity: 0.2; transform: translateY(36px) scale(0.97); } to { opacity: 1; transform: none; } }
  }
  article { position: relative; isolation: isolate; display: flex; flex-direction: column; padding: 1.1rem 1.2rem; }
  article :global(a:focus-visible), .pbtn:focus-visible, .spine-play:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; border-radius: 0.25rem; }

  /* "Open talk →": the card's one obvious way in. Its ::after covers the card (stretched link), so a click anywhere opens
     the talk; the other links and the play button sit above it (.above / .pbtn) and keep their own action */
  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
  .open { flex: none; display: inline-flex; align-items: center; gap: 0.3rem; min-height: 1.75rem; font: 700 0.85rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--radio-ink); text-decoration: underline; text-decoration-color: var(--radio-brass);
    text-decoration-thickness: 2px; text-underline-offset: 4px; white-space: nowrap; }
  .open.light { color: var(--radio-on-dark); }
  .open::after { content: ''; position: absolute; inset: 0; z-index: 0; }
  .open span { transition: transform 0.2s; }
  .card:hover .open, .open:hover, .open:focus-visible { color: var(--radio-amber); text-decoration-color: var(--radio-amber); }
  .card:hover .open span, .open:focus-visible span { transform: translateX(3px); }
  .above, .pbtn { position: relative; z-index: 1; }
  .above:hover { text-decoration: underline; }

  /* box set: walnut case, portrait, a riffling stack of record spines */
  .box { background: var(--radio-walnut); color: var(--radio-on-dark);
    background-image: repeating-linear-gradient(95deg, transparent 0 9px, color-mix(in srgb, var(--radio-walnut-deep) 20%, transparent) 9px 10px, transparent 10px 23px); }
  .box-head { border-radius: 0.6rem; }
  .box-head:hover .box-name, .box-head:focus-visible .box-name { color: var(--radio-amber); text-decoration: underline; text-decoration-color: var(--radio-brass); text-decoration-thickness: 2px; text-underline-offset: 5px; }
  .box-head:hover .box-pic { box-shadow: 0 0 0 3px var(--radio-amber), 0 6px 16px rgba(0, 0, 0, 0.4); }
  .box-pic { flex: none; transition: box-shadow 0.2s; width: 5.5rem; height: 6.9rem; border-radius: 0.6rem; overflow: hidden; box-shadow: 0 0 0 2px var(--radio-brass), 0 6px 16px rgba(0, 0, 0, 0.4); background: var(--radio-walnut-deep); }
  .s-lg .box-pic { width: 7.5rem; height: 9.4rem; }
  .spines { position: relative; flex: 1; min-height: 0; margin-top: 0.9rem; overflow: hidden; mask-image: linear-gradient(transparent, #000 10%, #000 88%, transparent); }
  .spines:hover, .spines:focus-within { overflow-y: auto; }
  .spine-list { display: flex; flex-direction: column; gap: 3px; padding: 0.4rem 0; }
  .spine-list.riffle { animation: riffle calc(var(--n) * 2.6s) ease-in-out infinite alternate; }
  .spines:hover .spine-list, .spines:focus-within .spine-list, :global(.lr-paused) .spine-list { animation-play-state: paused; }
  @keyframes riffle { from { transform: translateY(0); } to { transform: translateY(calc(-100% + 9rem)); } }
  .s-tall .spine-list.riffle { animation-name: riffle-s; }
  @keyframes riffle-s { from { transform: translateY(0); } to { transform: translateY(calc(-100% + 7rem)); } }
  .spine-row { display: flex; gap: 3px; }
  .spine { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.6rem; padding: 0.42rem 0.5rem 0.42rem 0.7rem; border-radius: 0.3rem; font-size: 0.9rem; color: var(--radio-on-dark);
    background: linear-gradient(90deg, var(--st) 0 6px, color-mix(in srgb, var(--radio-walnut-deep) 70%, transparent) 6px);
    box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.3); transition: background 0.2s, color 0.2s; }
  .spine:hover, .spine:focus-visible { background: linear-gradient(90deg, var(--st) 0 6px, var(--radio-walnut-deep) 6px); color: var(--radio-amber); }
  .spine:hover .truncate, .spine:focus-visible .truncate { text-decoration: underline; text-decoration-color: var(--radio-brass); text-underline-offset: 3px; }
  .spine-meta { margin-left: auto; flex: none; font: 600 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em; opacity: 0.75; }
  .spine-go { flex: none; width: 0.95rem; height: 0.95rem; margin-left: -0.25rem; opacity: 0.45; transition: opacity 0.2s, transform 0.2s; }
  .spine:hover .spine-go, .spine:focus-visible .spine-go { opacity: 1; transform: translateX(2px); }
  .spine-play { flex: none; display: grid; place-items: center; width: 2.1rem; border-radius: 0.3rem; color: var(--radio-amber);
    background: color-mix(in srgb, var(--radio-walnut-deep) 70%, transparent); box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.3); transition: background 0.2s, color 0.2s; }
  .spine-play svg { width: 0.95rem; height: 0.95rem; }
  .spine-play:hover, .spine-play.on { background: var(--radio-amber); color: var(--radio-walnut-deep); }
  .box-all { margin-top: 0.75rem; align-self: flex-start; font-weight: 600; font-size: 0.95rem; color: var(--radio-on-dark); text-decoration: underline; text-decoration-color: var(--radio-brass); text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .box-all:hover { color: var(--radio-amber); text-decoration-color: var(--radio-amber); }

  /* pull-quote: cream paper, a huge brass quotation mark */
  .quote { background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); }
  .qmark { font: 400 6rem/0.7 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--tint); height: 2.6rem; display: block; }
  .quote-text { font-family: 'Libre Caslon Text', 'Caslon Fallback', Georgia, serif; font-style: italic; font-size: 1.12rem; line-height: 1.45; color: var(--radio-ink);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 7; overflow: hidden; }
  .quote-text, .quote-cite { flex: none; }
  .s-wide .qmark { font-size: 4.5rem; height: 1.7rem; }
  .s-wide .quote-text { font-size: 1.22rem; -webkit-line-clamp: 3; }
  .s-wide .quote-cite { -webkit-line-clamp: 1; }
  .s-tall .quote-text { font-size: 1.25rem; -webkit-line-clamp: 9; }
  .quote-cite { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-top: 0.4rem; font-size: 0.85rem; color: var(--radio-ink-soft); }

  /* question: deep walnut panel, the question as the headline */
  .question { background: var(--radio-walnut-deep); color: var(--radio-on-dark);
    background-image: radial-gradient(90% 80% at 100% 0%, color-mix(in srgb, var(--tint) 45%, transparent), transparent 70%); }
  .question-text { margin-top: 0.4rem; font: 400 1.45rem/1.15 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--radio-on-dark);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
  .s-wide .question-text { font-size: 1.85rem; -webkit-line-clamp: 2; }
  .question-text a:hover { color: var(--radio-amber); }

  /* portrait: 4:5 face-centred, caption over a soft fade */
  .portrait { padding: 0; background: var(--radio-walnut-deep); }
  .portrait-img { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0%; transition: transform 0.8s; }
  .card:hover .portrait-img { transform: scale(1.04); }
  .portrait-cap { margin-top: auto; padding: 3rem 1.1rem 1rem; background: linear-gradient(transparent, color-mix(in srgb, var(--radio-walnut-deep) 92%, transparent) 45%); }

  /* waveform disc: generative art from the talk's own peaks, era-tinted */
  .wavecard { background: var(--radio-panel); box-shadow: inset 0 0 0 1px var(--radio-line);
    background-image: radial-gradient(70% 70% at 85% 80%, color-mix(in srgb, var(--tint) 22%, transparent), transparent 70%); }
  /* the disc is centred on the play button (right 1.2rem + 1.375rem, bottom 1.1rem + 1.375rem): the talk's sound ring
     around its own play control */
  .disc-wave { position: absolute; z-index: -1; width: 10rem; height: 10rem; right: calc(2.575rem - 5rem); bottom: calc(2.475rem - 5rem); opacity: 0.95;
    transition: transform 1.2s cubic-bezier(0.3, 0.7, 0.4, 1); }
  .s-wide .disc-wave { width: 12rem; height: 12rem; right: calc(2.575rem - 6rem); bottom: calc(2.475rem - 6rem); }
  .card:hover .disc-wave { transform: rotate(40deg) scale(1.05); }
  .wavecard h3, .wavecard p { max-width: 85%; }
  .s-wide .wavecard h3, .s-wide .wavecard p { max-width: 70%; }
  .wave-sum { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }

  /* the play button */
  .pbtn { flex: none; display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep);
    box-shadow: 0 0 0 0 var(--radio-glow); transition: transform 0.2s, box-shadow 0.3s; }
  .pbtn svg { width: 1.2rem; height: 1.2rem; }
  .pbtn:hover { transform: scale(1.08); box-shadow: 0 0 0 6px var(--radio-glow); }
  .pbtn.on { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--radio-glow); } 50% { box-shadow: 0 0 0 8px var(--radio-glow); } }
  .pbtn.corner { position: absolute; z-index: 2; top: 0.8rem; right: 0.8rem; }

  @media (prefers-reduced-motion: reduce) {
    .card, .card:hover { transition: none; transform: none; }
    .spine-list.riffle, .pbtn.on { animation: none; }
    .spines { overflow-y: auto; }
    .card:hover .portrait-img, .card:hover .disc-wave { transform: none; }
  }
</style>
