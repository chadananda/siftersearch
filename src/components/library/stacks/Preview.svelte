<script>
  // THE PREVIEW: a plain click on any book on /library (featured rows, arrivals, collections, the wall) opens it in a
  // sheet — the cover large; its tradition, title, author, the opening paragraphs and the link into the reader. Modified
  // clicks (new tab…) keep the book's own link. A multi-part work lists its parts. Details come from
  // /api/library/documents/:id?paragraphLimit=6 (edge-cached); a work's parts from the shelves index (getShelves).
  import { onMount, tick } from 'svelte';
  import { getShelves } from '../../../lib/library-feed.js';
  import { displayName, tradKey, thousands, coverImg, coverSpec } from '../../../lib/library-stacks.js';

  const API = import.meta.env.PUBLIC_API_URL || '';
  let dlg, closeBtn, from = null;
  let book = $state(null), detail = $state(null), parts = $state(null), loading = $state(false);
  let seq = 0;

  onMount(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a.bk');
      if (!a || !a.closest('.lib') || a.closest('.feat')) return;
      e.preventDefault();
      open(a);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  });

  async function open(a) {
    from = a;
    const s = a.dataset;
    book = { id: s.id, title: s.t || a.getAttribute('aria-label'), author: s.a || '', year: s.y || '', cover: s.c || '', tradition: s.r || '',
      paras: Number(s.n) || 0, work: s.work ? Number(s.work) : 0, url: a.getAttribute('href') };
    detail = null; parts = null; loading = true;
    dlg.showModal();
    await tick();
    closeBtn?.focus({ preventScroll: true });
    const mine = ++seq;
    if (book.work) {
      const sh = await getShelves();
      const w = sh?.traditions.flatMap((t) => t.shelves).flatMap((x) => x.items).find((i) => String(i.id) === String(book.id) && i.kind === 'work');
      if (mine === seq) { parts = w?.list || []; loading = false; }
      return;
    }
    try {
      const r = await fetch(`${API}/api/library/documents/${encodeURIComponent(book.id)}?paragraphLimit=6`);
      const j = r.ok ? await r.json() : null;
      if (mine !== seq) return;
      const doc = j?.document || {};
      let budget = 900;
      const opening = [];
      for (const p of j?.paragraphs || []) {
        if (!p?.text || /heading|title/i.test(p.blocktype || '') || p.text.length < 40) continue;
        opening.push(p.text.length > budget ? `${p.text.slice(0, budget).replace(/\s+\S*$/, '')}…` : p.text);
        budget -= p.text.length;
        if (budget <= 0 || opening.length >= 2) break;
      }
      detail = { description: doc.description && doc.description !== book.title ? doc.description : '', collection: doc.collection && !/^(unknown|uncategorized)$/i.test(doc.collection) ? doc.collection : '', language: doc.language || '',
        year: doc.year || book.year, paras: doc.paragraph_count || book.paras, opening };
    } catch { if (mine === seq) detail = { opening: [] }; }
    if (mine === seq) loading = false;
  }
  function close() { dlg?.close(); }
  function onClose() { seq++; from?.focus({ preventScroll: true }); from = null; }
  const known = (a) => a && !/^unknown$/i.test(a);
</script>

