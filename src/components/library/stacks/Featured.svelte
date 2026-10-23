<script>
  // FEATURED WORKS: the hero carousel — one signature work at a time, its cover large, its opening words beside it, the
  // panel washed in the cover's own colour (sampled from the art once it loads; the tradition's tint until then).
  // SSR renders every slide (the first one visible, its cover eager); advances every 7 s while on screen, never while
  // hovered or focused, never under reduced motion. The descriptive title is the link into the reader.
  import { onMount } from 'svelte';
  import { coverImg, displayName, tradKey, thousands } from '../../../lib/library-stacks.js';

  let { items = [] } = $props();
  let i = $state(0), tints = $state({}), root, paused = false, visible = true, reduced = false;
  const cur = $derived(items[i]);
  const go = (n) => { i = (n + items.length) % items.length; };
  const tintOf = (b) => (b && tints[b.id]) || `var(--trad-${tradKey(b?.religion)})`;

  // the cover's own colour: a separate 12-px probe of the art (crossOrigin, so a missing CORS header costs only the tint)
  function sample(b) {
    if (!b?.cover || tints[b.id] !== undefined) return;
    tints = { ...tints, [b.id]: null };
    const probe = coverImg(b.cover, [12]);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 12; c.height = 16;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 12, 16);
        const px = x.getImageData(0, 0, 12, 16).data;
        let r = 0, g = 0, bl = 0, n = 0;
        for (let k = 0; k < px.length; k += 4) { if (px[k + 3] < 200) continue; r += px[k]; g += px[k + 1]; bl += px[k + 2]; n++; }
        if (n) tints = { ...tints, [b.id]: `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(bl / n)})` };
      } catch { /* tainted: keep the tradition's tint */ }
    };
    img.src = probe.src;
  }
  $effect(() => { sample(items[i]); sample(items[(i + 1) % items.length]); });
  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(root);
    const t = setInterval(() => { if (!reduced && visible && !paused && !document.hidden && items.length > 1) go(i + 1); }, 7000);
    return () => { clearInterval(t); io.disconnect(); };
  });
</script>

