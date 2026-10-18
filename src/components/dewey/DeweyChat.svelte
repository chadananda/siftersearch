<script>
  // Dewey's chat — the middle column (full screen on a phone). Each check is a turn: what you gave (text, a link, photos,
  // a file) and Dewey's answer (what he read, the verdict, the evidence per book). Today every turn is a holdings check
  // (POST /api/dewey/holdings); intake ("Add it") follows. Photos are resized on the phone before upload.
  import { tick } from 'svelte';
  import { dewey } from '../../lib/api.js';
  import { svcFixed } from '../../lib/imagekit.js';

  let turns = $state([]);           // [{ id, you: { text, photos, file }, dewey: result | null, error }]
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
  async function addPhotos(e) {
    for (const f of [...e.currentTarget.files].slice(0, 6 - photos.length)) photos = [...photos, await resize(f)];
    e.currentTarget.value = '';
  }
  function addFile(e) {
    const f = e.currentTarget.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { file = { name: f.name, data: String(r.result).split(',')[1] }; };
    r.readAsDataURL(f);
    e.currentTarget.value = '';
  }
  const scrollDown = async () => { await tick(); log?.scrollTo({ top: log.scrollHeight, behavior: 'smooth' }); };

  async function send() {
    if (!hasInput || busy) return;
    const you = { text: q.trim(), photos, file: file ? { name: file.name } : null };
    const body = { ...(photos.length ? { images: photos } : {}), ...(file ? { file } : {}), ...(you.text ? { text: you.text } : {}) };
    const turn = { id: Date.now(), you, dewey: null, error: null };
    turns = [...turns, turn];
    q = ''; photos = []; file = null; busy = true;
    scrollDown();
    try { turn.dewey = await dewey.holdings(body); } catch (e) { turn.error = e.message || 'The check failed'; }
    turns = [...turns];
    busy = false;
    scrollDown();
  }

  const VERDICT = {
    held: { label: 'We have it', tone: 'text-success' },
    possible: { label: 'Possibly — check these', tone: 'text-warning' },
    'not-found-by-title': { label: 'Not found by title', tone: 'text-warning' },
    'not-held': { label: 'Not in the library', tone: 'text-error' },
  };
  const fieldLine = (id) => [id.author, id.translator && `tr. ${id.translator}`, id.edition, id.publisher, id.year, id.language].filter(Boolean).join(' · ');
</script>

