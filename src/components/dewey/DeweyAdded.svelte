<script>
  // Dewey's right column: his INTAKE ACTIVITY (Chad 10-17: "documents we are loading now or have very recently loaded") —
  // works with a source attached, processing, waiting for OCR, failed, or just ingested (GET /api/dewey/activity); once a
  // work is a document, its indexing stages from the coverage ledger. A stage reads done when it covers the book or is not
  // needed for it.
  import { dewey } from '../../lib/api.js';
  import DeweyReview from './DeweyReview.svelte';

  let { authed = false, oncount = () => {} } = $props();   // oncount(n): works being processed now (the edge button's badge)
  let items = $state(null);
  let error = $state(null);
  let reviewing = $state(null);   // the item open in the Review popup
  async function load() {
    try { items = (await dewey.activity(30)).items; error = null; oncount(items.filter((i) => ['source', 'processing'].includes(i.state)).length, items.length); } catch (e) { error = e.message; }
  }
  // every 10 s while something is loading; otherwise about once a minute
  $effect(() => {
    if (!authed) return;
    load();
    let n = 0;
    const t = setInterval(() => { n++; if (items?.some((i) => ['source', 'processing', 'needs-ocr'].includes(i.state)) || n % 6 === 0) load(); }, 10000);
    return () => clearInterval(t);
  });

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
    if (!total) return 'done';
    return done >= total ? 'done' : done > 0 ? 'part' : 'none';
  }
  const LABEL = { source: 'Queued to load', processing: 'Loading…', ingested: 'In the library', 'needs-ocr': 'Scan — being read (OCR)', 'needs-human': 'Needs a person', failed: 'Failed' };
  const TONE = { processing: 'text-warning', source: 'text-warning', ingested: 'text-success', failed: 'text-error', 'needs-human': 'text-error', 'needs-ocr': 'text-warning' };
  const ago = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
</script>

<aside class="col" aria-label="Loading now">
  <h2>Loading{#if items?.some((i) => ['source', 'processing'].includes(i.state))} <span class="count">{items.filter((i) => ['source', 'processing'].includes(i.state)).length}</span>{/if}</h2>
  {#if error}<p class="text-error text-sm">{error}</p>
  {:else if !items}<p class="text-muted text-sm">…</p>
  {:else if !items.length}<p class="text-muted text-sm">Nothing loading yet. Attach a PDF or a link to a wanted book and it shows here while Dewey brings it in.</p>
  {:else}
    <ul class="flex flex-col gap-2" role="list">
      {#each items as it (it.id)}
        <li class="item">
          {#if it.doc_id}<a href="/document/{it.doc_id}" class="text-primary text-sm font-medium hover:text-accent line-clamp-2">{it.title}</a>
          {:else}<span class="text-primary text-sm font-medium line-clamp-2">{it.title}</span>{/if}
          {#if it.state === 'ingested'}
            <!-- a plain answer to "is it loaded?" (Chad 10-18) — no index-layer jargon -->
            <div class="text-xs">{#if it.searchable}<span class="text-success">✓ Loaded — in the library and searchable</span>{:else}<span class="text-warning">Added — being indexed for search…</span>{/if}<span class="text-muted"> · {ago(it.updated_at)}</span></div>
            {#if it.searchable && !it.vectors_done}<div class="text-xs text-muted">Meaning search follows in the background</div>{/if}
          {:else}
            <div class="text-xs"><span class={TONE[it.state] || 'text-secondary'}>{LABEL[it.state] || it.state}</span><span class="text-muted"> · {ago(it.updated_at)}</span></div>
          {/if}
          {#if it.last && it.state !== 'ingested'}<div class="text-xs text-muted line-clamp-3">{it.last}</div>{/if}
          {#if !it.layers && it.stages}
            <!-- before it is a document (10-18: "the loading column does not show progress"): checked → appraised → OCR → imported -->
            <div class="stages" aria-label="Progress">
              {#each it.stages.filter((s) => !s.index) as s (s.key)}<span class="stage {s.state}" title="{s.label}: {s.state}">{s.label}</span>{/each}
            </div>
          {/if}
          {#if it.ocr && !it.ocr.done && !it.ocr.rejected && it.ocr.pages_total}
            <div class="ocr text-xs"><span>OCR {it.ocr.pages_done ?? 0}/{it.ocr.pages_total} pages{#if it.ocr.stage} · {it.ocr.stage}{/if}</span>
              <span class="bar"><span style={`width:${Math.min(100, (100 * (it.ocr.pages_done || 0)) / it.ocr.pages_total)}%`}></span></span></div>
          {/if}
          {#if ['needs-human', 'failed'].includes(it.state)}
            <button class="review" onclick={() => (reviewing = it.id)}>Review &amp; answer →</button>
          {/if}
          {#if it.layers && it.state === 'ingested' && !it.searchable}
            <div class="stages" aria-label="Indexing stages">
              {#each STAGES as s (s[0])}
                {@const st = stageOf(it.layers, s)}
                <span class="stage {st}" title="{s[0]}: {st === 'done' ? 'done' : st === 'part' ? 'in progress' : 'not yet'}">{s[0]}</span>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>
{#if reviewing}<DeweyReview id={reviewing} onclose={() => (reviewing = null)} ondone={load} />{/if}

<style>
  .col { height: 100%; min-height: 0; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); padding: 0.75rem; }
  h2 { font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
  .count { display: inline-block; min-width: 1.4rem; padding: 0 0.4rem; border-radius: 999px; background: var(--accent-primary); color: white; font-size: 0.8rem; text-align: center; }
  .item { padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-subtle); }
  .stages { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem; }
  .stage { font-size: 0.65rem; padding: 0.05rem 0.35rem; border-radius: 0.25rem; border: 1px solid var(--border-subtle); color: var(--text-muted); }
  .stage.done { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--text-primary); border-color: transparent; }
  .stage.active { color: var(--text-primary); border-color: var(--warning); }
  .stage.wait { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--text-primary); border-color: transparent; }
  .stage.fail { background: color-mix(in srgb, var(--error) 18%, transparent); color: var(--text-primary); border-color: transparent; }
  .ocr { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; color: var(--warning); }
  .bar { flex: 1; max-width: 9rem; height: 3px; border-radius: 2px; background: var(--border-subtle); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--warning); }
  .review { margin-top: 0.35rem; font-size: 0.75rem; font-weight: 500; padding: 0.2rem 0.6rem; border-radius: 0.4rem; border: 1px solid var(--accent-primary); color: var(--accent-primary); }
  .review:hover { background: var(--accent-primary); color: white; }
  .stage.part { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--text-primary); border-color: transparent; }
</style>