<dialog bind:this={dlg} class="sheet" aria-labelledby="pv-title" onclose={onClose} onclick={(e) => { if (e.target === dlg) close(); }}>
  {#if book}
    {@const img = coverImg(book.cover, [240, 360, 520])}
    {@const sp = coverSpec({ id: book.id, title: book.title, author: book.author }, book.tradition)}
    <div class="in" style={`--tint:var(--trad-${tradKey(book.tradition)})`}>
      <button bind:this={closeBtn} class="x" type="button" onclick={close} aria-label="Close the preview">×</button>
      <div class="cov">
        <span class="bk-c">
          <span class={`tc tc-${sp.variant} tc-s${sp.size}`} style={`--cl:var(--cloth-${sp.cloth})${sp.band ? `;--bd:var(--cloth-${sp.band})` : ''};visibility:${img ? 'hidden' : 'visible'}`} aria-hidden="true">
            <span class="tc-t">{sp.title}</span>{#if sp.author}<span class="tc-a">{sp.author}</span>{/if}
          </span>
          {#if img}<img src={img.src} srcset={img.srcset} sizes="(max-width: 640px) 40vw, 260px" alt={`Cover of ${book.title}`} decoding="async" />{/if}
        </span>
      </div>
      <div class="body">
        <p class="eyebrow">{displayName(book.tradition)}{detail?.collection && detail.collection !== book.author ? ` · ${detail.collection}` : ''}{detail?.year || book.year ? ` · ${detail?.year || book.year}` : ''}</p>
        <h2 id="pv-title" class="display">{book.title}</h2>
        {#if known(book.author)}<p class="by">{book.author}</p>{/if}
        {#if book.work}
          {#if parts?.length}<ol class="parts">{#each parts as p (p.id)}<li><a class="tlink" href={p.url}>{p.title}</a></li>{/each}</ol>
          {:else if loading}<p class="wait">Opening the set…</p>{/if}
        {:else}
          {#if detail?.description}<p class="desc">{detail.description}</p>{/if}
          {#if detail?.opening?.length}<div class="opening">{#each detail.opening as t}<p>{t}</p>{/each}</div>
          {:else if loading}<p class="wait">Turning to the first page…</p>{/if}
          {#if detail?.paras || book.paras}<p class="meta">{thousands(detail?.paras || book.paras)} paragraphs{detail?.language && detail.language !== 'en' ? ` · ${detail.language}` : ''}</p>{/if}
        {/if}
        <a class="go" href={book.url}>{book.work ? `Open the first part of ${book.title}` : `Read ${book.title}`} <span aria-hidden="true">→</span></a>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .sheet { position: fixed; inset: 0; margin: auto; height: fit-content; width: min(56rem, calc(100vw - 2rem)); max-width: none; max-height: calc(100dvh - 2rem); padding: 0; border: 0; border-radius: 1.2rem; background: var(--lib-raised); color: var(--lib-ink);
    box-shadow: 0 40px 90px -30px var(--lib-shadow); overflow: auto; }
  .sheet::backdrop { background: var(--lib-backdrop); backdrop-filter: blur(4px); }
  .sheet[open] { animation: rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes rise { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
  .in { position: relative; display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 2.2rem; padding: 2.2rem;
    background: radial-gradient(90% 70% at 0% 0%, color-mix(in oklab, var(--tint) 16%, transparent), transparent 70%); }
  .x { position: absolute; top: 0.8rem; right: 0.8rem; width: 2.4rem; height: 2.4rem; border-radius: 999px; border: 1px solid var(--lib-line); background: var(--lib-raised); color: var(--lib-ink); font-size: 1.4rem; line-height: 1; cursor: pointer; }
  .cov .bk-c img { filter: drop-shadow(0 20px 22px var(--lib-shadow)); }
  .body { display: flex; flex-direction: column; gap: 0.7rem; min-width: 0; padding-right: 1.5rem; }
  h2 { margin: 0.2rem 0 0; font-size: clamp(1.7rem, 3.6vw, 2.6rem); }
  .by { margin: 0; font-family: var(--font-quote); font-style: italic; font-size: 1.1rem; color: var(--lib-ink-soft); }
  .desc { margin: 0; font-family: var(--font-quote); color: var(--lib-ink-soft); }
  .opening { font-family: var(--font-quote); font-size: 1rem; line-height: 1.65; max-height: 15rem; overflow: hidden; mask-image: linear-gradient(to bottom, black 70%, transparent); }
  .opening p { margin: 0 0 0.7rem; }
  .wait { margin: 0; font-family: var(--font-quote); font-style: italic; color: var(--lib-ink-soft); }
  .meta { margin: 0; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.72rem; letter-spacing: 0.06em; color: var(--lib-ink-faint); }
  .parts { margin: 0; padding-left: 1.3rem; max-height: 15rem; overflow: auto; columns: 2 12rem; font-family: var(--font-quote); line-height: 1.55; }
  .go { margin-top: 0.6rem; align-self: flex-start; display: inline-flex; gap: 0.55rem; align-items: center; padding: 0.8rem 1.3rem; border-radius: 999px; text-decoration: none;
    font-family: var(--font-quote); font-weight: 700; color: var(--lib-bg); background: var(--lib-ink); transition: transform 0.2s; }
  .go:hover { transform: translateX(3px); }
  @media (max-width: 640px) {
    .in { grid-template-columns: 1fr; gap: 1.2rem; padding: 1.4rem 1.2rem; }
    .cov { width: 9rem; }
    .body { padding-right: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .sheet[open] { animation: none; } .go { transition: none; } }
</style>
