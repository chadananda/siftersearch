<!--
  Header.svelte
  IMPORTANT: This component uses Svelte 5 with Runes syntax
  - Uses $props() for props
  - Uses $state() for reactive state
  - Uses callback props instead of event dispatching
-->
<script>
  import ThemeToggle from './ThemeToggle.svelte';
  import ProfileButton from './ProfileButton.svelte';
  import Shadow from '../shared/Shadow.svelte';

  // Get props using Svelte 5 Runes syntax
  const { sidebarCollapsed, toggleTheme, onsidebarCollapsed, onsearch } = $props();
  
  // State
  let searchQuery = $state('');

  // Handle theme toggle
  function handleThemeToggle() {
    if (toggleTheme) toggleTheme();
  }

  // Toggle sidebar
  function toggleSidebar() {
    // In Svelte 5, we call the callback prop directly instead of dispatching an event
    if (onsidebarCollapsed) onsidebarCollapsed(!sidebarCollapsed);
  }

  // Handle search
  function handleSearch() {
    if (searchQuery.trim() && onsearch) {
      onsearch({ query: searchQuery });
    }
  }

  // Handle keyboard events
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
      onclick={toggleSidebar}
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
        onkeydown={handleKeydown}
      />
      <button
        type="button"
        class="absolute inset-y-0 left-0 px-3 flex items-center text-primary"
        onclick={handleSearch}
        aria-label="Search"
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
    <ThemeToggle onclick={handleThemeToggle} />
    <ProfileButton />
  </div>
</div>

<Shadow direction="bottom" />
