<!--
  auth/signin/+page.svelte
  IMPORTANT: This component uses Svelte 5 with Runes syntax
  - Uses $props() for props
  - Uses $state() for reactive state
-->
<script>
  import { page } from '$app/stores';
  import { SignIn } from 'svelte-clerk';
  
  // Get redirect URL from query params if available
  const redirectUrl = $page.url.searchParams.get('redirect_url') || '/';
</script>

<div class="min-h-screen flex items-center justify-center bg-surface-1 px-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold mb-2">Sign in to SifterSearch</h1>
      <p class="text-text-2">Access your library and documents</p>
    </div>
    
    <div class="bg-surface-2 rounded-lg shadow-lg p-6">
      <SignIn redirectUrl={redirectUrl} routing="path" path="/auth" />
    </div>
  </div>
</div>
