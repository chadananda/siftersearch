<script>
  // /media/<slug>/m/<key> — one MOMENT (or, kind 'clip', any span: /media/<slug>/clip/<startMs>-<endMs>) as a shareable page in the Listening Room style: the quote set large, the speaker on a
  // record, the excerpt's own waveform with a play button (our aligned audio, exactly that span), "hear it in context",
  // share row, the cross-references the excerpt touches (citation = link), and the way back: the talk, its other moments,
  // the speaker's other talks, the library. Deps: media-preview (one sound at a time), media-listing, share.
  import { onMount } from 'svelte';
  import RecordLabel from './listening/RecordLabel.svelte';
  import MiniPlayer from './listening/MiniPlayer.svelte';
  import ShareRow from './ShareRow.svelte';
  import { media } from '../../lib/api.js';
  import { preview, playExcerpt } from '../../lib/media-preview.svelte.js';
  import { eraVar, duration as dur, waveWindow } from '../../lib/media-listing.js';
  import { momentPath, momentShareText, SITE } from '../../lib/share.js';
  import { formatTime } from '../../../api/lib/media/range.js';

  let { m, item = null, speaker = null, others = [], sameVoice = [], speakersByKey = {}, kind = 'moment', pageUrl = null } = $props();
  import ShortMaker from './ShortMaker.svelte';

  const t0 = m.t0_ms / 1000, t1 = m.t1_ms / 1000;
  const secs = Math.max(1, Math.round(t1 - t0));
  const tint = eraVar(m.year);
  const url = pageUrl || `${SITE}${momentPath(m.slug, m.key)}`;
  const contextHref = `/media/${m.slug}?t=${Math.floor(m.t0_ms / 1000)}-${Math.ceil(m.t1_ms / 1000)}${m.key ? `#moment-${m.key}` : ''}`;
  const shareText = momentShareText(m);
  // the row the shared preview player understands: the talk, the window, its audio (full) or clip permission
  const row = { s: m.slug, t: m.title, sp: m.speaker, y: m.year, hl: [t0, t1], au: item?.audio && item?.rights?.playback === 'full' ? item.audio : null };
  const canPlay = !!item && (item.rights?.playback === 'full' ? !!item.audio : item?.rights?.playback === 'clips');
  const playingThis = $derived(preview.item?.s === m.slug && preview.start != null && preview.playing);
  const progress = $derived(preview.item?.s === m.slug && preview.end > preview.start ? Math.min(1, Math.max(0, (preview.t - preview.start) / (preview.end - preview.start))) : 0);
  const xrefs = (item?.cross_references || []).filter((c) => (c.para === m.para || (c.t0 != null && c.t0 >= t0 - 2 && c.t0 <= t1 + 2)) && (c.url || c.excerpt));
  const quotes = (item?.quotes || []).filter((q) => q.url && q.excerpt && (q.para === m.para || (q.t0 >= t0 - 2 && q.t0 <= t1 + 2)));
  const yt = item?.source?.kind === 'youtube' ? item.source : null;
  const ytAt = yt?.url ? `${yt.url}${yt.url.includes('?') ? '&' : '?'}t=${Math.floor(t0)}s` : null;
  let bars = $state(Array.from({ length: 64 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.3))));

  onMount(async () => {
    if (!item?.waveform) return;
    try { const w = waveWindow(await (await fetch(media.href(item.waveform))).json(), t0, t1, 64); if (w.length) bars = w; } catch { /* the placeholder wave */ }
  });
</script>

