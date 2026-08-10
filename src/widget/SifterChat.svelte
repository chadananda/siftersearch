<svelte:options customElement={{ tag: 'sifter-chat', shadow: 'open' }} />

<script>
  // SifterChat — Ocean's flagship embeddable companion ("The Illuminated Ocean").
  // Props from the loader: token (profile), api (origin). Config fetched per token; chat rides the
  // Jafar SSE endpoint. LIVE streaming: the server emits `text` events during craft and REPLAYS the
  // canonical reply as `chunk` events at the end — we pace the live stream word-by-word (ink onto the
  // page) and swap in the canonical text at settle (it may differ: ungrounded links get stripped).
  // Transcript persists in localStorage per token. Soft WebAudio feedback (synthesized, muteable).
  let { token = '', api = 'https://siftersearch.com' } = $props();  // ONE public domain; the edge worker proxies /api/* + /widget*

  // Ocean mark (public/ocean-noback.svg) — one path constant, used for header roundel,
  // launch bubble, message avatars and the watermark. Keeps the widget self-contained.
  const OCEAN_D = "M229.617 107.844h63.729c32.707 19.893 70.235 49.342 68.85 92.254 2.409 20.614-.603 40.628-7.23 59.5 14.578-3.727 28.01-6.01 39.997-6.01a43.446 43.446 0 0 1 24.756 6.13 27.385 27.385 0 0 1 11.445 23.018v2.405c-.663 14.965-10.361 28.188-23.914 40.629-10.12 9.315-19.095 15.625-28.01 21.695 1.928-.06 4.338-.36 6.145-.36a81.006 81.006 0 0 1 26.383 3.305 26.573 26.573 0 0 1 10.54 6.49 19.81 19.81 0 0 1 5.422 13.704 38.165 38.165 0 0 1-6.505 20.255 43.166 43.166 0 0 1-6.024 7.692 16.882 16.882 0 0 1-11.926 5.41 13.864 13.864 0 0 1-10.963-5.41c-2.71-3.546-3.072-7.332-3.072-9.436v-.54c0-2.044 1.204-3.788 2.108-5.59-1.205-.12-1.023-.3-2.83-.3-10.843 0-27.71 1.503-50.418 4.688-22.95 3.185-37.887 6.07-44.211 8.174l-.725.18a15.393 15.393 0 0 1-7.95 0c-3.252-.902-6.024-2.944-7.831-5.409-3.313-4.447-3.494-9.195-3.494-11.9a20.51 20.51 0 0 1 1.566-7.814 19.11 19.11 0 0 1 5.543-8.233 36.208 36.208 0 0 1 7.287-4.809c5-2.584 11.506-5.047 19.336-7.511a243.488 243.488 0 0 0 56.621-32.455c15.54-11.84 20.481-20.795 21.686-27.106-.904-.18-1.687-.662-6.807-.662-5.542 0-15.119 1.683-28.31 5.77-7.108 2.283-12.71 4.268-17.047 5.95a256.849 256.849 0 0 1-37.346 43.874c-21.504 23.92-47.586 43.272-76.68 57.035h-72.523c-20.54-13.943-41.14-29.569-52.465-52.527-4.88-9.015-9.639-18.031-14.156-27.227V260.38a199.873 199.873 0 0 1 25.119 36.963c8.794-51.146 36.323-95.322 61.32-139.436-37.044 25.062-54.092 66.654-74.572 104.758-5.903-24.04 9.938-46.038 22.588-64.91 32.045-37.022 66.38-75.666 114.568-89.91zm63.127 12.861v.06c-37.587 2.164-78.006 11.84-104.932 40.268-47.131 54.177-67.366 126.62-55.115 197.31 23.673 16.95 51.02 38.766 81.68 26.024 37.105-14.364 66.862-42.611 87.342-76.869a14.013 14.013 0 0 1-2.951-3.365c-1.928-3.186-2.652-6.972-2.05-10.578a22.862 22.862 0 0 1 3.495-11.3 22.695 22.695 0 0 1 9.879-8.413l.601-.24h.061l1.023-.602a114.014 114.014 0 0 0 4.096-2.523l.121-.122.24-.119 4.338-2.765a225.208 225.208 0 0 0 10.541-41.59c3.795-37.383 4.82-90.992-38.369-105.176zm-46.984 72.48h.06c23.065-.835 45.091 9.593 59.03 27.948-4.518 35.58-18.371 68.515-31.924 101.33-13.433.721-26.986 1.323-40.479 2.164a3207.925 3207.925 0 0 1 26.926-36.902c-13.432-4.448-26.805-8.835-40.178-13.643 7.048-12.32 14.457-24.581 21.926-36.842l-4.879-16.648c-15.42 2.704-30.9 4.99-46.38 7.574 12.107 25.483 25.057 50.723 33.189 77.95-10.481 0-20.902 0-31.323.12a94.64 94.64 0 0 0 52.225 43.274c-47.405 3.966-77.342-39.307-84.148-82.219l18.431-.121c-5.722-13.222-14.094-29.989-.3-41.649 16.974-19.906 41.637-31.664 67.824-32.335zm149.261 72.663a146.69 146.69 0 0 0-21.082 1.923 223.95 223.95 0 0 0-24.394 5.83h-.182a6.15 6.15 0 0 1-6.806-2.644 1.443 1.443 0 0 0-.18-.24c-.482-.541-.904-.541-1.506-.541-.207.033-.41.094-.601.18a65.533 65.533 0 0 0-4.82 2.404c-3.013 1.743-7.23 4.326-12.53 7.812-2.169 1.383-4.336 2.705-6.625 3.967l-.963.482v-.12l-.182.18a11.57 11.57 0 0 0-2.289 1.382l.06-.12-.24.241a9.27 9.27 0 0 0-.904.781l-.12.18a9.725 9.725 0 0 0-2.712 6.912l-.119.72a3.419 3.419 0 0 0 .3 2.405c.663 1.022 1.265.9 1.808.9a20.018 20.018 0 0 0 8.673-4.086 145.181 145.181 0 0 1 24.094-9.375l3.434-1.082c3.493-1.081 6.746-2.044 9.758-2.765a141.65 141.65 0 0 1 15.902-3.186c3.894-.509 7.83-.61 11.746-.3 1.412.06 2.82.201 4.217.421a15.08 15.08 0 0 1 6.324 2.405h.121a11.792 11.792 0 0 1 3.193 3.244l.059.06c.262.538.465 1.102.604 1.684.201.664.322 1.35.36 2.043a27.082 27.082 0 0 1-.421 4.627 35.647 35.647 0 0 1-3.312 9.496 64.663 64.663 0 0 1-6.807 9.918 108.934 108.934 0 0 1-17.108 15.746c-18.25 14.003-38.25 25.482-59.453 34.076-3.674 1.142-7.227 2.405-10.841 3.787-2.53.902-5.06 2.103-7.53 3.305a32.053 32.053 0 0 0-4.818 3.127c-.466.397-.89.84-1.266 1.322-.368.47-.654.998-.844 1.563a5.99 5.99 0 0 1-.24.6c-.421 1.021-.601 2.164-.601 3.245-.013.888.068 1.774.24 2.645.145.71.432 1.385.844 1.982.293.462.742.804 1.265.963a3.02 3.02 0 0 0 1.506-.06h.059c2.048-.661 4.519-1.322 7.47-2.043a277.898 277.898 0 0 1 10.059-2.104 882.727 882.727 0 0 1 44.936-6.611c8.673-1.082 17.347-1.803 26.021-2.404 3.614-.24 6.928-.301 9.94-.301a48.48 48.48 0 0 1 7.83.48c1.955.25 3.851.84 5.601 1.744.82.428 1.57.975 2.229 1.623a6.064 6.064 0 0 1 1.867 4.026v.422a9.539 9.539 0 0 1-.963 4.326 25.058 25.058 0 0 1-3.313 4.928c-.06.12-.242.3-.242.601v.602c.023.346.084.689.182 1.021.053.342.176.669.361.961.482.601.844.602 1.205.602.904 0 2.229-.782 3.313-1.864a32.522 32.522 0 0 0 4.217-5.529 34.165 34.165 0 0 0 3.433-7.031 23.033 23.033 0 0 0 1.203-6.611v-.121a9.458 9.458 0 0 0-.119-1.622v-.06c-.18-.721-.422-1.503-.844-2.104l-.24-.3-.06-.121c-.181-.361-.482-.66-.783-.961l-.362-.301a18.5 18.5 0 0 0-4.517-2.705l-.844-.42-1.205-.301a71.342 71.342 0 0 0-10.12-1.803l-.843-.119h-.602c-1.867-.18-3.854-.24-5.902-.3l-3.615-.061-2.711.06c-7.121.19-14.233.631-21.322 1.323l-3.916.359a6.024 6.024 0 0 1-6.446-4.207 5.508 5.508 0 0 1-.361-1.982c.008-.613.109-1.221.3-1.803l.061-.121.06-.24c.197-.495.46-.96.784-1.383l.361-.48c.362-.369.766-.691 1.205-.962l.301-.181 11.145-6.49a215.357 215.357 0 0 0 42.404-34.98 68.227 68.227 0 0 0 6.205-8.234 41.24 41.24 0 0 0 5-11.718v-.06c.254-1.188.415-2.394.48-3.606v-2.045a21.228 21.228 0 0 0-.421-3.965 12.678 12.678 0 0 0-5.3-8.416l-.482-.42-.603-.3c-.756-.451-1.54-.853-2.348-1.202l-.904-.361a24.918 24.918 0 0 0-3.674-1.141 58.193 58.193 0 0 0-10.24-.963z";

  let cfg = $state(null);
  let open = $state(false);
  let denied = $state(false);
  let messages = $state([]);        // {role, content, citations?, pending?, done?, lit?}
  let input = $state('');
  let busy = $state(false);
  let errorMsg = $state('');
  let bodyEl = $state(null);
  let inputEl = $state(null);
  let phase = $state('idle');       // idle | research | craft | streaming
  let muted = $state(false);
  try { muted = localStorage.getItem('sifter-chat-mute') === '1'; } catch { /* private mode */ }

  const storeKey = () => `sifter-chat:${token}`;

  // Per-visitor session id (client-generated, persisted) — groups events into "conversations" for analytics.
  const sid = (() => {
    try {
      const k = `sifter-chat-sid:${token}`;
      let v = localStorage.getItem(k);
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 40); localStorage.setItem(k, v); }
      return v;
    } catch { return String(Date.now()); }
  })();
  // Fire-and-forget analytics beacon (never blocks or errors the UI).
  function track(type, meta) {
    try {
      const body = JSON.stringify({ token, sessionId: sid, events: [{ type, ts: Date.now(), ...(meta ? { meta } : {}) }] });
      const url = `${api}/api/v1/widget/events`;
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      else fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* analytics must never break chat */ }
  }

  $effect(() => {
    if (!token) return;
    fetch(`${api}/api/v1/widget/config/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`config ${r.status}`))))
      .then((c) => {
        cfg = c;
        try { messages = JSON.parse(localStorage.getItem(storeKey()) || '[]'); } catch { messages = []; }
        if (!messages.length && c.greeting) messages = [{ role: 'assistant', content: c.greeting, done: true }];
        track('widget_load');
      })
      .catch(() => { denied = true; });
  });

  const persist = () => { try { localStorage.setItem(storeKey(), JSON.stringify(messages.slice(-40))); } catch { /* private mode */ } };
  const scroll = () => queueMicrotask(() => { if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight; });

  // ── Sound: two synthesized notes, nothing else. Quiet, warm, muteable. No audio files. ──────────
  let actx = null;
  function tone(freq, dur, { gain = 0.04, at = 0, glide } = {}) {
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      const t = actx.currentTime + at;
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch { /* audio is garnish, never an error */ }
  }
  const sndSend = () => { if (!muted) tone(720, 0.18, { glide: 380, gain: 0.05 }); };            // droplet
  const sndDone = () => { if (!muted) { tone(523.25, 0.4, { gain: 0.032 }); tone(784, 0.55, { at: 0.09, gain: 0.024 }); } }; // soft fifth
  function toggleMute() { muted = !muted; try { localStorage.setItem('sifter-chat-mute', muted ? '1' : '0'); } catch { /* ok */ } }

  // ── Paced streaming: words flow onto the page evenly, catching up if the buffer grows. ─────────
  let pendBuf = '', replay = '', gotLive = false, streamDone = false, pendCites = null, ticker = null, t0 = 0;
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
  function step() {
    const last = messages[messages.length - 1];
    if (!last || !last.pending) { stopTicker(); return; }
    if (!pendBuf) { if (streamDone) finalize(); return; }
    let take = pendBuf.length > 900 ? 4 : pendBuf.length > 320 ? 2 : 1;   // adaptive: never trail far behind
    while (take-- > 0 && pendBuf) {
      const m = pendBuf.match(/^\s*\S+/);
      if (!m) { last.content += pendBuf; pendBuf = ''; break; }
      last.content += m[0];
      pendBuf = pendBuf.slice(m[0].length);
    }
    if (phase !== 'streaming') phase = 'streaming';
    messages = [...messages];
    scroll();
  }
  function finalize() {
    stopTicker();
    const last = messages[messages.length - 1];
    if (!last || !last.pending) return;
    if (pendBuf) { last.content += pendBuf; pendBuf = ''; }
    // The end-of-stream replay is the canonical reply (ungrounded links stripped server-side).
    if (gotLive && replay.trim()) last.content = replay;
    delete last.pending;
    last.done = true;
    if (!last.content) last.content = 'Sorry — I could not find an answer just now. Please try rephrasing.';
    // Illuminated drop cap only for settled, substantial prose that opens with a letter.
    if (last.content.length > 240 && /^[A-Za-zÀ-ɏ“"']/.test(last.content)) last.lit = true;
    if (pendCites) last.citations = pendCites;
    messages = [...messages];
    busy = false;
    phase = 'idle';
    persist();
    sndDone();
    track('answer_served', { latencyMs: Date.now() - t0, chars: last.content.length });
    maybeOfferOnetap();
    scroll();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    input = '';
    errorMsg = '';
    pendBuf = ''; replay = ''; gotLive = false; streamDone = false; pendCites = null;
    messages = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '', citations: [], pending: true }];
    busy = true;
    phase = 'research';
    sndSend();
    track('message_sent', { q: text.slice(0, 400) });
    t0 = Date.now();
    scroll();
    stopTicker();
    ticker = setInterval(step, 34);
    const history = messages.slice(0, -1).filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content })).slice(-12);
    try {
      const res = await fetch(`${api}/api/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history, widget_token: token, ...(cfg?.chatbotLocation ? { chatbot_location: cfg.chatbotLocation } : {}) }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'stage' && ev.stage) { if (phase !== 'streaming') phase = ev.stage; }
          else if (ev.type === 'text' && typeof ev.content === 'string') { gotLive = true; pendBuf += ev.content; }
          else if (ev.type === 'chunk' && typeof ev.text === 'string') { if (gotLive) replay += ev.text; else pendBuf += ev.text; }
          else if (ev.type === 'citations' && Array.isArray(ev.citations)) { pendCites = ev.citations; }
          else if (ev.type === 'complete') { if (Array.isArray(ev.citations) && ev.citations.length) pendCites = ev.citations; streamDone = true; }
          else if (ev.type === 'error') { throw new Error(ev.message || 'assistant error'); }
        }
      }
      streamDone = true;   // ticker drains the buffer, then finalizes
    } catch (e) {
      stopTicker();
      messages = messages.slice(0, -1);
      messages = [...messages];
      errorMsg = 'Something went wrong reaching the assistant. Please try again.';
      busy = false;
      phase = 'idle';
      scroll();
    }
  }

  function citationHref(c) {
    return c.document_id ? `https://siftersearch.com/document/${c.document_id}` : null;
  }
  // Minimal, safe rich text: escape ALL html, then rebuild [text](https://…) links,
  // **bold**, *italics*, "> " blockquotes and "- " bullets (the crafter formats for
  // comprehension — blockquoted passages, bulleted lists, bolded key facts).
  function renderRich(t) {
    const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => s
      .replace(/\[([^\]]{1,160})\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]{1,160})\*/g, '<em>$1</em>');
    const lines = esc.split('\n');
    const out = [];
    let quoteRun = [];
    const flushQuote = () => {
      if (quoteRun.length) { out.push('<blockquote>' + quoteRun.join('<br>') + '</blockquote>'); quoteRun = []; }
    };
    for (const line of lines) {
      const bq = line.match(/^\s*&gt;\s?(.*)$/);
      if (bq) { quoteRun.push(inline(bq[1])); continue; }
      flushQuote();
      const li = line.match(/^\s*[-•]\s+(.*)$/);
      if (li) { out.push('<span class="li">• ' + inline(li[1]) + '</span>'); continue; }
      out.push(inline(line));
    }
    flushQuote();
    return out.join('\n');
  }
  // Query-prep (perceived speed): while the user types their FIRST question, debounce
  // partials to /api/chat/prep — a settled pause starts the answer pipeline server-side,
  // so it's often ready (or warming) by the time they press Enter. Fire-and-forget;
  // partials are never logged server-side.
  let prepTimer = null;
  function schedulePrep() {
    if (messages.some((m) => m.role === 'user')) return;   // opening question only
    clearTimeout(prepTimer);
    prepTimer = setTimeout(() => {
      const text = input.trim();
      if (text.split(/\s+/).length < 3) return;
      fetch(`${api}/api/chat/prep`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partial: text, sessionId: sid, widget_token: token }),
        keepalive: true,
      }).catch(() => {});
    }, 300);
  }
  // ── One Tap connect ("establish a relationship"): after the 3rd exchange, offer email research
  // summaries via Google. The Google flow lives in an intermediate iframe on the API origin, so host
  // sites never register anything. Snoozed 14 days on "Not now"; remembered once connected. ─────────
  let onetap = $state('hidden');   // hidden | offer | iframe | done
  let connectedEmail = $state('');
  try { connectedEmail = localStorage.getItem(`sifter-onetap:${token}`) || ''; } catch { /* private mode */ }
  const snoozeKey = () => `sifter-onetap-snooze:${token}`;
  function maybeOfferOnetap() {
    if (connectedEmail || onetap !== 'hidden') return;
    if (messages.filter((m) => m.role === 'user').length < 3) return;
    try { if (Number(localStorage.getItem(snoozeKey()) || 0) > Date.now() - 14 * 864e5) return; } catch { /* ok */ }
    onetap = 'offer';
    track('onetap_shown');
    scroll();
  }
  function onetapConnect() { onetap = 'iframe'; scroll(); }
  function onetapSnooze() {
    onetap = 'hidden';
    try { localStorage.setItem(snoozeKey(), String(Date.now())); } catch { /* ok */ }
    track('onetap_snoozed');
  }
  $effect(() => {
    const onMsg = (e) => {
      if (e.origin !== api || e.data?.type !== 'sifter-onetap') return;
      if (e.data.ok && e.data.email) {
        connectedEmail = e.data.email;
        try { localStorage.setItem(`sifter-onetap:${token}`, connectedEmail); } catch { /* ok */ }
        onetap = 'done';
        track('onetap_connected');
        setTimeout(() => { onetap = 'hidden'; }, 6000);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
  let openedOnce = false;
  function togglePanel() {
    open = !open;
    if (open) {
      scroll();
      setTimeout(() => inputEl?.focus(), 400);
      if (!openedOnce) { openedOnce = true; track('open'); }
    }
  }
  $effect(() => {
    const esc = (e) => { if (e.key === 'Escape' && open) open = false; };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
</script>

{#if cfg && !denied}
  <div class="root {cfg.position === 'bottom-left' ? 'left' : 'right'}" style="--accent:{cfg.accent}">
    {#if open}
      <section class="panel" aria-label="{cfg.name} chat">
        <header>
          <span class="roundel" aria-hidden="true"><svg viewBox="0 0 512 512"><path fill="currentColor" d={OCEAN_D}/></svg></span>
          <span class="titles">
            <span class="title">{cfg.name}</span>
            <span class="subtitle">Ocean guide</span>
          </span>
          <span class="hbtns">
            <button class="icon" aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted} onclick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" fill="currentColor" stroke="none"/>
                {#if muted}<path d="M16 8.5 21 15M21 8.5 16 15"/>{:else}<path d="M16.5 9a4.2 4.2 0 0 1 0 6M18.8 6.8a7.5 7.5 0 0 1 0 10.4"/>{/if}
              </svg>
            </button>
            <button class="icon close" aria-label="Close chat" onclick={togglePanel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </span>
        </header>
        <div class="rule" aria-hidden="true"></div>
        <div class="bodywrap">
          <svg class="watermark" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d={OCEAN_D}/></svg>
          <div class="body" bind:this={bodyEl} role="log" aria-live="polite">
            {#each messages as m}
              <div class="msg {m.role}" class:done={m.done}>
                {#if m.role === 'assistant'}
                  <span class="avatar" aria-hidden="true"><svg viewBox="0 0 512 512"><path fill="currentColor" d={OCEAN_D}/></svg></span>
                {/if}
                <div class="bubblewrap">
                  <div class="bubble" class:lit={m.lit}>
                    {#if m.role === 'assistant'}
                      {#if m.pending && !m.content}
                        <span class="stage">{
                          phase === 'craft' ? 'Composing…'
                          : phase === 'deepening' ? 'Looking deeper into the library…'
                          : phase === 'deepening-more' ? 'Still searching — combing the historical records…'
                          : 'Searching the ocean of texts…'}</span>
                      {:else}
                        {@html renderRich(m.content)}{#if m.pending}<span class="caret" aria-hidden="true"></span>{/if}
                      {/if}
                    {:else}{m.content}{/if}
                  </div>
                  {#if m.citations?.length}
                    <div class="cites">
                      {#each m.citations.slice(0, 4) as c, ci}
                        {#if citationHref(c)}
                          <a href={citationHref(c)} target="_blank" rel="noopener" style="animation-delay:{ci * 80}ms">{c.title || 'source'}</a>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
            {#if errorMsg}<div class="error" role="alert">{errorMsg}</div>{/if}
            {#if onetap !== 'hidden'}
              <div class="onetap" role="region" aria-label="Email research summaries">
                {#if onetap === 'offer'}
                  <p>Enjoying the research? Receive a <strong>detailed summary</strong> of your conversations by email.</p>
                  <div class="obtns">
                    <button class="oconnect" onclick={onetapConnect}>Connect with Google</button>
                    <button class="olater" onclick={onetapSnooze}>Not now</button>
                  </div>
                {:else if onetap === 'iframe'}
                  <iframe title="Connect with Google" class="oframe" allow="identity-credentials-get"
                    src="{api}/widget/onetap?key={encodeURIComponent(token)}&session={encodeURIComponent(sid)}"></iframe>
                  <button class="olater" onclick={onetapSnooze}>Cancel</button>
                {:else if onetap === 'done'}
                  <p class="odone">✓ Connected as <strong>{connectedEmail}</strong> — you'll receive research summaries.</p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
        <footer>
          <textarea
            rows="1"
            placeholder={cfg.placeholder}
            bind:value={input}
            bind:this={inputEl}
            onkeydown={onKey}
            oninput={schedulePrep}
            disabled={busy}
            aria-label="Your question"
          ></textarea>
          <button class="send" onclick={send} disabled={busy || !input.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 11.2 20.2 3.4c.8-.4 1.6.5 1.2 1.3l-7.8 16.8c-.4.8-1.6.7-1.9-.2l-2-6.6a1 1 0 0 0-.7-.7l-6.6-2c-.9-.3-.9-1.5 0-1.9z" transform="rotate(3 12 12)"/></svg>
          </button>
        </footer>
        <div class="brand"><a href="https://oceanlibrary.com" target="_blank" rel="noopener">Ocean</a></div>
      </section>
    {:else}
      <button class="bubble-btn" aria-label="Open {cfg.name} chat" aria-expanded="false" onclick={togglePanel}>
        <svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d={OCEAN_D}/></svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .root {
    position: fixed; bottom: 20px; z-index: 2147483000;
    display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
    --gold: #c8a24b;
    --gold-soft: #e7d5a4;
    --accent-deep: color-mix(in srgb, var(--accent) 72%, #14273a);
    --halo: color-mix(in srgb, var(--accent) 28%, transparent);
  }
  .root.right { right: 20px; }
  .root.left { left: 20px; align-items: flex-start; }

  /* One Tap invite card — quiet, gold-edged, in the reading column */
  .onetap {
    margin: 14px 6px 4px; padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--gold) 7%, transparent);
    animation: fadeup .45s ease both;
  }
  .onetap p { margin: 0 0 10px; font-family: var(--serif); font-size: 14.5px; line-height: 1.45; }
  .onetap .odone { margin: 0; color: var(--gold); }
  .obtns { display: flex; gap: 10px; align-items: center; }
  .oconnect {
    border: 0; border-radius: 999px; padding: 8px 16px; cursor: pointer;
    background: var(--accent-deep); color: #fff; font-size: 13.5px; font-weight: 600;
  }
  .oconnect:hover { filter: brightness(1.12); }
  .olater { border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; font-size: 13px; }
  .olater:hover { opacity: .9; }
  .oframe { width: 100%; height: 120px; border: 0; display: block; background: transparent; }
  @keyframes fadeup { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  /* ── Launch bubble: Ocean mark, gentle breathing. Hidden while the panel is open. ── */
  .bubble-btn {
    width: 58px; height: 58px; border-radius: 50%; border: none; cursor: pointer;
    background: linear-gradient(140deg, var(--accent), var(--accent-deep));
    color: #fff; padding: 13px;
    animation: floaty 5.5s ease-in-out infinite, arrive .3s cubic-bezier(.22,1,.36,1);
  }
  .bubble-btn svg { width: 100%; height: 100%; display: block; opacity: .95; }
  .bubble-btn:hover { animation-play-state: paused; filter: brightness(1.1); }
  @keyframes floaty {
    0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 5px 18px var(--halo), 0 3px 9px rgba(0,0,0,.25); }
    50% { transform: translateY(-3px) scale(1.03); box-shadow: 0 13px 30px var(--halo), 0 5px 13px rgba(0,0,0,.28); }
  }

  /* ── Panel ── */
  .panel {
    width: min(720px, calc(100vw - 40px)); height: min(760px, calc(100vh - 96px));
    background: linear-gradient(178deg, #fdfcf8, #f7f3ec);
    color: #24211c; border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 18px 60px rgba(15, 25, 40, .30), 0 4px 16px rgba(15, 25, 40, .18);
    animation: rise .42s cubic-bezier(.22,1,.36,1);
  }
  @keyframes rise { from { opacity: 0; transform: translateY(16px) scale(.975); } }
  @keyframes arrive { from { opacity: 0; transform: translateY(10px); } }

  header {
    display: flex; align-items: center; gap: 11px; padding: 13px 16px;
    background: linear-gradient(120deg, var(--accent-deep), var(--accent));
    color: #fff;
  }
  .roundel {
    width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%;
    background: rgba(255,255,255,.16); padding: 7px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.22);
  }
  .roundel svg { width: 100%; height: 100%; display: block; }
  .titles { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
  .title { font-family: var(--serif); font-weight: 600; font-size: 17.5px; letter-spacing: .01em; }
  .subtitle { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .72; }
  .hbtns { display: flex; align-items: center; gap: 2px; }
  .icon {
    background: none; border: none; color: #fff; cursor: pointer; opacity: .85;
    width: 34px; height: 34px; padding: 7px; border-radius: 8px; transition: opacity .15s, background .15s;
  }
  .icon svg { width: 100%; height: 100%; display: block; }
  .icon:hover { opacity: 1; background: rgba(255,255,255,.14); }

  /* Gilded rule — draws itself across on open. The illumination motif. */
  .rule {
    height: 2px; flex-shrink: 0;
    background: linear-gradient(90deg, transparent, var(--gold) 16%, var(--gold-soft) 50%, var(--gold) 84%, transparent);
    transform-origin: left; animation: drawrule .9s .12s cubic-bezier(.22,1,.36,1) both;
  }
  @keyframes drawrule { from { transform: scaleX(0); opacity: 0; } }

  .bodywrap { position: relative; flex: 1; min-height: 0; display: flex; }
  .watermark {
    position: absolute; right: -34px; bottom: -30px; width: 240px; height: 240px;
    color: #23324a; opacity: .05; pointer-events: none;
  }
  .body {
    flex: 1; overflow-y: auto; padding: 18px 18px 10px;
    display: flex; flex-direction: column; gap: 14px;
    scrollbar-width: thin; scrollbar-color: rgba(120,110,90,.35) transparent;
  }
  .body::-webkit-scrollbar { width: 8px; }
  .body::-webkit-scrollbar-thumb { background: rgba(120,110,90,.3); border-radius: 4px; }

  .msg { display: flex; gap: 10px; animation: arrive .32s cubic-bezier(.22,1,.36,1); }
  .msg.user { justify-content: flex-end; }
  .avatar {
    width: 26px; height: 26px; flex-shrink: 0; margin-top: 3px; border-radius: 50%;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent);
    padding: 5px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .avatar svg { width: 100%; height: 100%; display: block; }
  .bubblewrap { max-width: 84%; min-width: 0; }
  .msg.user .bubblewrap { max-width: 78%; }

  .bubble {
    padding: 12px 16px; border-radius: 14px;
    white-space: pre-wrap; word-break: break-word;
  }
  .msg.assistant .bubble {
    font-family: var(--serif); font-size: 16.5px; line-height: 1.62; color: #2a2620;
    background: #fffdf8; border: 1px solid #e9e2d2; border-top-left-radius: 5px;
    box-shadow: 0 1px 3px rgba(90, 75, 45, .06);
  }
  .msg.user .bubble {
    font-size: 15.5px; line-height: 1.5; color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    border-bottom-right-radius: 5px;
    box-shadow: 0 2px 8px var(--halo);
  }
  /* Illuminated drop cap on settled, substantial answers. */
  .bubble.lit::first-letter {
    font-size: 3.05em; float: left; line-height: .82;
    padding: .06em .09em 0 0; color: var(--accent-deep);
    font-family: var(--serif); font-weight: 600;
  }
  .bubble :global(a) { color: var(--accent); text-decoration-color: color-mix(in srgb, var(--gold) 60%, transparent); text-underline-offset: 2px; }
  .bubble :global(em) { color: color-mix(in srgb, currentColor 82%, var(--accent)); }
  .bubble :global(strong) { font-weight: 650; color: color-mix(in srgb, currentColor 88%, var(--accent-deep)); }
  /* Blockquoted passages — the gilded rule motif marks the sacred text itself. */
  .bubble :global(blockquote) {
    margin: .5em 0; padding: .35em 0 .35em .85em;
    border-left: 2.5px solid var(--gold);
    background: color-mix(in srgb, var(--gold) 5%, transparent);
    border-radius: 0 6px 6px 0; font-style: italic;
  }
  .bubble :global(.li) { display: block; padding-left: .95em; text-indent: -0.95em; }

  /* Streaming caret — a breathing quill of accent-to-gold light. */
  .caret {
    display: inline-block; width: 3px; height: 1.02em; margin-left: 2px; vertical-align: -0.14em;
    border-radius: 2px; background: linear-gradient(var(--accent), var(--gold));
    animation: breathe 1.05s ease-in-out infinite;
  }
  @keyframes breathe { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }

  /* Honest progress, poetically: pipeline stages with a light shimmer sweeping through. */
  .stage {
    display: inline-block; font-family: var(--serif); font-style: italic; font-size: 15px;
    color: transparent;
    background: linear-gradient(90deg, #9a8f7a 0%, var(--accent) 45%, var(--gold) 55%, #9a8f7a 100%);
    background-size: 220% 100%; -webkit-background-clip: text; background-clip: text;
    animation: shimmer 1.7s linear infinite;
  }
  @keyframes shimmer { from { background-position: 170% 0; } to { background-position: -70% 0; } }

  .cites { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 7px; }
  .cites a {
    font-size: 12px; letter-spacing: .02em; text-decoration: none;
    color: var(--accent-deep); background: color-mix(in srgb, var(--gold) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 55%, transparent);
    border-radius: 11px; padding: 3px 11px;
    animation: arrive .45s cubic-bezier(.22,1,.36,1) both;
    transition: background .15s, transform .15s;
  }
  .cites a:hover { background: color-mix(in srgb, var(--gold) 20%, transparent); transform: translateY(-1px); }

  .error { color: #a33; font-size: 13px; padding: 4px 2px; }

  footer { display: flex; gap: 9px; padding: 12px 14px 8px; background: transparent; }
  textarea {
    flex: 1; resize: none; border: 1px solid #ddd5c2; border-radius: 12px;
    padding: 10px 14px; font-size: 16px; line-height: 1.4; outline: none;
    background: #fffefb; color: #24211c; transition: border-color .15s, box-shadow .15s;
  }
  textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--halo); }
  textarea::placeholder { color: #a89e8a; }
  .send {
    border: none; border-radius: 12px; width: 46px; flex-shrink: 0; cursor: pointer;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep)); color: #fff; padding: 12px;
    transition: transform .12s, filter .15s, opacity .15s;
  }
  .send svg { width: 100%; height: 100%; display: block; }
  .send:hover:not(:disabled) { filter: brightness(1.12); }
  .send:active:not(:disabled) { transform: scale(.92); }
  .send:disabled { opacity: .38; cursor: default; }

  .brand { text-align: center; font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase; padding: 2px 0 8px; }
  .brand a { color: #a3987f; text-decoration: none; }
  .brand a:hover { color: var(--gold); }

  /* ── Dark: deep ink, warm text, lifted links, same gold. ── */
  @media (prefers-color-scheme: dark) {
    .panel { background: linear-gradient(178deg, #14181e, #0e1217); color: #e9e6dd; }
    .watermark { color: #b9c8dd; opacity: .045; }
    .msg.assistant .bubble { background: #1b212a; border-color: #2b3442; color: #e9e6dd; box-shadow: none; }
    .bubble.lit::first-letter { color: color-mix(in srgb, var(--accent) 45%, #cfe1ff); }
    .bubble :global(a), .cites a { color: color-mix(in srgb, var(--accent) 30%, #cfe1ff); }
    .cites a { background: color-mix(in srgb, var(--gold) 8%, transparent); border-color: color-mix(in srgb, var(--gold) 40%, transparent); }
    .stage { background-image: linear-gradient(90deg, #6d7789 0%, color-mix(in srgb, var(--accent) 40%, #cfe1ff) 45%, var(--gold-soft) 55%, #6d7789 100%); }
    footer { border-top: 1px solid #232a35; }
    textarea { background: #171c23; color: #e9e6dd; border-color: #313a48; }
    textarea::placeholder { color: #6c7686; }
    .body { scrollbar-color: rgba(140,150,170,.35) transparent; }
    .body::-webkit-scrollbar-thumb { background: rgba(140,150,170,.3); }
    .brand a { color: #6c7686; }
  }

  /* ── Small screens: the panel becomes a full sheet. ── */
  @media (max-width: 640px) {
    .root.right, .root.left { right: 12px; left: auto; bottom: 12px; }
    .panel {
      position: fixed; inset: 0; width: 100vw; height: 100dvh; border-radius: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble-btn, .panel, .msg, .rule, .cites a { animation: none; }
    .stage { animation: none; color: #9a8f7a; background: none; }
    .caret { animation: none; opacity: .75; }
  }
</style>
