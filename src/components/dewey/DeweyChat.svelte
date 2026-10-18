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

  // the conversation as the model sees it: your words and Dewey's words (cards are summarized server-side)
  const history = () => turns.flatMap((t) => [{ role: 'user', content: t.you.text || (t.you.photos.length ? '(photos)' : t.you.file ? `(file ${t.you.file.name})` : '') },
    ...(t.parts.some((p) => p.kind === 'text') ? [{ role: 'assistant', content: t.parts.filter((p) => p.kind === 'text').map((p) => p.text).join('') }] : [])]);

  async function send() {
    if (!hasInput || busy) return;
    const you = { text: q.trim(), photos, file: file ? { name: file.name } : null };
    const attach = { ...(photos.length ? { images: photos } : {}), ...(file ? { file } : {}) };
    const messages = [...history(), { role: 'user', content: you.text || (photos.length ? 'Do we have this?' : `Do we have this? (${file?.name})`) }];
    const turn = { id: Date.now(), you, parts: [], busy: true, error: null };
    turns = [...turns, turn];
    q = ''; photos = []; file = null; busy = true;
    scrollDown();
    try {
      const res = await fetch(`${API}/api/dewey/chat`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
        body: JSON.stringify({ messages, attach }) });
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
          else if (e.type === 'holdings') t.parts.push({ kind: 'holdings', r: e });
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
    scrollDown();
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
    {#if !turns.length}
      <div class="hello">
        <p class="text-primary font-semibold">What have you found?</p>
        <p class="text-secondary text-sm mt-1">Snap the cover or title page with 📷, attach a file, paste a link — or just name it.
          I'll check the library at once, and if we don't have it, I'll put it on the wanted list and research it.</p>
      </div>
    {/if}
    {#each turns as t (t.id)}
      <div class="you">
        {#if t.you.text}<p class="whitespace-pre-wrap">{t.you.text}</p>{/if}
        {#if t.you.photos.length}<div class="flex flex-wrap gap-1 mt-1">{#each t.you.photos as p, i (i)}<img src={p} alt="Photo {i + 1}" class="w-14 h-18 object-cover rounded" />{/each}</div>{/if}
        {#if t.you.file}<p class="text-sm mt-1">📄 {t.you.file.name}</p>{/if}
      </div>
      <div class="dewey">
        {#if !t.parts.length && t.busy}<p class="text-secondary">Looking…</p>{/if}
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
                <button class="mt-2 px-3 py-1 rounded-md bg-accent text-white text-sm hover:bg-accent-hover" onclick={() => want(p.r)}>Add to wanted</button>
              {/if}
            </div>
          {:else if p.kind === 'item'}
            {@const it = p.item}
            <div class="card">
              <p class="text-sm"><span class="font-semibold text-primary">{it.title}</span>{#if it.author}<span class="text-secondary"> · {it.author}</span>{/if}</p>
              <p class="text-xs text-accent">{STATE[it.state] || it.state}</p>
              {#if it.state === 'ingested' && it.doc_id}<a class="text-sm text-accent" href="/document/{it.doc_id}">Open it in the library →</a>{/if}
              {#if ['wanted', 'researched', 'needs-ocr', 'failed'].includes(it.state)}
                <div class="flex flex-wrap gap-1.5 mt-2 items-center">
                  <input class="flex-1 min-w-40 px-2 py-1 text-sm rounded border border-border bg-surface-0 text-primary" placeholder="Link to a PDF or page" bind:value={sourceUrl[it.id]} />
                  <button class="px-2 py-1 text-sm rounded-md border border-border hover:bg-surface-2" disabled={!sourceUrl[it.id]} onclick={() => attach(it, { url: sourceUrl[it.id] })}>Attach</button>
                  <label class="px-2 py-1 text-sm rounded-md border border-border hover:bg-surface-2 cursor-pointer">PDF…<input type="file" accept=".pdf,.docx,.txt,.md,.html" class="sr-only" onchange={(e) => attachFile(it, e)} /></label>
                </div>
              {/if}
              {#if it._err}<p class="text-xs text-error mt-1">{it._err}</p>{/if}
            </div>
          {/if}
        {/each}
        {#if t.error}<p class="text-error text-sm">{t.error}</p>{/if}
      </div>
    {/each}
  </div>

  <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
    {#if photos.length || file}
      <div class="flex flex-wrap gap-2 items-center mb-2">
        {#each photos as p, i (i)}<img src={p} alt="Photo {i + 1}" class="w-12 h-16 object-cover rounded border border-border-subtle" />{/each}
        {#if file}<span class="px-2 py-1 rounded bg-surface-2 text-xs text-primary">📄 {file.name}</span>{/if}
      </div>
    {/if}
    <div class="flex gap-2 items-end">
      <label class="tool" title="Take a photo — it is checked at once">📷<input type="file" accept="image/*" capture="environment" multiple class="sr-only" onchange={addPhotos} /></label>
      <label class="tool" title="Attach a file (PDF, DOCX, text) — checked at once">📎<input type="file" accept=".pdf,.docx,.txt,.md,image/*" class="sr-only" onchange={addFile} /></label>
      <textarea class="flex-1 px-3 py-2 rounded-md border border-border bg-surface-0 text-primary resize-none" rows="2" bind:value={q}
        placeholder="Name it, paste a link, or ask…" aria-label="Message to Dewey"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50" disabled={busy || !hasInput}>{busy ? '…' : 'Send'}</button>
    </div>
  </form>
</div>

<style>
  .chat { display: flex; flex-direction: column; height: 100%; min-height: 0; border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); }
  .log { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .hello { margin: auto; max-width: 28rem; text-align: center; }
  .you { align-self: flex-end; max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 0.75rem 0.75rem 0.25rem 0.75rem; background: var(--surface-2); color: var(--text-primary); }
  .dewey { align-self: flex-start; max-width: 92%; display: flex; flex-direction: column; gap: 0.5rem; }
  .card { padding: 0.6rem 0.8rem; border-radius: 0.75rem; border: 1px solid var(--border-subtle); background: var(--surface-0); }
  .composer { border-top: 1px solid var(--border-subtle); padding: 0.6rem; }
  .tool { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 0.5rem; border: 1px solid var(--border); cursor: pointer; font-size: 1.15rem; }
  .tool:hover { background: var(--surface-2); }
</style>
