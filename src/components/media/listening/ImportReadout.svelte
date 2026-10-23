<script>
  // THE LIVE READOUT (the Fireside Room's subtitle, Chad 10-22: "understand instantly that this is a rapidly growing
  // collection"): LIVE · importing lamp, "N talks on the air · M processing · +K an hour" on odometers that roll when the
  // numbers change, a segmented bar (on the air / in progress / queued), hours and voices on the air, and the breakdown by source on tap.
  // SSR'd from GET /api/media/progress; refreshed every 45 s while on screen. Reduced motion: static.
  import { onMount } from 'svelte';
  import Odometer from './Odometer.svelte';
  import { media } from '../../../lib/api.js';
  import { readout, headline, fmt, etaText } from '../../../lib/media-progress.js';

  let { progress = null, stats = {} } = $props();
  let data = $state(progress);
  let open = $state(false);
  let root;
  const h = $derived(headline(data));
  const r = $derived(readout(data));
  const eta = $derived(r ? etaText(r.eta) : '');
  const pct = (x) => (h.total ? (100 * x) / h.total : 0);

  onMount(() => {
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(root);
    const t = setInterval(async () => {
      if (!visible || document.hidden) return;
      try { const res = await fetch(media.href('/api/media/progress')); if (res.ok) data = await res.json(); } catch { /* keep the last numbers */ }
    }, 45_000);
    return () => { clearInterval(t); io.disconnect(); };
  });
</script>

