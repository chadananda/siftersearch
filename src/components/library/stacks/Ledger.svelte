<script>
  // The live readout beside the masthead: books · traditions · paragraphs · added this week, with a live dot that
  // breathes while Dewey is importing. SSR renders the cached figures; the live feed rolls them forward (tabular digits,
  // so a change never shifts the layout).
  import { onMount } from 'svelte';
  import Rolling from './Rolling.svelte';
  import { onLanding } from '../../../lib/library-feed.js';
  import { thousands, compact } from '../../../lib/library-stacks.js';

  let { landing = null, fallback = { documents: 0, traditions: 0, paragraphs: 0 } } = $props();
  let d = $state(landing);
  const t = $derived(d?.totals || fallback);
  const week = $derived(d?.week ?? null);
  const working = $derived(!!d?.working || (d?.process?.acquire?.today ?? 0) > 0);
  onMount(() => onLanding((x) => { d = x; }, landing));
</script>

<dl class="readout" aria-label="The library in figures, updated live">
  <div class="cell big"><dt>Books</dt><dd><Rolling text={thousands(t.documents)} label={`${thousands(t.documents)} books`} /></dd></div>
  <div class="cell"><dt>Traditions</dt><dd><Rolling text={String(t.traditions || '')} label={`${t.traditions} traditions`} /></dd></div>
  {#if t.paragraphs}<div class="cell"><dt>Paragraphs</dt><dd><Rolling text={compact(t.paragraphs)} label={`${thousands(t.paragraphs)} paragraphs`} /></dd></div>{/if}
  <div class="cell"><dt><span class="dot" class:on={working} aria-hidden="true"></span>This week</dt>
    <dd>{#if week != null}<Rolling text={`+${thousands(week)}`} label={`${thousands(week)} books added this week`} />{:else}—{/if}</dd></div>
</dl>

<style>
  .readout { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 0; border-top: 1px solid var(--lib-ink); }
  .cell { padding: 0.8rem 0.9rem 0.9rem; border-bottom: 1px solid var(--lib-line); border-left: 1px solid var(--lib-line); }
  .cell:nth-child(2) { border-left: 0; padding-left: 0; }
  .big { grid-column: 1 / -1; border-left: 0; padding-left: 0; }
  dt { display: flex; align-items: center; gap: 0.45rem; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lib-ink-soft); }
  dd { margin: 0.35rem 0 0; font-family: var(--font-marquee); font-size: clamp(1.7rem, 3.4vw, 2.3rem); line-height: 1; color: var(--lib-ink); }
  .big dd { font-size: clamp(2.8rem, 6.5vw, 4.4rem); }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--lib-ink-faint); }
  .dot.on { background: var(--lib-live); box-shadow: 0 0 0 0 var(--lib-live); }
  :global(.lib-live) .dot.on { animation: pulse 2.4s ease-out infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--lib-live) 60%, transparent); } 100% { box-shadow: 0 0 0 0.6rem transparent; } }
</style>