<article class="moment-page" style={`--tint:${tint}`}>
  <header class="cab rounded-3xl bg-radio-walnut-deep p-2.5 sm:p-3">
    <div class="cab-in rounded-2xl bg-radio-walnut px-5 pb-7 pt-6 sm:px-10 sm:pb-10 sm:pt-8">
      <nav class="flex flex-wrap items-center gap-x-2 font-dial text-sm font-semibold uppercase tracking-[0.22em] text-radio-on-dark" aria-label="Breadcrumb">
        <span class="lamp" class:live={playingThis} aria-hidden="true"></span>
        <a href="/media" class="hover:text-radio-amber">The Listening Room</a>
        <span class="opacity-60" aria-hidden="true">/</span>
        <a href={`/media/${m.slug}`} class="hover:text-radio-amber">{m.title}</a>
      </nav>

      <div class="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
        <div class="min-w-0">
          {#if m.context}<p class="text-base text-radio-on-dark opacity-80 sm:text-lg">{m.context}</p>{/if}
          <blockquote class="quote mt-3"><p>{m.text}</p></blockquote>
          <p class="mt-5 text-lg text-radio-on-dark">
            — {#if speaker?.k}<a href={`/media?speaker=${encodeURIComponent(speaker.k)}`} class="font-semibold underline decoration-radio-brass decoration-2 underline-offset-4 hover:text-radio-amber">{m.speaker}</a>{:else}<span class="font-semibold">{m.speaker || 'Unknown voice'}</span>{/if},
            in <a href={`/media/${m.slug}`} class="italic underline decoration-radio-brass underline-offset-4 hover:text-radio-amber">{m.title}</a>{m.year ? ` (${m.year})` : ''}
          </p>
        </div>
        <div class="record mx-auto h-44 w-44 sm:h-56 sm:w-56" class:spinning={playingThis}>
          <div class="vinyl absolute inset-0 rounded-full bg-radio-groove"></div>
          <div class="label-ring absolute inset-[21%] overflow-hidden rounded-full">
            <RecordLabel name={m.speaker || m.title} photo={speaker?.p} year={m.year} size={128} eager alt={speaker?.p ? m.speaker || '' : ''} />
          </div>
        </div>
      </div>

      <!-- the excerpt on the dial glass -->
      <section class="dial mt-8 rounded-2xl bg-radio-dial p-3 sm:p-4" aria-label={`This ${kind}'s audio`}>
        <div class="flex items-center gap-4">
          {#if canPlay}
            <button type="button" class="bigplay" onclick={() => playExcerpt(row, speaker ? { n: speaker.n, p: speaker.p } : null)} aria-label={playingThis ? `Pause this ${kind}` : `Hear this ${kind} (${secs} seconds)`}>
              {#if playingThis}
                <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              {:else}
                <svg class="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
              {/if}
            </button>
          {/if}
          <svg class="h-16 min-w-0 flex-1 sm:h-20" viewBox="0 0 256 100" preserveAspectRatio="none" aria-hidden="true">
            {#each bars as b, i (i)}<rect x={i * 4 + 0.6} y={50 - b * 44} width="2.6" height={b * 88} rx="1.2" class={i / bars.length <= progress && progress > 0 ? 'fill-radio-amber' : 'fill-radio-dial-ink'} opacity={i / bars.length <= progress && progress > 0 ? 1 : 0.32} />{/each}
          </svg>
        </div>
        <p class="mt-2 font-dial text-base font-bold uppercase tracking-wider text-radio-dial-ink">{formatTime(t0)}–{formatTime(t1)} · {secs} seconds{item?.duration_s ? ` of ${dur(item.duration_s)}` : ''}</p>
      </section>

      <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a href={contextHref} class="ctx">Hear it in context: {m.title} at {formatTime(t0)}</a>
        {#if ytAt}<a href={ytAt} target="_blank" rel="noopener" class="ctx">Watch on YouTube{yt.channel ? ` (${yt.channel})` : ''} from {formatTime(t0)}</a>{/if}
      </div>
      <div class="mt-5"><ShareRow {url} text={shareText} title={`${m.speaker || ''} — ${m.title}`} tone="dark" /></div>
      <ShortMaker slug={m.slug} startMs={m.t0_ms} endMs={m.t1_ms} text={m.text} speaker={m.speaker} title={m.title} year={m.year} talkUrl={`${SITE}${contextHref}`} pageUrl={url} />
    </div>
  </header>

  {#if quotes.length || xrefs.length}
    <section class="mx-auto mt-12 max-w-3xl" aria-labelledby="refs-h">
      <h2 id="refs-h" class="font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">The Writings this {kind} touches</h2>
      {#each quotes as q, i (i)}
        <aside class="insert paper"><blockquote>{q.excerpt}</blockquote><p class="cite">— <a href={q.url} target="_blank" rel="noopener">{q.cite || 'the source passage'}</a></p></aside>
      {/each}
      {#each xrefs as c, i (i)}
        <aside class="insert wood">
          {#if c.claim}<p class="claim">On: {c.claim}</p>{/if}
          {#if c.excerpt}<blockquote>{c.excerpt}</blockquote>{/if}
          {#if c.url}<p class="cite">— <a href={c.url} target="_blank" rel="noopener">{c.cite || 'the source passage'}</a></p>{/if}
        </aside>
      {/each}
    </section>
  {/if}

  {#if others.length}
    <section class="mt-14" aria-labelledby="more-h">
      <h2 id="more-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">{kind === 'clip' ? 'Moments' : 'More moments'} from {m.title}</h2>
      <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each others as o (o.key)}
          <li><a href={momentPath(m.slug, o.key)} class="ticket"><span class="t">{formatTime(o.t0_ms / 1000)}</span><span class="q">“{o.text}”</span></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if sameVoice.length}
    <section class="mt-14" aria-labelledby="voice-h">
      <h2 id="voice-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">{speaker?.k ? `More from ${m.speaker}` : 'Also on the dial'}</h2>
      <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each sameVoice as r (r.s)}
          {@const sp = speakersByKey[r.k]}
          <li>
            <a href={`/media/${r.s}`} class="rel" style={`--rt:${eraVar(r.y)}`}>
              <span class="rel-disc"><span class="rel-label"><RecordLabel name={sp?.n || r.sp || r.t} photo={sp?.p} year={r.y} size={56} /></span></span>
              <span class="min-w-0"><span class="block font-marquee text-lg leading-tight text-radio-ink">{r.t}</span>
                <span class="mt-0.5 block text-sm text-radio-ink-soft">{[r.sp, r.y, dur(r.d)].filter(Boolean).join(' · ')}</span></span>
            </a>
          </li>
        {/each}
      </ul>
      {#if speaker?.k}<p class="mt-4"><a class="back" href={`/media?speaker=${encodeURIComponent(speaker.k)}`}>Every talk by {m.speaker} in the Listening Room</a></p>{/if}
    </section>
  {/if}
  <p class="mt-10"><a class="back" href="/media">Back to the Listening Room</a></p>
</article>

<MiniPlayer />

<style>
  .cab-in { background-image: repeating-linear-gradient(97deg, transparent 0 7px, color-mix(in srgb, var(--radio-walnut-deep) 18%, transparent) 7px 8px, transparent 8px 19px),
      radial-gradient(110% 80% at 15% 0%, color-mix(in srgb, var(--tint) 30%, transparent), transparent 60%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--radio-brass) 45%, transparent), inset 0 2px 30px rgba(0, 0, 0, 0.35); }
  .lamp { width: 0.65rem; height: 0.65rem; border-radius: 9999px; background: var(--radio-needle); opacity: 0.5; margin-right: 0.25rem; }
  .lamp.live { opacity: 1; box-shadow: 0 0 10px 2px var(--radio-needle); }
  .quote { font: 400 clamp(1.9rem, 4.6vw, 3.6rem)/1.12 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--radio-on-dark); text-wrap: balance; }
  .quote p::before { content: '“'; color: var(--radio-amber); } .quote p::after { content: '”'; color: var(--radio-amber); }
  .record { position: relative; animation: spin 2s linear infinite; animation-play-state: paused; }
  .record.spinning { animation-play-state: running; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .vinyl { background-image: repeating-radial-gradient(circle at 50% 50%, var(--radio-groove) 0 2px, color-mix(in srgb, var(--radio-groove) 80%, var(--radio-on-dark)) 2px 3px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); }
  .label-ring { box-shadow: 0 0 0 2px var(--radio-brass); }
  .dial { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--radio-brass) 70%, transparent), inset 0 6px 18px rgba(0, 0, 0, 0.22); background-image: radial-gradient(60% 140% at 50% 100%, var(--radio-glow), transparent 70%); }
  .bigplay { flex: none; display: grid; place-items: center; width: 4rem; height: 4rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); transition: transform 0.2s, box-shadow 0.3s; }
  .bigplay:hover { transform: scale(1.05); box-shadow: 0 0 0 7px var(--radio-glow); }
  .ctx { color: var(--radio-on-dark); font-weight: 600; text-decoration: underline; text-decoration-color: var(--radio-brass); text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .ctx:hover { color: var(--radio-amber); }
  .insert { margin-top: 1rem; padding: 1.1rem 1.3rem; border-radius: 0.9rem; }
  .insert blockquote { font-family: 'Libre Caslon Text', 'Caslon Fallback', Georgia, serif; font-size: 1.12rem; line-height: 1.6; }
  .insert .cite { margin-top: 0.6rem; font-size: 0.9rem; }
  .insert .cite a { font-weight: 600; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .paper { background: var(--radio-paper); color: var(--radio-ink); box-shadow: inset 4px 0 0 var(--tint), inset 0 0 0 1px var(--radio-line); }
  .paper blockquote { font-style: italic; }
  .paper .cite a { text-decoration-color: var(--radio-amber); }
  .wood { background: var(--radio-walnut-deep); color: var(--radio-on-dark); }
  .wood .claim { font-size: 0.92rem; opacity: 0.85; margin-bottom: 0.4rem; }
  .wood .cite a { text-decoration-color: var(--radio-brass); }
  .insert .cite a:hover { color: var(--radio-amber); }
  .ticket { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; padding: 0.9rem 1rem; border-radius: 0.9rem; background: var(--radio-dial); color: var(--radio-dial-ink);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--radio-brass) 60%, transparent); transition: transform 0.25s, box-shadow 0.25s; }
  .ticket:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--radio-needle); }
  .ticket .t { font: 700 0.85rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.14em; color: var(--radio-needle); }
  .ticket .q { font: 400 1.1rem/1.3 'Gloock', 'Gloock Fallback', Georgia, serif; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 5; overflow: hidden; }
  .rel { display: flex; align-items: center; gap: 0.9rem; padding: 0.7rem 0.9rem 0.7rem 0.7rem; border-radius: 1rem; background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); transition: transform 0.25s, box-shadow 0.25s; }
  .rel:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--rt); }
  .rel-disc { position: relative; flex: none; width: 4.2rem; height: 4.2rem; border-radius: 9999px; background: repeating-radial-gradient(circle, var(--radio-groove) 0 1.5px, color-mix(in srgb, var(--radio-groove) 78%, var(--radio-on-dark)) 1.5px 2.5px); }
  .rel-label { position: absolute; inset: 16%; border-radius: 9999px; overflow: hidden; box-shadow: 0 0 0 2px var(--radio-brass); }
  .back { font-weight: 600; color: var(--radio-ink); text-decoration: underline; text-decoration-color: var(--radio-amber); text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .back:hover { color: var(--radio-amber); }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .record { animation: none; } .bigplay, .ticket, .rel { transition: none; } }
</style>
