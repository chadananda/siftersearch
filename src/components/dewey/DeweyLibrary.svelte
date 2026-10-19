<script>
  // Dewey's left column: the library at a glance (the Observatory's telemetry — documents and paragraphs per tradition,
  // each indexing stage) and the books it lists but does not hold (the missing-books triage snapshot).
  import { onMount } from 'svelte';
  import { observatory, dewey } from '../../lib/api.js';
  import { compact } from '../../lib/observatory.js';

  let { authed = false } = $props();   // the page draws at once; the signed-in reads start when sign-in is ready
  let snap = $state(null);
  let missing = $state(null);
  let tab = $state('wanted');
  let wanted = $state(null);   // Dewey's own wanted list (dewey_items), open first
  let found = $state([]), toBuy = $state([]), busy = $state(null);
  async function answer(it, yes) {
    busy = it.id;
    try { await (yes ? dewey.accept(it.id) : dewey.decline(it.id)); found = found.filter((x) => x.id !== it.id); } catch { /* stays listed */ }
    busy = null;
  }
  const searched = (it) => (it.identified?.scout?.channels || []).filter((c) => c.searched).map((c) => c.channel);

  onMount(() => { observatory.telemetry().then((r) => (snap = r.data.snapshot)).catch(() => {}); });   // public, edge-cached
  let asked = false;
  $effect(() => {
    if (!authed || asked) return;
    asked = true;
    dewey.missing().then((m) => (missing = m)).catch(() => (missing = { pending: true }));
    // only books still SOUGHT (no source yet) — once a source arrives the book is in the Loading column, not here
    // (Chad 10-18: "lots of the missing column say things like 'waits for OCR'. Does that mean it is loading in the other column?")
    // the SCOUTS' finds (planning/dewey-scouts-plan.md): copies found and checked (offered by dewey-scout) and works with
    // no downloadable copy anywhere (lead: readable elsewhere; to-buy: buy and scan)
    const loadWanted = () => dewey.items(1000).then((r) => {
      wanted = r.items.filter((i) => ['wanted', 'researched'].includes(i.state));
      found = r.items.filter((i) => i.state === 'offered' && ['dewey-scout', 'dewey-sweep'].includes(i.created_by));   // the scouts' finds and folder-sweep finds
      toBuy = r.items.filter((i) => ['to-buy', 'lead'].includes(i.state)).sort((a, b) => (b.identified?.scout?.importance ?? 3) - (a.identified?.scout?.importance ?? 3));
    }).catch(() => (wanted = []));
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
    {/if}
  </section>

  <section class="grow">
    <h2>Missing</h2>
    <div class="flex flex-wrap gap-1 mb-2 text-xs">
      <button class:on={tab === 'wanted'} class="pill" onclick={() => (tab = 'wanted')}>Wanted · {wanted?.length ?? '…'}</button>
      <button class:on={tab === 'found'} class="pill" onclick={() => (tab = 'found')}>Found · {found.length}</button>
      <button class:on={tab === 'buy'} class="pill" onclick={() => (tab = 'buy')}>To buy · {toBuy.length}</button>
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
    {:else if tab === 'found'}
      {#if !found.length}<p class="text-muted text-sm">Nothing found yet — the scouts add copies here as they find them.</p>
      {:else}
        <ul class="text-xs flex flex-col gap-2.5" role="list">
          {#each found as f (f.id)}
            {@const s = f.identified?.source}
            <li><span class="text-primary">{f.title}</span>{#if f.author}<span class="text-muted"> · {f.author}</span>{/if}
              {#if f.identified?.appraisal?.summary}<div class="text-secondary line-clamp-2">{f.identified.appraisal.summary}</div>{/if}
              <div class="text-muted">{#if s}<a class="text-accent" href={s.url} target="_blank" rel="noopener">{s.site}</a> · {s.kind}{#if s.note} · {s.note}{/if}{:else if f.created_by === 'dewey-sweep'}folder: {f.identified?.file_name}{/if} · {f.identified?.verdict || ''}{#if f.identified?.candidates?.[0]} · nearest: #{f.identified.candidates[0].id} {f.identified.candidates[0].title} ({f.identified.candidates[0].relation}){/if}</div>
              <div class="flex gap-1.5 mt-1"><button class="act yes" disabled={busy === f.id} onclick={() => answer(f, true)}>Add it</button><button class="act" disabled={busy === f.id} onclick={() => answer(f, false)}>No</button></div></li>
          {/each}
        </ul>
      {/if}
    {:else if tab === 'buy'}
      {#if !toBuy.length}<p class="text-muted text-sm">Nothing to buy — every work the scouts looked for so far was found or is held.</p>
      {:else}
        <ul class="text-xs flex flex-col gap-2.5" role="list">
          {#each toBuy as b (b.id)}
            <li><span class="text-primary">{b.title}</span>{#if b.author}<span class="text-muted"> · {b.author}</span>{/if}
              <div class="text-muted">{b.state === 'lead' ? 'readable elsewhere, not downloadable' : 'no copy anywhere — buy and scan'} · searched: {searched(b).join(', ') || '—'}</div>
              {#if b.identified?.scout?.why}<div class="text-secondary line-clamp-2">{b.identified.scout.why}</div>{/if}
              {#if b.state === 'lead'}<div>{#each (b.identified?.scout?.found || []).filter((x) => ['borrow', 'view', 'html'].includes(x.kind)).slice(0, 3) as l}<a class="text-accent mr-2" href={l.url} target="_blank" rel="noopener">{l.site} ({l.kind})</a>{/each}</div>{/if}
              {#if b.identified?.purchase?.text}<details><summary class="text-muted cursor-pointer">prices · who to ask</summary><p class="text-secondary whitespace-pre-line mt-1">{b.identified.purchase.text}</p></details>{/if}</li>
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
  .pill { padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); }
  .pill.on { background: var(--surface-2); color: var(--text-primary); }
  .act { padding: 0.1rem 0.55rem; border-radius: 0.4rem; border: 1px solid var(--border); color: var(--text-secondary); }
  .act.yes { border-color: var(--accent-primary); color: var(--accent-primary); }
  .act:disabled { opacity: 0.5; }
</style>
