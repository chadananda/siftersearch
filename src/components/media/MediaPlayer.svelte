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
  import RecordLabel from './listening/RecordLabel.svelte';
  import { eraVar, duration as dur } from '../../lib/media-listing.js';

  let { item, initialRange = null, related = [], speakerKey = null, speakersByKey = {} } = $props();

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
  // the Listening Room dressing: era tint, the subheaders as dial ticks, the section now playing, the sticky bar
  const tint = eraVar(item.year);
  const ticks = toc.map((c) => ({ t: c.t, title: c.title }));
  const sectionAt = (t) => { let c = null; for (const x of toc) if (x.t != null && x.t <= t + 0.5) c = x; return c; };
  const nowSection = $derived(sectionAt(current));
  const audienceLabel = typeof item.audience === 'string' ? item.audience : item.audience?.label || null;
  let heroPlayer = $state(), heroOut = $state(false), tocOpen = $state(false);
  // MOMENTS: the speaker's notable statements — inline cards in the transcript, a highlights strip and pins on the scrubber
  const moments = (item.moments || []).filter((m) => m.key && m.text).sort((a, b) => a.t0_ms - b.t0_ms);
  const pins = moments.map((m) => m.t0_ms / 1000);
  let momentNow = $state(null);
  function onmoment(m) {
    if (momentNow === m.key && playing) { audio.pause(); return; }
    momentNow = m.key;
    range = { start: m.t0_ms / 1000, end: m.t1_ms / 1000 };
    playFrom(range.start, { end: range.end, el: document.getElementById(`moment-${m.key}`) });
  }
  function toMoment(e, m) {
    e.preventDefault();
    history.replaceState(null, '', `#moment-${m.key}`);
    document.getElementById(`moment-${m.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
    const mq = new URLSearchParams(location.search).get('m');
    const mm = mq && moments.find((x) => x.key === mq);
    if (!r && mm) {
      r = { start: mm.t0_ms / 1000, end: mm.t1_ms / 1000 };
      momentNow = mm.key;
      tick().then(() => document.getElementById(`moment-${mm.key}`)?.scrollIntoView({ block: 'center' }));
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
    // the slim bar takes over once the hero's player has scrolled away
    const io = new IntersectionObserver(([e]) => { heroOut = !e.isIntersecting && e.boundingClientRect.top < 0; });
    if (heroPlayer) io.observe(heroPlayer);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', manual); window.removeEventListener('touchmove', manual);
      document.removeEventListener('selectionchange', onSelection);
    };
  });

  $effect(() => { if (audio) audio.playbackRate = rate; });
  // the hero (TalkHero, server-rendered outside this island) spins its record and lights its lamp while playing
  $effect(() => {
    const on = playing;
    document.querySelector('.talk-hero .record')?.classList.toggle('spinning', on);
    document.querySelector('.talk-hero .lamp')?.classList.toggle('live', on);
  });
</script>

<article class="talk">
  <!-- the broadcast card continues from TalkHero (SSR-only, above this island): the player on the dial glass -->
  <div class="cabinet-tail rounded-b-3xl bg-radio-walnut-deep px-2.5 pb-2.5 sm:px-3 sm:pb-3">
    <div class="cabinet-inner rounded-b-2xl bg-radio-walnut px-4 pb-5 pt-1 sm:px-8 sm:pb-7">
      <!-- the player on the dial glass -->
      <section bind:this={heroPlayer} aria-label="Player" class="dial mt-6 rounded-2xl bg-radio-dial p-3 sm:p-4">
        {#if canPlay}
          <div class="flex items-center gap-3 sm:gap-4">
            <button type="button" onclick={toggle} disabled={busy} aria-label={playing ? 'Pause' : 'Play'} class="bigplay">
              {#if busy}
                <svg class="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              {:else if playing}
                <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              {:else}
                <svg class="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
              {/if}
            </button>
            <div class="min-w-0 flex-1">
              <MediaWaveform url={item.waveform} {duration} {current} {range} onseek={seek} {ticks} {pins} />
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-radio-dial-ink">
            <span class="font-dial text-lg font-bold tabular-nums tracking-wider">{formatTime(current)} <span class="opacity-60">/ {formatTime(duration)}</span></span>
            {#if nowSection}<span class="min-w-0 truncate opacity-80">§ {nowSection.title}</span>{/if}
            <label class="ml-auto flex items-center gap-1.5 font-dial font-semibold uppercase tracking-wider">Speed
              <select bind:value={rate} class="speed rounded-md bg-radio-paper px-1.5 py-0.5 font-sans text-sm text-radio-ink">
                {#each [0.75, 1, 1.25, 1.5, 2] as r (r)}<option value={r}>{r}×</option>{/each}
              </select>
            </label>
          </div>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-radio-dial-ink opacity-80">
            {#if range}
              <span>Range {formatTime(range.start)}–{formatTime(range.end)}
                <button type="button" class="ml-1 font-semibold underline hover:text-radio-amber" onclick={() => { range = null; limit = null; note = ''; }}>clear</button></span>
            {:else if !started && startAt > 0}
              <span>Starts at {formatTime(startAt)}</span>
            {/if}
            {#if level === 'clips'}<span title={item.rights?.basis || ''}>Plays in excerpts of up to {Math.round((item.rights?.clip_cap || 180) / 60)} min</span>{/if}
            <span class="hidden sm:inline">Space = play/pause · click any word to play from it · select text to share a passage</span>
          </div>
          {#if note}<p class="mt-2 text-sm font-semibold text-radio-needle" role="status">{note}</p>{/if}
        {:else}
          <p class="text-sm text-radio-dial-ink">Text only — audio is not available for this recording{item.source?.kind === 'youtube' ? '; the full talk is on YouTube' : ''}.</p>
        {/if}
        <!-- svelte-ignore a11y_media_has_caption — the transcript below is the caption track -->
        <audio bind:this={audio} preload="auto" class="hidden"></audio>
      </section>

      <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {#if item.source?.kind === 'youtube' && youtubeHref}
          <a href={youtubeHref} target="_blank" rel="noopener" class="chip">
            <svg class="h-4 w-4 text-radio-needle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.75 15.02V8.98L15.5 12z"/></svg>
            <span>Watch on YouTube{item.source.channel ? ` (${item.source.channel})` : ''}{current > 1 ? ` from ${formatTime(current)}` : ''}</span>
          </a>
        {/if}
        {#if item.page}
          <a href={media.href(item.page)} target="_blank" rel="noopener" class="chip">The transcript as a standalone page</a>
        {/if}
        {#if level === 'full' && item.rights?.download && item.audio?.m4a}
          <a href={media.href(item.audio.m4a)} download class="chip">Download the audio</a>
        {/if}
      </div>
    </div>
  </div>

  <div class="mt-10 lg:grid lg:grid-cols-12 lg:gap-10">
    <!-- THE PROGRAM LOG (margin TOC); first in the DOM so the contents come before the transcript on phones -->
    <aside class="mb-8 lg:order-2 lg:col-span-4 lg:mb-0">
      <div class="space-y-8 lg:sticky lg:top-32">
        {#if toc.length}
          <nav aria-label="Contents" class="log">
            <button type="button" class="log-head" aria-expanded={tocOpen} onclick={() => (tocOpen = !tocOpen)}>
              <span>Program log</span><span class="font-dial text-sm opacity-70">{toc.length} segments</span>
              <svg class="h-4 w-4 transition-transform lg:hidden" class:rotate-180={tocOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <ol class="log-list" class:open={tocOpen}>
              {#each toc as c, i (i)}
                <li>
                  <a href={c.slug ? `#${c.slug}` : `?t=${Math.floor(c.t)}`} onclick={(e) => jump(e, c.t, c.p, c.slug)} class="log-row" class:on={nowSection === c} aria-current={nowSection === c ? 'true' : undefined}>
                    <span class="log-t">{formatTime(c.t)}</span><span class="min-w-0">{c.title}</span>
                  </a>
                </li>
              {/each}
            </ol>
          </nav>
        {/if}
        {#if item.topics?.length}
          <div>
            <h2 class="mb-2 font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">On the program</h2>
            <ul class="flex flex-wrap gap-1.5">
              {#each item.topics as t (t)}<li><a href={`/media?q=${encodeURIComponent(t)}`} class="topic">{t}</a></li>{/each}
            </ul>
          </div>
        {/if}
        {#if item.quotes?.length || item.cross_references?.length}
          <p class="font-dial text-sm font-semibold uppercase tracking-wider text-radio-ink-soft">
            {item.quotes?.length || 0} quotation{item.quotes?.length === 1 ? '' : 's'} linked to source ·
            {item.cross_references?.length || 0} cross-reference{item.cross_references?.length === 1 ? '' : 's'}
          </p>
        {/if}
      </div>
    </aside>

    <div class="min-w-0 lg:order-1 lg:col-span-8">
      {#if moments.length}
        <section class="mb-10" aria-labelledby="hl-h">
          <h2 id="hl-h" class="mb-3 font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">Highlights · {moments.length} moment{moments.length === 1 ? '' : 's'} to share</h2>
          <ol class="hl-strip">
            {#each moments as m (m.key)}
              <li><a href={`#moment-${m.key}`} onclick={(e) => toMoment(e, m)} class="hl"><span class="hl-t">{formatTime(m.t0_ms / 1000)}</span><span class="hl-q">“{m.text}”</span></a></li>
            {/each}
          </ol>
        </section>
      {/if}
      <MediaTranscript bind:root paragraphs={item.paragraphs} headings={item.headings || []} links={item.links || []} quotes={item.quotes || []} crossRefs={item.cross_references || []}
        speakers={item.speakers || {}} {range} {canPlay} {playing} {playingPara} {onword} {onpara}
        {moments} slug={item.slug} speaker={item.speaker || ''} {onmoment} {momentNow} />
    </div>
  </div>

  {#if related.length}
    <section class="mt-16" aria-labelledby="related-h">
      <h2 id="related-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">Also on the dial</h2>
      <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each related as r (r.s)}
          {@const sp = speakersByKey[r.k]}
          <li>
            <a href={`/media/${r.s}`} class="rel" style={`--rt:${eraVar(r.y)}`}>
              <span class="rel-disc"><span class="rel-label"><RecordLabel name={sp?.n || r.sp || r.t} photo={sp?.p} year={r.y} size={56} /></span></span>
              <span class="min-w-0">
                <span class="block font-marquee text-lg leading-tight text-radio-ink">{r.t}</span>
                <span class="mt-0.5 block text-sm text-radio-ink-soft">{[r.sp, r.y, dur(r.d)].filter(Boolean).join(' · ')}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</article>

<!-- the slim sticky bar: the hero player, condensed, once it has scrolled away -->
{#if canPlay && heroOut}
  <div class="slimbar" role="region" aria-label="Player (condensed)">
    <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
      <span class="h-9 w-9 flex-none overflow-hidden rounded-full" class:spin={playing}><RecordLabel name={item.speaker || item.title} photo={photo ? item.thumb.url : null} year={item.year} size={36} /></span>
      <div class="hidden min-w-0 sm:block sm:w-56">
        <p class="truncate font-marquee text-base leading-tight text-radio-on-dark">{item.title}</p>
        <p class="truncate text-xs text-radio-on-dark opacity-75">{nowSection ? `§ ${nowSection.title}` : item.speaker || ''}</p>
      </div>
      <div class="min-w-0 flex-1"><MediaWaveform url={item.waveform} {duration} {current} {range} onseek={seek} {ticks} variant="slim" label="Seek (condensed player)" /></div>
      <span class="font-dial text-base font-bold tabular-nums text-radio-on-dark">{formatTime(current)}</span>
    </div>
  </div>
{/if}

<!-- selection → copy link -->
{#if sel}
  <div class="fixed z-40 flex gap-1 rounded-xl bg-radio-walnut-deep p-1 shadow-lg" style={`left:${sel.x}px;top:${sel.y}px`}>
    <button type="button" class="min-h-10 rounded-lg px-3 text-sm text-radio-on-dark hover:bg-radio-walnut" onmousedown={(e) => e.preventDefault()} onclick={copyLink}>
      {copied ? 'Link copied' : 'Copy link to this passage'}
    </button>
    {#if canPlay}
      <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-radio-amber hover:bg-radio-walnut" onmousedown={(e) => e.preventDefault()} onclick={playSelection}>
        ▶ {formatTime(sel.start)}–{formatTime(sel.end)}
      </button>
    {/if}
  </div>
{/if}

<!-- FAB + Follow (once playback has started); bottom-left — the Anís chat button owns bottom-right -->
{#if started && canPlay}
  <div class="fixed bottom-4 left-4 z-30 flex flex-col items-start gap-2 sm:bottom-6 sm:left-6">
    {#if !follow && playing}
      <button type="button" onclick={resync} class="follow">↧ Follow</button>
    {/if}
    <button type="button" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'} class="fab">
      {#if playing}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      {:else}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
      {/if}
      <span class="font-dial text-base font-bold tabular-nums tracking-wider">{formatTime(current)}</span>
    </button>
  </div>
{/if}

<style>
  .cabinet-inner {
    background-image:
      repeating-linear-gradient(97deg, transparent 0 7px, color-mix(in srgb, var(--radio-walnut-deep) 18%, transparent) 7px 8px, transparent 8px 19px),
      radial-gradient(110% 80% at 15% 0%, color-mix(in srgb, var(--tint) 30%, transparent), transparent 60%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--radio-brass) 45%, transparent), inset 0 2px 30px rgba(0, 0, 0, 0.35);
  }
  .lamp { width: 0.65rem; height: 0.65rem; border-radius: 9999px; background: var(--radio-needle); opacity: 0.45; margin-right: 0.25rem; }
  .lamp.live { opacity: 1; box-shadow: 0 0 10px 2px var(--radio-needle); animation: lamp 2.4s ease-in-out infinite; }
  @keyframes lamp { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .vinyl { background-image: repeating-radial-gradient(circle at 50% 50%, var(--radio-groove) 0 2px, color-mix(in srgb, var(--radio-groove) 80%, var(--radio-on-dark)) 2px 3px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); }
  .vinyl::after { content: ''; position: absolute; inset: 0; border-radius: 9999px; background: conic-gradient(from 30deg, transparent 0 10%, var(--radio-groove-sheen) 14%, transparent 22% 55%, var(--radio-groove-sheen) 62%, transparent 70%); }
  .record { animation: spin 2s linear infinite; animation-play-state: paused; }
  .record.spinning { animation-play-state: running; }
  .spin { animation: spin 1.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .label-ring { box-shadow: 0 0 0 2px var(--radio-brass); }
  .cabinet-tail .cabinet-inner { background-image: repeating-linear-gradient(97deg, transparent 0 7px, color-mix(in srgb, var(--radio-walnut-deep) 18%, transparent) 7px 8px, transparent 8px 19px);
    box-shadow: inset 1px -1px 0 color-mix(in srgb, var(--radio-brass) 45%, transparent), inset -1px 0 0 color-mix(in srgb, var(--radio-brass) 45%, transparent); }
  .speed { box-shadow: inset 0 0 0 1px var(--radio-line); }
  .tube { display: inline-flex; align-items: center; padding: 0.25rem 0.7rem; border-radius: 9999px; font: 700 0.85rem/1.2 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--radio-on-dark); background: color-mix(in srgb, var(--radio-walnut-deep) 55%, transparent); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .dial { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--radio-brass) 70%, transparent), inset 0 6px 18px rgba(0, 0, 0, 0.22);
    background-image: radial-gradient(60% 140% at 50% 100%, var(--radio-glow), transparent 70%); }
  .bigplay { flex: none; display: grid; place-items: center; width: 3.75rem; height: 3.75rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep);
    box-shadow: 0 0 0 0 var(--radio-glow), 0 4px 12px rgba(0, 0, 0, 0.25); transition: transform 0.2s, box-shadow 0.3s; }
  .bigplay:hover { transform: scale(1.05); box-shadow: 0 0 0 7px var(--radio-glow), 0 4px 12px rgba(0, 0, 0, 0.25); }
  .bigplay:disabled { opacity: 0.6; }
  .bigplay:focus-visible, .chip:focus-visible, .log-row:focus-visible, .log-head:focus-visible, .rel:focus-visible, .topic:focus-visible, .fab:focus-visible, .follow:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.5rem; padding: 0.4rem 0.9rem; border-radius: 0.7rem; color: var(--radio-on-dark);
    box-shadow: inset 0 0 0 1px var(--radio-brass); transition: background 0.2s; }
  .chip:hover { background: var(--radio-walnut-deep); color: var(--radio-amber); }

  /* the program log */
  .log { border-radius: 1rem; background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); overflow: hidden; }
  .log-list li + li .log-row { border-top: 1px dashed var(--radio-line); border-radius: 0; }
  .log-head { display: flex; width: 100%; align-items: baseline; gap: 0.75rem; padding: 0.9rem 1rem 0.6rem; font: 400 1.35rem/1.1 'Gloock', 'Gloock Fallback', Georgia, serif; color: var(--radio-ink); text-align: left;
    border-bottom: 2px solid var(--tint); }
  .log-head svg { margin-left: auto; align-self: center; }
  .log-list { max-height: 62vh; overflow-y: auto; padding: 0.35rem; }
  @media (max-width: 1023px) { .log-list:not(.open) { display: none; } }
  @media (min-width: 1024px) { .log-head { pointer-events: none; } }
  .log-row { position: relative; display: flex; align-items: baseline; gap: 0.75rem; min-height: 2.5rem; padding: 0.45rem 0.6rem; border-radius: 0.5rem; font-size: 0.92rem; color: var(--radio-ink-soft); transition: background 0.2s, color 0.2s; }
  .log-row:hover { background: var(--radio-brass-soft); color: var(--radio-ink); }
  .log-row.on { color: var(--radio-ink); background: var(--radio-brass-soft); }
  .log-row.on::before { content: ''; position: absolute; left: 0; top: 0.5rem; bottom: 0.5rem; width: 3px; border-radius: 2px; background: var(--radio-needle); }
  .log-t { flex: none; width: 3.4rem; font: 700 0.9rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.06em; color: var(--radio-amber); font-variant-numeric: tabular-nums; }
  .topic { display: inline-block; padding: 0.3rem 0.75rem; border-radius: 9999px; font-family: 'Libre Caslon Text', 'Caslon Fallback', Georgia, serif; font-size: 0.92rem; color: var(--radio-ink);
    background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); }
  .topic:hover { box-shadow: inset 0 0 0 1.5px var(--radio-brass); }

  /* highlights strip: the moments as broadcast tickets, scrolling sideways */
  .hl-strip { display: flex; gap: 0.75rem; overflow-x: auto; padding: 0.2rem 0.1rem 0.8rem; scroll-snap-type: x proximity; }
  .hl-strip li { flex: none; width: 17rem; scroll-snap-align: start; }
  .hl { display: flex; flex-direction: column; gap: 0.45rem; height: 100%; padding: 0.8rem 0.95rem; border-radius: 0.9rem; background: var(--radio-dial); color: var(--radio-dial-ink);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--radio-brass) 60%, transparent); transition: transform 0.25s, box-shadow 0.25s; }
  .hl:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--radio-needle), 0 8px 18px var(--radio-brass-soft); }
  .hl:focus-visible { outline: 3px solid var(--radio-needle); outline-offset: 2px; }
  .hl-t { font: 700 0.85rem/1 'Big Shoulders Display', 'Shoulders Fallback', sans-serif; letter-spacing: 0.14em; color: var(--radio-needle); }
  .hl-q { font: 400 1.05rem/1.3 'Gloock', 'Gloock Fallback', Georgia, serif; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }

  /* related */
  .rel { display: flex; align-items: center; gap: 0.9rem; padding: 0.7rem 0.9rem 0.7rem 0.7rem; border-radius: 1rem; background: var(--radio-paper);
    box-shadow: inset 0 0 0 1px var(--radio-line); transition: transform 0.25s, box-shadow 0.25s; }
  .rel:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--rt), 0 8px 20px var(--radio-brass-soft); }
  .rel-disc { position: relative; flex: none; width: 4.2rem; height: 4.2rem; border-radius: 9999px;
    background: repeating-radial-gradient(circle, var(--radio-groove) 0 1.5px, color-mix(in srgb, var(--radio-groove) 78%, var(--radio-on-dark)) 1.5px 2.5px); transition: transform 0.6s; }
  .rel:hover .rel-disc { transform: rotate(200deg); }
  .rel-label { position: absolute; inset: 16%; border-radius: 9999px; overflow: hidden; box-shadow: 0 0 0 2px var(--radio-brass); }

  /* sticky slim bar + FAB */
  .slimbar { position: fixed; left: 0; right: 0; top: 3.6rem; z-index: 35; background: color-mix(in srgb, var(--radio-walnut-deep) 94%, transparent); backdrop-filter: blur(8px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), inset 0 -1px 0 var(--radio-brass); animation: drop 0.35s cubic-bezier(0.3, 0.7, 0.4, 1); }
  @keyframes drop { from { transform: translateY(-110%); opacity: 0; } to { transform: none; opacity: 1; } }
  .fab { display: flex; height: 3.5rem; align-items: center; gap: 0.5rem; padding: 0 1.25rem 0 1rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 4px var(--radio-glow); }
  .follow { min-height: 2.5rem; padding: 0 1rem; border-radius: 9999px; font-weight: 600; font-size: 0.9rem; background: var(--radio-walnut-deep); color: var(--radio-amber); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3), inset 0 0 0 1px var(--radio-brass); }
  @media (prefers-reduced-motion: reduce) {
    .record, .spin, .lamp.live, .slimbar { animation: none; }
    .rel, .rel-disc, .bigplay { transition: none; }
  }
</style>
