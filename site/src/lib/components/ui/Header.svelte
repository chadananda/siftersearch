<script>
  import { createEventDispatcher } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  const dispatch = createEventDispatcher();

  let searchQuery = '';
  export let userRole = 'Admin';
  export let sidebarCollapsed = false;
  
  function handleSearch() {
    dispatch('search', { query: searchQuery });
  }

  function toggleSidebar() {
    dispatch('toggleSidebar');
  }
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

  <div class="flex items-center gap-3">
    <button class="p-2 rounded-lg hover:bg-surface-3 text-text-secondary transition-colors" aria-label="Search">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
      </svg>
    </button>
    
    <div class="flex items-center gap-4">
      <ThemeToggle />
      <a href="https://github.com/chadananda/siftersearch" target="_blank" rel="noopener noreferrer" class="p-2 text-text-secondary hover:text-text-primary">
        <span class="sr-only">GitHub</span>
        <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path>
        </svg>
      </a>
    </div>
  </div>
</div>

<style>
  input::placeholder {
    color: var(--text-tertiary);
  }
</style>
