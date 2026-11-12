<script>
  // Corrections log (implied_edits): who changed what, with before/after of the fields that differ.
  import { api } from './api.js';
  import { asOfText } from './util.js';
  let edits = $state(null), error = $state('');
  $effect(() => { api.edits(100).then((r) => (edits = r.edits)).catch((e) => (error = e.message)); });
  const FIELDS = ['question', 'premise', 'implies', 'proof', 'concept', 'status', 'note'];
  const diff = (e) => FIELDS.filter((f) => JSON.stringify(e.before?.[f]) !== JSON.stringify(e.after?.[f]) && (e.before?.[f] != null || e.after?.[f] != null));
</script>
{#if error}<p class="text-error">{error}</p>{/if}
{#if !edits && !error}<p class="text-muted">Loading…</p>
{:else if edits && !edits.length}<p class="text-muted text-center py-12">No corrections yet. Every approve, edit, reject or addition is recorded here.</p>
{:else if edits}
  <ul class="log">
    {#each edits as e (e.id)}
      <li><header><b>{e.action}</b><span>{e.editor || 'system'} · {asOfText(e.at)}</span></header>
        {#each diff(e) as f (f)}<div class="d"><i>{f}</i><del>{e.before?.[f] ?? ''}</del><ins>{e.after?.[f] ?? ''}</ins></div>{/each}
        {#if e.note}<p class="text-muted text-sm">{e.note}</p>{/if}</li>
    {/each}
  </ul>
{/if}
<style>
  .log { list-style: none; display: grid; gap: .6rem; max-width: 70rem; } li { background: var(--surface-1); border: 1px solid var(--border-default); border-radius: .75rem; padding: .75rem 1rem; }
  header { display: flex; justify-content: space-between; font-size: .8rem; color: var(--text-muted); } header b { color: var(--accent); text-transform: uppercase; letter-spacing: .08em; }
  .d { display: grid; grid-template-columns: 6rem 1fr 1fr; gap: .75rem; font-size: .85rem; margin-top: .35rem; } .d i { color: var(--text-muted); font-style: normal; } del { color: var(--error); text-decoration-thickness: 1px; } ins { color: var(--success); text-decoration: none; }
</style>
