<script>
  // THE CATALOGUE, as you type: books on the shelves first (titles, authors, work parts; diacritics folded so
  // "bahaullah" finds Bahá’u’lláh — instant, from the edge-cached shelves index), then the whole library (the document
  // finder, /api/library/documents?search=, edge-cached). Hidden traditions never show (results are kept to the
  // traditions on the page). Without JS the form searches every passage (/?q=).
  import { onMount, tick } from 'svelte';
  import { getShelves } from '../../../lib/library-feed.js';
  import { catalogFrom, searchCatalog, displayName, fold, thousands, coverImg, coverSpec } from '../../../lib/library-stacks.js';

  let { traditions = [], total = 0 } = $props();
  const API = import.meta.env.PUBLIC_API_URL || '';
  let q = $state(''), catalog = null, local = $state([]), deep = $state({ items: [], total: 0, loading: false });
  let list = $state(null), open = $state(false);
  const allowed = $derived(new Set(traditions));
  const shown = $derived(open && q.trim().length >= 2);
  let timer, seq = 0;

  async function warm() { if (!catalog) { const s = await getShelves(); if (s) { catalog = catalogFrom(s); run(); } } }
  function run() {
    const v = q.trim();
    local = v.length >= 2 && catalog ? searchCatalog(catalog, v, 6) : [];
    clearTimeout(timer);
    if (v.length < 2) { deep = { items: [], total: 0, loading: false }; return; }
    deep = { ...deep, loading: true };
    timer = setTimeout(() => finder(v), 260);
  }
  async function finder(v) {
    const mine = ++seq;
    try {
      const r = await fetch(`${API}/api/library/documents?${new URLSearchParams({ search: v, limit: '24' })}`);
      const j = r.ok ? await r.json() : { documents: [], total: 0 };
      if (mine !== seq) return;
      const have = new Set(local.map((e) => e.id).filter(Boolean));
      const items = (j.documents || []).filter((d) => allowed.has(d.religion) && !have.has(d.id)).slice(0, 8)
        .map((d) => ({ id: d.id, t: d.title, a: d.author || '', w: d.religion, c: d.cover_url || null, sub: [d.collection, d.year].filter(Boolean).join(' · '), u: `/library/view?doc=${d.id}` }));
      deep = { items, total: j.total || 0, loading: false };
    } catch { if (mine === seq) deep = { ...deep, loading: false }; }
  }
  function onInput() { open = true; warm(); run(); }
  async function onKey(e) {
    if (e.key === 'Escape') { if (q) { q = ''; run(); } else open = false; return; }
    if (e.key === 'ArrowDown' && shown) { e.preventDefault(); await tick(); list?.querySelector('a')?.focus(); }
  }
  function onSubmit(e) {
    const first = list?.querySelector('a');
    if (first) { e.preventDefault(); location.href = first.getAttribute('href'); }
  }
  function onListKey(e) {
    if (e.key === 'Escape') { open = false; document.getElementById('lib-q')?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...list.querySelectorAll('a')], i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = links[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) n.focus(); else if (e.key === 'ArrowUp') document.getElementById('lib-q')?.focus();
  }
  onMount(() => {
    const away = (e) => { if (!e.target.closest?.('.finder')) open = false; };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  });
  const kind = (e) => (e.k === 'collection' ? `Collection · ${thousands(e.n)} books` : e.k === 'work' ? `${e.n} parts` : '');
  const words = $derived(fold(q).split(' ').filter(Boolean));
  const mark = (t) => String(t).split(/(\s+)/).map((w) => ({ w, hit: words.some((x) => fold(w).startsWith(x)) }));
  const thumb = (e) => coverImg(e.c, [48, 96]);
</script>

