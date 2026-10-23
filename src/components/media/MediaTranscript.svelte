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
    moments = [], slug = '', speaker = '', onmoment = null, momentNow = null } = $props();

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
  .para.now::before { content: ''; position: absolute; left: -1rem; top: 0.4rem; bottom: 0.4rem; width: 3px; border-radius: 2px; background: var(--radio-amber); }
  @media (max-width: 1023px) { .para.now::before { left: -0.7rem; } }

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

  /* moments: the SPEAKER's words, on the amber dial glass in Gloock (inserts of the Writings are paper/walnut and italic) */
  .moment { hyphens: manual; -webkit-hyphens: manual; position: relative; clear: both; margin: 1.8rem 0 1.6rem; padding: 1.2rem 1.3rem 1rem 1.6rem; border-radius: 1rem; scroll-margin-top: 8rem;
    background: var(--radio-dial); color: var(--radio-dial-ink); font-family: system-ui, sans-serif;
    background-image: radial-gradient(70% 120% at 0% 100%, var(--radio-glow), transparent 70%),
      repeating-linear-gradient(90deg, transparent 0 11px, color-mix(in srgb, var(--radio-dial-ink) 14%, transparent) 11px 12px);
    background-size: auto, 100% 0.6rem; background-repeat: no-repeat, repeat-x; background-position: 0 0, 0 100%;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--radio-brass) 70%, transparent), 0 10px 26px var(--radio-brass-soft); }
  @media (min-width: 1024px) { .moment { margin-left: -2.5rem; margin-right: -1.5rem; } }
  .moment::before { content: ''; position: absolute; left: 0.7rem; top: 1rem; bottom: 1rem; width: 3px; border-radius: 2px; background: var(--radio-needle); box-shadow: 0 0 8px var(--radio-needle); }
  .m-tag { display: flex; align-items: center; gap: 0.5rem; font: 700 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.2em; text-transform: uppercase; }
  .m-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: var(--radio-needle); }
  .m-context { margin-top: 0.45rem; font-size: 0.9rem; opacity: 0.8; }
  .m-quote { margin-top: 0.5rem; font: 400 1.45rem/1.3 'Gloock', 'Gloock Fallback', Georgia, serif; text-wrap: pretty; }
  .m-quote p::before { content: '“'; } .m-quote p::after { content: '”'; }
  @media (min-width: 640px) { .m-quote { font-size: 1.7rem; } }
  .m-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 0.9rem; margin-top: 0.9rem; }
  .m-play { display: inline-flex; align-items: center; gap: 0.4rem; height: 2.5rem; padding: 0 0.95rem 0 0.75rem; border-radius: 9999px; background: var(--radio-walnut-deep); color: var(--radio-amber);
    font: 700 0.95rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.08em; }
  .m-play svg { width: 1.05rem; height: 1.05rem; }
  .m-play.on { box-shadow: 0 0 0 5px var(--radio-glow); }
  .m-page { font-weight: 600; font-size: 0.9rem; text-decoration: underline; text-decoration-color: var(--radio-needle); text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .m-page:hover { color: var(--radio-needle); }
  .m-play:focus-visible, .m-page:focus-visible { outline: 3px solid var(--radio-needle); outline-offset: 2px; }

  /* studio inserts: cut-in breakouts that step out of the column */
  .insert { position: relative; clear: both; margin: 1.6rem 0 1.4rem; padding: 1.1rem 1.3rem 1rem; border-radius: 0.9rem; font-size: 1rem; }
  @media (min-width: 1024px) { .insert { margin-left: -1.5rem; margin-right: -2.5rem; } }
  .insert-tag { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font: 700 0.8rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.2em; text-transform: uppercase; }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: var(--radio-needle); box-shadow: 0 0 6px var(--radio-needle); }
  .insert blockquote { font-size: 1.15rem; line-height: 1.6; }
  .insert-cite { margin-top: 0.6rem; font-family: system-ui, sans-serif; font-size: 0.9rem; }
  .insert-cite cite { font-style: normal; }
  .insert-cite a { font-weight: 600; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .insert-cite a:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .quote-insert { background: var(--radio-paper); box-shadow: inset 4px 0 0 var(--tint, var(--radio-amber)), 0 8px 24px var(--radio-brass-soft), inset 0 0 0 1px var(--radio-line); }
  .quote-insert .insert-tag { color: var(--radio-ink-soft); }
  .quote-insert blockquote { font-style: italic; color: var(--radio-ink); }
  .quote-insert .insert-cite { color: var(--radio-ink-soft); }
  .quote-insert .insert-cite a { color: var(--radio-ink); text-decoration-color: var(--radio-amber); }
  .quote-insert .insert-cite a:hover { color: var(--radio-amber); }
  .xref-insert { background: var(--radio-walnut-deep); color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--radio-brass) 40%, transparent);
    background-image: radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--tint, var(--radio-brass)) 30%, transparent), transparent 70%); }
  .xref-insert .insert-tag { color: var(--radio-brass-bright); }
  .xref-insert .claim { font-family: system-ui, sans-serif; font-size: 0.95rem; line-height: 1.5; opacity: 0.88; margin-bottom: 0.4rem; }
  .xref-insert .insert-cite a { color: var(--radio-on-dark); text-decoration-color: var(--radio-brass); }
  .xref-insert .insert-cite a:hover { color: var(--radio-amber); }
  @supports (animation-timeline: view()) {
    .insert { animation: cutIn linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
    @keyframes cutIn { from { opacity: 0.3; translate: 0 18px; } to { opacity: 1; translate: 0 0; } }
  }
  @media (prefers-reduced-motion: reduce) { .insert { animation: none; transform: none; } .pbtn { transition: none; } }
</style>
