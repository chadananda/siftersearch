<script>
  import { onMount } from 'svelte';
  import { initClerk } from '$lib/clerk';
  import { goto } from '$app/navigation';

  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const clerk = await initClerk();
      
      if (clerk.user) {
        // User is already logged in, redirect to dashboard
        goto('/dashboard');
        return;
      }

      // Initialize Clerk's SignIn component
      const signIn = await clerk.mountSignIn({
        target: '#sign-in',
        signUpUrl: '/signup',
        afterSignInUrl: '/dashboard',
      });

      loading = false;
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-md w-full space-y-8">
    <div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
        Sign in to your account
      </h2>
    </div>

    {#if loading}
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    {:else if error}
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span class="block sm:inline">{error}</span>
      </div>
    {:else}
      <div id="sign-in"></div>
    {/if}
  </div>
</div>