<div bind:this={root} class="readout">
  {#if h.total}
    <p class="live"><span class="lamp" aria-hidden="true"></span>Live · importing</p>
    <p class="headline">
      <span class="num"><Odometer value={h.published} label="talks on the air" /></span> talks on the air
      <span class="dot" aria-hidden="true">·</span> <span class="num"><Odometer value={h.total} label="processing" /></span> processing
      {#if h.perHour}<span class="dot" aria-hidden="true">·</span> <span class="num plus">+{Math.round(h.perHour)}</span> an hour{/if}
      {#if h.today}<span class="today">added today: {fmt(h.today)}</span>{/if}
    </p>
    <div class="seg" role="img" aria-label={`${fmt(h.published)} on the air, ${fmt(h.inProgress)} in progress, ${fmt(h.queued)} queued, of ${fmt(h.total)}`}>
      <i class="s-pub" style={`width:${pct(h.published)}%`}></i><i class="s-prog" style={`width:${pct(h.inProgress)}%`}></i>
    </div>
    <p class="legend">
      <span><b class="k pub"></b>on the air {fmt(h.published)}</span><span><b class="k prog"></b>in progress {fmt(h.inProgress)}</span><span><b class="k q"></b>queued {fmt(h.queued)}</span>
      {#if stats.hours || stats.voices}<span class="eta">{[stats.hours ? `${stats.hours} hours` : '', stats.voices ? `${stats.voices} voices` : '', stats.span || ''].filter(Boolean).join(' · ')} to hear</span>{/if}
      {#if eta}<span class="eta">{eta}</span>{/if}
      <button type="button" class="src-btn" aria-expanded={open} onclick={() => (open = !open)}>by source</button>
    </p>
    {#if open && r}
      <div class="sources" role="region" aria-label="Progress by source">
        {#each r.sources as src (src.key)}
          {@const p = src.stages.find((x) => x.key === 'published')}
          {@const d = src.stages.find((x) => x.key === 'downloaded')}
          <div class="src">
            <span class="s-name">{src.label}</span>
            <span class="s-count">{fmt(p?.count ?? 0)} on the air · {fmt(src.total)}</span>
            <span class="s-bar" aria-hidden="true"><i class="d" style={`transform:scaleX(${d?.frac ?? 0})`}></i><i class="p" style={`transform:scaleX(${p?.frac ?? 0})`}></i></span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="legend">Talks with word-aligned, searchable transcripts; every quotation linked to its source.</p>
  {/if}
</div>

<style>
  .readout { margin-top: 0.9rem; color: var(--radio-on-dark); max-width: 56rem; position: relative; }
  .live { display: inline-flex; align-items: center; gap: 0.5rem; font: 700 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.24em; text-transform: uppercase; color: var(--radio-brass-bright); }
  .lamp { width: 0.6rem; height: 0.6rem; border-radius: 9999px; background: var(--radio-needle); box-shadow: 0 0 10px 2px var(--radio-needle); animation: lamp 1.8s ease-in-out infinite; }
  @keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .headline { margin-top: 0.4rem; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.15rem 0.45rem; font: 400 1.2rem/1.25 'Gloock', 'Gloock Fallback', Georgia, serif; }
  @media (min-width: 640px) { .headline { font-size: 1.45rem; } }
  .num { font: 800 1.9rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.02em; color: var(--radio-amber); text-shadow: 0 0 18px var(--radio-glow); }
  @media (min-width: 640px) { .num { font-size: 2.4rem; } }
  .dot { opacity: 0.5; }
  .today { align-self: center; margin-left: 0.3rem; padding: 0.15rem 0.6rem; border-radius: 9999px; font: 700 0.78rem/1.4 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.12em;
    text-transform: uppercase; box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .seg { position: relative; display: flex; height: 7px; margin-top: 0.7rem; border-radius: 4px; overflow: hidden; background: color-mix(in srgb, var(--radio-on-dark) 14%, transparent); }
  .seg i { height: 100%; transition: width 1.2s cubic-bezier(0.3, 0.7, 0.4, 1); }
  .s-pub { background: var(--radio-amber); box-shadow: 0 0 10px var(--radio-glow); min-width: 3px; }
  .s-prog { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--radio-amber) 55%, transparent) 0 4px, color-mix(in srgb, var(--radio-amber) 30%, transparent) 4px 8px);
    background-size: 22px 100%; animation: flow 1.4s linear infinite; min-width: 3px; }
  @keyframes flow { to { background-position: 22px 0; } }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; margin-top: 0.45rem; font-size: 0.85rem; opacity: 0.9; }
  .legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .k { width: 0.65rem; height: 0.4rem; border-radius: 2px; display: inline-block; }
  .k.pub { background: var(--radio-amber); } .k.prog { background: color-mix(in srgb, var(--radio-amber) 45%, transparent); } .k.q { background: color-mix(in srgb, var(--radio-on-dark) 22%, transparent); }
  .eta { opacity: 0.8; }
  .src-btn { font-weight: 600; text-decoration: underline; text-decoration-color: var(--radio-brass-bright); text-underline-offset: 3px; }
  .src-btn:hover, .src-btn[aria-expanded='true'] { color: var(--radio-amber); }
  .src-btn:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .sources { position: absolute; z-index: 20; left: 0; right: 0; margin-top: 0.6rem; padding: 0.8rem 1rem; border-radius: 0.9rem; background: var(--radio-walnut-deep);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), inset 0 0 0 1px var(--radio-brass); }
  .src { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.15rem 0.8rem; padding: 0.35rem 0; }
  .s-name { font-weight: 600; font-size: 0.92rem; }
  .s-count { font: 700 0.92rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; font-variant-numeric: tabular-nums; }
  .s-bar { grid-column: 1 / -1; position: relative; height: 5px; border-radius: 3px; overflow: hidden; background: color-mix(in srgb, var(--radio-on-dark) 14%, transparent); }
  .s-bar i { position: absolute; inset: 0; transform-origin: left; }
  .s-bar i.d { background: color-mix(in srgb, var(--radio-amber) 35%, transparent); } .s-bar i.p { background: var(--radio-amber); }
  @media (prefers-reduced-motion: reduce) { .lamp, .s-prog { animation: none; } .seg i { transition: none; } }
</style>
