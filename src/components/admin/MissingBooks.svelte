<script>
  // Missing-books triage: bahai-library metadata-page stubs (fetchable ones first — they link a
  // real .docx/.pdf to ingest via add/SearchLayerPDF) + empty-husk doc records. Deps: api.getMissingBooks.
  import { admin } from '../../lib/api.js';

  let data = $state(null);
  let error = $state(null);
  let showHusks = $state(false);

  $effect(() => {
    admin.getMissingBooks().then((d) => (data = d)).catch((e) => (error = e.message));
  });

  const fetchable = $derived(data?.stubs?.filter((s) => s.fetchable) ?? []);
  const plain = $derived(data?.stubs?.filter((s) => !s.fetchable) ?? []);
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Missing Books</h1>
  <p class="text-muted mb-6">
    Documents the library <em>lists</em> but doesn't actually <em>hold</em> — metadata-page stubs scraped
    from bahai-library.com, and empty doc records with no content. Fetchable stubs link a real source file.
  </p>

  {#if error}
    <div class="text-error">{error}</div>
  {:else if !data}
    <div class="text-muted">Loading…</div>
  {:else if data.pending}
    <div class="text-warning">{data.message}</div>
  {:else}
    <section class="mb-8">
      <h2 class="text-lg font-medium text-primary mb-2">
        Stubs with a fetchable source <span class="text-muted font-normal">({fetchable.length})</span>
      </h2>
      <p class="text-sm text-muted mb-3">The metadata page links a .docx/.pdf of the real book — prime candidates for ingest via SearchLayerPDF.</p>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-muted border-b border-border">
          <th class="py-2 pr-3">Title</th><th class="pr-3">Author</th><th class="pr-3 text-right">¶</th><th>Doc</th>
        </tr></thead>
        <tbody>
          {#each fetchable as s (s.id)}
            <tr class="border-b border-border-subtle">
              <td class="py-2 pr-3">
                {#if s.source_url}<a class="text-accent hover:text-accent-hover" href={s.source_url} target="_blank" rel="noopener">{s.title}</a>
                {:else}<span class="text-primary">{s.title}</span>{/if}
              </td>
              <td class="pr-3 text-secondary">{s.author || '—'}</td>
              <td class="pr-3 text-right text-muted">{s.paras}</td>
              <td class="text-muted">#{s.id}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="mb-8">
      <h2 class="text-lg font-medium text-primary mb-2">
        Metadata-page stubs <span class="text-muted font-normal">({plain.length})</span>
      </h2>
      <p class="text-sm text-muted mb-3">Scrape chrome present, no direct source file linked — needs manual sourcing.</p>
      <table class="w-full text-sm">
        <tbody>
          {#each plain as s (s.id)}
            <tr class="border-b border-border-subtle">
              <td class="py-2 pr-3">
                {#if s.source_url}<a class="text-accent hover:text-accent-hover" href={s.source_url} target="_blank" rel="noopener">{s.title}</a>
                {:else}<span class="text-primary">{s.title}</span>{/if}
              </td>
              <td class="pr-3 text-secondary">{s.author || '—'}</td>
              <td class="pr-3 text-right text-muted">{s.paras}</td>
              <td class="text-muted">#{s.id}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <button class="text-lg font-medium text-primary mb-2 flex items-center gap-2" onclick={() => (showHusks = !showHusks)}>
        <span>{showHusks ? '▾' : '▸'}</span>
        Empty husks <span class="text-muted font-normal">({data.huskTotal ?? data.husks.length} doc records with zero content)</span>
      </button>
      {#if showHusks}
        <p class="text-sm text-muted mb-3">Live doc rows holding no paragraphs at all — delete or repoint in a cleanup pass.{#if data.huskTotal > data.husks.length} Showing first {data.husks.length}.{/if}</p>
        <table class="w-full text-sm">
          <tbody>
            {#each data.husks as h (h.id)}
              <tr class="border-b border-border-subtle">
                <td class="py-1.5 pr-3 text-primary">{h.title}</td>
                <td class="pr-3 text-secondary">{h.author || '—'}</td>
                <td class="pr-3 text-muted">{h.religion || ''}{h.collection ? ` / ${h.collection}` : ''}</td>
                <td class="text-muted">#{h.id}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <p class="text-xs text-muted mt-6">Computed {new Date(data.generated_at).toLocaleString()} · refreshes every 6h</p>
  {/if}
</div>
