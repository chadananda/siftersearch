<script>
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  
  // Development mode detection
  const isDevelopment = browser && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );
  
  // Auth components state
  let isAuthLoaded = false;
  
  // Use the user from the page store if available
  const user = $derived($page.data.user);
  const isAuthenticated = $derived(!!user);
  
  onMount(() => {
    if (browser) {
      // Mark auth as loaded - in a real implementation, this would
      // happen after loading any necessary auth libraries
      isAuthLoaded = true;
      console.log('Using auth components in', isDevelopment ? 'development' : 'production', 'mode');
    }
  });
</script>

{#if isAuthenticated}
  <!-- User is logged in -->
  <div 
    class="hover:scale-105 hover:bg-surface-3 p-1.5 rounded-lg text-primary transition-all duration-300 cursor-pointer flex items-center justify-center"
    aria-label="User profile"
    role="button"
    tabindex="0"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
      <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  </div>
{:else}
  <!-- User is not logged in -->
  <a 
    href="/auth/signin"
    class="hover:scale-105 hover:bg-surface-3 p-1.5 rounded-lg text-primary transition-all duration-300 cursor-pointer flex items-center justify-center"
    aria-label="Sign in"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  </a>
{/if}
