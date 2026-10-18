<script>
  // The import board under the dial (Chad 10-18: "a small section for current activity details … progress stages of each
  // new book we are importing … the flow of new material and what we do for each"; SearchLayerPDF's work receipt as books
  // move through). GET /api/observatory/imports every 15 s; oncounts(counts) feeds stage 01's card. Inherits the
  // Observatory's --obs-* palette.
  import { onMount } from 'svelte';
  import { observatory } from '../../lib/api.js';

  let { oncounts = () => {} } = $props();
  let board = $state(null);
  let now = $state(Date.now());

  async function load() {
    try { board = await observatory.imports(); oncounts(board.counts); } catch { /* the board is a nicety; the page stands without it */ }
  }
  onMount(() => {
    load();
    const poll = setInterval(load, 15000), tick = setInterval(() => { now = Date.now(); }, 15000);
    return () => { clearInterval(poll); clearInterval(tick); };
  });

  const ago = (iso) => { const s = (now - new Date(iso).getTime()) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  const pctOf = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const mins = (ms) => (ms == null ? '' : ms < 90000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);
</script>

<section class="imports" aria-label="Import activity">
  <h2>Import activity <span class="h-sub">new books, stage by stage</span></h2>
  {#if board}
    <div class="counts mono">
      <span><b>{board.counts.imported_24h}</b> added today</span>
      <span><b>{board.counts.in_progress}</b> in progress</span>
      {#if board.counts.ocr}<span><b>{board.counts.ocr}</b> at OCR</span>{/if}
      {#if board.counts.waiting}<span class="wait"><b>{board.counts.waiting}</b> for review</span>{/if}
      <span class="dim">{board.counts.imported_7d} this week</span>
    </div>
    {#if !board.items.length}
      <p class="dim empty">No new books in the last two days.</p>
    {:else}
      <ol class="rows">
        {#each board.items as it (it.id)}
          <li class="row" class:live={['processing', 'needs-ocr', 'source'].includes(it.state)}>
            <div class="top">
              {#if it.doc_id}<a class="title" href="/document/{it.doc_id}">{it.title}</a>{:else}<span class="title">{it.title}</span>{/if}
              <span class="when mono">{ago(it.updated_at)}</span>
            </div>
            <div class="meta">{[it.author, it.shelf].filter(Boolean).join(' · ')}</div>
            <div class="chips mono" aria-label="Stages">
              {#each it.stages as s (s.key)}<span class="chip {s.state}" class:index={s.index} title="{s.label}: {s.state}">{s.label}</span>{/each}
            </div>
            <div class="now mono"><span class="state {it.state}">{it.now}</span>{#if it.last && it.state !== 'ingested'} — {it.last}{/if}</div>
            {#if it.ocr && !it.ocr.done && !it.ocr.rejected && it.ocr.pages_total}
              <div class="ocr-live mono">OCR {it.ocr.pages_done ?? 0}/{it.ocr.pages_total} pages{#if it.ocr.stage} · {it.ocr.stage}{/if}
                <span class="obar"><span style={`width:${Math.min(100, (100 * (it.ocr.pages_done || 0)) / it.ocr.pages_total)}%`}></span></span></div>
            {/if}
            {#if it.ocr?.receipt}
              {@const r = it.ocr.receipt}
              <details class="receipt">
                <summary class="mono">OCR receipt · {r.document?.pages} p · quality {pctOf(r.quality?.before)} → {pctOf(r.quality?.after)}{#if r.processing?.ms} · {mins(r.processing.ms)}{/if}{#if r.processing?.cost_usd != null} · ${r.processing.cost_usd.toFixed(3)}{/if}{#if it.ocr.rejected} · <span class="fail">held for review</span>{/if}</summary>
                {#if r.narrative}<p>{r.narrative}</p>{/if}
                {#if r.processing?.method}<p class="mono dim">{r.processing.method}</p>{/if}
                {#if it.ocr.check}<p class="mono dim">checked: {it.ocr.check.words?.toLocaleString('en-US')} words · {it.ocr.check.per_page}/page{#if it.ocr.check.sample_found != null} · our own sampled pages {pctOf(it.ocr.check.sample_found)} found{/if}</p>{/if}
                {#if it.ocr.rejected && it.ocr.why?.length}<p class="fail">{it.ocr.why.join('; ')}</p>{/if}
                {#each r.warnings || [] as w}<p class="wait">⚠ {typeof w === 'string' ? w : w.message || JSON.stringify(w)}</p>{/each}
              </details>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {:else}
    <p class="dim empty mono">…</p>
  {/if}
</section>

<style>
  .imports { margin-top: 14px; border-radius: 18px; padding: 13px 14px 12px; display: flex; flex-direction: column; gap: 9px;
    background: var(--obs-panel); border: 1px solid var(--obs-line); backdrop-filter: var(--glass-blur); }
  h2 { margin: 0; font: 600 12px/1.2 var(--obs-sans); letter-spacing: 0.16em; text-transform: uppercase; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .h-sub { font-weight: 400; letter-spacing: 0.04em; text-transform: none; color: var(--obs-text-dim); }
  .mono { font-family: var(--obs-mono); font-variant-numeric: tabular-nums; }
  .counts { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: var(--obs-text-dim); }
  .counts b { color: var(--obs-text); font-weight: 600; }
  .dim { color: var(--obs-text-faint); }
  .empty { font-size: 12px; margin: 0; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; max-height: 520px; overflow-y: auto; }
  .row { display: flex; flex-direction: column; gap: 3px; padding: 8px 0 0; border-top: 1px solid var(--obs-line); }
  .row.live .title::before { content: '◉ '; color: var(--obs-sweep); }
  .top { display: flex; gap: 10px; align-items: baseline; }
  .title { flex: 1; min-width: 0; font-weight: 600; font-size: 13px; color: var(--obs-text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a.title:hover { color: var(--obs-accent); }
  .when { font-size: 10.5px; color: var(--obs-text-faint); white-space: nowrap; }
  .meta { font-size: 11px; color: var(--obs-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; margin: 2px 0; }
  .chip { font-size: 10px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--obs-line); color: var(--obs-text-faint); }
  .chip.index { border-style: dashed; }
  .chip.done { color: var(--obs-text); border-color: transparent; background: color-mix(in srgb, var(--obs-afterglow) 26%, transparent); }
  .chip.active { color: var(--obs-text); border-color: var(--obs-sweep); animation: breathe 1.6s ease-in-out infinite; }
  .chip.wait { color: var(--obs-text); border-color: transparent; background: color-mix(in srgb, var(--obs-bahai) 26%, transparent); }
  .chip.fail { color: var(--obs-text); border-color: transparent; background: color-mix(in srgb, var(--obs-christian) 26%, transparent); }
  .now { font-size: 11px; color: var(--obs-text-dim); line-height: 1.35; }
  .state.ingested { color: var(--obs-afterglow); } .state.failed { color: var(--obs-christian); } .state.needs-human { color: var(--obs-bahai); }
  .state.needs-ocr, .state.processing, .state.source { color: var(--obs-sweep); }
  .wait { color: var(--obs-bahai); } .fail { color: var(--obs-christian); }
  .ocr-live { font-size: 11px; color: var(--obs-sweep); display: flex; align-items: center; gap: 8px; }
  .obar { flex: 1; max-width: 160px; height: 3px; border-radius: 2px; background: var(--obs-line); overflow: hidden; }
  .obar span { display: block; height: 100%; background: var(--obs-sweep); }
  .receipt { font-size: 11.5px; color: var(--obs-text-dim); }
  .receipt summary { cursor: pointer; font-size: 11px; color: var(--obs-text-dim); }
  .receipt p { margin: 5px 0 0; line-height: 1.45; }
  @keyframes breathe { 50% { opacity: 0.55; } }
  @media (prefers-reduced-motion: reduce) { .chip.active { animation: none; } }
</style>
