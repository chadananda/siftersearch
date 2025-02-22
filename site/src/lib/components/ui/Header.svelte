<script>
  import { createEventDispatcher } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  const dispatch = createEventDispatcher();

  let searchQuery = '';
  export let userRole = 'Admin';
  
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
      <svg class="w-5 h-5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19l-7-7 7-7m6 14l-7-7 7-7"/>
      </svg>
    </button>
    
    <div class="flex items-center gap-2">
      <span class="text-lg font-semibold text-text-primary">SifterSearch</span>
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
    
    <ThemeToggle />

    <div class="flex items-center gap-3 pl-3">
      <div class="flex flex-col items-end">
        <span class="text-sm font-medium text-text-primary">Admin User</span>
        <span class="text-xs text-text-tertiary">{userRole}</span>
      </div>
      <div class="w-8 h-8 rounded-full bg-surface-3 overflow-hidden">
        <img 
          src="https://ui-avatars.com/api/?name=Admin+User&background=random" 
          alt="Profile" 
          class="w-full h-full object-cover"
        />
      </div>
    </div>
  </div>
</div>

<style>
  input::placeholder {
    color: var(--text-tertiary);
  }
</style>
