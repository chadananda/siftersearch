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

  onMount(() => {
    load();
    window.addEventListener('message', onFlagMessage);
    return () => window.removeEventListener('message', onFlagMessage);
  });
</script>

<div class="er-bar">
  <h2>Entity Review</h2>
  <button onclick={() => load()} disabled={loading}>↻ Refresh</button>
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
  .er-bar button { padding: 6px 16px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; background: #f4f4f5; font-size: 14px; }
  .er-bar button:disabled { opacity: .5; cursor: default; }
  .muted { color: #888; font-size: 13px; }
  .err { color: #c0392b; font-size: 13px; }
  .er-frame { width: 100%; height: calc(100vh - 200px); min-height: 480px; border: 1px solid #e5e5e5; border-radius: 8px; background: #fff; }
</style>
