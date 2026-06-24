<script>
  // The Archive of Souls — a scholarly-archival browser of the people in the entity graph. A rotating band of
  // round portraits up top (decorative, independent of search), one large centred search (instant token-filter
  // as you type; press ✦/Enter for AI meaning-search), a portrait-forward grid, and a detail drawer exposing
  // the full dossier (relationships, cross-corpus reach, sourced provenance). Deps: PUBLIC_API_URL. Svelte 5.
  import { ikUrl } from '../lib/imagekit.js';
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  const API = import.meta.env.PUBLIC_API_URL || '';
  const PER_PAGE = 60;
  // ImageKit (webp by default); always an explicit width; fo-face centres the square crop on the face
  const cardImg = (p) => ikUrl(p, 'w-220,h-220,fo-face,q-80');
  const heroImg = (p) => ikUrl(p, 'w-260,h-260,fo-face,q-80');
  const drawerImg = (p) => ikUrl(p, 'w-440,q-85');   // width-only: full portrait, no crop

  // SSG: the page prerenders with initialData baked in (instant paint), then this island hydrates into search
  const { initialData = null } = $props();
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, "'").toLowerCase();
  const tokenize = (s) => fold(s).split(/[^a-z0-9']+/).filter((t) => t.length > 1);
  const normalize = (list) => (list || []).map((p) => ({ ...p, _tok: [...new Set([
    ...tokenize(p.name), ...(p.aliases || []).flatMap(tokenize),
    ...(p.kinship || []).flatMap((k) => tokenize(k.who).concat(tokenize(k.relation))),
    ...tokenize(p.side || ''), ...tokenize(p.summary || ''),
  ])] }));

  let persons = $state(normalize(initialData?.persons));
  let withPortraits = $state(initialData?.withPortraits || 0);
  let loading = $state(!initialData);
  let error = $state(null);
  let q = $state('');
  let imagesOnly = $state(false);
  let page = $state(0);
  let aiIds = $state(null);     // null = token mode; array = AI meaning-search results (relevance order)
  let aiBusy = $state(false);
  let selected = $state(null);
  // seeded deterministically for SSR (renders in static HTML); the client effect then rotates it randomly
  let heroSet = $state((initialData?.persons || []).filter((p) => p.hasPortrait).slice(0, 9));
  const byName = $derived(new Map(persons.map((p) => [fold(p.name), p])));

  // client-side fallback fetch only when the page wasn't prerendered with data
  $effect(() => {
    if (initialData) return;
    fetch(`${API}/api/graph/bio/persons`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => { persons = normalize(d.persons); withPortraits = d.withPortraits || 0; loading = false; })
      .catch((e) => { error = String(e); loading = false; });
  });

  // rotating decorative portrait band — a fresh random selection of portraits every few seconds, unrelated to search
  function pickHero() {
    const pool = persons.filter((p) => p.hasPortrait);
    if (!pool.length) { heroSet = []; return; }
    const n = Math.min(9, pool.length), idx = new Set();
    while (idx.size < n) idx.add(Math.floor(Math.random() * pool.length));
    heroSet = [...idx].map((i) => pool[i]);
  }
  $effect(() => { if (!persons.length) return; pickHero(); const t = setInterval(pickHero, 5000); return () => clearInterval(t); });
  $effect(() => { q; imagesOnly; page = 0; });
  const onType = () => { if (aiIds !== null) aiIds = null; };   // typing returns to instant token mode

  const matches = (p, qts) => qts.every((qt) => p._tok.some((ft) => ft.startsWith(qt) || qt.startsWith(ft)));
  const filtered = $derived.by(() => {
    if (aiIds !== null) return aiIds.map((id) => persons.find((p) => p.id === id)).filter(Boolean).filter((p) => !imagesOnly || p.hasPortrait);
    const qts = tokenize(q);
    return persons.filter((p) => (!imagesOnly || p.hasPortrait) && matches(p, qts));
  });
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const pageItems = $derived(filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE));
  const initials = (name) => fold(name).replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

  async function runAI() {
    const query = q.trim(); if (!query) { aiIds = null; return; }
    aiBusy = true;
    try { const r = await fetch(`${API}/api/graph/bio/search?q=${encodeURIComponent(query)}`); if (r.ok) { aiIds = (await r.json()).ids || []; } }
    catch (_) { /* ignore */ } finally { aiBusy = false; page = 0; }
  }
  async function open(p) {
    selected = { ...p };
    try { const r = await fetch(`${API}/api/graph/bio/person/${p.id}`); if (r.ok) selected = await r.json(); } catch (_) { /* keep light record */ }
  }
  function jumpTo(name) {
    const hit = byName.get(fold(name)) || persons.find((p) => fold(p.name).includes(fold(name)) || (p.aliases || []).some((a) => fold(a).includes(fold(name))));
    if (hit) open(hit);
  }
  const close = () => { selected = null; };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="archive">
  <header class="header">
    <p class="eyebrow">Entity Graph · Biographical Archive</p>
    <h1 class="title">The Cast of the Heroic Age</h1>
    <p class="lede">Every soul named in the founding histories of the Bábí and Bahá'í Faiths — kings and martyrs, scholars and villagers — drawn from the sacred texts, cross-referenced across the whole library, and bound together by kinship, allegiance, and recorded word.</p>
    <div class="method" aria-label="How the archive is built">
      <span class="m"><b>Seed</b><i>God Passes By</i></span><span class="arr">→</span>
      <span class="m"><b>Foundation</b><i>The Dawn-Breakers</i></span><span class="arr">→</span>
      <span class="m"><b>Pillars</b><i>Balyuzi · Taherzadeh · Mázandarání · Momen · Saiedi</i></span><span class="arr">→</span>
      <span class="m"><b>Expansion</b><i>the wider histories</i></span>
    </div>
    <p class="method-note">Each identity is first established from the authoritative <em>Seed</em>, given its narrative in the <em>Foundation</em>, then enriched and cross-checked against the scholarly <em>Pillars</em> — so that as the rest of the corpus is drawn in, every new mention docks onto a person already firmly known.</p>
  </header>

  {#if loading}
    <p class="status">Gathering the archive…</p>
  {:else if error}
    <p class="status error">The archive is unavailable ({error}).</p>
  {:else}
    {#if heroSet.length}
      <div class="hero" aria-hidden="true">
        {#each heroSet as p (p.id)}
          <button class="orb" onclick={() => open(p)} title={p.name} transition:fade={{ duration: 700 }}>
            <img src={heroImg(p.portrait)} alt={p.name} loading="lazy" />
          </button>
        {/each}
      </div>
    {/if}

    <div class="searchwrap">
      <div class="searchbar">
        <span class="mag" aria-hidden="true">⌕</span>
        <input class="search" type="search" bind:value={q} oninput={onType}
          onkeydown={(e) => e.key === 'Enter' && runAI()}
          placeholder="Search a name, alias or relationship — or ask, e.g. “letters of the living who recognized Bahá'u'lláh”" />
        <button class="askbtn" onclick={runAI} disabled={aiBusy} title="Search by meaning (AI)">{aiBusy ? '·····' : '✦ Ask'}</button>
      </div>
      <div class="subrow">
        <label class="toggle"><input type="checkbox" bind:checked={imagesOnly} /> Portraits only</label>
        <span class="resultline">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'soul' : 'souls'}{#if q || imagesOnly || aiIds !== null}{` of ${persons.length.toLocaleString()}`}{/if}</span>
        {#if aiIds !== null}<button class="clearai" onclick={() => { aiIds = null; }}>✦ meaning-search · show all</button>{/if}
      </div>
    </div>

    {#if filtered.length === 0}
      <p class="status">{aiBusy ? 'Consulting the archive…' : 'No one in the archive matches that search.'}</p>
    {:else}
      <div class="grid">
        {#each pageItems as p, i (p.id)}
          <button class="card" style={`animation-delay:${Math.min(i, 24) * 16}ms`} onclick={() => open(p)} animate:flip={{ duration: 260 }}>
            <span class="plate" class:empty={!p.portrait}>
              {#if p.portrait}<img src={cardImg(p.portrait)} alt={p.name} loading="lazy" />
              {:else}<span class="monogram">{initials(p.name)}</span>{/if}
            </span>
            <span class="card-body">
              <span class="name">{p.name}</span>
              {#if p.side}<span class="side">{p.side}</span>{/if}
              {#if p.summary}<span class="bio">{p.summary}</span>{/if}
              {#if p.kinship?.length}<span class="rel">{p.kinship.slice(0, 2).map((k) => `${k.relation}: ${k.who}`).join('  ·  ')}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      {#if pageCount > 1}
        <nav class="pager">
          <button onclick={() => (page = Math.max(0, page - 1))} disabled={page === 0}>← Prev</button>
          <span>Page {page + 1} / {pageCount}</span>
          <button onclick={() => (page = Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>Next →</button>
        </nav>
      {/if}
    {/if}
  {/if}

  {#if selected}
    <div class="scrim" onclick={close} role="presentation"></div>
    <aside class="drawer" aria-label={selected.name}>
      <button class="x" onclick={close} aria-label="Close">×</button>
      <div class="d-head">
        <span class="plate lg" class:empty={!selected.portrait}>
          {#if selected.portrait}<img src={drawerImg(selected.portrait)} alt={selected.name} />
          {:else}<span class="monogram">{initials(selected.name)}</span>{/if}
        </span>
        <h2 class="d-name">{selected.name}</h2>
        {#if selected.side}<span class="side">{selected.side}</span>{/if}
        {#if selected.aliases?.length}<p class="d-aliases">{selected.aliases.filter((a) => a !== selected.name).slice(0, 8).join(' · ')}</p>{/if}
      </div>
      {#if selected.summary}<p class="d-summary">{selected.summary}</p>{/if}
      {#if selected.kinship?.length || selected.relations?.length}
        <section class="d-sec"><h3>Relationships</h3>
          <div class="chips">
            {#each (selected.kinship || []) as k}<button class="chip" onclick={() => jumpTo(k.who)}><i>{k.relation}</i> {k.who}</button>{/each}
            {#each (selected.relations || []) as r}<button class="chip" onclick={() => jumpTo(r.who)}><i>{r.type}</i> {r.who}</button>{/each}
          </div>
        </section>
      {/if}
      {#if selected.facts?.length}
        <section class="d-sec"><h3>What the sources record</h3>
          <ul class="facts">{#each selected.facts as f}<li>{f.fact}{#if f.source}<span class="src">— {f.source}</span>{/if}</li>{/each}</ul>
        </section>
      {/if}
      {#if selected.possible_ids?.length}
        <section class="d-sec"><h3>Possible identifications</h3>
          <ul class="facts faint">{#each selected.possible_ids as f}<li>possibly {f.maybe}{#if f.authority}<span class="src">— per {f.authority}</span>{/if}</li>{/each}</ul>
        </section>
      {/if}
      {#if selected.contested?.length}
        <section class="d-sec"><h3>Contested</h3>
          <ul class="facts faint">{#each selected.contested as c}<li>{c.point}{#if c.versions} — {c.versions}{/if}</li>{/each}</ul>
        </section>
      {/if}
      {#if selected.books?.length}
        <section class="d-sec"><h3>Appears in <span class="muted">({selected.mentionCount} mentions)</span></h3>
          <p class="books">{selected.books.slice(0, 14).join(' · ')}</p>
        </section>
      {/if}
      {#if selected.wiki}
        <section class="d-sec"><h3>Beyond the corpus</h3>
          {#if selected.wiki.extract}<p class="d-summary faint">{selected.wiki.extract}</p>{/if}
          <p><a href={selected.wiki.url} target="_blank" rel="noopener" class="link">Wikipedia →</a>
          {#if selected.wiki.license}<span class="cred">portrait: {selected.wiki.license}{#if selected.wiki.credit} · {selected.wiki.credit}{/if}</span>{/if}</p>
        </section>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .archive { max-width: 78rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; }
  .header { text-align: center; max-width: 46rem; margin: 0 auto 1.5rem; }
  .eyebrow { font-size: .72rem; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin: 0 0 .75rem; }
  .title { font-family: 'Amiri', Georgia, serif; font-size: clamp(2.1rem, 5vw, 3.4rem); line-height: 1.05; color: var(--text-primary); margin: 0; font-weight: 700; }
  .lede { color: var(--text-secondary); margin: 1rem auto 0; line-height: 1.7; max-width: 40rem; }
  .method { display: flex; flex-wrap: wrap; gap: .5rem .75rem; justify-content: center; align-items: center; margin: 1.5rem auto 0; }
  .method .m { display: flex; flex-direction: column; line-height: 1.15; }
  .method .m b { font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
  .method .m i { font-style: normal; font-size: .8rem; color: var(--text-secondary); }
  .method .arr { color: var(--text-muted); opacity: .5; }
  .method-note { font-size: .82rem; color: var(--text-muted); line-height: 1.6; margin: 1rem auto 0; max-width: 42rem; }
  .method-note em { color: var(--text-secondary); font-style: normal; font-weight: 600; }
  .status { text-align: center; color: var(--text-muted); padding: 4rem 0; } .status.error { color: var(--error); }

  /* rotating decorative portrait band */
  .hero { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; min-height: 4.5rem; margin: 1.5rem 0 1.75rem; }
  .orb { position: relative; width: 4.25rem; height: 4.25rem; border-radius: 50%; overflow: hidden; padding: 0; border: 2px solid var(--surface-3); background: var(--surface-2); cursor: pointer; box-shadow: 0 4px 12px rgb(0 0 0 / .15); animation: floaty 6s ease-in-out infinite; transition: border-color .3s, box-shadow .3s, filter .3s; }
  .orb:nth-child(even) { width: 5.25rem; height: 5.25rem; }
  .orb:nth-child(3n) { animation-duration: 7.4s; } .orb:nth-child(3n+1) { animation-duration: 5.3s; } .orb:nth-child(4n) { animation-delay: -2s; }
  .orb:hover { border-color: var(--accent); box-shadow: 0 10px 24px rgb(0 0 0 / .3); filter: brightness(1.06); animation-play-state: paused; z-index: 1; }
  .orb img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .orb:hover img { transform: scale(1.09); }
  @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

  /* one large centred search; subrow holds toggle + count so the input never shifts on typing */
  .searchwrap { max-width: 40rem; margin: 0 auto 2rem; }
  .searchbar { display: flex; align-items: center; gap: .5rem; background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; padding: .35rem .35rem .35rem 1.1rem; box-shadow: 0 6px 20px rgb(0 0 0 / .08); transition: border-color .2s, box-shadow .2s; }
  .searchbar:focus-within { border-color: var(--accent); box-shadow: 0 8px 26px rgb(0 0 0 / .14); }
  .mag { color: var(--text-muted); font-size: 1.25rem; }
  .search { flex: 1; border: none; background: none; color: var(--text-primary); font-size: 1.05rem; padding: .65rem .25rem; outline: none; }
  .askbtn { flex: 0 0 auto; border: none; background: var(--accent); color: #fff; font-size: .85rem; font-weight: 600; padding: .6rem 1.1rem; border-radius: 999px; cursor: pointer; white-space: nowrap; }
  .askbtn:disabled { opacity: .6; cursor: wait; }
  .subrow { display: flex; align-items: center; justify-content: center; gap: 1.25rem; margin-top: .85rem; flex-wrap: wrap; }
  .toggle { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--text-secondary); cursor: pointer; }
  .resultline { font-size: .8rem; color: var(--text-muted); letter-spacing: .03em; }
  .clearai { border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); background: none; color: var(--accent); font-size: .78rem; padding: .25rem .7rem; border-radius: 999px; cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 1rem; }
  .card { display: flex; gap: 1rem; text-align: left; padding: .9rem; border: 1px solid var(--border-subtle); border-radius: .85rem; background: var(--surface-1); cursor: pointer; transition: transform .2s, border-color .2s, box-shadow .2s; opacity: 0; animation: rise .5s ease forwards; }
  .card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 10px 28px rgb(0 0 0 / .14); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .plate { flex: 0 0 auto; width: 5.25rem; height: 5.25rem; border-radius: .6rem; overflow: hidden; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border-subtle), inset 0 0 0 4px var(--surface-1); }
  .plate img { width: 100%; height: 100%; object-fit: cover; }
  .plate.empty { background: radial-gradient(circle at 30% 25%, var(--surface-3), var(--surface-2)); display: flex; align-items: center; justify-content: center; }
  .monogram { font-family: 'Amiri', serif; font-size: 1.6rem; color: var(--text-muted); }
  .plate.lg { width: 9rem; height: 9rem; border-radius: .8rem; }
  .card-body { min-width: 0; display: flex; flex-direction: column; gap: .25rem; }
  .name { font-family: 'Amiri', serif; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
  .side { align-self: flex-start; font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 1rem; padding: .05rem .55rem; }
  .bio { font-size: .85rem; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .rel { font-size: .74rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pager { display: flex; gap: 1.25rem; align-items: center; justify-content: center; margin-top: 2.5rem; color: var(--text-muted); font-size: .85rem; }
  .pager button { padding: .55rem 1.1rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-1); color: var(--text-primary); cursor: pointer; }
  .pager button:disabled { opacity: .4; cursor: default; }

  /* drawer — above the site navbar */
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .5); backdrop-filter: blur(2px); z-index: 998; animation: fade .25s ease; }
  @keyframes fade { from { opacity: 0; } }
  .drawer { position: fixed; top: 0; right: 0; height: 100dvh; width: min(34rem, 94vw); background: var(--surface-0); border-left: 1px solid var(--border); box-shadow: -20px 0 50px rgb(0 0 0 / .3); z-index: 999; overflow-y: auto; padding: 2rem 1.75rem 4rem; animation: slide .3s cubic-bezier(.2,.8,.2,1); }
  @keyframes slide { from { transform: translateX(100%); } }
  .x { position: sticky; top: 0; float: right; width: 2rem; height: 2rem; border: none; background: var(--surface-2); border-radius: 50%; color: var(--text-secondary); font-size: 1.3rem; line-height: 1; cursor: pointer; }
  .d-head { text-align: center; margin-bottom: 1.5rem; }
  .d-head .plate { margin: 0 auto .9rem; }
  .d-name { font-family: 'Amiri', serif; font-size: 1.8rem; color: var(--text-primary); margin: 0 0 .5rem; line-height: 1.15; }
  .d-head .side { display: inline-block; }
  .d-aliases { font-size: .8rem; color: var(--text-muted); margin: .6rem 0 0; line-height: 1.5; }
  .d-summary { color: var(--text-secondary); line-height: 1.7; margin: 0 0 1.5rem; }
  .d-summary.faint { font-size: .85rem; color: var(--text-muted); }
  .d-sec { margin-bottom: 1.5rem; }
  .d-sec h3 { font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin: 0 0 .7rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: .35rem; }
  .d-sec h3 .muted { color: var(--text-muted); text-transform: none; letter-spacing: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: .5rem; }
  .chip { font-size: .8rem; padding: .3rem .7rem; border-radius: 1rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); cursor: pointer; }
  .chip:hover { border-color: var(--accent); background: var(--surface-2); }
  .chip i { color: var(--text-muted); font-style: normal; font-size: .72rem; }
  .facts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .55rem; }
  .facts li { font-size: .87rem; color: var(--text-secondary); line-height: 1.55; padding-left: .9rem; border-left: 2px solid var(--border-subtle); }
  .facts.faint li { color: var(--text-muted); }
  .src { color: var(--text-muted); font-size: .76rem; font-style: italic; }
  .books { font-size: .85rem; color: var(--text-secondary); line-height: 1.6; }
  .link { color: var(--accent); font-size: .85rem; } .link:hover { color: var(--accent-hover); }
  .cred { display: block; font-size: .7rem; color: var(--text-muted); margin-top: .35rem; }
  @media (max-width: 640px) { .plate { width: 4.25rem; height: 4.25rem; } .search { font-size: .95rem; } }

  /* slick entrance + ambient motion (CSS-only, runs on the static SSR HTML before hydration) */
  @keyframes fadeup { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  .eyebrow, .title, .lede, .method, .method-note, .hero, .searchwrap { opacity: 0; animation: fadeup .7s cubic-bezier(.2,.8,.2,1) forwards; }
  .title { animation-delay: .05s; } .lede { animation-delay: .14s; } .method { animation-delay: .22s; }
  .method-note { animation-delay: .3s; } .hero { animation-delay: .36s; } .searchwrap { animation-delay: .46s; }
  .plate img { transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .card:hover .plate img { transform: scale(1.07); }
  .d-sec, .d-summary, .d-head { opacity: 0; animation: fadeup .5s ease forwards; }
  .d-head { animation-delay: .02s; } .d-summary { animation-delay: .08s; }
  .d-sec:nth-of-type(1) { animation-delay: .12s; } .d-sec:nth-of-type(2) { animation-delay: .18s; }
  .d-sec:nth-of-type(3) { animation-delay: .24s; } .d-sec:nth-of-type(4) { animation-delay: .3s; }
  .d-sec:nth-of-type(5) { animation-delay: .36s; }
  @media (prefers-reduced-motion: reduce) { *, .card, .orb { animation: none !important; } }
</style>
