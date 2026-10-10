<script>
  // Dewey, the AI Librarian — home for members with access (admins + users.dewey_access, managed on /admin/users).
  // Today: "Do we already have it?" by title or author (the library's SQLite finder, /api/library/documents?search=).
  // The chat, email intake and the rest of Dewey are being built (docs/agents/agent-dewey.md).
  import { onMount } from 'svelte';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { svcFixed } from '../../lib/imagekit.js';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const auth = getAuthState();
  let ready = $state(false);
  let q = $state('');
  let results = $state(null);
  let total = $state(0);
  let searching = $state(false);
  let error = $state(null);

  let canDewey = $derived(['admin', 'superadmin'].includes(auth.user?.tier) || Number(auth.user?.dewey_access) === 1);

  onMount(async () => { await initAuth(); ready = true; });

  async function check() {
    const text = q.trim();
    if (!text) return;
    searching = true; error = null;
    try {
      const res = await fetch(`${API_BASE}/api/library/documents?search=${encodeURIComponent(text)}&limit=12`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      results = data.documents || [];
      total = data.total || results.length;
    } catch (e) {
      error = e.message;
    } finally {
      searching = false;
    }
  }
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
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-primary">Dewey <span class="text-base font-normal text-secondary">· AI Librarian for Ocean 2.0</span></h1>
      <p class="text-secondary mt-1">
        Ask whether a document is already in the library before scanning it. Dewey's chat, email
        (<span class="select-all">dewey@oceanlibrary.com</span>) and intake are being built —
        <a href="/docs/agents/dewey" class="text-accent hover:text-accent-hover">what Dewey will do</a>.
      </p>
    </header>

    <form class="flex gap-2 mb-4" onsubmit={(e) => { e.preventDefault(); check(); }}>
      <input
        class="flex-1 px-3 py-2 rounded-md border border-border bg-surface-1 text-primary"
        type="search"
        placeholder="Title or author — e.g. Nabíl's Narrative, Gulpáygání"
        bind:value={q}
        aria-label="Title or author"
      />
      <button class="px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50" disabled={searching || !q.trim()}>
        {searching ? 'Checking…' : 'Do we have it?'}
      </button>
    </form>

    {#if error}<p class="text-error">{error}</p>{/if}

    {#if results}
      {#if results.length === 0}
        <p class="text-primary"><strong>Not found by title or author.</strong> <span class="text-secondary">If you have it, scan it — Dewey will take it from there.</span></p>
      {:else}
        <p class="text-secondary text-sm mb-2">{total} match{total === 1 ? '' : 'es'} by title or author:</p>
        <ul class="flex flex-col gap-2" role="list">
          {#each results as d (d.id)}
            {@const thumb = svcFixed(d.cover_url, 40, 60)}
            <li class="flex gap-3 items-start p-2 rounded-md border border-border-subtle bg-surface-1">
              {#if thumb}
                <img src={thumb.src} srcset={thumb.srcset} width="40" height="60" alt="" class="w-10 h-15 rounded-sm object-cover shrink-0" loading="lazy" />
              {/if}
              <div class="min-w-0">
                <a href="/document/{d.id}" class="text-primary font-medium hover:text-accent">{d.title || 'Untitled'}</a>
                <div class="text-sm text-secondary">
                  {[d.author, d.language, d.religion, d.collection].filter(Boolean).join(' · ')}
                </div>
              </div>
            </li>
          {/each}
        </ul>
        <p class="text-muted text-xs mt-3">Matched on title and author only — a different edition or language may still be worth adding.</p>
      {/if}
    {/if}
  </section>
{/if}
