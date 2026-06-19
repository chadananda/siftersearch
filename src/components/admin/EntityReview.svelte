<script>
  // Admin entity-review embed. Fetches the live-built review page from the API with the
  // admin's session (no key in URL) and renders it isolated in an iframe (srcdoc).
  // Reloads on mount and on Refresh — always reflects current DB state.
  import { onMount } from 'svelte';
  import { authenticatedFetch } from '../../lib/api.js';

  const REVIEW_URL = (import.meta.env.PUBLIC_API_URL || '') + '/api/admin/entity-review';
  let html = $state('');
  let loading = $state(true);
  let error = $state('');
  let loadedAt = $state('');

  async function load(attempt = 0) {
    loading = true; error = '';
    try {
      const res = await authenticatedFetch(REVIEW_URL);
      // On first paint the admin session token may not be set yet — retry briefly.
      if (res.status === 401 && attempt < 3) {
        await new Promise(r => setTimeout(r, 1500));
        return load(attempt + 1);
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 401 ? ' — admin login required' : ''));
      html = await res.text();
      loadedAt = new Date().toLocaleTimeString();
    } catch (e) {
      error = e?.message || String(e);
    }
    loading = false;
  }

  // The review page (in the iframe) hands flag/note saves up to us — we hold the admin
  // session, so we do the write and ack back so the iframe can show "saved ✓".
  async function onFlagMessage(e) {
    const d = e?.data;
    if (!d || d.type !== 'er-flag') return;
    const frame = document.querySelector('.er-frame');
    let ok = false;
    try {
      const res = await authenticatedFetch(REVIEW_URL + '/flag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityId: d.entityId, canonicalName: d.canonicalName, entityType: d.entityType,
          comment: d.comment, flagged: d.flagged,
        }),
      });
      ok = res.ok;
    } catch { ok = false; }
    frame?.contentWindow?.postMessage({ type: ok ? 'er-flag-ok' : 'er-flag-err', key: d.key }, '*');
  }

  // Print the review CLEANLY. The content lives in an iframe inside the admin chrome (sidebar,
  // navbar, toolbar) and the iframe is fixed-height with internal scroll — so a plain Ctrl+P would
  // capture the chrome and clip the iframe to its visible slice. Instead we re-open the already
  // fetched page HTML in its own window (no chrome, no clipping) and replicate the current
  // tab + book selection so the printout matches what's on screen, then print.
  function printView() {
    const frame = document.querySelector('.er-frame');
    let activeType = '', book = 'all';
    try {
      const d = frame.contentWindow.document;
      const at = d.querySelector('.tab.active'); if (at) activeType = at.id.replace('tab-', '');
      const ab = d.querySelector('.bookfilter .bf.active'); if (ab) book = (ab.textContent || '').trim().split(/\s+/)[0] || 'all';
    } catch { /* cross-frame read may fail; fall back to defaults */ }
    const w = window.open('', '_blank', 'width=1100,height=850');
    if (!w) { alert('Pop-up blocked — allow pop-ups for this site to print the entity review.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => {
      try {
        if (activeType && typeof w.showTab === 'function') w.showTab(activeType);
        if (book && book !== 'All' && typeof w.filterBook === 'function') {
          const btn = [...w.document.querySelectorAll('.bookfilter .bf')]
            .find(b => (b.textContent || '').trim().split(/\s+/)[0] === book);
          w.filterBook(book, btn);
        }
        w.focus(); w.print();
      } catch { try { w.focus(); w.print(); } catch { /* ignore */ } }
    }, 400);
  }

  // Best-effort fallback so a direct Ctrl+P from this page also prints clean: grow the iframe to
  // its full content height first (browsers clip a fixed-height iframe otherwise), restore after.
  function fitFrameForPrint() {
    const f = document.querySelector('.er-frame'); if (!f) return;
    try { f.dataset.h = f.style.height; f.style.height = f.contentWindow.document.documentElement.scrollHeight + 'px'; } catch { /* ignore */ }
  }
  function restoreFrame() {
    const f = document.querySelector('.er-frame'); if (!f) return;
    f.style.height = f.dataset.h || '';
  }

  onMount(() => {
    load();
    window.addEventListener('message', onFlagMessage);
    window.addEventListener('beforeprint', fitFrameForPrint);
    window.addEventListener('afterprint', restoreFrame);
    return () => {
      window.removeEventListener('message', onFlagMessage);
      window.removeEventListener('beforeprint', fitFrameForPrint);
      window.removeEventListener('afterprint', restoreFrame);
    };
  });
</script>

<div class="er-bar">
  <h2>Entity Review</h2>
  <button onclick={() => load()} disabled={loading}>↻ Refresh</button>
  <button class="print-btn" onclick={printView} disabled={!html || loading} title="Open a clean, chrome-free print view of the current tab + book selection">⎙ Print</button>
  {#if loading}<span class="muted">Loading entities…</span>{/if}
  {#if loadedAt && !loading && !error}<span class="muted">updated {loadedAt} · live from DB</span>{/if}
  {#if error}<span class="err">{error}</span>{/if}
</div>
{#if html}
  <iframe class="er-frame" title="Entity Review" srcdoc={html}></iframe>
{/if}

<style>
  .er-bar { display: flex; gap: 14px; align-items: center; padding: 10px 0; flex-wrap: wrap; }
  .er-bar h2 { margin: 0; font-size: 20px; }
  .er-bar button { padding: 6px 16px; border: 1px solid #2563eb; border-radius: 6px; cursor: pointer; background: #2563eb; color: #fff; font-size: 14px; font-weight: 600; }
  .er-bar button:hover:not(:disabled) { background: #1d4ed8; border-color: #1d4ed8; }
  .er-bar button:disabled { opacity: .5; cursor: default; }
  .muted { color: #888; font-size: 13px; }
  .err { color: #c0392b; font-size: 13px; }
  .er-frame { width: 100%; height: calc(100vh - 200px); min-height: 480px; border: 1px solid #e5e5e5; border-radius: 8px; background: #fff; }
  .print-btn { background: #475569 !important; border-color: #475569 !important; }
  .print-btn:hover:not(:disabled) { background: #334155 !important; border-color: #334155 !important; }

  /* Ctrl+P fallback: strip the admin chrome so a direct print isn't full of sidebar/navbar.
     (The ⎙ Print button is the primary, most reliable path — it re-renders the page chrome-free
     in its own window.) The iframe height is expanded to content by fitFrameForPrint(). */
  @media print {
    :global(.navbar), :global(.sidebar) { display: none !important; }
    :global(.admin-layout) { display: block !important; }
    :global(.main-content) { padding: 0 !important; min-height: 0 !important; }
    .er-bar { display: none !important; }
    .er-frame { border: none !important; width: 100% !important; min-height: 0 !important; border-radius: 0 !important; }
  }
</style>
