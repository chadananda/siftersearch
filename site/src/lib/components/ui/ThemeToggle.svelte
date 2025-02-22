<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  // Only override if user has explicitly set a preference
  const userTheme = browser ? localStorage.getItem('theme') : null;
  let theme = $state(userTheme || 'light'); // Default to light until we can check system preference

  function getSystemTheme() {
    if (!browser) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  onMount(() => {
    // Set initial theme based on system preference if no user preference
    if (!userTheme) {
      theme = getSystemTheme();
    }
  });

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    if (browser) {
      localStorage.setItem('theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // Apply saved preference if it exists
  $effect(() => {
    if (browser && theme && theme !== getSystemTheme()) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
</script>

<button
  class="p-2 rounded-lg hover:bg-surface-3 text-text-secondary transition-colors"
  onclick={toggleTheme}
  aria-label="Toggle theme"
>
  {#if theme === 'light'}
    <!-- Sun icon -->
    <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
    </svg>
  {:else}
    <!-- Moon icon -->
    <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
    </svg>
  {/if}
</button>

<style>
  button:hover {
    opacity: 0.8;
  }
</style>
