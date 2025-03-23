<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import GoogleSignIn from './GoogleSignIn.svelte';
  
  // Props
  const { isOpen = false, title = "Sign in to SifterSearch" } = $props();
  
  // State
  let isModalOpen = isOpen;
  
  // Update state when props change
  $: {
    isModalOpen = isOpen;
  }
  
  // Close the modal when clicking outside
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      isModalOpen = false;
    }
  }
  
  // Close on escape key
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      isModalOpen = false;
    }
  }
  
  onMount(() => {
    // Add keydown listener
    window.addEventListener('keydown', handleKeydown);
    
    return () => {
      // Remove keydown listener
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

{#if isModalOpen}
  <!-- Modal backdrop -->
  <div 
    class="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4"
    onclick={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal content -->
    <div 
      class="bg-surface-100 dark:bg-surface-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      transition:fade={{ duration: 150, delay: 50 }}
    >
      <!-- Header -->
      <div class="p-5 border-b border-surface-200 dark:border-surface-700">
        <h3 class="text-xl font-semibold text-on-surface">{title}</h3>
      </div>
      
      <!-- Body -->
      <div class="p-6 flex flex-col gap-6">
        <GoogleSignIn />
        
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-surface-200 dark:border-surface-700"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-surface-100 dark:bg-surface-800 text-on-surface-variant">
              or continue with
            </span>
          </div>
        </div>
        
        <!-- Clerk will provide additional sign-in options here -->
        <div class="flex flex-col gap-3">
          <button class="w-full py-2 px-4 border border-surface-300 dark:border-surface-600 rounded-md text-on-surface flex items-center justify-center gap-2 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">
            <span>Email</span>
          </button>
          
          <button class="w-full py-2 px-4 border border-surface-300 dark:border-surface-600 rounded-md text-on-surface flex items-center justify-center gap-2 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">
            <span>Phone</span>
          </button>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="p-4 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700 text-center text-xs text-on-surface-variant">
        By signing in, you agree to our Terms of Service and Privacy Policy
      </div>
    </div>
  </div>
{/if}
