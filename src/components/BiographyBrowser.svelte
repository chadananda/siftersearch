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
  // phonetic skeleton: collapse digraphs (sh/kh/gh…), drop vowels + semivowels, collapse doubled letters → so
  // transliteration variants share a key (Sadiq/Sadeq→sdq, Muhammad/Mohammad→mhmd, Ṭáhirih/Tahereh→thrh,
  // Ni'matu'lláh/Nimatu'lláh→nmtlh). Recall-first round for instant search; literal matches still rank above.
  const phon = (t) => t.replace(/sh/g, '$').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/ch/g, 'c').replace(/zh/g, 'j').replace(/th/g, 't').replace(/dh/g, 'd').replace(/ph/g, 'f').replace(/[aeiouwy]/g, '').replace(/(.)\1+/g, '$1');
  const phons = (toks) => [...new Set(toks.map(phon).filter((s) => s.length > 1))];
  const normalize = (list) => (list || []).map((p) => {
    const idToks = [...new Set([...tokenize(p.name), ...(p.aliases || []).flatMap(tokenize), ...(p.kinship || []).flatMap((k) => tokenize(k.who))])];
    const allToks = [...new Set([...idToks, ...(p.kinship || []).flatMap((k) => tokenize(k.relation)), ...tokenize(p.side || ''), ...tokenize(p.summary || '')])];
    return { ...p, _tok: allToks, _phon: phons(idToks) };   // phonetic only on identity tokens (names/aliases/kin), not summary
  });

  const peopleOf = (d) => d?.people || d?.persons || [];   // official API returns {people}; tolerate legacy {persons}
  let persons = $state(normalize(peopleOf(initialData)));
  let withPortraits = $state(initialData?.withPortraits || 0);
  let loading = $state(!initialData);
  let error = $state(null);
  let q = $state('');
  let books = $state(initialData?.books || []);   // [{key,label,count}] — source-book facets
  let filter = $state(null);                       // single active view filter: null | 'image' | <book key>
  let page = $state(0);
  let aiIds = $state(null);     // null = token mode; array = AI meaning-search results (relevance order)
  let aiBusy = $state(false);
  let aiReasoning = $state(null);  // { summary (integrated markdown explanation), evidence: {id} } — the AI's answer
  let aiError = $state(null);      // surfaced when a meaning-search fetch fails (never silent)
  let showProgress = $state(false), progress = $state(null);   // book-integration roadmap popup
  // Progress display: smooth, monotonic, honest, and BOUNDED. Between polls simPct eases from the last real reading
  // toward it + ONE poll's expected gain (learned as an EMA of recent per-poll gains), reaching it over ~one poll
  // interval then holding for the next real sample. It can never overshoot beyond one poll's gain — so a legitimate
  // large jump (resume / re-weight) re-anchors WITHOUT being read as huge velocity (the old bug that ran it to 99).
  // A real stall decays the gain → the bar honestly stops. A transient missing poll HOLDS (never resets to 0).
  const POLL_MS = 6000;
  let simPct = $state(0);
  let _simDoc = null, _lastReal = 0, _lastRealT = 0, _gainEMA = 0, _pollEMA = POLL_MS, _nulls = 0;
  async function fetchProgress() {
    try {
      const r = await fetch(`${API}/api/v1/people/progress`); if (!r.ok) return;
      progress = await r.json();
      const a = progress?.active, now = Date.now();
      if (!a) { if (++_nulls >= 3) { simPct = 0; _simDoc = null; _gainEMA = 0; } return; } // sustained null = idle; else HOLD
      _nulls = 0;
      const p = a.percent ?? 0;
      if (a.docId !== _simDoc) {                       // new book → anchor; no gain learned yet
        _simDoc = a.docId; simPct = p; _lastReal = p; _lastRealT = now; _gainEMA = 0; _pollEMA = POLL_MS;
      } else {
        const gain = p - _lastReal, gap = Math.max(1, now - _lastRealT);
        if (gain > 12) { simPct = Math.max(simPct, p); }   // big jump (resume/re-weight) → re-anchor, DON'T learn velocity
        else {
          _pollEMA = _pollEMA * 0.7 + gap * 0.3;
          _gainEMA = _gainEMA * 0.6 + Math.max(0, gain) * 0.4;   // smoothed per-poll forward gain (decays on a stall)
          simPct = Math.max(simPct, p);                          // catch up to real, monotonic
        }
        _lastReal = p; _lastRealT = now;
      }
    } catch { /* offline — modal shows a note */ }
  }
  function openProgress() { showProgress = true; if (!progress) fetchProgress(); }
  // The progress panel is PERSISTENT (a collapsed side rail): fetch on mount and poll so it always shows a live
  // book count + the grounding book, whether the panel is open or not.
  $effect(() => {
    if (typeof window === 'undefined') return;
    fetchProgress();
    const poll = setInterval(fetchProgress, POLL_MS);
    // Ease from the last real reading toward (real + one poll's expected gain) across one poll interval, then hold.
    // Bounded by construction — never runs away; monotonic; clamped to 99.
    const sim = setInterval(() => {
      if (!progress?.active) return;
      const frac = Math.min(1, (Date.now() - _lastRealT) / Math.max(1000, _pollEMA));
      const target = Math.min(99, _lastReal + _gainEMA * frac);
      if (target > simPct) simPct = target;
    }, 100);
    return () => { clearInterval(poll); clearInterval(sim); };
  });
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n ?? 0));
  // Per-stage human copy: a TITLE + one-line purpose, plus the verb+noun for the live task line ("Reconciled X / Y
  // name-clusters"). "stage 4/11" tells the user nothing; this says what the phase is and what it's doing right now.
  const STAGE_INFO = {
    disambiguate: { title: 'Disambiguating text', desc: 'Reading each paragraph in context to pin down who and what every name refers to', verb: 'Disambiguated', noun: 'paragraphs' },
    mentions: { title: 'Extracting mentions', desc: 'Collecting every name, title and epithet the text mentions', verb: 'Scanned', noun: 'paragraphs' },
    claims: { title: 'Extracting claims', desc: 'Pulling cited facts about each person, place and work out of the text', verb: 'Processed', noun: 'paragraphs' },
    reconcile: { title: 'Reconciling identities', desc: 'Matching each name to a known person by evidence — or proposing a new one', verb: 'Reconciled', noun: 'name-clusters' },
    research: { title: 'Researching unresolved', desc: 'Resolving uncertain identities against the wider corpus and the web', verb: 'Researched', noun: 'uncertain names' },
    project: { title: 'Linking entities', desc: 'Applying the resolved identities into the entity graph', verb: 'Applied', noun: 'decisions' },
    link: { title: 'Linking claims', desc: 'Binding each extracted fact to its resolved entity', verb: 'Linked', noun: 'claims' },
    merge: { title: 'Merging duplicates', desc: 'Consolidating same-name entities the evidence shows are one person', verb: 'Reviewed', noun: 'name-groups' },
    dedup: { title: 'De-duplicating', desc: 'Guarding each new entity against existing duplicates by its facts', verb: 'Checked', noun: 'new entities' },
    hype: { title: 'Generating questions', desc: 'Writing the questions each paragraph answers, for retrieval search', verb: 'Generated', noun: 'paragraphs' },
    verify: { title: 'Verifying', desc: 'Confirming the book is fully grounded and searchable', verb: 'Verifying', noun: 'checks' },
    grounding: { title: 'Grounding', desc: 'Processing the book', verb: 'Processed', noun: 'items' },
  };
  const stageInfo = (s) => STAGE_INFO[s] || STAGE_INFO.grounding;
  const stageLabel = (s) => stageInfo(s).title;
  // Live task line: verb + real absolute counts (e.g. "Reconciled 1,664 / 6,533 name-clusters · 25%"); falls back
  // to the stage purpose when the stage reports no item count (the quick bookkeeping stages).
  const taskLine = $derived.by(() => {
    const a = progress?.active; if (!a) return '';
    const info = stageInfo(a.stage);
    if (a.stageTotal) {
      const pct = Math.round(((a.stageDone || 0) / a.stageTotal) * 100);
      return `${info.verb} ${(a.stageDone || 0).toLocaleString()} / ${a.stageTotal.toLocaleString()} ${info.noun} · ${pct}%`;
    }
    return info.desc;
  });
  const stageDesc = $derived(progress?.active ? stageInfo(progress.active.stage).desc : '');
  // Collapsible phases: the phase being processed (or the frontier) auto-opens; the user can toggle any.
  const activePhaseKey = $derived(progress?.active ? (progress.phases.find((p) => p.books.some((b) => b.id === progress.active.docId))?.key ?? null) : null);
  // Overall progress = completed books + the active book's own fraction, as a 0–100 percent (drives the collapsed rail fill).
  const overallPct = $derived(progress ? Math.min(100, ((progress.doneBooks + (progress.active ? simPct : 0) / 100) / Math.max(1, progress.totalBooks)) * 100) : 0);
  const frontierKey = $derived(progress ? (progress.phases.find((p) => (p.done ?? 0) < (p.total ?? 0))?.key ?? progress.phases[0]?.key ?? null) : null);
  let openSet = $state(null); // null = auto (follow active/frontier); becomes a Set once the user toggles
  const openKeys = $derived(openSet ?? new Set([activePhaseKey ?? frontierKey].filter(Boolean)));
  function togglePhase(key) { const s = new Set(openKeys); s.has(key) ? s.delete(key) : s.add(key); openSet = s; }
  // Period-tree sub-groups (e.g. Pilgrim Notes by era) — collapsed by default, since they're numerous.
  let openGroups = $state(new Set());
  function toggleGroup(phaseKey, label) { const k = `${phaseKey}:${label}`; const s = new Set(openGroups); s.has(k) ? s.delete(k) : s.add(k); openGroups = s; }
  // render the integrated explanation: escape HTML, then turn [text](url) into a source link (the evidence is woven inline)
  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mdLinks = (s) => escHtml(s).replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="ai-cite-in">$1</a>');
  let selected = $state(null);
  // seeded deterministically for SSR (renders in static HTML); the client effect then rotates it randomly
  let heroSet = $state(peopleOf(initialData).filter((p) => p.hasPortrait).slice(0, 9));
  const byName = $derived(new Map(persons.map((p) => [fold(p.name), p])));

  // client-side fallback fetch only when the page wasn't prerendered with data
  $effect(() => {
    if (initialData) return;
    fetch(`${API}/api/v1/people?limit=2000`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => { persons = normalize(peopleOf(d)); withPortraits = d.withPortraits || 0; books = d.books || []; loading = false; })
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
  $effect(() => { q; filter; page = 0; });
  const onType = () => { aiError = null; if (aiIds !== null) { aiIds = null; aiReasoning = null; } };   // typing returns to instant token mode
  const clearSearch = () => { q = ''; aiIds = null; aiReasoning = null; aiError = null; page = 0; };
  // example queries that show off the meaning-search (each verified to return a strong, evidenced set)
  const SAMPLES = [
    'Letters of the Living who died at Shaykh Ṭabarsí',
    'Letters of the Living who met Bahá’u’lláh',
    'the Seven Martyrs of Ṭihrán',
    'kings who received Bahá’u’lláh’s tablets',
    'officials who persecuted the Bábís',
    'the first Western pilgrims to ‘Akká',
  ];
  // defer the search a tick so the click handler returns + Svelte settles before the async fetch (avoids any
  // teardown race from the samples row hiding on the same click)
  const runSample = (query) => { q = query; aiBusy = true; queueMicrotask(runAI); };   // mark busy now so the grid never flashes literal matches before runAI
  const setFilter = (f) => { filter = filter === f ? null : f; };   // single-select: choosing one clears the rest
  const passesFilter = (p) => filter === null || (filter === 'image' ? p.hasPortrait : p.sources?.includes(filter));

  const litMatch = (p, qts) => qts.every((qt) => p._tok.some((ft) => ft.startsWith(qt) || qt.startsWith(ft)));
  const phonMatch = (p, qps) => qps.every((qp) => p._phon.some((fp) => fp.startsWith(qp) || qp.startsWith(fp)));
  const filtered = $derived.by(() => {
    if (aiIds !== null) return aiIds.map((id) => persons.find((p) => p.id === id)).filter(Boolean).filter(passesFilter);
    if (aiBusy) return [];   // AI search in flight — show the loader, not an intermediate flash of literal name-matches
    const base = persons.filter(passesFilter);
    const qts = tokenize(q);
    if (!qts.length) return base;
    const qps = qts.map(phon).filter((s) => s.length > 1);
    const lit = [], pho = [];   // literal matches first, phonetic-only variants after (each kept importance-sorted)
    for (const p of base) { if (litMatch(p, qts)) lit.push(p); else if (qps.length && phonMatch(p, qps)) pho.push(p); }
    return [...lit, ...pho];
  });
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const pageItems = $derived(filtered.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE));
  const initials = (name) => fold(name).replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

  async function runAI() {
    const query = q.trim(); if (!query) { aiIds = null; return; }
    aiBusy = true; aiError = null;
    try {
      const r = await fetch(`${API}/api/v1/people/search?q=${encodeURIComponent(query)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      aiIds = d.ids || []; aiReasoning = d.reasoning || null;
      if (d.error) aiError = 'The archive is busy — try again in a moment.';
    } catch (_) { aiError = 'Search is temporarily unavailable — please try again.'; aiIds = null; }
    finally { aiBusy = false; page = 0; }
  }
  async function open(p) {
    selected = { ...p };
    try { const r = await fetch(`${API}/api/v1/people/${p.id}`); if (r.ok) selected = await r.json(); } catch (_) { /* keep light record */ }
  }
  function jumpTo(name) {
    const hit = byName.get(fold(name)) || persons.find((p) => fold(p.name).includes(fold(name)) || (p.aliases || []).some((a) => fold(a).includes(fold(name))));
    if (hit) open(hit);
  }
  const close = () => { selected = null; };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="archive">
  {#if !showProgress}
    <!-- Collapsed state of the progress sidebar: a standard collapsible-sidebar rail docked to the top-right side.
         A little info (souls + overall %, live book % when grounding) + a clear ‹ arrow to expand into the full drawer. -->
    <button class="prog-rail" class:active={!!progress?.active} onclick={openProgress}
      title={progress?.active ? `Grounding ${progress.active.title} — click to expand` : 'Library progress — click to expand'}
      aria-label="Expand library progress panel">
      <span class="prog-rail-track" aria-hidden="true"><span class="prog-rail-fill" style="height:{overallPct.toFixed(1)}%"></span></span>
      <span class="prog-rail-arrow" aria-hidden="true">‹</span>
      <span class="prog-rail-num">{progress ? (progress.cumulativeUnique ?? 0).toLocaleString() : '·'}</span>
      <span class="prog-rail-cap">souls</span>
      {#if progress?.active}
        <span class="prog-rail-live"><span class="prog-rail-dot" aria-hidden="true"></span>{simPct.toFixed(1)}%</span>
      {:else if progress}
        <span class="prog-rail-books">{progress.doneBooks}/{progress.totalBooks}</span>
      {/if}
    </button>
  {/if}
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
      <div class="filters" role="group" aria-label="Filter the cast">
        <button class="chip" class:on={filter === 'image'} onclick={() => setFilter('image')} title="Only people with a portrait"><span class="dot" aria-hidden="true"></span>With portrait</button>
        {#each books as b (b.key)}
          <button class="chip" class:on={filter === b.key} onclick={() => setFilter(b.key)} disabled={!b.count}
            title={b.count ? `${b.count} people appear in ${b.label}` : `${b.label} — not yet processed`}>
            <span class="dot" aria-hidden="true"></span>{b.label}{#if b.count}<span class="chip-n">{b.count.toLocaleString()}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="subrow">
        <span class="resultline">{filtered.length.toLocaleString()} {filtered.length === 1 ? 'soul' : 'souls'}{#if q || filter || aiIds !== null}{` of ${persons.length.toLocaleString()}`}{/if}</span>
      </div>
      <div class="samples" class:hidden={!!q.trim() || aiIds !== null || aiBusy}>
        <span class="samples-lead">✦ Ask the archive — try:</span>
        {#each SAMPLES as s}<button class="sample" onclick={() => runSample(s)}>{s}</button>{/each}
      </div>
      {#if aiError}<p class="ai-error">{aiError}</p>{/if}
    </div>

    <!-- Persistent right-hand progress panel: a slim edge-tab when collapsed, a full drawer when expanded. -->
    {#if showProgress}
      <aside class="prog-panel">
        <div class="prog-scrim" onclick={() => (showProgress = false)} role="presentation" transition:fade={{ duration: 150 }}></div>
        <div class="prog-drawer" role="dialog" aria-modal="true" aria-label="Library integration progress" transition:fade={{ duration: 150 }}>
          <button class="prog-close" onclick={() => (showProgress = false)} aria-label="Close panel" title="Close">✕</button>
          <h2 class="prog-title">Absorbing the history</h2>
          {#if progress}
            <p class="prog-lead"><strong>{(progress.cumulativeUnique ?? 0).toLocaleString()}</strong> distinct people grounded so far <span class="prog-sub">· {progress.doneBooks}/{progress.totalBooks} books{#if progress.totalParas} · {fmtK(progress.totalParas)} paragraphs{/if}</span> — toward <em>all history absorbed</em>.</p>
            {#if progress.active}
              <div class="prog-active">
                <span class="prog-active-dot" aria-hidden="true"></span>
                <div class="prog-active-body">
                  <div class="prog-active-line">Now grounding <strong>{progress.active.title}</strong></div>
                  <div class="prog-active-stage"><strong>{stageLabel(progress.active.stage)}</strong> — {stageDesc}<span class="prog-active-step">{#if progress.active.stageIndex != null} · step {progress.active.stageIndex + 1} of {progress.active.totalStages}{/if}</span></div>
                  <div class="prog-active-task">{taskLine}</div>
                  {#if progress.active.percent != null}<div class="prog-active-bar"><span style="width:{simPct}%"></span></div>{/if}
                </div>
                {#if progress.active.percent != null}<span class="prog-active-pct">{simPct.toFixed(1)}%</span>{/if}
              </div>
            {/if}
            <p class="prog-fine">Per-book <span class="pb-new">+N</span> = people first grounded there; ¶ = size in paragraphs. The book being grounded shows a live progress bar. Click a phase to expand.</p>
            {#each progress.phases as ph (ph.key)}
              {@const isOpen = openKeys.has(ph.key)}
              <section class="prog-phase" class:upcoming={ph.upcoming} class:open={isOpen} class:isactive={ph.key === activePhaseKey}>
                <button class="prog-phase-h" onclick={() => togglePhase(ph.key)} aria-expanded={isOpen}>
                  <span class="prog-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  <span class="prog-phase-label">{ph.label}</span>
                  <span class="prog-phase-count">{ph.done}/{ph.total}{#if ph.paras} · {fmtK(ph.paras)}¶{/if}</span>
                </button>
                {#if isOpen}
                  <div class="prog-phase-body">
                    <p class="prog-blurb">{ph.blurb}</p>
                    <ul class="prog-books">
                      {#each ph.books as b (b.id)}
                        <li class="prog-book" class:done={b.done} class:active={progress.active && b.id === progress.active.docId}>
                          <span class="prog-tick" aria-hidden="true">{b.done ? '✓' : (progress.active && b.id === progress.active.docId) ? '◐' : ph.upcoming ? '·' : '○'}</span>
                          <span class="prog-book-title">{b.title}</span>
                          <span class="col-size">
                            {#if progress.active && b.id === progress.active.docId && progress.active.percent != null}
                              <span class="pbp-track" title="{stageLabel(progress.active.stage)}"><span class="pbp-fill" style="width:{simPct}%"></span></span><span class="pbp-pct">{simPct.toFixed(1)}%</span>
                            {:else if b.size}<span class="pb-num" title="{b.size.toLocaleString()} paragraphs">{fmtK(b.size)}</span>{/if}
                          </span>
                          <span class="col-new" title="people first grounded via this book">{#if b.done && b.newInSequence}+{b.newInSequence.toLocaleString()}{/if}</span>
                          <span class="col-un" title="mentioned here but not yet resolved — revisited as later books are absorbed">{#if b.done && b.unresolved}{b.unresolved.toLocaleString()}?{/if}</span>
                        </li>
                      {/each}
                      {#if ph.books.length === 0 && !ph.groups}<li class="prog-empty">Catalog pending classification…</li>{/if}
                    </ul>
                    {#if ph.groups}
                      {#each ph.groups as g (g.label)}
                        {@const gOpen = openGroups.has(ph.key + ':' + g.label)}
                        <div class="prog-group" class:open={gOpen}>
                          <button class="prog-group-h" onclick={() => toggleGroup(ph.key, g.label)} aria-expanded={gOpen}>
                            <span class="prog-caret" aria-hidden="true">{gOpen ? '▾' : '▸'}</span>
                            <span class="prog-group-label">{g.label}</span>
                            <span class="prog-group-count">{g.done}/{g.total}{#if g.paras} · {fmtK(g.paras)}¶{/if}</span>
                          </button>
                          {#if gOpen}
                            <ul class="prog-books prog-subbooks">
                              {#each g.books as b (b.id)}
                                <li class="prog-book" class:done={b.done}>
                                  <span class="prog-tick" aria-hidden="true">{b.done ? '✓' : '·'}</span>
                                  <span class="prog-book-title">{b.title}</span>
                                  <span class="col-size">{#if b.size}<span class="pb-num" title="{b.size.toLocaleString()} paragraphs">{fmtK(b.size)}</span>{/if}</span>
                                  <span class="col-new"></span><span class="col-un"></span>
                                </li>
                              {/each}
                            </ul>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </section>
            {/each}
          {:else}
            <p class="prog-lead">Loading the roadmap…</p>
          {/if}
        </div>
      </aside>
    {/if}

    {#if aiIds !== null && aiReasoning}
      <div class="ai-answer" transition:fade={{ duration: 250 }}>
        <span class="ai-spark" aria-hidden="true">✦</span>
        <div class="ai-body">
          {#if aiReasoning.summary}<p class="ai-head">{@html mdLinks(aiReasoning.summary)}</p>{/if}
        </div>
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
      <!-- 'Possible identifications' (possible_ids) removed from the public view: they were speculative same-name
           guesses that ignored the nisba and produced absurd cross-nisba conflations (e.g. -i-Yazdí ≠ -i-Turshízí). -->

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
      <!-- Removed: mention→paragraph "In God Passes By" refs were unreliable — a mention does not mean the
           paragraph is about the person, and shared names (Ásíyih→Pharaoh's wife, Navváb→an adversary) polluted
           the links. To be replaced by disambiguation-aware, precisely-excerpted characterizations. -->
      {#if selected.characterizations?.length}
        <section class="d-sec"><h3>Facts &amp; connections <span class="muted">(cited)</span></h3>
          <ul class="facts2">
            {#each selected.characterizations as c}
              <li>
                <span class="f-stmt">{c.quote}</span>{#if c.url}<a class="f-cite" href={c.url} target="_blank" rel="noopener">{c.cite || c.source} →</a>{:else}<span class="f-cite">{c.cite || c.source}</span>{/if}
                {#if c.proof}<span class="f-proof">“{c.proof}”</span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if selected.wiki}
        <section class="d-sec"><h3>Beyond the corpus</h3>
          {#if selected.wiki.extract}<p class="d-summary faint">{selected.wiki.extract}</p>{/if}
          <p><a href={selected.wiki.url} target="_blank" rel="noopener" class="link">Wikipedia →</a>
          {#if selected.wiki.license}<span class="cred">portrait: {selected.wiki.license}{#if selected.wiki.credit} · {selected.wiki.credit}{/if}</span>{/if}</p>
        </section>
      {/if}
      {#if selected.death?.cause}
        <section class="d-sec"><h3>Passing</h3>
          <p class="d-death" class:martyr={selected.death.martyr}>{selected.death.martyr ? '☠ Martyred' : '†'} {selected.death.cause}{#if selected.death.place} at {selected.death.place}{/if}{#if selected.death.year}, {selected.death.year}{/if}{#if selected.death.source}<span class="src"> · {selected.death.source}</span>{/if}</p>
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
  .searchbar.busy { border-color: transparent; box-shadow: 0 0 16px -6px color-mix(in srgb, var(--accent) 40%, transparent); }
  /* animated conic border glow — MASKED to the border RING only (padding-box XOR border-box), so it glows at the
     edges and never bleeds through the bar's translucent (—surface-1 = 80% opaque) center. */
  .searchbar.busy::before { content: ''; position: absolute; inset: -1.5px; border-radius: inherit; padding: 2.5px;
    background: conic-gradient(from var(--bio-angle), transparent 0deg, color-mix(in srgb, var(--accent) 20%, transparent) 40deg, var(--accent) 110deg, color-mix(in srgb, var(--accent) 70%, #fff) 150deg, var(--accent) 190deg, transparent 250deg, transparent 360deg);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; animation: bio-orbit 1.2s linear infinite; }

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
  /* spin the conic gradient's start angle, NOT the pseudo-element itself — rotating a pill-shaped
     box sweeps a search-bar silhouette through the background; rotating the angle keeps the halo pinned */
  @property --bio-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
  @keyframes bio-orbit { to { --bio-angle: 360deg; } }
  @keyframes bio-sparkle { 0%, 100% { transform: scale(1) rotate(0); opacity: .85; } 50% { transform: scale(1.28) rotate(18deg); opacity: 1; } }
  @keyframes bio-scan { 0% { transform: translateX(-110%); } 100% { transform: translateX(360%); } }
  @keyframes bio-bounce { 0%, 80%, 100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-.18rem); } }
  @media (prefers-reduced-motion: reduce) { .scan, .dots i, .mag.thinking, .searchbar.busy::before { animation: none; } }
  @media (max-width: 480px) { .ask-tx { display: none; } .askbtn { padding: 0 .85rem; min-height: 2.5rem; } .mag { font-size: 1.5rem; width: 1.8rem; } }
  .subrow { display: flex; align-items: center; justify-content: center; gap: 1.25rem; margin-top: .85rem; flex-wrap: wrap; }
  .toggle { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--text-secondary); cursor: pointer; }
  /* source-book / image filter chips */
  .filters { display: flex; flex-wrap: wrap; justify-content: center; gap: .35rem; margin-top: .7rem; }
  .chip { display: inline-flex; align-items: center; gap: .3rem; font-size: .72rem; font-weight: 500; color: var(--text-secondary); background: var(--surface-1); border: 1px solid var(--border-subtle); border-radius: 999px; padding: .22rem .6rem; cursor: pointer; transition: background .18s, border-color .18s, color .18s; }
  .chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); color: var(--text-primary); }
  .chip.on { background: color-mix(in srgb, var(--accent) 16%, var(--surface-1)); border-color: var(--accent); color: var(--accent); }
  .chip:disabled { opacity: .4; cursor: not-allowed; }
  .chip .dot { width: .42rem; height: .42rem; border-radius: 50%; border: 1.5px solid currentColor; opacity: .5; flex: 0 0 auto; }
  .chip.on .dot { background: var(--accent); border-color: var(--accent); opacity: 1; }
  .chip-n { font-size: .62rem; opacity: .75; background: color-mix(in srgb, var(--text-muted) 20%, transparent); border-radius: 999px; padding: 0 .3rem; }
  .resultline { font-size: .8rem; color: var(--text-muted); letter-spacing: .03em; }
  .clearai { border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); background: none; color: var(--accent); font-size: .78rem; padding: .25rem .7rem; border-radius: 999px; cursor: pointer; }
  /* sample-query chips (shown when idle) — teach users the meaning-search */
  .samples { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .5rem; margin-top: 1rem; }
  .samples-lead { font-size: .76rem; color: var(--text-muted); letter-spacing: .04em; width: 100%; text-align: center; margin-bottom: .15rem; }
  .sample { font-size: .8rem; color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-1)); border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-subtle)); border-radius: 999px; padding: .42rem .85rem; cursor: pointer; transition: background .18s, border-color .18s, transform .1s; }
  .sample:hover { background: color-mix(in srgb, var(--accent) 16%, var(--surface-1)); border-color: var(--accent); }
  .sample:active { transform: scale(.97); }
  .samples.hidden { display: none; }
  .ai-error { margin: .75rem auto 0; max-width: 40rem; font-size: .85rem; color: var(--error); text-align: center; }
  /* death line — on cards and in the drawer (martyrs accented) */
  .death { font-size: .78rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: .15rem; }
  .death.martyr { color: var(--error); }
  .d-death { margin: 0 0 .6rem; font-size: .9rem; font-weight: 600; color: var(--text-secondary); }
  .d-death.martyr { color: var(--error); }
  .d-death .src { font-weight: 400; color: var(--text-muted); font-size: .8rem; }
  /* AI answer banner (the reasoning) + per-card evidence chips */
  .ai-answer { display: flex; gap: .7rem; align-items: flex-start; max-width: 52rem; margin: 0 auto 1.25rem; padding: .85rem 1.15rem; border-radius: .85rem; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 13%, var(--surface-1)), var(--surface-1)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-subtle)); box-shadow: 0 8px 24px -12px color-mix(in srgb, var(--accent) 55%, transparent); }
  .ai-answer .ai-spark { color: var(--accent); font-size: 1.2rem; line-height: 1.45; flex: 0 0 auto; }
  .ai-answer p { margin: 0; font-size: .96rem; line-height: 1.5; color: var(--text-primary); }
  .ai-body { flex: 1; min-width: 0; }
  .ai-head { margin: 0 0 .55rem; font-size: .95rem; line-height: 1.5; color: var(--text-primary); font-weight: 600; }
  .ai-evi { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .45rem; }
  .ai-evi li { font-size: .86rem; line-height: 1.5; color: var(--text-secondary); }
  .ai-name { border: none; background: none; padding: 0; color: var(--accent); font-weight: 600; cursor: pointer; font-size: inherit; }
  .ai-name:hover { text-decoration: underline; }
  .ai-cite { color: var(--accent); text-decoration: none; font-weight: 600; margin-left: .25rem; white-space: nowrap; }
  .ai-cite:hover { text-decoration: underline; }
  /* Citation links are injected via {@html mdLinks()}; Svelte can't add its scope-hash to injected nodes, so a plain
     scoped `.ai-cite-in` rule never matches them and they render as unstyled (invisible) text. Target them with
     :global under the scoped .ai-head so they read clearly as links. */
  .ai-head :global(.ai-cite-in) { color: var(--accent); font-weight: 500; text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent); text-underline-offset: 2px;
    border-radius: .2rem; padding: 0 .1rem; transition: background-color .15s, text-decoration-color .15s; }
  .ai-head :global(.ai-cite-in:hover) { text-decoration-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, transparent); }
  .ai-src { color: var(--text-muted); font-size: .72rem; margin-left: .25rem; }
  .facts2 { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .7rem; }
  .facts2 li { font-size: .85rem; line-height: 1.55; color: var(--text-secondary); }
  .f-stmt { color: var(--text-primary); }
  .f-proof { display: block; margin-top: .25rem; padding-left: .6rem; border-left: 2px solid var(--border); color: var(--text-muted); font-size: .78rem; font-style: italic; line-height: 1.5; }
  .f-cite { float: right; margin-left: .6rem; color: var(--accent); text-decoration: none; font-size: .7rem; font-weight: 600; white-space: nowrap; }
  .f-cite:hover { text-decoration: underline; }

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
  .refs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .6rem; }
  .refs li { display: flex; flex-direction: column; gap: .15rem; }
  .ref-link { color: var(--accent); text-decoration: none; font-size: .82rem; font-weight: 600; align-self: flex-start; }
  .ref-link:hover { text-decoration: underline; }
  .ref-snip { color: var(--text-secondary); font-size: .8rem; line-height: 1.45; font-style: italic; }
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

  /* ── Library-integration progress popup ─────────────────────────────── */
  /* Persistent progress panel. Collapsed = a slim edge-tab; expanded = a SOLID drawer above the navbar with a
     dimming backdrop (click-outside to close) so page content never bleeds through or sits under the nav. */
  .prog-panel { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
  .prog-panel > * { pointer-events: auto; }
  /* Collapsed progress = a standard collapsible-sidebar rail docked to the top-right side, below the sticky navbar (z 100).
     Little info (souls + overall %, live book % when grounding) + a clear ‹ arrow; click expands to the full drawer. */
  .prog-rail { position: fixed; top: 4.4rem; right: 0; z-index: 45;
    display: flex; flex-direction: column; align-items: center; gap: .18rem;
    min-width: 3.9rem; padding: .55rem .5rem .7rem; cursor: pointer; overflow: hidden;
    background: light-dark(#f8fafc, #1e293b); color: var(--text-secondary);
    border: 1px solid var(--border); border-right: none; border-radius: .85rem 0 0 .85rem;
    box-shadow: -6px 8px 24px rgb(0 0 0 / .18);
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, color .18s ease; }
  .prog-rail:hover { transform: translateX(-3px); border-color: var(--accent); color: var(--text-primary);
    box-shadow: -8px 10px 28px rgb(0 0 0 / .26); }
  /* overall-progress fill along the rail's left edge (bottom → top) */
  .prog-rail-track { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--surface-3); }
  .prog-rail-fill { position: absolute; left: 0; right: 0; bottom: 0;
    background: linear-gradient(0deg, var(--accent), color-mix(in oklab, var(--accent) 35%, transparent));
    transition: height .7s cubic-bezier(.2, .8, .2, 1); }
  .prog-rail-arrow { font-size: 1.25rem; line-height: 1; font-weight: 700; color: var(--accent); }
  .prog-rail-num { margin-top: .2rem; font-size: .98rem; font-weight: 700; line-height: 1; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .prog-rail-cap { font-size: .56rem; text-transform: uppercase; letter-spacing: .09em; color: var(--text-muted); }
  .prog-rail-books { margin-top: .18rem; font-size: .64rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .prog-rail-live { display: flex; align-items: center; gap: .22rem; margin-top: .22rem;
    font-size: .62rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
  .prog-rail-dot { width: .42rem; height: .42rem; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
  /* Active = accent ring + pulsing live-dot + glowing arrow. */
  .prog-rail.active { border-color: color-mix(in oklab, var(--accent) 50%, var(--border)); }
  .prog-rail.active .prog-rail-dot { animation: progpulse 1.6s ease-in-out infinite; }
  .prog-rail.active .prog-rail-arrow { animation: railglow 2.4s ease-in-out infinite; }
  @keyframes railglow { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .prog-rail.active .prog-rail-dot, .prog-rail.active .prog-rail-arrow { animation: none; } }
  .prog-scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .5); backdrop-filter: blur(2px); }
  .prog-drawer { position: absolute; top: 0; right: 0; height: 100dvh; width: min(34rem, 94vw); overflow-y: auto; overscroll-behavior: contain;
    background: light-dark(#f8fafc, #1e293b); border-left: 1px solid var(--border); box-shadow: -24px 0 60px rgb(0 0 0 / .5);
    padding: 1.8rem 1.5rem 3rem; }
  .prog-close { position: absolute; top: .9rem; right: .9rem; width: 2.2rem; height: 2.2rem; border: none; border-radius: 50%;
    background: var(--surface-2); color: var(--text-primary); cursor: pointer; font-size: 1rem; line-height: 1;
    box-shadow: 0 2px 8px rgb(0 0 0 / .25); transition: background .18s, color .18s; }
  .prog-close:hover { background: var(--accent); color: #fff; }
  .prog-title { font-family: 'Amiri', Georgia, serif; font-size: 1.5rem; margin: 0 2rem .2rem 0; color: var(--text-primary); }
  .prog-lead { font-size: .85rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 1.1rem; }
  .prog-lead strong { color: var(--accent); }
  .prog-sub { color: var(--text-muted); font-weight: normal; }
  .prog-fine { font-size: .72rem; color: var(--text-muted); line-height: 1.4; margin: 0 0 1rem; opacity: .85; }
  .prog-fine em { font-style: italic; color: var(--text-secondary); }
  /* live active-book banner */
  .prog-active { display: flex; align-items: center; gap: .6rem; margin: 0 0 1.1rem; padding: .55rem .7rem;
    background: var(--surface-2); border: 1px solid var(--accent); border-radius: .6rem; }
  .prog-active-dot { flex: 0 0 auto; width: .55rem; height: .55rem; border-radius: 50%; background: var(--accent);
    animation: progpulse 1.6s ease-in-out infinite; }
  @keyframes progpulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.72); } }
  .prog-active-body { flex: 1; min-width: 0; }
  .prog-active-line { font-size: .82rem; color: var(--text-secondary); }
  .prog-active-line strong { color: var(--text-primary); }
  .prog-active-meta { font-size: .72rem; color: var(--text-muted); margin-top: .1rem; font-variant-numeric: tabular-nums; }
  .prog-active-stage { font-size: .74rem; color: var(--text-secondary); margin-top: .28rem; line-height: 1.35; }
  .prog-active-stage strong { color: var(--text-primary); }
  .prog-active-step { color: var(--text-muted); }
  .prog-active-task { font-size: .74rem; color: var(--accent); margin-top: .18rem; font-variant-numeric: tabular-nums; }
  .prog-active-bar { height: .28rem; background: var(--surface-3); border-radius: 1rem; margin-top: .4rem; overflow: hidden; }
  .prog-active-bar span { display: block; height: 100%; background: var(--accent); border-radius: 1rem; transition: width .3s linear; }
  .prog-active-pct { flex: 0 0 auto; font-size: .95rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }

  /* collapsible phases */
  .prog-phase { margin-bottom: .35rem; padding-left: .9rem; border-left: 2px solid var(--border); }
  .prog-phase.upcoming { border-left-style: dashed; }
  .prog-phase.isactive { border-left-color: var(--accent); }
  .prog-phase-h { width: 100%; display: flex; align-items: baseline; gap: .5rem; background: none; border: none;
    padding: .35rem 0; cursor: pointer; text-align: left; }
  .prog-phase-h:hover .prog-phase-label { color: var(--accent); }
  .prog-caret { flex: 0 0 .8rem; color: var(--text-muted); font-size: .7rem; }
  .prog-phase-label { flex: 1; font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; color: var(--text-primary); font-weight: 600; }
  .prog-phase.upcoming .prog-phase-label { color: var(--text-secondary); }
  .prog-phase-count { flex: 0 0 auto; font-size: .72rem; color: var(--accent); font-variant-numeric: tabular-nums; }
  .prog-phase-body { padding: .1rem 0 .55rem; }
  .prog-blurb { font-size: .78rem; color: var(--text-muted); line-height: 1.45; margin: 0 0 .5rem; }
  .prog-books { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .22rem; }
  .prog-book { display: flex; align-items: center; gap: .5rem; font-size: .82rem; color: var(--text-muted); padding: .12rem .4rem; margin: 0 -.4rem; border-radius: .3rem; }
  .prog-book.done { color: var(--text-secondary); }
  /* the currently-grounding book, styled inline as in-progress: accent tint + left bar + pulsing tick */
  .prog-book.active { background: var(--surface-2); box-shadow: inset 2px 0 0 var(--accent); }
  .prog-book.active .prog-tick { animation: progpulse 1.6s ease-in-out infinite; }
  .prog-tick { flex: 0 0 1rem; text-align: center; color: var(--border); }
  .prog-book.done .prog-tick, .prog-book.active .prog-tick { color: var(--accent); }
  .prog-book-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prog-book.done .prog-book-title, .prog-book.active .prog-book-title { color: var(--text-primary); }
  /* Fixed right-hand COLUMNS so every row lines up vertically: [size/progress] [+new] [unresolved]. */
  .col-size { flex: 0 0 6rem; display: flex; align-items: center; justify-content: flex-end; gap: .4rem; }
  .col-new { flex: 0 0 3.2rem; text-align: right; font-size: .72rem; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
  .col-un { flex: 0 0 3rem; text-align: right; font-size: .72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .pb-num { font-size: .68rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .pb-num::after { content: ' ¶'; opacity: .5; }
  /* PROGRESS bar — ONLY on the current book being ground; fills the size column. */
  .pbp-track { flex: 1; height: .34rem; background: var(--surface-3); border-radius: 1rem; overflow: hidden; }
  .pbp-fill { display: block; height: 100%; background: var(--accent); border-radius: 1rem; transition: width .3s linear; }
  .pbp-pct { flex: 0 0 auto; font-size: .68rem; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
  .prog-book-stats { flex: 0 0 auto; display: flex; gap: .45rem; align-items: baseline; font-size: .72rem; font-variant-numeric: tabular-nums; }
  .pb-new { color: var(--accent); font-weight: 600; }
  .pb-un { color: var(--text-muted); }
  .prog-empty { color: var(--text-muted); font-size: .76rem; font-style: italic; padding-left: 1.5rem; }
  /* Period sub-groups (e.g. Pilgrim Notes by era) — a collapsible tree nested inside a phase. */
  .prog-group { margin: .1rem 0 .1rem .3rem; border-left: 1px solid var(--border); padding-left: .55rem; }
  .prog-group-h { width: 100%; display: flex; align-items: baseline; gap: .45rem; background: none; border: none; padding: .22rem 0; cursor: pointer; text-align: left; }
  .prog-group-h:hover .prog-group-label { color: var(--accent); }
  .prog-group-label { flex: 1; font-size: .74rem; color: var(--text-secondary); }
  .prog-group-count { flex: 0 0 auto; font-size: .68rem; color: var(--accent); font-variant-numeric: tabular-nums; }
  .prog-subbooks { padding-left: .1rem; margin-top: .05rem; }
  .prog-subbooks .prog-book { font-size: .78rem; }
  @media (prefers-reduced-motion: reduce) { .prog-active-dot { animation: none; } }
</style>
