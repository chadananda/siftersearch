<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  
  // Debug state
  let debugMessage = $state('');
  let buttonContainer;
  
  onMount(() => {
    if (!browser) return;
    
    // Load Google Identity API script
    const googleScript = document.createElement('script');
    googleScript.src = 'https://accounts.google.com/gsi/client';
    googleScript.async = true;
    googleScript.defer = true;
    
    googleScript.onload = () => {
      debugMessage = 'Google Identity API script loaded';
      
      // Initialize Google Identity Services
      if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
          client_id: '532355632479-rr72mn4jm1dj7nk2qpbk4lrn55sg99qm.apps.googleusercontent.com',
          callback: handleCredentialResponse,
          auto_select: false, // Don't auto-select accounts
          cancel_on_tap_outside: true
        });
        
        // Render the button in our container
        if (buttonContainer) {
          google.accounts.id.renderButton(buttonContainer, {
            type: 'standard', // standard, icon
            theme: 'outline', // outline, filled_blue, filled_black
            size: 'large', // medium, large
            text: 'signin_with', // signin_with, signup_with
            shape: 'rectangular', // rectangular, pill, circle, square
            logo_alignment: 'left', // left, center
            width: 240 // Custom width in pixels
          });
          debugMessage = 'Google Sign-In button rendered';
        } else {
          debugMessage = 'Button container not found';
        }
      } else {
        debugMessage = 'Google accounts API not available';
        console.error('Google accounts API not available');
      }
    };
    
    googleScript.onerror = (error) => {
      debugMessage = `Failed to load Google Identity API script: ${error}`;
      console.error('Failed to load Google Identity API script:', error);
    };
    
    document.head.appendChild(googleScript);
  });
  
  // Handle the credential response
  function handleCredentialResponse(response) {
    debugMessage = 'Received credential response';
    console.log('Google Sign-In credential response:', response);
    
    // Here you would send the credential to your server or Clerk
    // For now, we'll just log it
    if (response && response.credential) {
      // Example: Send to Clerk or your own endpoint
      // fetch('/api/auth/google-signin', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ credential: response.credential })
      // });
    }
  }
</script>

<div class="flex flex-col items-center mt-4">
  <!-- Google Sign-In button container -->
  <div bind:this={buttonContainer} class="g-signin-button"></div>
  
  {#if debugMessage && import.meta.env.DEV}
    <div class="text-xs text-gray-500 mt-2 opacity-70">
      {debugMessage}
    </div>
  {/if}
</div>

<style>
  .g-signin-button {
    min-height: 40px;
    min-width: 240px;
  }
</style>
