<script>
  // /media listing island: facet filters + sort + transcript search (q → matching passages linking to /media/<slug>?t=<t0>).
  // Hydrates onto the SSR'd first page; every change refetches GET /api/media and mirrors the filters into the URL.
  // Deps: src/lib/media.js (query ↔ params), src/lib/api.js (media client), api/lib/media/range.js (formatTime).
  import { onMount } from 'svelte';
  import { media } from '../../lib/api.js';
  import { DURATION_BUCKETS, SORTS, filtersFromParams, pageQuery, apiQuery, mediaFile } from '../../lib/media.js';
  import { formatTime } from '../../../api/lib/media/range.js';

  let { initialData = null, initialFilters = {}, fetchError = null } = $props();

  const PAGE = 48;
  let filters = $state({ ...filtersFromParams(initialFilters) });
  let qInput = $state(filters.q);
  let items = $state(initialData?.items || []);
  let total = $state(initialData?.total || 0);
  let hits = $state(initialData?.hits || null);
  const facets = initialData?.facets || null;
  let loading = $state(false);
  let error = $state(fetchError);
  let showFilters = $state(false);
  let seq = 0;

  const active = $derived(['speaker', 'tradition', 'collection', 'year', 'language', 'dur', 'hasVideo'].filter((k) => filters[k]).length);
  const titleById = $derived(new Map(items.map((i) => [i.id, i])));

  const SELECTS = [
    { key: 'speaker', label: 'Speaker' },
    { key: 'tradition', label: 'Tradition' },
    { key: 'collection', label: 'Collection' },
    { key: 'year', label: 'Year' },
    { key: 'language', label: 'Language' },
  ];

  async function load({ push = false, append = false } = {}) {
    const id = ++seq;
    if (!append) {
      const qs = pageQuery(filters);
      const url = `/media${qs ? `?${qs}` : ''}`;
      if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
    }
    loading = true; error = null;
    try {
      const data = await media.list(`${apiQuery(filters, { limit: PAGE, offset: append ? items.length : 0 })}&facets=0`);
      if (id !== seq) return;
      items = append ? [...items, ...data.items] : data.items;
      total = data.total;
      if (!append) hits = data.hits;
    } catch (e) {
      if (id === seq) error = e.message;
    } finally {
      if (id === seq) loading = false;
    }
  }

  const setFilter = (key, value) => { filters[key] = value; load(); };
  const submitSearch = (e) => { e.preventDefault(); filters.q = qInput.trim(); load({ push: true }); };
  function clearAll() {
    for (const k of Object.keys(filters)) filters[k] = '';
    qInput = '';
    load({ push: true });
  }

  onMount(() => {
    const onPop = () => { filters = filtersFromParams(new URLSearchParams(location.search)); qInput = filters.q; load(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  const meta = (it) => [it.speaker, it.year].filter(Boolean).join(' · ');
</script>

<section class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Media</h1>
  <p class="mt-2 max-w-3xl text-secondary">
    Talks and recorded classes with word-aligned transcripts. Click any word to hear it; quotations of the Writings link to their source.
    {#if facets?.total}<span class="text-muted">{facets.total} recording{facets.total === 1 ? "" : "s"}{facets.hours ? ` · ${facets.hours} hours` : ''}.</span>{/if}
  </p>
</section>

<form class="mb-4 flex gap-2" role="search" onsubmit={submitSearch}>
  <label for="media-q" class="sr-only">Search all transcripts</label>
  <input id="media-q" type="search" bind:value={qInput} placeholder="Search every transcript…"
    class="min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-4 py-2.5 text-primary placeholder:text-muted focus:border-accent focus:outline-none" />
  <button type="submit" class="rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-text hover:bg-accent-hover">Search</button>
</form>

<div class="mb-6">
  <button type="button" class="mb-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-secondary hover:bg-hover sm:hidden"
    aria-expanded={showFilters} onclick={() => (showFilters = !showFilters)}>
    Filters{active ? ` (${active})` : ''}
    <svg class="h-4 w-4 transition-transform" class:rotate-180={showFilters} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <div class="grid-cols-2 gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8" class:grid={showFilters} class:hidden={!showFilters}>
    {#each SELECTS as s (s.key)}
      <label class="flex flex-col gap-1 text-xs font-medium text-muted">
        {s.label}
        <select class="rounded-lg border border-border bg-surface-0 px-2 py-2 text-sm text-primary" value={filters[s.key]}
          onchange={(e) => setFilter(s.key, e.currentTarget.value)}>
          <option value="">All</option>
          {#each facets?.[s.key] || [] as f (f.v)}
            <option value={String(f.v)}>{f.v} ({f.n})</option>
          {/each}
          {#if filters[s.key] && !(facets?.[s.key] || []).some((f) => String(f.v) === filters[s.key])}
            <option value={filters[s.key]}>{filters[s.key]}</option>
          {/if}
        </select>
      </label>
    {/each}
    <label class="flex flex-col gap-1 text-xs font-medium text-muted">
      Length
      <select class="rounded-lg border border-border bg-surface-0 px-2 py-2 text-sm text-primary" value={filters.dur} onchange={(e) => setFilter('dur', e.currentTarget.value)}>
        <option value="">Any</option>
        {#each DURATION_BUCKETS as b (b.id)}<option value={b.id}>{b.label}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs font-medium text-muted">
      Sort
      <select class="rounded-lg border border-border bg-surface-0 px-2 py-2 text-sm text-primary" value={filters.sort || 'recent'} onchange={(e) => setFilter('sort', e.currentTarget.value)}>
        {#each SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
      </select>
    </label>
    <div class="col-span-2 flex items-end gap-3 sm:col-span-1 lg:col-span-2 xl:col-span-1 xl:flex-col xl:items-start xl:justify-end">
      <label class="flex min-h-10 items-center gap-2 text-sm text-secondary">
        <input type="checkbox" class="h-4 w-4 accent-accent" checked={filters.hasVideo === '1'} onchange={(e) => setFilter('hasVideo', e.currentTarget.checked ? '1' : '')} />
        Has video{facets?.video ? ` (${facets.video})` : ''}
      </label>
      {#if active || filters.q}
        <button type="button" class="min-h-10 text-sm text-accent hover:text-accent-hover" onclick={clearAll}>Clear all</button>
      {/if}
    </div>
  </div>
</div>

{#if error}
  <p class="mb-4 rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-error">The media library could not be loaded ({error}).</p>
{/if}

{#if hits}
  <section class="mb-8" aria-labelledby="hits-h">
    <h2 id="hits-h" class="mb-3 text-lg font-semibold text-primary">
      {hits.length ? `Passages matching “${filters.q}”` : `No transcript passage matches “${filters.q}”`}
    </h2>
    <ol class="space-y-2">
      {#each hits.slice(0, 30) as h, i (`${h.slug}-${h.t0}-${i}`)}
        {@const it = titleById.get(h.item_id)}
        <li>
          <a href={`/media/${h.slug}?t=${Math.floor(h.t0)}`} class="block rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 hover:border-border hover:bg-surface-2">
            <span class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-medium text-primary">{it?.title || h.slug}</span>
              {#if it?.speaker}<span class="text-muted">{it.speaker}</span>{/if}
              <span class="ml-auto font-mono text-xs text-accent">▶ {formatTime(h.t0)}</span>
            </span>
            <span class="mt-1 line-clamp-3 block text-sm text-secondary">{h.text}</span>
          </a>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<div class="mb-3 flex items-baseline justify-between gap-2">
  <h2 class="text-sm font-medium text-muted" aria-live="polite">
    {loading ? 'Loading…' : `${total} recording${total === 1 ? '' : 's'}${hits ? ' with matching passages' : ''}`}
  </h2>
</div>

<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" class:opacity-60={loading}>
  {#each items as it (it.id)}
    <li>
      <a href={`/media/${it.slug}`} class="group flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-1 transition hover:border-border hover:bg-surface-2">
        <div class="relative aspect-video overflow-hidden bg-surface-2">
          {#if it.thumb}
            <img src={media.href(mediaFile(it.slug, it.thumb))} alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
          {/if}
          {#if it.duration_s}
            <span class="absolute bottom-2 right-2 rounded bg-surface-0 px-1.5 py-0.5 font-mono text-xs text-primary">{formatTime(it.duration_s)}</span>
          {/if}
        </div>
        <div class="flex flex-1 flex-col gap-1 p-3">
          <h3 class="line-clamp-2 font-medium text-primary group-hover:text-accent">{it.title || it.slug}</h3>
          {#if meta(it)}<p class="text-sm text-secondary">{meta(it)}</p>{/if}
          <div class="mt-auto flex flex-wrap gap-1.5 pt-2 text-xs">
            {#if it.quotes_n}<span class="rounded-full bg-surface-3 px-2 py-0.5 text-secondary">{it.quotes_n} quotation{it.quotes_n === 1 ? '' : 's'}</span>{/if}
            {#if it.crs_n}<span class="rounded-full bg-surface-3 px-2 py-0.5 text-secondary">{it.crs_n} cross-ref{it.crs_n === 1 ? '' : 's'}</span>{/if}
            {#if it.has_video}<span class="rounded-full bg-surface-3 px-2 py-0.5 text-secondary">Video</span>{/if}
            {#if it.source_kind === 'youtube'}<span class="rounded-full border border-error px-2 py-0.5 text-error">YouTube</span>{/if}
          </div>
        </div>
      </a>
    </li>
  {/each}
</ul>

{#if !items.length && !loading && !error}
  <p class="py-12 text-center text-muted">No recordings match these filters.</p>
{/if}

{#if items.length < total}
  <div class="mt-6 flex justify-center">
    <button type="button" class="min-h-11 rounded-lg border border-border px-5 py-2 text-sm text-secondary hover:bg-hover disabled:opacity-50" disabled={loading}
      onclick={() => load({ append: true })}>Show more ({total - items.length} left)</button>
  </div>
{/if}
