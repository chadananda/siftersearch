<script>
  // /media/<slug> island: talk metadata + the audio engine over the aligned transcript (MediaTranscript) and waveform bar.
  // Rights: 'full' plays audio.ogg|m4a; 'clips' asks clip_url for ≤ clip_cap s per play (time = clip.start + currentTime,
  // stops at the clip end); 'search' is text only. While playing a rAF loop binary-searches the word at the current time,
  // toggles its highlight class directly on the span, and (in Follow mode) scrolls so the playing line keeps its screen
  // position; wheel/touch/scroll keys drop Follow. ?t=a / ?t=a-b / #t=a,b set the start / a played-and-shaded range.
  // Paragraphs arrive compact (compactParagraph, the page's props) and are expanded once here; a paragraph is split into
  // word spans (`live`) when it nears the viewport or playback, a deep link or a range needs it (upgrade).
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { media } from '../../lib/api.js';
  import { audioReady, audioWarmPath } from '../../lib/media-ready.js';
  import { liveRefresh } from '../../lib/live-data.js';
  import { expandParagraph, flattenWords, segmentWordAt, remasterOnly, wordAt, youtubeAtTime, picture, sameMediaRevision } from '../../lib/media.js';
  import { rangeFrom, formatTime, rangeParam } from '../../../api/lib/media/range.js';
  import MediaTranscript from './MediaTranscript.svelte';
  import MediaWaveform from './MediaWaveform.svelte';
  import RecordLabel from './listening/RecordLabel.svelte';
  import { anchorFor as followAnchor, followStep, isManualScroll } from '../../lib/media-follow.js';
  import ShareRow from './ShareRow.svelte';
  import TalkFeedback from './TalkFeedback.svelte';
  import { CLIP_MAX_MS, clipPath } from '../../../api/lib/media/clip-text.js';
  import { SITE } from '../../lib/share.js';
  import { webTime, originalTime } from '../../../api/lib/media/trim.js';
  import { eraVar, duration as dur } from '../../lib/media-listing.js';

  let { item, initialRange = null, related = [], speakerKey = null, speakersByKey = {} } = $props();

  const level = item.rights?.playback || 'search';
  let updatedTalkAvailable = $state(false);
  // The original never plays (Chad 10-29/10-31, both hosts): the player drops any original URL the API might carry.
  let audioInfo = $state(remasterOnly(item.audio));
  const canPlay = $derived(!updatedTalkAvailable && ((level === 'full' && !!audioInfo && audioInfo.sync_ready !== false) || (level === 'clips' && !!item.clip_url)));
  const duration = Number(item.duration_s) || 0;
  // the contents list: the topic subheaders (each a #slug anchor), else the coarser chapters
  const toc = item.headings?.length ? item.headings.map((h) => ({ p: h.p, t: h.t, title: h.text, slug: h.slug })) : (item.chapters || []);
  // the recording's quality (Chad 10-22: a small public badge): overall grade + the main issue, details on hover/focus
  const q = item.quality;
  const ISSUE_LABEL = { muffled: 'muffled (narrow bandwidth)', noisy: 'background noise', hum: 'mains hum', reverberant: 'echoey room', clipped: 'distorted (clipped)', dropouts: 'dropouts', 'low-level': 'quiet or uneven levels', speed: 'speed off' };
  const qualityTitle = q ? [`Recording quality ${q.overall}`, q.primary_issue && q.primary_issue !== 'ok' ? ISSUE_LABEL[q.primary_issue] || q.primary_issue : 'clear',
    ...Object.entries(q.dimensions || {}).filter(([, x]) => x?.grade).map(([k, x]) => `${k} ${x.grade}`)].join(' · ') : '';
  const paragraphs = (item.paragraphs || []).map(expandParagraph);
  const flat = flattenWords(paragraphs);
  const paraStart = paragraphs.reduce((acc, p, i) => { acc.push(i ? acc[i - 1] + (paragraphs[i - 1].words?.length || 0) : 0); return acc; }, []);
  /** Paragraph indexes the times [a, b] touch (b null: the one paragraph at a). */
  const parasIn = (a, b) => {
    if (b == null) { const k = wordAt(flat.starts, a + 0.02); return k >= 0 ? [flat.para[k]] : paragraphs.length ? [0] : []; }
    return paragraphs.map((p, i) => i).filter((i) => (paragraphs[i].t1 ?? Infinity) >= a && (paragraphs[i].t0 ?? 0) <= b);
  };
  // the paragraphs rendered as word spans; the SSR range (?t=a-b) is split on the server so its shading is in the first paint
  const live = new SvelteSet(initialRange ? parasIn(initialRange.start, initialRange.end ?? null) : []);
  /** Split paragraph pi into word spans (idempotent); resolves once they are in the DOM. */
  async function upgrade(pi) {
    if (pi == null || pi < 0) return;
    live.add(pi);
    await tick();
  }
  // audioInfo starts as the SSR data and is refreshed once on load (liveRefresh below): the page HTML is edge-cached
  let loaded = '';                             // the URL in the <audio> (audio.src is absolute; compare by ours)
  const ytBase = item.youtube || (item.source?.kind === 'youtube' ? item.source.url : null);

  let audio;                                   // <audio>
  let root = $state();                         // transcript container
  let wordEls = [];                            // flat index → span (filled as paragraphs are split)
  const wordEl = (k) => {
    if (k < 0) return null;
    const el = wordEls[k];
    if (el?.isConnected) return el;
    return (wordEls[k] = root?.querySelector(`[data-k="${k}"]`) || null);
  };
  const paraEl = (t) => { const pi = parasIn(t, null)[0]; return pi != null ? document.getElementById(`para_${paragraphs[pi].n}`) : null; };
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
  let sharing = $state(false);   // the selection's share panel is open
  const selUrl = $derived(sel ? `${SITE}${clipPath(item.slug, Math.floor(sel.start * 1000), Math.ceil(sel.end * 1000))}` : '');

  // the web copy may start later than the recording (silence trimmed, item.audio.offset_s): every time on this page is the
  // recording's own; the ONE conversion is here (now) and at the seek below. A clip carries its own start.
  // cuts (item.audio.cuts: songs, prayers, MC … removed from the web copy, rules §8): the same trim.js conversions the server uses
  const offset = item.audio?.offset_s || 0;
  const trim = { start_s: offset, cuts: item.audio?.cuts || [] };
  const skips = item.skips || [];
  const now = () => (clip ? clip.start + (audio?.currentTime || 0) : originalTime(audio?.currentTime || 0, trim));
  const youtubeHref = $derived(youtubeAtTime(ytBase, current));
  const photo = item.thumb?.kind === 'sketch';
  // the header portrait at its size, face-centred by the image service (the biography helper; a tile is used as is)
  const head = item.thumb?.url ? picture(item.thumb.url, 160, 160, { photo }) : { src: null, srcset: null };
  const when = [item.date || item.year, item.place, item.event].filter(Boolean);
  // the Fireside Room dressing: era tint, the subheaders as dial ticks, the section now playing, the sticky bar
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
    wordEl(curK)?.classList.remove('bg-highlight-playing!');
    curK = k;
    if (k < 0) return;
    const el = wordEl(k);
    if (!el) {                                  // plain text: split the paragraph, then mark (once — never a retry loop)
      const fresh = !live.has(flat.para[k]);
      upgrade(flat.para[k]).then(() => { if (curK === k && (fresh || wordEl(k))) { curK = -1; mark(k); } });
      return;
    }
    el.classList.add('bg-highlight-playing!');
    playingPara = flat.para[k];
    if (follow && playing) keepLine(el);
  }
  function keepLine(el, force = false) {
    const r = el.getBoundingClientRect();
    const step = followStep(r.top, window.scrollY, anchorY, force ? null : lastLineTop, force);
    lastLineTop = step.pageTop;
    if (step.delta) window.scrollBy({ top: step.delta, behavior: 'smooth' });
  }
  const anchorFor = (el) => followAnchor(el?.getBoundingClientRect().top ?? null, window.innerHeight);
  function resync() {
    follow = true; anchorY = followAnchor(null, window.innerHeight); lastLineTop = null;
    if (wordEl(curK)) keepLine(wordEl(curK), true);
  }

  function frame() {
    let t = now();
    // a dead gap (a tape flip) is skipped, never cut: jump to its end
    if (level === 'full' && skips.length) { const to = skips.find((g) => t >= g.from && t < g.to)?.to; if (to != null) { audio.currentTime = webTime(to, trim); t = to; } }
    if (Math.abs(t - current) > 0.05) current = t;
    if (limit != null && t >= limit) { audio.pause(); note = 'End of the selected range.'; }
    mark(wordAt(flat.starts, t + 0.02));
    if (playing) raf = requestAnimationFrame(frame);
  }

  // ── playback ──
  const waitMeta = (source) => new Promise((res, rej) => {
    const expected = new URL(source, document.baseURI).href;
    const matching = () => audio.readyState >= 1 && audio.currentSrc === expected;
    if (matching()) return res();
    const clear = () => { clearTimeout(timer); audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); };
    const ok = () => { if (!matching()) return; clear(); res(); };
    const fail = () => { if (audio.currentSrc !== expected) return; clear(); rej(new Error('Audio could not be loaded.')); };
    const timer = setTimeout(() => { clear(); rej(new Error('Audio is taking too long to load. Try again.')); }, 25000);
    audio.addEventListener('loadedmetadata', ok);
    audio.addEventListener('error', fail);
  });
  async function setSourceAndWait(source) {
    // readyState can still describe the previous source (including the silent iOS unlock clip).
    // Attach the source-specific waiter before changing src so a fast cached response is not missed.
    const ready = waitMeta(source);
    audio.src = source;
    await ready;
  }
  function seekAndWait(time) {
    const target = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time));
    if (!audio.seeking && Math.abs(audio.currentTime - target) < 0.05) return Promise.resolve();
    return new Promise((res, rej) => {
      const clear = () => { clearTimeout(timer); audio.removeEventListener('seeked', done); audio.removeEventListener('error', fail); };
      const done = () => {
        if (audio.seeking || audio.currentSrc === '' || Math.abs(audio.currentTime - target) > 1) return;
        clear(); res();
      };
      const fail = () => { clear(); rej(new Error('Audio seek failed.')); };
      const timer = setTimeout(() => { clear(); rej(new Error('Audio seek is taking too long. Try again.')); }, 15000);
      audio.addEventListener('seeked', done);
      audio.addEventListener('error', fail, { once: true });
      audio.currentTime = target;
      done();
    });
  }
  async function loadCopy(want) {
    // A cached file goes straight to the media element. Only a failed media
    // load needs the preparation endpoint and its one-time Tower → R2 copy.
    loaded = want;
    try { await setSourceAndWait(media.href(want)); }
    catch {
      if (!(await ready(want))) throw new Error('Audio is still preparing. Press Play to try again.');
      note = ''; await setSourceAndWait(media.href(want));
    }
  }

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
    limit = end; note = ''; started = true; current = t;
    follow = true; anchorY = anchorFor(el || wordEl(wordAt(flat.starts, t + 0.02)) || paraEl(t)); lastLineTop = null;
    try {
      if (level === 'full') {
        const ogg = audio.canPlayType('audio/ogg; codecs="opus"');
        const want = ogg && audioInfo.ogg ? audioInfo.ogg : audioInfo.m4a || audioInfo.ogg;
        if (fresh || !audio.src || audio.src.startsWith('blob:') || loaded !== want || audio.error) { busy = true; try { await loadCopy(want); note = ''; } finally { busy = false; } }
        await seekAndWait(webTime(t, trim));   // recording time → trimmed web copy time; wait for mobile range seek to finish
      } else {
        const want = end ?? t + (item.rights.clip_cap || 180);
        if (fresh || !clip || t < clip.start || t >= clip.end - 0.5 || (end != null && end > clip.end + 0.1)) {
          busy = true;
          const stop = Math.min(want, t + (item.rights.clip_cap || 180), duration || Infinity);
          const c = await media.clip(item.clip_url, t.toFixed(1), stop.toFixed(1), audio.canPlayType('audio/ogg; codecs="opus"') ? null : 'm4a');
          clip = { start: c.start, end: c.end };
          await setSourceAndWait(media.href(c.url));
        }
        await seekAndWait(t - clip.start);
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
    if (!started || (level === 'full' && (!loaded || audio.src.startsWith('blob:') || audio.error))) return playFrom(started ? current : startAt, { end: limit });
    if (level === 'clips' && (!clip || t >= clip.end - 0.3)) return playFrom(t, { end: limit });        // next clip
    follow = true; anchorY = anchorFor(wordEl(curK)); lastLineTop = null;
    audio.play().catch((e) => (note = `Could not play: ${e.message}`));
  }
  /** Wait until the audio object is in the edge store (202 + Retry-After while it is being prepared): "preparing audio". */
  const ready = path => audioReady(media.href(path), { onWaiting: () => { note = 'Getting the audio ready…'; } });
  const seek = (t) => (playing || started ? playFrom(t, { end: null }) : (startAt = t, current = t, mark(wordAt(flat.starts, t + 0.02))));
  const onword = (k, el) => playFrom(flat.starts[k], { el });
  const onpara = (pi, el) => {
    if (playing && playingPara === pi) { audio.pause(); return; }
    const p = paragraphs[pi];
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
      // the first and last word touched, whether split into spans (data-k) or still plain text (data-s/data-e)
      let first = null, lastEl = null;
      for (const el of root.querySelectorAll('[data-k],[data-s]')) if (r.intersectsNode(el)) { first ??= el; lastEl = el; } else if (first) break;
      const a = first ? wordOf(first, r.startContainer, r.startOffset, false) : -1;
      let b = lastEl ? wordOf(lastEl, r.endContainer, r.endOffset, true) : -1;
      if (a < 0 || b < a) { sel = null; return; }
      const box = r.getBoundingClientRect();
      // snap to the words selected, capped at 3 minutes (a clip is ≤ 180 s): the clip URL is stateless
      while (b > a && flat.ends[b] - flat.starts[a] > CLIP_MAX_MS / 1000) b--;
      const words = [];
      for (let k = a; k <= b; k++) { const w = paragraphs[flat.para[k]].words[flat.idx[k]]; if (!w[3]) words.push(w[0]); }
      sel = { start: flat.starts[a], end: Math.max(flat.ends[b], flat.starts[a] + 1), text: words.join(' '), x: Math.min(Math.max(8, box.left), window.innerWidth - 340), y: Math.min(box.bottom + 8, window.innerHeight - 64) };
      sharing = false;
    }, 150);
  }
  /** The flat word index at a range boundary inside el: a word span is itself; in plain text the caret offset finds the word
   *  (a boundary outside el's text: its first word at the start of a selection, its last at the end). */
  function wordOf(el, node, offset, isEnd) {
    if (el.dataset.k != null) return Number(el.dataset.k);
    const pi = Number(el.closest('[data-p]').dataset.p), p = paragraphs[pi], i0 = Number(el.dataset.s), i1 = Number(el.dataset.e);
    const wi = node?.nodeType === 3 && el.contains(node) ? segmentWordAt(p.words, i0, i1, node.data, isEnd ? Math.max(0, offset - 1) : offset)
      : isEnd ? i1 - 1 : i0;
    return paraStart[pi] + wi;
  }
  function playSelection() {
    if (!sel) return;
    range = { start: sel.start, end: sel.end };
    playFrom(sel.start, { end: sel.end });
    window.getSelection()?.removeAllRanges(); sel = null;
  }

  // ── keyboard, manual scroll, Media Session ──
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  function onKey(e) {
    if (typing(e.target)) return;
    if (e.code === 'Space' && !e.repeat && !/^(BUTTON|A)$/.test(e.target?.tagName) && e.target?.getAttribute?.('role') !== 'slider') {
      e.preventDefault(); toggle(); return;
    }
    if (isManualScroll(e, { playing, sinceStartMs: performance.now() - startedAt })) follow = false;
  }
  let startedAt = 0;   // when playback last started: momentum wheel events right after the click are not a manual scroll
  const manual = (e) => { if (isManualScroll(e, { playing, sinceStartMs: performance.now() - startedAt })) follow = false; };

  function sessionSetup() {
    if (!('mediaSession' in navigator)) return;
    const art = item.thumb?.url ? [{ src: new URL(media.href(picture(item.thumb.url, 512, 512, { photo: item.thumb.kind === 'sketch' }).src), location.href).href, sizes: '512x512', type: /\.svg/.test(item.thumb.url) ? 'image/svg+xml' : 'image/webp' }] : [];
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

  const cleanups = [];
  onMount(() => {
    // Opening a talk sends the copy this browser plays to the edge store (Chad 10-29); it streams from R2 while it lands
    // (idempotent: a present copy answers at once)
    if (level === 'full' && audioInfo && audio) {
      const ogg = audio.canPlayType('audio/ogg; codecs="opus"');
      const main = ogg && audioInfo.ogg ? audioInfo.ogg : audioInfo.m4a || audioInfo.ogg;
      const warm = main && audioWarmPath(media.href(main));
      if (warm) fetch(warm, { method: 'POST' }).catch(() => {});
    }
    let r = rangeFrom({ search: location.search, hash: location.hash });
    // ?p=<paragraph_index> — a search hit on the transcript document: start at that paragraph
    const pq = new URLSearchParams(location.search).get('p');
    if (!r && pq != null && /^\d+$/.test(pq)) {
      const ps = paragraphs.filter((x) => x.pi != null && x.pi <= Number(pq));
      if (ps.length) r = { start: ps[ps.length - 1].t0, end: null };
    }
    const mq = new URLSearchParams(location.search).get('m');
    const mm = mq && moments.find((x) => x.key === mq);
    if (!r && mm) {
      r = { start: mm.t0_ms / 1000, end: mm.t1_ms / 1000 };
      momentNow = mm.key;
      tick().then(() => document.getElementById(`moment-${mm.key}`)?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    }
    if (r) {
      startAt = r.start; current = r.start; limit = r.end ?? null;
      range = r.end != null ? r : null;
      // split the target paragraph(s) before marking and scrolling: the same text and layout, so nothing moves
      parasIn(r.start, r.end ?? null).forEach((pi) => live.add(pi));
      tick().then(() => { const k = wordAt(flat.starts, r.start + 0.02); mark(k); wordEl(k)?.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    }
    // The hero is server-rendered outside this island. Refresh its description
    // along with the audio metadata so a cached page cannot hide editorial updates.
    const stopMetadata = liveRefresh(async () => {
      const d = await media.get(item.slug);
      return {version:d.version, summary:d.summary, audio:d.audio};
    }, d => {
      const description = document.querySelector('.talk-hero [data-talk-description]');
      if (description && typeof d.summary === 'string') {
        description.textContent = d.summary;
        description.hidden = !d.summary;
      }
      // SSR HTML and the refreshed API payload must be one transcript/audio snapshot. Never pair
      // a fresh immutable audio URL with word timings from older cached HTML.
      if (!sameMediaRevision(item.version, d.version)) { updatedTalkAvailable = true; audio?.pause(); return; }
      if (d.audio) audioInfo = remasterOnly(d.audio);
    }, {every:60_000, idle:false, initial:{version:item.version,summary:item.summary,audio:item.audio},
      same:(a,b)=>a.version===b.version && a.summary===b.summary && JSON.stringify(a.audio)===JSON.stringify(b.audio)});
    cleanups.push(stopMetadata);
    if (canPlay) sessionSetup();
    const silent = () => audio.src.startsWith('blob:');   // the unlock blip, not the talk
    const onPlay = () => { if (silent()) return; playing = true; startedAt = performance.now(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    const onPause = () => { if (silent()) return; playing = false; cancelAnimationFrame(raf); frame(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; sessionPosition(); };
    const onEnded = () => { if (silent()) return; onPause(); if (level === 'clips' && clip && clip.end < duration - 1 && (limit == null || clip.end < limit - 0.5)) note = 'Excerpt ended — press play to continue.'; };
    const onErr = () => { if (silent() || busy) return; note = 'The audio could not be loaded.'; };
    audio.addEventListener('play', onPlay); audio.addEventListener('pause', onPause); audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErr); audio.addEventListener('seeked', sessionPosition);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', manual, { passive: true });
    window.addEventListener('touchmove', manual, { passive: true });
    document.addEventListener('selectionchange', onSelection);
    // the slim bar takes over once the hero's player has scrolled away
    // (an IntersectionObserver missed a jump from below the fold straight past the player — phones, where the player
    // starts below the fold: not-intersecting → not-intersecting fires nothing — so the position is read on scroll)
    let heroRaf = 0;
    const heroCheck = () => { heroRaf = 0; if (heroPlayer) heroOut = heroPlayer.getBoundingClientRect().bottom < 0; };
    const onHeroScroll = () => { if (!heroRaf) heroRaf = requestAnimationFrame(heroCheck); };
    window.addEventListener('scroll', onHeroScroll, { passive: true });
    heroCheck();
    const io = { disconnect: () => { window.removeEventListener('scroll', onHeroScroll); cancelAnimationFrame(heroRaf); } };
    return () => {
      io.disconnect();
      cleanups.forEach((f) => f());
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', manual); window.removeEventListener('touchmove', manual);
      document.removeEventListener('selectionchange', onSelection);
    };
  });

  $effect(() => { if (audio) audio.playbackRate = rate; });
  // a shaded range (a moment, a selection played) is split into spans so its shading shows
  $effect(() => { const r = range; if (r?.end != null) untrack(() => parasIn(r.start, r.end).forEach((pi) => live.add(pi))); });
  // the hero (TalkHero, server-rendered outside this island) spins its record and lights its lamp while playing
  $effect(() => {
    const on = playing;
    document.querySelector('.talk-hero .record')?.classList.toggle('spinning', on);
    document.querySelector('.talk-hero .lamp')?.classList.toggle('live', on);
  });
</script>

<article class="talk">
  {#if audioInfo?.restoration_status === 'pending'}<p class="mt-3 text-sm text-radio-ink">Full restoration is pending. This listening copy has only basic cleanup.</p>{/if}
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
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-radio-dial-ink">
            <span class="flex-none font-dial text-lg font-bold tabular-nums tracking-wider">{formatTime(current)} <span class="opacity-60">/ {formatTime(duration)}</span></span>
            {#if nowSection}<span class="min-w-0 truncate opacity-80">§ {nowSection.title}</span>{/if}
            <div class="flex flex-none items-center">
            <label class="flex items-center gap-1.5 text-xs opacity-80">Speed
              <select bind:value={rate} class="speed rounded-md bg-radio-paper px-1.5 py-0.5 font-sans text-sm text-radio-ink">
                {#each [0.75, 1, 1.25, 1.5, 2] as r (r)}<option value={r}>{r}×</option>{/each}
              </select>
            </label>
            </div>
          </div>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-radio-dial-ink opacity-80">
            {#if range}
              <span>Range {formatTime(range.start)}–{formatTime(range.end)}
                <button type="button" class="ml-1 font-semibold underline hover:text-radio-amber" onclick={() => { range = null; limit = null; note = ''; }}>clear</button></span>
            {:else if !started && startAt > 0}
              <span>Starts at {formatTime(startAt)}</span>
            {/if}
            {#if item.pending}<span class="font-semibold text-radio-amber" title="Only talks with restored audio go on the air">Pending restoration — the restored audio is not ready yet</span>{/if}
            {#if level === 'clips'}<span title={item.rights?.basis || ''}>Plays in excerpts of up to {Math.round((item.rights?.clip_cap || 180) / 60)} min</span>{/if}
            <span class="hidden sm:inline">Space = play/pause · click any word to play from it · select text to share a passage</span>
          </div>
          {#if note}<p class="mt-2 text-sm font-semibold text-radio-needle" role="status">{note}</p>{/if}
          {#if updatedTalkAvailable}<p class="mt-2 text-sm text-radio-dial-ink" role="status">This talk was updated while the page was open. <button type="button" class="font-semibold underline underline-offset-2" onclick={() => location.reload()}>Reload the matching transcript and audio</button>.</p>{/if}
        {:else}
          {#if updatedTalkAvailable}
            <p class="text-sm text-radio-dial-ink" role="status">This talk was updated while the page was open. <button type="button" class="font-semibold underline underline-offset-2" onclick={() => location.reload()}>Reload the matching transcript and audio</button>.</p>
          {:else if item.audio?.sync_ready === false}
            <p class="text-sm text-radio-dial-ink" role="status">Playback is paused until this transcript and its matching audio are ready.</p>
          {:else}
            <p class="text-sm text-radio-dial-ink">Text only — audio is not available for this recording{item.source?.kind === 'youtube' ? '; the full talk is on YouTube' : ''}.</p>
          {/if}
        {/if}
        <!-- svelte-ignore a11y_media_has_caption — the transcript below is the caption track -->
        <audio bind:this={audio} preload="metadata" class="hidden"></audio>
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
        <TalkFeedback slug={item.slug} {duration} getCurrent={() => current} onpreview={(t) => (canPlay ? playFrom(t, { end: null }) : seek(t))} />
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
      <MediaTranscript bind:root {paragraphs} {live} onnear={upgrade} headings={item.headings || []} links={item.links || []} quotes={item.quotes || []} crossRefs={item.cross_references || []}
        speakers={item.speakers || {}} {range} {canPlay} {playing} {playingPara} {onword} {onpara}
        {moments} slug={item.slug} speaker={item.speaker || ''} portrait={photo ? item.thumb.url : null} year={item.year} {onmoment} {momentNow} {skips} cuts={item.cuts || []} {duration} />
    </div>

    {#if item.topics?.length || item.quotes?.length || item.cross_references?.length}
      <aside class="mt-10 space-y-8 lg:order-3 lg:col-span-4 lg:mt-0" aria-label="About this talk">
        {#if item.topics?.length}
          <div>
            <h2 class="mb-2 font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-ink-soft">On the program · topics</h2>
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
      </aside>
    {/if}
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

<!-- selection → share this clip (a stateless /media/<slug>/clip/<startMs>-<endMs> page) -->
{#if sel}
  <div class="selpop fixed z-40 rounded-xl bg-radio-walnut-deep p-1 shadow-lg" style={`left:${sel.x}px;top:${sel.y}px`} role="dialog" aria-label="Share this clip">
    <div class="flex gap-1">
      <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-radio-on-dark hover:bg-radio-walnut" onmousedown={(e) => e.preventDefault()} onclick={() => (sharing = !sharing)} aria-expanded={sharing}>
        Share this clip · {formatTime(sel.start)}–{formatTime(sel.end)}
      </button>
      {#if canPlay}
        <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-radio-amber hover:bg-radio-walnut" onmousedown={(e) => e.preventDefault()} onclick={playSelection} aria-label={`Play ${formatTime(sel.start)} to ${formatTime(sel.end)}`}>▶</button>
      {/if}
    </div>
    {#if sharing}
      <div class="px-2 pb-2 pt-1" role="presentation" onmousedown={(e) => e.preventDefault()}>
        <ShareRow url={selUrl} text={`“${sel.text.length > 200 ? `${sel.text.slice(0, sel.text.lastIndexOf(' ', 200))}…` : sel.text}”${item.speaker ? ` — ${item.speaker}` : ''}`} title={item.title} tone="dark" compact />
        <a href={selUrl} class="mt-2 inline-block text-sm font-semibold text-radio-on-dark underline decoration-radio-brass underline-offset-2 hover:text-radio-amber">Open the page for this clip</a>
      </div>
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
  .record { border-radius: 9999px; }
  .record.spinning, .spin { animation: ring 2.4s ease-in-out infinite; }   /* playing = a quiet pulsing ring, never a spin */
  @keyframes ring { 0%, 100% { box-shadow: 0 0 0 0 var(--radio-glow); } 50% { box-shadow: 0 0 0 7px var(--radio-glow); } }
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
  .rel-label { position: absolute; inset: 16%; border-radius: 9999px; overflow: hidden; box-shadow: 0 0 0 2px var(--radio-brass); }

  /* sticky slim bar + FAB */
  .slimbar { position: fixed; left: 0; right: 0; top: 3.6rem; z-index: 35; background: color-mix(in srgb, var(--radio-walnut-deep) 94%, transparent); backdrop-filter: blur(8px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), inset 0 -1px 0 var(--radio-brass); animation: drop 0.35s cubic-bezier(0.3, 0.7, 0.4, 1); }
  @keyframes drop { from { transform: translateY(-110%); opacity: 0; } to { transform: none; opacity: 1; } }
  .fab { display: flex; height: 3.5rem; align-items: center; gap: 0.5rem; padding: 0 1.25rem 0 1rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 4px var(--radio-glow); }
  .follow { min-height: 2.5rem; padding: 0 1rem; border-radius: 9999px; font-weight: 600; font-size: 0.9rem; background: var(--radio-walnut-deep); color: var(--radio-amber); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3), inset 0 0 0 1px var(--radio-brass); }
  @media (prefers-reduced-motion: reduce) {
    .record, .record.spinning, .spin, .lamp.live, .slimbar { animation: none; }
    .rel, .rel-disc, .bigplay { transition: none; }
  }
</style>
