<script>
  // /media/<slug> island: talk metadata + the audio engine over the aligned transcript (MediaTranscript) and waveform bar.
  // Rights: 'full' plays audio.ogg|m4a; 'clips' asks clip_url for ≤ clip_cap s per play (time = clip.start + currentTime,
  // stops at the clip end); 'search' is text only. While playing a rAF loop binary-searches the word at the current time,
  // toggles its highlight class directly on the span, and (in Follow mode) scrolls so the playing line keeps its screen
  // position; wheel/touch/scroll keys drop Follow. ?t=a / ?t=a-b / #t=a,b set the start / a played-and-shaded range.
  import { onMount, tick } from 'svelte';
  import { media } from '../../lib/api.js';
  import { flattenWords, wordAt, youtubeAtTime, picture } from '../../lib/media.js';
  import { rangeFrom, formatTime, rangeParam } from '../../../api/lib/media/range.js';
  import MediaTranscript from './MediaTranscript.svelte';
  import MediaWaveform from './MediaWaveform.svelte';

  let { item, initialRange = null } = $props();

  const level = item.rights?.playback || 'search';
  const canPlay = (level === 'full' && !!item.audio) || (level === 'clips' && !!item.clip_url);
  const duration = Number(item.duration_s) || 0;
  // the contents list: the topic subheaders (each a #slug anchor), else the coarser chapters
  const toc = item.headings?.length ? item.headings.map((h) => ({ p: h.p, t: h.t, title: h.text, slug: h.slug })) : (item.chapters || []);
  // the recording's quality (Chad 10-22: a small public badge): overall grade + the main issue, details on hover/focus
  const q = item.quality;
  const ISSUE_LABEL = { muffled: 'muffled (narrow bandwidth)', noisy: 'background noise', hum: 'mains hum', reverberant: 'echoey room', clipped: 'distorted (clipped)', dropouts: 'dropouts', 'low-level': 'quiet or uneven levels', speed: 'speed off' };
  const qualityTitle = q ? [`Recording quality ${q.overall}`, q.primary_issue && q.primary_issue !== 'ok' ? ISSUE_LABEL[q.primary_issue] || q.primary_issue : 'clear',
    ...Object.entries(q.dimensions || {}).filter(([, x]) => x?.grade).map(([k, x]) => `${k} ${x.grade}`)].join(' · ') : '';
  const flat = flattenWords(item.paragraphs);
  const ytBase = item.youtube || (item.source?.kind === 'youtube' ? item.source.url : null);

  let audio;                                   // <audio>
  let root = $state();                         // transcript container
  let wordEls = [];                            // flat index → span
  let range = $state(initialRange?.end != null ? initialRange : null);
  let startAt = $state(initialRange?.start || 0);      // where the first play begins
  let limit = initialRange?.end ?? null;       // playback stops here (a ?t=a-b range)
  let current = $state(initialRange?.start || 0);
  let playing = $state(false);
  let started = $state(false);
  let busy = $state(false);
  let note = $state('');
  let follow = $state(true);
  let anchorY = 0;
  let clip = null;                             // { start, end } of the loaded clip ('clips' level)
  let curK = -1, lastLineTop = null, raf = 0;
  let rate = $state(1);
  let playingPara = $state(-1);
  let sel = $state(null);                      // { start, end, x, y } of a transcript selection
  let copied = $state(false);

  const now = () => (clip ? clip.start : 0) + (audio?.currentTime || 0);
  const youtubeHref = $derived(youtubeAtTime(ytBase, current));
  const photo = item.thumb?.kind === 'photo';
  // the header portrait at its size, face-centred by the image service (the biography helper; a tile is used as is)
  const head = item.thumb?.url ? picture(item.thumb.url, 160, 160, { photo }) : { src: null, srcset: null };
  const when = [item.date || item.year, item.place, item.event].filter(Boolean);

  // ── highlight + follow ──
  function mark(k) {
    if (k === curK) return;
    wordEls[curK]?.classList.remove('bg-highlight-playing!');
    curK = k;
    const el = wordEls[k];
    if (!el) return;
    el.classList.add('bg-highlight-playing!');
    playingPara = flat.para[k];
    if (follow && playing) keepLine(el);
  }
  function keepLine(el, force = false) {
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    if (!force && lastLineTop != null && Math.abs(top - lastLineTop) < 4) return;   // same line: nothing to do
    lastLineTop = top;
    const delta = r.top - anchorY;
    if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: 'smooth' });
  }
  const anchorFor = (el) => {
    const top = el?.getBoundingClientRect().top;
    const h = window.innerHeight;
    return top != null && top > 72 && top < h * 0.75 ? top : Math.round(h * 0.35);
  };
  function resync() {
    follow = true; anchorY = Math.round(window.innerHeight * 0.35); lastLineTop = null;
    if (wordEls[curK]) keepLine(wordEls[curK], true);
  }

  function frame() {
    const t = now();
    if (Math.abs(t - current) > 0.05) current = t;
    if (limit != null && t >= limit) { audio.pause(); note = 'End of the selected range.'; }
    mark(wordAt(flat.starts, t + 0.02));
    if (playing) raf = requestAnimationFrame(frame);
  }

  // ── playback ──
  const waitMeta = () => new Promise((res) => {
    if (audio.readyState >= 1) return res();
    audio.addEventListener('loadedmetadata', res, { once: true });
    audio.addEventListener('error', res, { once: true });
  });

  // iOS/Safari allow play() only inside the user gesture; the clip fetch / metadata wait come after an await. Playing a
  // tiny silent WAV synchronously in the gesture unlocks this element for the real source that follows.
  let unlocked = false;
  function unlock() {
    if (unlocked || !audio) return;
    unlocked = true;
    const n = 400, b = new DataView(new ArrayBuffer(44 + n)), w = (o, str) => [...str].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); b.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true); w(36, 'data'); b.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
    audio.src = URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
    audio.play().catch(() => {});
  }

  /** Play from t (seconds). end: stop there (a range); el: the element clicked (its line keeps its screen position). */
  async function playFrom(t, { end = null, el = null } = {}) {
    if (!canPlay || busy) return;
    t = Math.max(0, Math.min(t, Math.max(0, duration - 0.5)));
    const fresh = !unlocked;
    unlock();
    limit = end; note = ''; started = true;
    follow = true; anchorY = anchorFor(el || wordEls[wordAt(flat.starts, t + 0.02)]); lastLineTop = null;
    try {
      if (level === 'full') {
        if (fresh || !audio.src || audio.src.startsWith('blob:')) {
          const ogg = audio.canPlayType('audio/ogg; codecs="opus"');
          audio.src = media.href(ogg && item.audio.ogg ? item.audio.ogg : item.audio.m4a || item.audio.ogg);
        }
        await waitMeta();
        audio.currentTime = t;
      } else {
        const want = end ?? t + (item.rights.clip_cap || 180);
        if (fresh || !clip || t < clip.start || t >= clip.end - 0.5 || (end != null && end > clip.end + 0.1)) {
          busy = true;
          const stop = Math.min(want, t + (item.rights.clip_cap || 180), duration || Infinity);
          const c = await media.clip(item.clip_url, t.toFixed(1), stop.toFixed(1), audio.canPlayType('audio/ogg; codecs="opus"') ? null : 'm4a');
          clip = { start: c.start, end: c.end };
          audio.src = media.href(c.url);
          await waitMeta();
        }
        audio.currentTime = Math.max(0, t - clip.start);
      }
      audio.playbackRate = rate;
      await audio.play();
    } catch (e) {
      note = /429/.test(e.message) ? 'Too many clips requested — please wait a few minutes.' : `Could not play: ${e.message}`;
    } finally { busy = false; }
  }

  function toggle() {
    if (!canPlay) return;
    if (playing) { audio.pause(); return; }
    const t = started ? now() : startAt;
    if (limit != null && t >= limit - 0.1) return playFrom(range?.start ?? startAt, { end: range?.end ?? null });   // replay the range
    if (!started) return playFrom(startAt, { end: limit });
    if (level === 'clips' && (!clip || t >= clip.end - 0.3)) return playFrom(t, { end: limit });        // next clip
    follow = true; anchorY = anchorFor(wordEls[curK]); lastLineTop = null;
    audio.play().catch((e) => (note = `Could not play: ${e.message}`));
  }
  const seek = (t) => (playing || started ? playFrom(t, { end: null }) : (startAt = t, current = t, mark(wordAt(flat.starts, t + 0.02))));
  const onword = (k, el) => playFrom(flat.starts[k], { el });
  const onpara = (pi, el) => {
    if (playing && playingPara === pi) { audio.pause(); return; }
    const p = item.paragraphs[pi];
    playFrom(p.t0 ?? p.words?.[0]?.[1] ?? 0, { el });
  };
  function jump(e, t, p, slug = null) {
    e.preventDefault();
    // a subheader is the deep-link target (#slug) and where the page scrolls; the audio starts at its first paragraph
    if (slug) history.replaceState(null, '', `#${slug}`);
    const el = (slug && document.getElementById(slug)) || document.getElementById(`para_${p}`);
    if (playing) playFrom(t, { el: null });
    else { seek(t); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  // ── selection → copy link ──
  let selTimer = 0;
  function onSelection() {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !root || !String(s).trim()) { sel = null; return; }
      const r = s.getRangeAt(0);
      if (!root.contains(r.commonAncestorContainer)) { sel = null; return; }
      let a = -1, b = -1;
      for (let k = 0; k < wordEls.length; k++) if (r.intersectsNode(wordEls[k])) { if (a < 0) a = k; b = k; } else if (a >= 0) break;
      if (a < 0) { sel = null; return; }
      const box = r.getBoundingClientRect();
      sel = { start: flat.starts[a], end: Math.max(flat.ends[b], flat.starts[a] + 1), x: Math.min(Math.max(8, box.left), window.innerWidth - 280), y: Math.min(box.bottom + 8, window.innerHeight - 64) };
      copied = false;
    }, 150);
  }
  async function copyLink() {
    if (!sel) return;
    const url = `${location.origin}/media/${item.slug}?t=${rangeParam(sel.start, sel.end)}`;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { window.prompt('Copy this link', url); }
  }
  function playSelection() {
    if (!sel) return;
    range = { start: sel.start, end: sel.end };
    playFrom(sel.start, { end: sel.end });
    window.getSelection()?.removeAllRanges(); sel = null;
  }

  // ── keyboard, manual scroll, Media Session ──
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
  function onKey(e) {
    if (typing(e.target)) return;
    if (e.code === 'Space' && !e.repeat && !/^(BUTTON|A)$/.test(e.target?.tagName) && e.target?.getAttribute?.('role') !== 'slider') {
      e.preventDefault(); toggle(); return;
    }
    if (SCROLL_KEYS.has(e.key) && playing) follow = false;
  }
  const manual = () => { if (playing) follow = false; };

  function sessionSetup() {
    if (!('mediaSession' in navigator)) return;
    const art = item.thumb?.url ? [{ src: new URL(media.href(picture(item.thumb.url, 512, 512, { photo: item.thumb.kind === 'photo' }).src), location.href).href, sizes: '512x512', type: /\.svg/.test(item.thumb.url) ? 'image/svg+xml' : 'image/webp' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.speaker || '', album: item.collection || 'SifterSearch Media', artwork: art });
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported */ } };
    set('play', () => toggle());
    set('pause', () => audio.pause());
    set('seekto', (d) => playFrom(d.seekTime));
    set('seekbackward', (d) => playFrom(now() - (d.seekOffset || 10)));
    set('seekforward', (d) => playFrom(now() + (d.seekOffset || 10)));
  }
  function sessionPosition() {
    if (!('mediaSession' in navigator) || !duration) return;
    try { navigator.mediaSession.setPositionState({ duration, position: Math.min(duration, Math.max(0, now())), playbackRate: rate }); } catch { /* ignore */ }
  }

  onMount(() => {
    wordEls = Array.from(root.querySelectorAll('[data-k]'));
    let r = rangeFrom({ search: location.search, hash: location.hash });
    // ?p=<paragraph_index> — a search hit on the transcript document: start at that paragraph
    const pq = new URLSearchParams(location.search).get('p');
    if (!r && pq != null && /^\d+$/.test(pq)) {
      const ps = (item.paragraphs || []).filter((x) => x.pi != null && x.pi <= Number(pq));
      if (ps.length) r = { start: ps[ps.length - 1].t0, end: null };
    }
    if (r) {
      startAt = r.start; current = r.start; limit = r.end ?? null;
      range = r.end != null ? r : null;
      tick().then(() => { const k = wordAt(flat.starts, r.start + 0.02); mark(k); wordEls[k]?.scrollIntoView({ block: 'center' }); });
    }
    if (canPlay) sessionSetup();
    const silent = () => audio.src.startsWith('blob:');   // the unlock blip, not the talk
    const onPlay = () => { if (silent()) return; playing = true; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    const onPause = () => { if (silent()) return; playing = false; cancelAnimationFrame(raf); frame(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; sessionPosition(); };
    const onEnded = () => { if (silent()) return; onPause(); if (level === 'clips' && clip && clip.end < duration - 1 && (limit == null || clip.end < limit - 0.5)) note = 'Excerpt ended — press play to continue.'; };
    const onErr = () => { if (silent()) return; note = 'The audio could not be loaded.'; busy = false; };
    audio.addEventListener('play', onPlay); audio.addEventListener('pause', onPause); audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErr); audio.addEventListener('seeked', sessionPosition);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', manual, { passive: true });
    window.addEventListener('touchmove', manual, { passive: true });
    document.addEventListener('selectionchange', onSelection);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', manual); window.removeEventListener('touchmove', manual);
      document.removeEventListener('selectionchange', onSelection);
    };
  });

  $effect(() => { if (audio) audio.playbackRate = rate; });
