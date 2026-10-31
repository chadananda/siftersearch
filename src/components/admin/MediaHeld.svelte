<script>
  // Held remasters (Chad 10-31): remasters judged worse than the original wait here. Listen A/B at the flagged excerpts, then Publish (the remaster
  // goes on air) or Archive (out of every queue, files kept for better technology). Deps: api.admin.getMediaHeld / decideMediaHeld.
  import { admin } from '../../lib/api.js';

  let data = $state(null), error = $state(null), busy = $state({}), tab = $state('held');
  const load = () => admin.getMediaHeld().then((d) => (data = d)).catch((e) => (error = e.message));
  $effect(() => { load(); });
  const mins = (s) => (s ? `${Math.round(s / 60)} min` : '');
  const at = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const pair = (a) => (a && a[0] != null ? `${a[0]} → ${a[1]}` : '—');
  async function decide(row, choice) {
    if (choice === 'archive' && !confirm(`Archive "${row.title}"? It leaves every queue; the files are kept.`)) return;
    busy = { ...busy, [row.slug]: choice };
    try { await admin.decideMediaHeld([{ slug: row.slug, choice }]); data = { ...data, held: data.held.filter((x) => x.slug !== row.slug), archived: data.archived.filter((x) => x.slug !== row.slug) }; setTimeout(load, 15000); }
    catch (e) { error = e.message; } finally { busy = { ...busy, [row.slug]: null }; }
  }
  const rows = $derived(tab === 'held' ? data?.held || [] : data?.archived || []);
</script>

<div class="p-6 max-w-5xl">
  <h1 class="text-2xl font-semibold text-primary mb-1">Held remasters</h1>
  <p class="text-muted mb-4">Every talk plays its remaster, never the original. These remasters measured worse than the original, so they wait for you. Publish puts the remaster on air; Archive removes the talk from every queue and keeps the files for later technology.</p>
  {#if error}<p class="text-error mb-4">{error}</p>{/if}
  {#if data}
    <div class="mb-4 flex gap-2 items-center">
      <button class="rounded-lg border border-border px-3 py-1.5 {tab === 'held' ? 'bg-surface-2 text-primary' : 'text-secondary'}" onclick={() => (tab = 'held')}>Held ({data.counts.held})</button>
      <button class="rounded-lg border border-border px-3 py-1.5 {tab === 'archived' ? 'bg-surface-2 text-primary' : 'text-secondary'}" onclick={() => (tab = 'archived')}>Archived ({data.counts.archived})</button>
      {#if data.counts.unjudged}<span class="text-sm text-muted">{data.counts.unjudged} not yet judged</span>{/if}
      {#if data.rejudge}<span class="text-sm text-muted">judged so far: {data.rejudge.publish || 0} published · {data.rejudge.hold || 0} held · {data.rejudge.rerun || 0} redone · {data.rejudge.requeued || 0} requeued</span>{/if}
    </div>
    {#if !rows.length}<p class="text-muted">Nothing here.</p>{/if}
    {#each rows as row (row.slug)}
      <section class="mb-5 rounded-xl border border-border-subtle bg-surface-1 p-4">
        <div class="flex flex-wrap items-baseline gap-x-3">
          <a class="font-medium text-accent hover:text-accent-hover" href={row.page} target="_blank" rel="noopener">{row.title}</a>
          <span class="text-secondary">{row.speaker || ''}</span><span class="text-muted text-sm">{mins(row.duration_s)}{row.grade ? ` · grade ${row.grade}` : ''}</span>
        </div>
        <p class="mt-1 text-sm text-primary">{row.reason}</p>
        {#if row.scores}
          <p class="mt-1 text-sm text-muted">Speech quality (NISQA) {pair(row.scores.nisqa)} · overall (DNSMOS) {pair(row.scores.dnsmos_overall)} · speech (DNSMOS) {pair(row.scores.dnsmos_speech)}</p>
        {/if}
        {#each row.excerpts as e (e.start_s + e.note)}
          <div class="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_1fr] items-center text-sm">
            <span class="text-secondary">{at(e.start_s)} · {e.note}</span>
            <label class="text-muted">Original <audio controls preload="none" class="w-full" src={e.original_url}></audio></label>
            <label class="text-muted">Remaster <audio controls preload="none" class="w-full" src={e.remaster_url}></audio></label>
          </div>
        {/each}
        <div class="mt-3 flex gap-2">
          {#if row.status === 'held'}
            <button class="rounded-lg bg-accent px-3 py-1.5 text-white disabled:opacity-50" disabled={!!busy[row.slug]} onclick={() => decide(row, 'publish')}>{busy[row.slug] === 'publish' ? 'Publishing…' : 'Publish'}</button>
            <button class="rounded-lg border border-border px-3 py-1.5 text-secondary disabled:opacity-50" disabled={!!busy[row.slug]} onclick={() => decide(row, 'archive')}>{busy[row.slug] === 'archive' ? 'Archiving…' : 'Archive'}</button>
          {:else}
            <button class="rounded-lg border border-border px-3 py-1.5 text-secondary disabled:opacity-50" disabled={!!busy[row.slug]} onclick={() => decide(row, 'unarchive')}>Try again (back to held)</button>
          {/if}
        </div>
      </section>
    {/each}
  {:else if !error}<p class="text-muted">Loading…</p>{/if}
</div>
