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

  // width only — each cover keeps its own proportions (no crop, no stretch); 1x/2x of the ~120 px card
  const cover = (c) => (c ? imgSet(c, [120, 240], { fo: null }) : null);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const SHOWN = 12;
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
      </a>
    {/each}
  </div>
{/snippet}

{#snippet grid(items, shelfKey = null)}
  <div class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
    {#each items as b (b.id)}{@render bookCard(b, shelfKey)}{/each}
  </div>
{/snippet}

<div class="w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-primary">Library</h1>
      <p class="text-sm text-secondary">The Ocean Library's shelves, with the wider collection beneath each.</p>
    </div>
    <a href="/library?view=browse" class="text-sm text-accent hover:text-accent-hover">Search &amp; filter all documents →</a>
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

    {#each tradition.shelves as s (s.key)}
      <section class="flex flex-col gap-3">
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
      <section class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold text-primary">More in the library</h2>
        {#each tradition.library as l (l.name)}
          {@const key = `l:${l.site || l.collection}`}
          {@const params = l.site ? { site: l.site } : { collection: l.collection || '' }}
          <div class="rounded-md border border-border-subtle bg-surface-1">
            <button class="w-full flex justify-between items-center px-3 py-2 text-left" onclick={() => toggle(key, params)} aria-expanded={!!extra[key]}>
              <span class="text-primary">{l.name}</span><span class="text-sm text-muted">{fmt(l.count)} {extra[key] ? '▴' : '▾'}</span>
            </button>
            {#if extra[key]}
              {@const e = extra[key]}
              <div class="px-3 pb-3 flex flex-col gap-3">
                {#if e.items.some((b) => b.cover)}{@render grid(e.items)}{:else}{@render tiles(e.items)}{/if}
                {#if e.loading}<p class="text-sm text-muted">Loading…</p>
                {:else if e.items.length < l.count}
                  <button class="self-start text-sm text-accent" onclick={() => loadMore(key, params)}>Load more ({fmt(l.count - e.items.length)} left)</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>
