<script>
  import { onMount } from 'svelte';
  let theme = $state('light');

  onMount(() => {
    // Initialize theme from localStorage
    theme = localStorage.getItem('theme') || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    console.log('Theme initialized:', theme);
  });

  function toggleTheme() {
    console.log('Toggle clicked, current theme:', theme);
    theme = theme === 'light' ? 'dark' : 'light';
    console.log('New theme:', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
</script>

<button
  class="p-2 rounded-lg hover:bg-surface-3 text-text-secondary transition-colors"
  on:click={toggleTheme}
  aria-label="Toggle theme"
>
  {#if theme === 'light'}
    <!-- Sun icon -->
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {:else}
    <!-- Moon icon -->
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {/if}
</button>

<style>
  button {
    color: var(--text-primary);
    background-color: var(--bg-tertiary);
  }
  
  button:hover {
    background-color: var(--border-color);
  }
</style>
