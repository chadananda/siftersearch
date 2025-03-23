<!-- 
  GoogleOneTap.svelte
  Implements Google One Tap authentication using svelte-clerk
-->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { useClerkContext } from 'svelte-clerk';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  
  // Get Clerk context
  const clerkContext = useClerkContext();
  
  // State management
  let loaded = $state(false);
  let googleOneTapPromptVisible = $state(false);
  let interval;
  
  // Google One Tap client ID from environment variable
  const googleClientId = import.meta.env.PUBLIC_CLERK_GOOGLE_CLIENT_ID || 
    "1018465806765-2tg0f9bjgj2jh1j8c3qimn3sldlm5i5o.apps.googleusercontent.com";
  
  onMount(() => {
    if (browser) {
      loadGoogleOneTap();
      
      // Set up interval to check for Google One Tap prompt visibility
      interval = setInterval(() => {
        const oneTapContainer = document.querySelector('div.S9gUrf-YoZ4jf');
        googleOneTapPromptVisible = !!oneTapContainer;
      }, 1000);
    }
  });
  
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
  
  // Load Google One Tap script
  async function loadGoogleOneTap() {
    if (loaded || !browser) return;
    
    try {
      // Load Google Identity Services SDK
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleOneTap;
      document.head.appendChild(script);
      loaded = true;
    } catch (error) {
      console.error('Error loading Google One Tap:', error);
    }
  }
  
  // Initialize Google One Tap
  function initializeGoogleOneTap() {
    if (!browser || !window.google || !googleClientId) return;
    
    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: false
      });
      
      // Only prompt if Clerk is loaded
      if (clerkContext) {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log('Google One Tap not displayed or skipped:', notification.getNotDisplayedReason() || notification.getSkippedReason());
          }
        });
      }
    } catch (error) {
      console.error('Error initializing Google One Tap:', error);
    }
  }
  
  // Handle credential response from Google One Tap
  async function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      console.error('Invalid credential response');
      return;
    }
    
    try {
      // Sign in with Clerk using Google token
      if (clerkContext && clerkContext.clerk) {
        await clerkContext.clerk.signIn.authenticateWithGoogleOneTap({
          token: response.credential,
          redirectUrl: window.location.origin + '/auth/callback',
          redirectUrlComplete: window.location.origin
        });
      } else {
        console.error('Clerk context not available');
      }
    } catch (error) {
      console.error('Error signing in with Google One Tap:', error);
    }
  }
</script>

<style>
  /* Position the One Tap popup properly */
  :global(#credential_picker_container) {
    top: 100px !important;
    right: 20px !important;
  }
  
  :global(#credential_picker_iframe) {
    margin-top: 0 !important;
  }
  
  :global(#g_a11y_announcement) {
    display: none;
  }
</style>

<!-- No visible UI for this component -->
<div class="google-one-tap-container" style="display: none;"></div>
