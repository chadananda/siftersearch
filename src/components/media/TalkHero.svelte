<script>
  // /media/<slug> BROADCAST CARD (top half): server-rendered only — no hydration — so the title and summary paint as soon
  // as they arrive, before the island's large transcript props. MediaPlayer (the island below) continues the cabinet with
  // the player and toggles .spinning / .live here while playing.
  import RecordLabel from './listening/RecordLabel.svelte';
  import { eraVar, duration as dur, portraitSquare } from '../../lib/media-listing.js';
  import { galleryOf, dayIndex } from '../../lib/speaker-gallery.js';

  let { item, speakerKey = null } = $props();
  const duration = Number(item.duration_s) || 0;
  const photo = item.thumb?.kind === 'photo';
  // the speaker's GALLERY (Chad 10-23): today's photo first (per person, per day); the rest crossfade in on the client
  // ([slug].astro), loaded only when their turn comes — the label ring keeps its size, so nothing shifts
  const gallery = photo ? galleryOf(item) : [];
  const start = dayIndex(speakerKey || item.speaker || '', gallery.length);
  const order = [...gallery.slice(start), ...gallery.slice(0, start)];
  const lead = order[0] || null;
  const creditOf = (p) => (p ? [p.credit, p.year].filter(Boolean).join(' · ') : '');
  const when = [item.date || item.year, item.place, item.event].filter(Boolean);
  const q = item.quality;
  const ISSUE_LABEL = { muffled: 'muffled (narrow bandwidth)', noisy: 'background noise', hum: 'mains hum', reverberant: 'echoey room', clipped: 'distorted (clipped)', dropouts: 'dropouts', 'low-level': 'quiet or uneven levels', speed: 'speed off' };
  const qualityTitle = q ? [`Recording quality ${q.overall}`, q.primary_issue && q.primary_issue !== 'ok' ? ISSUE_LABEL[q.primary_issue] || q.primary_issue : 'clear',
    ...Object.entries(q.dimensions || {}).filter(([, x]) => x?.grade).map(([k, x]) => `${k} ${x.grade}`)].join(' · ') : '';
  const audienceLabel = typeof item.audience === 'string' ? item.audience : item.audience?.label || null;
  const tint = eraVar(item.year);
</script>

