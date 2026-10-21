<script>
  // The Review popup for an item that "Needs a person" (Chad 10-18: "a button to a popup that allows me to view the document
  // and answer the question"): Dewey's question, the original file (PDF inline, an object URL — the bearer token can't ride
  // an iframe src), the text Dewey has, and the answers that fit (GET /api/dewey/items/:id/review → POST …/resolve).
  import { dewey } from '../../lib/api.js';

  let { id, onclose = () => {}, ondone = () => {} } = $props();
  let r = $state(null), error = $state(null), busy = $state(null);
  let fileUrl = $state(null), fileErr = $state(null), tab = $state('file'), converted = $state(false);
  let title = $state(''), author = $state(''), religion = $state(''), collection = $state('');
  const CHUNK = 60000;
  let shown = $state(CHUNK);   // characters of the text drawn so far

  $effect(() => {
    let url = null, dead = false;
    dewey.review(id).then((x) => {
      if (dead) return;
      r = x; title = x.item.title || ''; author = x.item.author || '';
      religion = x.item.shelf?.religion || ''; collection = x.item.shelf?.collection || '';
      if (!x.source) tab = 'text';
      else if (['pdf', 'png', 'jpg', 'jpeg', 'txt', 'md', 'html', 'htm'].includes(x.source.ext))
        dewey.file(id).then((b) => { if (!dead) fileUrl = url = URL.createObjectURL(b); }).catch((e) => { fileErr = e.message; });
      // RTF, Word, WordPerfect, ODT, EPUB: the server converts them to sanitised HTML (shown in a sandboxed frame — Chad 10-20)
      else if (['rtf', 'doc', 'docx', 'odt', 'wpd', 'wps', 'epub', 'webarchive'].includes(x.source.ext)) {
        converted = true;
        dewey.preview(id).then((b) => { if (!dead) fileUrl = url = URL.createObjectURL(b); }).catch((e) => { fileErr = e.message; if (x.text) tab = 'text'; });
      }
      else { fileErr = `A .${x.source.ext} file can't be shown here`; if (x.text) tab = 'text'; }
    }).catch((e) => { error = e.message; });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  });

  const religions = $derived(Object.keys(r?.shelves || {}).sort());
  const collections = $derived((r?.shelves?.[religion] || []).slice().sort());
  const size = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  async function answer(a) {
    busy = a.action; error = null;
    try {
      const body = { action: a.action };
      if (a.fields || a.action === 'use-ocr') Object.assign(body, { title, author, ...(religion && collection ? { shelf: { religion, collection } } : {}) });
      await dewey.resolve(id, body);
      ondone(); onclose();
    } catch (e) { error = e.message; busy = null; }
  }
  async function offer(how) {
    busy = how; error = null;
    try { const res = await dewey[how](id); ondone(res?.item); onclose(); } catch (e) { error = e.message; busy = null; }
  }
  const onkey = (e) => { if (e.key === 'Escape') onclose(); };
</script>

