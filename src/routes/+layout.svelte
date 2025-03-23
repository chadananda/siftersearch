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
  import { onMount } from 'svelte';
  import { ClerkProvider } from 'svelte-clerk';
  import GoogleOneTapWrapper from '$lib/components/auth/GoogleOneTapWrapper.svelte';
  import EnvDebug from '$lib/components/debug/EnvDebug.svelte';
  import Header from '$lib/components/ui/header/Header.svelte';
  import Footer from '$lib/components/ui/footer/Footer.svelte';
  import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';

  // Get data and children from props
  const { data, children } = $props();
  
  // Sidebar state management with Runes
  let sidebarCollapsed = $state(false);

  // Handle toggling sidebar collapse from child components
  function handleSidebarCollapsed(newState) {
    sidebarCollapsed = newState;
  }

  // Get Clerk key from environment variables via layout.js
  const publishableKey = data.env.CLERK_PUBLISHABLE_KEY;
  
  // Log the publishable key status in development
  if (browser && import.meta.env.DEV) {
    console.log('Clerk publishable key status:', publishableKey ? 'Available' : 'Missing');
  }
  
  // Check if we're on an auth page
  const isAuthPage = $derived($page.url.pathname.startsWith('/auth/'));
  
  // Determine if the page should have scrollable content
  const pageScrollable = $derived(!isAuthPage);
  
  // Check if we're on the homepage
  const isHomePage = $derived($page.url.pathname === '/');

  // Theme management
  let theme = $state('light');
  
  onMount(() => {
    // Load theme from localStorage if available
    if (browser) {
      const savedTheme = localStorage.getItem('theme') || 'light';
      theme = savedTheme;
      
      // Set the color-scheme property which is what light-dark() uses
      document.documentElement.style.colorScheme = theme;
    }
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
</script>

<ClerkProvider 
  publishableKey={publishableKey || 'pk_test_cHJvcGVyLXB5dGhvbi0zNi5jbGVyay5hY2NvdW50cy5kZXYk'}
  options={{
    // Enable Google One Tap
    googleOneTap: {
      enabled: true
    },
    // Appearance configuration
    appearance: {
      elements: {
        rootBox: 'rounded-lg shadow-lg',
        card: 'bg-surface-1 border border-surface-3',
        formButtonPrimary: 'bg-primary-500 hover:bg-primary-600 text-white',
        formFieldInput: 'bg-surface-2 border-surface-3',
        footerActionLink: 'text-primary-500 hover:text-primary-600',
        headerTitle: 'text-2xl font-bold text-text-1',
        headerSubtitle: 'text-text-2'
      }
    }
  }}
>
  <!-- Google One Tap component - invisible but enables One Tap functionality -->
  <div id="google-one-tap">
    <GoogleOneTapWrapper />
  </div>

  {#if !isAuthPage}
    <div class="fixed bottom-4 right-4 z-[1000] max-w-md opacity-70 hover:opacity-100">
      <EnvDebug />
    </div>
  {/if}

  {#if isAuthPage}
    <!-- Auth layout -->
    <div class="min-h-screen bg-surface">
      {@render children?.()}
    </div>
  {:else}
    <!-- Main application layout -->
    <div class="h-screen flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="h-16 bg-surface-2 z-[100] relative isolate shadow-app-sm">
        <Header 
          sidebarCollapsed={sidebarCollapsed} 
          toggleTheme={toggleTheme}
          onsidebarCollapsed={handleSidebarCollapsed} 
        />
      </header>

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
  {/if}
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