<div class="chat">
  <div class="log" bind:this={log} aria-live="polite">
    {#if !turns.length}
      <div class="hello">
        <p class="text-primary font-semibold">Do we already have it?</p>
        <p class="text-secondary text-sm mt-1">Type a title, author or a few lines of the text, paste a link to a book, PDF or video, attach a
          file — or take photos of the cover, title page or a page of text. On a phone, 📷 opens the camera.</p>
      </div>
    {/if}
    {#each turns as t (t.id)}
      <div class="you">
        {#if t.you.text}<p class="whitespace-pre-wrap">{t.you.text}</p>{/if}
        {#if t.you.photos.length}<div class="flex flex-wrap gap-1 mt-1">{#each t.you.photos as p, i (i)}<img src={p} alt="Photo {i + 1}" class="w-14 h-18 object-cover rounded" />{/each}</div>{/if}
        {#if t.you.file}<p class="text-sm mt-1">📄 {t.you.file.name}</p>{/if}
      </div>
      <div class="dewey">
        {#if t.error}
          <p class="text-error">{t.error}</p>
        {:else if !t.dewey}
          <p class="text-secondary">Checking…</p>
        {:else}
          {@const r = t.dewey}
          {@const v = VERDICT[r.verdict] || { label: r.verdict, tone: 'text-primary' }}
          {@const id = r.identified || {}}
          <p class="font-semibold {v.tone}">{v.label}</p>
          {#if id.title || id.author}
            <p class="text-primary text-sm mt-1">Read as <strong>{id.title || 'untitled'}</strong>{#if id.subtitle} — {id.subtitle}{/if}</p>
            {#if fieldLine(id)}<p class="text-xs text-secondary">{fieldLine(id)}</p>{/if}
          {/if}
          {#if id.kind === 'scan'}<p class="text-xs text-warning mt-1">A scan with no text layer — only its title could be checked; its text needs OCR.</p>{/if}
          {#if r.verdict === 'not-held'}<p class="text-sm text-secondary mt-1">Neither its title nor its text is in the library — worth adding.</p>{/if}
          {#if r.verdict === 'not-found-by-title'}<p class="text-sm text-secondary mt-1">A photo of a page of its text would settle it — it may be here under another title.</p>{/if}
          {#if r.candidates?.length}
            <ul class="flex flex-col gap-1.5 mt-2" role="list">
              {#each r.candidates as d (d.id)}
                {@const thumb = svcFixed(d.cover_url, 32, 48)}
                <li class="flex gap-2 items-start">
                  {#if thumb}<img src={thumb.src} srcset={thumb.srcset} width="32" height="48" alt="" class="w-8 h-12 rounded-sm object-cover shrink-0" loading="lazy" />{/if}
                  <div class="min-w-0">
                    <a href="/document/{d.id}" class="text-primary text-sm font-medium hover:text-accent">{d.title || 'Untitled'}</a>
                    <div class="text-xs text-secondary">{[d.author, d.language, d.religion, d.year].filter(Boolean).join(' · ')}</div>
                    <div class="text-xs text-muted">{d.evidence.map((e) => `${e.kind}${e.detail ? `: ${e.detail}` : ''}`).join(' · ')}</div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
    {#if photos.length || file}
      <div class="flex flex-wrap gap-2 items-center mb-2">
        {#each photos as p, i (i)}
          <div class="relative">
            <img src={p} alt="Photo {i + 1}" class="w-12 h-16 object-cover rounded border border-border-subtle" />
            <button type="button" class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-3 text-primary text-xs" aria-label="Remove photo"
              onclick={() => (photos = photos.filter((_, k) => k !== i))}>✕</button>
          </div>
        {/each}
        {#if file}<span class="px-2 py-1 rounded bg-surface-2 text-xs text-primary">📄 {file.name} <button type="button" class="ml-1 text-secondary" onclick={() => (file = null)} aria-label="Remove file">✕</button></span>{/if}
      </div>
    {/if}
    <div class="flex gap-2 items-end">
      <label class="tool" title="Take or choose photos">📷<input type="file" accept="image/*" capture="environment" multiple class="sr-only" onchange={addPhotos} /></label>
      <label class="tool" title="Attach a file (PDF, DOCX, text)">📎<input type="file" accept=".pdf,.docx,.txt,.md,image/*" class="sr-only" onchange={addFile} /></label>
      <textarea class="flex-1 px-3 py-2 rounded-md border border-border bg-surface-0 text-primary resize-none" rows="2" bind:value={q}
        placeholder="Title, author, a few lines, or a link…" aria-label="Message to Dewey"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50" disabled={busy || !hasInput}>{busy ? '…' : 'Ask'}</button>
    </div>
  </form>
</div>

<style>
  .chat { display: flex; flex-direction: column; height: 100%; min-height: 0; border: 1px solid var(--border-subtle); border-radius: 0.75rem; background: var(--surface-1); }
  .log { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .hello { margin: auto; max-width: 28rem; text-align: center; }
  .you { align-self: flex-end; max-width: 85%; padding: 0.5rem 0.75rem; border-radius: 0.75rem 0.75rem 0.25rem 0.75rem; background: var(--surface-2); color: var(--text-primary); }
  .dewey { align-self: flex-start; max-width: 92%; padding: 0.6rem 0.8rem; border-radius: 0.75rem 0.75rem 0.75rem 0.25rem; border: 1px solid var(--border-subtle); background: var(--surface-0); }
  .composer { border-top: 1px solid var(--border-subtle); padding: 0.6rem; }
  .tool { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 0.5rem; border: 1px solid var(--border); cursor: pointer; font-size: 1.15rem; }
  .tool:hover { background: var(--surface-2); }
</style>
