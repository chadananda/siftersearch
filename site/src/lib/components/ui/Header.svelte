<script>
  import { createEventDispatcher } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { page } from '$app/stores';

  const dispatch = createEventDispatcher();

  let searchQuery = '';
  export let sidebarCollapsed = false;
  
  function handleSearch() {
    dispatch('search', { query: searchQuery });
  }

  function toggleSidebar() {
    dispatch('toggleSidebar');
  }

  $: user = $page.data.user;
</script>

<div class="h-full flex items-center justify-between px-4">
  <div class="flex items-center gap-4">
    <button 
      class="p-2 rounded-lg hover:bg-surface-3 text-text-secondary transition-colors"
      on:click={toggleSidebar}
      aria-label="Toggle sidebar"
    >
      <svg class="w-5 h-5 transition-transform duration-300 {sidebarCollapsed ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19l-7-7 7-7m6 14l-7-7 7-7"/>
      </svg>
    </button>
    
    <div class="flex items-center">
      <a href="/" class="text-lg font-semibold text-text-primary">
        <span class="text-accent">Sifter</span>Search
      </a>
    </div>
  </div>

  <div class="flex-1 max-w-2xl mx-4">
    <div class="relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search..."
        class="w-full h-10 px-4 pl-10 bg-surface-2 rounded-lg 
               ring-1 ring-white/10
               hover:ring-white/20 focus:ring-white/20
               focus:outline-none
               text-text-primary placeholder-text-tertiary transition-all"
        on:keydown={e => e.key === 'Enter' && handleSearch()}
      />
      <svg 
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor"
      >
        <path 
          stroke-linecap="round" 
          stroke-linejoin="round" 
          stroke-width="2" 
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </div>
  </div>

  <div class="flex items-center gap-4">
    <ThemeToggle />
    {#if user}
      <div class="flex items-center gap-2">
        <span class="text-sm">{user.firstName || user.email}</span>
        <form action="/auth/signout" method="POST">
          <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors">
            Sign out
          </button>
        </form>
      </div>
    {:else}
      <a href="/auth/signin" class="p-2 text-text-secondary hover:text-text-primary">
        <span class="sr-only">Sign in</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    {/if}
  </div>
</div>

<style>
  input::placeholder {
    color: var(--text-tertiary);
  }
</style>
