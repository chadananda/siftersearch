<script>
  // The Archive of Souls — a scholarly-archival browser of the people in the entity graph: searchable by
  // name / alias / relationship, faceted by allegiance, portrait-forward, with a detail drawer that exposes
  // the full dossier (relationships, cross-corpus reach, sourced provenance). Deps: PUBLIC_API_URL. Svelte 5.
  const API = import.meta.env.PUBLIC_API_URL || '';
  const PER_PAGE = 60;

  let persons = $state([]);
  let sides = $state([]);
  let withPortraits = $state(0);
  let loading = $state(true);
  let error = $state(null);

  let q = $state('');
  let side = $state('');
  let imagesOnly = $state(false);
  let sort = $state('importance');
  let page = $state(0);

  let selected = $state(null);   // detail record in the drawer
  let detailLoading = $state(false);

  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, "'").toLowerCase();
  const byName = new Map();

  $effect(() => {
    fetch(`${API}/api/graph/bio/persons`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => {
        persons = d.persons || []; sides = d.sides || []; withPortraits = d.withPortraits || 0; loading = false;
        for (const p of persons) byName.set(fold(p.name), p);
      })
      .catch((e) => { error = String(e); loading = false; });
  });
  $effect(() => { q; side; imagesOnly; sort; page = 0; });

  const matches = (p, n) => !n || fold(p.name).includes(n)
    || (p.aliases || []).some((a) => fold(a).includes(n))
    || (p.kinship || []).some((k) => fold(k.who).includes(n) || fold(k.relation).includes(n));

  const filtered = $derived.by(() => {
    const n = fold(q.trim());
    let list = persons.filter((p) => (!imagesOnly || p.hasPortrait) && (!side || p.side === side) && matches(p, n));
    if (sort === 'name') list = [...list].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
    else if (sort === 'connections') list = [...list].sort((a, b) => (b.kinship?.length || 0) - (a.kinship?.length || 0));
    return list;
  });
  const featured = $derived(persons.filter((p) => p.hasPortrait && p.importance >= 70).slice(0, 8));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const pageItems = $derived(filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE));

  const initials = (name) => fold(name).replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

  async function open(p) {
    selected = { id: p.id, name: p.name, importance: p.importance, side: p.side, portrait: p.portrait, aliases: p.aliases, kinship: p.kinship, summary: p.summary };
    detailLoading = true;
    try {
      const r = await fetch(`${API}/api/graph/bio/person/${p.id}`);
      if (r.ok) selected = await r.json();
    } catch (_) { /* keep the light record */ }
    detailLoading = false;
  }
  function jumpTo(name) {
    const hit = byName.get(fold(name)) || persons.find((p) => fold(p.name).includes(fold(name)) || (p.aliases || []).some((a) => fold(a).includes(fold(name))));
    if (hit) open(hit);
  }
  function close() { selected = null; }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="archive">
  <!-- scope header -->
  <header class="header">
    <p class="eyebrow">Entity Graph · Biographical Archive</p>
    <h1 class="title">The Cast of the Heroic Age</h1>
    <p class="lede">
      Every soul named in the founding histories of the Bábí and Bahá'í Faiths — kings and martyrs, scholars and
      villagers — drawn from the sacred texts, cross-referenced across the whole library, and bound together by
      kinship, allegiance, and recorded word.
    </p>
    {#if !loading && !error}
      <div class="stats">
        <span><b>{persons.length.toLocaleString()}</b> people</span>
        <span><b>{withPortraits}</b> portraits</span>
        <span><b>{sides.length}</b> allegiances</span>
      </div>
    {/if}
  </header>

  {#if loading}
    <p class="status">Gathering the archive…</p>
  {:else if error}
    <p class="status error">The archive is unavailable ({error}).</p>
  {:else}
    {#if featured.length && !q && !side && !imagesOnly}
      <section class="luminaries" aria-label="Foremost figures">
        {#each featured as p (p.id)}
          <button class="lum" onclick={() => open(p)}>
            <span class="lum-frame"><img src={`${API}${p.portrait}`} alt={p.name} loading="lazy" /></span>
            <span class="lum-name">{p.name}</span>
          </button>
        {/each}
      </section>
    {/if}

    <!-- controls -->
    <div class="controls">
      <input class="search" type="search" bind:value={q} placeholder="Search by name, title, alias, or relationship…" />
      <div class="facets">
        <select bind:value={side} class="sel" aria-label="Allegiance">
          <option value="">All allegiances</option>
          {#each sides as s}<option value={s}>{s}</option>{/each}
        </select>
        <select bind:value={sort} class="sel" aria-label="Sort">
          <option value="importance">Most significant</option>
          <option value="connections">Most connected</option>
          <option value="name">By name</option>
        </select>
        <label class="toggle"><input type="checkbox" bind:checked={imagesOnly} /> Portraits only</label>
      </div>
    </div>
    <p class="resultline">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'soul' : 'souls'}{#if q || side || imagesOnly} of {persons.length.toLocaleString()}{/if}</p>

    {#if filtered.length === 0}
      <p class="status">No one in the archive matches that search.</p>
    {:else}
      <div class="grid">
        {#each pageItems as p, i (p.id)}
          <button class="card" style={`animation-delay:${Math.min(i, 24) * 18}ms`} onclick={() => open(p)}>
            <span class="plate" class:empty={!p.portrait}>
              {#if p.portrait}<img src={`${API}${p.portrait}`} alt={p.name} loading="lazy" />
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

  <!-- detail drawer -->
  {#if selected}
    <div class="scrim" onclick={close} role="presentation"></div>
    <aside class="drawer" aria-label={selected.name}>
      <button class="x" onclick={close} aria-label="Close">×</button>
      <div class="d-head">
        <span class="plate lg" class:empty={!selected.portrait}>
          {#if selected.portrait}<img src={`${API}${selected.portrait}`} alt={selected.name} />
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
          <p class="books">{selected.books.slice(0, 12).join(' · ')}</p>
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
  .archive { --ink: var(--text-primary); max-width: 78rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; }
  .header { text-align: center; max-width: 46rem; margin: 0 auto 2.5rem; }
  .eyebrow { font-size: .72rem; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin: 0 0 .75rem; }
  .title { font-family: 'Amiri', Georgia, serif; font-size: clamp(2.1rem, 5vw, 3.4rem); line-height: 1.05; color: var(--text-primary); margin: 0; font-weight: 700; }
  .lede { color: var(--text-secondary); margin: 1rem auto 0; line-height: 1.7; max-width: 40rem; }
  .stats { display: flex; gap: 2rem; justify-content: center; margin-top: 1.5rem; font-size: .85rem; color: var(--text-muted); }
  .stats b { font-family: 'Amiri', serif; font-size: 1.35rem; color: var(--text-primary); display: block; }
  .status { text-align: center; color: var(--text-muted); padding: 4rem 0; } .status.error { color: var(--error); }

  .luminaries { display: flex; gap: 1.25rem; overflow-x: auto; padding: .5rem .25rem 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); scrollbar-width: thin; }
  .lum { background: none; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: .6rem; flex: 0 0 auto; width: 7rem; }
  .lum-frame { width: 6rem; height: 6rem; border-radius: 50%; overflow: hidden; border: 2px solid var(--surface-3); box-shadow: 0 4px 14px rgb(0 0 0 / .18); transition: transform .25s, border-color .25s; }
  .lum:hover .lum-frame { transform: translateY(-3px) scale(1.03); border-color: var(--accent); }
  .lum-frame img { width: 100%; height: 100%; object-fit: cover; }
  .lum-name { font-family: 'Amiri', serif; font-size: .82rem; color: var(--text-secondary); text-align: center; line-height: 1.2; }

  .controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; position: sticky; top: 0; z-index: 5; padding: .85rem 0; background: color-mix(in srgb, var(--surface-0) 92%, transparent); backdrop-filter: blur(8px); }
  .search { flex: 1 1 22rem; padding: .7rem 1rem; border-radius: .6rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: .95rem; }
  .search:focus { outline: none; border-color: var(--accent); }
  .facets { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
  .sel { padding: .65rem .75rem; border-radius: .6rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font-size: .85rem; }
  .toggle { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
  .resultline { font-size: .78rem; color: var(--text-muted); margin: .5rem 0 1.25rem; letter-spacing: .04em; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 1rem; }
  .card { display: flex; gap: 1rem; text-align: left; padding: .9rem; border: 1px solid var(--border-subtle); border-radius: .85rem; background: var(--surface-1); cursor: pointer; transition: transform .2s, border-color .2s, box-shadow .2s; opacity: 0; animation: rise .5s ease forwards; }
  .card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 10px 28px rgb(0 0 0 / .14); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .plate { flex: 0 0 auto; width: 5.25rem; height: 5.25rem; border-radius: .6rem; overflow: hidden; background: var(--surface-2); position: relative; box-shadow: inset 0 0 0 1px var(--border-subtle), inset 0 0 0 4px var(--surface-1); }
  .plate img { width: 100%; height: 100%; object-fit: cover; }
  .plate.empty { background: radial-gradient(circle at 30% 25%, var(--surface-3), var(--surface-2)); display: flex; align-items: center; justify-content: center; }
  .monogram { font-family: 'Amiri', serif; font-size: 1.6rem; color: var(--text-muted); letter-spacing: .03em; }
  .plate.lg { width: 9rem; height: 9rem; border-radius: .8rem; }

  .card-body { min-width: 0; display: flex; flex-direction: column; gap: .25rem; }
  .name { font-family: 'Amiri', serif; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
  .side { align-self: flex-start; font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 1rem; padding: .05rem .55rem; }
  .bio { font-size: .85rem; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .rel { font-size: .74rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pager { display: flex; gap: 1.25rem; align-items: center; justify-content: center; margin-top: 2.5rem; color: var(--text-muted); font-size: .85rem; }
  .pager button { padding: .55rem 1.1rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-1); color: var(--text-primary); cursor: pointer; }
  .pager button:disabled { opacity: .4; cursor: default; }

  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .45); backdrop-filter: blur(2px); z-index: 40; animation: fade .25s ease; }
  @keyframes fade { from { opacity: 0; } }
  .drawer { position: fixed; top: 0; right: 0; height: 100dvh; width: min(34rem, 94vw); background: var(--surface-0); border-left: 1px solid var(--border); box-shadow: -20px 0 50px rgb(0 0 0 / .3); z-index: 41; overflow-y: auto; padding: 2rem 1.75rem 4rem; animation: slide .3s cubic-bezier(.2,.8,.2,1); }
  @keyframes slide { from { transform: translateX(100%); } }
  .x { position: absolute; top: 1rem; right: 1rem; width: 2rem; height: 2rem; border: none; background: var(--surface-2); border-radius: 50%; color: var(--text-secondary); font-size: 1.3rem; line-height: 1; cursor: pointer; }
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
  .chip { font-size: .8rem; padding: .3rem .7rem; border-radius: 1rem; border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); cursor: pointer; transition: border-color .2s, background .2s; }
  .chip:hover { border-color: var(--accent); background: var(--surface-2); }
  .chip i { color: var(--text-muted); font-style: normal; font-size: .72rem; }
  .facts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .55rem; }
  .facts li { font-size: .87rem; color: var(--text-secondary); line-height: 1.55; padding-left: .9rem; border-left: 2px solid var(--border-subtle); }
  .facts.faint li { color: var(--text-muted); }
  .src { color: var(--text-muted); font-size: .76rem; font-style: italic; }
  .books { font-size: .85rem; color: var(--text-secondary); line-height: 1.6; }
  .link { color: var(--accent); font-size: .85rem; } .link:hover { color: var(--accent-hover); }
  .cred { display: block; font-size: .7rem; color: var(--text-muted); margin-top: .35rem; }
  @media (max-width: 640px) { .card { flex-direction: row; } .plate { width: 4.25rem; height: 4.25rem; } }
</style>