</script>

<article>
  <!-- header -->
  <header class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start">
    {#if item.thumb?.url}
      <figure class="shrink-0">
        <img src={media.href(head.src)} srcset={head.srcset} width="160" height="160" alt={photo ? item.speaker || '' : ''} class="aspect-square w-28 rounded-xl border border-border-subtle bg-surface-2 object-cover sm:w-40" />
        {#if photo && (item.thumb.credit || item.thumb.artist || item.thumb.licence || item.thumb.source_url)}
          {@const credit = item.thumb.credit || item.thumb.artist}
          {@const src = item.thumb.source_url || item.thumb.page_url}
          <figcaption class="mt-1 max-w-40 text-xs text-muted">
            <!-- the credit itself links to where the photo came from (descriptive anchor text, no bare "source") -->
            {#if src}<a href={src} target="_blank" rel="noopener" class="text-accent hover:text-accent-hover hover:underline">Photo of {item.speaker || 'the speaker'}{credit ? `: ${credit}` : ''}</a>{:else}Photo{credit ? `: ${credit}` : ''}{/if}{item.thumb.licence ? ` · ${item.thumb.licence}` : ''}
          </figcaption>
        {/if}
      </figure>
    {/if}
    <div class="min-w-0 flex-1">
      <p class="text-sm text-muted"><a href="/media" class="hover:text-accent">Media</a>{item.collection ? ` · ${item.collection}` : ''}</p>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">{item.title}</h1>
      {#if item.speaker}<p class="mt-1 text-lg text-secondary">{item.speaker}</p>{/if}
      {#if when.length || duration}
        <p class="mt-1 text-sm text-muted">{[...when, duration ? formatTime(duration) : null].filter(Boolean).join(' · ')}
          {#if q?.overall}<span class="ml-2 inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 text-xs text-muted" title={qualityTitle} aria-label={qualityTitle}>audio {q.overall}{q.primary_issue && q.primary_issue !== 'ok' ? ` · ${ISSUE_LABEL[q.primary_issue] || q.primary_issue}` : ''}</span>{/if}
        </p>
      {/if}
      {#if item.summary}<p class="mt-3 max-w-3xl text-secondary">{item.summary}</p>{/if}
      <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {#if item.source?.kind === 'youtube' && youtubeHref}
          <a href={youtubeHref} target="_blank" rel="noopener" class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-error px-3 py-2 font-medium text-primary hover:bg-hover">
            <svg class="h-4 w-4 text-error" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.75 15.02V8.98L15.5 12z"/></svg>
            <span>Source: {item.source.channel || 'YouTube'} on YouTube — watch the full talk{current > 1 ? ` (from ${formatTime(current)})` : ''}</span>
          </a>
        {/if}
        {#if item.page}
          <a href={media.href(item.page)} target="_blank" rel="noopener" class="inline-flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-secondary hover:bg-hover">Standalone page ↗</a>
        {/if}
        {#if level === 'full' && item.rights?.download && item.audio?.m4a}
          <a href={media.href(item.audio.m4a)} download class="inline-flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-secondary hover:bg-hover">Download audio</a>
        {/if}
      </div>
    </div>
  </header>

  <div class="lg:grid lg:grid-cols-12 lg:gap-10">
    <!-- aside first in the DOM so chapters/topics come before the transcript on phones -->
    <aside class="mb-6 space-y-6 lg:order-2 lg:col-span-4 lg:mb-0">
      <div class="lg:sticky lg:top-20 space-y-6">
        {#if toc.length}
          <nav aria-label="Contents" class="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h2 class="mb-2 text-sm font-semibold text-primary">Contents</h2>
            <ol class="max-h-[60vh] space-y-0.5 overflow-y-auto">
              {#each toc as c, i (i)}
                <li>
                  <a href={c.slug ? `#${c.slug}` : `?t=${Math.floor(c.t)}`} onclick={(e) => jump(e, c.t, c.p, c.slug)}
                    class="flex min-h-10 items-baseline gap-3 rounded-md px-2 py-1.5 text-sm text-secondary hover:bg-hover hover:text-primary">
                    <span class="w-14 shrink-0 font-mono text-xs tabular-nums text-accent">{formatTime(c.t)}</span><span>{c.title}</span>
                  </a>
                </li>
              {/each}
            </ol>
          </nav>
        {/if}
        {#if item.topics?.length}
          <div>
            <h2 class="mb-2 text-sm font-semibold text-primary">Topics</h2>
            <ul class="flex flex-wrap gap-1.5">
              {#each item.topics as t (t)}<li class="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-secondary">{t}</li>{/each}
            </ul>
          </div>
        {/if}
        {#if item.quotes?.length || item.cross_references?.length}
          <p class="text-xs text-muted">
            {item.quotes?.length || 0} quotation{item.quotes?.length === 1 ? '' : 's'} linked to source ·
            {item.cross_references?.length || 0} cross-reference{item.cross_references?.length === 1 ? '' : 's'}
          </p>
        {/if}
      </div>
    </aside>

    <div class="min-w-0 lg:order-1 lg:col-span-8">
      <!-- player card -->
      <section aria-label="Player" class="mb-8 rounded-xl border border-border-subtle bg-surface-1 p-4">
        {#if canPlay}
          <div class="flex items-center gap-3">
            <button type="button" onclick={toggle} disabled={busy} aria-label={playing ? 'Pause' : 'Play'}
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-text shadow hover:bg-accent-hover disabled:opacity-60">
              {#if busy}
                <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              {:else if playing}
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              {:else}
                <svg class="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
              {/if}
            </button>
            <div class="min-w-0 flex-1">
              <MediaWaveform url={item.waveform} {duration} {current} {range} onseek={seek} />
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span class="font-mono tabular-nums text-secondary">{formatTime(current)} / {formatTime(duration)}</span>
            <label class="flex items-center gap-1">Speed
              <select bind:value={rate} class="rounded border border-border bg-surface-0 px-1 py-0.5 text-xs text-primary">
                {#each [0.75, 1, 1.25, 1.5, 2] as r (r)}<option value={r}>{r}×</option>{/each}
              </select>
            </label>
            {#if range}
              <span>Range {formatTime(range.start)}–{formatTime(range.end)}
                <button type="button" class="ml-1 text-accent hover:text-accent-hover" onclick={() => { range = null; limit = null; note = ''; }}>clear</button></span>
            {:else if !started && startAt > 0}
              <span>Starts at {formatTime(startAt)}</span>
            {/if}
            {#if level === 'clips'}<span title={item.rights?.basis || ''}>Plays in excerpts of up to {Math.round((item.rights?.clip_cap || 180) / 60)} min</span>{/if}
            <span class="hidden sm:inline">Space = play/pause · click any word to play from it · select text to share a passage</span>
          </div>
          {#if note}<p class="mt-2 text-sm text-warning" role="status">{note}</p>{/if}
        {:else}
          <p class="text-sm text-secondary">Text only — audio is not available for this recording{item.source?.kind === 'youtube' ? '; the full talk is on YouTube (link above)' : ''}.</p>
        {/if}
        <!-- svelte-ignore a11y_media_has_caption — the transcript below is the caption track -->
        <audio bind:this={audio} preload="auto" class="hidden"></audio>
      </section>

      <MediaTranscript bind:root paragraphs={item.paragraphs} headings={item.headings || []} quotes={item.quotes || []} crossRefs={item.cross_references || []}
        speakers={item.speakers || {}} {range} {canPlay} {playing} {playingPara} {onword} {onpara} />
    </div>
  </div>
</article>

<!-- selection → copy link -->
{#if sel}
  <div class="fixed z-40 flex gap-1 rounded-lg border border-border bg-surface-0 p-1 shadow-lg backdrop-blur" style={`left:${sel.x}px;top:${sel.y}px`}>
    <button type="button" class="min-h-10 rounded-md px-3 text-sm text-primary hover:bg-hover" onmousedown={(e) => e.preventDefault()} onclick={copyLink}>
      {copied ? 'Link copied' : 'Copy link to this passage'}
    </button>
    {#if canPlay}
      <button type="button" class="min-h-10 rounded-md px-3 text-sm text-accent hover:bg-hover" onmousedown={(e) => e.preventDefault()} onclick={playSelection}>
        ▶ {formatTime(sel.start)}–{formatTime(sel.end)}
      </button>
    {/if}
  </div>
{/if}

<!-- FAB + Follow (once playback has started); bottom-left — the Anís chat button owns bottom-right -->
{#if started && canPlay}
  <div class="fixed bottom-4 left-4 z-30 flex flex-col items-start gap-2 sm:bottom-6 sm:left-6">
    {#if !follow && playing}
      <button type="button" onclick={resync} class="min-h-10 rounded-full border border-border bg-surface-0 px-4 text-sm font-medium text-accent shadow-lg backdrop-blur hover:bg-surface-1">
        ↧ Follow
      </button>
    {/if}
    <button type="button" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'}
      class="flex h-14 items-center gap-2 rounded-full bg-accent pl-4 pr-5 text-accent-text shadow-xl hover:bg-accent-hover">
      {#if playing}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      {:else}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
      {/if}
      <span class="font-mono text-sm tabular-nums">{formatTime(current)}</span>
    </button>
  </div>
{/if}
