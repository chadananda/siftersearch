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
    <div class="cols" data-panel={view}>
      <div class="left panel"><DeweyLibrary authed={ready} /></div>
      <div class="mid"><div class="chatbox"><DeweyChat /></div></div>
      <div class="right panel"><DeweyAdded authed={ready} /></div>
    </div>
    <!-- narrow screens (Chad 10-17): the library and what is loading are icon buttons on the edges that slide their
         panel over the chat; a tap outside closes it -->
    <button class="edge left-edge" aria-label="The library" title="The library" onclick={() => (view = view === 'library' ? 'chat' : 'library')}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 19V5m4 14V5m4 14 4-14m4 14H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="edge right-edge" aria-label="Loading now" title="Loading now" onclick={() => (view = view === 'added' ? 'chat' : 'added')}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    {#if view !== 'chat'}<button class="scrim" aria-label="Close" onclick={() => (view = 'chat')}></button>{/if}
  </div>
{/if}

<style>
  .dewey { height: 100%; display: flex; flex-direction: column; gap: 0.5rem; }
  /* Dewey introduces himself in the chat — no heading above it (Chad 10-17) */
  .mid { display: flex; flex-direction: column; gap: 0.4rem; }
  .chatbox { flex: 1; min-height: 0; }
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr) 330px; gap: 0.75rem; }
  .cols > div { min-height: 0; }
  .edge, .scrim { display: none; }
  @media (max-width: 1099px) {
    .dewey { position: relative; }
    .cols { grid-template-columns: minmax(0, 1fr); }
    .mid { height: 100%; }
    /* panels slide over the chat from their own side */
    .panel { position: absolute; top: 0; bottom: 0; width: min(88%, 360px); z-index: 20; transition: transform 0.25s ease; }
    .left.panel { left: 0; transform: translateX(-105%); }
    .right.panel { right: 0; transform: translateX(105%); }
    .cols[data-panel='library'] .left.panel, .cols[data-panel='added'] .right.panel { transform: none; }
    .panel :global(> *) { box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.6); background: var(--surface-1); }
    .scrim { display: block; position: absolute; inset: 0; z-index: 15; background: rgba(0, 0, 0, 0.35); }
    /* half-round tabs on the screen edges, thumb-sized, clear of the photo/attach buttons at the bottom right */
    .edge { display: inline-flex; align-items: center; justify-content: center; position: absolute; top: 30%; z-index: 10; width: 2.75rem; height: 3.5rem;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text-primary); box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.5); }
    .left-edge { left: -1rem; border-radius: 0 1rem 1rem 0; padding-left: 0.6rem; }
    .right-edge { right: -1rem; border-radius: 1rem 0 0 1rem; padding-right: 0.6rem; }
  }
</style>
