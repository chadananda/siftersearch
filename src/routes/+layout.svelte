<!--
  +layout.svelte
  IMPORTANT: This component uses Svelte 5 with Runes syntax
  - Uses $props() for props
  - Uses $state() for reactive state
  - Uses $derived for computed values
  - Uses {@render children?.()} instead of <slot>
  - Uses onsidebarCollapsed instead of on:sidebarCollapsed for event handling
-->
<script>
  import '../app.css';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  // Import Clerk components
  import SignedIn from 'clerk-sveltekit/client/SignedIn.svelte';
  import SignedOut from 'clerk-sveltekit/client/SignedOut.svelte';
  import UserButton from 'clerk-sveltekit/client/UserButton.svelte';
  import ClerkProvider from '$lib/components/auth/ClerkProvider.svelte';
  import GoogleOneTapWrapper from '$lib/components/auth/GoogleOneTapWrapper.svelte';
  import Header from '$lib/components/ui/header/Header.svelte';
  import Footer from '$lib/components/ui/footer/Footer.svelte';
  import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
  
  // Import auth store initialization
  import { initializeAuthStore, authStore, userRole } from '$lib/client/auth.js';

  // Debug mode flag - set to false to disable most logging
  const debugMode = false;

  // Get data and children from props
  const { data, children } = $props();
  
  // Sidebar state management with Runes
  let sidebarCollapsed = $state(false);

  // Handle toggling sidebar collapse from child components
  function handleSidebarCollapsed(newState) {
    sidebarCollapsed = newState;
  }

  // Get Clerk key from environment variables via layout.js
  const publishableKey = data.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  // Initialize auth state from server data immediately
  if (browser && data.user) {
    const isServerAuthenticated = data.user && data.user.id && data.user.role !== 'anonymous';
    
    if (debugMode && import.meta.env.DEV) {
      console.log('Initial server auth data:', 
        isServerAuthenticated ? `Authenticated as ${data.user.email} (${data.user.role})` : 'Not authenticated');
    }
    
    // Set the initial auth state from server data
    authStore.set({
      isAuthenticated: isServerAuthenticated,
      user: isServerAuthenticated ? data.user : null,
      isLoading: false,
      hasChecked: true
    });
  }
  
  // Log the publishable key status in development
  if (browser && import.meta.env.DEV && debugMode) {
    console.log('Clerk publishable key status:', publishableKey ? 'Available' : 'Missing');
    console.log('User data from server:', data.user ? 
      `${data.user.email} (${data.user.role})` : 'No user data');
  }
  
  // Check if we're on an auth page
  const isAuthPage = $derived($page.url.pathname.startsWith('/auth/'));
  
  // Determine if the page should have scrollable content
  const pageScrollable = $derived(!isAuthPage);
  
  // Check if we're on the homepage
  const isHomePage = $derived($page.url.pathname === '/');

  // Theme management
  let theme = $state('light');
  
  // Auth state cleanup function
  let cleanupAuth;
  
  onMount(() => {
    // Initialize auth store to track user state
    cleanupAuth = initializeAuthStore();
    
    // Watch for page data changes and update auth store
    const unsubscribeFromPage = page.subscribe(($page) => {
      if ($page.data?.user) {
        const serverUser = $page.data.user;
        const isServerAuthenticated = serverUser && serverUser.id && serverUser.role !== 'anonymous';
        
        // Get current auth state
        let currentState;
        authStore.update(state => {
          currentState = state;
          return state;
        });
        
        // Only update if there's a mismatch or we're authenticated but have different user data
        if (isServerAuthenticated !== currentState.isAuthenticated ||
            (isServerAuthenticated && JSON.stringify(serverUser) !== JSON.stringify(currentState.user))) {
          
          if (debugMode && import.meta.env.DEV) {
            console.log('Updating auth store from page data change:', 
              isServerAuthenticated ? `Authenticated as ${serverUser.email} (${serverUser.role})` : 'Not authenticated');
          }
          
          authStore.set({
            isAuthenticated: isServerAuthenticated,
            user: isServerAuthenticated ? serverUser : null,
            isLoading: false,
            hasChecked: true
          });
        }
      }
    });
    
    // Log current auth state for debugging
    if (import.meta.env.DEV && debugMode) {
      const unsubscribeFromAuth = authStore.subscribe(auth => {
        console.log('Auth state updated:', JSON.stringify({
          isAuthenticated: auth.isAuthenticated,
          user: auth.user ? { 
            id: auth.user.id,
            email: auth.user.email,
            role: auth.user.role,
            active: auth.user.active
          } : null,
          isLoading: auth.isLoading,
          hasChecked: auth.hasChecked
        }, null, 2));
      });
      
      return () => {
        unsubscribeFromAuth();
      };
    }
    
    // Load theme from localStorage if available
    if (browser) {
      const savedTheme = localStorage.getItem('theme') || 'light';
      theme = savedTheme;
      
      // Set the color-scheme property which is what light-dark() uses
      document.documentElement.style.colorScheme = theme;
    }
    
    return () => {
      if (unsubscribeFromPage) unsubscribeFromPage();
    };
  });
  
  onDestroy(() => {
    // Clean up auth store subscriptions
    if (cleanupAuth) cleanupAuth();
  });
  
  // Toggle theme function
  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    if (browser) {
      // Set the color-scheme property which is what light-dark() uses
      document.documentElement.style.colorScheme = theme;
      
      // Store the theme preference
      localStorage.setItem('theme', theme);
    }
  }
  
  // Development mode flag
  const isDevelopment = import.meta.env.DEV;
  
  // Track auth state for debugging - disabled by default
  const debugAuthState = $derived(() => {
    if (browser && isDevelopment && debugMode) {
      console.log(`Layout auth state: ${authStore.isAuthenticated ? 'Authenticated' : 'Not authenticated'}, Role: ${userRole}`);
    }
    return null;
  });
</script>

<!-- Main application layout -->
<ClerkProvider {publishableKey}>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="h-16 bg-surface-2 z-[100] relative isolate shadow-app-sm">
      <Header 
        sidebarCollapsed={sidebarCollapsed} 
        toggleTheme={toggleTheme}
        onsidebarCollapsed={handleSidebarCollapsed} 
      />
    </header>

    <!-- Google One Tap component - invisible but enables One Tap functionality -->
    <div id="google-one-tap" class="hidden">
      <GoogleOneTapWrapper />
    </div>

    <!-- Middle section with sidebar and main content -->
    <div class="flex-1 flex min-h-0">
      <!-- Sidebar -->
      <nav class="bg-surface-2 transition-all duration-300 z-40 relative isolate overflow-y-auto shadow-app-sm" style:width={sidebarCollapsed ? 'min(48px, 15vw)' : '256px'}>
        <Sidebar collapsed={sidebarCollapsed} />
      </nav>

      <!-- Main content -->
      <main class="flex-1" class:overflow-auto={pageScrollable}>
        {@render children?.()}
      </main>
    </div>

    <!-- Footer -->
    {#if !isHomePage}
      <footer class="h-12 bg-surface-2 z-10 relative border-t border-subtle-light">
        <Footer />
      </footer>
    {/if}
  </div>
</ClerkProvider>

<style>
  :global(html) {
    --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-family: var(--font-sans);
    height: 100%;
  }

  :global(body) {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  :global(#app) {
    height: 100%;
  }

  /* Google One Tap container styling */
  #google-one-tap {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 1000;
  }
</style>
