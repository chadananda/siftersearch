<script>
  import { onMount } from 'svelte';
  import { initClerk, getAuthHeaders } from '$lib/clerk';
  import { goto } from '$app/navigation';

  let loading = true;
  let error = null;
  let user = null;

  onMount(async () => {
    try {
      const clerk = await initClerk();
      
      if (!clerk.user) {
        // Not logged in, redirect to login
        goto('/login');
        return;
      }

      user = clerk.user;
      loading = false;

      // Initialize database if needed
      const headers = getAuthHeaders();
      const response = await fetch('/api/init', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user.primaryEmailAddress.emailAddress
        })
      });

      if (!response.ok) {
        throw new Error('Failed to initialize system');
      }

    } catch (e) {
      error = e.message;
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-gray-100">
  <nav class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex">
          <div class="flex-shrink-0 flex items-center">
            <h1 class="text-xl font-bold">SifterSearch Admin</h1>
          </div>
        </div>
        {#if user}
          <div class="flex items-center">
            <span class="text-gray-700 mr-4">{user.primaryEmailAddress.emailAddress}</span>
            <button
              on:click={() => clerk.signOut()}
              class="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium text-gray-700"
            >
              Sign out
            </button>
          </div>
        {/if}
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
    {#if loading}
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    {:else if error}
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span class="block sm:inline">{error}</span>
      </div>
    {:else}
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-2xl font-bold mb-4">Welcome to SifterSearch Admin</h2>
        <p class="text-gray-600">Your system is initialized and ready to use.</p>
      </div>
    {/if}
  </main>
</div>