<!--
  ThemeToggle.svelte
  IMPORTANT: This component uses Svelte 5 with Runes syntax
  - Uses $state() for reactive state
  - Uses callback props instead of event dispatching
  - Uses onclick instead of on:click for event handling
-->
<script>
  import { onMount } from 'svelte';
  
  // Get props using Svelte 5 Runes syntax
  const { onclick } = $props();
  
  // State
  let dark = $state(false);
  let buttonEl;

  // Initialize theme on mount
  onMount(() => {
    if (typeof window === 'undefined') return;
    
    // Check if theme is stored in localStorage
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      dark = storedTheme === 'dark';
      // Set the color-scheme property which is what light-dark() uses
      document.documentElement.style.colorScheme = storedTheme;
    } else if (window?.matchMedia) {
      // If no stored theme, check system preference
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      dark = darkModeQuery.matches;
      // Set the color-scheme property which is what light-dark() uses
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      
      // Listen for system theme changes
      const listener = (e) => {
        if (!localStorage.getItem('theme')) { // Only update if user hasn't set a preference
          dark = e.matches;
          // Set the color-scheme property which is what light-dark() uses
          document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        }
      };
      
      darkModeQuery.addEventListener('change', listener);
    }
  });

  function toggleTheme() {
    dark = !dark;
    const newTheme = dark ? 'dark' : 'light';
    
    // Set the color-scheme property which is what light-dark() uses
    document.documentElement.style.colorScheme = newTheme;
    
    // Store the theme preference
    localStorage.setItem('theme', newTheme);
    
    // Call the onclick callback prop if it exists
    if (onclick) onclick();
  }
</script>

<button 
  type="button"
  class="theme-toggle-btn p-2 rounded-lg text-primary transition-all duration-300 cursor-pointer relative z-50"
  aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
  onclick={toggleTheme}
  bind:this={buttonEl}
>
  {#if !dark}
    <!-- Moon icon - shown in light mode to switch to dark -->
    <svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {:else}
    <!-- Sun icon - shown in dark mode to switch to light -->
    <svg class="w-7 h-7 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {/if}
</button>

<style>
  /* No custom styles needed - using Tailwind utility classes */
</style>
