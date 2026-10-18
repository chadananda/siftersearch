<script>
  // Dewey mode, the librarian page (/dewey) — admins and members granted access on /admin/users (users.dewey_access).
  // Chad 10-17: "list library summary and known missing books on the left side and added books (and their processing
  // stats) on the right side column and the dewey chat can be fullscreen in the middle (or just full screen on mobile)".
  // Desktop: three columns. Below 1100 px: the chat alone, with Library / Added as tabs.
  import { onMount } from 'svelte';
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import DeweyChat from './DeweyChat.svelte';
  import DeweyLibrary from './DeweyLibrary.svelte';
  import DeweyAdded from './DeweyAdded.svelte';

  const auth = getAuthState();
  let ready = $state(false);
  let view = $state('chat');   // narrow screens: chat | library | added
  let canDewey = $derived(['admin', 'superadmin'].includes(auth.user?.tier) || Number(auth.user?.dewey_access) === 1);
  onMount(async () => {
    await initAuth(); ready = true;
    // installable on a phone (Chad 10-17): Dewey's own service worker, scoped to /dewey, caching nothing
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dewey/sw.js', { scope: '/dewey' }).catch(() => {});
  });
</script>

<!-- instant (Chad 10-17): the page draws at once; only a signed-in check that says "no access" replaces it -->
{#if ready && !canDewey}
  <section class="max-w-xl mx-auto text-center py-12">
    <h1 class="text-2xl font-semibold text-primary mb-2">Dewey the Librarian Agent</h1>
    <p class="text-secondary">Dewey, the AI Librarian for Ocean 2.0, works with invited contributors.
      {#if !auth.isAuthenticated}Sign in if you have been invited.{:else}Ask Chad for access.{/if}</p>
  </section>
{:else}
  <div class="dewey">
    <nav class="tabs" aria-label="Dewey views">
      <button class:on={view === 'library'} onclick={() => (view = 'library')}>Library</button>
      <button class:on={view === 'chat'} onclick={() => (view = 'chat')}>Dewey</button>
      <button class:on={view === 'added'} onclick={() => (view = 'added')}>Added</button>
    </nav>
    <div class="cols" data-view={view}>
      <div class="left"><DeweyLibrary authed={ready} /></div>
      <div class="mid"><h1 class="title">Dewey <span>the Librarian Agent</span></h1><div class="chatbox"><DeweyChat /></div></div>
      <div class="right"><DeweyAdded authed={ready} /></div>
    </div>
  </div>
{/if}

<style>
  .dewey { height: 100%; display: flex; flex-direction: column; gap: 0.5rem; }
  /* the title sits just above the chat (Chad 10-17) */
  .mid { display: flex; flex-direction: column; gap: 0.4rem; }
  .chatbox { flex: 1; min-height: 0; }
  .title { font-size: 1.15rem; font-weight: 600; color: var(--text-primary); line-height: 1.2; text-align: center; }
  .title span { font-weight: 400; color: var(--text-secondary); }
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr) 330px; gap: 0.75rem; }
  .cols > div { min-height: 0; }
  .tabs { display: none; }
  @media (max-width: 1099px) {
    .tabs { display: flex; gap: 0.25rem; justify-content: center; }
    .tabs button { padding: 0.3rem 0.9rem; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); font-size: 0.85rem; }
    .tabs button.on { background: var(--surface-2); color: var(--text-primary); }
    .cols { grid-template-columns: minmax(0, 1fr); }
    .cols > div { display: none; }
    .cols[data-view='library'] .left, .cols[data-view='added'] .right { display: block; height: 100%; }
    .cols[data-view='chat'] .mid { display: flex; height: 100%; }
  }
</style>
