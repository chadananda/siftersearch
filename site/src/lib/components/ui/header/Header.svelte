<script>
  import { createEventDispatcher } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { page } from '$app/stores';
  import Shadow from '../shared/Shadow.svelte';

  const dispatch = createEventDispatcher();
  const { sidebarCollapsed } = $props();
  let searchQuery = $state('');

  const user = $derived($page.data.user);

  function handleThemeToggle(event) {
    console.log('Theme toggled');
  }

  function toggleSidebar() {
    dispatch('sidebarCollapsed', !sidebarCollapsed);
  }

  function handleSearch() {
    if (searchQuery.trim()) {
      dispatch('search', { query: searchQuery });
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      handleSearch();
    }
  }
</script>

<div class="h-full flex items-center justify-between px-4">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="hover:scale-110 hover:bg-surface-3 hover:shadow-accent/30 p-2 rounded-lg text-primary transition-all duration-300 cursor-pointer"
      on:click={toggleSidebar}
      aria-label="Toggle sidebar"
    >
      <svg class="w-5 h-5 transition-transform duration-300 {sidebarCollapsed ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19l-7-7 7-7m6 14l-7-7 7-7"/>
      </svg>
    </button>

    <div class="flex items-center">
      <a href="/" class="text-3xl font-semibold text-primary">
        <span class="text-primary">Sifter</span>Search
      </a>
    </div>
  </div>

  <div class="hidden sm:flex-1 max-w-2xl mx-4">
    <div class="relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search..."
        class="w-full h-10 px-4 pl-10 bg-surface rounded-lg ring-1 ring-primary/10 hover:ring-primary/20 focus:ring-primary/20 focus:outline-none text-primary placeholder-primary/50 transition-all"
        on:keydown={handleKeydown}
      />
      <button
        type="button"
        class="absolute inset-y-0 left-0 px-3 flex items-center text-primary"
        on:click={handleSearch}
      >
        <svg
          class="w-4 h-4"
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
      </button>
    </div>
  </div>

  <div class="flex items-center gap-4">
    <ThemeToggle on:click={handleThemeToggle} />
    {#if user}
      <div class="flex items-center gap-2">
        {#if user.imageUrl}
          <img src={user.imageUrl} alt="Profile" class="w-8 h-8 rounded-full" />
        {:else}
          <div class="p-2 rounded-lg text-primary transition-all duration-300 cursor-pointer hover:bg-surface hover:scale-110">
            {user.firstName?.[0] || user.email?.[0] || '?'}
          </div>
        {/if}
        <form action="/auth/signout" method="POST">
          <button type="submit" class="px-4 py-2 text-sm font-medium text-text-accent bg-accent hover:bg-accent/80 rounded-lg transition-colors">
            Sign out
          </button>
        </form>
      </div>
    {:else}
      <a href="/auth/signin" class="hover:scale-110 hover:bg-surface p-2 rounded-lg text-primary transition-all duration-300 cursor-pointer">
        <span class="sr-only">Sign in</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    {/if}
  </div>
</div>

<Shadow direction="bottom" />
