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
          <span class="title">{cfg.name}</span>
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
