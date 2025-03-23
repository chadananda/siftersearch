<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  /** @type {import('./$types').PageData} */
  export let data;
  
  // Success message
  let message = "Processing authentication...";
  let error = null;
  
  onMount(() => {
    // Check for credential in fragment or query string
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    
    const credential = urlParams.get('credential') || 
                      urlParams.get('g_csrf_token') || 
                      hashParams.get('credential') ||
                      hashParams.get('id_token');
    
    if (credential) {
      message = "Authentication credentials received.";
      
      // Store the credential temporarily
      if (browser) {
        try {
          // Decode the JWT (for testing only)
          const payload = JSON.parse(atob(credential.split('.')[1]));
          
          // Store user data
          localStorage.setItem('google_user_data', JSON.stringify({
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture
          }));
          
          message = "Authentication successful! Redirecting...";
          
          // Redirect to home page after a short delay
          setTimeout(() => {
            goto('/');
          }, 1500);
        } catch (err) {
          error = `Error processing credential: ${err.message}`;
          console.error('Error processing credential:', err);
        }
      }
    } else if (data.success === false) {
      error = data.message || "Authentication failed";
    } else {
      // Redirect to home page after a brief delay if no credential
      setTimeout(() => {
        goto('/');
      }, 3000);
    }
  });
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] p-4">
  <div class="bg-surface p-8 rounded-lg shadow-lg max-w-md w-full">
    <h1 class="text-2xl font-bold mb-6 text-center">Authentication</h1>
    
    {#if error}
      <div class="bg-error-100 text-error p-4 rounded mb-4">
        <p>{error}</p>
      </div>
    {:else}
      <div class="bg-primary-50 text-primary-900 p-4 rounded mb-4">
        <p>{message}</p>
      </div>
      <div class="flex justify-center mt-6">
        <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    {/if}
    
    <div class="mt-8 text-center">
      <a href="/" class="text-primary hover:underline">Return to home page</a>
    </div>
  </div>
</div>
