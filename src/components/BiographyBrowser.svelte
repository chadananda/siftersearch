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
  const drawerImg = (p) => ikUrl(p, 'w-340,h-420,fo-face,q-85');   // fixed 3:4 face-crop → reserved box, no reflow

  // SSG: the page prerenders with initialData baked in (instant paint), then this island hydrates into search
  const { initialData = null } = $props();
  // fold away diacritics AND apostrophes entirely so transliteration variants collapse to one skeleton:
  // Ni'matu'lláh / Nimatu'lláh / Ni'matu'lláhi all → "nimatullah"(+i), then bidirectional prefix-match unifies them
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, '').toLowerCase();
  const tokenize = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
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
  let aiReasoning = $state(null);  // { summary, evidence: {id: why} } — the AI's answer + per-person evidence
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
  function ensureHero() {
    const pool = persons.filter((p) => p.hasPortrait);
    const n = Math.min(9, pool.length); if (!pool.length || heroSet.length >= n) return;
    const seen = new Set(heroSet.map((p) => p.id)); const out = [...heroSet];
    while (out.length < n) { const p = pool[Math.floor(Math.random() * pool.length)]; if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } }
    heroSet = out;
  }
  function rotateOne() {        // swap a single slot for a fresh portrait — gentle, continuous, no reflow
    const pool = persons.filter((p) => p.hasPortrait);
    if (pool.length <= heroSet.length) return;
    const shown = new Set(heroSet.map((p) => p.id));
    const cand = pool.filter((p) => !shown.has(p.id)); if (!cand.length) return;
    const copy = [...heroSet];
    copy[Math.floor(Math.random() * copy.length)] = cand[Math.floor(Math.random() * cand.length)];
    heroSet = copy;
  }
  $effect(() => { if (!persons.length) return; ensureHero(); const t = setInterval(rotateOne, 2600); return () => clearInterval(t); });
  $effect(() => { q; imagesOnly; page = 0; });
  const onType = () => { if (aiIds !== null) { aiIds = null; aiReasoning = null; } };   // typing returns to instant token mode
  const clearSearch = () => { q = ''; aiIds = null; aiReasoning = null; page = 0; };

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
    try { const r = await fetch(`${API}/api/graph/bio/search?q=${encodeURIComponent(query)}`); if (r.ok) { const d = await r.json(); aiIds = d.ids || []; aiReasoning = d.reasoning || null; } }
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
  {#if heroSet.length}
    <div class="hero" aria-hidden="true">
      {#each heroSet as p, idx (idx)}
        <button class="orb" onclick={() => open(p)} title={p.name} aria-label={p.name}>
          {#key p.id}<img src={heroImg(p.portrait)} alt={p.name} loading="lazy" transition:fade={{ duration: 600 }} />{/key}
        </button>
      {/each}
    </div>
  {/if}
  <header class="header">
    <h1 class="title">The Cast of the Heroic Age</h1>
    <p class="method"><b>Seed</b> God Passes By <i>→</i> <b>Foundation</b> The Dawn-Breakers <i>→</i> <b>Pillars</b> Balyuzi · Taherzadeh · Mázandarání · Momen · Saiedi</p>
    <a class="approach" href="/docs/research-strategy">How this archive is built — the entity-extraction approach <span aria-hidden="true">→</span></a>
  </header>

  {#if loading}
    <p class="status">Gathering the archive…</p>
  {:else if error}
    <p class="status error">The archive is unavailable ({error}).</p>
  {:else}
    <div class="searchwrap">
      <div class="searchbar" class:busy={aiBusy}>
        {#if aiBusy}<span class="scan-layer" aria-hidden="true"><span class="scan"></span></span>{/if}
        <span class="mag" class:thinking={aiBusy} aria-hidden="true">{#if aiBusy}✦{:else}⌕{/if}</span>
        <input class="search" type="search" bind:value={q} oninput={onType} enterkeyhint="search"
          onkeydown={(e) => e.key === 'Enter' && runAI()}
          placeholder="Search a name — or ask “letters of the living”…" />
        {#if q}<button class="clearx" onclick={clearSearch} aria-label="Clear search" title="Clear">✕</button>{/if}
        <button class="askbtn" onclick={runAI} disabled={aiBusy} title="Ask AI to find people by meaning">
          {#if aiBusy}<span class="dots"><i></i><i></i><i></i></span><span class="ask-tx">Thinking</span>{:else}<span class="ask-ico" aria-hidden="true">✦</span><span class="ask-tx">Ask&nbsp;AI</span>{/if}
        </button>
      </div>
      <div class="subrow">
        <label class="toggle"><input type="checkbox" bind:checked={imagesOnly} /> Portraits only</label>
        <span class="resultline">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'soul' : 'souls'}{#if q || imagesOnly || aiIds !== null}{` of ${persons.length.toLocaleString()}`}{/if}</span>
        {#if aiIds !== null}<button class="clearai" onclick={() => { aiIds = null; }}>✦ meaning-search · show all</button>{/if}
      </div>
    </div>

    {#if aiIds !== null && aiReasoning?.summary}
      <div class="ai-answer" transition:fade={{ duration: 250 }}>
        <span class="ai-spark" aria-hidden="true">✦</span>
        <p>{aiReasoning.summary}</p>
      </div>
    {/if}

    {#if filtered.length === 0}
      <p class="status">{aiBusy ? 'Consulting the archive…' : 'No one in the archive matches that search.'}</p>
    {:else}
      <div class="grid">
        {#each pageItems as p, i (p.id)}
          <button class="card" style={`animation-delay:${Math.min(i, 24) * 16}ms`} onclick={() => open(p)} animate:flip={{ duration: 260 }}>
            <span class="plate" class:empty={!p.portrait}>
              <span class="monogram">{initials(p.name)}</span>
              {#if p.portrait}<img src={cardImg(p.portrait)} alt={p.name} loading="lazy" />{/if}
            </span>
            <span class="card-body">
              <span class="name">{p.name}</span>
              {#if p.side}<span class="side">{p.side}</span>{/if}
              {#if aiReasoning?.evidence?.[p.id]}<span class="evidence">✦ {aiReasoning.evidence[p.id]}</span>{/if}
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
          <span class="monogram">{initials(selected.name)}</span>
          {#if selected.portrait}<img src={drawerImg(selected.portrait)} alt={selected.name} />{/if}
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
  .archive { max-width: 78rem; margin: 0 auto; padding: 1.35rem 1.25rem 4rem; }
  .header { text-align: center; max-width: 48rem; margin: 0 auto .75rem; }
  .eyebrow { font-size: .68rem; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin: 0 0 .4rem; }
  .title { font-family: 'Amiri', Georgia, serif; font-size: clamp(1.6rem, 4vw, 2.4rem); line-height: 1.05; color: var(--text-primary); margin: 0; font-weight: 700; }
  .lede { color: var(--text-secondary); margin: .5rem auto 0; line-height: 1.5; max-width: 40rem; font-size: .9rem; }
  .method { font-size: .76rem; color: var(--text-muted); margin: .35rem auto 0; max-width: 46rem; line-height: 1.6; }
  .method b { color: var(--accent); font-weight: 600; }
  .method i { font-style: normal; color: var(--text-muted); opacity: .45; padding: 0 .15rem; }
  .method-note { font-size: .82rem; color: var(--text-muted); line-height: 1.6; margin: 1rem auto 0; max-width: 42rem; }
  .method-note em { color: var(--text-secondary); font-style: normal; font-weight: 600; }
  .status { text-align: center; color: var(--text-muted); padding: 4rem 0; } .status.error { color: var(--error); }

  /* rotating decorative portrait band */
  .hero { display: flex; gap: .8rem; justify-content: center; flex-wrap: wrap; margin: .75rem 0 .9rem; }
  .orb { position: relative; width: 3.3rem; height: 3.3rem; border-radius: 50%; overflow: hidden; padding: 0; border: 2px solid var(--surface-3); background: var(--surface-2); cursor: pointer; box-shadow: 0 4px 12px rgb(0 0 0 / .15); animation: floaty 6s ease-in-out infinite; transition: border-color .3s, box-shadow .3s, filter .3s; }
  .orb:nth-child(even) { width: 3.9rem; height: 3.9rem; }
  .orb:nth-child(3n) { animation-duration: 7.4s; } .orb:nth-child(3n+1) { animation-duration: 5.3s; } .orb:nth-child(4n) { animation-delay: -2s; }
  .orb:hover { border-color: var(--accent); box-shadow: 0 10px 24px rgb(0 0 0 / .3); filter: brightness(1.06); animation-play-state: paused; z-index: 1; }
  .orb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .orb:hover img { transform: scale(1.09); }
  @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

  /* one large centred search; subrow holds toggle + count so the input never shifts on typing */
  .searchwrap { max-width: 40rem; margin: .25rem auto 1.5rem; }
  .approach { display: inline-block; margin-top: .5rem; font-size: .76rem; color: var(--accent); text-decoration: none; opacity: .85; transition: opacity .2s; }
  .approach:hover { opacity: 1; text-decoration: underline; }

  .searchbar { position: relative; display: flex; align-items: center; gap: .4rem; background: linear-gradient(var(--surface-1), color-mix(in srgb, var(--surface-1) 88%, var(--surface-2))); border: 1.5px solid color-mix(in srgb, var(--accent) 38%, var(--border)); border-radius: 999px; padding: .3rem .4rem .3rem .9rem; box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent), 0 1px 2px rgb(0 0 0 / .12), 0 12px 30px -10px color-mix(in srgb, var(--accent) 30%, transparent); transition: border-color .25s, box-shadow .25s, transform .25s; }
  .searchbar:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
  .searchbar:focus-within { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent), 0 16px 38px -10px color-mix(in srgb, var(--accent) 45%, transparent), 0 2px 6px rgb(0 0 0 / .14); }
  /* AI thinking: a conic-gradient halo orbiting the whole bar — the "radically cool" signal */
  .searchbar.busy { border-color: transparent; box-shadow: 0 0 26px -2px color-mix(in srgb, var(--accent) 45%, transparent); }
  .searchbar.busy::before { content: ''; position: absolute; inset: -2.5px; border-radius: inherit; z-index: -1; background: conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--accent) 25%, transparent) 35deg, var(--accent) 95deg, color-mix(in srgb, var(--accent) 55%, #fff) 140deg, var(--accent) 185deg, transparent 250deg, transparent 360deg); animation: bio-orbit 1.2s linear infinite; }

  .mag { color: var(--accent); font-size: 1.7rem; line-height: 1; display: inline-flex; width: 2rem; height: 2rem; align-items: center; justify-content: center; flex: 0 0 auto; }
  .mag.thinking { animation: bio-sparkle 1.5s ease-in-out infinite; filter: drop-shadow(0 0 7px color-mix(in srgb, var(--accent) 65%, transparent)); }
  .search { flex: 1; min-width: 0; border: none; background: none; color: var(--text-primary); font-size: 1.05rem; padding: .7rem .25rem; outline: none; }
  .search::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
  .clearx { flex: 0 0 auto; width: 2.15rem; height: 2.15rem; border: none; border-radius: 50%; background: var(--surface-2); color: var(--text-muted); font-size: .92rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background .2s, color .2s; }
  .clearx:hover { background: color-mix(in srgb, var(--accent) 18%, var(--surface-2)); color: var(--accent); }
  .askbtn { flex: 0 0 auto; border: none; background: var(--accent); color: #fff; font-size: .9rem; font-weight: 600; min-height: 2.6rem; padding: 0 1.15rem; border-radius: 999px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: .4rem; box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--accent) 60%, transparent); transition: filter .15s, transform .1s; }
  .askbtn:hover { filter: brightness(1.08); } .askbtn:active { transform: scale(.97); }
  .askbtn:disabled { cursor: wait; }
  .ask-ico { font-size: 1rem; }
  /* AI activity: sweeping beam inside the bar + pulsing dots on the button */
  .scan-layer { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
  .scan { position: absolute; inset: 0; width: 40%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 26%, transparent), transparent); animation: bio-scan 1.15s ease-in-out infinite; }
  .dots { display: inline-flex; gap: .22rem; align-items: center; }
  .dots i { width: .34rem; height: .34rem; border-radius: 50%; background: #fff; animation: bio-bounce 1s ease-in-out infinite; }
  .dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
  @keyframes bio-orbit { to { transform: rotate(360deg); } }
  @keyframes bio-sparkle { 0%, 100% { transform: scale(1) rotate(0); opacity: .85; } 50% { transform: scale(1.28) rotate(18deg); opacity: 1; } }
  @keyframes bio-scan { 0% { transform: translateX(-110%); } 100% { transform: translateX(360%); } }
  @keyframes bio-bounce { 0%, 80%, 100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-.18rem); } }
  @media (prefers-reduced-motion: reduce) { .scan, .dots i, .mag.thinking, .searchbar.busy::before { animation: none; } }
  @media (max-width: 480px) { .ask-tx { display: none; } .askbtn { padding: 0 .85rem; min-height: 2.5rem; } .mag { font-size: 1.5rem; width: 1.8rem; } }
  .subrow { display: flex; align-items: center; justify-content: center; gap: 1.25rem; margin-top: .85rem; flex-wrap: wrap; }
  .toggle { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--text-secondary); cursor: pointer; }
  .resultline { font-size: .8rem; color: var(--text-muted); letter-spacing: .03em; }
  .clearai { border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); background: none; color: var(--accent); font-size: .78rem; padding: .25rem .7rem; border-radius: 999px; cursor: pointer; }
  /* AI answer banner (the reasoning) + per-card evidence chips */
  .ai-answer { display: flex; gap: .7rem; align-items: flex-start; max-width: 52rem; margin: 0 auto 1.25rem; padding: .85rem 1.15rem; border-radius: .85rem; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 13%, var(--surface-1)), var(--surface-1)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle)); box-shadow: 0 8px 24px -12px color-mix(in srgb, var(--accent) 55%, transparent); }
  .ai-answer .ai-spark { color: var(--accent); font-size: 1.2rem; line-height: 1.45; flex: 0 0 auto; }
  .ai-answer p { margin: 0; font-size: .96rem; line-height: 1.5; color: var(--text-primary); }
  .evidence { font-size: .8rem; line-height: 1.35; color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent); border-radius: .4rem; padding: .2rem .5rem; align-self: flex-start; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 1rem; }
  .card { display: flex; gap: 1rem; text-align: left; padding: .9rem; border: 1px solid var(--border-subtle); border-radius: .85rem; background: var(--surface-1); cursor: pointer; transition: transform .2s, border-color .2s, box-shadow .2s; opacity: 0; animation: rise .5s ease forwards; }
  .card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 10px 28px rgb(0 0 0 / .14); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  /* always a fixed, pre-sized box: monogram placeholder centred, image absolutely overlaid → never reflows */
  .plate { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 5.25rem; height: 5.25rem; border-radius: .6rem; overflow: hidden; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border-subtle), inset 0 0 0 4px var(--surface-1); }
  .plate img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .plate.empty { background: radial-gradient(circle at 30% 25%, var(--surface-3), var(--surface-2)); }
  .monogram { font-family: 'Amiri', serif; font-size: 1.6rem; color: var(--text-muted); }
  .plate.lg { width: 9.5rem; height: 11.75rem; border-radius: .8rem; }
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
  .x { position: absolute; top: .9rem; right: .9rem; z-index: 5; width: 2.1rem; height: 2.1rem; border: none; background: var(--surface-2); border-radius: 50%; color: var(--text-secondary); font-size: 1.4rem; line-height: 1; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / .2); transition: background .2s, color .2s; }
  .x:hover { background: var(--surface-3); color: var(--text-primary); }
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