<svelte:window onkeydown={onkey} />
<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Review">
    <header>
      <div class="min-w-0">
        <div class="text-xs text-muted uppercase tracking-wide">{r?.item.state === 'offered' ? 'Not in the library — add it?' : 'Needs a person'}</div>
        <h2 class="text-primary font-semibold truncate">{r?.item.title || '…'}</h2>
      </div>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </header>
    {#if error && !r}<p class="text-error text-sm p-4">{error}</p>
    {:else if !r}<p class="text-muted text-sm p-4">…</p>
    {:else}
      <div class="body">
        <section class="viewer">
          <div class="tabs">
            {#if r.source}<button class:on={tab === 'file'} onclick={() => (tab = 'file')}>File · {r.source.ext.toUpperCase()}{#if r.source.pages} · {r.source.pages} pages{/if} · {size(r.source.bytes)}</button>{/if}
            {#if r.text}<button class:on={tab === 'text'} onclick={() => (tab = 'text')}>{r.text.from === 'file' ? 'Text' : r.text.from === 'ocr-rejected' ? 'OCR text (failed the check)' : 'OCR text'} · {r.text.words?.toLocaleString('en-US')} words</button>{/if}
            {#if fileUrl}<a class="open" href={fileUrl} target="_blank" rel="noopener">Open ↗</a>{/if}
          </div>
          {#if tab === 'file'}
            {#if fileUrl}{#if converted}<iframe src={fileUrl} title="The original file, converted for reading" sandbox=""></iframe>{:else}<iframe src={fileUrl} title="The original file"></iframe>{/if}
            {:else if fileErr}<p class="text-muted text-sm p-3">{fileErr}</p>
            {:else}<p class="text-muted text-sm p-3">Loading the file…</p>{/if}
          {:else if r.text}
            {#if r.text.why_rejected?.length}<p class="text-warning text-xs px-3 pt-2">Check failed: {r.text.why_rejected.join('; ')}</p>{/if}
            <!-- the whole text, LOADED ON SCROLL (10-19: a large book opens at once and keeps reading as you scroll) -->
            <pre class="text" onscroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 1500) shown = Math.min(r.text.preview.length, shown + CHUNK); }}>{r.text.preview.slice(0, shown)}{#if shown < r.text.preview.length}<span class="text-muted">

… loading as you scroll ({Math.round((100 * shown) / r.text.preview.length)}% shown)</span>{:else if r.text.chars > r.text.preview.length}<span class="text-muted">

… the text continues ({(r.text.chars - r.text.preview.length).toLocaleString('en-US')} more characters)</span>{/if}</pre>
          {/if}
        </section>
        <section class="side">
          <div class="q">
            <div class="text-xs text-muted">Dewey asks</div>
            <p class="text-primary text-sm">{r.question}</p>
          </div>
          {#if r.item.summary}<p class="text-secondary text-xs">{r.item.summary}</p>{/if}
          <div class="fields">
            <label>Title <input bind:value={title} /></label>
            <label>Author <input bind:value={author} /></label>
            <label>Shelf
              <select bind:value={religion} onchange={() => (collection = '')}><option value="">— tradition —</option>{#each religions as x}<option>{x}</option>{/each}</select>
              <select bind:value={collection} disabled={!religion}><option value="">— collection —</option>{#each collections as x}<option>{x}</option>{/each}</select>
            </label>
          </div>
          <div class="answers">
            {#if r.item.state === 'offered'}
              <!-- an OFFER (a file we lack): read it here, then decide (Chad 10-20) -->
              <button class="ans primary" disabled={!!busy} onclick={() => offer('accept')}>{busy === 'accept' ? '…' : 'Add it'}<span class="hint">import it into the library{religion && collection ? ` — ${religion} › ${collection}` : ''}</span></button>
              <button class="ans quiet" disabled={!!busy} onclick={() => offer('decline')}>{busy === 'decline' ? '…' : 'Not this one'}<span class="hint">not wanted</span></button>
            {:else}
            {#each r.answers as a, i (a.action)}
              <button class="ans" class:primary={i === 0} class:quiet={a.action === 'decline'} disabled={!!busy} onclick={() => answer(a)} title={a.hint}>
                {busy === a.action ? '…' : a.label}<span class="hint">{a.hint}</span>
              </button>
            {/each}
            {/if}
          </div>
          {#if error}<p class="text-error text-xs">{error}</p>{/if}
          <details class="hist">
            <summary class="text-xs text-muted">History</summary>
            <ol>{#each r.history as h}<li class="text-xs text-secondary"><span class="text-muted">{h.state}</span> — {h.why}</li>{/each}</ol>
          </details>
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, black 70%, transparent); display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .modal { width: min(1200px, 100%); height: min(860px, 100%); display: flex; flex-direction: column; background: var(--surface-solid);   /* solid: the page surfaces are see-through (10-20 screenshot) */ border: 1px solid var(--border-subtle); border-radius: 0.9rem; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 1rem; border-bottom: 1px solid var(--border-subtle); }
  .x { color: var(--text-muted); padding: 0.25rem 0.5rem; border-radius: 0.4rem; } .x:hover { color: var(--text-primary); background: var(--surface-2); }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
  .viewer { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border-subtle); }
  .tabs { display: flex; gap: 0.25rem; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border-subtle); align-items: center; flex-wrap: wrap; }
  .tabs button { font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: 0.4rem; color: var(--text-secondary); }
  .tabs button.on { background: var(--surface-2); color: var(--text-primary); }
  .tabs .open { margin-left: auto; font-size: 0.75rem; color: var(--accent-primary); }
  iframe { flex: 1; width: 100%; border: 0; background: white; }
  .text { flex: 1; overflow: auto; margin: 0; padding: 0.8rem 1rem; white-space: pre-wrap; font-size: 0.82rem; line-height: 1.5; color: var(--text-primary); font-family: inherit; }
  .side { overflow-y: auto; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.8rem; }
  .q { padding: 0.6rem 0.7rem; border-radius: 0.5rem; background: color-mix(in srgb, var(--warning) 12%, transparent); }
  .fields { display: flex; flex-direction: column; gap: 0.45rem; }
  .fields label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem; color: var(--text-muted); }
  .fields input, .fields select { font-size: 0.82rem; padding: 0.3rem 0.45rem; border-radius: 0.35rem; border: 1px solid var(--border-subtle); background: var(--surface-0); color: var(--text-primary); }
  .answers { display: flex; flex-direction: column; gap: 0.4rem; }
  .ans { text-align: left; padding: 0.45rem 0.65rem; border-radius: 0.5rem; border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 0.85rem; font-weight: 500; }
  .ans:hover:not(:disabled) { border-color: var(--accent-primary); }
  .ans.primary { background: var(--accent-primary); border-color: transparent; color: white; }
  .ans.primary .hint { color: color-mix(in srgb, white 80%, transparent); }
  .ans.quiet { color: var(--text-secondary); }
  .ans:disabled { opacity: 0.6; }
  .hint { display: block; font-size: 0.7rem; font-weight: 400; color: var(--text-muted); }
  .hist ol { margin: 0.3rem 0 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
  @media (max-width: 800px) {
    .backdrop { padding: 0; }
    .modal { border-radius: 0; height: 100%; }
    .body { grid-template-columns: 1fr; grid-template-rows: minmax(260px, 1fr) auto; overflow-y: auto; }
    .viewer { border-right: 0; border-bottom: 1px solid var(--border-subtle); min-height: 260px; }
  }
</style>
