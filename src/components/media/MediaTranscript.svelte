<script>
  // The aligned transcript of one talk: paragraphs of word spans (data-k = flat word index, for the player's binary-search
  // highlight), a play button per paragraph (left margin ≥ lg, inline below), speaker labels at voice changes, quoted spans
  // as links, and "Quoted" / "Cross-reference" breakouts after their paragraph. Pure rendering: clicks go to onword/onpara;
  // the playing-word highlight is toggled on these spans by MediaPlayer (DOM classes, not reactive state, 60 fps).
  import { paragraphSegments, speakerLabels } from '../../lib/media.js';
  import { formatTime } from '../../../api/lib/media/range.js';

  let { paragraphs = [], quotes = [], crossRefs = [], speakers = {}, range = null, canPlay = false,
    playingPara = -1, playing = false, onword, onpara, root = $bindable() } = $props();

  const offsets = $derived(paragraphs.reduce((acc, p, i) => { acc.push(i ? acc[i - 1] + (paragraphs[i - 1].words?.length || 0) : 0); return acc; }, []));
  const labels = $derived(speakerLabels(paragraphs, speakers));
  const byPara = (list) => { const m = new Map(); for (const x of list) { if (!m.has(x.para)) m.set(x.para, []); m.get(x.para).push(x); } return m; };
  const quotesBy = $derived(byPara(quotes.filter((q) => q.url)));
  const xrefsBy = $derived(byPara(crossRefs.filter((c) => c.url || c.excerpt)));
  // w[3] = 1: a word the copy-edit pass dropped (filler, stutter, loop) — kept for timing, never shown
  const wordClass = (w) => (w[3] ? 'hidden' : ['rounded-sm', canPlay && 'cursor-pointer hover:bg-hover', inRange(w) && 'bg-highlight-range']);
  const inRange = (w) => !!range && range.end != null && w[1] >= range.start - 0.05 && w[2] <= range.end + 0.05;

  function click(e) {
    const el = e.target.closest?.('[data-k]');
    if (!el || !canPlay) return;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;           // selecting text, not seeking
    const link = el.closest('a');
    if (link && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;   // modified click: follow the link
    if (link) e.preventDefault();
    onword?.(Number(el.dataset.k), el);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions — words are a pointer shortcut; the
     paragraph buttons, chapter links and the player controls are the keyboard path -->
<div bind:this={root} class="transcript space-y-6 font-serif text-lg leading-relaxed text-primary" class:cursor-text={!canPlay} onclick={click}>
  {#each paragraphs as p, pi (p.n)}
    {@const segs = paragraphSegments(p.words.length, quotesBy.get(p.n) || [])}
    <div class="relative flow-root lg:pl-16" id={`para_${p.n}`} data-p={pi}>
      {#if labels[pi]}
        <p class="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-accent-secondary">{labels[pi]}</p>
      {/if}
      {#if canPlay}
        <span class={['float-left mr-2 mt-0.5 flex flex-col items-center gap-0.5 lg:absolute lg:left-0 lg:float-none lg:mr-0 lg:w-12', labels[pi] ? 'lg:top-6' : 'lg:top-0']}>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-1 text-accent shadow-sm transition hover:border-accent hover:bg-surface-2 lg:h-10 lg:w-10"
            class:border-accent={playing && playingPara === pi}
            aria-label={`Play from ${formatTime(p.t0)}`} title={`Play from ${formatTime(p.t0)}`}
            onclick={(e) => { e.stopPropagation(); onpara?.(pi, e.currentTarget.closest('[data-p]')); }}>
            {#if playing && playingPara === pi}
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            {:else}
              <svg class="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
            {/if}
          </button>
          <span class="hidden font-sans text-xs tabular-nums text-muted lg:block">{formatTime(p.t0)}</span>
        </span>
      {/if}
      <p>
        {#each segs as s, si (si)}
          {#if s.quote}
            <a href={s.quote.url} target="_blank" rel="noopener" title={s.quote.cite}
              class="rounded-sm text-accent-secondary underline decoration-dotted decoration-2 underline-offset-4 hover:text-accent">{#each p.words.slice(s.i0, s.i1) as w, j (j)}<span data-k={offsets[pi] + s.i0 + j} class={wordClass(w)}>{w[0]}</span>{s.i0 + j < s.i1 - 1 && !w[3] ? ' ' : ''}{/each}</a><a
              href={s.quote.url} target="_blank" rel="noopener" title={`Source: ${s.quote.cite}`} aria-label={`Source: ${s.quote.cite}`}
              class="ml-0.5 align-super font-sans text-xs text-accent hover:text-accent-hover">↗</a>{' '}
          {:else}
            {#each p.words.slice(s.i0, s.i1) as w, j (j)}<span data-k={offsets[pi] + s.i0 + j} class={wordClass(w)}>{w[0]}</span>{w[3] ? '' : ' '}{/each}
          {/if}
        {/each}
      </p>

      {#each quotesBy.get(p.n) || [] as q, qi (qi)}
        {#if q.excerpt}
          <aside class="mt-4 rounded-r-lg border-l-4 border-accent-secondary bg-surface-1 px-4 py-3 font-sans text-base lg:ml-0">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-accent-secondary">Quoted</p>
            <blockquote class="font-serif italic text-secondary">{q.excerpt}</blockquote>
            <p class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <cite class="not-italic text-primary">— {q.cite}</cite>
              <a href={q.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">Read in context →</a>
            </p>
          </aside>
        {/if}
      {/each}
      {#each xrefsBy.get(p.n) || [] as c, ci (ci)}
        <aside class="mt-4 rounded-r-lg border-l-4 border-accent-tertiary bg-surface-2 px-4 py-3 font-sans text-base">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-accent-tertiary">Cross-reference</p>
          {#if c.claim}<p class="mb-2 text-sm text-muted">On: {c.claim}</p>{/if}
          {#if c.excerpt}<blockquote class="font-serif text-secondary">{c.excerpt}</blockquote>{/if}
          <p class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            {#if c.cite}<cite class="not-italic text-primary">— {c.cite}</cite>{/if}
            {#if c.url}<a href={c.url} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover">Read in context →</a>{/if}
          </p>
        </aside>
      {/each}
    </div>
  {/each}
</div>
