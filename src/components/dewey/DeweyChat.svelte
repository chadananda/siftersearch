<script>
  // Dewey's chat — the middle column (full screen on a phone). Streamed from the Dewey agent (POST /api/dewey/chat, SSE):
  // what you send is checked FIRST (a photo, a file or a link → "do we have it?", no need to ask — Chad 10-17), then Dewey
  // replies, checking titles, adding works to the wanted list and attaching sources with his tools. Cards: the holdings
  // result, and each wanted item with its research and a place to attach a PDF or a link (that starts processing).
  import { tick } from 'svelte';
  import { getAccessToken, dewey } from '../../lib/api.js';
  import { svcFixed } from '../../lib/imagekit.js';

  const API = import.meta.env.PUBLIC_API_URL || '';
  let turns = $state([]);   // [{ id, you: { text, photos, file }, parts: [{ kind: 'text'|'holdings'|'item', … }], busy, error }]
  let q = $state('');
  let photos = $state([]);
  let file = $state(null);
  let busy = $state(false);
  let log;
  let hasInput = $derived(!!q.trim() || photos.length > 0 || !!file);

  // speaking (Chad 10-17): the browser's speech recognition fills the input as you talk — edit, then send
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  let listening = $state(false);
  let rec = null;
  function toggleMic() {
    if (listening) { rec?.stop(); return; }
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const before = q ? q.replace(/\s*$/, ' ') : '';
    rec.onresult = (e) => { q = before + [...e.results].map((r) => r[0].transcript).join(' '); };
    rec.onend = () => { listening = false; };
    rec.onerror = () => { listening = false; };
    listening = true;
    rec.start();
  }

  function resize(f, max = 1600) {
    return new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = fail;
      img.src = URL.createObjectURL(f);
    });
  }
  // a photo is checked the moment it is taken (Chad: "If I post a picture, it will immediately start looking")
  async function addPhotos(e) {
    for (const f of [...e.currentTarget.files].slice(0, 6 - photos.length)) photos = [...photos, await resize(f)];
    e.currentTarget.value = '';
    if (!busy) send();
  }
  function addFile(e) {
    const f = e.currentTarget.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { file = { name: f.name, data: String(r.result).split(',')[1] }; if (!busy) send(); };
    r.readAsDataURL(f);
    e.currentTarget.value = '';
  }
  const scrollDown = async () => { await tick(); log?.scrollTo({ top: log.scrollHeight, behavior: 'smooth' }); };

  // ONE THREAD per member, on the server (Chad 10-17: "interaction between desktop and mobile is shared … one thread"):
  // load it when signed in, and every 5 s pick up what another device added
  let { authed = false } = $props();
  let lastId = 0;
  function fromThread(messages) {
    const out = [];
    for (const m of messages) {
      if (m.role === 'user') out.push({ id: m.id, you: { text: m.content || '', photos: m.parts?.thumbs || [], file: m.parts?.file ? { name: m.parts.file } : null }, parts: [], busy: false, error: null });
      else if (out.length) out.at(-1).parts = m.parts?.parts || (m.content ? [{ kind: 'text', text: m.content }] : []);
      lastId = Math.max(lastId, m.id);
    }
    return out;
  }
  async function loadThread() { try { const { messages } = await dewey.thread(0); turns = fromThread(messages); scrollDown(); } catch { /* next poll */ } }
  $effect(() => {
    if (!authed) return;
    loadThread();
    const t = setInterval(async () => {
      if (busy || document.hidden) return;
      try { const { messages } = await dewey.thread(lastId); if (messages.length) await loadThread(); } catch { /* next poll */ }
    }, 5000);
    return () => clearInterval(t);
  });
  // small copies of the photos for the thread (the full ones go to the check only)
  const thumbOf = (dataUrl) => new Promise((ok) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 240 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.7)); };
    img.onerror = () => ok(null); img.src = dataUrl; });

  async function send() {
    if (!hasInput || busy) return;
    const you = { text: q.trim(), photos, file: file ? { name: file.name } : null };
    const attach = { ...(photos.length ? { images: photos } : {}), ...(file ? { file } : {}) };
    const thumbs = (await Promise.all(photos.map(thumbOf))).filter(Boolean);
    const turn = { id: Date.now(), you, parts: [], busy: true, error: null };
    turns = [...turns, turn];
    q = ''; photos = []; file = null; busy = true;
    scrollDown();
    try {
      const res = await fetch(`${API}/api/dewey/chat`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
        body: JSON.stringify({ message: you.text, attach, thumbs }) });
      if (!res.ok || !res.body) throw new Error(`Dewey could not answer (${res.status})`);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
          let e; try { e = JSON.parse(line); } catch { continue; }
          const t = turns.find((x) => x.id === turn.id);
          if (e.type === 'delta') { const last = t.parts.at(-1); if (last?.kind === 'text') last.text += e.text; else t.parts.push({ kind: 'text', text: e.text }); }
          else if (e.type === 'status') t.status = e.text;   // a live line while Dewey works — never silence
          else if (e.type === 'holdings') t.parts.push({ kind: 'holdings', r: e });
          else if (e.type === 'research') t.parts.push({ kind: 'research', r: e });
          else if (e.type === 'appraisal') t.parts.push({ kind: 'appraisal', a: e });
          else if (e.type === 'item') t.parts.push({ kind: 'item', item: e.item });
          else if (e.type === 'error') t.error = e.message;
          turns = [...turns];
          scrollDown();
        }
      }
    } catch (e) {
      turns.find((x) => x.id === turn.id).error = e.message;
    }
    turns.find((x) => x.id === turn.id).busy = false;
    turns = [...turns]; busy = false;
    await loadThread();   // the saved thread is the truth (and carries the ids the other device will see)
  }

  // card actions — straight to the API, no round through the model
  async function want(r) {
    const { item } = await dewey.want(r.identified);
    const t = turns.at(-1); t.parts.push({ kind: 'item', item }); turns = [...turns]; scrollDown();
  }
  let sourceUrl = $state({});
  async function attach(item, body) {
    try { const { item: next } = await dewey.attachSource(item.id, body); Object.assign(item, next); turns = [...turns]; } catch (e) { item._err = e.message; turns = [...turns]; }
  }
  function attachFile(item, e) {
    const f = e.currentTarget.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => attach(item, { file: { name: f.name, data: String(r.result).split(',')[1] } });
    r.readAsDataURL(f);
  }

  const VERDICT = {
    held: { label: 'We have it', tone: 'text-success' },
    possible: { label: 'Possibly — check these', tone: 'text-warning' },
    'not-found-by-title': { label: 'Not found by title', tone: 'text-warning' },
    'not-held': { label: 'Not in the library', tone: 'text-error' },
  };
  const STATE = { wanted: 'Wanted — researching', researched: 'Wanted — researched', source: 'Source attached', processing: 'Processing',
    ingested: 'In the library', 'needs-ocr': 'Scan — waits for OCR', 'needs-human': 'Needs a person', failed: 'Failed' };
  const fieldLine = (id) => [id.author, id.translator && `tr. ${id.translator}`, id.edition, id.publisher, id.year, id.language].filter(Boolean).join(' · ');
