<script>
  import { onMount } from 'svelte';

  let theme = $state(null); // 'light', 'dark', or 'system' - null until mounted

  function getSystemTheme() {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Effective theme for display (what the user actually sees)
  let effectiveTheme = $derived(
    theme === 'system' || theme === null ? getSystemTheme() : theme
  );

  function applyTheme(newTheme) {
    if (typeof document === 'undefined') return;

    if (newTheme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  }

  function cycleTheme() {
    const themes = ['system', 'light', 'dark'];
    const currentIndex = themes.indexOf(theme);
    theme = themes[(currentIndex + 1) % themes.length];
    localStorage.setItem('theme', theme);
    applyTheme(theme);
  }

  function getIcon(currentTheme) {
    if (currentTheme === 'light') return 'sun';
    if (currentTheme === 'dark') return 'moon';
    return 'system';
  }

  function getLabel(currentTheme) {
    if (currentTheme === 'light') return 'Light mode';
    if (currentTheme === 'dark') return 'Dark mode';
    return 'System theme';
  }

  onMount(() => {
    // Load saved preference
    const saved = localStorage.getItem('theme');
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      theme = saved;
    }
    applyTheme(theme);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        // Force re-render when system preference changes
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  });
</script>

<button
  onclick={cycleTheme}
  class="theme-toggle"
  aria-label={getLabel(theme)}
  title={getLabel(theme)}
>
  <!-- Show icon based on EFFECTIVE theme (what user actually sees), not stored preference -->
  {#if effectiveTheme === 'light'}
    <!-- Sun icon - currently in light mode -->
    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {:else}
    <!-- Moon icon - currently in dark mode -->
    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0.375rem;
    border-radius: 0.5rem;
    background-color: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .theme-toggle:hover {
    background-color: var(--hover-overlay);
    color: var(--text-primary);
  }

  .icon {
    width: 1.25rem;
    height: 1.25rem;
  }
</style>
