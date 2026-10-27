<script>
  import { onMount } from 'svelte';
  import { media } from '../../lib/api.js';
  import { liveRefresh } from '../../lib/live-data.js';
  import { resolveCollection } from '../../lib/media-collection.js';
  import { duration, fold, safeIndex } from '../../lib/media-listing.js';
  import { playExcerpt, preview } from '../../lib/media-preview.svelte.js';
  import MiniPlayer from './listening/MiniPlayer.svelte';
  let { items = [], speaker, series = false, collectionKey = null } = $props();
  let query = $state('');
  let rows = $state(items);
  onMount(() => liveRefresh(async () => {
    const data = safeIndex(await media.index());
    return resolveCollection(data, series ? 'series' : 'speaker', collectionKey || speaker.k)?.items || null;
  }, fresh => { rows = fresh; }, {every:60_000, idle:false, initial:items}));
  const shown = $derived(query.trim() ? rows.filter(it=>fold([it.t,it.sum,...(it.tp||[])].join(' ')).includes(fold(query))) : rows);
  const language = code => ({en:'English',fa:'Persian',pe:'Persian',ar:'Arabic',es:'Spanish',fr:'French',de:'German'}[code]||code);
</script>
<section aria-labelledby="recordings-h" class="mt-10">
  <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
    <h2 id="recordings-h" class="font-marquee text-3xl text-radio-ink">{series ? 'Talks in this set' : 'All recordings'} <span class="text-xl text-radio-ink-soft">({shown.length})</span></h2>
    <label class="text-sm font-semibold text-radio-ink-soft">Find a talk
      <input type="search" bind:value={query} placeholder="Title, topic, or summary" class="ml-2 rounded-lg border border-radio-line bg-radio-paper px-3 py-2 text-radio-ink" />
    </label>
  </div>
  <ol class="collection-talks space-y-4">
    {#each shown as it (it.s)}
      <li class="rounded-2xl border border-radio-line bg-radio-panel p-5 sm:p-6">
        <article>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              {#if series && it.part}<p class="mb-1 font-dial text-sm font-bold uppercase tracking-wider text-radio-brass">Part {it.part}</p>{/if}
              <h3 class="break-words font-marquee text-xl leading-tight text-radio-ink sm:text-2xl"><a href={`/media/${it.s}`} class="hover:text-radio-amber hover:underline">{it.t}</a></h3>
              <p class="mt-2 text-sm text-radio-ink-soft">{[it.y,duration(it.d),language(it.l),it.g?`Audio ${it.g}`:null].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" class="rounded-full bg-radio-amber px-4 py-2 font-dial text-base font-bold text-radio-walnut-deep" onclick={()=>playExcerpt(it,speaker)} aria-label={`Play 20 seconds of ${it.t}`}>
              {preview.item?.s===it.s && preview.playing ? 'Pause' : 'Preview · 20 s'}
            </button>
          </div>
          {#if it.sum}<p class="mt-4 max-w-prose leading-relaxed text-radio-ink">{it.sum}</p>{/if}
          {#if it.tp?.length}<ul class="mt-3 flex flex-wrap gap-2" aria-label="Topics">{#each it.tp as topic}<li class="rounded-full border border-radio-line px-3 py-1 text-xs text-radio-ink-soft">{topic}</li>{/each}</ul>{/if}
          {#if it.q}<blockquote class="mt-4 border-l-2 border-radio-brass pl-4 text-sm italic leading-relaxed text-radio-ink-soft">“{it.q.x}”{#if it.q.c}<cite class="mt-1 block not-italic">— {it.q.c}</cite>{/if}</blockquote>{/if}
          <p class="mt-4"><a href={`/media/${it.s}`} class="font-semibold text-radio-ink underline decoration-radio-brass underline-offset-4 hover:text-radio-amber">Open talk and transcript →</a></p>
        </article>
      </li>
    {/each}
  </ol>
  {#if !shown.length}<p class="py-8 text-radio-ink-soft">No talks match this search.</p>{/if}
</section>
<MiniPlayer />
