<script>
  // WHAT HAPPENS TO EVERY BOOK: the seven stages a book passes through before it is shelved, each with its live figure
  // (GET /api/library/landing → process). A light travels along the rule above the stages while they are on screen.
  // SSR renders the cached figures; the live feed rolls them forward.
  import { onMount } from 'svelte';
  import Rolling from './Rolling.svelte';
  import { onLanding } from '../../../lib/library-feed.js';
  import { STAGES, thousands, compact } from '../../../lib/library-stacks.js';

  let { landing = null } = $props();
  let d = $state(landing);
  let root, on = $state(false);
  const p = $derived(d?.process || null);
  const fig = (v) => (v == null ? '' : v >= 1e6 ? compact(v) : thousands(v));
  onMount(() => {
    const off = onLanding((x) => { d = x; }, landing);
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; });
    io.observe(root);
    return () => { off(); io.disconnect(); };
  });
</script>

<section bind:this={root} class="proc" class:is-on={on} aria-labelledby="proc-h">
  <div class="head">
    <p class="eyebrow">The work behind every book</p>
    <h2 id="proc-h" class="display">Not copies. Editions.</h2>
    <p class="serif lede">Each book is restored, structured, attributed and linked before it reaches the shelves, and the work runs day and night. The figures are live.</p>
  </div>
  <div class="rule" aria-hidden="true"><i></i></div>
  <ol>
    {#each STAGES as s, i (s.id)}
      {@const v = s.stat(p)}
      {@const sub = s.sub?.(p)}
      <li style={`--i:${i}`}>
        <span class="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <h3>{s.name}</h3>
        <p class="line">{s.line}</p>
        <p class="stat">
          {#if v != null}<b><Rolling text={fig(v)} label={`${thousands(v)} ${s.unit}`} /></b><span>{s.unit}</span>
          {:else}<span>counting</span>{/if}
        </p>
        <p class="sub">{sub || ''}</p>
      </li>
    {/each}
  </ol>
</section>

<style>
  .head { display: grid; gap: 0.4rem 3rem; }
  @media (min-width: 900px) { .head { grid-template-columns: auto 1fr; align-items: end; } .head .eyebrow { grid-column: 1 / -1; } }
  h2 { margin: 0; font-size: clamp(2rem, 4.6vw, 3.2rem); }
  .lede { margin: 0; max-width: 36rem; font-size: 1.02rem; line-height: 1.55; color: var(--lib-ink-soft); }
  @media (min-width: 900px) { .lede { justify-self: end; text-align: right; } }
  .rule { position: relative; height: 1px; margin: 1.8rem 0 0; background: var(--lib-ink); overflow: hidden; }
  .rule i { position: absolute; top: -1px; left: 0; width: 18%; height: 3px; background: linear-gradient(90deg, transparent, var(--lib-accent), transparent); transform: translateX(-100%); }
  :global(.lib-live) .is-on .rule i { animation: run 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
  @keyframes run { to { transform: translateX(560%); } }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; }
  @media (min-width: 600px) { ol { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 980px) { ol { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1280px) { ol { grid-template-columns: repeat(7, 1fr); } }
  li { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; padding: 1.2rem 1.1rem 1.3rem 0; border-bottom: 1px solid var(--lib-line); }
  @media (min-width: 600px) { li { padding-left: 1.1rem; border-left: 1px solid var(--lib-line); } li:first-child { border-left: 0; padding-left: 0; } }
  @media (min-width: 1280px) { li { border-bottom: 0; } }
  .num { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.72rem; letter-spacing: 0.1em; color: var(--lib-accent); }
  h3 { margin: 0; font-family: var(--font-quote); font-weight: 700; font-size: 1.05rem; }
  .line { margin: 0; font-family: var(--font-quote); font-size: 0.9rem; line-height: 1.45; color: var(--lib-ink-soft); }
  .stat { margin: auto 0 0; padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .stat b { font-family: var(--font-marquee); font-weight: 400; font-size: 1.9rem; line-height: 1; color: var(--lib-ink); }
  .stat span { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lib-ink-soft); }
  .sub { margin: 0; min-height: 1.2em; font-family: var(--font-quote); font-style: italic; font-size: 0.82rem; color: var(--lib-ink-faint); }
  @media (max-width: 599px) {
    li { display: grid; grid-template-columns: 2.2rem 1fr; column-gap: 0.6rem; }
    li > :not(.num) { grid-column: 2; }
    .num { grid-row: 1 / span 5; padding-top: 0.2rem; }
  }
</style>
