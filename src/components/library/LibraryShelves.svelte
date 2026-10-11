<script>
  // The library as shelves of small cards (Chad 10-10): OceanLibrary shelves first; under each, "+ N more" opens the rest
  // of that author's works in the library; then the tradition's other collections, each opening on demand. Renders from
  // ONE edge-cached index (/api/library/shelves, built out of process). Multi-part works (KJV, Qur'an…) are one card.
  // Covers are transparent PNG/WebP art: shown bare (no box behind them); full page width (Chad 10-10).
  import { onMount } from 'svelte';
  import { imgSet } from '../../lib/imagekit.js';

  const API = import.meta.env.PUBLIC_API_URL || '';
  let data = $state(null);
  let error = $state(null);
  let active = $state(null);                      // tradition slug
  let openShelf = $state({});                     // shelf key → show all of its OceanLibrary items
  let openWork = $state({});                      // shelf key → the work whose parts are open there
  let extra = $state({});                         // key → { items, total, loading }
  let gridW = $state(1200);                       // shelf width → cards per row (two full rows shown, not a fixed 12)
  let query = $state('');                         // visible search (Chad 10-11: not hidden behind a link)
  let scope = $state('tradition');                // 'tradition' | 'all'
  let found = $state({ items: [], total: 0, loading: false, q: '' });

  let tradition = $derived(data?.traditions.find((t) => t.slug === active) ?? data?.traditions[0]);

  onMount(async () => {
    try {
      const r = await fetch(`${API}/api/library/shelves`);
      if (!r.ok) throw new Error(r.status === 503 ? 'The library index is being built — try again in a minute.' : `Library unavailable (${r.status})`);
      data = await r.json();
      const want = location.hash.slice(1);
      active = data.traditions.some((t) => t.slug === want) ? want : data.traditions[0]?.slug;
    } catch (e) { error = e.message; }
  });

  function pick(slug) { active = slug; history.replaceState(null, '', `#${slug}`); }

  async function loadMore(key, params) {
    const cur = extra[key] ?? { items: [], total: null, loading: false };
    if (cur.loading) return;
    extra[key] = { ...cur, loading: true };
    try {
      const q = new URLSearchParams({ religion: tradition.name, offset: String(cur.items.length), limit: '48', ...params });
      const r = await fetch(`${API}/api/library/shelves/items?${q}`);
      const j = await r.json();
      extra[key] = { items: [...cur.items, ...(j.items || [])], total: j.total, loading: false };
    } catch { extra[key] = { ...cur, loading: false }; }
  }
  const toggle = (key, params) => { if (extra[key]) { const { [key]: _, ...rest } = extra; extra = rest; } else loadMore(key, params); };

  // live search over every document (title/author/collection), within the chosen tradition or across all
  let timer;
  function onSearch() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) { found = { items: [], total: 0, loading: false, q: '' }; return; }
    timer = setTimeout(() => runSearch(q, 0), 250);
  }
  async function runSearch(q, offset) {
    found = { ...found, loading: true, q };
    try {
      const p = new URLSearchParams({ search: q, limit: '48', offset: String(offset) });
      if (scope === 'tradition' && tradition) p.set('religion', tradition.name);
      const r = await fetch(`${API}/api/library/documents?${p}`);
      const j = await r.json();
      if (query.trim() !== q) return;                          // a newer search superseded this one
      const items = (j.documents || []).map((d) => ({ id: d.id, title: d.title, author: d.author, cover: d.cover_url || null,
        url: `/library/view?doc=${d.id}`, sub: d.collection }));
      found = { items: offset ? [...found.items, ...items] : items, total: j.total || 0, loading: false, q };
    } catch { found = { ...found, loading: false }; }
  }
  $effect(() => { scope; active; if (query.trim().length >= 2) runSearch(query.trim(), 0); });

  // width only — each cover keeps its own proportions (no crop, no stretch); 1x/2x of the ~120 px card
  const cover = (c) => (c ? imgSet(c, [120, 240], { fo: null }) : null);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const CARD = 112, GAP = 12;
  let perRow = $derived(Math.max(3, Math.floor((gridW + GAP) / (CARD + GAP))));
  let SHOWN = $derived(perRow * 2);
</script>

