<script>
  // The aligned transcript of one talk: paragraphs of word spans (data-k = flat word index, for the player's binary-search
  // highlight), a play button per paragraph (left margin ≥ lg, inline below), speaker labels at voice changes, quoted spans
  // as links, and "Quoted" / "Cross-reference" breakouts after their paragraph. Pure rendering: clicks go to onword/onpara;
  // the playing-word highlight is toggled on these spans by MediaPlayer (DOM classes, not reactive state, 60 fps).
  // Typeset in the Fireside Room language: a measured serif column, subheaders as section breaks with a log time, a drop
  // cap, and the breakouts as cut-in "studio inserts" (styles at the bottom; tokens --radio-*, era tint --tint).
  import { paragraphSegments, speakerLabels } from '../../lib/media.js';
  import { formatTime } from '../../../api/lib/media/range.js';
  import ShareRow from './ShareRow.svelte';
  import { momentPath, momentShareText, SITE } from '../../lib/share.js';

  let { paragraphs = [], headings = [], quotes = [], links = [], crossRefs = [], speakers = {}, range = null, canPlay = false,
    playingPara = -1, playing = false, onword, onpara, root = $bindable(),
    moments = [], slug = '', speaker = '', onmoment = null, momentNow = null, skips = [] } = $props();
  // a dead gap (a tape flip, ≥ 20 s with no speech) before a paragraph: a quiet divider (the player skips the gap)
  const gapBefore = $derived(new Map(paragraphs.map((p, i) => [p.n, i ? (skips || []).find((g) => g.from >= paragraphs[i - 1].t1 - 2 && g.to <= p.t0 + 2) : null]).filter(([, g]) => g)));

  const offsets = $derived(paragraphs.reduce((acc, p, i) => { acc.push(i ? acc[i - 1] + (paragraphs[i - 1].words?.length || 0) : 0); return acc; }, []));
  const labels = $derived(speakerLabels(paragraphs, speakers));
  const byPara = (list) => { const m = new Map(); for (const x of list) { if (!m.has(x.para)) m.set(x.para, []); m.get(x.para).push(x); } return m; };
  const headingBy = $derived(new Map(headings.map((h) => [h.p, h])));
  const quotesBy = $derived(byPara(quotes.filter((q) => q.url)));
  // named people and works link on the spoken words; a quote wins where they overlap
  const spansBy = $derived(byPara([...quotes.filter((q) => q.url).map((q) => ({ ...q, kind: 'quote' })),
    ...links.filter((l) => l.url && !quotes.some((q) => q.url && q.para === l.para && l.i0 < q.i1 && q.i0 < l.i1))]));
  const linkTitle = (l) => (l.kind === 'quote' ? l.cite : l.kind === 'person' ? `${l.name} — biography` : [l.title, l.section].filter(Boolean).join(', '));
  const xrefsBy = $derived(byPara(crossRefs.filter((c) => c.url || c.excerpt)));
  // MOMENTS: the speaker's own notable statements, as on-air cards after their paragraph (share targets: /media/<slug>/m/<key>)
  const momentsBy = $derived(byPara(moments.filter((m) => m.key && m.text)));
  // w[3] = 1: a word the copy-edit pass dropped (filler, stutter, loop) — kept for timing, never shown
  const wordClass = (w) => (w[3] ? 'hidden' : ['rounded-sm', canPlay && 'cursor-pointer hover:bg-radio-brass-soft', inRange(w) && 'bg-highlight-range']);
  const inRange = (w) => !!range && range.end != null && w[1] >= range.start - 0.05 && w[2] <= range.end + 0.05;

  function click(e) {
    const el = e.target.closest?.('[data-k]');
    if (!el || !canPlay) return;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;           // selecting text, not seeking
    const link = el.closest('a');
    if (link?.dataset.nav) return;                                          // a name or a work: the link is the action
    if (link && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;   // modified click: follow the link
    if (link) e.preventDefault();
    onword?.(Number(el.dataset.k), el);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions — words are a pointer shortcut; the
     paragraph buttons, chapter links and the player controls are the keyboard path -->
<div bind:this={root} class="transcript" class:cursor-text={!canPlay} onclick={click}>
  {#each paragraphs as p, pi (p.n)}
    {@const segs = paragraphSegments(p.words.length, spansBy.get(p.n) || [])}
    {#if gapBefore.has(p.n)}
      {@const g = gapBefore.get(p.n)}
      <p class="tape-gap" role="separator" aria-label={`Silence on the recording, ${Math.round(g.to - g.from)} seconds, skipped`}>— {Math.round((g.to - g.from) / 60) >= 1 ? `${Math.round((g.to - g.from) / 60)} min` : `${Math.round(g.to - g.from)} s`} of silence on the tape · skipped —</p>
    {/if}
    {#if headingBy.has(p.n)}
      {@const h = headingBy.get(p.n)}
      <h2 id={h.slug} class="section-h" class:question={h.form === 'question'}>
        <span class="log-time">{h.t != null ? formatTime(h.t) : ''}</span>
        <a href={`#${h.slug}`}>{h.text}</a>
      </h2>
    {/if}
    <div class="para" class:first={pi === 0} class:now={playing && playingPara === pi} id={`para_${p.n}`} data-p={pi}>
      {#if labels[pi]}
        <p class="voice">{labels[pi]}</p>
      {/if}
      {#if canPlay}
        <span class="pplay" class:with-label={!!labels[pi]}>
          <button type="button" class="pbtn" class:on={playing && playingPara === pi}
            aria-label={`Play from ${formatTime(p.t0)}`} title={`Play from ${formatTime(p.t0)}`}
            onclick={(e) => { e.stopPropagation(); onpara?.(pi, e.currentTarget.closest('[data-p]')); }}>
            {#if playing && playingPara === pi}
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            {:else}
              <svg class="ml-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
            {/if}
          </button>
          <span class="ptime">{formatTime(p.t0)}</span>
        </span>
      {/if}
      <p class="ptext">
        {#each segs as s, si (si)}
          {#if s.quote}
            <a href={s.quote.url} data-nav={s.quote.kind === 'quote' ? undefined : '1'} target={s.quote.kind === 'person' ? undefined : '_blank'} rel={s.quote.kind === 'person' ? undefined : 'noopener'} title={linkTitle(s.quote)}
              class={s.quote.kind === 'quote' ? 'qlink' : s.quote.kind === 'person' ? 'nlink' : 'wlink'}>{#each p.words.slice(s.i0, s.i1) as w, j (j)}<span data-k={offsets[pi] + s.i0 + j} class={wordClass(w)}>{w[0]}</span>{s.i0 + j < s.i1 - 1 && !w[3] ? ' ' : ''}{/each}</a>{' '}
          {:else}
            {#each p.words.slice(s.i0, s.i1) as w, j (j)}<span data-k={offsets[pi] + s.i0 + j} class={wordClass(w)}>{w[0]}</span>{w[3] ? '' : ' '}{/each}
          {/if}
        {/each}
      </p>

      {#each momentsBy.get(p.n) || [] as m (m.key)}
        <figure class="moment" id={`moment-${m.key}`} aria-label={`A moment from this talk at ${formatTime(m.t0_ms / 1000)}`}>
          <p class="m-tag"><span class="m-dot" aria-hidden="true"></span>On the air{speaker ? ` · ${speaker}` : ''} · {formatTime(m.t0_ms / 1000)}</p>
          {#if m.context}<p class="m-context">{m.context}</p>{/if}
          <blockquote class="m-quote"><p>{m.text}</p></blockquote>
          <figcaption class="m-row">
            {#if canPlay && onmoment}
              <button type="button" class="m-play" class:on={momentNow === m.key && playing} onclick={(e) => { e.stopPropagation(); onmoment(m); }}
                aria-label={momentNow === m.key && playing ? 'Pause this moment' : `Hear this moment (${Math.round((m.t1_ms - m.t0_ms) / 1000)} seconds)`}>
                {#if momentNow === m.key && playing}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
                {/if}
                <span>{Math.round((m.t1_ms - m.t0_ms) / 1000)} s</span>
              </button>
            {/if}
            <a class="m-page" href={momentPath(slug, m.key)}>The page for this moment</a>
            <ShareRow url={`${SITE}${momentPath(slug, m.key)}`} text={momentShareText({ text: m.text, speaker })} compact />
          </figcaption>
        </figure>
      {/each}
      {#each quotesBy.get(p.n) || [] as q, qi (qi)}
        {#if q.excerpt}
          <aside class="insert quote-insert" aria-label="Quoted passage">
            <p class="insert-tag"><span class="dot" aria-hidden="true"></span>Studio insert · quoted</p>
            <blockquote>{q.excerpt}</blockquote>
            <!-- the citation itself is the link (descriptive anchor text to the canonical passage; Chad 10-22) -->
            <p class="insert-cite"><cite>— <a href={q.url} target="_blank" rel="noopener">{q.cite || 'the source passage'}</a></cite></p>
          </aside>
        {/if}
      {/each}
      {#each xrefsBy.get(p.n) || [] as c, ci (ci)}
        <aside class="insert xref-insert" aria-label="Cross-reference">
          <p class="insert-tag"><span class="dot" aria-hidden="true"></span>Cross-reference</p>
          {#if c.claim}<p class="claim">On: {c.claim}</p>{/if}
          {#if c.excerpt}<blockquote>{c.excerpt}</blockquote>{/if}
          {#if c.cite || c.url}
            <p class="insert-cite"><cite>— {#if c.url}<a href={c.url} target="_blank" rel="noopener">{c.cite || 'the source passage'}</a>{:else}{c.cite}{/if}</cite></p>
          {/if}
        </aside>
      {/each}
    </div>
  {/each}
</div>

<style>
  .transcript { font-family: 'Libre Caslon Text', 'Caslon Fallback', Georgia, serif; font-size: 1.12rem; line-height: 1.8; color: var(--radio-ink); max-width: 44rem;
    font-variant-ligatures: common-ligatures; font-kerning: normal; hyphens: auto; -webkit-hyphens: auto; }
  @media (min-width: 1024px) { .transcript { padding-left: 4.5rem; max-width: 48.5rem; } }
  .para { position: relative; margin-top: 1.15rem; display: flow-root; }
  .ptext { text-wrap: pretty; }
  .para.first .ptext::first-letter { float: left; font-family: 'Gloock', 'Gloock Fallback', Georgia, serif; font-size: 4.1rem; line-height: 0.82; padding: 0.35rem 0.6rem 0 0; color: var(--tint, var(--radio-amber)); }
  .voice { margin-bottom: 0.15rem; font: 700 0.85rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: var(--radio-brass); }

  /* the play button per paragraph: in the left margin from lg, floated inline below */
  .pplay { float: left; margin: 0.2rem 0.6rem 0 0; display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
  @media (min-width: 1024px) { .pplay { position: absolute; float: none; margin: 0; left: -4.5rem; top: 0.15rem; width: 3rem; } .pplay.with-label { top: 1.4rem; } }
  .pbtn { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 9999px; color: var(--radio-amber); background: var(--radio-paper);
    box-shadow: inset 0 0 0 1.5px var(--radio-line); transition: box-shadow 0.2s, transform 0.2s, background 0.2s; }
  .pbtn svg { width: 0.95rem; height: 0.95rem; }
  .pbtn:hover { box-shadow: inset 0 0 0 2px var(--radio-amber); transform: scale(1.06); }
  .pbtn.on { background: var(--radio-amber); color: var(--radio-walnut-deep); box-shadow: 0 0 0 5px var(--radio-glow); }
  .pbtn:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  @media (min-width: 1024px) { .pbtn { width: 2.5rem; height: 2.5rem; } }
  .ptime { display: none; font: 600 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em; color: var(--radio-ink-soft); }
  @media (min-width: 1024px) { .ptime { display: block; } }
  /* the playing marker spans the speaker's words only (.ptext), never the studio inserts that follow inside .para */
  .ptext { position: relative; }
  .para.now > .ptext::before { content: ''; position: absolute; left: -1rem; top: 0.4rem; bottom: 0.4rem; width: 3px; border-radius: 2px; background: var(--radio-amber); }
  @media (max-width: 1023px) { .para.now > .ptext::before { left: -0.7rem; } }

  /* the subheaders: section breaks with the log time; questions carry an amber query mark */
  .section-h { scroll-margin-top: 7rem; margin: 3rem 0 0.4rem; padding-top: 1.1rem; border-top: 1px solid var(--radio-line); font: 400 1.6rem/1.2 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--radio-ink); text-wrap: balance; }
  .section-h a:hover { color: var(--radio-amber); }
  .section-h a:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .log-time { display: block; margin-bottom: 0.25rem; font: 700 0.85rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.18em; color: var(--tint, var(--radio-brass)); }
  .section-h.question .log-time::after { content: ' · a question'; letter-spacing: 0.12em; text-transform: uppercase; }
  @media (min-width: 640px) { .section-h { font-size: 1.85rem; } }

  /* linked spans: quotations (dotted amber), people (biography) and works */
  .transcript :global(.qlink) { color: inherit; text-decoration: underline dotted var(--radio-amber); text-decoration-thickness: 2px; text-underline-offset: 5px; }
  .transcript :global(.nlink), .transcript :global(.wlink) { color: inherit; text-decoration: underline solid var(--radio-brass); text-decoration-thickness: 1px; text-underline-offset: 5px; }
  .transcript :global(.wlink) { font-style: italic; }
  .transcript :global(.qlink:hover), .transcript :global(.nlink:hover), .transcript :global(.wlink:hover) { color: var(--radio-amber); }

  /* WHAT THE STUDIO INSERTS (moments, quoted passages, cross-references) DECORATES the talk, it does not crowd it out (Chad
     10-23): indented under a thin muted rule, ~0.9em, muted ink, no card box or shadow, tight spacing; the hues stay but
     desaturated (--radio-*-muted, global.css) and come back to full colour on hover/focus. Controls are small and quiet. */
  .moment, .insert { position: relative; clear: both; margin: 0.55rem 0 0.9rem 1.1rem; padding: 0.2rem 0 0.25rem 0.95rem; font-size: 0.9em; line-height: 1.6;
    color: var(--radio-insert-ink); border-left: 2px solid var(--rule, var(--radio-brass-muted)); hyphens: manual; -webkit-hyphens: manual; transition: border-color 0.2s; }
  @media (min-width: 640px) { .moment, .insert { margin-left: 1.75rem; } }
  .moment:hover, .moment:focus-within, .insert:hover, .insert:focus-within { border-left-color: var(--rule-on, var(--radio-brass)); }
  .insert-tag, .m-tag { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem; font: 700 0.7rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--radio-insert-ink); }
  .dot, .m-dot { flex: none; width: 0.4rem; height: 0.4rem; border-radius: 9999px; background: var(--dot, var(--radio-needle-muted)); }
  .insert blockquote { font-size: 1em; line-height: 1.6; }
  .insert-cite { margin-top: 0.25rem; font-family: system-ui, sans-serif; font-size: 0.8rem; }
  .insert-cite cite { font-style: normal; }
  .insert-cite a, .m-page { color: var(--radio-insert-ink); font-weight: 600; text-decoration: underline; text-decoration-color: var(--radio-amber-muted); text-decoration-thickness: 1px; text-underline-offset: 3px; }
  .insert-cite a:hover, .m-page:hover { color: var(--radio-amber); text-decoration-color: var(--radio-amber); }
  .insert-cite a:focus-visible, .m-page:focus-visible, .m-play:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }

  /* quoted passage: the Writings, italic; the rule takes the era tint, muted */
  .quote-insert { --rule: color-mix(in oklab, var(--tint, var(--radio-amber)) 55%, var(--radio-room)); --rule-on: var(--tint, var(--radio-amber)); }
  .quote-insert blockquote { font-style: italic; }
  /* cross-reference: brass rule, the claim as a small lead-in */
  .xref-insert { --rule: var(--radio-brass-muted); --rule-on: var(--radio-brass); --dot: var(--radio-brass-muted); }
  .xref-insert .claim { font-family: system-ui, sans-serif; font-size: 0.8rem; line-height: 1.45; margin-bottom: 0.15rem; }
  /* moment: the speaker's own line, set in Gloock but at reading size; needle rule */
  .moment { scroll-margin-top: 8rem; --rule: var(--radio-needle-muted); --rule-on: var(--radio-needle); }
  .m-context { margin-top: 0.1rem; font-family: system-ui, sans-serif; font-size: 0.8rem; line-height: 1.45; }
  .m-quote { margin-top: 0.2rem; font: 400 1.05rem/1.4 'Gloock', 'Gloock Fallback', Georgia, serif; text-wrap: pretty; }
  .m-quote p::before { content: '“'; } .m-quote p::after { content: '”'; }
  .m-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.6rem; margin-top: 0.35rem; }
  .m-play { display: inline-flex; align-items: center; gap: 0.25rem; height: 1.9rem; padding: 0 0.55rem 0 0.4rem; border-radius: 9999px; color: var(--radio-insert-ink);
    box-shadow: inset 0 0 0 1px var(--radio-line); font: 700 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.08em; transition: color 0.2s, box-shadow 0.2s; }
  .m-play svg { width: 0.85rem; height: 0.85rem; }
  .m-play:hover, .m-play.on { color: var(--radio-amber); box-shadow: inset 0 0 0 1.5px var(--radio-amber); }
  .m-page { font-size: 0.8rem; font-family: system-ui, sans-serif; }
  /* the share row inside a moment: icon-sized and muted until hovered */
  .moment :global(.s-btn) { height: 1.9rem; min-width: 1.9rem; padding: 0 0.45rem; font-size: 0.75rem; color: var(--radio-insert-ink); background: transparent; box-shadow: none; }
  .moment :global(.s-btn svg) { width: 0.85rem; height: 0.85rem; }
  .moment :global(.s-btn:hover) { color: var(--radio-amber); box-shadow: inset 0 0 0 1px var(--radio-amber); background: transparent; }
  @supports (animation-timeline: view()) {
    .insert { animation: cutIn linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
    @keyframes cutIn { from { opacity: 0.4; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
  }
  @media (prefers-reduced-motion: reduce) { .insert { animation: none; transform: none; } .pbtn { transition: none; } }
  .tape-gap { margin: 1.5rem 0; text-align: center; font-size: 0.8rem; letter-spacing: 0.08em; color: var(--radio-ink-soft); }
</style>
