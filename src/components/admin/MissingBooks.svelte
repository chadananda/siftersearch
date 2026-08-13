<script>
  // Missing-books triage in two work queues: books we already have a fetchable source file for
  // (convert → ingest, so that tab drains) and books still needing a source. Deps: api.getMissingBooks.
  import { admin } from '../../lib/api.js';

  let data = $state(null);
  let error = $state(null);
  let tab = $state('have');

  $effect(() => {
    admin.getMissingBooks().then((d) => (data = d)).catch((e) => (error = e.message));
  });

  const TABS = [
    { key: 'have', label: 'Missing — have source', hint: 'A .pdf/.docx of the real book is linked: convert to Markdown and ingest. This list should shrink as we import.' },
    { key: 'none', label: 'Missing — no source', hint: 'Listed but no source file to fetch — needs sourcing before it can be ingested.' },
  ];
  const active = $derived(TABS.find((t) => t.key === tab));
  const rows = $derived((tab === 'have' ? data?.haveSource : data?.noSource) ?? []);
  const total = $derived((tab === 'have' ? data?.haveSourceTotal : data?.noSourceTotal) ?? rows.length);
  const fileKind = (u) => (/\.pdf$/i.test(u) ? 'PDF' : /\.docx?$/i.test(u) ? 'DOC' : 'file');
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Missing Books</h1>
  <p class="text-muted mb-5">
    Documents the library <em>lists</em> but doesn't actually <em>hold</em> — scraped metadata-page
    stubs and doc records with no content. Excluded as not-missing: catalogue rows (the Phelps
    inventory and bibliography indexes, which aren't books) and any row whose work we already hold
    under another doc — an archival entry like <em>"1898, May Maxwell — An Early Pilgrimage"</em>
    against the ingested <em>An Early Pilgrimage</em>.
  </p>

  {#if error}
    <div class="text-error">{error}</div>
  {:else if !data}
    <div class="text-muted">Loading…</div>
  {:else if data.pending}
    <div class="text-warning">{data.message}</div>
  {:else}
    <div class="flex gap-1 border-b border-border mb-3" role="tablist">
      {#each TABS as t (t.key)}
        <button
          role="tab" aria-selected={tab === t.key}
          class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                 {tab === t.key ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}"
          onclick={() => (tab = t.key)}>
          {t.label}
          <span class="ml-1 font-normal text-muted">
            {(t.key === 'have' ? data.haveSourceTotal : data.noSourceTotal) ?? '—'}
          </span>
        </button>
      {/each}
    </div>

    <p class="text-sm text-muted mb-3">{active.hint}</p>

    <table class="w-full text-sm">
      <thead><tr class="text-left text-muted border-b border-border">
        <th class="py-2 pr-3">Title</th>
        <th class="pr-3">Author</th>
        <th class="pr-3 text-right">¶</th>
        {#if tab === 'have'}<th class="pr-3">Source file</th>{/if}
        <th>Doc</th>
      </tr></thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr class="border-b border-border-subtle">
            <td class="py-2 pr-3">
              {#if r.source_url}<a class="text-accent hover:text-accent-hover" href={r.source_url} target="_blank" rel="noopener">{r.title}</a>
              {:else}<span class="text-primary">{r.title}</span>{/if}
              {#if r.kind === 'husk'}<span class="ml-2 text-xs text-muted" title="Doc record with zero paragraphs">husk</span>{/if}
            </td>
            <td class="pr-3 text-secondary">{r.author || '—'}</td>
            <td class="pr-3 text-right text-muted">{r.paras || '—'}</td>
            {#if tab === 'have'}
              <td class="pr-3">
                {#if r.file_url}<a class="text-accent hover:text-accent-hover font-medium" href={r.file_url} target="_blank" rel="noopener">{fileKind(r.file_url)} ↗</a>
                {:else}<span class="text-muted">—</span>{/if}
              </td>
            {/if}
            <td class="text-muted">#{r.id}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if !rows.length}
      <p class="text-muted py-6">Nothing in this queue.</p>
    {:else if total > rows.length}
      <p class="text-xs text-muted mt-3">Showing first {rows.length} of {total}.</p>
    {/if}

    <p class="text-xs text-muted mt-6">
      Computed {new Date(data.generated_at).toLocaleString()} · refreshes every 6h ·
      scanned {data.stubTotal ?? '—'} metadata stubs + {data.huskTotal ?? '—'} empty doc records{#if data.alreadyHeld},
      of which {data.alreadyHeld} already held elsewhere{/if}
    </p>
  {/if}
</div>