{#snippet bookCard(b, shelfKey = null)}
  <svelte:element this={b.kind === 'work' && shelfKey != null ? 'button' : 'a'} href={b.kind === 'work' && shelfKey != null ? undefined : b.url}
    onclick={b.kind === 'work' && shelfKey != null ? () => (openWork[shelfKey] = openWork[shelfKey] === b.title ? null : b.title) : undefined}
    aria-expanded={b.kind === 'work' && shelfKey != null ? openWork[shelfKey] === b.title : undefined}
    class="book group flex flex-col gap-1 min-w-0 text-left" title={b.author ? `${b.title} — ${b.author}` : b.title}>
    {#if cover(b.cover)}
      {@const c = cover(b.cover)}
      <!-- a fixed box; the cover fits inside it at its own proportions, standing on the box's floor (Chad 10-10) -->
      <div class="w-full h-40 flex items-end justify-center">
        <img src={c.src} srcset={c.srcset} sizes="120px" alt="" loading="lazy" decoding="async"
          class="max-w-full max-h-full w-auto h-auto transition-transform group-hover:-translate-y-0.5" />
      </div>
    {:else}
      <div class="w-full h-40 rounded-md border border-border-subtle bg-surface-2 group-hover:border-accent p-2 flex items-end">
        <span class="text-[0.7rem] leading-tight text-secondary line-clamp-5">{b.title}</span>
      </div>
    {/if}
    <span class="text-xs leading-snug text-primary line-clamp-2 group-hover:text-accent">{b.title}</span>
    {#if b.kind === 'work'}<span class="text-[0.7rem] text-muted">{fmt(b.parts)} parts</span>
    {:else if b.author}<span class="text-[0.7rem] text-muted truncate">{b.author}</span>{/if}
  </svelte:element>
{/snippet}

<!-- the wider library is mostly coverless (2 of ~53k docs have covers): compact title tiles, not empty cover boxes -->
{#snippet tiles(items)}
  <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
    {#each items as b (b.id)}
      <a href={b.url} class="group flex flex-col gap-0.5 min-w-0 rounded-md border border-border-subtle bg-surface-2 hover:border-accent px-3 py-2" title={b.author ? `${b.title} — ${b.author}` : b.title}>
        <span class="text-sm leading-snug text-primary line-clamp-2 group-hover:text-accent">{b.title}</span>
        {#if b.author}<span class="text-xs text-muted truncate">{b.author}</span>{/if}
        {#if b.sub}<span class="text-[0.7rem] text-muted truncate">{b.sub}</span>{/if}
      </a>
    {/each}
  </div>
{/snippet}

{#snippet grid(items, shelfKey = null)}
  <div class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(112px,1fr))]">
    {#each items as b (b.id)}{@render bookCard(b, shelfKey)}{/each}
  </div>
{/snippet}

<div class="w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
  <header class="flex flex-col gap-3">
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold text-primary">Library</h1>
      <a href="/library?view=browse" class="text-sm text-secondary hover:text-accent">Advanced filters (language, year, status) →</a>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <input id="library-search" type="search" bind:value={query} oninput={onSearch} autocomplete="off"
        placeholder="Search titles, authors, collections…" aria-label="Search the library"
        class="flex-1 min-w-[16rem] max-w-2xl px-4 py-2 rounded-md border border-border bg-surface-1 text-primary placeholder:text-muted focus:outline-none focus:border-accent" />
      {#if query.trim().length >= 2}
        <div class="flex gap-1 text-sm" role="group" aria-label="Search scope">
          <button class="px-3 py-1 rounded-full border {scope === 'tradition' ? 'bg-accent text-white border-accent' : 'border-border text-secondary'}" onclick={() => (scope = 'tradition')}>{tradition?.name ?? 'This tradition'}</button>
          <button class="px-3 py-1 rounded-full border {scope === 'all' ? 'bg-accent text-white border-accent' : 'border-border text-secondary'}" onclick={() => (scope = 'all')}>All traditions</button>
        </div>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="text-error">{error}</p>
  {:else if !data}
    <div class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]" aria-busy="true">
      {#each Array(18) as _}<div class="aspect-[2/3] rounded-md bg-surface-2 animate-pulse"></div>{/each}
    </div>
  {:else}
    <nav class="flex flex-wrap gap-2" aria-label="Traditions">
      {#each data.traditions as t (t.slug)}
        <button class="px-3 py-1 rounded-full border text-sm {t.slug === tradition.slug ? 'bg-accent text-white border-accent' : 'border-border text-secondary hover:text-primary'}"
          onclick={() => pick(t.slug)}>{t.name} <span class="opacity-70">{fmt(t.total)}</span></button>
      {/each}
    </nav>

    {#if found.q}
      <section class="flex flex-col gap-3" aria-live="polite">
        <h2 class="text-lg font-semibold text-primary">{found.loading && !found.items.length ? 'Searching…' : `${fmt(found.total)} result${found.total === 1 ? '' : 's'} for “${found.q}”`}</h2>
        {#if found.items.some((b) => b.cover)}{@render grid(found.items)}{:else}{@render tiles(found.items)}{/if}
        {#if found.items.length < found.total}
          <button class="self-start text-sm text-accent hover:text-accent-hover" disabled={found.loading} onclick={() => runSearch(found.q, found.items.length)}>{found.loading ? 'Loading…' : `Show more (${fmt(found.total - found.items.length)} left)`}</button>
        {/if}
      </section>
    {:else}
    {#each tradition.shelves as s (s.key)}
      <section class="flex flex-col gap-3" bind:clientWidth={gridW}>
        <h2 class="text-lg font-semibold text-primary">{s.name} <span class="text-sm font-normal text-muted">{fmt(s.count)}</span></h2>
        {@render grid(openShelf[s.key] ? s.items : s.items.slice(0, SHOWN), s.key)}
        {#if openWork[s.key]}
          {@const w = s.items.find((i) => i.kind === 'work' && i.title === openWork[s.key])}
          {#if w?.list}
            <div class="pl-3 border-l-2 border-accent flex flex-col gap-2">
              <h3 class="text-sm font-semibold text-primary">{w.title} <span class="font-normal text-muted">{fmt(w.parts)} parts</span></h3>
              {@render grid(w.list)}
            </div>
          {/if}
        {/if}
        <div class="flex flex-wrap gap-4 text-sm">
          {#if s.items.length > SHOWN}
            <button class="text-accent hover:text-accent-hover" onclick={() => (openShelf[s.key] = !openShelf[s.key])}>
              {openShelf[s.key] ? 'Show fewer' : `Show all ${fmt(s.items.length)}`}</button>
          {/if}
          {#if s.more}
            <button class="text-accent hover:text-accent-hover" onclick={() => toggle(`m:${s.key}`, { authors: s.more.authors.join('|') })}>
              {extra[`m:${s.key}`] ? 'Hide' : `+ ${fmt(s.more.count)} more by ${s.name} in the library`}</button>
          {/if}
        </div>
        {#if extra[`m:${s.key}`]}
          {@const e = extra[`m:${s.key}`]}
          <div class="pl-3 border-l-2 border-border-subtle flex flex-col gap-3">
            {#if e.items.some((b) => b.cover)}{@render grid(e.items)}{:else}{@render tiles(e.items)}{/if}
            {#if e.loading}<p class="text-sm text-muted">Loading…</p>
            {:else if e.total != null && e.items.length < s.more.count}
              <button class="self-start text-sm text-accent" onclick={() => loadMore(`m:${s.key}`, { authors: s.more.authors.join('|') })}>Load more</button>
            {/if}
          </div>
        {/if}
      </section>
    {/each}

    {#if tradition.library.length}
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold text-primary">More in the library</h2>
        <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {#each tradition.library as l (l.name)}
            {@const key = `l:${l.name}`}
            {#if l.url}
              <a href={l.url} class="flex justify-between items-baseline gap-2 rounded-md border border-border-subtle bg-surface-1 hover:border-accent px-3 py-2">
                <span class="text-primary truncate">{l.name}</span><span class="text-sm text-muted shrink-0">{fmt(l.count)}</span>
              </a>
            {:else}
              {@const params = l.site ? { site: l.site } : l.authors ? { collection: l.collection, authors: l.authors.join('|') } : { collection: l.collection || '' }}
              <button class="flex justify-between items-baseline gap-2 rounded-md border px-3 py-2 text-left {extra[key] ? 'border-accent bg-surface-2' : 'border-border-subtle bg-surface-1 hover:border-accent'}"
                onclick={() => toggle(key, params)} aria-expanded={!!extra[key]}>
                <span class="text-primary truncate">{l.name}</span><span class="text-sm text-muted shrink-0">{fmt(l.count)} {extra[key] ? '▴' : '▾'}</span>
              </button>
            {/if}
          {/each}
        </div>
        {#each tradition.library.filter((l) => !l.url && extra[`l:${l.name}`]) as l (l.name)}
          {@const key = `l:${l.name}`}
          {@const e = extra[key]}
          {@const params = l.site ? { site: l.site } : l.authors ? { collection: l.collection, authors: l.authors.join('|') } : { collection: l.collection || '' }}
          <div class="flex flex-col gap-3 pl-3 border-l-2 border-accent">
            <h3 class="text-sm font-semibold text-primary">{l.name} <span class="font-normal text-muted">{fmt(l.count)}</span></h3>
            {#if e.items.some((b) => b.cover)}{@render grid(e.items)}{:else}{@render tiles(e.items)}{/if}
            {#if e.loading}<p class="text-sm text-muted">Loading…</p>
            {:else if e.items.length < l.count}
              <button class="self-start text-sm text-accent" onclick={() => loadMore(key, params)}>Load more ({fmt(l.count - e.items.length)} left)</button>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
    {/if}
  {/if}
</div>