</script>

<div class="chat">
  <div class="log" bind:this={log} aria-live="polite">
    <!-- Dewey's introduction: the first bubble of every conversation (Chad 10-17) -->
    <div class="row"><img class="avatar" src="/dewey/avatar-96.jpg" alt="Dewey" width="40" height="40" /><div class="dewey"><div class="card intro"><p class="text-primary">Hi, I'm Dewey, your AI librarian. I'm here to help you add new documents!</p></div></div></div>
    {#each turns as t (t.id)}
      <div class="you">
        {#if t.you.text}<p class="whitespace-pre-wrap">{t.you.text}</p>{/if}
        <!-- every photo taken goes into the conversation as a thumbnail (Chad 10-17) -->
        {#if t.you.photos.length}<div class="flex flex-wrap gap-1.5 justify-end">{#each t.you.photos as p, i (i)}<img src={p} alt="Photo {i + 1}" class="thumb" />{/each}</div>{/if}
        {#if t.you.file}<p class="text-sm mt-1">📄 {t.you.file.name}</p>{/if}
      </div>
      <div class="row"><img class="avatar" src="/dewey/avatar-96.jpg" alt="Dewey" width="40" height="40" /><div class="dewey">
        {#if !t.parts.length && t.busy && !t.status}<p class="text-secondary">Looking…</p>{/if}
        {#each t.parts as p, k (k)}
          {#if p.kind === 'text'}
            <p class="text-primary whitespace-pre-wrap">{p.text}</p>
          {:else if p.kind === 'holdings'}
            {@const v = VERDICT[p.r.verdict] || { label: p.r.verdict, tone: 'text-primary' }}
            {@const id = p.r.identified || {}}
            <div class="card">
              <p class="font-semibold {v.tone}">{v.label}</p>
              {#if id.title || id.author}<p class="text-sm text-primary">Read as <strong>{id.title || 'untitled'}</strong>{#if id.subtitle} — {id.subtitle}{/if}</p>{/if}
              {#if fieldLine(id)}<p class="text-xs text-secondary">{fieldLine(id)}</p>{/if}
              {#if id.kind === 'scan'}<p class="text-xs text-warning">A scan with no text layer — its text needs OCR.</p>{/if}
              {#each (p.r.candidates || []).slice(0, 4) as d (d.id)}
                {@const thumb = svcFixed(d.cover_url, 28, 42)}
                <div class="flex gap-2 items-start mt-1.5">
                  {#if thumb}<img src={thumb.src} srcset={thumb.srcset} width="28" height="42" alt="" class="w-7 h-10 rounded-sm object-cover shrink-0" loading="lazy" />{/if}
                  <div class="min-w-0"><a href="/document/{d.id}" class="text-sm text-primary font-medium hover:text-accent">{d.title}</a>
                    <div class="text-xs text-muted">{[d.author, d.language, d.year].filter(Boolean).join(' · ')} — {d.evidence.map((e) => e.kind).join(', ')}</div></div>
                </div>
              {/each}
              {#if p.r.verdict !== 'held' && id.title}
                <button class="act primary mt-2" onclick={() => want(p.r)}>Add to wanted</button>
              {/if}
            </div>
          {:else if p.kind === 'research'}
            <details class="card">
              <summary class="text-sm text-secondary cursor-pointer">Web research · {p.r.source}</summary>
              <p class="text-sm text-primary whitespace-pre-wrap mt-1">{p.r.text}</p>
              {#if p.r.citations?.length}<p class="text-xs text-muted mt-1">{#each p.r.citations as c, i (c.url)}<a class="text-accent" href={c.url} target="_blank" rel="noopener">[{i + 1}] {c.title}</a> {/each}</p>{/if}
            </details>
          {:else if p.kind === 'appraisal'}
            {@const a = p.a}
            <div class="card">
              <p class="text-xs uppercase tracking-wide text-muted">Appraisal</p>
              {#if a.summary}<p class="text-sm text-primary">{a.summary}</p>{/if}
              <dl class="appraisal">
                <dt>Belongs here</dt><dd class={a.in_scope === 'yes' ? 'text-success' : a.in_scope === 'no' ? 'text-error' : 'text-warning'}>{a.in_scope || '—'}{#if a.scope_why} — {a.scope_why}{/if}</dd>
                <dt>Would go</dt><dd>{a.shelf ? `${a.shelf.religion} › ${a.shelf.collection}` : '—'}</dd>
                <dt>Value</dt><dd>{a.value || '—'}{#if a.value_why} — {a.value_why}{/if}</dd>
                <dt>Price</dt><dd>{a.price || '—'}{#if a.rarity && a.rarity !== 'unknown'} · {a.rarity}{/if}</dd>
                {#if a.free_online}<dt>Free online</dt><dd><a class="text-accent break-all" href={a.free_online} target="_blank" rel="noopener">{a.free_online}</a></dd>{/if}
                <dt>Advice</dt><dd class="font-medium text-primary">{a.recommendation || '—'}{#if a.next} — {a.next}{/if}</dd>
              </dl>
              {#if a.recommendation && a.recommendation !== 'skip'}<button class="act primary mt-2" onclick={() => want({ identified: { title: a.title } })}>Add to wanted</button>{/if}
            </div>
          {:else if p.kind === 'item'}
            {@const it = p.item}
            <div class="card">
              <p class="text-sm"><span class="font-semibold text-primary">{it.title}</span>{#if it.author}<span class="text-secondary"> · {it.author}</span>{/if}</p>
              <p class="text-xs text-accent">{STATE[it.state] || it.state}</p>
              {#if it.state === 'ingested' && it.doc_id}<a class="text-sm text-accent" href="/document/{it.doc_id}">Open it in the library →</a>{/if}
              {#if ['wanted', 'researched', 'needs-ocr', 'failed'].includes(it.state)}
                <div class="flex flex-wrap gap-1.5 mt-2 items-center">
                  <input class="flex-1 min-w-40 px-3 py-2 text-base rounded-lg border border-border bg-surface-0 text-primary" placeholder="Link to a PDF or page" bind:value={sourceUrl[it.id]} />
                  <button class="act" disabled={!sourceUrl[it.id]} onclick={() => attach(it, { url: sourceUrl[it.id] })}>Attach</button>
                  <label class="act cursor-pointer">PDF…<input type="file" accept=".pdf,.docx,.txt,.md,.html" class="sr-only" onchange={(e) => attachFile(it, e)} /></label>
                </div>
              {/if}
              {#if it._err}<p class="text-xs text-error mt-1">{it._err}</p>{/if}
            </div>
          {/if}
        {/each}
        {#if t.busy && t.status}<p class="status"><span class="dot"></span>{t.status}</p>{/if}
        {#if t.error}<p class="text-error text-sm">{t.error}</p>{/if}
      </div></div>
    {/each}
  </div>

  <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
    {#if photos.length || file}
      <div class="flex flex-wrap gap-2 items-center mb-2">
        {#each photos as p, i (i)}<img src={p} alt="Photo {i + 1}" class="w-12 h-16 object-cover rounded border border-border-subtle" />{/each}
        {#if file}<span class="px-2 py-1 rounded bg-surface-2 text-xs text-primary">📄 {file.name}</span>{/if}
      </div>
    {/if}
    <!-- full-width input with Send inside it (Chad 10-17) -->
    <div class="field">
      <textarea class="w-full {SR ? 'pl-14' : 'pl-3'} pr-14 py-3 rounded-2xl border border-border bg-surface-0 text-primary resize-none text-base" rows="2" bind:value={q}
        placeholder="Name it, paste a link, or ask…" aria-label="Message to Dewey"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      {#if SR}<button type="button" class="mic" class:on={listening} onclick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak'} title={listening ? 'Stop listening' : 'Speak'}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>{/if}
      <button class="send" disabled={busy || !hasInput} aria-label="Send">{#if busy}…{:else}<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}</button>
    </div>
  </form>

  <!-- photo + attach as large round floating buttons at the right edge, above the input — thumb-sized, out of the way -->
  <div class="fabs">
    <label class="fab" title="Take a photo — it is checked at once" aria-label="Take a photo">📷<input type="file" accept="image/*" capture="environment" multiple class="sr-only" onchange={addPhotos} /></label>
    <label class="fab" title="Attach a file (PDF, DOCX, text) — checked at once" aria-label="Attach a file">📎<input type="file" accept=".pdf,.docx,.txt,.md,image/*" class="sr-only" onchange={addFile} /></label>
  </div>
</div>

<style>
  .chat { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); }
  .log { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem 5rem 1rem 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .you { align-self: flex-end; max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 0.75rem 0.75rem 0.25rem 0.75rem; background: var(--surface-2); color: var(--text-primary); }
  .row { display: flex; gap: 0.5rem; align-items: flex-start; align-self: flex-start; max-width: 96%; }
  .avatar { width: 2.5rem; height: 2.5rem; border-radius: 999px; object-fit: cover; flex: none; border: 1px solid var(--border); }
  .dewey { min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--accent-primary); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .appraisal { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.75rem; margin-top: 0.4rem; font-size: 0.85rem; }
  .appraisal dt { color: var(--text-muted); }
  .appraisal dd { color: var(--text-secondary); }
  .thumb { width: 6rem; height: 8rem; object-fit: cover; border-radius: 0.6rem; border: 1px solid var(--border-subtle); }
  .card { padding: 0.6rem 0.8rem; border-radius: 0.75rem; border: 1px solid var(--border-subtle); background: var(--surface-0); }
  .composer { border-top: 1px solid var(--border-subtle); padding: 0.6rem; }
  /* thumb-sized (Chad 10-17): Send inside the full-width input; photo + attach as 56 px round buttons floating at the right
     edge above the input; inputs at 16 px so iOS does not zoom the page */
  .field { position: relative; }
  .send { position: absolute; right: 0.5rem; bottom: 0.55rem; width: 2.75rem; height: 2.75rem; border-radius: 999px; display: inline-flex;
    align-items: center; justify-content: center; background: var(--accent-primary); color: white; }
  .send:disabled { opacity: 0.4; }
  /* mic on the LEFT, send on the RIGHT — far apart, so the wrong one is not hit (Chad 10-17) */
  .mic { position: absolute; left: 0.5rem; bottom: 0.55rem; width: 2.75rem; height: 2.75rem; border-radius: 999px; display: inline-flex;
    align-items: center; justify-content: center; color: var(--text-primary); border: 1px solid var(--border); background: var(--surface-1); }
  .mic.on { background: var(--error); color: white; border-color: transparent; animation: pulse 1s ease-in-out infinite; }
  .fabs { position: absolute; right: 0.9rem; bottom: 6.5rem; display: flex; flex-direction: column; gap: 0.75rem; z-index: 2; }
  .fab { width: 3.5rem; height: 3.5rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem;
    cursor: pointer; background: var(--surface-2); border: 1px solid var(--border); box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.5); }
  .fab:active { transform: scale(0.95); }
  .act { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; border-radius: 0.6rem; border: 1px solid var(--border); font-size: 0.95rem; color: var(--text-primary); }
  .act.primary { background: var(--accent-primary); color: white; border-color: transparent; font-weight: 600; }
  .act:disabled { opacity: 0.5; }
</style>
