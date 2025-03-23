<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  let envVars = [];
  let mounted = false;
  
  // Get environment variables from the page data
  // These are provided by the layout.js file
  $: env = $page.data.env || {};
  
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
    
    mounted = true;
  });
</script>

<div class="p-4 bg-surface-3 rounded-lg text-xs font-mono shadow-lg">
  <h3 class="font-bold mb-2">Available Environment Variables:</h3>
  {#if mounted && Object.keys(env).length === 0}
    <p class="text-red-500">No environment variables found!</p>
  {:else}
    <ul>
      {#each Object.keys(env) as key}
        <li>
          <span class="font-bold">{key}:</span> 
          {key.includes('KEY') || key.includes('SECRET') 
            ? `${env[key]?.substring(0, 4) || ''}...` 
            : env[key] || 'undefined'}
        </li>
      {/each}
    </ul>
  {/if}
  
  <div class="mt-4">
    <p class="font-bold">Direct check:</p>
    <p>CLERK_PUBLISHABLE_KEY: {env.CLERK_PUBLISHABLE_KEY ? '✅ exists' : '❌ missing'}</p>
    <p>APP_NAME: {env.APP_NAME ? '✅ exists' : '❌ missing'}</p>
    <p>NODE_ENV: {typeof process !== 'undefined' && process.env ? process.env.NODE_ENV || 'undefined' : 'undefined'}</p>
  </div>
</div>
