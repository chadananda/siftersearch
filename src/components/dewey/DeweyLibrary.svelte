<script>
  // Dewey's left column: the library at a glance (the Observatory's telemetry — documents and paragraphs per tradition,
  // each indexing stage) and the books it lists but does not hold (the missing-books triage snapshot).
  import { onMount } from 'svelte';
  import { observatory, dewey } from '../../lib/api.js';
  import { compact, pct } from '../../lib/observatory.js';

  let { authed = false } = $props();   // the page draws at once; the signed-in reads start when sign-in is ready
  let snap = $state(null);
  let missing = $state(null);
  let tab = $state('wanted');
  let wanted = $state(null);   // Dewey's own wanted list (dewey_items), open first

  onMount(() => { observatory.telemetry().then((r) => (snap = r.data.snapshot)).catch(() => {}); });   // public, edge-cached
  let asked = false;
  $effect(() => {
    if (!authed || asked) return;
    asked = true;
    dewey.missing().then((m) => (missing = m)).catch(() => (missing = { pending: true }));
    const loadWanted = () => dewey.items().then((r) => (wanted = r.items)).catch(() => (wanted = []));
    loadWanted(); const t = setInterval(loadWanted, 30000); return () => clearInterval(t);
  });
  const STATE = { wanted: 'researching', researched: 'researched', source: 'source attached', processing: 'processing', ingested: 'in the library',
    'needs-ocr': 'waits for OCR', 'needs-human': 'needs a person', failed: 'failed' };
  const LABEL = { "Baha'i": 'Bahá’í', Tao: 'Taoist' };
  const rows = $derived((tab === 'have' ? missing?.haveSource : missing?.noSource) ?? []);
</script>

<aside class="col" aria-label="The library">
  <section>
    <h2>Library</h2>
    {#if !snap}<p class="text-muted text-sm">Loading…</p>{:else}
      <p class="text-primary text-sm"><strong>{compact(snap.corpus.documents)}</strong> documents · <strong>{compact(snap.corpus.paragraphs)}</strong> paragraphs · {snap.corpus.traditions} traditions</p>
      <table class="w-full text-xs mt-2">
        <tbody>
          {#each snap.traditions as t (t.id)}
            <tr><td class="text-secondary py-0.5">{LABEL[t.id] || t.id}</td><td class="text-right text-primary tabular-nums">{compact(t.documents)}</td><td class="text-right text-muted tabular-nums pl-2">{compact(t.paragraphs)} ¶</td></tr>
          {/each}
        </tbody>
      </table>
      <h3>Indexing</h3>
      <ul class="text-xs flex flex-col gap-1">
        {#each snap.rings.filter((r) => !r.planned) as r (r.id)}
          <li class="flex items-center gap-2"><span class="w-28 text-secondary truncate" title={r.label}>{r.label}</span>
            <span class="flex-1 h-1.5 rounded bg-surface-2 overflow-hidden"><span class="block h-full bg-accent" style={`width:${Math.min(100, (100 * r.done) / (r.total || 1))}%`}></span></span>
            <span class="w-12 text-right tabular-nums text-primary">{pct(r.done, r.total)}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="grow">
    <h2>Missing</h2>
    <div class="flex flex-wrap gap-1 mb-2 text-xs">
      <button class:on={tab === 'wanted'} class="pill" onclick={() => (tab = 'wanted')}>Wanted · {wanted?.filter((i) => i.state !== 'ingested').length ?? '…'}</button>
      <button class:on={tab === 'have'} class="pill" onclick={() => (tab = 'have')}>Catalogue, have source · {missing?.haveSourceTotal ?? '…'}</button>
      <button class:on={tab === 'none'} class="pill" onclick={() => (tab = 'none')}>Catalogue, no source · {missing?.noSourceTotal ?? '…'}</button>
    </div>
    {#if tab === 'wanted'}
      {#if !wanted}<p class="text-muted text-sm">Loading…</p>
      {:else if !wanted.length}<p class="text-muted text-sm">Nothing wanted yet — tell Dewey about a book that is not here.</p>
      {:else}
        <ul class="text-xs flex flex-col gap-2" role="list">
          {#each wanted as w (w.id)}
            <li><span class="text-primary">{w.title}</span>{#if w.author}<span class="text-muted"> · {w.author}</span>{/if}
              <div class="text-muted">{STATE[w.state] || w.state}{#if w.research?.isbn13} · ISBN {w.research.isbn13}{/if}{#if w.research?.year} · {w.research.year}{/if}{#if w.doc_id} · <a class="text-accent" href="/document/{w.doc_id}">open</a>{/if}</div></li>
          {/each}
        </ul>
      {/if}
    {:else if !missing}<p class="text-muted text-sm">Loading…</p>
    {:else if missing.pending}<p class="text-muted text-sm">The catalogue's missing-books list has not been computed yet.</p>
    {:else}
      <ul class="text-xs flex flex-col gap-1.5" role="list">
        {#each rows as m, i (m.id ?? i)}
          <li><span class="text-primary">{m.title || 'Untitled'}</span>{#if m.author}<span class="text-muted"> · {m.author}</span>{/if}</li>
        {/each}
      </ul>
    {/if}
  </section>
</aside>

<style>
  .col { display: flex; flex-direction: column; gap: 1rem; height: 100%; min-height: 0; overflow-y: auto; padding-right: 0.25rem; }
  section { border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); padding: 0.75rem; }
  section.grow { flex: 1; min-height: 12rem; }
  h2 { font-weight: 600; color: var(--text-primary); margin-bottom: 0.4rem; }
  h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0.75rem 0 0.4rem; }
  .pill { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); }
  .pill.on { background: var(--surface-2); color: var(--text-primary); }
</style>
