<script>
  // SourceHunt: paste an English quote → its published book (OceanLibrary first), every publication citing it, and the
  // likely original tablet with oceanoflights / Phelps Inventory links. API: POST /api/search/source-hunt (Qdrant + SQLite).
  const API = import.meta.env.PUBLIC_API_URL || '';

  let quote = $state('');
  let loading = $state(false);
  let error = $state(null);
  let result = $state(null);

  const SITE_LABEL = { 'oceanlibrary.com': 'OceanLibrary', 'bahai-library.com': 'Bahá’í Library Online', 'oceanoflights.org': 'Ocean of Lights', library: 'SifterSearch library' };
  const siteLabel = (s) => SITE_LABEL[s] || s || 'SifterSearch library';

  async function hunt() {
    const q = quote.trim();
    if (!q) return;
    loading = true; error = null; result = null;
    try {
      const res = await fetch(`${API}/api/search/source-hunt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: q }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `Search failed (${res.status})`);
      result = body;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // the passage split into plain / quoted segments (ranges from the API: [start, end) character offsets)
  const segments = (text, ranges = []) => {
    const out = []; let at = 0;
    for (const [a, b] of ranges) { if (a > at) out.push({ t: text.slice(at, a) }); out.push({ t: text.slice(a, b), q: true }); at = b; }
    if (at < text.length) out.push({ t: text.slice(at) });
    return out;
  };

  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) hunt(); };
  const tabletLinks = (meta) => [
    meta?.links?.oceanoflights && { href: meta.links.oceanoflights, label: 'Ocean of Lights' },
    meta?.links?.inventory && { href: meta.links.inventory, label: `Phelps Inventory${meta.pin ? ` · ${meta.pin}` : ''}` },
  ].filter(Boolean);
</script>

<section class="flex flex-col gap-6">
  <div class="flex flex-col gap-3">
    <label for="sh-quote" class="text-sm font-medium text-secondary">Paste a quotation in English</label>
    <textarea id="sh-quote" bind:value={quote} onkeydown={onKey} rows="4"
      placeholder="The earth is but one country, and mankind its citizens."
      class="w-full rounded-lg border border-border bg-surface-1 p-3 text-primary placeholder:text-muted focus:border-accent focus:outline-none"></textarea>
    <div class="flex items-center gap-3">
      <button onclick={hunt} disabled={loading || !quote.trim()}
        class="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50">
        {loading ? 'Searching…' : 'Find the source'}
      </button>
      <span class="text-xs text-muted">⌘/Ctrl + Enter</span>
    </div>
  </div>

  {#if error}
    <p class="rounded-lg border border-error bg-surface-1 p-3 text-error">{error}</p>
  {/if}

  {#if result}
    <!-- 1. the published source -->
    <article class="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">Published source</h2>
      {#if result.origin}
        <a href={result.origin.url} target="_blank" rel="noopener" class="text-lg font-semibold text-accent hover:text-accent-hover">{result.origin.title}</a>
        <p class="text-sm text-secondary">
          {result.origin.author}{#if result.origin.bookAuthor && result.origin.bookAuthor !== result.origin.author} · in a book by {result.origin.bookAuthor}{/if}
          · {siteLabel(result.origin.site)}
        </p>
        <blockquote class="sourcehunt-quote border-l-2 border-accent pl-3 text-primary">{#each segments(result.origin.text, result.origin.highlight) as seg}{#if seg.q}<mark>{seg.t}</mark>{:else}{seg.t}{/if}{/each}</blockquote>
      {:else}
        <p class="text-secondary">No publication in the library holds this wording verbatim. It may be a paraphrase or a different translation — the tablet candidates below are matched by meaning.</p>
      {/if}
    </article>

    <!-- 2. publications citing it -->
    <article class="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
        Cited in {result.citedBy.length} other publication{result.citedBy.length === 1 ? '' : 's'}
      </h2>
      {#if result.citedBy.length}
        <ul class="flex flex-col gap-1">
          {#each result.citedBy as c (c.documentId)}
            <li class="flex flex-wrap items-baseline gap-x-2">
              <a href={c.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">{c.title}</a>
              <span class="text-sm text-secondary">{c.author}</span>
              <span class="text-xs text-muted">{siteLabel(c.site)}{c.paragraphs > 1 ? ` · ${c.paragraphs} passages` : ''}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-secondary">No other publication found quoting it.</p>
      {/if}
    </article>

    <!-- 3. the original tablet -->
    <article class="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {result.tablet?.certain ? 'Original tablet' : 'Possible original tablets'}
      </h2>
      {#if result.tablet?.certain}
        {@const t = result.tablet}
        <div class="flex flex-col gap-2">
          <p class="font-semibold text-primary">{t.meta?.title || t.title}</p>
          {#if t.meta?.first_line_en}<p class="text-sm italic text-secondary">{t.meta.first_line_en}</p>{/if}
          <blockquote dir="rtl" lang="ar" class="border-r-2 border-accent pr-3 text-lg leading-loose text-primary">{t.text}</blockquote>
          <div class="flex flex-wrap gap-3 text-sm">
            {#each tabletLinks(t.meta) as l}<a href={l.href} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">{l.label} ↗</a>{/each}
            {#if t.url}<a href={t.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">Read in the library ↗</a>{/if}
          </div>
          <p class="text-xs text-muted">Linked {t.basis === 'translation' ? 'as the translation of this text' : 'through the published source'}.</p>
        </div>
      {:else if result.tablet?.candidates?.length}
        <p class="text-sm text-secondary">No translation link yet — these originals are the closest in meaning. Verify before citing.</p>
        {#each result.tablet.candidates as t (t.id)}
          <div class="flex flex-col gap-2 border-t border-border-subtle pt-3">
            <p class="font-semibold text-primary">{t.meta?.title || t.title} <span class="text-xs font-normal text-muted">similarity {t.score}</span></p>
            {#if t.meta?.first_line_en}<p class="text-sm italic text-secondary">{t.meta.first_line_en}</p>{/if}
            <blockquote dir="rtl" lang="ar" class="border-r-2 border-border pr-3 leading-loose text-primary">{t.text}</blockquote>
            <div class="flex flex-wrap gap-3 text-sm">
              {#each tabletLinks(t.meta) as l}<a href={l.href} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">{l.label} ↗</a>{/each}
              {#if t.url}<a href={t.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">Read ↗</a>{/if}
            </div>
          </div>
        {/each}
      {:else}
        <p class="text-secondary">No original found.</p>
      {/if}
    </article>

    <p class="text-xs text-muted">{result.ms} ms</p>
  {/if}
</section>
