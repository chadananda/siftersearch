<script>
  // Dewey's left column: the library at a glance (the Observatory's telemetry — documents and paragraphs per tradition,
  // each indexing stage) and the books it lists but does not hold (the missing-books triage snapshot).
  import { onMount } from 'svelte';
  import { observatory, dewey } from '../../lib/api.js';
  import { compact, pct } from '../../lib/observatory.js';

  let snap = $state(null);
  let missing = $state(null);
  let tab = $state('have');

  onMount(async () => {
    observatory.telemetry().then((r) => (snap = r.data.snapshot)).catch(() => {});
    dewey.missing().then((m) => (missing = m)).catch(() => (missing = { pending: true }));
  });
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
          <li class="flex items-center gap-2"><span class="w-20 text-secondary truncate">{r.label}</span>
            <span class="flex-1 h-1.5 rounded bg-surface-2 overflow-hidden"><span class="block h-full bg-accent" style={`width:${Math.min(100, (100 * r.done) / (r.total || 1))}%`}></span></span>
            <span class="w-12 text-right tabular-nums text-primary">{pct(r.done, r.total)}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="grow">
    <h2>Known missing</h2>
    {#if !missing}<p class="text-muted text-sm">Loading…</p>
    {:else if missing.pending}<p class="text-muted text-sm">The missing-books list has not been computed yet.</p>
    {:else}
      <div class="flex gap-1 mb-2 text-xs">
        <button class:on={tab === 'have'} class="pill" onclick={() => (tab = 'have')}>Have a source · {missing.haveSourceTotal ?? 0}</button>
        <button class:on={tab === 'none'} class="pill" onclick={() => (tab = 'none')}>No source · {missing.noSourceTotal ?? 0}</button>
      </div>
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