{#snippet hit(e, sub)}
  {@const im = thumb(e)}
  {@const sp = coverSpec({ id: e.id ?? e.u, title: e.t }, e.w)}
  <li><a class="hit" href={e.u}>
    <span class="th" style={`--cl:var(--cloth-${sp.cloth})`} aria-hidden="true">{#if im}<img src={im.src} srcset={im.srcset} sizes="32px" alt="" loading="lazy" />{/if}</span>
    <span class="tx">
      <span class="t">{#each mark(e.t) as m}{#if m.hit}<mark>{m.w}</mark>{:else}{m.w}{/if}{/each}</span>
      <span class="s">{[e.a, displayName(e.w), sub].filter(Boolean).join(' · ')}</span>
    </span>
  </a></li>
{/snippet}

<div class="finder">
  <form role="search" action="/" method="get" onsubmit={onSubmit}>
    <label for="lib-q" class="sr-only">Search the library by title or author</label>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    <input id="lib-q" name="q" type="search" autocomplete="off" spellcheck="false" bind:value={q} oninput={onInput} onfocus={() => { open = true; warm(); }} onkeydown={onKey}
      placeholder={total ? `Search ${thousands(total)} books` : "Search by title or author"} aria-controls={shown ? "lib-results" : undefined} />
    <kbd aria-hidden="true">↵</kbd>
  </form>
  {#if shown}
    <div id="lib-results" class="pop" bind:this={list} onkeydown={onListKey} role="region" aria-live="polite" aria-label="Search results">
      {#if local.length}
        <p class="grp">On the shelves</p>
        <ul>{#each local as e (e.u)}{@render hit(e, kind(e))}{/each}</ul>
      {/if}
      {#if deep.items.length}
        <p class="grp">Across the library <span>{thousands(deep.total)} found</span></p>
        <ul>{#each deep.items as e (e.id)}{@render hit(e, e.sub)}{/each}</ul>
      {:else if deep.loading && !local.length}
        <p class="empty">Searching…</p>
      {:else if !deep.loading && !local.length}
        <p class="empty">Nothing by that title or author yet.</p>
      {/if}
      <p class="every"><a href={`/?q=${encodeURIComponent(q.trim())}`}>Search every passage for “{q.trim()}”</a></p>
    </div>
  {/if}
</div>

<style>
  .finder { position: relative; z-index: 30; }
  form { display: flex; align-items: center; gap: 0.75rem; height: 3.6rem; padding: 0 1.1rem 0 1.25rem; border-radius: 999px; border: 1px solid var(--lib-line); background: var(--lib-raised); color: var(--lib-ink-soft);
    box-shadow: 0 10px 30px -18px var(--lib-shadow); transition: border-color 0.2s, box-shadow 0.2s; }
  form:focus-within { border-color: var(--lib-ink); box-shadow: 0 14px 34px -16px var(--lib-shadow); }
  svg { width: 1.3rem; height: 1.3rem; flex: none; }
  input { flex: 1; min-width: 0; height: 100%; border: 0; outline: none !important; background: transparent; color: var(--lib-ink); font-family: var(--font-quote); font-size: 1.1rem; }
  input::placeholder { color: var(--lib-ink-faint); }
  kbd { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid var(--lib-line); color: var(--lib-ink-faint); }
  @media (max-width: 640px) { kbd { display: none; } form { height: 3.2rem; } }
  .pop { position: absolute; left: 0; right: 0; top: calc(100% + 0.6rem); max-height: min(70vh, 34rem); overflow: auto; padding: 0.8rem; border-radius: 1rem; border: 1px solid var(--lib-line);
    background: var(--lib-raised); box-shadow: 0 30px 60px -24px var(--lib-shadow); }
  .grp { margin: 0.4rem 0.5rem 0.4rem; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lib-ink-faint); }
  .grp span { letter-spacing: 0.04em; text-transform: none; margin-left: 0.4rem; }
  ul { list-style: none; margin: 0 0 0.4rem; padding: 0; }
  .hit { display: flex; align-items: center; gap: 0.85rem; padding: 0.5rem; border-radius: 0.6rem; color: var(--lib-ink); text-decoration: none; }
  .hit:hover, .hit:focus-visible { background: var(--lib-sunk); outline: none; }
  .th { position: relative; flex: none; width: 2rem; aspect-ratio: 18 / 25; border-radius: 2px; background: var(--cl); }
  .th img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%; background: var(--lib-raised); }
  .tx { display: flex; flex-direction: column; min-width: 0; }
  .t { font-family: var(--font-quote); font-size: 1rem; line-height: 1.3; }
  mark { background: none; color: inherit; font-weight: 700; text-decoration: underline; text-decoration-color: var(--lib-accent); text-underline-offset: 3px; }
  .s { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-quote); font-style: italic; font-size: 0.85rem; color: var(--lib-ink-soft); }
  .empty { margin: 0.6rem 0.5rem; font-family: var(--font-quote); font-style: italic; color: var(--lib-ink-soft); }
  .every { margin: 0.3rem 0 0; padding: 0.7rem 0.5rem 0.2rem; border-top: 1px solid var(--lib-line); }
  .every a { font-family: var(--font-quote); color: var(--lib-ink); text-underline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
