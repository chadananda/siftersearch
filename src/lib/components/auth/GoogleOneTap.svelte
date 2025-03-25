<!-- 
  GoogleOneTap.svelte
  Implements Google One Tap authentication using a generic approach
-->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  
  // State management
  let googleOneTapPromptVisible = $state(false);
  let interval;
  
  // Development mode detection
  const isDevelopment = browser && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );
  
  onMount(() => {
    if (browser && !isDevelopment) {
      try {
        // In production, we would initialize Google One Tap
        // This is a placeholder for the actual implementation
        // Set up interval to check for Google One Tap prompt visibility
        interval = setInterval(() => {
          const oneTapContainer = document.querySelector('div.S9gUrf-YoZ4jf');
          googleOneTapPromptVisible = !!oneTapContainer;
        }, 1000);
      } catch (e) {
        console.warn('Error setting up Google One Tap:', e.message);
      }
    } else {
      console.log('Google One Tap disabled in development mode');
    }
  });
  
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<!-- Only show this component when the Google One Tap prompt is visible -->
{#if googleOneTapPromptVisible}
  <div class="google-one-tap-backdrop">
    <!-- This is just a visual indicator that Google One Tap is active -->
  </div>
{/if}

<style>
  .google-one-tap-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    z-index: 999;
    pointer-events: none;
  }
  
  /* Position the One Tap popup properly */
  :global(#credential_picker_container) {
    top: 60px !important;
    right: 20px !important;
  }
  
  /* Hide the accessibility announcement for cleaner UI */
  :global(#g_a11y_announcement) {
    display: none;
  }
</style>

<!-- No visible UI for this component -->
<div class="google-one-tap-container" style="display: none;"></div>