<div style={`--tint:${tint}`}>
  <!-- THE BROADCAST CARD: the speaker's record, call-sign line, title, and the player on the dial glass -->
  <header class="talk-hero cabinet relative overflow-hidden rounded-t-3xl bg-radio-walnut-deep px-2.5 pt-2.5 sm:px-3 sm:pt-3">
    <div class="cabinet-inner rounded-t-2xl bg-radio-walnut px-4 pb-1 pt-5 sm:px-8 sm:pt-7">
      <nav class="flex flex-wrap items-center gap-x-2 font-dial text-sm font-semibold uppercase tracking-[0.22em] text-radio-on-dark" aria-label="Breadcrumb">
        <span class="lamp" aria-hidden="true"></span>
        <a href="/media" class="hover:text-radio-amber">The Fireside Room</a>
        {#if item.collection}<span class="opacity-60" aria-hidden="true">/</span><span class="opacity-80">{item.collection}</span>{/if}
      </nav>
      <div class="mt-5 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
        <figure class="mx-auto sm:mx-0">
          <div class="record relative h-40 w-40 sm:h-48 sm:w-48">
            <div class="vinyl absolute inset-0 rounded-full bg-radio-groove"></div>
            <div class="absolute inset-[21%] label-ring overflow-hidden rounded-full" data-rotate={order.length > 1 ? '' : undefined}
              title={lead ? `${item.speaker || ''}${creditOf(lead) ? ` — photo: ${creditOf(lead)}` : ''}` : undefined}>
              <RecordLabel name={item.speaker || item.title} photo={photo ? (lead?.url || item.thumb.url) : null} year={item.year} size={112} eager alt={photo ? (item.speaker || '') : ''} />
              {#each order.slice(1) as p}
                {@const pic = portraitSquare(p.url, 112)}
                <img class="rot" data-src={pic.src} data-srcset={pic.srcset} width="112" height="112" alt="" decoding="async"
                  data-credit={p.credit || ''} data-licence={p.licence || ''} data-year={p.year || ''} data-href={p.source_url || p.page_url || ''} />
              {/each}
            </div>
          </div>
          {#if photo && lead && (lead.credit || lead.licence || lead.source_url || lead.page_url || order.length > 1)}
            {@const credit = lead.credit}
            {@const src = lead.source_url || lead.page_url}
            <figcaption class="mx-auto mt-2 max-w-48 text-center text-xs text-radio-on-dark opacity-70" data-rot-caption data-who={item.speaker || 'the speaker'}>
              <!-- the credit itself links to where the photo came from (descriptive anchor text, no bare "source"); the
                   rotation rewrites it for the photo on show -->
              <!-- the licence line can be long (a publisher's permission statement): it rides on the link's title -->
              <a href={src || undefined} title={lead.licence || undefined} target="_blank" rel="noopener" class="underline decoration-radio-brass underline-offset-2 hover:text-radio-amber">Photo of {item.speaker || 'the speaker'}{credit ? `: ${credit}` : ''}</a><span>{lead.year ? ` · ${lead.year}` : ''}</span>
            </figcaption>
          {/if}
        </figure>
        <div class="min-w-0">
          <p class="font-dial text-sm font-bold uppercase tracking-[0.24em] text-radio-brass-bright">
            {item.year ? `Recorded ${item.year}` : 'Undated recording'}{duration ? ` · ${dur(duration)}` : ''}{item.language && item.language !== 'en' ? ` · ${item.language}` : ''}
          </p>
          <h1 class="mt-2 font-marquee text-[2.1rem] leading-[1.02] text-radio-on-dark sm:text-5xl lg:text-6xl">{item.title}</h1>
          {#if item.speaker}
            <p class="mt-3 text-lg text-radio-on-dark sm:text-xl">
              {#if speakerKey}<a href={`/media?speaker=${encodeURIComponent(speakerKey)}`} class="font-semibold underline decoration-radio-brass decoration-2 underline-offset-4 hover:text-radio-amber">{item.speaker}</a>{:else}<span class="font-semibold">{item.speaker}</span>{/if}
            </p>
          {/if}
          {#if when.length > (item.year && !item.date ? 1 : 0)}<p class="mt-1 text-sm text-radio-on-dark opacity-75">{when.join(' · ')}</p>{/if}
          <div class="mt-3 flex flex-wrap gap-2">
            {#if q?.overall}
              <span class="tube" title={qualityTitle} aria-label={qualityTitle}>Audio {q.overall}{q.primary_issue && q.primary_issue !== 'ok' ? ` · ${ISSUE_LABEL[q.primary_issue] || q.primary_issue}` : ' · clear'}</span>
            {/if}
            {#if audienceLabel}<span class="tube">{audienceLabel}</span>{/if}
            {#if item.quotes?.length}<span class="tube">{item.quotes.length} quotation{item.quotes.length === 1 ? '' : 's'} linked</span>{/if}
          </div>
        </div>
      </div>
      {#if item.summary}<p class="mt-6 max-w-3xl text-base leading-relaxed text-radio-on-dark opacity-90 sm:text-lg">{item.summary}</p>{/if}
    </div>
  </header>
</div>

<style>
  /* the gallery's other photos, stacked over the label; the client turns one .on at a time (a slow crossfade) */
  .rot { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 9999px; object-fit: cover; opacity: 0; transition: opacity 1.4s ease; }
  .rot:global(.on) { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .rot { transition: none; } }
  .cabinet-inner {
    background-image:
      repeating-linear-gradient(97deg, transparent 0 7px, color-mix(in srgb, var(--radio-walnut-deep) 18%, transparent) 7px 8px, transparent 8px 19px),
      radial-gradient(110% 80% at 15% 0%, color-mix(in srgb, var(--tint) 30%, transparent), transparent 60%);
    /* the edge on three sides only: the cabinet continues in MediaPlayer below without a seam */
    box-shadow: inset 1px 1px 0 color-mix(in srgb, var(--radio-brass) 45%, transparent), inset -1px 0 0 color-mix(in srgb, var(--radio-brass) 45%, transparent);
  }
.lamp { width: 0.65rem; height: 0.65rem; border-radius: 9999px; background: var(--radio-needle); opacity: 0.45; margin-right: 0.25rem; }
.lamp.live { opacity: 1; box-shadow: 0 0 10px 2px var(--radio-needle); animation: lamp 2.4s ease-in-out infinite; }
@keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.vinyl { background-image: repeating-radial-gradient(circle at 50% 50%, var(--radio-groove) 0 2px, color-mix(in srgb, var(--radio-groove) 80%, var(--radio-on-dark)) 2px 3px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); }
.vinyl::after { content: ''; position: absolute; inset: 0; border-radius: 9999px; background: conic-gradient(from 30deg, transparent 0 10%, var(--radio-groove-sheen) 14%, transparent 22% 55%, var(--radio-groove-sheen) 62%, transparent 70%); }
.record { animation: spin 2s linear infinite; animation-play-state: paused; }
.record.spinning { animation-play-state: running; }
@keyframes spin { to { transform: rotate(360deg); } }
.label-ring { box-shadow: 0 0 0 2px var(--radio-brass); }
.tube { display: inline-flex; align-items: center; padding: 0.25rem 0.7rem; border-radius: 9999px; font: 700 0.85rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--radio-on-dark); background: color-mix(in srgb, var(--radio-walnut-deep) 55%, transparent); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  @media (prefers-reduced-motion: reduce) { .record, .lamp.live { animation: none; } }
</style>
