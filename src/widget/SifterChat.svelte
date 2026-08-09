<svelte:options customElement={{ tag: 'sifter-chat', shadow: 'open' }} />

<script>
  // SifterChat — embeddable assistant (planning/sifterchat-widget-plan.md Phase 0/1).
  // Props come from the loader: token (profile), api (origin). Config fetched per token; chat rides the
  // existing Jafar SSE endpoint (anonymous-friendly, rate-limited, site-scopable via chatbot_location).
  // Transcript persists in localStorage per token (server-side sessions arrive in a later phase).
  let { token = '', api = 'https://api.siftersearch.com' } = $props();

  let cfg = $state(null);
  let open = $state(false);
  let denied = $state(false);
  let messages = $state([]);        // {role, content, citations?}
  let input = $state('');
  let busy = $state(false);
  let errorMsg = $state('');
  let panelEl = $state(null);
  let bodyEl = $state(null);

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
        if (!messages.length && c.greeting) messages = [{ role: 'assistant', content: c.greeting }];
        track('widget_load');
      })
      .catch(() => { denied = true; });
  });

  const persist = () => { try { localStorage.setItem(storeKey(), JSON.stringify(messages.slice(-40))); } catch { /* private mode */ } };
  const scroll = () => queueMicrotask(() => { if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight; });

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    input = '';
    errorMsg = '';
    messages = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '', citations: [], pending: true }];
    busy = true;
    track('message_sent', { q: text.slice(0, 400) });
    const _t0 = Date.now();
    scroll();
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
          const last = messages[messages.length - 1];
          if (ev.type === 'chunk' && typeof ev.text === 'string') { last.content += ev.text; messages = [...messages]; scroll(); }
          else if (ev.type === 'citations' && Array.isArray(ev.citations)) { last.citations = ev.citations; messages = [...messages]; }
          else if (ev.type === 'error') { throw new Error(ev.message || 'assistant error'); }
        }
      }
      const last = messages[messages.length - 1];
      delete last.pending;
      if (!last.content) last.content = 'Sorry — I could not find an answer just now. Please try rephrasing.';
      messages = [...messages];
      persist();
      track('answer_served', { latencyMs: Date.now() - _t0, chars: last.content.length });
    } catch (e) {
      messages = messages.slice(0, -1);
      errorMsg = 'Something went wrong reaching the assistant. Please try again.';
    } finally {
      busy = false;
      scroll();
    }
  }

  function citationHref(c) {
    return c.document_id ? `https://siftersearch.com/document/${c.document_id}` : null;
  }
  // Minimal, safe rich text: escape ALL html, then rebuild only [text](https://…) links and *italics*.
  function renderRich(t) {
    const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
      .replace(/\[([^\]]{1,120})\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*([^*\n]{1,160})\*/g, '<em>$1</em>');
  }
  function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
  let openedOnce = false;
  function togglePanel() { open = !open; if (open) { scroll(); if (!openedOnce) { openedOnce = true; track('open'); } } }
  $effect(() => {
    const esc = (e) => { if (e.key === 'Escape' && open) open = false; };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
</script>

{#if cfg && !denied}
  <div class="root {cfg.position === 'bottom-left' ? 'left' : 'right'}" style="--accent:{cfg.accent}">
    {#if open}
      <section class="panel" bind:this={panelEl} aria-label="{cfg.name} chat">
        <header>
          <span class="head-left">
            <!-- Ocean mark (public/ocean-noback.svg, inlined so the widget stays self-contained) -->
            <svg class="ocean-mark" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M229.617 107.844h63.729c32.707 19.893 70.235 49.342 68.85 92.254 2.409 20.614-.603 40.628-7.23 59.5 14.578-3.727 28.01-6.01 39.997-6.01a43.446 43.446 0 0 1 24.756 6.13 27.385 27.385 0 0 1 11.445 23.018v2.405c-.663 14.965-10.361 28.188-23.914 40.629-10.12 9.315-19.095 15.625-28.01 21.695 1.928-.06 4.338-.36 6.145-.36a81.006 81.006 0 0 1 26.383 3.305 26.573 26.573 0 0 1 10.54 6.49 19.81 19.81 0 0 1 5.422 13.704 38.165 38.165 0 0 1-6.505 20.255 43.166 43.166 0 0 1-6.024 7.692 16.882 16.882 0 0 1-11.926 5.41 13.864 13.864 0 0 1-10.963-5.41c-2.71-3.546-3.072-7.332-3.072-9.436v-.54c0-2.044 1.204-3.788 2.108-5.59-1.205-.12-1.023-.3-2.83-.3-10.843 0-27.71 1.503-50.418 4.688-22.95 3.185-37.887 6.07-44.211 8.174l-.725.18a15.393 15.393 0 0 1-7.95 0c-3.252-.902-6.024-2.944-7.831-5.409-3.313-4.447-3.494-9.195-3.494-11.9a20.51 20.51 0 0 1 1.566-7.814 19.11 19.11 0 0 1 5.543-8.233 36.208 36.208 0 0 1 7.287-4.809c5-2.584 11.506-5.047 19.336-7.511a243.488 243.488 0 0 0 56.621-32.455c15.54-11.84 20.481-20.795 21.686-27.106-.904-.18-1.687-.662-6.807-.662-5.542 0-15.119 1.683-28.31 5.77-7.108 2.283-12.71 4.268-17.047 5.95a256.849 256.849 0 0 1-37.346 43.874c-21.504 23.92-47.586 43.272-76.68 57.035h-72.523c-20.54-13.943-41.14-29.569-52.465-52.527-4.88-9.015-9.639-18.031-14.156-27.227V260.38a199.873 199.873 0 0 1 25.119 36.963c8.794-51.146 36.323-95.322 61.32-139.436-37.044 25.062-54.092 66.654-74.572 104.758-5.903-24.04 9.938-46.038 22.588-64.91 32.045-37.022 66.38-75.666 114.568-89.91zm63.127 12.861v.06c-37.587 2.164-78.006 11.84-104.932 40.268-47.131 54.177-67.366 126.62-55.115 197.31 23.673 16.95 51.02 38.766 81.68 26.024 37.105-14.364 66.862-42.611 87.342-76.869a14.013 14.013 0 0 1-2.951-3.365c-1.928-3.186-2.652-6.972-2.05-10.578a22.862 22.862 0 0 1 3.495-11.3 22.695 22.695 0 0 1 9.879-8.413l.601-.24h.061l1.023-.602a114.014 114.014 0 0 0 4.096-2.523l.121-.122.24-.119 4.338-2.765a225.208 225.208 0 0 0 10.541-41.59c3.795-37.383 4.82-90.992-38.369-105.176zm-46.984 72.48h.06c23.065-.835 45.091 9.593 59.03 27.948-4.518 35.58-18.371 68.515-31.924 101.33-13.433.721-26.986 1.323-40.479 2.164a3207.925 3207.925 0 0 1 26.926-36.902c-13.432-4.448-26.805-8.835-40.178-13.643 7.048-12.32 14.457-24.581 21.926-36.842l-4.879-16.648c-15.42 2.704-30.9 4.99-46.38 7.574 12.107 25.483 25.057 50.723 33.189 77.95-10.481 0-20.902 0-31.323.12a94.64 94.64 0 0 0 52.225 43.274c-47.405 3.966-77.342-39.307-84.148-82.219l18.431-.121c-5.722-13.222-14.094-29.989-.3-41.649 16.974-19.906 41.637-31.664 67.824-32.335zm149.261 72.663a146.69 146.69 0 0 0-21.082 1.923 223.95 223.95 0 0 0-24.394 5.83h-.182a6.15 6.15 0 0 1-6.806-2.644 1.443 1.443 0 0 0-.18-.24c-.482-.541-.904-.541-1.506-.541-.207.033-.41.094-.601.18a65.533 65.533 0 0 0-4.82 2.404c-3.013 1.743-7.23 4.326-12.53 7.812-2.169 1.383-4.336 2.705-6.625 3.967l-.963.482v-.12l-.182.18a11.57 11.57 0 0 0-2.289 1.382l.06-.12-.24.241a9.27 9.27 0 0 0-.904.781l-.12.18a9.725 9.725 0 0 0-2.712 6.912l-.119.72a3.419 3.419 0 0 0 .3 2.405c.663 1.022 1.265.9 1.808.9a20.018 20.018 0 0 0 8.673-4.086 145.181 145.181 0 0 1 24.094-9.375l3.434-1.082c3.493-1.081 6.746-2.044 9.758-2.765a141.65 141.65 0 0 1 15.902-3.186c3.894-.509 7.83-.61 11.746-.3 1.412.06 2.82.201 4.217.421a15.08 15.08 0 0 1 6.324 2.405h.121a11.792 11.792 0 0 1 3.193 3.244l.059.06c.262.538.465 1.102.604 1.684.201.664.322 1.35.36 2.043a27.082 27.082 0 0 1-.421 4.627 35.647 35.647 0 0 1-3.312 9.496 64.663 64.663 0 0 1-6.807 9.918 108.934 108.934 0 0 1-17.108 15.746c-18.25 14.003-38.25 25.482-59.453 34.076-3.674 1.142-7.227 2.405-10.841 3.787-2.53.902-5.06 2.103-7.53 3.305a32.053 32.053 0 0 0-4.818 3.127c-.466.397-.89.84-1.266 1.322-.368.47-.654.998-.844 1.563a5.99 5.99 0 0 1-.24.6c-.421 1.021-.601 2.164-.601 3.245-.013.888.068 1.774.24 2.645.145.71.432 1.385.844 1.982.293.462.742.804 1.265.963a3.02 3.02 0 0 0 1.506-.06h.059c2.048-.661 4.519-1.322 7.47-2.043a277.898 277.898 0 0 1 10.059-2.104 882.727 882.727 0 0 1 44.936-6.611c8.673-1.082 17.347-1.803 26.021-2.404 3.614-.24 6.928-.301 9.94-.301a48.48 48.48 0 0 1 7.83.48c1.955.25 3.851.84 5.601 1.744.82.428 1.57.975 2.229 1.623a6.064 6.064 0 0 1 1.867 4.026v.422a9.539 9.539 0 0 1-.963 4.326 25.058 25.058 0 0 1-3.313 4.928c-.06.12-.242.3-.242.601v.602c.023.346.084.689.182 1.021.053.342.176.669.361.961.482.601.844.602 1.205.602.904 0 2.229-.782 3.313-1.864a32.522 32.522 0 0 0 4.217-5.529 34.165 34.165 0 0 0 3.433-7.031 23.033 23.033 0 0 0 1.203-6.611v-.121a9.458 9.458 0 0 0-.119-1.622v-.06c-.18-.721-.422-1.503-.844-2.104l-.24-.3-.06-.121c-.181-.361-.482-.66-.783-.961l-.362-.301a18.5 18.5 0 0 0-4.517-2.705l-.844-.42-1.205-.301a71.342 71.342 0 0 0-10.12-1.803l-.843-.119h-.602c-1.867-.18-3.854-.24-5.902-.3l-3.615-.061-2.711.06c-7.121.19-14.233.631-21.322 1.323l-3.916.359a6.024 6.024 0 0 1-6.446-4.207 5.508 5.508 0 0 1-.361-1.982c.008-.613.109-1.221.3-1.803l.061-.121.06-.24c.197-.495.46-.96.784-1.383l.361-.48c.362-.369.766-.691 1.205-.962l.301-.181 11.145-6.49a215.357 215.357 0 0 0 42.404-34.98 68.227 68.227 0 0 0 6.205-8.234 41.24 41.24 0 0 0 5-11.718v-.06c.254-1.188.415-2.394.48-3.606v-2.045a21.228 21.228 0 0 0-.421-3.965 12.678 12.678 0 0 0-5.3-8.416l-.482-.42-.603-.3c-.756-.451-1.54-.853-2.348-1.202l-.904-.361a24.918 24.918 0 0 0-3.674-1.141 58.193 58.193 0 0 0-10.24-.963z"/></svg>
            <span class="title">{cfg.name}</span>
          </span>
          <button class="icon" aria-label="Close chat" onclick={togglePanel}>×</button>
        </header>
        <div class="body" bind:this={bodyEl}>
          {#each messages as m}
            <div class="msg {m.role}">
              <div class="bubble">{#if m.role === 'assistant'}{@html renderRich(m.content)}{:else}{m.content}{/if}{#if m.pending}<span class="cursor">▍</span>{/if}</div>
              {#if m.citations?.length}
                <div class="cites">
                  {#each m.citations.slice(0, 4) as c}
                    {#if citationHref(c)}
                      <a href={citationHref(c)} target="_blank" rel="noopener">{c.title || 'source'}</a>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
          {#if errorMsg}<div class="error">{errorMsg}</div>{/if}
        </div>
        <footer>
          <textarea
            rows="1"
            placeholder={cfg.placeholder}
            bind:value={input}
            onkeydown={onKey}
            disabled={busy}
            aria-label="Your question"
          ></textarea>
          <button class="send" onclick={send} disabled={busy || !input.trim()} aria-label="Send">➤</button>
        </footer>
        <div class="brand"><a href="https://oceanlibrary.com" target="_blank" rel="noopener">Ocean</a></div>
      </section>
    {/if}
    <button class="bubble-btn" aria-label="Open {cfg.name} chat" aria-expanded={open} onclick={togglePanel}>
      {#if open}×{:else}✦{/if}
    </button>
  </div>
{/if}

<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .root { position: fixed; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .root.right { right: 20px; }
  .root.left { left: 20px; align-items: flex-start; }
  .bubble-btn {
    width: 54px; height: 54px; border-radius: 50%; border: none; cursor: pointer;
    background: var(--accent); color: #fff; font-size: 22px; line-height: 1;
    box-shadow: 0 4px 14px rgba(0,0,0,.25);
  }
  .bubble-btn:hover { filter: brightness(1.08); }
  .panel {
    width: min(720px, calc(100vw - 40px)); height: min(700px, calc(100vh - 110px));
    background: #fff; color: #1c1c1c; border-radius: 14px; overflow: hidden;
    display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,.28);
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--accent); color: #fff; }
  .head-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .ocean-mark { width: 22px; height: 22px; opacity: .55; flex-shrink: 0; }
  .title { font-weight: 600; font-size: 16px; }
  .icon { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 0 4px; }
  .body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: #f6f6f4; }
  .msg { display: flex; flex-direction: column; }
  .msg.user { align-items: flex-end; }
  .msg.assistant { align-items: flex-start; }
  .bubble { max-width: 85%; padding: 11px 14px; border-radius: 12px; font-size: 16px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .msg.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .msg.assistant .bubble { background: #fff; border: 1px solid #e4e4e0; border-bottom-left-radius: 4px; }
  .cursor { animation: blink 1s step-start infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
  .cites { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
  .bubble :global(a) { color: var(--accent); } .cites a { font-size: 12.5px; color: var(--accent); text-decoration: none; border: 1px solid currentColor; border-radius: 10px; padding: 2px 9px; }
  .error { color: #a33; font-size: 13px; padding: 4px 2px; }
  footer { display: flex; gap: 8px; padding: 10px; background: #fff; border-top: 1px solid #ececea; }
  textarea { flex: 1; resize: none; border: 1px solid #d9d9d5; border-radius: 9px; padding: 9px 12px; font-size: 16px; outline: none; }
  textarea:focus { border-color: var(--accent); }
  .send { border: none; background: var(--accent); color: #fff; border-radius: 9px; width: 40px; cursor: pointer; font-size: 15px; }
  .send:disabled { opacity: .45; cursor: default; }
  .brand { text-align: center; font-size: 10.5px; padding: 3px 0 6px; background: #fff; }
  .brand a { color: #8a8a86; text-decoration: none; }
  @media (prefers-color-scheme: dark) {
    .panel { background: #17181a; color: #ececea; }
    .body { background: #1d1f22; }
    .msg.assistant .bubble { background: #26282c; border-color: #33363b; color: #ececea; }
    /* Accent colors are chosen for light backgrounds — lift them toward white so links stay readable on dark bubbles */
    .bubble :global(a), .cites a { color: color-mix(in srgb, var(--accent) 30%, #cfe1ff); }
    footer { background: #17181a; border-top-color: #2a2c30; }
    textarea { background: #202226; color: #ececea; border-color: #3a3d42; }
    .brand { background: #17181a; }
  }
</style>
