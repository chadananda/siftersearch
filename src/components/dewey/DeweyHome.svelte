<script>
  // Dewey, the librarian page — for admins and members granted access on /admin/users (users.dewey_access).
  // "Do we already have it?" from ANYTHING (Chad 10-17): a title or author, a few printed lines, a URL (book page, PDF,
  // video), a file, or phone photos — the camera opens straight from the page (capture="environment"), several photos per
  // item (cover, title page, a page of text). POST /api/dewey/holdings → what was read, the verdict, the evidence.
  // Intake (archive → extract → clean → describe → place → ingest → index) follows: planning/dewey-intake-plan-20261017.md.
  import { onMount } from 'svelte';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { dewey } from '../../lib/api.js';
  import { svcFixed } from '../../lib/imagekit.js';

  const auth = getAuthState();
  let ready = $state(false);
  let q = $state('');
  let photos = $state([]);          // data URLs, resized on the phone before upload
  let file = $state(null);          // { name, data (base64) }
  let busy = $state(false);
  let error = $state(null);
  let result = $state(null);

  let canDewey = $derived(['admin', 'superadmin'].includes(auth.user?.tier) || Number(auth.user?.dewey_access) === 1);
  let hasInput = $derived(!!q.trim() || photos.length > 0 || !!file);

  onMount(async () => { await initAuth(); ready = true; });

  // a phone photo is 3–12 MB; the model reads a title page fine at 1600 px — resize before upload
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

  function clearAll() { q = ''; photos = []; file = null; result = null; error = null; }

  async function check() {
    if (!hasInput) return;
    busy = true; error = null; result = null;
    try {
      const text = q.trim();
      result = await dewey.holdings({ ...(photos.length ? { images: photos } : {}), ...(file ? { file } : {}), ...(text ? { text } : {}) });
    } catch (e) {
      error = e.message || 'The check failed';
    } finally {
      busy = false;
    }
  }

  const VERDICT = {
    held: { label: 'We have it', tone: 'text-success' },
    possible: { label: 'Possibly — check these', tone: 'text-warning' },
    'not-found-by-title': { label: 'Not found by title', tone: 'text-warning' },
    'not-held': { label: 'Not in the library', tone: 'text-error' },
  };
  const fieldLine = (id) => [id.author, id.translator && `tr. ${id.translator}`, id.edition, id.publisher, id.year, id.language].filter(Boolean).join(' · ');
</script>

