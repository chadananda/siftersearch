<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { authStore, userRole as userRoleStore, getAuthState } from '$lib/client/auth.js';
  
  // Reactive variables
  let envVars = [];
  let mounted = false;
  let env = {};
  let auth = {};
  let sessionClaims = {};
  let userRole = 'anonymous';
  let userId = null;
  let isSignedIn = false;
  
  // Previous state tracking for change detection
  let prevUserId = null;
  let prevRole = 'anonymous';
  
  // Subscribe to auth store for more reliable reactivity
  const unsubscribe = authStore.subscribe(state => {
    isSignedIn = state.isAuthenticated;
    userId = state.user?.id || null;
    
    // When not authenticated, role should be 'anonymous', not 'visitor'
    userRole = state.isAuthenticated ? (state.user?.role || 'visitor') : 'anonymous';
    
    // Only log when auth state actually changes
    if (userId !== prevUserId || userRole !== prevRole) {
      // Only log in development mode
      if (import.meta.env.DEV) {
        console.log('EnvDebug: Auth state changed:', { 
          userId,
          isSignedIn,
          role: userRole,
          email: state.user?.email || null,
          name: state.user?.name || null
        });
      }
      
      // Update previous values
      prevUserId = userId;
      prevRole = userRole;
    }
  });
  
  // Also subscribe to userRole store for better reactivity
  const roleUnsubscribe = userRoleStore.subscribe(role => {
    // Only update if authenticated (otherwise keep as anonymous)
    if (isSignedIn) {
      userRole = role;
    }
  });
  
  // Update state when page data changes (fallback)
  $: env = $page.data.env || {};
  $: auth = $page.data.auth || {};
  $: sessionClaims = auth.sessionClaims || {};
  
  // Role colors for visual identification
  const roleColors = {
    anonymous: 'text-gray-500',
    visitor: 'text-blue-500',
    subscriber: 'text-green-500',
    editor: 'text-yellow-500',
    librarian: 'text-purple-500',
    admin: 'text-red-500',
    superuser: 'text-black font-bold'
  };
  
  onMount(() => {
    // Get all environment variable keys
    const envKeys = Object.keys(env);
    
    // Map them to a format for display
    envVars = envKeys.map(key => ({
      name: key,
      value: env[key] ? 
        (key.includes('KEY') || key.includes('SECRET') 
          ? `${env[key].substring(0, 4)}...` // Show only first 4 chars for keys/secrets
          : env[key])
        : 'undefined'
    }));
    
    // Get initial auth state
    const initialState = getAuthState();
    isSignedIn = initialState.isAuthenticated;
    userId = initialState.user?.id || null;
    userRole = initialState.isAuthenticated ? (initialState.user?.role || 'visitor') : 'anonymous';
    
    mounted = true;
    
    return () => {
      if (unsubscribe) unsubscribe();
      if (roleUnsubscribe) roleUnsubscribe();
    };
  });
</script>

<div class="p-4 bg-surface-3 rounded-lg text-xs font-mono shadow-lg">
  <!-- User Role Information -->
  <div class="mb-4 pb-3 border-b border-gray-200">
    <h3 class="font-bold mb-2">User Information:</h3>
    <div class="flex items-center gap-2">
      <span class="font-bold">Status:</span>
      <span class={isSignedIn ? "text-green-500" : "text-red-500"}>
        {isSignedIn ? "Signed In" : "Not Signed In"}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <span class="font-bold">Role:</span>
      <span class={roleColors[userRole] || 'text-gray-500'}>
        {userRole}
      </span>
    </div>
    {#if isSignedIn}
      <div class="mt-1">
        <span class="font-bold">ID:</span> {userId}
      </div>
      {#if auth?.sessionClaims?.email}
        <div class="mt-1">
          <span class="font-bold">Email:</span> {auth.sessionClaims.email}
        </div>
      {/if}
      {#if auth?.sessionClaims?.name}
        <div class="mt-1">
          <span class="font-bold">Name:</span> {auth.sessionClaims.name}
        </div>
      {/if}
      <div class="mt-2">
        <details>
          <summary class="cursor-pointer text-blue-500">Auth Object</summary>
          <pre class="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
            {JSON.stringify(auth, null, 2)}
          </pre>
        </details>
      </div>
    {:else}
      <div class="mt-2">
        <details>
          <summary class="cursor-pointer text-blue-500">Auth Object</summary>
          <pre class="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
            {JSON.stringify(auth, null, 2)}
          </pre>
        </details>
      </div>
    {/if}
  </div>

  <!-- Environment Variables -->
  <div>
    <h3 class="font-bold mb-2">Environment Variables:</h3>
    {#if mounted && envVars.length > 0}
      <div class="grid grid-cols-2 gap-2">
        {#each envVars as envVar}
          <div class="text-gray-700">{envVar.name}:</div>
          <div class="text-gray-900">{envVar.value}</div>
        {/each}
      </div>
    {:else}
      <div class="italic text-gray-500">Loading environment variables...</div>
    {/if}
  </div>
</div>
