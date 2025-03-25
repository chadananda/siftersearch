<!-- 
  GoogleOneTapWrapper.svelte
  Wrapper component for Google One Tap authentication
  This component conditionally renders GoogleOneTap when the user is signed out
-->
<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import GoogleOneTap from './GoogleOneTap.svelte';
  
  // Development mode detection
  const isDevelopment = browser && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );
  
  // State for tracking if user is signed in
  let isSignedIn = false;
  let SignedOut;
  
  onMount(() => {
    if (browser && !isDevelopment) {
      try {
        // In production, we dynamically import Clerk
        import('clerk-sveltekit/client').then((clerkModule) => {
          SignedOut = clerkModule.SignedOut;
          
          // Set up a subscription to the clerk auth state if available
          if (clerkModule.clerk) {
            clerkModule.clerk.subscribe((state) => {
              isSignedIn = !!state?.user;
            });
          }
        }).catch(e => {
          console.warn('Clerk not available for GoogleOneTapWrapper:', e.message);
          isSignedIn = false;
        });
      } catch (e) {
        console.warn('Error setting up GoogleOneTapWrapper:', e.message);
      }
    } else {
      console.log('GoogleOneTapWrapper running in development mode');
    }
  });
</script>

{#if browser}
  {#if !isDevelopment && SignedOut}
    <!-- Use Clerk's SignedOut component when available in production -->
    <svelte:component this={SignedOut}>
      <GoogleOneTap />
    </svelte:component>
  {:else if isDevelopment}
    <!-- In development mode, always show the component -->
    <GoogleOneTap />
  {/if}
{/if}