{#if items.length}
  <section bind:this={root} class="feat" style={`--tint:${tintOf(cur)}`} aria-roledescription="carousel" aria-label="Featured works"
    onmouseenter={() => (paused = true)} onmouseleave={() => (paused = false)} onfocusin={() => (paused = true)} onfocusout={() => (paused = false)}>
    <div class="slides">
      {#each items as b, k (b.id)}
        {@const img = coverImg(b.cover, [240, 360, 520, 720])}
        <article class="slide" class:on={k === i} aria-hidden={k !== i} inert={k !== i} aria-roledescription="slide" aria-label={`${k + 1} of ${items.length}: ${b.title}`}>
          <a class="art" href={b.url} tabindex="-1" aria-hidden="true">
            {#if img}<img src={img.src} srcset={img.srcset} sizes="(max-width: 640px) 52vw, 340px" alt=""
              fetchpriority={k === 0 ? 'high' : 'auto'} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />{/if}
          </a>
          <div class="txt">
            <p class="eyebrow">Featured · {displayName(b.religion)}</p>
            <h2 class="display"><a href={b.url}>{b.title}</a></h2>
            {#if b.author && !/^unknown$/i.test(b.author)}<p class="by">{b.author}</p>{/if}
            {#if b.blurb}<p class="blurb">{b.blurb}</p>{/if}
            <p class="meta">{b.paras ? `${thousands(b.paras)} paragraphs` : ''}{b.year ? ` · ${b.year}` : ''}</p>
          </div>
        </article>
      {/each}
    </div>
    <div class="ctl">
      <button type="button" class="nav" onclick={() => go(i - 1)} aria-label="Previous featured work">←</button>
      <span class="pos" aria-live="polite">{String(i + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
      <button type="button" class="nav" onclick={() => go(i + 1)} aria-label="Next featured work">→</button>
      <div class="thumbs">
        {#each items as b, k (b.id)}
          {@const t = coverImg(b.cover, [80, 120])}
          <button type="button" class="thumb" class:on={k === i} onclick={() => go(k)} aria-label={`Show ${b.title}`} aria-current={k === i}>
            {#if t}<img src={t.src} srcset={t.srcset} sizes="40px" alt="" loading="lazy" decoding="async" />{/if}
          </button>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .feat { position: relative; isolation: isolate; overflow: hidden; border-radius: 1.4rem; padding: clamp(1.4rem, 4vw, 3.2rem) clamp(1.2rem, 4vw, 3.4rem) 1.4rem;
    background: radial-gradient(120% 120% at 18% 30%, color-mix(in oklab, var(--tint) 34%, var(--lib-bg)), color-mix(in oklab, var(--tint) 10%, var(--lib-bg)) 70%);
    transition: background 1.2s ease; }
  .feat::after { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--grain); opacity: 0.5; pointer-events: none; }
  .slides { display: grid; }
  .slide { grid-area: 1 / 1; display: grid; gap: 1.2rem 3rem; grid-template-columns: 1fr; align-items: center; opacity: 0; visibility: hidden; transition: opacity 0.7s ease, visibility 0s linear 0.7s; }
  .slide.on { opacity: 1; visibility: visible; transition: opacity 0.7s ease; }
  @media (min-width: 760px) { .slide { grid-template-columns: minmax(14rem, 21rem) minmax(0, 1fr); } }
  .art { display: block; width: min(15rem, 56vw); aspect-ratio: 18 / 25; margin: 0 auto; transform: translateX(-1.5rem) rotate(-2deg); opacity: 0; transition: transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.7s; }
  @media (min-width: 760px) { .art { width: 100%; } }
  .slide.on .art { transform: none; opacity: 1; }
  .art img { width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%; filter: drop-shadow(0 26px 30px var(--lib-shadow)); }
  .txt { min-width: 0; text-align: center; }
  @media (min-width: 760px) { .txt { text-align: left; } }
  h2 { margin: 0.6rem 0 0; font-size: clamp(2rem, 5.2vw, 4.2rem); }
  h2 a { color: var(--lib-ink); text-decoration: none; }
  h2 a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 6px; text-decoration-color: var(--tint); }
  .by { margin: 0.7rem 0 0; font-family: var(--font-quote); font-style: italic; font-size: 1.2rem; color: var(--lib-ink-soft); }
  .blurb { margin: 1.1rem 0 0; max-width: 36rem; font-family: var(--font-quote); font-size: 1.04rem; line-height: 1.6; color: var(--lib-ink); display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  @media (min-width: 760px) { .blurb { margin-left: 0; } }
  @media (max-width: 759px) { .blurb { margin-left: auto; margin-right: auto; -webkit-line-clamp: 4; } }
  .meta { margin: 0.9rem 0 0; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lib-ink-soft); min-height: 1em; }
  .ctl { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.6rem; padding-top: 1rem; border-top: 1px solid var(--lib-line); }
  .nav { width: 2.4rem; height: 2.4rem; border-radius: 999px; border: 1px solid var(--lib-line); background: var(--lib-raised); color: var(--lib-ink); cursor: pointer; font-size: 1rem; }
  .nav:hover { border-color: var(--lib-ink); }
  .pos { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.78rem; letter-spacing: 0.08em; color: var(--lib-ink-soft); min-width: 4.2rem; text-align: center; }
  .thumbs { display: flex; gap: 0.5rem; margin-left: auto; }
  @media (max-width: 640px) { .thumbs { display: none; } }
  .thumb { width: 2.5rem; aspect-ratio: 18 / 25; padding: 0; border: 0; background: none; cursor: pointer; opacity: 0.45; transition: opacity 0.2s, transform 0.2s; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%; }
  .thumb:hover, .thumb.on { opacity: 1; }
  .thumb.on { transform: translateY(-3px); }
  @media (prefers-reduced-motion: reduce) { .slide, .art, .feat { transition: none; } }
</style>
