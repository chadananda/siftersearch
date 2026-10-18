<script>
  // Dewey's right column: recently added books and where each stands in every indexing stage — the coverage ledger per
  // document (GET /api/dewey/recent). A stage reads done when it covers the book or is not needed for it (Chad 10-17).
  import { dewey } from '../../lib/api.js';
  import { compact } from '../../lib/observatory.js';

  let { authed = false } = $props();
  let docs = $state(null);
  let error = $state(null);
  async function load() { try { docs = (await dewey.recent(30)).docs; error = null; } catch (e) { error = e.message; } }
  $effect(() => { if (!authed) return; load(); const t = setInterval(load, 60000); return () => clearInterval(t); });

  // per layer: [label, done?, partial ratio] — the same measures as the dial
  const STAGES = [
    ['Text', (l) => l.text, (r) => [r.generated, r.total]],
    ['Structure', (l) => l.sections, (r) => [r.generated, r.total]],
    ['BM25', (l) => l.keyword, (r) => [Math.min(r.indexed, r.total), r.total]],
    ['Refs', (l) => l.refs, (r) => [r.current, r.total]],
    ['Vectors', (l) => l.embedding, (r) => [r.generated, r.total]],
    ['Phrases', (l) => l.phrase, (r) => [r.indexed > 0 ? r.total : 0, r.total]],
    ['HyPE', (l) => l.hype, (r) => [r.generated, r.total]],
  ];
  function stageOf(layers, [, pick, of]) {   // not "state": Svelte would read $state as that store
    const r = pick(layers);
    if (!r) return 'none';
    const [done, total] = of(r);
    if (!total) return 'done';          // nothing to do for this book: not needed counts as done
    return done >= total ? 'done' : done > 0 ? 'part' : 'none';
  }
  const ago = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 3600 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; };
</script>

<aside class="col" aria-label="Added books">
  <h2>Added</h2>
  {#if error}<p class="text-error text-sm">{error}</p>
  {:else if !docs}<p class="text-muted text-sm">Loading…</p>
  {:else}
    <ul class="flex flex-col gap-2" role="list">
      {#each docs as d (d.id)}
        <li class="item">
          <a href="/document/{d.id}" class="text-primary text-sm font-medium hover:text-accent line-clamp-2">{d.title || 'Untitled'}</a>
          <div class="text-xs text-muted">{[d.author, d.religion, `${compact(d.paragraph_count || 0)} ¶`, `${ago(d.created_at)} ago`].filter(Boolean).join(' · ')}</div>
          <div class="stages" aria-label="Indexing stages">
            {#each STAGES as s (s[0])}
              {@const st = stageOf(d.layers, s)}
              <span class="stage {st}" title="{s[0]}: {st === 'done' ? 'done' : st === 'part' ? 'in progress' : 'not yet'}">{s[0]}</span>
            {/each}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .col { height: 100%; min-height: 0; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); padding: 0.75rem; }
  h2 { font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
  .item { padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-subtle); }
  .stages { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem; }
  .stage { font-size: 0.65rem; padding: 0.05rem 0.35rem; border-radius: 0.25rem; border: 1px solid var(--border-subtle); color: var(--text-muted); }
  .stage.done { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--text-primary); border-color: transparent; }
  .stage.part { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--text-primary); border-color: transparent; }
</style>