{#if !ready}
  <p class="text-secondary">Loading…</p>
{:else if !canDewey}
  <section class="max-w-xl mx-auto text-center py-12">
    <h1 class="text-2xl font-semibold text-primary mb-2">Dewey</h1>
    <p class="text-secondary">Dewey, the AI Librarian for Ocean 2.0, works with invited contributors.
      {#if !auth.isAuthenticated}Sign in if you have been invited.{:else}Ask Chad for access.{/if}</p>
  </section>
{:else}
  <section class="max-w-3xl mx-auto">
    <header class="mb-5">
      <h1 class="text-2xl font-semibold text-primary">Dewey <span class="text-base font-normal text-secondary">· AI Librarian for Ocean 2.0</span></h1>
      <p class="text-secondary mt-1">Do we already have it? Type a title, author or a few lines of the text, paste a link, attach a file —
        or take photos of the cover, title page or a page of text.</p>
    </header>

    <form class="flex flex-col gap-3 mb-5" onsubmit={(e) => { e.preventDefault(); check(); }}>
      <textarea class="w-full px-3 py-2 rounded-md border border-border bg-surface-1 text-primary" rows="3" bind:value={q}
        placeholder="Title or author · a few lines of the text · a link to a book, PDF or video" aria-label="What to check"></textarea>

      {#if photos.length || file}
        <div class="flex flex-wrap gap-2 items-center">
          {#each photos as p, i (i)}
            <div class="relative">
              <img src={p} alt="Photo {i + 1}" class="w-16 h-20 object-cover rounded-md border border-border-subtle" />
              <button type="button" class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface-3 text-primary text-xs" aria-label="Remove photo"
                onclick={() => (photos = photos.filter((_, k) => k !== i))}>✕</button>
            </div>
          {/each}
          {#if file}<span class="px-2 py-1 rounded-md bg-surface-2 text-sm text-primary">📄 {file.name} <button type="button" class="ml-1 text-secondary" onclick={() => (file = null)} aria-label="Remove file">✕</button></span>{/if}
        </div>
      {/if}

      <div class="flex flex-wrap gap-2">
        <label class="px-4 py-2 rounded-md border border-border bg-surface-1 text-primary cursor-pointer hover:bg-surface-2">
          📷 Photo
          <input type="file" accept="image/*" capture="environment" multiple class="sr-only" onchange={addPhotos} />
        </label>
        <label class="px-4 py-2 rounded-md border border-border bg-surface-1 text-primary cursor-pointer hover:bg-surface-2">
          📎 File
          <input type="file" accept=".pdf,.docx,.txt,.md,image/*" class="sr-only" onchange={addFile} />
        </label>
        <button class="px-5 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 ml-auto" disabled={busy || !hasInput}>
          {busy ? 'Checking…' : 'Do we have it?'}
        </button>
        {#if result || error}<button type="button" class="px-3 py-2 text-secondary hover:text-primary" onclick={clearAll}>Clear</button>{/if}
      </div>
    </form>

    {#if error}<p class="text-error">{error}</p>{/if}

    {#if result}
      {@const v = VERDICT[result.verdict] || { label: result.verdict, tone: 'text-primary' }}
      {@const id = result.identified || {}}
      <div class="p-4 rounded-lg border border-border bg-surface-1 mb-4">
        <p class="text-lg font-semibold {v.tone}">{v.label}</p>
        {#if id.title || id.author}
          <p class="text-primary mt-1">Read as: <strong>{id.title || 'untitled'}</strong>{#if id.subtitle} — {id.subtitle}{/if}</p>
          {#if fieldLine(id)}<p class="text-sm text-secondary">{fieldLine(id)}</p>{/if}
        {/if}
        {#if id.kind === 'scan'}<p class="text-sm text-warning mt-1">A scan with no text layer — only its title could be checked; its text needs OCR.</p>{/if}
        {#if id.printed_lines?.length}<p class="text-xs text-muted mt-1">{id.printed_lines.length} printed line{id.printed_lines.length === 1 ? '' : 's'} checked against the library's text.</p>{/if}
        {#if result.verdict === 'not-held'}<p class="text-sm text-secondary mt-2">Neither its title nor its text is in the library — worth adding.</p>{/if}
        {#if result.verdict === 'not-found-by-title'}<p class="text-sm text-secondary mt-2">Its title is not in the catalogue. A photo of a page of its text would settle it — the text may be here under another title.</p>{/if}
      </div>

      {#if result.candidates?.length}
        <ul class="flex flex-col gap-2" role="list">
          {#each result.candidates as d (d.id)}
            {@const thumb = svcFixed(d.cover_url, 40, 60)}
            <li class="flex gap-3 items-start p-2 rounded-md border border-border-subtle bg-surface-1">
              {#if thumb}<img src={thumb.src} srcset={thumb.srcset} width="40" height="60" alt="" class="w-10 h-15 rounded-sm object-cover shrink-0" loading="lazy" />{/if}
              <div class="min-w-0">
                <a href="/document/{d.id}" class="text-primary font-medium hover:text-accent">{d.title || 'Untitled'}</a>
                <div class="text-sm text-secondary">{[d.author, d.language, d.religion, d.collection, d.year].filter(Boolean).join(' · ')}</div>
                <div class="text-xs text-muted mt-1">{d.evidence.map((e) => `${e.kind}${e.detail ? `: ${e.detail}` : ''}`).join(' · ')}</div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>
{/if}
