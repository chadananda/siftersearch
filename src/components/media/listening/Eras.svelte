<script>
  // ERAS ON SCROLL: a big sticky year counter that rolls like an odometer to the decade in view, while that decade's talks
  // float in (CSS view() timeline; IntersectionObserver marks them in where the timeline is unsupported). Each decade
  // heading tunes the listing to it.
  import { onMount } from 'svelte';
  import { duration, eraVar } from '../../../lib/media-listing.js';

  let { eras = [], ondecade = () => {} } = $props();
  let current = $state(eras[0]?.decade ?? 1950);
  let root;
  const digits = $derived(String(current).padStart(4, '0').split('').map(Number));

  onMount(() => {
    const blocks = [...root.querySelectorAll('[data-decade]')];
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) current = Number(e.target.dataset.decade);
    }, { rootMargin: '-45% 0px -45% 0px' });
    blocks.forEach((b) => io.observe(b));
    let io2 = null;
    if (!CSS.supports?.('animation-timeline: view()')) {
      io2 = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')), { threshold: 0.15 });
      root.querySelectorAll('.float').forEach((el) => io2.observe(el));
    }
    return () => { io.disconnect(); io2?.disconnect(); };
  });
</script>

{#if eras.length}
  <section bind:this={root} class="eras" aria-labelledby="eras-h">
    <div class="mb-6">
      <h2 id="eras-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">Through the decades</h2>
      <p class="mt-1 text-radio-ink-soft">From the {eras[0].decade}s to the {eras[eras.length - 1].decade}s, as they were recorded: wire and acetate, reel-to-reel, cassette and today.</p>
    </div>
    <div class="grid gap-6 md:grid-cols-[minmax(12rem,18rem)_1fr]">
      <div class="odo-wrap">
        <div class="odometer font-dial" role="img" aria-label={`The ${current}s`}>
          {#each digits as d, i (i)}
            <span class="wheel"><span class="strip" style={`transform:translateY(${-d * 10}%)`}>{#each Array(10) as _, n}<span>{n}</span>{/each}</span></span>
          {/each}
          <span class="s">s</span>
        </div>
      </div>
      <div class="space-y-12">
        {#each eras as e (e.decade)}
          <div data-decade={e.decade} style={`--tint:${eraVar(e.decade)}`}>
            <h3 class="decade-h">
              <a href={`/media?era=${e.decade}`} onclick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return; ev.preventDefault(); ondecade(e.decade); }}>The {e.decade}s</a>
              <span class="font-dial text-base font-semibold uppercase tracking-wider text-radio-ink-soft">{e.n} talk{e.n === 1 ? '' : 's'}</span>
            </h3>
            <ul class="mt-3 grid gap-3 sm:grid-cols-2">
              {#each e.items as it, j (it.s)}
                <li class="float" style={`--j:${j}`}>
                  <a href={`/media/${it.s}`} class="era-card">
                    <span class="yr font-dial">{it.y}</span>
                    <span class="min-w-0">
                      <span class="block font-marquee text-lg leading-tight text-radio-ink">{it.t}</span>
                      <span class="block text-sm text-radio-ink-soft">{it.sp || 'Unknown voice'} · {duration(it.d)}</span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .odo-wrap { position: relative; }
  .odometer { position: sticky; top: 6rem; display: flex; align-items: flex-end; gap: 0.15rem; font-weight: 800; font-size: clamp(3.5rem, 9vw, 6.5rem); line-height: 1; color: var(--radio-ink); }
  @media (max-width: 767px) { .odometer { top: 4.5rem; z-index: 2; background: var(--radio-room); padding: 0.25rem 0; font-size: 3.25rem; } }
  .wheel { display: inline-block; height: 1em; overflow: hidden; padding: 0 0.04em; border-radius: 0.08em; background: var(--radio-panel); box-shadow: inset 0 0.08em 0.12em rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--radio-line); }
  .strip { display: flex; flex-direction: column; transition: transform 0.9s cubic-bezier(0.3, 1.3, 0.5, 1); will-change: transform; }
  .strip span { height: 1em; display: block; text-align: center; }
  .s { font-size: 0.45em; color: var(--radio-amber); margin-left: 0.1em; }
  .decade-h { display: flex; align-items: baseline; gap: 0.9rem; flex-wrap: wrap; border-bottom: 2px solid var(--tint); padding-bottom: 0.3rem; }
  .decade-h a { font: 400 1.9rem/1.1 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--tint); }
  .decade-h a:hover { text-decoration: underline; }
  .decade-h a:focus-visible, .era-card:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .era-card { display: flex; gap: 0.9rem; align-items: center; padding: 0.8rem 1rem; border-radius: 0.9rem; background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); transition: transform 0.25s, box-shadow 0.25s; }
  .era-card:hover { transform: translateX(4px); box-shadow: inset 0 0 0 2px var(--tint); }
  .yr { flex: none; display: grid; place-items: center; width: 3.6rem; height: 3.6rem; border-radius: 9999px; font-weight: 800; font-size: 1.15rem; color: var(--radio-on-dark); background: var(--tint);
    box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--radio-groove) 30%, transparent); }
  .float { opacity: 1; }
  @supports (animation-timeline: view()) {
    .float { animation: floatIn linear both; animation-timeline: view(); animation-range: entry 5% cover 30%; }
  }
  @supports not (animation-timeline: view()) {
    .float { opacity: 0; transform: translateY(28px); transition: opacity 0.6s, transform 0.6s cubic-bezier(0.3, 0.7, 0.4, 1); transition-delay: calc(var(--j) * 70ms); }
    .float:global(.is-in) { opacity: 1; transform: none; }
  }
  @keyframes floatIn { from { opacity: 0; transform: translateY(40px) rotate(-1deg); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .float { animation: none !important; opacity: 1 !important; transform: none !important; transition: none !important; }
    .strip { transition: none; }
  }
</style>
