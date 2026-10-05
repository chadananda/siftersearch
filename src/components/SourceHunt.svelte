<script>
  // SourceHunt: paste an English quotation → the published book it comes from, every publication citing it, and the
  // original Arabic/Persian tablet. Streams the hunt's REAL stages (POST /api/search/source-hunt/stream) into a live
  // console — probe field, stage rail, document ticker — then lays the results across the full width. JSON fallback.
  import { onMount, tick } from 'svelte';
  import AynLens from './sourcehunt/AynLens.svelte';
  import ProbeField from './sourcehunt/ProbeField.svelte';
  import CitationShelf from './sourcehunt/CitationShelf.svelte';

  const API = import.meta.env.PUBLIC_API_URL || '';

  let quote = $state('');
  let phase = $state('idle');            // idle · hunting · done · error
  let error = $state(null);
  let ev = $state({});                   // stage → its event data (as it arrived)
  let result = $state(null);
  let ticker = $state([]);               // documents probed, in the order shown
  let scale = $state(null);
  let shown = $state({ phrase: 0, paragraphs: 0, documents: 0, tablets: 0 });
  let field;                              // ProbeField instance
  let box;                                // the quote textarea (grows with its content)
  function grow() {
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }
  let abort = null, tickTimer = null;

  // Demo samples — each one scored fully right on the battery (book, linked original, paragraph), 2026-10-04.
  const SAMPLES = [
    'The earth is but one country, and mankind its citizens.',
    'For like seeketh like, and taketh pleasure in the company of its kind.',
    'In the eyes of God, the ideal King, all the places of the earth are one and the same, excepting that place which, in the days of His Manifestations, He doth appoint for a particular purpose.',
    'Separation from Thee, O Thou Source of everlasting life, hath well nigh consumed me, and my remoteness from Thy presence hath burned away my soul.',
    'Erelong shall We bring into being through you pure and undefiled ears which will heed the Word of God and that which hath appeared from the Dayspring of the Utterance of your Lord, the All-Merciful.',
    'Should differences arise, they shall be amicably and conclusively settled by the Supreme Tribunal, that shall include members from all the governments and peoples of the world.',
  ];
  // the button shows the quote's opening words — never the answer (the source is what the demo finds)
  const opening = (q, n = 5) => q.split(/\s+/).slice(0, n).join(' ').replace(/[,.;:!?]+$/, '');

  const SITE = { 'oceanlibrary.com': 'OceanLibrary', 'bahai-library.com': 'Bahá’í Library Online', 'oceanoflights.org': 'Ocean of Lights', library: 'SifterSearch library' };
  const siteName = (s) => SITE[s] || s || 'SifterSearch library';
  const fmt = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

  // the stage rail: each line is filled only by the server's event for that stage
  const STAGES = [
    { k: 'candidates', label: 'Phrase & keyword indexes', d: (e) => `${e.phrase} phrase + ${e.keyword} keyword hits → ${e.paragraphs} passages in ${e.documents.length} documents` },
    { k: 'verbatim', label: 'Verbatim check', d: (e) => `${e.count} hold the words · ${e.rejected} set aside` },
    { k: 'writer', label: 'Whose words', d: (e) => e.quoteAuthor || 'no doctrinal writer identified' },
    { k: 'targeted', label: 'The writer’s own texts', d: (e) => `${e.searched} more passages searched · ${e.pool} candidates` },
    { k: 'origin', label: 'Published source', d: (e) => e.origin?.title },
    { k: 'cited', label: 'Citation graph', d: (e) => `${e.citedBy.length} publications` },
    { k: 'tablet', label: 'Original tablet', d: (e) => (e.tablet?.certain ? e.tablet.meta?.title || e.tablet.title : `${e.tablet?.candidates?.length || 0} possible originals`) },
  ];
  const stageState = (k, i) => {
    if (ev[k]) return 'done';
    if (k === 'targeted' && ev.origin) return 'skipped';
    const next = STAGES.findIndex((s) => !ev[s.k] && !(s.k === 'targeted' && ev.origin));
    return phase === 'hunting' && next === i ? 'active' : 'pending';
  };

  function onEvent(name, data) {
    ev = { ...ev, [name]: data };
    if (name === 'candidates') {
      field?.burst(data.paragraphs * 6);
      queueTicker(data.documents.map((x) => ({ ...x, kind: 'probe' })));
    } else if (name === 'verbatim') {
      field?.lock(Math.max(1, data.count));
      const hits = new Set(data.documents.map((x) => x.id));
      ticker = ticker.map((t) => (hits.has(t.id) ? { ...t, kind: 'match' } : t));
    } else if (name === 'targeted') field?.burst(data.searched * 4, 1);
    else if (name === 'origin') field?.focus();
    else if (name === 'cited') field?.burst(data.citedBy.length * 3, 2);
    else if (name === 'tablet') field?.burst(24, 1);
  }
  function queueTicker(items) {
    clearInterval(tickTimer);
    const queue = items.slice(0, 48);
    tickTimer = setInterval(() => { const n = queue.shift(); if (!n) return clearInterval(tickTimer); ticker = [n, ...ticker].slice(0, 14); }, 55);
  }

  async function hunt(q = quote) {
    q = String(q || '').trim(); if (!q || phase === 'hunting') return;
    quote = q; abort?.abort(); abort = new AbortController();
    tick().then(grow);
    phase = 'hunting'; error = null; ev = {}; result = null; ticker = []; field?.reset();
    try {
      const res = await fetch(`${API}/api/search/source-hunt/stream`, { method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: q }) });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', final = null;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1], data = /^data: (.+)$/m.exec(block)?.[1];
          if (!name || !data) continue;
          const obj = JSON.parse(data);
          if (name === 'done') final = obj;
          else if (name === 'error') throw Object.assign(new Error(obj.message || obj.error || 'Search failed'), { server: true });
          else onEvent(name, obj);
        }
      }
      if (!final) throw new Error('The search ended without a result');
      finish(final);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.server) { phase = 'error'; error = e.message; return; }
      // stream unavailable → the same hunt as one JSON answer
      try {
        const res = await fetch(`${API}/api/search/source-hunt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: q }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || `Search failed (${res.status})`);
        onEvent('origin', { origin: body.origin, ms: body.ms });
        onEvent('cited', { citedBy: body.citedBy, citedByLinkCount: body.citedByLinkCount, ms: body.ms });
        onEvent('tablet', { tablet: body.tablet, ms: body.ms });
        finish(body);
      } catch (e2) { phase = 'error'; error = e2.message; }
    }
  }
  async function finish(r) {
    result = r; phase = 'done';
    await tick();
    document.getElementById('sh-results')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) hunt(); };
  const segments = (text, ranges = []) => {
    const out = []; let at = 0;
    for (const [a, b] of ranges || []) { if (a > at) out.push({ t: text.slice(at, a) }); out.push({ t: text.slice(a, b), q: true }); at = b; }
    if (at < text.length) out.push({ t: text.slice(at) });
    return out;
  };
  const origin = $derived(ev.origin?.origin || result?.origin || null);
  const cited = $derived(ev.cited || (result && { citedBy: result.citedBy, citedByLinkCount: result.citedByLinkCount }) || null);
  const tablet = $derived(ev.tablet?.tablet || result?.tablet || null);
  const tabletLinks = (meta) => [
    meta?.links?.oceanoflights && { href: meta.links.oceanoflights, label: 'Ocean of Lights' },
    meta?.links?.inventory && { href: meta.links.inventory, label: `Phelps Inventory${meta.pin ? ` · ${meta.pin}` : ''}` },
  ].filter(Boolean);

  onMount(() => {
    fetch(`${API}/api/search/source-hunt/scale`).then((r) => r.json()).then((s) => {
      scale = s;
      const target = { phrase: s.phraseVectors || 0, paragraphs: s.paragraphs || 0, documents: s.documents || 0, tablets: s.tablets || 0 };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { shown = target; return; }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1600), e = 1 - Math.pow(1 - k, 3);
        shown = Object.fromEntries(Object.entries(target).map(([key, v]) => [key, Math.round(v * e)]));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }).catch(() => {});
    return () => { abort?.abort(); clearInterval(tickTimer); };
  });
</script>

<section class="sh flex flex-col gap-6">
  <!-- ── header: the mark, the claim, the scale of the library ── -->
  <header class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex items-center gap-4 sm:gap-6">
      <AynLens size={64} hunting={phase === 'hunting'} />
      <div class="flex flex-col gap-1">
        <h1 class="sh-title text-primary">SourceHunt</h1>
        <p class="max-w-xl text-secondary">Paste a quotation. SourceHunt traces it to the book it was published in, every publication that cites it, and the original Arabic or Persian tablet.</p>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:min-w-[520px]">
      {#each [['Phrase vectors', shown.phrase], ['Paragraphs indexed', shown.paragraphs], ['Documents', shown.documents], ['Original tablets', shown.tablets]] as [label, n] (label)}
        <div class="flex flex-col gap-0.5 bg-surface-1 px-4 py-3">
          <span class="sh-num text-primary">{scale ? fmt(n) : '…'}</span>
          <span class="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</span>
        </div>
      {/each}
    </div>
  </header>

  <!-- ── the question: one fat line that grows with the text ── -->
  <div class="sh-input rounded-2xl border border-border bg-surface-1 p-2.5 sm:p-3" class:is-hunting={phase === 'hunting'}>
    <div class="flex flex-col gap-2 md:flex-row md:items-end">
      <label for="sh-quote" class="sr-only">Quotation</label>
      <textarea id="sh-quote" bind:this={box} bind:value={quote} oninput={grow} onkeydown={onKey} rows="1" placeholder="Paste a quotation in English…"
        class="sh-quote w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-primary placeholder:text-muted focus:outline-none"></textarea>
      <button onclick={() => hunt()} disabled={phase === 'hunting' || !quote.trim()}
        class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-text transition-transform hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50">
        {phase === 'hunting' ? 'Hunting…' : 'Find the source'}
        <span class="hidden text-xs opacity-70 sm:inline">⌘↵</span>
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-2 border-t border-border-subtle px-1 pt-2.5 mt-2.5">
      <span class="text-xs text-muted">Try</span>
      {#each SAMPLES as s (s)}
        <button onclick={() => hunt(s)} disabled={phase === 'hunting'} title={s}
          class="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50">“{opening(s)}…”</button>
      {/each}
    </div>
  </div>

  {#if error}
    <p class="rounded-xl border border-error bg-surface-1 p-4 text-error">{error}</p>
  {/if}

  <!-- ── the hunt, live: status · stepper · probe field + ticker (compact, no empty rows) ── -->
  {#if phase !== 'idle'}
    <div class="sh-console flex flex-col gap-3 rounded-2xl border border-border bg-surface-1 p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span class="flex items-center gap-2"><i class="live" class:on={phase === 'hunting'}></i>{phase === 'hunting' ? 'Searching the library…' : phase === 'done' ? `Done in ${((result?.ms ?? 0) / 1000).toFixed(1)} s` : 'Stopped'}</span>
        <span>{scale ? `${fmt(scale.phraseVectors)} phrase vectors · ${fmt(scale.paragraphs)} paragraphs · ${fmt(scale.tablets)} tablets` : ''}</span>
      </div>
      <ol class="stepper">
        {#each STAGES as s, i (s.k)}
          {@const st = stageState(s.k, i)}
          <li class="stage {st}" title={ev[s.k] ? s.d(ev[s.k]) : s.label}>
            <div class="flex items-center gap-2">
              <span class="pip"></span>
              <span class="truncate text-xs font-medium text-primary">{s.label}</span>
              {#if ev[s.k]}<span class="ml-auto shrink-0 text-[10px] tabular-nums text-muted">{ev[s.k].ms}ms</span>{/if}
            </div>
            <p class="truncate pl-[18px] text-[11px] text-secondary">{ev[s.k] ? s.d(ev[s.k]) : st === 'skipped' ? 'not needed' : ' '}</p>
          </li>
        {/each}
      </ol>
      <div class="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ProbeField bind:this={field} active={phase === 'hunting'} height={108} />
        <ul class="sh-ticker" aria-live="polite">
          {#each ticker as t (t.id + t.kind)}
            <li class:match={t.kind === 'match'}>
              <span class="mark">{t.kind === 'match' ? '✓' : '→'}</span>
              <span class="truncate text-primary">{t.title}</span>
              <span class="shrink-0 text-muted">{siteName(t.site)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <!-- ── results across the full width ── -->
  {#if origin || tablet}
    <div id="sh-results" class="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,7fr)_56px_minmax(0,5fr)]">
      <article class="sh-card flex flex-col gap-3 rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sh-label">Published source</h2>
          {#if origin}<span class="chip">{siteName(origin.site)}</span>{/if}
        </div>
        {#if origin}
          <a href={origin.url} target="_blank" rel="noopener" class="sh-book text-accent hover:text-accent-hover">{origin.title}</a>
          <p class="text-sm text-secondary">{origin.author}{#if origin.bookAuthor && origin.bookAuthor !== origin.author} · in a book by {origin.bookAuthor}{/if}</p>
          <blockquote class="sh-passage text-primary">{#each segments(origin.text, origin.highlight) as seg, i}{#if seg.q}<span class="pen" style="--d: {350 + i * 120}ms">{seg.t}</span>{:else}{seg.t}{/if}{/each}</blockquote>
          {#if result?.considered?.length > 1}
            <details class="mt-1 text-sm">
              <summary class="cursor-pointer text-muted hover:text-accent">Why this source</summary>
              <ol class="mt-2 flex flex-col gap-1.5">
                {#each result.considered as c, i (c.id)}
                  <li class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" class:text-primary={i === 0} class:text-secondary={i > 0}>
                    <span class="w-4 tabular-nums text-muted">{i + 1}</span>
                    <span class="font-medium">{c.title}</span>
                    {#if c.ownWork}<span class="chip">own work</span>{/if}
                    {#if /core publications/i.test(c.collection || '')}<span class="chip">Core Publication</span>{/if}
                    {#if c.year}<span class="chip">{c.year}</span>{/if}
                    {#if c.quotedCount}<span class="chip">quoted by {c.quotedCount}</span>{/if}
                    <span class="meter" style="--v: {c.overlap}" title="share of the quote it holds"></span>
                  </li>
                {/each}
              </ol>
            </details>
          {/if}
        {:else}
          <p class="text-secondary">No publication in the library holds this wording verbatim — it may be a paraphrase or another translation. The originals are matched by meaning.</p>
        {/if}
      </article>

      <div class="bridge" class:on={!!tablet} aria-hidden="true">
        <svg viewBox="0 0 56 200" preserveAspectRatio="none" class="hidden h-full w-full xl:block">
          <path d="M2 100 C 20 100, 36 100, 54 100" class="track" />
          <path d="M2 100 C 20 100, 36 100, 54 100" class="flow" />
        </svg>
        <span class="xl:hidden">↓</span>
      </div>

      <article class="sh-card sh-orig flex flex-col gap-3 rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sh-label">{tablet && !tablet.certain ? 'Possible originals' : 'Original tablet'}</h2>
          {#if tablet}<span class="chip" class:chip-ok={tablet.certain}>{tablet.certain ? 'Linked translation' : 'By meaning · verify'}</span>{/if}
        </div>
        {#if !tablet}
          <div class="flex flex-col gap-2" aria-busy="true"><div class="skel w-2/3"></div><div class="skel"></div><div class="skel w-5/6"></div></div>
        {:else if tablet.certain}
          <p class="sh-book text-primary">{tablet.meta?.title || tablet.title}</p>
          {#if tablet.meta?.first_line_en}<p class="text-sm italic text-secondary">{tablet.meta.first_line_en}</p>{/if}
          <blockquote dir="rtl" lang="ar" class="sh-arabic text-primary">{#each segments(tablet.text, tablet.highlight) as seg, i}{#if seg.q}<span class="pen" style="--d: {650 + i * 140}ms">{seg.t}</span>{:else}{seg.t}{/if}{/each}</blockquote>
          {#if tablet.highlight?.length}<p class="text-[11px] text-muted">{tablet.highlightBy === 'decision' ? 'Highlighted by meaning — the clause Clef-flash judged to say what your quote says, whatever its translation.' : 'Highlighted by meaning — the phrases nearest your quote, whatever its translation.'}</p>{/if}
          <div class="flex flex-wrap gap-2 pt-1">
            {#each tabletLinks(tablet.meta) as l (l.href)}<a href={l.href} target="_blank" rel="noopener" class="linkchip">{l.label} ↗</a>{/each}
            {#if tablet.url}<a href={tablet.url} target="_blank" rel="noopener" class="linkchip">Read in the library ↗</a>{/if}
          </div>
        {:else if tablet.candidates?.length}
          <p class="text-sm text-secondary">No translation link yet — these originals are the closest in meaning. Verify before citing.</p>
          {#each tablet.candidates as t (t.id)}
            <div class="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <p class="font-semibold text-primary">{t.meta?.title || t.title} <span class="text-xs font-normal text-muted">similarity {t.score}</span></p>
              <blockquote dir="rtl" lang="ar" class="sh-arabic sh-arabic-sm text-primary">{#each segments(t.text, t.highlight) as seg, i}{#if seg.q}<span class="pen" style="--d: {650 + i * 140}ms">{seg.t}</span>{:else}{seg.t}{/if}{/each}</blockquote>
              <div class="flex flex-wrap gap-2">{#each tabletLinks(t.meta) as l (l.href)}<a href={l.href} target="_blank" rel="noopener" class="linkchip">{l.label} ↗</a>{/each}</div>
            </div>
          {/each}
        {:else}
          <p class="text-secondary">No original found.</p>
        {/if}
      </article>
    </div>
  {/if}

  {#if cited}
    <div class="sh-card rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
      <CitationShelf items={cited.citedBy || []} linkCount={cited.citedByLinkCount} />
    </div>
  {/if}
</section>

<style>
  .sh { --rise: cubic-bezier(.2,.8,.2,1); }
  .sh-title { font-family: 'Libre Caslon Text', Georgia, serif; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.05; letter-spacing: -0.01em; }
  .sh-num { font-size: 1.35rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  :global(.sh-label) { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .14em; color: var(--text-muted); }
  .sh-quote { font-family: 'Libre Caslon Text', Georgia, serif; font-size: 1.2rem; line-height: 1.55; min-height: 3rem; max-height: 40vh; overflow-y: auto; }
  .sh-input { transition: border-color 300ms, box-shadow 300ms; }
  .sh-input:focus-within, .sh-input.is-hunting { border-color: var(--accent-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-primary) 14%, transparent); }
  .sh-input.is-hunting { animation: breathe 1.8s ease-in-out infinite; }

  .sh-console { animation: rise 500ms var(--rise) both; }
  .live { display: inline-block; width: 8px; height: 8px; border-radius: 99px; background: var(--text-muted); }
  .live.on { background: var(--success); animation: blink 1s ease-in-out infinite; }
  .sh-ticker { display: flex; flex-direction: column; gap: 1px; height: 108px; overflow: hidden; font-size: .76rem; line-height: 1.35;
    mask-image: linear-gradient(to bottom, black 65%, transparent); }
  .sh-ticker li { display: flex; align-items: baseline; gap: .5rem; min-width: 0; animation: slide 260ms var(--rise) both; }
  .sh-ticker .mark { width: 1rem; color: var(--text-muted); flex-shrink: 0; }
  .sh-ticker li.match .mark { color: var(--success); font-weight: 700; }

  .stepper { display: grid; gap: .4rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .stage { min-width: 0; padding: .4rem .55rem; border-radius: .6rem; border: 1px solid var(--border-subtle); transition: background 300ms, opacity 300ms, border-color 300ms; }
  .stage .pip { width: 10px; height: 10px; border-radius: 99px; border: 2px solid var(--border-strong); flex-shrink: 0; transition: all 300ms; }
  .stage.done { border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent); }
  .stage.pending { opacity: .45; }
  .stage.skipped { opacity: .4; }
  .stage.active { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); border-color: var(--accent-primary); }
  .stage.active .pip { border-color: var(--accent-primary); animation: blink .9s ease-in-out infinite; }
  .stage.done .pip { background: var(--accent-primary); border-color: var(--accent-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-primary) 18%, transparent); }

  .sh-card { animation: rise 600ms var(--rise) both; }
  .sh-orig { animation-delay: 120ms; }
  .sh-book { font-family: 'Libre Caslon Text', Georgia, serif; font-size: clamp(1.25rem, 2vw, 1.6rem); line-height: 1.25; }
  .sh-passage { font-family: 'Libre Caslon Text', Georgia, serif; font-size: 1.08rem; line-height: 1.75; border-left: 3px solid var(--accent-primary); padding-left: 1rem; }
  /* highlighter pen: light yellow ink swept left-to-right (English) and right-to-left (Arabic/Persian); wraps across lines.
     A <span>, not <mark>: the site's global `mark { background: none !important }` would pin the background so it could
     never animate. */
  .pen {
    color: inherit; padding: .04em .18em; margin: 0 -.06em; border-radius: .35em .2em .4em .25em;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    background-image: linear-gradient(var(--highlight-pen), var(--highlight-pen));
    background-repeat: no-repeat; background-position: 0 60%; background-size: 0% 88%;
    animation: pen 950ms cubic-bezier(.3,.7,.2,1) forwards; animation-delay: var(--d);
  }
  .sh-arabic .pen { background-position: 100% 60%; }
  .sh-arabic { font-family: 'Amiri', 'Noto Naskh Arabic', serif; font-size: clamp(1.3rem, 2.2vw, 1.65rem); line-height: 2.05; border-right: 3px solid var(--accent-secondary); padding-right: 1rem; }
  .sh-arabic-sm { font-size: 1.2rem; }


  .chip { font-size: .7rem; padding: .15rem .55rem; border-radius: 99px; border: 1px solid var(--border-default); color: var(--text-secondary); background: var(--surface-2); white-space: nowrap; }
  .chip-ok { border-color: color-mix(in srgb, var(--success) 50%, transparent); color: var(--success); }
  .linkchip { font-size: .8rem; padding: .35rem .75rem; border-radius: .6rem; border: 1px solid var(--border-default); color: var(--accent-primary); transition: all 180ms; }
  .linkchip:hover { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
  .meter { display: inline-block; width: 44px; height: 4px; border-radius: 99px; background: var(--border-default); position: relative; overflow: hidden; }
  .meter::after { content: ''; position: absolute; inset: 0; width: calc(var(--v) * 100%); background: var(--accent-primary); }
  .skel { height: .9rem; border-radius: .4rem; background: linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2)); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }

  .bridge { display: grid; place-items: center; color: var(--text-muted); min-height: 1.5rem; }
  .bridge .track { fill: none; stroke: var(--border-strong); stroke-width: 2; }
  .bridge .flow { fill: none; stroke: var(--accent-secondary); stroke-width: 3; stroke-dasharray: 10 90; stroke-dashoffset: 100; opacity: 0; }
  .bridge.on .flow { opacity: 1; animation: flow 1.4s linear infinite; }

  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes slide { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
  @keyframes pen { to { background-size: 100% 88%; } }
  @keyframes blink { 50% { opacity: .35; } }
  @keyframes breathe { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent-primary) 8%, transparent); } }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @keyframes flow { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .sh-console, .sh-card, .sh-ticker li, .sh-input.is-hunting, .live.on, .stage.active .pip, .skel, .bridge.on .flow { animation: none; }
    .pen { animation: none; background-size: 100% 88%; }
  }
</style>
