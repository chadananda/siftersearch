<script>
  // Semantic explorer + review queue: search/filter implied items, inline CRUD, bulk approve/reject, similar, keyboard (j k a r e s g /).
  import { untrack } from 'svelte';
  import { api } from './api.js';
  import { STATUSES } from './util.js';
  import ItemCard from './ItemCard.svelte';
  let { p, setp, onnav = () => {}, onchat = () => {}, bump = () => {}, concepts = [], religions = [] } = $props();
  let items = $state([]), next = $state(null), loading = $state(false), error = $state(''), toast = $state(''), cur = $state(0), picked = $state(new Set()), cards = $state({}), searchEl = $state(null), simOf = $state(null), qIn = $state(p.q || '');
  const review = $derived(p.review === '1');
  const shown = $derived(items.filter((i) => !p.source || i.source === p.source));
  let seq = 0;
  async function load(more = false) {
    const my = ++seq; loading = true; error = '';
    try {
      let r;
      if (simOf) r = { items: (await api.similar(simOf.id)).hits.map((h) => ({ ...h.item, _score: h.score })), next: null };
      else if (p.q) r = { items: (await api.search({ q: p.q, limit: 30, status: p.status, religion: p.religion, stated: p.stated === '1' ? 1 : 0 })).hits.filter((h) => h.item).map((h) => ({ ...h.item, _score: h.score })), next: null };
      else r = await api.list({ status: review ? 'unreviewed' : p.status, concept: p.concept, religion: p.religion, text: p.text, author: p.author, sort: p.sort || 'new', limit: 50, cursor: more ? next : '' });
      if (my !== seq) return;
      items = more ? [...items, ...r.items] : r.items; next = r.next; if (!more) { cur = 0; picked = new Set(); }
    } catch (e) { if (my === seq) error = e.message; }
    if (my === seq) loading = false;
  }
  $effect(() => { JSON.stringify([p.q, p.status, p.concept, p.religion, p.text, p.author, p.sort, p.stated, p.review, simOf?.id]); untrack(() => load()); });
  const say = (m) => { toast = m; setTimeout(() => (toast = ''), 3500); };
  async function setStatus(it, status) {
    try { const r = await api.patch(it.id, { status }); Object.assign(it, r.item); items = items.map((x) => (x.id === it.id ? { ...x, ...r.item } : x)); if (review) { items = items.filter((x) => x.id !== it.id); cur = Math.min(cur, Math.max(0, items.length - 1)); } say(`${status} · re-indexing ${r.reindex || 'queued'}`); bump(); } catch (e) { say('Failed: ' + e.message); }
  }
  async function save(it, d) { const r = await api.patch(it.id, { ...d, status: 'edited' }); items = items.map((x) => (x.id === it.id ? { ...x, ...r.item } : x)); say(`saved · re-indexing ${r.reindex || 'queued'}`); bump(); }
  async function bulk(status) { const ids = [...picked]; if (!ids.length) return; try { const r = await api.bulk(ids, status); say(`${r.updated} ${status}`); picked = new Set(); load(); bump(); } catch (e) { say('Failed: ' + e.message); } }
  function act(k, it) {
    if (k === 'approve') setStatus(it, 'approved'); else if (k === 'reject') setStatus(it, 'rejected');
    else if (k === 'select') { const s = new Set(picked); s.has(it.id) ? s.delete(it.id) : s.add(it.id); picked = s; }
    else if (k === 'similar') { simOf = it; setp({ q: '' }); }
    else if (k === 'graph') onnav('graph', { root: it.id, sel: it.id });
    else if (k === 'para') onnav('para', { para: it.paraId, sel: it.id });
    else if (k === 'chat') onchat([it]);
  }
  function key(e) {
    if (e.target.closest('input,textarea,select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const it = shown[cur]; const k = e.key;
    if (/^[1-5]$/.test(k) && it && !e.target.closest?.('article')) { document.querySelector(`[data-id="${it.id}"] .scorer button[data-n="${k}"]`)?.click(); return; }
    if (k === '/') { e.preventDefault(); searchEl?.focus(); }
    else if (k === 'j') { cur = Math.min(shown.length - 1, cur + 1); cards[shown[cur]?.id]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
    else if (k === 'k') { cur = Math.max(0, cur - 1); }
    else if (it && k === 'a') act('approve', it); else if (it && k === 'r') act('reject', it); else if (it && k === 's') act('similar', it); else if (it && k === 'g') act('graph', it);
    else if (it && k === 'e') document.querySelector(`[data-id="${it.id}"] .acts button:nth-child(2)`)?.click();
  }
  const submit = (e) => { e.preventDefault(); simOf = null; setp({ q: qIn.trim() }); };
</script>

<svelte:window onkeydown={key} />
<form class="bar" onsubmit={submit}>
  <input bind:this={searchEl} class="search" placeholder="Ask a first-principle question…  ( / )" bind:value={qIn} />
  <button class="go">Search</button>
</form>
<div class="filters">
  <select value={p.status || ''} onchange={(e) => setp({ status: e.target.value })} disabled={review}><option value="">any status</option>{#each STATUSES as s (s)}<option>{s}</option>{/each}</select>
  <select value={p.concept || ''} onchange={(e) => setp({ concept: e.target.value })}><option value="">any concept</option>{#each concepts as c (c)}<option>{c}</option>{/each}</select>
  <select value={p.religion || ''} onchange={(e) => setp({ religion: e.target.value })}><option value="">any tradition</option>{#each religions as r (r)}<option>{r}</option>{/each}</select>
  <select value={p.source || ''} onchange={(e) => setp({ source: e.target.value })}><option value="">any source</option><option>hype</option><option>pilot</option><option>manual</option></select>
  <input placeholder="author / book text" value={p.text || ''} onchange={(e) => setp({ text: e.target.value })} />
  <label class="chk"><input type="checkbox" checked={p.stated === '1'} onchange={(e) => setp({ stated: e.target.checked ? '1' : '' })} /> include stated</label>
  <label class="chk"><input type="checkbox" checked={review} onchange={(e) => setp({ review: e.target.checked ? '1' : '' })} /> review queue</label>
  {#if p.q || p.status || p.concept || p.religion || p.text || simOf}<button class="clear" onclick={() => { simOf = null; qIn = ''; setp({ q: '', status: '', concept: '', religion: '', text: '', source: '' }); }}>clear</button>{/if}
</div>
{#if simOf}<p class="note">Neighbours of “{simOf.question}” <button onclick={() => (simOf = null)}>×</button></p>{/if}
{#if picked.size}<div class="bulkbar"><b>{picked.size}</b> selected <button onclick={() => bulk('approved')}>Approve</button><button onclick={() => bulk('rejected')}>Reject</button><button onclick={() => (picked = new Set())}>Clear</button></div>{/if}
{#if error}<p class="text-error my-2">{error} {items.length ? '(showing last results)' : ''}</p>{/if}

{#if review}
  {#if shown[0]}<p class="text-muted text-sm mb-2">{shown.length} to review · <kbd>a</kbd> approve · <kbd>r</kbd> reject · <kbd>e</kbd> edit</p>{#key shown[0].id}<ItemCard item={shown[0]} big focused onact={act} onsave={save} />{/key}
  {:else if !loading}<p class="empty">Review queue is empty. Nothing is waiting.</p>{/if}
{:else}
  <div class="list">
    {#each shown as it, i (it.id)}
      <div bind:this={cards[it.id]}><ItemCard item={it} score={it._score} focused={i === cur} selected={picked.has(it.id)} onact={act} onsave={save} /></div>
    {/each}
  </div>
  {#if loading && !items.length}<div class="list">{#each [1, 2, 3] as n (n)}<div class="skel"></div>{/each}</div>{/if}
  {#if !loading && !shown.length && !error}<p class="empty">No implied first principles match. Try a broader question or clear the filters.</p>{/if}
  {#if next}<button class="more" onclick={() => load(true)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>{/if}
{/if}
{#if toast}<div class="toast" role="status">{toast}</div>{/if}

<style>
  .bar { display: flex; gap: .5rem; margin-bottom: .75rem; } .search { flex: 1; font-size: 1.1rem; padding: .7rem 1rem; border-radius: .8rem; background: var(--surface-solid); border: 1px solid var(--border-default); color: var(--text-primary); } .search:focus { outline: 2px solid var(--accent); }
  .go { padding: 0 1.4rem; border-radius: .8rem; background: var(--accent); color: var(--accent-primary-text); border: 0; cursor: pointer; font-weight: 600; }
  .filters { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: 1rem; } .filters select, .filters input:not([type=checkbox]) { background: var(--surface-solid); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: .5rem; padding: .35rem .6rem; font-size: .85rem; }
  .chk { font-size: .8rem; color: var(--text-secondary); display: flex; gap: .3rem; align-items: center; } .clear { color: var(--accent); background: none; border: 0; cursor: pointer; font-size: .85rem; }
  .list { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); align-items: start; }
  .skel { height: 11rem; border-radius: .75rem; background: linear-gradient(90deg, var(--surface-1), var(--surface-2), var(--surface-1)); background-size: 200% 100%; animation: sh 1.4s infinite; } @keyframes sh { to { background-position: -200% 0; } }
  .empty { text-align: center; color: var(--text-muted); padding: 3rem 0; } .note { color: var(--text-secondary); margin-bottom: .75rem; font-size: .9rem; } .note button { color: var(--accent); }
  .bulkbar { position: sticky; top: 0; z-index: 5; display: flex; gap: .75rem; align-items: center; padding: .5rem .9rem; margin-bottom: .75rem; border-radius: .6rem; background: var(--surface-solid); border: 1px solid var(--accent); } .bulkbar button { color: var(--accent); }
  .more { margin: 1rem auto; display: block; padding: .5rem 1.5rem; border-radius: .5rem; border: 1px solid var(--border-default); color: var(--text-primary); background: var(--surface-2); }
  .toast { position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%); background: var(--surface-solid); border: 1px solid var(--accent); color: var(--text-primary); padding: .55rem 1.1rem; border-radius: .6rem; z-index: 60; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
  kbd { background: var(--surface-3); padding: 0 .35rem; border-radius: .25rem; font-size: .75rem; }
</style>
